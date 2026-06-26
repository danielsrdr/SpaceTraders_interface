import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AgentStore } from '../../core/state/agent.store';
import { DiscoveryStore } from '../../core/state/discovery.store';
import { SurfaceDiscoveryStore } from '../../core/state/surface-discovery.store';
import { SnackbarService } from '../../shared/services/snackbar.service';
import {
  ACHIEVEMENT_BY_ID,
  ACHIEVEMENTS,
  AchievementProgress,
  evaluateAchievement,
  ProgressSnapshot,
} from './achievements';

const STORAGE_PREFIX = 'sk_achievements_';

export interface RecentAchievement {
  id: string;
  unlockedAt: number;
}

/**
 * Evaluates procedural achievements against the {@link DiscoveryStore}
 * progression snapshot. Persists unlock timestamps per agent and raises a
 * snackbar when an achievement is unlocked during play. On the first load for an
 * agent, already-satisfied achievements are seeded silently (no notification
 * spam) so retroactive milestones still count without flooding the screen.
 */
@Injectable({ providedIn: 'root' })
export class AchievementsService {
  private readonly discovery = inject(DiscoveryStore);
  private readonly surfaceDiscovery = inject(SurfaceDiscoveryStore);
  private readonly agentStore = inject(AgentStore);
  private readonly snackbar = inject(SnackbarService);

  private readonly unlockedAtSig = signal<Record<string, number>>({});
  private currentAgent: string | null = null;

  readonly total = ACHIEVEMENTS.length;

  readonly snapshot = computed<ProgressSnapshot>(() => {
    const storms = [...this.surfaceDiscovery.weatherSeen()].filter((w) =>
      ['sand-storm', 'acid-rain', 'giant-winds'].includes(w),
    ).length;
    return {
      peakCredits: this.discovery.peakCredits(),
      lifetimeRevenue: this.discovery.lifetimeRevenue(),
      lifetimeFuelBurned: this.discovery.lifetimeFuelBurned(),
      routesFlown: this.discovery.routesFlown(),
      systemsVisited: this.discovery.systemsVisited().size,
      waypointTypesSeen: this.discovery.waypointTypesSeen().size,
      factionsMet: this.discovery.factionsMet().size,
      goodsSeen: this.discovery.goodsSeen().size,
      planetsLanded: this.surfaceDiscovery.planetsLanded().size,
      biomesSeen: this.surfaceDiscovery.biomesSeen().size,
      stormsWitnessed: storms,
      minesCompleted: this.surfaceDiscovery.minesCompleted(),
      weatherCatalogued: this.surfaceDiscovery.weatherSeen().size,
      ruinsScanned: this.surfaceDiscovery.ruinsScanned().size,
      surfaceSupplyActions: this.surfaceDiscovery.surfaceSupplyActions(),
    };
  });

  readonly states = computed<AchievementProgress[]>(() => {
    const snap = this.snapshot();
    return ACHIEVEMENTS.map((a) => evaluateAchievement(a, snap));
  });

  readonly unlockedCount = computed(() => this.states().filter((s) => s.unlocked).length);

  readonly recent = computed<RecentAchievement[]>(() => {
    const at = this.unlockedAtSig();
    return Object.entries(at)
      .map(([id, unlockedAt]) => ({ id, unlockedAt }))
      .sort((a, b) => b.unlockedAt - a.unlockedAt);
  });

  constructor() {
    effect(() => {
      const agent = this.agentStore.agent();
      const unlockedIds = this.states()
        .filter((s) => s.unlocked)
        .map((s) => s.achievement.id);
      untracked(() => this.reconcile(agent ? agent.name : null, unlockedIds));
    });
  }

  unlockedAt(id: string): number | undefined {
    return this.unlockedAtSig()[id];
  }

  private reconcile(agentName: string | null, unlockedIds: string[]): void {
    if (!agentName) {
      this.currentAgent = null;
      this.unlockedAtSig.set({});
      return;
    }

    const firstLoad = this.currentAgent !== agentName;
    const map = firstLoad ? this.read(agentName) : { ...this.unlockedAtSig() };
    if (firstLoad) this.currentAgent = agentName;

    const fresh: string[] = [];
    let changed = false;
    for (const id of unlockedIds) {
      if (map[id] === undefined) {
        map[id] = Date.now();
        changed = true;
        if (!firstLoad) fresh.push(id);
      }
    }

    if (changed) {
      this.unlockedAtSig.set(map);
      this.persist(agentName, map);
    }
    for (const id of fresh) {
      const achievement = ACHIEVEMENT_BY_ID.get(id);
      if (achievement) {
        this.snackbar.show(`Achievement unlocked — ${achievement.title}`, 'success', 4000);
      }
    }
  }

  private read(agentName: string): Record<string, number> {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${agentName}`);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      const result: Record<string, number> = {};
      for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value)) result[id] = value;
      }
      return result;
    } catch {
      return {};
    }
  }

  private persist(agentName: string, map: Record<string, number>): void {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${agentName}`, JSON.stringify(map));
    } catch {
      // Storage may be unavailable (private mode / quota); fail silently.
    }
  }
}
