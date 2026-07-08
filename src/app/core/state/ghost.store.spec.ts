import { TestBed } from '@angular/core/testing';
import { GhostCacheEntry, GhostStore } from './ghost.store';
import { ShipData } from '../../models/ship.model';

const STORAGE_KEY = 'sk_ghost_cache';

function minimalShip(symbol: string): ShipData {
  return {
    symbol,
    nav: {
      systemSymbol: 'X1-TEST',
      waypointSymbol: 'X1-TEST-1',
      status: 'IN_ORBIT',
      flightMode: 'CRUISE',
    },
    registration: { name: symbol, factionSymbol: 'COSMIC', role: 'FABRICATOR' },
    crew: { current: 1, capacity: 1, required: 1, morale: 100 },
    frame: {
      name: 'Frame',
      description: '',
      fuelCapacity: 100,
      condition: 100,
      requirements: { power: 1, crew: 1 },
    },
    reactor: {
      name: 'Reactor',
      description: '',
      condition: 100,
      powerOutput: 1,
      requirements: { crew: 1 },
    },
    fuel: { current: 50, capacity: 100, consumed: { amount: 0, timestamp: '' } },
  };
}

describe('GhostStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [GhostStore],
    });
  });

  it('persists cache to sessionStorage', () => {
    const store = TestBed.inject(GhostStore);
    const entry: GhostCacheEntry = {
      ships: [minimalShip('GHOST-1')],
      meta: { 'GHOST-1': { agentSymbol: 'OTHER', source: 'scan' } },
      fetchedAt: Date.now(),
    };
    store.set(entry);

    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as GhostCacheEntry;
    expect(parsed.ships[0]?.symbol).toBe('GHOST-1');
  });

  it('reloads cache from sessionStorage on construction', () => {
    const entry: GhostCacheEntry = {
      ships: [minimalShip('GHOST-2')],
      meta: {},
      fetchedAt: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));

    const store = TestBed.inject(GhostStore);
    expect(store.ships()[0]?.symbol).toBe('GHOST-2');
  });

  it('isFresh returns false when cache is older than TTL', () => {
    const store = TestBed.inject(GhostStore);
    store.set({
      ships: [],
      meta: {},
      fetchedAt: Date.now() - 6 * 60 * 1000,
    });
    expect(store.isFresh()).toBe(false);
  });

  it('isFresh returns true for a recent cache', () => {
    const store = TestBed.inject(GhostStore);
    store.set({
      ships: [],
      meta: {},
      fetchedAt: Date.now() - 60_000,
    });
    expect(store.isFresh()).toBe(true);
  });
});
