import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FleetStore } from '../../core/state/fleet.store';
import { OrderQueueStore } from '../../core/state/order-queue.store';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { OnlineStatusService } from '../../shared/services/online-status.service';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { PlanetView, hasTrait, mapWaypoint } from '../../models/system.model';
import { isAsteroidWaypoint } from '../systems/planet-helpers';
import { OrderRunnerService } from './order-runner.service';
import { describeOrder, miningLoopPreset, tradeRunPreset } from './order.types';

type PresetKind = 'mining' | 'trade';

@Component({
  selector: 'app-autopilot-panel',
  imports: [FormsModule],
  templateUrl: './autopilot-panel.component.html',
})
export class AutopilotPanelComponent implements OnInit {
  private readonly fleet = inject(FleetStore);
  private readonly api = inject(SpaceTradersApiService);
  private readonly background = inject(PageBackgroundService);
  private readonly snackbar = inject(SnackbarService);
  private readonly onlineStatus = inject(OnlineStatusService);
  readonly store = inject(OrderQueueStore);
  readonly runner = inject(OrderRunnerService);

  readonly ships = this.fleet.ships;
  readonly selectedShipSymbol = signal<string | null>(null);
  readonly preset = signal<PresetKind>('mining');

  readonly waypoints = signal<PlanetView[]>([]);
  readonly loadingWaypoints = signal(false);

  readonly asteroidWp = signal('');
  readonly marketWp = signal('');
  readonly buyWp = signal('');
  readonly sellWp = signal('');
  readonly tradeGood = signal('');
  readonly buyGoods = signal<string[]>([]);

  readonly online = this.onlineStatus.online;

  readonly selectedShip = computed(() => {
    const symbol = this.selectedShipSymbol();
    return this.ships().find((s) => s.symbol === symbol) ?? null;
  });

  readonly queue = computed(() => {
    const symbol = this.selectedShipSymbol();
    return symbol ? this.store.state(symbol) : null;
  });

  readonly asteroids = computed(() => this.waypoints().filter((w) => isAsteroidWaypoint(w)));
  readonly markets = computed(() => this.waypoints().filter((w) => hasTrait(w, 'MARKETPLACE')));

  readonly describeOrder = describeOrder;

  async ngOnInit(): Promise<void> {
    this.background.setBackground('/assets/img/background.png');
    if (!this.ships().length) await this.fleet.refreshShips();
    const first = this.ships()[0];
    if (first) await this.onSelectShip(first.symbol);
  }

  async onSelectShip(symbol: string): Promise<void> {
    this.selectedShipSymbol.set(symbol);
    const ship = this.ships().find((s) => s.symbol === symbol);
    if (!ship) return;
    await this.loadWaypoints(ship.nav.systemSymbol);
  }

  private async loadWaypoints(systemSymbol: string): Promise<void> {
    this.loadingWaypoints.set(true);
    try {
      const data = await this.api.getAllWaypoints(systemSymbol);
      const planets = data.map(mapWaypoint);
      this.waypoints.set(planets);
      this.asteroidWp.set(this.asteroids()[0]?.name ?? '');
      const market = this.markets()[0]?.name ?? '';
      this.marketWp.set(market);
      this.buyWp.set(market);
      this.sellWp.set(this.markets()[1]?.name ?? market);
    } catch {
      this.snackbar.show('Could not load waypoints for this system.', 'error');
    } finally {
      this.loadingWaypoints.set(false);
    }
  }

  async onSelectBuyMarket(symbol: string): Promise<void> {
    this.buyWp.set(symbol);
    const ship = this.selectedShip();
    if (!ship) return;
    try {
      const market = await this.api.getMarket(ship.nav.systemSymbol, symbol);
      const goods = [...market.exports, ...market.exchange].map((g) => g.symbol);
      this.buyGoods.set(goods);
      this.tradeGood.set(goods[0] ?? '');
    } catch {
      this.buyGoods.set([]);
    }
  }

  applyPreset(): void {
    const symbol = this.selectedShipSymbol();
    if (!symbol) return;

    if (this.preset() === 'mining') {
      if (!this.asteroidWp() || !this.marketWp()) {
        this.snackbar.show('Pick an asteroid and a market first.', 'info');
        return;
      }
      this.store.setOrders(symbol, miningLoopPreset(this.asteroidWp(), this.marketWp()));
    } else {
      if (!this.buyWp() || !this.tradeGood() || !this.sellWp()) {
        this.snackbar.show('Pick a buy market, good, and sell market first.', 'info');
        return;
      }
      this.store.setOrders(symbol, tradeRunPreset(this.buyWp(), this.tradeGood(), this.sellWp()));
    }
    this.snackbar.show('Queue ready. Press Start to engage.', 'success');
  }

  start(): void {
    const symbol = this.selectedShipSymbol();
    if (!symbol) return;
    if (!this.online()) {
      this.snackbar.show('Auto-pilot needs an online connection.', 'error');
      return;
    }
    void this.runner.start(symbol);
  }

  pause(): void {
    const symbol = this.selectedShipSymbol();
    if (symbol) this.runner.pause(symbol);
  }

  reset(): void {
    const symbol = this.selectedShipSymbol();
    if (symbol) this.runner.reset(symbol);
  }

  clear(): void {
    const symbol = this.selectedShipSymbol();
    if (symbol) this.store.clear(symbol);
  }
}
