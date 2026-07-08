import { TestBed } from '@angular/core/testing';
import { AgentStore } from './agent.store';
import { OrderQueueStore } from './order-queue.store';
import { Order } from '../../features/automation/order.types';

const AGENT = 'Queue-Pilot';
const STORAGE_KEY = `sk_orders_${AGENT}`;

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

describe('OrderQueueStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AgentStore, OrderQueueStore],
    });
  });

  it('persists orders per ship and agent', () => {
    setAgent();
    const store = TestBed.inject(OrderQueueStore);
    const orders: Order[] = [{ kind: 'dock' }, { kind: 'refuel' }];
    store.setOrders('SHIP-1', orders);

    expect(store.state('SHIP-1').orders).toEqual(orders);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)['SHIP-1'].orders).toHaveLength(2);
  });

  it('downgrades running queues to paused on load', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        'SHIP-1': { orders: [], index: 0, status: 'running' },
      }),
    );
    TestBed.inject(OrderQueueStore);
    setAgent();
    TestBed.flushEffects();
    const store = TestBed.inject(OrderQueueStore);
    expect(store.state('SHIP-1').status).toBe('paused');
  });

  it('reports active ships when status is running', () => {
    setAgent();
    const store = TestBed.inject(OrderQueueStore);
    store.setOrders('SHIP-A', [{ kind: 'orbit' }]);
    store.setStatus('SHIP-A', 'running');
    store.setOrders('SHIP-B', [{ kind: 'dock' }]);
    store.setStatus('SHIP-B', 'idle');
    expect(store.activeShips()).toEqual(['SHIP-A']);
  });

  it('clear removes a ship queue', () => {
    setAgent();
    const store = TestBed.inject(OrderQueueStore);
    store.setOrders('SHIP-1', [{ kind: 'dock' }]);
    store.clear('SHIP-1');
    expect(store.state('SHIP-1').orders).toEqual([]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).not.toHaveProperty('SHIP-1');
  });
});
