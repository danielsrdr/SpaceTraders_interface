import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AgentStore } from '../../core/state/agent.store';
import {
  CompletedOperation,
  FactionStanding,
  MissionDirectorState,
  tierFromPoints,
} from '../../features/mission-director/mission-director.models';

const STORAGE_PREFIX = 'sk_director_';

function emptyState(): MissionDirectorState {
  return {
    standings: {},
    activeArcId: null,
    completedArcs: [],
    operations: [],
    dismissedBriefings: [],
  };
}

@Injectable({ providedIn: 'root' })
export class MissionDirectorStore {
  private readonly agentStore = inject(AgentStore);

  private readonly state = signal<MissionDirectorState>(emptyState());

  readonly standings = computed(() => this.state().standings);
  readonly activeArcId = computed(() => this.state().activeArcId);
  readonly operations = computed(() => this.state().operations);
  readonly totalFulfilled = computed(() =>
    Object.values(this.state().standings).reduce((sum, s) => sum + s.contractsFulfilled, 0),
  );

  constructor() {
    effect(() => {
      const agent = this.agentStore.agent();
      this.state.set(agent ? this.read(agent.name) : emptyState());
    });
  }

  standing(factionSymbol: string): FactionStanding {
    const key = factionSymbol.toUpperCase();
    return (
      this.state().standings[key] ?? {
        factionSymbol: key,
        points: 0,
        tier: 'unknown',
        contractsFulfilled: 0,
        contractsAccepted: 0,
      }
    );
  }

  setActiveArc(arcId: string | null): void {
    this.patch({ activeArcId: arcId });
  }

  completeArc(arcId: string): void {
    const completed = new Set(this.state().completedArcs);
    completed.add(arcId);
    this.patch({ completedArcs: [...completed], activeArcId: null });
  }

  addPoints(factionSymbol: string, points: number, event: 'accept' | 'fulfill'): void {
    const key = factionSymbol.toUpperCase();
    const prev = this.standing(key);
    const nextPoints = prev.points + points;
    const next: FactionStanding = {
      factionSymbol: key,
      points: nextPoints,
      tier: tierFromPoints(nextPoints),
      contractsFulfilled: prev.contractsFulfilled + (event === 'fulfill' ? 1 : 0),
      contractsAccepted: prev.contractsAccepted + (event === 'accept' ? 1 : 0),
    };
    this.patch({
      standings: { ...this.state().standings, [key]: next },
    });
  }

  recordOperation(op: CompletedOperation): void {
    const ops = [...this.state().operations, op].slice(-50);
    this.patch({ operations: ops });
  }

  dismissBriefing(briefingId: string): void {
    const dismissed = new Set(this.state().dismissedBriefings);
    dismissed.add(briefingId);
    this.patch({ dismissedBriefings: [...dismissed] });
  }

  recentOperations(limit = 5): CompletedOperation[] {
    return [...this.state().operations].reverse().slice(0, limit);
  }

  private patch(partial: Partial<MissionDirectorState>): void {
    this.state.update((s) => ({ ...s, ...partial }));
    this.persist();
  }

  private persist(): void {
    const agent = this.agentStore.agent();
    if (!agent) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${agent.name}`, JSON.stringify(this.state()));
    } catch {
      // ignore
    }
  }

  private read(agentName: string): MissionDirectorState {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${agentName}`);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw) as MissionDirectorState;
      return { ...emptyState(), ...parsed, standings: parsed.standings ?? {} };
    } catch {
      return emptyState();
    }
  }
}
