import { effect, inject, Injectable, signal } from '@angular/core';
import { AgentStore } from './agent.store';
import { SnackbarService } from '../../shared/services/snackbar.service';

interface DiscoveryState {
  data: boolean;
  factions: boolean;
}

const STORAGE_PREFIX = 'sk_discovery_';
const LOCKED: DiscoveryState = { data: false, factions: false };

/**
 * Tracks lightweight "discovery" progress per agent (no backend): the Data and
 * Factions menu entries stay locked until the player performs their first
 * extraction / accepts their first contract. State is persisted in localStorage
 * keyed by agent so it survives reloads and is isolated between agents.
 */
@Injectable({ providedIn: 'root' })
export class DiscoveryStore {
  private readonly agentStore = inject(AgentStore);
  private readonly snackbar = inject(SnackbarService);

  readonly dataUnlocked = signal(false);
  readonly factionsUnlocked = signal(false);

  constructor() {
    effect(() => {
      const agent = this.agentStore.agent();
      const state = agent ? this.read(agent.name) : LOCKED;
      this.dataUnlocked.set(state.data);
      this.factionsUnlocked.set(state.factions);
    });
  }

  unlockData(): void {
    if (this.dataUnlocked()) return;
    this.dataUnlocked.set(true);
    this.persist();
    this.snackbar.show('Data terminal unlocked — supply chain online.', 'success', 4000);
  }

  unlockFactions(): void {
    if (this.factionsUnlocked()) return;
    this.factionsUnlocked.set(true);
    this.persist();
    this.snackbar.show('Faction registry unlocked.', 'success', 4000);
  }

  private persist(): void {
    const agent = this.agentStore.agent();
    if (!agent) return;
    const state: DiscoveryState = {
      data: this.dataUnlocked(),
      factions: this.factionsUnlocked(),
    };
    try {
      localStorage.setItem(this.key(agent.name), JSON.stringify(state));
    } catch {
      // Storage may be unavailable (private mode / quota); fail silently.
    }
  }

  private read(agentName: string): DiscoveryState {
    try {
      const raw = localStorage.getItem(this.key(agentName));
      if (!raw) return LOCKED;
      const parsed = JSON.parse(raw) as Partial<DiscoveryState>;
      return { data: parsed.data === true, factions: parsed.factions === true };
    } catch {
      return LOCKED;
    }
  }

  private key(agentName: string): string {
    return `${STORAGE_PREFIX}${agentName}`;
  }
}
