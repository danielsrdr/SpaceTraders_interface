import { inject, Injectable } from '@angular/core';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { PlanetView, hasTrait } from '../../models/system.model';

/**
 * Cross-references active contract deliverables against the system's markets to
 * find waypoints worth visiting: the delivery destinations themselves, plus any
 * marketplace that produces or buys a required good. Market lookups go through
 * the shared rate limiter and are cached, so repeat calls are cheap.
 */
@Injectable({ providedIn: 'root' })
export class ContractOptimizerService {
  private readonly api = inject(SpaceTradersApiService);

  async computeForSystem(systemSymbol: string, planets: PlanetView[]): Promise<Set<string>> {
    const result = new Set<string>();

    const contracts = await this.api.getContracts();
    const active = contracts.filter((c) => c.accepted && !c.fulfilled);

    const goods = new Set<string>();
    for (const contract of active) {
      for (const deliverable of contract.deliver) {
        if (deliverable.tradeSymbol) goods.add(deliverable.tradeSymbol);
        // The delivery destination is always worth highlighting.
        if (deliverable.destinationSymbol && deliverable.destinationSymbol.startsWith(systemSymbol)) {
          result.add(deliverable.destinationSymbol);
        }
      }
    }

    if (!goods.size) return result;

    const markets = planets.filter((p) => p.system === systemSymbol && hasTrait(p, 'MARKETPLACE'));
    for (const market of markets) {
      try {
        const data = await this.api.getMarket(systemSymbol, market.name);
        const produces = [...data.exports, ...data.exchange].some((g) => goods.has(g.symbol));
        const buys = [...data.imports, ...data.exchange].some((g) => goods.has(g.symbol));
        if (produces || buys) result.add(market.name);
      } catch {
        // Market may be uncharted / unreachable — skip it.
      }
    }

    return result;
  }
}
