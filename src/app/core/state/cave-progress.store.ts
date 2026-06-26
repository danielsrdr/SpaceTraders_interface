const STORAGE_PREFIX = 'sk_cave_progress_';
const LEGACY_KEY = 'sk_cave_progress';

export interface PlanetCaveProgress {
  crystalsBroken: number;
  totalCrystals: number;
  brokenKeys: string[];
  lastVisit: number;
}

type CaveProgressMap = Record<string, PlanetCaveProgress>;

function storageKey(agentName?: string | null): string {
  if (agentName) return `${STORAGE_PREFIX}${agentName}`;
  return LEGACY_KEY;
}

function readAll(agentName?: string | null): CaveProgressMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey(agentName));
    if (raw) return JSON.parse(raw) as CaveProgressMap;
    if (agentName) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) return JSON.parse(legacy) as CaveProgressMap;
    }
    return {};
  } catch {
    return {};
  }
}

function writeAll(map: CaveProgressMap, agentName?: string | null): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(storageKey(agentName), JSON.stringify(map));
}

export function getCaveProgress(planetName: string, agentName?: string | null): PlanetCaveProgress | null {
  return readAll(agentName)[planetName] ?? null;
}

export function initCaveProgress(
  planetName: string,
  totalCrystals: number,
  agentName?: string | null,
): PlanetCaveProgress {
  const map = readAll(agentName);
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
  writeAll(map, agentName);
  return entry;
}

export function recordCrystalBroken(
  planetName: string,
  blockKey: string,
  totalCrystals: number,
  agentName?: string | null,
): PlanetCaveProgress {
  const map = readAll(agentName);
  const entry = map[planetName] ?? {
    crystalsBroken: 0,
    totalCrystals,
    brokenKeys: [],
    lastVisit: Date.now(),
  };
  if (!entry.brokenKeys.includes(blockKey)) {
    entry.brokenKeys.push(blockKey);
    entry.crystalsBroken = entry.brokenKeys.length;
  }
  entry.totalCrystals = totalCrystals;
  entry.lastVisit = Date.now();
  map[planetName] = entry;
  writeAll(map, agentName);
  return entry;
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
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(storageKey(agentName));
  if (!agentName) localStorage.removeItem(LEGACY_KEY);
}
