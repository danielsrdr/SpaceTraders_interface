import { effect, inject, Injectable, signal, untracked, WritableSignal } from '@angular/core';
import { AgentStore } from './agent.store';
import { WORLD_RADIUS } from '../../features/systems/three/terrain/terrain-height';

export const FOOTPRINT_CELL_SIZE = 8;

export interface SurfaceDiscoveryState {
  planetsLanded: string[];
  biomesSeen: string[];
  weatherSeen: string[];
  zonesEntered: string[];
  ruinsScanned: string[];
  cavesMapped: string[];
  maxMinePercent: Record<string, number>;
  maxCavePercent: Record<string, number>;
  maxExplorePercent: Record<string, number>;
  visitedCells: Record<string, string[]>;
  minesCompleted: number;
  cavesCompleted: number;
  planetsFullyMapped: number;
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
    cavesMapped: [],
    maxMinePercent: {},
    maxCavePercent: {},
    maxExplorePercent: {},
    visitedCells: {},
    minesCompleted: 0,
    cavesCompleted: 0,
    planetsFullyMapped: 0,
    totalOresBroken: 0,
    surfaceSupplyActions: 0,
  };
}

/** Walkable cell count within the surface disc (approximate). */
export function totalWalkableCells(): number {
  const cellsPerRadius = Math.ceil(WORLD_RADIUS / FOOTPRINT_CELL_SIZE);
  let count = 0;
  for (let cx = -cellsPerRadius; cx <= cellsPerRadius; cx++) {
    for (let cz = -cellsPerRadius; cz <= cellsPerRadius; cz++) {
      const centerX = (cx + 0.5) * FOOTPRINT_CELL_SIZE;
      const centerZ = (cz + 0.5) * FOOTPRINT_CELL_SIZE;
      if (Math.hypot(centerX, centerZ) <= WORLD_RADIUS) {
        count++;
      }
    }
  }
  return count;
}

export const TOTAL_WALKABLE_CELLS = totalWalkableCells();

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
  readonly cavesMapped = signal<ReadonlySet<string>>(new Set());
  readonly maxMinePercent = signal<Readonly<Record<string, number>>>({});
  readonly maxCavePercent = signal<Readonly<Record<string, number>>>({});
  readonly maxExplorePercent = signal<Readonly<Record<string, number>>>({});
  readonly visitedCells = signal<Readonly<Record<string, readonly string[]>>>({});
  readonly minesCompleted = signal(0);
  readonly cavesCompleted = signal(0);
  readonly planetsFullyMapped = signal(0);
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
        this.cavesMapped.set(new Set(state.cavesMapped));
        this.maxMinePercent.set({ ...state.maxMinePercent });
        this.maxCavePercent.set({ ...state.maxCavePercent });
        this.maxExplorePercent.set({ ...state.maxExplorePercent });
        this.visitedCells.set({ ...state.visitedCells });
        this.minesCompleted.set(state.minesCompleted);
        this.cavesCompleted.set(state.cavesCompleted);
        this.planetsFullyMapped.set(state.planetsFullyMapped);
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

  markCaveMapped(planetName: string | null | undefined): void {
    if (this.addTo(this.cavesMapped, planetName)) this.persist();
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

  recordCavePercent(planetName: string, percent: number): void {
    const agent = this.agentStore.agent();
    if (!agent) return;
    const map = { ...this.maxCavePercent() };
    const prev = map[planetName] ?? 0;
    const next = Math.max(prev, percent);
    if (next === prev) return;
    map[planetName] = next;
    this.maxCavePercent.set(map);
    if (prev < 80 && next >= 80) {
      this.cavesCompleted.update((n) => n + 1);
      this.markCaveMapped(planetName);
    }
    this.persist();
  }

  markVisitedCell(planetName: string, cx: number, cz: number): void {
    const agent = this.agentStore.agent();
    if (!agent) return;
    const key = `${cx},${cz}`;
    const all = { ...this.visitedCells() };
    const existing = all[planetName] ?? [];
    if (existing.includes(key)) return;
    const nextCells = [...existing, key];
    all[planetName] = nextCells;
    this.visitedCells.set(all);

    const pct = Math.round((nextCells.length / TOTAL_WALKABLE_CELLS) * 100);
    const exploreMap = { ...this.maxExplorePercent() };
    const prevExplore = exploreMap[planetName] ?? 0;
    const nextExplore = Math.max(prevExplore, pct);
    exploreMap[planetName] = nextExplore;
    this.maxExplorePercent.set(exploreMap);
    if (prevExplore < 70 && nextExplore >= 70) {
      this.planetsFullyMapped.update((n) => n + 1);
    }
    this.persist();
  }

  getMinePercent(planetName: string): number {
    return this.maxMinePercent()[planetName] ?? 0;
  }

  getCavePercent(planetName: string): number {
    return this.maxCavePercent()[planetName] ?? 0;
  }

  getExplorePercent(planetName: string): number {
    return this.maxExplorePercent()[planetName] ?? 0;
  }

  getVisitedCellsForPlanet(planetName: string): readonly string[] {
    return this.visitedCells()[planetName] ?? [];
  }

  /** Planets with explore percent >= threshold (for achievements). */
  countPlanetsAboveExploreThreshold(threshold: number): number {
    return Object.values(this.maxExplorePercent()).filter((p) => p >= threshold).length;
  }

  incrementOresBroken(): void {
    this.totalOresBroken.update((n) => n + 1);
    this.persist();
  }

  incrementSupplyAction(): void {
    this.surfaceSupplyActions.update((n) => n + 1);
    this.persist();
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
      cavesMapped: [...this.cavesMapped()],
      maxMinePercent: { ...this.maxMinePercent() },
      maxCavePercent: { ...this.maxCavePercent() },
      maxExplorePercent: { ...this.maxExplorePercent() },
      visitedCells: Object.fromEntries(
        Object.entries(this.visitedCells()).map(([k, v]) => [k, [...v]]),
      ),
      minesCompleted: this.minesCompleted(),
      cavesCompleted: this.cavesCompleted(),
      planetsFullyMapped: this.planetsFullyMapped(),
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
        cavesMapped: Array.isArray(parsed.cavesMapped) ? parsed.cavesMapped : [],
        maxMinePercent:
          parsed.maxMinePercent && typeof parsed.maxMinePercent === 'object'
            ? (parsed.maxMinePercent as Record<string, number>)
            : {},
        maxCavePercent:
          parsed.maxCavePercent && typeof parsed.maxCavePercent === 'object'
            ? (parsed.maxCavePercent as Record<string, number>)
            : {},
        maxExplorePercent:
          parsed.maxExplorePercent && typeof parsed.maxExplorePercent === 'object'
            ? (parsed.maxExplorePercent as Record<string, number>)
            : {},
        visitedCells:
          parsed.visitedCells && typeof parsed.visitedCells === 'object'
            ? (parsed.visitedCells as Record<string, string[]>)
            : {},
        minesCompleted: typeof parsed.minesCompleted === 'number' ? parsed.minesCompleted : 0,
        cavesCompleted: typeof parsed.cavesCompleted === 'number' ? parsed.cavesCompleted : 0,
        planetsFullyMapped:
          typeof parsed.planetsFullyMapped === 'number' ? parsed.planetsFullyMapped : 0,
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
