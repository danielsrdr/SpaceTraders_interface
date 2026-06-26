import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AgentStore } from '../../core/state/agent.store';
import { factionThemeVars } from '../faction-colors';

const STORAGE_PREFIX = 'sk_faction_theme_';

const DEFAULT_VARS: Record<string, string> = {
  '--color-accent': 'rgba(69, 128, 255, 0.842)',
  '--color-phosphor': 'oklch(0.86 0.17 155)',
  '--color-phosphor-dim': 'oklch(0.72 0.12 155)',
};

@Injectable({ providedIn: 'root' })
export class FactionThemeService {
  private readonly agentStore = inject(AgentStore);

  readonly enabled = signal(true);

  constructor() {
    effect(() => {
      const agent = this.agentStore.agent();
      untracked(() => {
        if (agent) {
          this.enabled.set(this.readPreference(agent.name));
        }
        this.apply();
      });
    });

    effect(() => {
      const agent = this.agentStore.agent();
      const on = this.enabled();
      untracked(() => {
        if (agent) this.persistPreference(agent.name, on);
        this.apply();
      });
    });
  }

  setEnabled(value: boolean): void {
    this.enabled.set(value);
  }

  toggle(): void {
    this.enabled.update((v) => !v);
  }

  private apply(): void {
    const root = document.documentElement;
    const agent = this.agentStore.agent();
    if (!agent || !this.enabled()) {
      for (const [key, value] of Object.entries(DEFAULT_VARS)) {
        root.style.setProperty(key, value);
      }
      return;
    }
    const vars = factionThemeVars(agent.faction);
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
  }

  private readPreference(agentName: string): boolean {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${agentName}`);
      if (raw === '0') return false;
      return true;
    } catch {
      return true;
    }
  }

  private persistPreference(agentName: string, enabled: boolean): void {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${agentName}`, enabled ? '1' : '0');
    } catch {
      // ignore
    }
  }
}
