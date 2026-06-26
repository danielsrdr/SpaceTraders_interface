import { inject, Injectable, signal } from '@angular/core';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { PlanetView, hasTrait } from '../../models/system.model';
import { mapWaypoint } from '../../models/system.model';
import { ShipCommandContextService } from './ship-command-context.service';
import { FleetStore } from '../../core/state/fleet.store';
import { AgentStore } from '../../core/state/agent.store';
import { getAgentSystem } from '../../models/agent.model';
import { TravelExecutorService } from '../../features/systems/travel-executor.service';
import { buildTravelPlan, findTravelBlockers } from '../../features/systems/travel-plan';
import { SnackbarService } from './snackbar.service';
import { PaletteCommand } from '../navigation/nav-commands.service';
import { Router } from '@angular/router';

export interface PriceQuote {
  tradeSymbol: string;
  bestSell: { waypoint: string; price: number; supply: string } | null;
  bestBuy: { waypoint: string; price: number } | null;
  spread: number | null;
}

const CACHE_TTL_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class PriceComparatorService {
  private readonly api = inject(SpaceTradersApiService);
  private readonly context = inject(ShipCommandContextService);
  private readonly fleet = inject(FleetStore);
  private readonly agentStore = inject(AgentStore);
  private readonly travel = inject(TravelExecutorService);
  private readonly snackbar = inject(SnackbarService);
  private readonly router = inject(Router);

  private cacheKey: string | null = null;
  private cacheAt = 0;
  private cacheQuotes: PriceQuote[] = [];

  readonly loading = signal(false);
  readonly lastComparedAt = signal<number | null>(null);

  async compareInSystem(
    systemSymbol: string,
    planets: PlanetView[],
    symbols?: string[],
  ): Promise<PriceQuote[]> {
    const key = `${systemSymbol}:${symbols?.join(',') ?? '*'}`;
    const now = Date.now();
    if (this.cacheKey === key && now - this.cacheAt < CACHE_TTL_MS) {
      return this.cacheQuotes;
    }

    this.loading.set(true);
    try {
      const markets = planets.filter((p) => p.system === systemSymbol && hasTrait(p, 'MARKETPLACE'));
      const sellMap = new Map<string, { waypoint: string; price: number; supply: string }>();
      const buyMap = new Map<string, { waypoint: string; price: number }>();

      for (const market of markets) {
        try {
          const data = await this.api.getMarket(systemSymbol, market.name);
          for (const good of data.tradeGoods ?? []) {
            if (symbols?.length && !symbols.includes(good.symbol)) continue;
            const sell = good.sellPrice;
            if (sell > 0) {
              const prev = sellMap.get(good.symbol);
              if (!prev || sell > prev.price) {
                sellMap.set(good.symbol, {
                  waypoint: market.name,
                  price: sell,
                  supply: String(good.supply),
                });
              }
            }
            const buy = good.purchasePrice;
            if (buy > 0) {
              const prev = buyMap.get(good.symbol);
              if (!prev || buy < prev.price) {
                buyMap.set(good.symbol, { waypoint: market.name, price: buy });
              }
            }
          }
        } catch {
          // skip unreachable markets
        }
      }

      const allSymbols = symbols?.length
        ? symbols
        : [...new Set([...sellMap.keys(), ...buyMap.keys()])];

      const quotes: PriceQuote[] = allSymbols.map((tradeSymbol) => {
        const bestSell = sellMap.get(tradeSymbol) ?? null;
        const bestBuy = buyMap.get(tradeSymbol) ?? null;
        const spread =
          bestSell && bestBuy ? bestSell.price - bestBuy.price : null;
        return { tradeSymbol, bestSell, bestBuy, spread };
      });

      this.cacheKey = key;
      this.cacheAt = now;
      this.cacheQuotes = quotes;
      this.lastComparedAt.set(now);
      return quotes;
    } finally {
      this.loading.set(false);
    }
  }

  async compareSymbol(tradeSymbol: string): Promise<PriceQuote | null> {
    const planets = await this.resolvePlanets();
    const system = this.resolveSystem(planets);
    if (!system) return null;
    const quotes = await this.compareInSystem(system, planets, [tradeSymbol]);
    return quotes[0] ?? null;
  }

  async paletteCommandsForSymbol(tradeSymbol: string): Promise<PaletteCommand[]> {
    const quote = await this.compareSymbol(tradeSymbol);
    if (!quote?.bestSell) return [];

    const ship = this.fleet.selectedShip();
    const label = `Best sell ${tradeSymbol} @ ${quote.bestSell.waypoint} (${quote.bestSell.price} cr)`;
    return [
      {
        id: `price-${tradeSymbol}`,
        label,
        icon: 'data',
        hint: `Supply: ${quote.bestSell.supply}`,
        group: 'action',
        keywords: [tradeSymbol, 'price', 'sell'],
        locked: false,
        execute: () => this.navigateToBestSell(tradeSymbol, quote),
      },
    ];
  }

  private async navigateToBestSell(tradeSymbol: string, quote: PriceQuote): Promise<void> {
    if (!quote.bestSell) return;
    const ship = this.fleet.selectedShip();
    if (!ship) {
      this.snackbar.show('Select a ship on the Systems map first.', 'warning');
      void this.router.navigate(['/systems']);
      return;
    }
    const planets = await this.resolvePlanets();
    const planet = planets.find((p) => p.name === quote.bestSell!.waypoint);
    if (!planet) {
      this.snackbar.show('Waypoint not found in current system.', 'error');
      return;
    }
    const blockers = findTravelBlockers(ship, planet);
    if (blockers.length) {
      this.snackbar.show(blockers[0]!.message, blockers[0]!.severity === 'error' ? 'error' : 'warning');
      return;
    }
    const steps = buildTravelPlan(planet, ship, 'market');
    try {
      await this.travel.executeSteps(steps, {
        shipSymbol: ship.symbol,
        planet,
        reloadShips: () => this.fleet.refreshShips(),
        getShips: () => this.fleet.ships(),
      });
      this.snackbar.show(`Docked at ${planet.name} — ready to sell ${tradeSymbol}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Navigation failed';
      this.snackbar.show(message, 'error');
    }
  }

  private async resolvePlanets(): Promise<PlanetView[]> {
    const cached = this.context.planets();
    if (cached.length) return cached;
    const agent = this.agentStore.agent();
    if (!agent) return [];
    const system = this.resolveSystem([]);
    if (!system) return [];
    try {
      const waypoints = await this.api.getAllWaypoints(system);
      const planets = waypoints.map(mapWaypoint);
      this.context.setContext(system, planets);
      return planets;
    } catch {
      return [];
    }
  }

  private resolveSystem(planets: PlanetView[]): string | null {
    return (
      this.context.systemSymbol() ??
      this.fleet.ships().find((s) => s.nav.systemSymbol)?.nav.systemSymbol ??
      (this.agentStore.agent() ? getAgentSystem(this.agentStore.agent()!) : null)
    );
  }
}
