import { createProgressMapStorage, recordBlockBroken } from './progress-map.util';

const STORAGE_PREFIX = 'sk_mine_progress_';
const LEGACY_KEY = 'sk_mine_progress';

export interface PlanetMineProgress {
  oresBroken: number;
  totalOres: number;
  brokenKeys: string[];
  lastVisit: number;
}

const storage = createProgressMapStorage<PlanetMineProgress>(STORAGE_PREFIX, LEGACY_KEY);

export function getMineProgress(
  planetName: string,
  agentName?: string | null,
): PlanetMineProgress | null {
  return storage.read(agentName)[planetName] ?? null;
}

export function initMineProgress(
  planetName: string,
  totalOres: number,
  agentName?: string | null,
): PlanetMineProgress {
  const map = storage.read(agentName);
  const existing = map[planetName];
  if (existing && existing.totalOres === totalOres) {
    return existing;
  }
  const entry: PlanetMineProgress = {
    oresBroken: existing?.oresBroken ?? 0,
    totalOres,
    brokenKeys: existing?.brokenKeys ?? [],
    lastVisit: Date.now(),
  };
  map[planetName] = entry;
  storage.write(map, agentName);
  return entry;
}

export function recordOreBroken(
  planetName: string,
  blockKey: string,
  totalOres: number,
  agentName?: string | null,
): PlanetMineProgress {
  return recordBlockBroken(
    storage,
    'oresBroken',
    'totalOres',
    planetName,
    blockKey,
    totalOres,
    agentName,
  );
}

export function mineProgressPercent(progress: PlanetMineProgress | null): number {
  if (!progress || progress.totalOres <= 0) return 0;
  return Math.round((progress.oresBroken / progress.totalOres) * 100);
}

export function isOreAlreadyBroken(
  planetName: string,
  blockKey: string,
  agentName?: string | null,
): boolean {
  const p = getMineProgress(planetName, agentName);
  return p?.brokenKeys.includes(blockKey) ?? false;
}

export function clearMineProgressStorage(agentName?: string | null): void {
  storage.clear(agentName);
}
