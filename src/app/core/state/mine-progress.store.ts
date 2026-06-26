const STORAGE_KEY = 'sk_mine_progress';

export interface PlanetMineProgress {
  oresBroken: number;
  totalOres: number;
  brokenKeys: string[];
  lastVisit: number;
}

type MineProgressMap = Record<string, PlanetMineProgress>;

function readAll(): MineProgressMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MineProgressMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: MineProgressMap): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getMineProgress(planetName: string): PlanetMineProgress | null {
  return readAll()[planetName] ?? null;
}

export function initMineProgress(planetName: string, totalOres: number): PlanetMineProgress {
  const map = readAll();
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
  writeAll(map);
  return entry;
}

export function recordOreBroken(planetName: string, blockKey: string, totalOres: number): PlanetMineProgress {
  const map = readAll();
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
  writeAll(map);
  return entry;
}

export function mineProgressPercent(progress: PlanetMineProgress | null): number {
  if (!progress || progress.totalOres <= 0) return 0;
  return Math.round((progress.oresBroken / progress.totalOres) * 100);
}

export function isOreAlreadyBroken(planetName: string, blockKey: string): boolean {
  const p = getMineProgress(planetName);
  return p?.brokenKeys.includes(blockKey) ?? false;
}

export function clearMineProgressStorage(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
