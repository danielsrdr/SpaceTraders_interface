/** Per-agent JSON-map persistence shared by the cave and mine progress stores. */
export interface ProgressMapStorage<T> {
  read(agentName?: string | null): Record<string, T>;
  write(map: Record<string, T>, agentName?: string | null): void;
  clear(agentName?: string | null): void;
}

export interface BlockProgress {
  brokenKeys: string[];
  lastVisit: number;
}

export function createProgressMapStorage<T>(
  prefix: string,
  legacyKey: string,
): ProgressMapStorage<T> {
  const storageKey = (agentName?: string | null): string =>
    agentName ? `${prefix}${agentName}` : legacyKey;

  return {
    read(agentName) {
      if (typeof localStorage === 'undefined') return {};
      try {
        const raw = localStorage.getItem(storageKey(agentName));
        if (raw) return JSON.parse(raw) as Record<string, T>;
        if (agentName) {
          const legacy = localStorage.getItem(legacyKey);
          if (legacy) return JSON.parse(legacy) as Record<string, T>;
        }
        return {};
      } catch {
        return {};
      }
    },
    write(map, agentName) {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(storageKey(agentName), JSON.stringify(map));
    },
    clear(agentName) {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem(storageKey(agentName));
      if (!agentName) localStorage.removeItem(legacyKey);
    },
  };
}

/**
 * Records a broken block for a planet; `countField`/`totalField` name the
 * store-specific counters. Mirrors the original per-store behaviour exactly.
 */
export function recordBlockBroken<T extends BlockProgress>(
  storage: ProgressMapStorage<T>,
  countField: keyof T & string,
  totalField: keyof T & string,
  planetName: string,
  blockKey: string,
  total: number,
  agentName?: string | null,
): T {
  const map = storage.read(agentName);
  const entry =
    map[planetName] ??
    ({
      [countField]: 0,
      [totalField]: total,
      brokenKeys: [],
      lastVisit: Date.now(),
    } as unknown as T);
  if (!entry.brokenKeys.includes(blockKey)) {
    entry.brokenKeys.push(blockKey);
    (entry as Record<string, unknown>)[countField] = entry.brokenKeys.length;
  }
  (entry as Record<string, unknown>)[totalField] = total;
  entry.lastVisit = Date.now();
  map[planetName] = entry;
  storage.write(map, agentName);
  return entry;
}
