import { inject, Injectable } from '@angular/core';
import {
  defaultSpaceTradersConfig,
  SPACETRADERS_CONFIG,
} from '../core/config/spacetraders.config';

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
  category: string;
}

@Injectable({ providedIn: 'root' })
export class CacheService {
  private readonly config = inject(SPACETRADERS_CONFIG);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly stats = { hits: 0, misses: 0, sets: 0, invalidations: 0 };

  constructor() {
    setInterval(() => this.cleanup(), 300000);
  }

  generateKey(category: string, ...identifiers: string[]): string {
    return `${category}:${identifiers.join(':')}`;
  }

  set(key: string, data: unknown, category = 'default', customTTL?: number): void {
    const ttl = customTTL ?? this.config.cacheTTL[category] ?? this.config.cacheTTL['default'];
    this.cache.set(key, { data, timestamp: Date.now(), ttl, category });
    this.stats.sets++;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
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
        this.stats.invalidations++;
      }
    }
  }

  clear(): void {
    this.cache.clear();
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
