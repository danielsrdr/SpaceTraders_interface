import { inject, Injectable } from '@angular/core';
import { AnalyticsStore } from '../../core/state/analytics.store';
import { DiscoveryStore } from '../../core/state/discovery.store';
import { ShipData } from '../../models/ship.model';

/**
 * Thin facade that records gameplay outcomes into both progression stores:
 * the {@link AnalyticsStore} time-series ledger (fleet dashboard) and the
 * {@link DiscoveryStore} discovered sets + milestone counters (codex unlocks and
 * achievements). Call its `record*` methods next to the existing logbook calls
 * at each action site; it never throws so it is safe to fire-and-forget.
 */
@Injectable({ providedIn: 'root' })
export class ProgressionService {
  private readonly analytics = inject(AnalyticsStore);
  private readonly discovery = inject(DiscoveryStore);

  recordTrade(input: {
    mode: 'buy' | 'sell';
    ship: string;
    units: number;
    good: string;
    totalPrice: number | null;
    waypoint?: string;
    credits?: number;
  }): void {
    const total = input.totalPrice ?? 0;
    this.analytics.record({
      t: Date.now(),
      ship: input.ship,
      kind: input.mode,
      credits: input.mode === 'sell' ? total : -total,
      good: input.good,
      units: input.units,
      destination: input.waypoint,
    });
    this.discovery.markGoodSeen(input.good);
    if (input.mode === 'sell') this.discovery.addRevenue(total);
    this.discovery.recordCredits(input.credits);
  }

  recordRefuel(input: {
    ship: string;
    units: number | null;
    totalPrice: number | null;
    waypoint?: string;
    credits?: number;
  }): void {
    this.analytics.record({
      t: Date.now(),
      ship: input.ship,
      kind: 'refuel',
      credits: input.totalPrice != null ? -input.totalPrice : undefined,
      fuel: input.units ?? undefined,
      destination: input.waypoint,
    });
    this.discovery.recordCredits(input.credits);
  }

  recordNavigate(input: {
    ship: string;
    origin?: string;
    destination: string;
    system?: string;
    destinationType?: string;
    fuelConsumed?: number;
  }): void {
    this.analytics.record({
      t: Date.now(),
      ship: input.ship,
      kind: 'navigate',
      origin: input.origin,
      destination: input.destination,
      fuel: input.fuelConsumed,
    });
    this.discovery.markSystemVisited(input.system);
    this.discovery.markWaypointType(input.destinationType);
    if (input.fuelConsumed) this.discovery.addFuelBurned(input.fuelConsumed);
    if (input.origin && input.origin !== input.destination) this.discovery.incrementRoutesFlown();
  }

  recordContract(input: { payment?: number | null; faction?: string; credits?: number }): void {
    const payment = input.payment ?? 0;
    this.analytics.record({
      t: Date.now(),
      ship: '',
      kind: 'contract',
      credits: payment > 0 ? payment : undefined,
    });
    if (payment > 0) this.discovery.addRevenue(payment);
    this.discovery.markFactionMet(input.faction);
    this.discovery.recordCredits(input.credits);
  }

  recordExtraction(input: { ship: string; good: string; units: number }): void {
    this.analytics.record({
      t: Date.now(),
      ship: input.ship,
      kind: 'extract',
      good: input.good,
      units: input.units,
    });
    this.discovery.markGoodSeen(input.good);
  }

  /** A faction was inspected in the registry — counts as "met" for the codex. */
  markFactionViewed(symbol: string | null | undefined): void {
    this.discovery.markFactionMet(symbol);
  }

  /** Goods observed at a market the player opened. */
  markGoodsSeen(symbols: Iterable<string>): void {
    for (const symbol of symbols) this.discovery.markGoodSeen(symbol);
  }

  /** Seed discovery from the currently-known fleet (systems occupied, transit destinations). */
  syncFromFleet(ships: ShipData[]): void {
    for (const ship of ships) {
      this.discovery.markSystemVisited(ship.nav.systemSymbol);
      if (ship.nav.status === 'IN_TRANSIT') {
        this.discovery.markWaypointType(ship.nav.route?.destination?.type);
      }
    }
  }
}
