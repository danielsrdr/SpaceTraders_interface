import { TestBed } from '@angular/core/testing';
import { AgentStore } from './agent.store';
import { NotificationStore } from './notification.store';

const AGENT = 'Notify-Pilot';
const STORAGE_KEY = `sk_notifications_${AGENT}`;

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

describe('NotificationStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AgentStore, NotificationStore],
    });
  });

  it('caps list at 100 entries', () => {
    setAgent();
    const store = TestBed.inject(NotificationStore);
    store.attach(AGENT);
    for (let i = 0; i < 105; i++) {
      store.push({ category: 'system', severity: 'info', title: `Entry ${i}` });
    }
    expect(store.entries()).toHaveLength(100);
    expect(store.entries()[0]?.title).toBe('Entry 5');
  });

  it('tracks unread until marked read', () => {
    setAgent();
    const store = TestBed.inject(NotificationStore);
    store.attach(AGENT);
    store.push({ category: 'arrival', severity: 'success', title: 'Ship arrived' });
    store.push({ category: 'trade', severity: 'info', title: 'Trade complete' });
    expect(store.unreadCount()).toBe(2);
    store.markAllRead();
    expect(store.unreadCount()).toBe(0);
  });

  it('persists entries per agent', () => {
    setAgent();
    const store = TestBed.inject(NotificationStore);
    store.attach(AGENT);
    store.push({ category: 'contract', severity: 'info', title: 'New contract' });

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)[0]?.title).toBe('New contract');
  });
});
