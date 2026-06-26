import { computed, inject, Injectable, signal } from '@angular/core';
import { AgentStore } from './agent.store';

export type NotificationCategory =
  | 'arrival'
  | 'contract'
  | 'achievement'
  | 'unlock'
  | 'trade'
  | 'system';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

export interface NotificationEntry {
  id: number;
  timestamp: number;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  read: boolean;
  route?: string;
}

const MAX_ENTRIES = 100;
const STORAGE_PREFIX = 'sk_notifications_';

@Injectable({ providedIn: 'root' })
export class NotificationStore {
  private readonly agentStore = inject(AgentStore);

  readonly entries = signal<NotificationEntry[]>([]);
  readonly unreadCount = computed(() => this.entries().filter((e) => !e.read).length);
  readonly entriesReversed = computed(() => [...this.entries()].reverse());

  private seq = 0;
  private agentKey: string | null = null;

  attach(agentName: string): void {
    this.agentKey = agentName;
    this.load(agentName);
  }

  detach(): void {
    this.agentKey = null;
    this.entries.set([]);
    this.seq = 0;
  }

  push(input: {
    category: NotificationCategory;
    severity: NotificationSeverity;
    title: string;
    body?: string;
    route?: string;
  }): void {
    const entry: NotificationEntry = {
      id: ++this.seq,
      timestamp: Date.now(),
      read: false,
      ...input,
    };
    this.entries.update((list) => {
      const next = [...list, entry];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
    this.persist();
  }

  markAllRead(): void {
    this.entries.update((list) => list.map((e) => ({ ...e, read: true })));
    this.persist();
  }

  private load(agentName: string): void {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${agentName}`);
      if (!raw) {
        this.entries.set([]);
        this.seq = 0;
        return;
      }
      const parsed = JSON.parse(raw) as NotificationEntry[];
      if (!Array.isArray(parsed)) {
        this.entries.set([]);
        return;
      }
      this.entries.set(parsed);
      this.seq = parsed.reduce((max, e) => Math.max(max, e.id), 0);
    } catch {
      this.entries.set([]);
    }
  }

  private persist(): void {
    const key = this.agentKey ?? this.agentStore.agent()?.name;
    if (!key) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(this.entries()));
    } catch {
      // ignore storage errors
    }
  }
}
