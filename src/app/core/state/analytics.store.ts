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

export interface WindowComparison {
  current: number;
  previous: number;
  deltaPct: number;
}

/** Compare metric over current window vs immediately preceding window of equal length. */
export function compareWindow(
  events: StatEvent[],
  windowHours: number,
  metricFn: (events: StatEvent[], hours: number, end: number) => number,
  now = Date.now(),
): WindowComparison {
  const current = metricFn(events, windowHours, now);
  const previousEnd = now - windowHours * HOUR_MS;
  const previous = metricFn(events, windowHours, previousEnd);
  const deltaPct = previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / Math.abs(previous)) * 100;
  return { current, previous, deltaPct };
}

export interface ShipRevenueStat {
  ship: string;
  net: number;
  sparkline: number[];
}

/** Net credits per ship with mini sparkline buckets over the window. */
export function computeRevenueByShip(
  events: StatEvent[],
  windowHours: number,
  bucketCount: number,
  now = Date.now(),
): ShipRevenueStat[] {
  const cutoff = windowHours > 0 ? now - windowHours * HOUR_MS : -Infinity;
  const ships = new Set<string>();
  for (const e of events) {
    if (e.t >= cutoff && e.t <= now) ships.add(e.ship);
  }
  const count = Math.max(1, bucketCount);
  const span = Math.max(1, windowHours) * HOUR_MS;
  const size = span / count;

  return [...ships]
    .map((ship) => {
      const shipEvents = events.filter((e) => e.ship === ship && e.t >= cutoff && e.t <= now);
      let net = 0;
      const buckets = Array.from({ length: count }, () => 0);
      for (const e of shipEvents) {
        if (e.credits != null) net += e.credits;
        let idx = Math.floor((e.t - (now - span)) / size);
        if (idx < 0) idx = 0;
        if (idx >= count) idx = count - 1;
        if (e.credits != null) buckets[idx] += e.credits;
      }
      return { ship, net, sparkline: buckets };
    })
    .sort((a, b) => b.net - a.net);
}

/** Fuel consumed per time bucket (for sparklines). */
export function computeFuelBuckets(
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
  const cutoff = windowHours > 0 ? start : -Infinity;
  for (const e of events) {
    if (e.kind !== 'navigate' || e.fuel == null || e.t < cutoff || e.t > now) continue;
    let idx = Math.floor((e.t - start) / size);
    if (idx < 0) idx = 0;
    if (idx >= count) idx = count - 1;
    buckets[idx]!.gross += e.fuel;
    buckets[idx]!.net += e.fuel;
  }
  return buckets;
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

  compareNetCredits(windowHours: number, now = Date.now()): WindowComparison {
    return compareWindow(this.events(), windowHours, computeNetCredits, now);
  }

  compareRevenuePerHour(windowHours: number, now = Date.now()): WindowComparison {
    return compareWindow(this.events(), windowHours, computeRevenuePerHour, now);
  }

  compareFuelBurned(windowHours: number, now = Date.now()): WindowComparison {
    return compareWindow(this.events(), windowHours, computeFuelBurned, now);
  }

  revenueByShip(windowHours: number, bucketCount: number, now = Date.now()): ShipRevenueStat[] {
    return computeRevenueByShip(this.events(), windowHours, bucketCount, now);
  }

  fuelBuckets(windowHours: number, bucketCount: number, now = Date.now()): RevenueBucket[] {
    return computeFuelBuckets(this.events(), windowHours, bucketCount, now);
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
