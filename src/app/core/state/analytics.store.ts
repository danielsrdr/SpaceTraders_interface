import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AgentStore } from './agent.store';

export type StatEventKind = 'sell' | 'buy' | 'refuel' | 'navigate' | 'contract' | 'extract';

/**
 * A single quantitative gameplay event. `credits` is a signed delta (positive
 * for income such as sells/contracts, negative for spend such as buys/refuel);
 * `fuel` is units consumed (navigate) or purchased (refuel).
 */
export interface StatEvent {
  t: number;
  ship: string;
  kind: StatEventKind;
  credits?: number;
  fuel?: number;
  origin?: string;
  destination?: string;
  good?: string;
  units?: number;
}

export interface RevenueBucket {
  start: number;
  gross: number;
  net: number;
}

export interface RouteStat {
  key: string;
  origin: string;
  destination: string;
  count: number;
  fuel: number;
}

export interface ShipFuelStat {
  ship: string;
  fuel: number;
}

const HOUR_MS = 3_600_000;
const STORAGE_PREFIX = 'sk_analytics_';
const MAX_EVENTS = 1000;
const MAX_AGE_MS = 7 * 24 * HOUR_MS;

// ---------------------------------------------------------------------------
// Pure selectors (unit-tested in isolation from Angular / storage).
// ---------------------------------------------------------------------------

/** Income (positive credit deltas) per hour over the trailing window. */
export function computeRevenuePerHour(events: StatEvent[], windowHours: number, now = Date.now()): number {
  if (windowHours <= 0) return 0;
  const cutoff = now - windowHours * HOUR_MS;
  let gross = 0;
  for (const e of events) {
    if (e.credits != null && e.credits > 0 && e.t >= cutoff && e.t <= now) gross += e.credits;
  }
  return gross / windowHours;
}

/** Net credit change (income minus spend) over the window (all-time when <= 0). */
export function computeNetCredits(events: StatEvent[], windowHours: number, now = Date.now()): number {
  const cutoff = windowHours > 0 ? now - windowHours * HOUR_MS : -Infinity;
  let net = 0;
  for (const e of events) {
    if (e.credits != null && e.t >= cutoff && e.t <= now) net += e.credits;
  }
  return net;
}

/** Bucketed revenue for a time-series chart over the trailing window. */
export function computeRevenueBuckets(
  events: StatEvent[],
  windowHours: number,
  bucketCount: number,
  now = Date.now(),
): RevenueBucket[] {
  const count = Math.max(1, bucketCount);
  const span = Math.max(1, windowHours) * HOUR_MS;
  const start = now - span;
  const size = span / count;
  const buckets: RevenueBucket[] = Array.from({ length: count }, (_, i) => ({
    start: start + i * size,
    gross: 0,
    net: 0,
  }));
  for (const e of events) {
    if (e.credits == null || e.t < start || e.t > now) continue;
    let idx = Math.floor((e.t - start) / size);
    if (idx < 0) idx = 0;
    if (idx >= count) idx = count - 1;
    const bucket = buckets[idx]!;
    if (e.credits > 0) bucket.gross += e.credits;
    bucket.net += e.credits;
  }
  return buckets;
}

/** Total fuel consumed by navigation over the window (all-time when <= 0). */
export function computeFuelBurned(events: StatEvent[], windowHours: number, now = Date.now()): number {
  const cutoff = windowHours > 0 ? now - windowHours * HOUR_MS : -Infinity;
  let fuel = 0;
  for (const e of events) {
    if (e.kind === 'navigate' && e.fuel != null && e.t >= cutoff && e.t <= now) fuel += e.fuel;
  }
  return fuel;
}

