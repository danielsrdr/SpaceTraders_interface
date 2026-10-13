import { createProgressMapStorage, recordBlockBroken } from './progress-map.util';

const STORAGE_PREFIX = 'sk_cave_progress_';
const LEGACY_KEY = 'sk_cave_progress';

export interface PlanetCaveProgress {
  crystalsBroken: number;
  totalCrystals: number;
  brokenKeys: string[];
  lastVisit: number;
}

const storage = createProgressMapStorage<PlanetCaveProgress>(STORAGE_PREFIX, LEGACY_KEY);

export function getCaveProgress(
  planetName: string,
  agentName?: string | null,
): PlanetCaveProgress | null {
  return storage.read(agentName)[planetName] ?? null;
}

export function initCaveProgress(
  planetName: string,
  totalCrystals: number,
  agentName?: string | null,
): PlanetCaveProgress {
  const map = storage.read(agentName);
  const existing = map[planetName];
  if (existing && existing.totalCrystals === totalCrystals) {
    return existing;
  }
  const entry: PlanetCaveProgress = {
    crystalsBroken: existing?.crystalsBroken ?? 0,
    totalCrystals,
    brokenKeys: existing?.brokenKeys ?? [],
    lastVisit: Date.now(),
  };
  map[planetName] = entry;
  storage.write(map, agentName);
  return entry;
}

export function recordCrystalBroken(
  planetName: string,
  blockKey: string,
  totalCrystals: number,
  agentName?: string | null,
): PlanetCaveProgress {
  return recordBlockBroken(
    storage,
    'crystalsBroken',
    'totalCrystals',
    planetName,
    blockKey,
    totalCrystals,
    agentName,
  );
}

export function caveProgressPercent(progress: PlanetCaveProgress | null): number {
  if (!progress || progress.totalCrystals <= 0) return 0;
  return Math.round((progress.crystalsBroken / progress.totalCrystals) * 100);
}

export function isCrystalAlreadyBroken(
  planetName: string,
  blockKey: string,
  agentName?: string | null,
): boolean {
  const p = getCaveProgress(planetName, agentName);
  return p?.brokenKeys.includes(blockKey) ?? false;
}

export function clearCaveProgressStorage(agentName?: string | null): void {
  storage.clear(agentName);
}
