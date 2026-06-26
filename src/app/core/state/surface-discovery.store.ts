import { effect, inject, Injectable, signal, untracked, WritableSignal } from '@angular/core';
import { AgentStore } from './agent.store';

export interface SurfaceDiscoveryState {
  planetsLanded: string[];
  biomesSeen: string[];
  weatherSeen: string[];
  zonesEntered: string[];
  ruinsScanned: string[];
  maxMinePercent: Record<string, number>;
  minesCompleted: number;
  totalOresBroken: number;
  surfaceSupplyActions: number;
}

const STORAGE_PREFIX = 'sk_surface_discovery_';

function emptyState(): SurfaceDiscoveryState {
  return {
    planetsLanded: [],
    biomesSeen: [],
    weatherSeen: [],
    zonesEntered: [],
    ruinsScanned: [],
    maxMinePercent: {},
    minesCompleted: 0,
    totalOresBroken: 0,
    surfaceSupplyActions: 0,
  };
}

/**
 * Per-agent surface exploration progress for codex and achievements.
 */
@Injectable({ providedIn: 'root' })
export class SurfaceDiscoveryStore {
  private readonly agentStore = inject(AgentStore);

  readonly planetsLanded = signal<ReadonlySet<string>>(new Set());
  readonly biomesSeen = signal<ReadonlySet<string>>(new Set());
  readonly weatherSeen = signal<ReadonlySet<string>>(new Set());
  readonly zonesEntered = signal<ReadonlySet<string>>(new Set());
  readonly ruinsScanned = signal<ReadonlySet<string>>(new Set());
  readonly maxMinePercent = signal<Readonly<Record<string, number>>>({});
  readonly minesCompleted = signal(0);
  readonly totalOresBroken = signal(0);
  readonly surfaceSupplyActions = signal(0);

  constructor() {
    effect(() => {
      const agent = this.agentStore.agent();
      untracked(() => {
        const state = agent ? this.read(agent.name) : emptyState();
        this.planetsLanded.set(new Set(state.planetsLanded));
        this.biomesSeen.set(new Set(state.biomesSeen));
        this.weatherSeen.set(new Set(state.weatherSeen));
        this.zonesEntered.set(new Set(state.zonesEntered));
        this.ruinsScanned.set(new Set(state.ruinsScanned));
        this.maxMinePercent.set({ ...state.maxMinePercent });
        this.minesCompleted.set(state.minesCompleted);
        this.totalOresBroken.set(state.totalOresBroken);
        this.surfaceSupplyActions.set(state.surfaceSupplyActions);
      });
    });
  }

  markPlanetLanded(planetName: string | null | undefined): void {
    if (this.addTo(this.planetsLanded, planetName)) this.persist();
  }

  markBiome(biome: string | null | undefined): void {
    if (this.addTo(this.biomesSeen, biome)) this.persist();
  }

  markWeather(kind: string | null | undefined): void {
    if (this.addTo(this.weatherSeen, kind)) this.persist();
  }

  markZone(kind: string | null | undefined): void {
    if (this.addTo(this.zonesEntered, kind)) this.persist();
  }

  markRuinsScanned(planetName: string | null | undefined): void {
    if (this.addTo(this.ruinsScanned, planetName)) this.persist();
  }

  recordMinePercent(planetName: string, percent: number): void {
    const agent = this.agentStore.agent();
    if (!agent) return;
    const map = { ...this.maxMinePercent() };
    const prev = map[planetName] ?? 0;
    const next = Math.max(prev, percent);
    if (next === prev) return;
    map[planetName] = next;
    this.maxMinePercent.set(map);
    if (prev < 100 && next >= 100) {
      this.minesCompleted.update((n) => n + 1);
    }
    this.persist();
  }

  incrementOresBroken(): void {
    this.totalOresBroken.update((n) => n + 1);
    this.persist();
  }

  incrementSupplyAction(): void {
    this.surfaceSupplyActions.update((n) => n + 1);
    this.persist();
  }

  getMinePercent(planetName: string): number {
    return this.maxMinePercent()[planetName] ?? 0;
  }

  private addTo(setSig: WritableSignal<ReadonlySet<string>>, value: string | null | undefined): boolean {
    if (!value) return false;
    const current = setSig();
    if (current.has(value)) return false;
    const next = new Set(current);
    next.add(value);
    setSig.set(next);
    return true;
  }

  private persist(): void {
    const agent = this.agentStore.agent();
    if (!agent) return;
    const state: SurfaceDiscoveryState = {
      planetsLanded: [...this.planetsLanded()],
      biomesSeen: [...this.biomesSeen()],
      weatherSeen: [...this.weatherSeen()],
      zonesEntered: [...this.zonesEntered()],
      ruinsScanned: [...this.ruinsScanned()],
      maxMinePercent: { ...this.maxMinePercent() },
      minesCompleted: this.minesCompleted(),
      totalOresBroken: this.totalOresBroken(),
      surfaceSupplyActions: this.surfaceSupplyActions(),
    };
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${agent.name}`, JSON.stringify(state));
    } catch {
      // Storage unavailable.
    }
  }

  private read(agentName: string): SurfaceDiscoveryState {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${agentName}`);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw) as Partial<SurfaceDiscoveryState>;
      return {
        planetsLanded: Array.isArray(parsed.planetsLanded) ? parsed.planetsLanded : [],
        biomesSeen: Array.isArray(parsed.biomesSeen) ? parsed.biomesSeen : [],
        weatherSeen: Array.isArray(parsed.weatherSeen) ? parsed.weatherSeen : [],
        zonesEntered: Array.isArray(parsed.zonesEntered) ? parsed.zonesEntered : [],
        ruinsScanned: Array.isArray(parsed.ruinsScanned) ? parsed.ruinsScanned : [],
        maxMinePercent:
          parsed.maxMinePercent && typeof parsed.maxMinePercent === 'object'
            ? (parsed.maxMinePercent as Record<string, number>)
            : {},
        minesCompleted: typeof parsed.minesCompleted === 'number' ? parsed.minesCompleted : 0,
        totalOresBroken: typeof parsed.totalOresBroken === 'number' ? parsed.totalOresBroken : 0,
        surfaceSupplyActions:
          typeof parsed.surfaceSupplyActions === 'number' ? parsed.surfaceSupplyActions : 0,
      };
    } catch {
      return emptyState();
    }
  }
}

/** Test helper — clears surface discovery storage for an agent. */
export function clearSurfaceDiscoveryStorage(agentName: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(`${STORAGE_PREFIX}${agentName}`);
}
