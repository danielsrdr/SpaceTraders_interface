import { inject, Injectable } from '@angular/core';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { ShipData } from '../../models/ship.model';
import { PlanetView } from '../../models/system.model';
import { shipInTransit } from './planet-helpers';
import { TravelPlanStep } from './travel-plan';

/**
 * Context supplied by the caller so the executor can stay UI-agnostic.
 * The pure navigation steps (setFlightMode/orbit/navigate/dock) are handled
 * internally; the UI-coupled steps (surface/openMarket) are delegated to the
 * optional hooks so both the system map and the auto-pilot can share one engine.
 */
export interface TravelExecutionContext {
  shipSymbol: string;
  /** Required when a plan may contain a `surface` step. */
  planet?: PlanetView | null;
  /** Reload the fleet so subsequent steps observe fresh nav state. */
  reloadShips: () => Promise<unknown>;
  /** Read the latest known ship list (after `reloadShips`). */
  getShips: () => ShipData[];
  /** Invoked for a `surface` step; receives the not-yet-run remaining steps. */
  onSurface?: (planet: PlanetView, remaining: TravelPlanStep[]) => void;
  /** Invoked for an `openMarket` step. */
  onOpenMarket?: () => Promise<void>;
  /** Polling cadence while waiting for arrival (default 1000ms). */
  pollIntervalMs?: number;
  /** Max poll attempts before timing out (default 180). */
  maxPolls?: number;
  /** Abort signal: when it returns true, polling stops and throws. */
  isCancelled?: () => boolean;
}

export interface TravelExecutionResult {
  /** True when execution suspended on a `surface` step (UI took over). */
  suspended: boolean;
}

@Injectable({ providedIn: 'root' })
export class TravelExecutorService {
  private readonly api = inject(SpaceTradersApiService);

  /**
   * Execute a travel plan. Resolves once the plan finishes, or returns
   * `{ suspended: true }` when a `surface` step hands control to the UI.
   */
  async executeSteps(
    steps: TravelPlanStep[],
    ctx: TravelExecutionContext,
  ): Promise<TravelExecutionResult> {
    const { shipSymbol } = ctx;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;

      switch (step.kind) {
        case 'setFlightMode':
          await this.api.patchShipNav(shipSymbol, step.mode);
          await ctx.reloadShips();
          break;

        case 'orbit':
          await this.api.orbitShip(shipSymbol, step.waypointSymbol);
          await ctx.reloadShips();
          break;

        case 'navigate':
          await this.api.navigateShip(shipSymbol, step.waypointSymbol);
          await ctx.reloadShips();
          await this.waitForShipAtWaypoint(shipSymbol, step.waypointSymbol, ctx);
          break;

        case 'dock':
          await this.api.dockShip(shipSymbol);
          await ctx.reloadShips();
          break;

        case 'surface': {
          const planet = ctx.planet;
          if (planet && ctx.onSurface) {
            ctx.onSurface(planet, steps.slice(i + 1));
            return { suspended: true };
          }
          break;
        }

        case 'openMarket':
          if (ctx.onOpenMarket) await ctx.onOpenMarket();
          break;

        default: {
          const _exhaustive: never = step;
          void _exhaustive;
        }
      }
    }

    return { suspended: false };
  }

  /** Poll the fleet until the ship is parked (not in transit) at the waypoint. */
  async waitForShipAtWaypoint(
    shipSymbol: string,
    waypointSymbol: string,
    ctx: Pick<TravelExecutionContext, 'reloadShips' | 'getShips' | 'pollIntervalMs' | 'maxPolls' | 'isCancelled'>,
  ): Promise<void> {
    const interval = ctx.pollIntervalMs ?? 1000;
    const maxPolls = ctx.maxPolls ?? 180;

    for (let attempt = 0; attempt < maxPolls; attempt++) {
      if (ctx.isCancelled?.()) {
        throw new Error('Travel cancelled');
      }
      await ctx.reloadShips();
      const ship = ctx.getShips().find((s) => s.symbol === shipSymbol);
      if (!ship) return;
      if (!shipInTransit(ship) && ship.nav.waypointSymbol === waypointSymbol) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Travel timed out waiting for ship to arrive');
  }
}
