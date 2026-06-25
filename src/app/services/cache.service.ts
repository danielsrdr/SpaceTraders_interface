import { inject, Injectable } from '@angular/core';
import {
  defaultSpaceTradersConfig,
  SPACETRADERS_CONFIG,
} from '../core/config/spacetraders.config';
import { PersistentCacheService } from './persistent-cache.service';
import { OnlineStatusService } from '../shared/services/online-status.service';

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
  category: string;
}

@Injectable({ providedIn: 'root' })
export class CacheService {
  private readonly config = inject(SPACETRADERS_CONFIG);
  private readonly persistent = inject(PersistentCacheService);
  private readonly onlineStatus = inject(OnlineStatusService);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly stats = { hits: 0, misses: 0, sets: 0, invalidations: 0 };

  constructor() {
    setInterval(() => this.cleanup(), 300000);
    void this.hydrate();
  }

  /** Load persisted entries from IndexedDB into the in-memory map on startup. */
  private async hydrate(): Promise<void> {
    const entries = await this.persistent.loadAll();
    for (const e of entries) {
      // Don't clobber fresher entries written during the session.
      if (!this.cache.has(e.key)) {
        this.cache.set(e.key, { data: e.data, timestamp: e.timestamp, ttl: e.ttl, category: e.category });
      }
    }
  }

  generateKey(category: string, ...identifiers: string[]): string {
    return `${category}:${identifiers.join(':')}`;
  }

  set(key: string, data: unknown, category = 'default', customTTL?: number): void {
    const ttl = customTTL ?? this.config.cacheTTL[category] ?? this.config.cacheTTL['default'];
    const timestamp = Date.now();
    this.cache.set(key, { data, timestamp, ttl, category });
    this.stats.sets++;
    void this.persistent.put({ key, data, timestamp, ttl, category });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    if (Date.now() - entry.timestamp > entry.ttl) {
      // Offline: serve stale data so explored systems/markets remain browsable.
      if (!this.onlineStatus.isOnline()) {
        this.stats.hits++;
        return entry.data as T;
      }
      this.cache.delete(key);
      void this.persistent.delete(key);
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return entry.data as T;
  }

  invalidate(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        void this.persistent.delete(key);
        this.stats.invalidations++;
      }
    }
  }

  clear(): void {
    this.cache.clear();
    void this.persistent.clear();
    this.stats.invalidations++;
  }

  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: total > 0 ? `${((this.stats.hits / total) * 100).toFixed(2)}%` : '0%',
    };
  }
}

export function provideSpaceTradersConfig() {
  return { provide: SPACETRADERS_CONFIG, useValue: defaultSpaceTradersConfig };
}
