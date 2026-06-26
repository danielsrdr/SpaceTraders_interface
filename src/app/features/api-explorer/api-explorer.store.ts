import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AgentStore } from '../../core/state/agent.store';
import { ApiEndpointMeta } from '../../models/api-endpoints.data';

export interface ApiRequestRecord {
  id: string;
  timestamp: number;
  endpointKey: string;
  method: string;
  path: string;
  operationId: string;
  pathParams: Record<string, string>;
  query: Record<string, string>;
  body?: unknown;
  status: number;
  durationMs: number;
  response: unknown;
  error?: string;
  starred: boolean;
}

const MAX_HISTORY = 50;
const MAX_RESPONSE_BYTES = 32_000;
const STORAGE_PREFIX = 'sk_api_history_';

@Injectable({ providedIn: 'root' })
export class ApiExplorerStore {
  private readonly agentStore = inject(AgentStore);

  readonly history = signal<ApiRequestRecord[]>([]);
  readonly selectedId = signal<string | null>(null);

  readonly selectedRecord = computed(() => {
    const id = this.selectedId();
    if (!id) return null;
    return this.history().find((r) => r.id === id) ?? null;
  });

  constructor() {
    effect(() => {
      const agent = this.agentStore.agent();
      this.history.set(agent ? this.read(agent.name) : []);
      this.selectedId.set(null);
    });
  }

  add(record: Omit<ApiRequestRecord, 'id' | 'starred'> & { starred?: boolean }): ApiRequestRecord {
    const entry: ApiRequestRecord = {
      ...record,
      id: `${record.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      starred: record.starred ?? false,
      response: this.truncateResponse(record.response),
    };
    this.history.update((list) => [entry, ...list].slice(0, MAX_HISTORY));
    this.selectedId.set(entry.id);
    this.persist();
    return entry;
  }

  toggleStar(id: string): void {
    this.history.update((list) =>
      list.map((r) => (r.id === id ? { ...r, starred: !r.starred } : r)),
    );
    this.persist();
  }

  clearHistory(): void {
    this.history.set([]);
    this.selectedId.set(null);
    this.persist();
  }

  select(id: string | null): void {
    this.selectedId.set(id);
  }

  endpointKey(endpoint: ApiEndpointMeta): string {
    return `${endpoint.method}:${endpoint.path}`;
  }

  private truncateResponse(value: unknown): unknown {
    try {
      const json = JSON.stringify(value);
      if (json.length <= MAX_RESPONSE_BYTES) return value;
      return { _truncated: true, preview: json.slice(0, MAX_RESPONSE_BYTES) + '…' };
    } catch {
      return value;
    }
  }

  private persist(): void {
    const agent = this.agentStore.agent();
    if (!agent) return;
    try {
      localStorage.setItem(this.key(agent.name), JSON.stringify(this.history()));
    } catch {
      // ignore quota errors
    }
  }

  private read(agentName: string): ApiRequestRecord[] {
    try {
      const raw = localStorage.getItem(this.key(agentName));
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ApiRequestRecord[];
      return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
    } catch {
      return [];
    }
  }

  private key(agentName: string): string {
    return `${STORAGE_PREFIX}${agentName}`;
  }
}
