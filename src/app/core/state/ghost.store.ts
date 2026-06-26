import { Injectable, signal } from '@angular/core';
import { ShipData } from '../../models/ship.model';

export interface GhostMeta {
  agentSymbol: string;
  credits?: number;
  source: 'hq' | 'scan';
}

export interface GhostCacheEntry {
  ships: ShipData[];
  meta: Record<string, GhostMeta>;
  fetchedAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const STORAGE_KEY = 'sk_ghost_cache';

@Injectable({ providedIn: 'root' })
export class GhostStore {
  readonly ships = signal<ShipData[]>([]);
  readonly meta = signal<Record<string, GhostMeta>>({});

  private cache: GhostCacheEntry | null = null;

  constructor() {
    this.loadSession();
  }

  set(entry: GhostCacheEntry): void {
    this.cache = entry;
    this.ships.set(entry.ships);
    this.meta.set(entry.meta);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    } catch {
      // ignore
    }
  }

  isFresh(now = Date.now()): boolean {
    if (!this.cache) return false;
    return now - this.cache.fetchedAt < TTL_MS;
  }

  private loadSession(): void {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as GhostCacheEntry;
      if (!parsed?.ships) return;
      this.cache = parsed;
      this.ships.set(parsed.ships);
      this.meta.set(parsed.meta ?? {});
    } catch {
      // ignore
    }
  }
}
