import { computed, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { FleetStore } from '../../core/state/fleet.store';
import { AgentStore } from '../../core/state/agent.store';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { mapWaypoint, PlanetView } from '../../models/system.model';
import { getAgentSystem } from '../../models/agent.model';
import { OrderRunnerService } from '../../features/automation/order-runner.service';
import { TravelExecutorService } from '../../features/systems/travel-executor.service';
import { buildTravelPlan, findTravelBlockers } from '../../features/systems/travel-plan';
import { hasTrait } from '../../models/system.model';
import { SnackbarService } from './snackbar.service';
import { ShipCommandContextService } from './ship-command-context.service';
import { PaletteCommand } from '../navigation/nav-commands.service';
import { NavIconName } from '../components/side-nav/nav-icon.component';

@Injectable({ providedIn: 'root' })
export class ShipCommandsService {
  private readonly fleet = inject(FleetStore);
  private readonly agentStore = inject(AgentStore);
  private readonly api = inject(SpaceTradersApiService);
  private readonly context = inject(ShipCommandContextService);
  private readonly orderRunner = inject(OrderRunnerService);
  private readonly travel = inject(TravelExecutorService);
  private readonly snackbar = inject(SnackbarService);
  private readonly router = inject(Router);

  readonly hasShip = computed(() => !!this.fleet.selectedShip());

  paletteCommands(query: string): PaletteCommand[] {
    const ship = this.fleet.selectedShip();
    if (!ship) return [];

    const q = query.trim().toLowerCase();
    const commands: PaletteCommand[] = [];
    const shipHint = ship.symbol;

    commands.push(
      this.shipCmd('sell-all', 'Sell all cargo', 'ships', shipHint, ['sell', 'cargo', 'trade'], () =>
        this.runOrder({ kind: 'sellAll' }),
      ),
      this.shipCmd('refuel', 'Refuel ship', 'ships', shipHint, ['fuel', 'gas'], () =>
        this.runOrder({ kind: 'refuel' }),
      ),
      this.shipCmd('autopilot', 'Open auto-pilot', 'autopilot', shipHint, ['queue', 'automation'], () => {
        void this.router.navigate(['/autopilot']);
      }),
    );

    for (const planet of this.context.planets()) {
      const label = `Navigate to ${planet.name}`;
      const keywords = [planet.name, planet.type, 'navigate', 'travel', 'go'];
      if (q && !this.matches(q, label, keywords)) continue;
      commands.push(
        this.shipCmd(`nav-${planet.name}`, label, 'systems', planet.type, keywords, () =>
          this.navigateTo(planet),
        ),
      );
    }

    const dockedMarket = this.dockedMarketGoods(ship);
    for (const symbol of dockedMarket) {
      const label = `Buy max ${symbol}`;
      const keywords = [symbol, 'buy', 'purchase', 'cargo'];
      if (q && !this.matches(q, label, keywords)) continue;
      commands.push(
        this.shipCmd(`buy-${symbol}`, label, 'ships', shipHint, keywords, () =>
          this.runOrder({ kind: 'buyMax', tradeSymbol: symbol }),
        ),
      );
    }

    if (!q) return commands;
    return commands.filter((c) => this.matches(q, c.label, c.keywords));
  }

  async ensureContext(): Promise<PlanetView[]> {
    const cached = this.context.planets();
    if (cached.length) return cached;

    const agent = this.agentStore.agent();
    if (!agent) return [];

    const ships = this.fleet.ships();
    const system =
      this.context.systemSymbol() ??
      ships.find((s) => s.nav.systemSymbol)?.nav.systemSymbol ??
      getAgentSystem(agent);

    try {
      const waypoints = await this.api.getAllWaypoints(system);
      const planets = waypoints.map(mapWaypoint);
      this.context.setContext(system, planets);
      return planets;
    } catch {
      return [];
    }
  }

  private dockedMarketGoods(ship: { nav: { status: string; waypointSymbol: string } }): string[] {
    if (ship.nav.status !== 'DOCKED') return [];
    const planet = this.context.planets().find((p) => p.name === ship.nav.waypointSymbol);
    if (!planet || !hasTrait(planet, 'MARKETPLACE')) return [];
    return [];
  }

  /** Load market goods when ship is docked at a marketplace (lazy). */
  async loadDockedMarketCommands(query: string): Promise<PaletteCommand[]> {
    const ship = this.fleet.selectedShip();
    if (!ship || ship.nav.status !== 'DOCKED') return [];

    await this.ensureContext();
    const planet = this.context.planets().find((p) => p.name === ship.nav.waypointSymbol);
    if (!planet || !hasTrait(planet, 'MARKETPLACE')) return [];

    try {
      const market = await this.api.getMarket(planet.system, planet.name);
      const symbols = [...market.exports, ...market.exchange].map((g) => g.symbol);
      const q = query.trim().toLowerCase();
      return symbols
        .filter((symbol) => !q || symbol.toLowerCase().includes(q) || 'buy'.includes(q))
        .map((symbol) =>
          this.shipCmd(`buy-${symbol}`, `Buy max ${symbol}`, 'ships', ship.symbol, [symbol, 'buy'], () =>
            this.runOrder({ kind: 'buyMax', tradeSymbol: symbol }),
          ),
        );
    } catch {
      return [];
    }
  }

  private async navigateTo(planet: PlanetView): Promise<void> {
    const ship = this.fleet.selectedShip();
    if (!ship) {
      this.snackbar.show('Select a ship on the Systems map first.', 'warning');
      void this.router.navigate(['/systems']);
      return;
    }

    await this.ensureContext();
    const blockers = findTravelBlockers(ship, planet);
    if (blockers.length) {
      this.snackbar.show(blockers[0]!.message, blockers[0]!.severity === 'error' ? 'error' : 'warning');
      return;
    }

    const steps = buildTravelPlan(planet, ship, 'visit');
    if (!steps.length) {
      this.snackbar.show(`Already at ${planet.name}.`, 'info');
      return;
    }

    try {
      await this.travel.executeSteps(steps, {
        shipSymbol: ship.symbol,
        planet,
        reloadShips: () => this.fleet.refreshShips(),
        getShips: () => this.fleet.ships(),
      });
      this.snackbar.show(`Arrived at ${planet.name}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Navigation failed';
      this.snackbar.show(message, 'error');
    }
  }

  private async runOrder(
    order: Parameters<OrderRunnerService['runOnce']>[1],
  ): Promise<void> {
    const ship = this.fleet.selectedShip();
    if (!ship) {
      this.snackbar.show('Select a ship on the Systems map first.', 'warning');
      return;
    }
    try {
      await this.orderRunner.runOnce(ship.symbol, order);
      this.snackbar.show('Command completed', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Command failed';
      this.snackbar.show(message, 'error');
    }
  }

  private shipCmd(
    id: string,
    label: string,
    icon: NavIconName,
    hint: string,
    keywords: string[],
    execute: () => void | Promise<void>,
  ): PaletteCommand {
    return { id, label, icon, hint, group: 'ship', keywords, locked: false, execute };
  }

  private matches(q: string, label: string, keywords: string[]): boolean {
    return [label, ...keywords].join(' ').toLowerCase().includes(q);
  }
}
