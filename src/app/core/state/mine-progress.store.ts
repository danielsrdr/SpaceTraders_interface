const STORAGE_PREFIX = 'sk_mine_progress_';
const LEGACY_KEY = 'sk_mine_progress';

export interface PlanetMineProgress {
  oresBroken: number;
  totalOres: number;
  brokenKeys: string[];
  lastVisit: number;
}

type MineProgressMap = Record<string, PlanetMineProgress>;

function storageKey(agentName?: string | null): string {
  if (agentName) return `${STORAGE_PREFIX}${agentName}`;
  return LEGACY_KEY;
}

function readAll(agentName?: string | null): MineProgressMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey(agentName));
    if (raw) return JSON.parse(raw) as MineProgressMap;
    if (agentName) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) return JSON.parse(legacy) as MineProgressMap;
    }
    return {};
  } catch {
    return {};
  }
}

function writeAll(map: MineProgressMap, agentName?: string | null): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(storageKey(agentName), JSON.stringify(map));
}

export function getMineProgress(planetName: string, agentName?: string | null): PlanetMineProgress | null {
  return readAll(agentName)[planetName] ?? null;
}

export function initMineProgress(
  planetName: string,
  totalOres: number,
  agentName?: string | null,
): PlanetMineProgress {
  const map = readAll(agentName);
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
  writeAll(map, agentName);
  return entry;
}

export function recordOreBroken(
  planetName: string,
  blockKey: string,
  totalOres: number,
  agentName?: string | null,
): PlanetMineProgress {
  const map = readAll(agentName);
  const entry = map[planetName] ?? {
    oresBroken: 0,
    totalOres,
    brokenKeys: [],
    lastVisit: Date.now(),
  };
  if (!entry.brokenKeys.includes(blockKey)) {
    entry.brokenKeys.push(blockKey);
    entry.oresBroken = entry.brokenKeys.length;
  }
  entry.totalOres = totalOres;
  entry.lastVisit = Date.now();
  map[planetName] = entry;
  writeAll(map, agentName);
  return entry;
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
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(storageKey(agentName));
  if (!agentName) localStorage.removeItem(LEGACY_KEY);
}
