import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AgentStore } from './agent.store';

export interface SessionSnapshot {
  route: string;
  queryParams?: Record<string, string>;
  shipSymbol?: string;
  systemSymbol?: string;
  timestamp: number;
}

const STORAGE_PREFIX = 'sk_session_';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Routes that should not overwrite the resume snapshot. */
const IGNORED_ROUTES = new Set(['/login', '/register', '/home']);

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly agentStore = inject(AgentStore);

  readonly snapshot = signal<SessionSnapshot | null>(null);

  readonly hasValidSnapshot = computed(() => {
    const snap = this.snapshot();
    if (!snap) return false;
    return Date.now() - snap.timestamp < MAX_AGE_MS;
  });

  constructor() {
    effect(() => {
      const agent = this.agentStore.agent();
      this.snapshot.set(agent ? this.read(agent.name) : null);
    });
  }

  save(input: Omit<SessionSnapshot, 'timestamp'>): void {
    const agent = this.agentStore.agent();
    if (!agent) return;
    if (IGNORED_ROUTES.has(input.route)) return;

    const snap: SessionSnapshot = { ...input, timestamp: Date.now() };
    this.snapshot.set(snap);
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${agent.name}`, JSON.stringify(snap));
    } catch {
      // Quota or private mode — in-memory only.
    }
  }

  clear(): void {
    const agent = this.agentStore.agent();
    this.snapshot.set(null);
    if (!agent) return;
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${agent.name}`);
    } catch {
      // ignore
    }
  }

  private read(agentName: string): SessionSnapshot | null {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${agentName}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SessionSnapshot;
      if (!parsed?.route || !parsed.timestamp) return null;
      if (Date.now() - parsed.timestamp >= MAX_AGE_MS) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
