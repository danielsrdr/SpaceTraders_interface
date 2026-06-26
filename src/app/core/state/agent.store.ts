import { computed, Injectable, signal } from '@angular/core';
import { Agent } from '../../models/agent.model';

@Injectable({ providedIn: 'root' })
export class AgentStore {
  readonly agent = signal<Agent | null>(null);
  readonly isAuthenticated = computed(() => this.agent() !== null);

  setAgent(agent: Agent | null): void {
    this.agent.set(agent);
  }

  patchCredits(credits: number): void {
    const current = this.agent();
    if (!current) return;
    this.agent.set({ ...current, credits });
  }

  clear(): void {
    this.agent.set(null);
  }
}
