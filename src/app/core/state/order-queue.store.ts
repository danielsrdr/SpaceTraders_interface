import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AgentStore } from './agent.store';
import { Order, RunStatus } from '../../features/automation/order.types';

export interface ShipQueueState {
  orders: Order[];
  /** Pointer to the order currently executing / about to execute. */
  index: number;
  status: RunStatus;
  /** Last status / error message for display. */
  message?: string;
}

const STORAGE_PREFIX = 'sk_orders_';

function emptyState(): ShipQueueState {
  return { orders: [], index: 0, status: 'idle' };
}

/**
 * Per-ship automation order queues, persisted per agent. The runner reads and
 * advances these; the UI binds to them reactively. A 'running' status is
 * downgraded to 'paused' on load since no runner survives a reload.
 */
@Injectable({ providedIn: 'root' })
export class OrderQueueStore {
  private readonly agentStore = inject(AgentStore);

  readonly queues = signal<Record<string, ShipQueueState>>({});

  readonly activeShips = computed(() =>
    Object.entries(this.queues())
      .filter(([, q]) => q.status === 'running')
      .map(([symbol]) => symbol),
  );

  constructor() {
    effect(() => {
      const agent = this.agentStore.agent();
      this.queues.set(agent ? this.read(agent.name) : {});
    });
  }

  state(shipSymbol: string): ShipQueueState {
    return this.queues()[shipSymbol] ?? emptyState();
  }

  setOrders(shipSymbol: string, orders: Order[]): void {
    this.patch(shipSymbol, { orders, index: 0, status: 'idle', message: undefined });
  }

  setStatus(shipSymbol: string, status: RunStatus, message?: string): void {
    this.patch(shipSymbol, { status, message });
  }

  setIndex(shipSymbol: string, index: number): void {
    this.patch(shipSymbol, { index });
  }

  clear(shipSymbol: string): void {
    this.queues.update((all) => {
      const next = { ...all };
      delete next[shipSymbol];
      return next;
    });
    this.persist();
  }

  private patch(shipSymbol: string, partial: Partial<ShipQueueState>): void {
    this.queues.update((all) => {
      const prev = all[shipSymbol] ?? emptyState();
      return { ...all, [shipSymbol]: { ...prev, ...partial } };
    });
    this.persist();
  }

  private persist(): void {
    const agent = this.agentStore.agent();
    if (!agent) return;
    try {
      localStorage.setItem(this.key(agent.name), JSON.stringify(this.queues()));
    } catch {
      // Storage may be unavailable (private mode / quota); fail silently.
    }
  }

  private read(agentName: string): Record<string, ShipQueueState> {
    try {
      const raw = localStorage.getItem(this.key(agentName));
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, ShipQueueState>;
      // No runner survives a reload — downgrade any "running" queue to paused.
      for (const q of Object.values(parsed)) {
        if (q.status === 'running') q.status = 'paused';
      }
      return parsed;
    } catch {
      return {};
    }
  }

  private key(agentName: string): string {
    return `${STORAGE_PREFIX}${agentName}`;
  }
}
