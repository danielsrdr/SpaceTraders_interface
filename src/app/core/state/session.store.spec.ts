import { TestBed } from '@angular/core/testing';
import { AgentStore } from './agent.store';
import { SessionStore } from './session.store';

const AGENT = 'Session-Pilot';
const STORAGE_KEY = `sk_session_${AGENT}`;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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

describe('SessionStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AgentStore, SessionStore],
    });
  });

  it('persists snapshot to localStorage', () => {
    setAgent();
    const store = TestBed.inject(SessionStore);
    store.save({ route: '/systems', queryParams: { name: 'X1-Y1' } });

    const loaded = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(loaded.route).toBe('/systems');
    expect(store.hasValidSnapshot()).toBe(true);
  });

  it('ignores login and home routes', () => {
    setAgent();
    const store = TestBed.inject(SessionStore);
    store.save({ route: '/login' });
    store.save({ route: '/home' });
    expect(store.snapshot()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('rejects expired snapshots on load', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        route: '/contracts',
        timestamp: Date.now() - MAX_AGE_MS - 1,
      }),
    );
    setAgent();
    const store = TestBed.inject(SessionStore);
    expect(store.snapshot()).toBeNull();
    expect(store.hasValidSnapshot()).toBe(false);
  });

  it('clear removes persisted snapshot', () => {
    setAgent();
    const store = TestBed.inject(SessionStore);
    store.save({ route: '/systems' });
    store.clear();
    expect(store.snapshot()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
