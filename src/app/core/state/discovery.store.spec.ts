import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AgentStore } from './agent.store';
import { DiscoveryStore } from './discovery.store';
import { SnackbarService } from '../../shared/services/snackbar.service';

const AGENT = 'Discovery-Pilot';
const STORAGE_KEY = `sk_discovery_${AGENT}`;

function setAgent(credits = 500): void {
  TestBed.inject(AgentStore).setAgent({
    token: 't',
    name: AGENT,
    faction: 'COSMIC',
    credits,
    hq: 'X1-TEST',
    ships_cpt: 1,
  });
}

describe('DiscoveryStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        AgentStore,
        DiscoveryStore,
        { provide: SnackbarService, useValue: { show: vi.fn() } },
      ],
    });
  });

  it('persists visited systems without duplicates', () => {
    setAgent();
    const store = TestBed.inject(DiscoveryStore);
    store.markSystemVisited('X1-TEST');
    store.markSystemVisited('X1-TEST');
    store.markSystemVisited('X1-OTHER');
    expect(store.systemsVisited().size).toBe(2);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).systemsVisited).toEqual(['X1-TEST', 'X1-OTHER']);
  });

  it('seeds peak credits from agent on attach', () => {
    TestBed.inject(DiscoveryStore);
    setAgent(1200);
    TestBed.flushEffects();
    const store = TestBed.inject(DiscoveryStore);
    expect(store.peakCredits()).toBe(1200);
  });

  it('recordCredits only increases peak credits', () => {
    setAgent(100);
    const store = TestBed.inject(DiscoveryStore);
    store.recordCredits(50);
    store.recordCredits(200);
    expect(store.peakCredits()).toBe(200);
  });

  it('unlockData persists and is idempotent', () => {
    setAgent();
    const store = TestBed.inject(DiscoveryStore);
    const snackbar = TestBed.inject(SnackbarService) as { show: ReturnType<typeof vi.fn> };
    store.unlockData();
    store.unlockData();
    expect(store.dataUnlocked()).toBe(true);
    expect(snackbar.show).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).data).toBe(true);
  });

  it('accumulates lifetime revenue and routes', () => {
    setAgent();
    const store = TestBed.inject(DiscoveryStore);
    store.addRevenue(100);
    store.addRevenue(50);
    store.incrementRoutesFlown();
    expect(store.lifetimeRevenue()).toBe(150);
    expect(store.routesFlown()).toBe(1);
  });
});
