import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { AgentStore } from '../../core/state/agent.store';
import { FleetStore } from '../../core/state/fleet.store';
import { GhostMeta, GhostStore } from '../../core/state/ghost.store';
import { AgentData } from '../../models/agent.model';
import { ShipData } from '../../models/ship.model';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { OnlineStatusService } from '../../shared/services/online-status.service';
import { factionColor } from '../../shared/faction-colors';

const HQ_POLL_MS = 5 * 60 * 1000;
const SCAN_POLL_MS = 2 * 60 * 1000;
const TOP_AGENTS = 10;

function hqSystem(hq: string): string {
  return hq.split('-').slice(0, 2).join('-');
}

function synthesizeHqGhost(agent: AgentData, selfSymbol: string): ShipData | null {
  if (agent.symbol === selfSymbol) return null;
  const hq = agent.headquarters;
  if (!hq) return null;
  return {
    symbol: `GHOST-HQ-${agent.symbol}`,
    registration: {
      name: agent.symbol,
      factionSymbol: agent.startingFaction,
      role: 'EXPLORER',
    },
    nav: {
      systemSymbol: hqSystem(hq),
      waypointSymbol: hq,
      status: 'DOCKED',
      flightMode: 'CRUISE',
    },
    crew: { current: 1, capacity: 1, required: 1, morale: 100 },
    frame: {
      name: 'Ghost',
      description: 'Leaderboard agent HQ marker',
      fuelCapacity: 100,
      condition: 100,
      requirements: { power: 1, crew: 1 },
    },
    reactor: {
      name: 'Ghost',
      description: '',
      condition: 100,
      powerOutput: 1,
      requirements: { crew: 1 },
    },
    fuel: { current: 0, capacity: 100, consumed: { amount: 0, timestamp: new Date().toISOString() } },
  };
}

@Injectable({ providedIn: 'root' })
export class GhostFleetService {
  private readonly api = inject(SpaceTradersApiService);
  private readonly agentStore = inject(AgentStore);
  private readonly fleetStore = inject(FleetStore);
  private readonly ghostStore = inject(GhostStore);
  private readonly online = inject(OnlineStatusService);
  private readonly destroyRef = inject(DestroyRef);

  readonly enabled = signal(true);
  readonly loading = signal(false);

  private hqTimer: ReturnType<typeof setInterval> | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private currentSystem = signal('');

  constructor() {
    effect(() => {
      if (this.agentStore.isAuthenticated()) {
        this.startPolling();
      } else {
        this.stopPolling();
      }
    });
    this.destroyRef.onDestroy(() => this.stopPolling());
    document.addEventListener('visibilitychange', this.onVisibility);
    this.destroyRef.onDestroy(() =>
      document.removeEventListener('visibilitychange', this.onVisibility),
    );
  }

  ghostsForSystem(systemSymbol: string): ShipData[] {
    if (!this.enabled()) return [];
    return this.ghostStore.ships().filter((s) => {
      if (s.nav.systemSymbol === systemSymbol) return true;
      return s.nav.status === 'IN_TRANSIT' && s.nav.route?.origin.systemSymbol === systemSymbol;
    });
  }

  metaForShip(symbol: string): GhostMeta | undefined {
    return this.ghostStore.meta()[symbol];
  }

  setSystem(systemSymbol: string): void {
    const prev = this.currentSystem();
    this.currentSystem.set(systemSymbol);
    if (!this.enabled() || !this.online.isOnline()) return;
    if (prev !== systemSymbol) {
      void this.refresh(systemSymbol, true);
    }
  }

  toggle(): void {
    this.enabled.update((v) => !v);
  }

  private startPolling(): void {
    if (this.hqTimer) return;
    void this.refresh(this.currentSystem());
    this.hqTimer = setInterval(() => {
      if (document.hidden || !this.online.isOnline()) return;
      void this.refresh(this.currentSystem());
    }, HQ_POLL_MS);
    this.scanTimer = setInterval(() => {
      if (document.hidden || !this.online.isOnline()) return;
      void this.scanCurrentSystem(this.currentSystem());
    }, SCAN_POLL_MS);
  }

