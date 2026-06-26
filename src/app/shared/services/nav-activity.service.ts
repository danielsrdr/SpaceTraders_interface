import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AgentStore } from '../../core/state/agent.store';
import { FleetStore } from '../../core/state/fleet.store';
import { FlightRecorderStore } from '../../core/state/flight-recorder.store';
import { ContractView } from '../../models/contract.model';
import { ShipData } from '../../models/ship.model';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { RadioService } from './radio.service';
import { ProgressionService } from '../../features/progression/progression.service';

const POLL_INTERVAL_MS = 60_000;
const EXPIRY_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Drives the navigation "new activity" dots. While an agent is authenticated and
 * the tab is visible it polls ships + contracts on a conservative interval
 * (reusing the rate-limited / cached API) and exposes:
 *  - shipArrivedAlert: a ship just finished a transit (cleared on the Ships page)
 *  - contractExpiringAlert: an accepted, unfulfilled contract is expiring soon
 */
@Injectable({ providedIn: 'root' })
export class NavActivityService {
  private readonly api = inject(SpaceTradersApiService);
  private readonly agentStore = inject(AgentStore);
  private readonly fleetStore = inject(FleetStore);
  private readonly progression = inject(ProgressionService);
  private readonly flightRecorder = inject(FlightRecorderStore);
  private readonly radio = inject(RadioService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly contracts = signal<ContractView[]>([]);
  private readonly now = signal(Date.now());

  readonly shipArrivedAlert = signal(false);

  readonly activeContracts = this.contracts.asReadonly();

  readonly urgentContract = computed<ContractView | null>(() => {
    const pending = this.contracts().filter((c) => c.accepted && !c.fulfilled);
    if (!pending.length) return null;
    return pending.reduce((soonest, candidate) => {
      const a = new Date(candidate.expiration).getTime();
      const b = new Date(soonest.expiration).getTime();
      return a < b ? candidate : soonest;
    });
  });

  readonly contractExpiringAlert = computed(() => {
    const now = this.now();
    const cutoff = now + EXPIRY_THRESHOLD_MS;
    return this.contracts().some((c) => {
      if (!c.accepted || c.fulfilled) return false;
      const expiry = new Date(c.expiration).getTime();
      return Number.isFinite(expiry) && expiry > now && expiry <= cutoff;
    });
  });

  private prevInTransit = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private active = false;

  constructor() {
    effect(() => {
      if (this.agentStore.isAuthenticated()) {
        this.start();
      } else {
        this.stop();
      }
    });

    const sub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd && event.urlAfterRedirects.startsWith('/ships')) {
        this.shipArrivedAlert.set(false);
      }
    });

    document.addEventListener('visibilitychange', this.onVisibility);
    this.destroyRef.onDestroy(() => {
      sub.unsubscribe();
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.stop();
    });
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible' && this.agentStore.isAuthenticated()) {
      void this.poll();
    }
  };

  private start(): void {
    if (this.active) return;
    this.active = true;
    void this.poll();
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.poll();
    }, POLL_INTERVAL_MS);
  }

  private stop(): void {
    this.active = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.contracts.set([]);
    this.shipArrivedAlert.set(false);
    this.prevInTransit.clear();
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    this.now.set(Date.now());
    try {
      const [ships, contracts] = await Promise.all([
        this.fleetStore.refreshShips(),
        this.api.getContracts(1, 20).catch(() => this.contracts()),
      ]);
      this.contracts.set(contracts);
      this.detectArrivals(ships);
      this.progression.syncFromFleet(ships);
    } finally {
      this.polling = false;
    }
  }

  private detectArrivals(ships: ShipData[]): void {
    const nowInTransit = new Set<string>();
    let arrived = false;
    for (const ship of ships) {
      if (ship.nav.status === 'IN_TRANSIT') {
        nowInTransit.add(ship.symbol);
      } else if (this.prevInTransit.has(ship.symbol)) {
        arrived = true;
        // Capture the completed leg for black-box replay + announce it.
        this.flightRecorder.recordFromShip(ship);
        this.radio.announceArrival(ship.symbol, ship.nav.waypointSymbol);
      }
    }
    if (arrived) this.shipArrivedAlert.set(true);
    this.prevInTransit = nowInTransit;
  }
}