/** Fuel consumed per ship, highest first. */
export function computeFuelByShip(events: StatEvent[], windowHours: number, now = Date.now()): ShipFuelStat[] {
  const cutoff = windowHours > 0 ? now - windowHours * HOUR_MS : -Infinity;
  const totals = new Map<string, number>();
  for (const e of events) {
    if (e.kind !== 'navigate' || e.fuel == null || e.t < cutoff || e.t > now) continue;
    totals.set(e.ship, (totals.get(e.ship) ?? 0) + e.fuel);
  }
  return [...totals.entries()]
    .map(([ship, fuel]) => ({ ship, fuel }))
    .sort((a, b) => b.fuel - a.fuel);
}

/** Most-flown origin -> destination pairs, most frequent first. */
export function computeTopRoutes(
  events: StatEvent[],
  limit: number,
  windowHours: number,
  now = Date.now(),
): RouteStat[] {
  const cutoff = windowHours > 0 ? now - windowHours * HOUR_MS : -Infinity;
  const routes = new Map<string, RouteStat>();
  for (const e of events) {
    if (e.kind !== 'navigate' || !e.origin || !e.destination || e.t < cutoff || e.t > now) continue;
    const key = `${e.origin}>${e.destination}`;
    const current = routes.get(key) ?? {
      key,
      origin: e.origin,
      destination: e.destination,
      count: 0,
      fuel: 0,
    };
    current.count += 1;
    current.fuel += e.fuel ?? 0;
    routes.set(key, current);
  }
  return [...routes.values()]
    .sort((a, b) => b.count - a.count || b.fuel - a.fuel)
    .slice(0, Math.max(0, limit));
}

/**
 * Per-agent rolling ledger of quantitative gameplay events. Powers the fleet
 * analytics dashboard. Persisted to localStorage, capped by count and age so it
 * never grows unbounded (mirrors the logbook's bounded history).
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsStore {
  private readonly agentStore = inject(AgentStore);

  readonly events = signal<StatEvent[]>([]);
  readonly totalEvents = computed(() => this.events().length);

  constructor() {
    effect(() => {
      const agent = this.agentStore.agent();
      this.events.set(agent ? this.read(agent.name) : []);
    });
  }

  record(event: StatEvent): void {
    this.events.update((list) => this.prune([...list, event]));
    this.persist();
  }

  clear(): void {
    this.events.set([]);
    this.persist();
  }

  revenuePerHour(windowHours: number, now = Date.now()): number {
    return computeRevenuePerHour(this.events(), windowHours, now);
  }

  netCredits(windowHours: number, now = Date.now()): number {
    return computeNetCredits(this.events(), windowHours, now);
  }

  revenueBuckets(windowHours: number, bucketCount: number, now = Date.now()): RevenueBucket[] {
    return computeRevenueBuckets(this.events(), windowHours, bucketCount, now);
  }

  fuelBurned(windowHours: number, now = Date.now()): number {
    return computeFuelBurned(this.events(), windowHours, now);
  }

  fuelByShip(windowHours: number, now = Date.now()): ShipFuelStat[] {
    return computeFuelByShip(this.events(), windowHours, now);
  }

  topRoutes(limit: number, windowHours: number, now = Date.now()): RouteStat[] {
    return computeTopRoutes(this.events(), limit, windowHours, now);
  }

  private prune(list: StatEvent[]): StatEvent[] {
    const cutoff = Date.now() - MAX_AGE_MS;
    const recent = list.filter((e) => e.t >= cutoff);
    return recent.length > MAX_EVENTS ? recent.slice(recent.length - MAX_EVENTS) : recent;
  }

  private persist(): void {
    const agent = this.agentStore.agent();
    if (!agent) return;
    try {
      localStorage.setItem(this.key(agent.name), JSON.stringify(this.events()));
    } catch {
      // Storage may be unavailable (private mode / quota); fail silently.
    }
  }

  private read(agentName: string): StatEvent[] {
    try {
      const raw = localStorage.getItem(this.key(agentName));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as StatEvent[];
      return Array.isArray(parsed) ? this.prune(parsed) : [];
    } catch {
      return [];
    }
  }

  private key(agentName: string): string {
    return `${STORAGE_PREFIX}${agentName}`;
  }
}
