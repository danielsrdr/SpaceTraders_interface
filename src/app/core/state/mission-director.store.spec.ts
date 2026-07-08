import { TestBed } from '@angular/core/testing';
import { AgentStore } from './agent.store';
import { MissionDirectorStore } from './mission-director.store';
import { CompletedOperation } from '../../features/mission-director/mission-director.models';

const AGENT = 'Director-Pilot';
const STORAGE_KEY = `sk_director_${AGENT}`;

function setAgent(): void {
  TestBed.inject(AgentStore).setAgent({
    token: 't',
    name: AGENT,
    faction: 'COSMIC',
    credits: 0,
    hq: 'X1-TEST',
    ships_cpt: 1,
  });
}

function sampleOperation(id: string): CompletedOperation {
  return {
    contractId: id,
    factionSymbol: 'COSMIC',
    contractType: 'DELIVERY',
    briefingTitle: 'Brief',
    debrief: 'Done',
    fulfilledAt: Date.now(),
  };
}

describe('MissionDirectorStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AgentStore, MissionDirectorStore],
    });
  });

  it('addPoints updates standing tier and contract counts', () => {
    setAgent();
    const store = TestBed.inject(MissionDirectorStore);
    store.addPoints('cosmic', 15, 'accept');
    store.addPoints('COSMIC', 70, 'fulfill');

    const standing = store.standing('COSMIC');
    expect(standing.points).toBe(85);
    expect(standing.tier).toBe('trusted');
    expect(standing.contractsAccepted).toBe(1);
    expect(standing.contractsFulfilled).toBe(1);
  });

  it('completeArc clears active arc and persists', () => {
    setAgent();
    const store = TestBed.inject(MissionDirectorStore);
    store.setActiveArc('arc-1');
    store.completeArc('arc-1');
    expect(store.activeArcId()).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).completedArcs).toContain('arc-1');
  });

  it('recordOperation caps history at 50 entries', () => {
    setAgent();
    const store = TestBed.inject(MissionDirectorStore);
    for (let i = 0; i < 55; i++) {
      store.recordOperation(sampleOperation(`c-${i}`));
    }
    expect(store.operations()).toHaveLength(50);
    expect(store.operations()[0]?.contractId).toBe('c-5');
  });

  it('recentOperations returns newest first', () => {
    setAgent();
    const store = TestBed.inject(MissionDirectorStore);
    store.recordOperation(sampleOperation('older'));
    store.recordOperation(sampleOperation('newer'));
    expect(store.recentOperations(1)[0]?.contractId).toBe('newer');
  });
});
