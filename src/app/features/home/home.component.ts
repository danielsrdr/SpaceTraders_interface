import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AgentStore } from '../../core/state/agent.store';
import { AnalyticsStore } from '../../core/state/analytics.store';
import { FleetStore } from '../../core/state/fleet.store';
import { FlightRecorderStore } from '../../core/state/flight-recorder.store';
import { LogbookStore, logCategoryClass } from '../../core/state/logbook.store';
import { OrderQueueStore } from '../../core/state/order-queue.store';
import { SessionStore } from '../../core/state/session.store';
import { getAgentSystem } from '../../models/agent.model';
import { ContractView } from '../../models/contract.model';
import { GameStatus } from '../../models/api.model';
import { ShipData } from '../../models/ship.model';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { factionColor } from '../../shared/faction-colors';
import { NavActivityService } from '../../shared/services/nav-activity.service';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { FleetMiniMapComponent } from './fleet-mini-map.component';
import { getTransitProgress, shipInTransit } from '../systems/planet-helpers';

export interface RecommendedAction {
  id: string;
  label: string;
  detail: string;
  route: string;
  queryParams?: Record<string, string>;
  priority: number;
}

@Component({
  selector: 'app-home',
  imports: [FleetMiniMapComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit, OnDestroy {
  private readonly api = inject(SpaceTradersApiService);
  private readonly agentStore = inject(AgentStore);
  private readonly analytics = inject(AnalyticsStore);
  readonly fleet = inject(FleetStore);
  readonly navActivity = inject(NavActivityService);
  private readonly logbook = inject(LogbookStore);
  private readonly orderQueue = inject(OrderQueueStore);
  private readonly flightRecorder = inject(FlightRecorderStore);
  private readonly session = inject(SessionStore);
  private readonly background = inject(PageBackgroundService);
  private readonly snackbar = inject(SnackbarService);
  private readonly router = inject(Router);

  readonly status = signal<GameStatus | null>(null);
  readonly loading = signal(false);

  private readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly agent = computed(() => this.agentStore.agent());
  readonly agentCredits = computed(() => this.agent()?.credits ?? null);
  readonly factionTint = computed(() => factionColor(this.agent()?.faction));

  readonly revenuePerHour = computed(() => this.analytics.revenuePerHour(24, this.now()));
  readonly fleetSummary = computed(() => {
    const ships = this.fleet.ships();
    return {
      total: ships.length,
      inTransit: ships.filter((s) => s.nav.status === 'IN_TRANSIT').length,
    };
  });
  readonly openContracts = computed(
    () => this.navActivity.activeContracts().filter((c) => c.accepted && !c.fulfilled).length,
  );

  readonly mapSystem = computed(() => {
    const agent = this.agent();
    if (!agent) return '';
    const ships = this.fleet.ships();
    const selected = this.fleet.selectedShip();
    if (selected?.nav.systemSymbol) return selected.nav.systemSymbol;
    if (ships.length) return ships[0].nav.systemSymbol;
    return getAgentSystem(agent);
  });

  readonly recentLog = computed(() => this.logbook.recent(6).reverse());
  readonly logCategoryClass = logCategoryClass;

  readonly recommendedActions = computed(() => this.buildRecommendedActions());
  readonly primaryAction = computed(() => this.recommendedActions()[0] ?? null);

  readonly resumeLabel = computed(() => {
    if (this.session.hasValidSnapshot()) {
      const snap = this.session.snapshot();
      return `Reprendre · ${this.routeLabel(snap?.route ?? '/systems')}`;
    }
    const primary = this.primaryAction();
    return primary ? primary.label : 'Explorer les systèmes';
  });

  ngOnInit(): void {
    this.background.setBackground('/assets/img/background.png');
    this.timer = setInterval(() => this.now.set(Date.now()), 30_000);
    void this.load();
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [status, agent] = await Promise.all([
        this.api.getStatus(),
        this.api.getAgent(),
        this.fleet.refreshShips(),
      ]);
      this.status.set(status);
      this.agentStore.patchCredits(agent.credits);
    } catch {
      this.snackbar.show('Failed to load command center data', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  resume(): void {
    const snap = this.session.snapshot();
    if (this.session.hasValidSnapshot() && snap) {
      void this.router.navigate([snap.route], { queryParams: snap.queryParams ?? {} });
      return;
    }
    const primary = this.primaryAction();
    if (primary) {
      void this.router.navigate([primary.route], { queryParams: primary.queryParams ?? {} });
      return;
    }
    void this.router.navigate(['/systems']);
  }

  runAction(action: RecommendedAction): void {
    void this.router.navigate([action.route], { queryParams: action.queryParams ?? {} });
  }

  goShips(): void {
    void this.router.navigate(['/ships']);
  }

  goContracts(): void {
    void this.router.navigate(['/contracts']);
  }

  plotContract(contract: ContractView): void {
    const dest = contract.destination || contract.deliver[0]?.destinationSymbol;
    if (!dest) {
      void this.router.navigate(['/contracts']);
      return;
    }
    const system = dest.split('-').slice(0, 2).join('-');
    void this.router.navigate(['/systems'], {
      queryParams: { name: system, travelTo: dest, fallback: '0' },
    });
  }

  formatCredits(value: number): string {
    const rounded = Math.round(value);
    return `${rounded < 0 ? '-' : ''}${Math.abs(rounded).toLocaleString()}c`;
  }

  formatCompact(value: number): string {
    return Math.round(value).toLocaleString();
  }

  formatLogTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private buildRecommendedActions(): RecommendedAction[] {
    const actions: RecommendedAction[] = [];

    if (this.navActivity.shipArrivedAlert()) {
      actions.push({
        id: 'arrived',
        label: 'Vaisseau arrivé',
        detail: 'Un vaisseau a terminé son transit — récupérez-le.',
        route: '/ships',
        priority: 1,
      });
    }

    const urgent = this.navActivity.urgentContract();
    if (urgent && this.navActivity.contractExpiringAlert()) {
      const dest = urgent.destination || urgent.deliver[0]?.destinationSymbol;
      actions.push({
        id: 'contract-urgent',
        label: 'Contrat urgent',
        detail: `${urgent.faction} · expire ${new Date(urgent.expiration).toLocaleString()}`,
        route: dest ? '/systems' : '/contracts',
        queryParams: dest
          ? { name: dest.split('-').slice(0, 2).join('-'), travelTo: dest, fallback: '0' }
          : undefined,
        priority: 2,
      });
    }

    const paused = Object.entries(this.orderQueue.queues()).filter(
      ([, q]) => q.status === 'paused' && q.orders.length > 0,
    );
    if (paused.length) {
      actions.push({
        id: 'autopilot-paused',
        label: 'Autopilot en pause',
        detail: `${paused.length} file(s) en attente de reprise`,
        route: '/autopilot',
        priority: 3,
      });
    }

    const nearArrival = this.findNearArrivalShip(this.fleet.ships());
    if (nearArrival) {
      actions.push({
        id: 'near-arrival',
        label: `${nearArrival.symbol} arrive bientôt`,
        detail: 'Suivre sur la carte système',
        route: '/systems',
        queryParams: {
          name: nearArrival.nav.systemSymbol,
          travelTo: nearArrival.nav.route?.destination.symbol ?? nearArrival.nav.waypointSymbol,
          fallback: '0',
        },
        priority: 4,
      });
    }

    const lastVoyage = this.flightRecorder.recent()[0];
    if (lastVoyage) {
      actions.push({
        id: 'replay',
        label: 'Rejouer le dernier vol',
        detail: `${lastVoyage.originSymbol} → ${lastVoyage.destinationSymbol}`,
        route: '/systems',
        queryParams: {
          name: lastVoyage.systemSymbol,
          replay: String(lastVoyage.id),
        },
        priority: 5,
      });
    }

    return actions.sort((a, b) => a.priority - b.priority);
  }

  private findNearArrivalShip(ships: ShipData[]): ShipData | null {
    const now = this.now();
    for (const ship of ships) {
      if (!shipInTransit(ship) || !ship.nav.route) continue;
      const progress = getTransitProgress(ship.nav.route, now);
      if (progress >= 0.85 && progress < 1) return ship;
    }
    return null;
  }

  private routeLabel(route: string): string {
    switch (route) {
      case '/systems':
        return 'Carte système';
      case '/contracts':
        return 'Contrats';
      case '/ships':
        return 'Flotte';
      case '/dashboard':
        return 'Dashboard';
      case '/autopilot':
        return 'Autopilot';
      case '/codex':
        return 'Codex';
      default:
        return route.replace(/^\//, '');
    }
  }
}
