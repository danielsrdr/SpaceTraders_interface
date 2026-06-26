import { effect, inject, Injectable, signal, untracked, WritableSignal } from '@angular/core';
import { AgentStore } from './agent.store';
import { SnackbarService } from '../../shared/services/snackbar.service';

interface DiscoveryState {
  data: boolean;
  factions: boolean;
  systemsVisited: string[];
  waypointTypesSeen: string[];
  factionsMet: string[];
  goodsSeen: string[];
  peakCredits: number;
  lifetimeRevenue: number;
  lifetimeFuelBurned: number;
  routesFlown: number;
}

const STORAGE_PREFIX = 'sk_discovery_';

function emptyState(): DiscoveryState {
  return {
    data: false,
    factions: false,
    systemsVisited: [],
    waypointTypesSeen: [],
    factionsMet: [],
    goodsSeen: [],
    peakCredits: 0,
    lifetimeRevenue: 0,
    lifetimeFuelBurned: 0,
    routesFlown: 0,
  };
}

/**
 * Tracks per-agent "discovery" / progression (no backend). Beyond the original
 * Data / Factions menu unlock flags it now records the sets and milestone
 * counters that drive the Codex (unlockable cards) and Achievements: which
 * systems, waypoint types, factions and goods have been encountered, plus peak
 * credits and lifetime revenue / fuel / routes. State is persisted in
 * localStorage keyed by agent so it survives reloads and is isolated per agent.
 */
@Injectable({ providedIn: 'root' })
export class DiscoveryStore {
  private readonly agentStore = inject(AgentStore);
  private readonly snackbar = inject(SnackbarService);

  readonly dataUnlocked = signal(false);
  readonly factionsUnlocked = signal(false);

  readonly systemsVisited = signal<ReadonlySet<string>>(new Set());
  readonly waypointTypesSeen = signal<ReadonlySet<string>>(new Set());
  readonly factionsMet = signal<ReadonlySet<string>>(new Set());
  readonly goodsSeen = signal<ReadonlySet<string>>(new Set());

  readonly peakCredits = signal(0);
  readonly lifetimeRevenue = signal(0);
  readonly lifetimeFuelBurned = signal(0);
  readonly routesFlown = signal(0);

  constructor() {
    effect(() => {
      const agent = this.agentStore.agent();
      // Only `agent()` should drive this effect; everything below both reads and
      // writes our own signals, so run it untracked to avoid feedback loops.
      untracked(() => {
        const state = agent ? this.read(agent.name) : emptyState();
        this.dataUnlocked.set(state.data);
        this.factionsUnlocked.set(state.factions);
        this.systemsVisited.set(new Set(state.systemsVisited));
        this.waypointTypesSeen.set(new Set(state.waypointTypesSeen));
        this.factionsMet.set(new Set(state.factionsMet));
        this.goodsSeen.set(new Set(state.goodsSeen));
        this.peakCredits.set(state.peakCredits);
        this.lifetimeRevenue.set(state.lifetimeRevenue);
        this.lifetimeFuelBurned.set(state.lifetimeFuelBurned);
        this.routesFlown.set(state.routesFlown);

        // Seed the milestones we can derive from the current agent so e.g.
        // "First Million" can unlock retroactively for an already-wealthy agent.
        if (agent) {
          this.recordCredits(agent.credits);
          this.markFactionMet(agent.faction);
        }
      });
    });
  }

  unlockData(): void {
    if (this.dataUnlocked()) return;
    this.dataUnlocked.set(true);
    this.persist();
    this.snackbar.show('Data terminal unlocked — supply chain online.', 'success', 4000);
  }

  unlockFactions(): void {
    if (this.factionsUnlocked()) return;
    this.factionsUnlocked.set(true);
    this.persist();
    this.snackbar.show('Faction registry unlocked.', 'success', 4000);
  }

  markSystemVisited(systemSymbol: string | null | undefined): void {
    if (this.addTo(this.systemsVisited, systemSymbol)) this.persist();
  }

  markWaypointType(type: string | null | undefined): void {
    if (this.addTo(this.waypointTypesSeen, type)) this.persist();
  }

  markFactionMet(symbol: string | null | undefined): void {
    if (this.addTo(this.factionsMet, symbol)) this.persist();
  }

  markGoodSeen(symbol: string | null | undefined): void {
    if (this.addTo(this.goodsSeen, symbol)) this.persist();
  }

  /** Track the highest credit balance ever observed for this agent. */
  recordCredits(credits: number | null | undefined): void {
    if (credits == null || !Number.isFinite(credits)) return;
    if (credits <= this.peakCredits()) return;
    this.peakCredits.set(credits);
    this.persist();
  }

  addRevenue(amount: number | null | undefined): void {
    if (!amount || amount <= 0) return;
    this.lifetimeRevenue.update((total) => total + amount);
    this.persist();
  }

  addFuelBurned(amount: number | null | undefined): void {
    if (!amount || amount <= 0) return;
    this.lifetimeFuelBurned.update((total) => total + amount);
    this.persist();
  }

  incrementRoutesFlown(): void {
    this.routesFlown.update((total) => total + 1);
    this.persist();
  }

  private addTo(target: WritableSignal<ReadonlySet<string>>, value: string | null | undefined): boolean {
    if (!value) return false;
    const current = target();
    if (current.has(value)) return false;
    const next = new Set(current);
    next.add(value);
    target.set(next);
    return true;
  }

  private persist(): void {
    const agent = this.agentStore.agent();
    if (!agent) return;
    const state: DiscoveryState = {
      data: this.dataUnlocked(),
      factions: this.factionsUnlocked(),
      systemsVisited: [...this.systemsVisited()],
      waypointTypesSeen: [...this.waypointTypesSeen()],
      factionsMet: [...this.factionsMet()],
      goodsSeen: [...this.goodsSeen()],
      peakCredits: this.peakCredits(),
      lifetimeRevenue: this.lifetimeRevenue(),
      lifetimeFuelBurned: this.lifetimeFuelBurned(),
      routesFlown: this.routesFlown(),
    };
    try {
      localStorage.setItem(this.key(agent.name), JSON.stringify(state));
    } catch {
      // Storage may be unavailable (private mode / quota); fail silently.
    }
  }

  private read(agentName: string): DiscoveryState {
    const base = emptyState();
    try {
      const raw = localStorage.getItem(this.key(agentName));
      if (!raw) return base;
      const parsed = JSON.parse(raw) as Partial<DiscoveryState>;
      return {
        data: parsed.data === true,
        factions: parsed.factions === true,
        systemsVisited: this.readArray(parsed.systemsVisited),
        waypointTypesSeen: this.readArray(parsed.waypointTypesSeen),
        factionsMet: this.readArray(parsed.factionsMet),
        goodsSeen: this.readArray(parsed.goodsSeen),
        peakCredits: this.readNumber(parsed.peakCredits),
        lifetimeRevenue: this.readNumber(parsed.lifetimeRevenue),
        lifetimeFuelBurned: this.readNumber(parsed.lifetimeFuelBurned),
        routesFlown: this.readNumber(parsed.routesFlown),
      };
    } catch {
      return base;
    }
  }

  private readArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  }

  private readNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private key(agentName: string): string {
    return `${STORAGE_PREFIX}${agentName}`;
  }
}