  private stopPolling(): void {
    if (this.hqTimer) clearInterval(this.hqTimer);
    if (this.scanTimer) clearInterval(this.scanTimer);
    this.hqTimer = null;
    this.scanTimer = null;
  }

  private readonly onVisibility = (): void => {
    if (!document.hidden && this.agentStore.isAuthenticated() && this.online.isOnline()) {
      void this.refresh(this.currentSystem());
    }
  };

  private async refresh(systemSymbol: string, force = false): Promise<void> {
    if (!force && this.ghostStore.isFresh()) return;
    this.loading.set(true);
    try {
      const self = this.agentStore.agent()?.name ?? '';
      const status = await this.api.getStatus();
      const top =
        status.leaderboards?.mostCredits?.slice(0, TOP_AGENTS) ??
        (await this.api.getAllAgents())
          .sort((a, b) => b.credits - a.credits)
          .slice(0, TOP_AGENTS)
          .map((a) => ({ agentSymbol: a.symbol, credits: a.credits }));

      const ships: ShipData[] = [];
      const meta: Record<string, GhostMeta> = {};

      for (const row of top) {
        if (row.agentSymbol === self) continue;
        try {
          const agent = await this.api.getAgentBySymbol(row.agentSymbol);
          const ghost = synthesizeHqGhost(agent, self);
          if (!ghost) continue;
          ships.push(ghost);
          meta[ghost.symbol] = {
            agentSymbol: agent.symbol,
            credits: agent.credits,
            source: 'hq',
          };
        } catch {
          // skip agent
        }
      }

      if (systemSymbol) {
        const scanned = await this.scanCurrentSystem(systemSymbol, ships, meta);
        ships.push(...scanned.newShips);
        Object.assign(meta, scanned.newMeta);
      }

      this.ghostStore.set({ ships, meta, fetchedAt: Date.now() });
    } catch {
      // keep stale cache
    } finally {
      this.loading.set(false);
    }
  }

  private async scanCurrentSystem(
    systemSymbol: string,
    existingShips: ShipData[] = this.ghostStore.ships(),
    existingMeta: Record<string, GhostMeta> = this.ghostStore.meta(),
  ): Promise<{ newShips: ShipData[]; newMeta: Record<string, GhostMeta> }> {
    const newShips: ShipData[] = [];
    const newMeta: Record<string, GhostMeta> = {};
    if (!systemSymbol) return { newShips, newMeta };

    const mine = new Set(this.fleetStore.ships().map((s) => s.symbol));
    const scanner = this.fleetStore
      .ships()
      .find((s) => s.nav.systemSymbol === systemSymbol && s.nav.status !== 'IN_TRANSIT');

    if (!scanner) return { newShips, newMeta };

    try {
      const mounts = await this.api.getMounts(scanner.symbol);
      const hasSensor = mounts.some((m) => m.symbol.toUpperCase().includes('SENSOR'));
      if (!hasSensor) return { newShips, newMeta };

      const response = await this.api.scanShips(scanner.symbol);
      const scanned = (response.data.ships ?? []) as ShipData[];
      for (const ship of scanned) {
        if (mine.has(ship.symbol)) continue;
        if (existingShips.some((g) => g.symbol === ship.symbol)) continue;
        newShips.push(ship);
        newMeta[ship.symbol] = {
          agentSymbol: ship.registration.name,
          source: 'scan',
        };
      }
    } catch {
      // cooldown or missing mount
    }
    return { newShips, newMeta };
  }

  blipColor(ship: ShipData): number {
    const hex = factionColor(ship.registration.factionSymbol);
    return parseInt(hex.replace('#', ''), 16);
  }
}
