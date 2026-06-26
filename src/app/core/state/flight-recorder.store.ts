import { computed, Injectable, signal } from '@angular/core';
import { ShipData } from '../../models/ship.model';

export interface Voyage {
  id: number;
  ship: string;
  systemSymbol: string;
  originSymbol: string;
  destinationSymbol: string;
  /** Epoch ms. */
  departureTime: number;
  /** Epoch ms. */
  arrivalTime: number;
  /** Epoch ms when the voyage was captured. */
  recordedAt: number;
}

const MAX_VOYAGES = 60;
const STORAGE_PREFIX = 'st_flightrec_';

/**
 * Persistent "black box" flight recorder. Captures each completed voyage
 * (origin/destination + departure/arrival timestamps) so the deterministic
 * orbit engine can replay the trip later. Persisted per agent in localStorage,
 * mirroring the logbook store's lifecycle.
 */
@Injectable({ providedIn: 'root' })
export class FlightRecorderStore {
  readonly voyages = signal<Voyage[]>([]);
  readonly count = computed(() => this.voyages().length);

  private seq = 0;
  private agentKey: string | null = null;

  /** Most recent voyages first. */
  readonly recent = computed(() => [...this.voyages()].reverse());

  attach(agentSymbol: string): void {
    this.agentKey = agentSymbol;
    this.load();
  }

  detach(): void {
    this.agentKey = null;
    this.voyages.set([]);
  }

  /** Record a completed voyage from a ship that just left transit. */
  recordFromShip(ship: ShipData): void {
    const route = ship.nav.route;
    if (!route?.origin?.symbol || !route?.destination?.symbol) return;
    if (route.origin.symbol === route.destination.symbol) return;

    const departureTime = Date.parse(route.departureTime);
    const arrivalTime = Date.parse(route.arrival);
    if (!Number.isFinite(departureTime) || !Number.isFinite(arrivalTime)) return;

    // Skip duplicates: same ship + departure already recorded.
    const existing = this.voyages();
    if (
      existing.some(
        (v) => v.ship === ship.symbol && v.departureTime === departureTime,
      )
    ) {
      return;
    }

    const voyage: Voyage = {
      id: ++this.seq,
      ship: ship.symbol,
      systemSymbol: route.destination.systemSymbol ?? ship.nav.systemSymbol,
      originSymbol: route.origin.symbol,
      destinationSymbol: route.destination.symbol,
      departureTime,
      arrivalTime,
      recordedAt: Date.now(),
    };

    this.voyages.update((list) => [...list, voyage].slice(-MAX_VOYAGES));
    this.persist();
  }

  clear(): void {
    this.voyages.set([]);
    this.persist();
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
        this.voyages.set([]);
        this.seq = 0;
        return;
      }
      const parsed = JSON.parse(raw) as Voyage[];
      this.voyages.set(parsed);
      this.seq = parsed.reduce((max, v) => Math.max(max, v.id), 0);
    } catch {
      this.voyages.set([]);
      this.seq = 0;
    }
  }

  private persist(): void {
    const key = this.storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(this.voyages()));
    } catch {
      // localStorage may be unavailable or full; recorder stays in-memory.
    }
  }
}
