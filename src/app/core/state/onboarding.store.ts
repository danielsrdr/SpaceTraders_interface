import { inject, Injectable, signal } from '@angular/core';
import { AgentStore } from './agent.store';

const STORAGE_PREFIX = 'sk_onboarding_';

interface OnboardingState {
  completed: boolean;
  dismissed: boolean;
}

@Injectable({ providedIn: 'root' })
export class OnboardingStore {
  private readonly agentStore = inject(AgentStore);

  readonly active = signal(false);
  readonly stepIndex = signal(0);

  private agentKey: string | null = null;
  private state: OnboardingState = { completed: false, dismissed: false };

  attach(agentName: string): void {
    if (this.agentKey === agentName) return;
    this.agentKey = agentName;
    this.state = this.read(agentName);
    if (!this.state.completed && !this.state.dismissed) {
      this.stepIndex.set(0);
      this.active.set(true);
    } else {
      this.active.set(false);
    }
  }

  detach(): void {
    this.agentKey = null;
    this.active.set(false);
    this.stepIndex.set(0);
  }

  shouldShow(): boolean {
    return this.active() && !this.state.completed && !this.state.dismissed;
  }

  next(): void {
    this.stepIndex.update((i) => i + 1);
  }

  complete(): void {
    this.state.completed = true;
    this.active.set(false);
    this.persist();
  }

  dismiss(): void {
    this.state.dismissed = true;
    this.active.set(false);
    this.persist();
  }

  restart(): void {
    this.state = { completed: false, dismissed: false };
    this.stepIndex.set(0);
    this.active.set(true);
    this.persist();
  }

  private read(agentName: string): OnboardingState {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${agentName}`);
      if (!raw) return { completed: false, dismissed: false };
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      return {
        completed: parsed.completed === true,
        dismissed: parsed.dismissed === true,
      };
    } catch {
      return { completed: false, dismissed: false };
    }
  }

  private persist(): void {
    const key = this.agentKey ?? this.agentStore.agent()?.name;
    if (!key) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(this.state));
    } catch {
      // ignore
    }
  }
}
