import { computed, inject, Injectable, signal } from '@angular/core';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';

export type LogCategory = 'extract' | 'siphon' | 'trade' | 'refuel' | 'contract' | 'navigate' | 'surface';

export interface LogEntryMeta {
  thumbnail?: string;
  contractId?: string;
  arcId?: string;
  directorLine?: string;
}

export interface LogEntry {
  id: number;
  timestamp: number;
  day: number | null;
  category: LogCategory;
  message: string;
  ship?: string;
  waypoint?: string;
  meta?: LogEntryMeta;
}

const MAX_ENTRIES = 200;
const STORAGE_PREFIX = 'st_logbook_';
const DAY_MS = 86_400_000;

/** Tailwind text color for a log category accent. */
export function logCategoryClass(category: LogCategory): string {
  switch (category) {
    case 'extract':
      return 'text-cyan-300';
    case 'siphon':
      return 'text-violet-300';
    case 'trade':
      return 'text-amber-300';
    case 'refuel':
      return 'text-sky-300';
    case 'contract':
      return 'text-emerald-300';
    case 'navigate':
      return 'text-slate-300';
    case 'surface':
      return 'text-lime-300';
    default: {
      const _exhaustive: never = category;
      void _exhaustive;
      return 'text-slate-300';
    }
  }
}

/**
 * Persistent ship's logbook. Records gameplay milestones (extraction, trade,
 * refuel, contracts) with an in-game "Day N" derived from the server reset date,
 * persisted to localStorage per agent.
 */
@Injectable({ providedIn: 'root' })
export class LogbookStore {
  private readonly api = inject(SpaceTradersApiService);

  readonly entries = signal<LogEntry[]>([]);
  readonly count = computed(() => this.entries().length);

  private seq = 0;
  private agentKey: string | null = null;
  private resetDate: number | null = null;

  /** Latest entries, oldest-first, capped to the last `n`. */
  recent(n: number): LogEntry[] {
    const list = this.entries();
    return list.slice(Math.max(0, list.length - n));
  }

  /** Load persisted entries for an agent and resolve the game day anchor. */
  async attach(agentSymbol: string): Promise<void> {
    this.agentKey = agentSymbol;
    this.load();
    await this.refreshResetDate();
  }

  /** Clear in-memory state on logout (persisted history is kept on disk). */
  detach(): void {
    this.agentKey = null;
    this.resetDate = null;
    this.entries.set([]);
  }

  append(input: {
    category: LogCategory;
    message: string;
    ship?: string;
    waypoint?: string;
    meta?: LogEntryMeta;
  }): void {
    const timestamp = Date.now();
    const entry: LogEntry = {
      id: ++this.seq,
      timestamp,
      day: this.dayFor(timestamp),
      category: input.category,
      message: input.message,
      ship: input.ship,
      waypoint: input.waypoint,
      meta: input.meta,
    };
    this.entries.update((list) => [...list, entry].slice(-MAX_ENTRIES));
    this.persist();
  }

  clear(): void {
    this.entries.set([]);
    this.persist();
  }

  /** "Day 12" when the reset anchor is known, otherwise a local date fallback. */
  formatDay(entry: LogEntry): string {
    const day = entry.day ?? this.dayFor(entry.timestamp);
    if (day !== null) return `Day ${day}`;
    return new Date(entry.timestamp).toLocaleDateString();
  }

  recordExtraction(
    category: 'extract' | 'siphon',
    ship: string,
    yieldSymbol: string,
    units: number,
    waypoint?: string,
  ): void {
    const verb = category === 'siphon' ? 'Siphoned' : 'Extracted';
    const where = waypoint ? ` at ${waypoint}` : '';
    this.append({ category, ship, waypoint, message: `${verb} ${units} ${yieldSymbol}${where}` });
  }

  recordTrade(
    mode: 'buy' | 'sell',
    ship: string,
    units: number,
    symbol: string,
    totalPrice: number | null,
    waypoint?: string,
  ): void {
    const verb = mode === 'buy' ? 'Bought' : 'Sold';
    const where = waypoint ? ` at ${waypoint}` : '';
    const price = totalPrice != null ? ` for ${totalPrice.toLocaleString()}c` : '';
    this.append({ category: 'trade', ship, waypoint, message: `${verb} ${units} ${symbol}${where}${price}` });
  }

  recordRefuel(
    ship: string,
    units: number | null,
    totalPrice: number | null,
    waypoint?: string,
  ): void {
    const where = waypoint ? ` at ${waypoint}` : '';
    const amount = units != null ? ` ${units}` : '';
    const price = totalPrice != null ? ` for ${totalPrice.toLocaleString()}c` : '';
    this.append({ category: 'refuel', ship, waypoint, message: `Refueled${amount} fuel${where}${price}` });
  }

  recordContract(message: string, waypoint?: string, meta?: LogEntryMeta): void {
    this.append({ category: 'contract', message, waypoint, meta });
  }

  recordSurfaceLand(planet: string, biomes: string[]): void {
    const biomeText = biomes.length ? ` — biomes: ${biomes.join(', ')}` : '';
    this.append({
      category: 'surface',
      waypoint: planet,
      message: `First footprint on ${planet}${biomeText}`,
    });
  }

  recordRuinsScan(planet: string): void {
    this.append({
      category: 'surface',
      waypoint: planet,
      message: `Artifact survey complete — ${planet}`,
    });
  }

  recordCaveMapped(planet: string, percent: number): void {
    this.append({
      category: 'surface',
      waypoint: planet,
      message: `Cave mapped — ${planet} (${percent}% structural scan)`,
    });
  }

  recordSurfaceStamp(planet: string, thumbnailDataUrl?: string): void {
    this.append({
      category: 'surface',
      waypoint: planet,
      message: `Postcard stamped — ${planet}`,
      meta: thumbnailDataUrl ? { thumbnail: thumbnailDataUrl } : undefined,
    });
  }

  recordSurfaceContract(message: string, waypoint?: string): void {
    this.append({ category: 'surface', message, waypoint });
  }

  private dayFor(timestamp: number): number | null {
    if (this.resetDate === null) return null;
    return Math.floor((timestamp - this.resetDate) / DAY_MS) + 1;
  }

  private async refreshResetDate(): Promise<void> {
    try {
      const status = await this.api.getStatus();
      const reset = new Date(status.resetDate).getTime();
      if (!Number.isFinite(reset)) return;
      this.resetDate = reset;
      let changed = false;
      this.entries.update((list) =>
        list.map((e) => {
          if (e.day !== null) return e;
          changed = true;
          return { ...e, day: this.dayFor(e.timestamp) };
        }),
      );
      if (changed) this.persist();
    } catch {
      // Status is optional; entries fall back to a local date label.
    }
  }

  private storageKey(): string | null {
    return this.agentKey ? `${STORAGE_PREFIX}${this.agentKey}` : null;
  }

  private load(): void {
    const key = this.storageKey();
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        this.entries.set([]);
        this.seq = 0;
        return;
      }
      const parsed = JSON.parse(raw) as LogEntry[];
      this.entries.set(parsed);
      this.seq = parsed.reduce((max, e) => Math.max(max, e.id), 0);
    } catch {
      this.entries.set([]);
      this.seq = 0;
    }
  }

  private persist(): void {
    const key = this.storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(this.entries()));
    } catch {
      // localStorage may be unavailable or full; logbook stays in-memory.
    }
  }
}
