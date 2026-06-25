import { inject, Injectable } from '@angular/core';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { FleetStore } from '../../core/state/fleet.store';
import { LogbookStore } from '../../core/state/logbook.store';
import { OrderQueueStore } from '../../core/state/order-queue.store';
import { ShipCargo, ShipData } from '../../models/ship.model';
import { TravelExecutorService } from '../systems/travel-executor.service';
import { Order, describeOrder } from './order.types';

const FUEL_GOODS = new Set(['FUEL']);

/**
 * Drives a ship's automation queue: navigate -> extract -> sell loops, etc.
 * The loop is cooperative — it checks the queue's status between every step so
 * the UI can pause/stop it, and persists its progress index after each order.
 */
@Injectable({ providedIn: 'root' })
export class OrderRunnerService {
  private readonly api = inject(SpaceTradersApiService);
  private readonly fleet = inject(FleetStore);
  private readonly logbook = inject(LogbookStore);
  private readonly store = inject(OrderQueueStore);
  private readonly travel = inject(TravelExecutorService);

  private readonly running = new Set<string>();

  isRunning(shipSymbol: string): boolean {
    return this.running.has(shipSymbol);
  }

  /** Engage the auto-pilot for a ship. No-op if already running. */
  async start(shipSymbol: string): Promise<void> {
    if (this.running.has(shipSymbol)) return;
    const initial = this.store.state(shipSymbol);
    if (!initial.orders.length) return;

    this.running.add(shipSymbol);
    this.store.setStatus(shipSymbol, 'running', 'Auto-pilot engaged');
    this.logbook.append({ category: 'navigate', ship: shipSymbol, message: 'Auto-pilot engaged' });

    try {
      while (true) {
        const state = this.store.state(shipSymbol);
        if (state.status !== 'running') break;

        if (state.index >= state.orders.length) {
          this.store.setStatus(shipSymbol, 'idle', 'Queue complete');
          break;
        }

        const order = state.orders[state.index]!;
        if (order.kind === 'repeat') {
          this.store.setIndex(shipSymbol, 0);
          continue;
        }

        await this.execute(shipSymbol, order);

        if (this.store.state(shipSymbol).status !== 'running') break;
        this.store.setIndex(shipSymbol, this.store.state(shipSymbol).index + 1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auto-pilot error';
      this.store.setStatus(shipSymbol, 'error', message);
      this.logbook.append({ category: 'navigate', ship: shipSymbol, message: `Auto-pilot halted: ${message}` });
    } finally {
      this.running.delete(shipSymbol);
    }
  }

  /** Request the loop to stop after the current step. */
  pause(shipSymbol: string): void {
    this.store.setStatus(shipSymbol, 'paused', 'Paused');
  }

  /** Reset the queue pointer and clear status back to idle. */
  reset(shipSymbol: string): void {
    this.store.setIndex(shipSymbol, 0);
    this.store.setStatus(shipSymbol, 'idle', undefined);
  }

  private async execute(shipSymbol: string, order: Order): Promise<void> {
    switch (order.kind) {
      case 'setFlightMode':
        await this.api.patchShipNav(shipSymbol, order.mode);
        await this.syncFleet();
        break;

      case 'orbit':
        await this.ensureOrbit(shipSymbol);
        break;

      case 'dock':
        await this.ensureDocked(shipSymbol);
        break;

      case 'navigate':
        await this.doNavigate(shipSymbol, order.waypointSymbol);
        break;

      case 'extractUntilFull':
        await this.doExtractUntilFull(shipSymbol);
        break;

      case 'buyMax':
        await this.doBuyMax(shipSymbol, order.tradeSymbol);
        break;

      case 'sellAll':
        await this.doSellAll(shipSymbol, order.keep ?? []);
        break;

      case 'refuel':
        await this.doRefuel(shipSymbol);
        break;

      case 'repeat':
        // Handled by the loop; nothing to do here.
        break;

      default: {
        const _exhaustive: never = order;
        void _exhaustive;
      }
    }
  }

  private async doNavigate(shipSymbol: string, waypointSymbol: string): Promise<void> {
    const ship = await this.api.getShip(shipSymbol);
    if (ship.nav.waypointSymbol === waypointSymbol && ship.nav.status !== 'IN_TRANSIT') {
      return;
    }
    if (ship.nav.status === 'DOCKED') {
      await this.api.orbitShip(shipSymbol);
    }
    await this.api.navigateShip(shipSymbol, waypointSymbol);
    await this.syncFleet();
    await this.travel.waitForShipAtWaypoint(shipSymbol, waypointSymbol, {
      reloadShips: () => this.syncFleet(),
      getShips: () => this.fleet.ships(),
      isCancelled: () => this.store.state(shipSymbol).status !== 'running',
    });
    this.logbook.append({ category: 'navigate', ship: shipSymbol, waypoint: waypointSymbol, message: `Arrived at ${waypointSymbol}` });
  }

  private async doExtractUntilFull(shipSymbol: string): Promise<void> {
    await this.ensureOrbit(shipSymbol);
    while (this.store.state(shipSymbol).status === 'running') {
      const cargo = await this.api.getShipCargo(shipSymbol);
      if (cargo.units >= cargo.capacity) return;

      try {
        const res = await this.api.extractResources(shipSymbol);
        const y = res.data.extraction.yield;
        this.logbook.recordExtraction('extract', shipSymbol, y.symbol, y.units);
      } catch (error) {
        // Surface meaningful extraction failures (e.g. not at an asteroid).
        throw error instanceof Error ? error : new Error('Extraction failed');
      }

      await this.syncFleet();
      await this.waitForCooldown(shipSymbol);
    }
  }

  private async doBuyMax(shipSymbol: string, tradeSymbol: string): Promise<void> {
    await this.ensureDocked(shipSymbol);
    const cargo = await this.api.getShipCargo(shipSymbol);
    const free = cargo.capacity - cargo.units;
    if (free <= 0) return;
    const res = await this.api.purchaseCargo(shipSymbol, tradeSymbol, free);
    const tx = res.data.transaction;
    this.logbook.recordTrade('buy', shipSymbol, tx.units, tx.tradeSymbol, tx.totalPrice, tx.waypointSymbol);
    await this.syncFleet();
  }

  private async doSellAll(shipSymbol: string, keep: string[]): Promise<void> {
    await this.ensureDocked(shipSymbol);
    const cargo: ShipCargo = await this.api.getShipCargo(shipSymbol);
    const keepSet = new Set(keep);
    for (const item of cargo.inventory) {
      if (item.units <= 0) continue;
      if (keepSet.has(item.symbol) || FUEL_GOODS.has(item.symbol)) continue;
      try {
        const res = await this.api.sellCargo(shipSymbol, item.symbol, item.units);
        const tx = res.data.transaction;
        this.logbook.recordTrade('sell', shipSymbol, tx.units, tx.tradeSymbol, tx.totalPrice, tx.waypointSymbol);
      } catch {
        // Market may not buy this good here — skip it and keep going.
      }
    }
    await this.syncFleet();
  }

  private async doRefuel(shipSymbol: string): Promise<void> {
    await this.ensureDocked(shipSymbol);
    const ship = await this.api.getShip(shipSymbol);
    const needed = ship.fuel.capacity - ship.fuel.current;
    if (needed <= 0) return;
    try {
      const res = await this.api.refuelShip(shipSymbol, needed);
      const tx = res.data.transaction;
      this.logbook.recordRefuel(shipSymbol, tx?.units ?? needed, tx?.totalPrice ?? null, tx?.waypointSymbol);
    } catch {
      // No fuel market here; continue without refuelling.
    }
    await this.syncFleet();
  }

  private async ensureOrbit(shipSymbol: string): Promise<void> {
    const ship = await this.api.getShip(shipSymbol);
    if (ship.nav.status === 'DOCKED') {
      await this.api.orbitShip(shipSymbol);
      await this.syncFleet();
    }
  }

  private async ensureDocked(shipSymbol: string): Promise<void> {
    const ship = await this.api.getShip(shipSymbol);
    if (ship.nav.status !== 'DOCKED') {
      await this.api.dockShip(shipSymbol);
      await this.syncFleet();
    }
  }

  private async waitForCooldown(shipSymbol: string): Promise<void> {
    const cooldown = await this.api.getShipCooldown(shipSymbol);
    const seconds = cooldown?.remainingSeconds ?? 0;
    if (seconds > 0) await this.sleep(shipSymbol, seconds * 1000 + 500);
  }

  private async syncFleet(): Promise<void> {
    await this.fleet.refreshShips();
  }

  /** Interruptible sleep that bails early if the queue is no longer running. */
  private async sleep(shipSymbol: string, ms: number): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (this.store.state(shipSymbol).status !== 'running') return;
      const slice = Math.min(1000, end - Date.now());
      await new Promise((resolve) => setTimeout(resolve, slice));
    }
  }
}

export { describeOrder };
