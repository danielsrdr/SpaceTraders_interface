import { clearSurfaceDiscoveryStorage, SurfaceDiscoveryStore } from './surface-discovery.store';
import { AgentStore } from './agent.store';
import { TestBed } from '@angular/core/testing';

describe('SurfaceDiscoveryStore', () => {
  const AGENT = 'Test-Agent';

  beforeEach(() => {
    clearSurfaceDiscoveryStorage(AGENT);
    TestBed.configureTestingModule({});
  });

  it('persists planets landed per agent', () => {
    const agentStore = TestBed.inject(AgentStore);
    agentStore.setAgent({
      token: 't',
      name: AGENT,
      faction: 'COSMIC',
      credits: 0,
      hq: 'X1-TEST',
      ships_cpt: 1,
    });

    const store = TestBed.inject(SurfaceDiscoveryStore);
    store.markPlanetLanded('Alpha-7');
    expect(store.planetsLanded().has('Alpha-7')).toBe(true);

    const store2 = TestBed.inject(SurfaceDiscoveryStore);
    expect(store2.planetsLanded().has('Alpha-7')).toBe(true);
  });

  it('merges biomes without duplicates', () => {
    const agentStore = TestBed.inject(AgentStore);
    agentStore.setAgent({
      token: 't',
      name: AGENT,
      faction: 'COSMIC',
      credits: 0,
      hq: 'X1-TEST',
      ships_cpt: 1,
    });

    const store = TestBed.inject(SurfaceDiscoveryStore);
    store.markBiome('jungle');
    store.markBiome('jungle');
    store.markBiome('rocky');
    expect(store.biomesSeen().size).toBe(2);
  });

  it('tracks max mine percent per planet', () => {
    const agentStore = TestBed.inject(AgentStore);
    agentStore.setAgent({
      token: 't',
      name: AGENT,
      faction: 'COSMIC',
      credits: 0,
      hq: 'X1-TEST',
      ships_cpt: 1,
    });

    const store = TestBed.inject(SurfaceDiscoveryStore);
    store.recordMinePercent('Ore-Prime', 40);
    store.recordMinePercent('Ore-Prime', 25);
    store.recordMinePercent('Ore-Prime', 100);
    expect(store.getMinePercent('Ore-Prime')).toBe(100);
    expect(store.minesCompleted()).toBe(1);
  });
});
