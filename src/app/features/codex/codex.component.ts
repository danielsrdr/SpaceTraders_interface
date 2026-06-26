import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FactionData } from '../../models/faction.model';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { DiscoveryStore } from '../../core/state/discovery.store';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { factionColor } from '../../shared/faction-colors';
import { resolveWaypointType } from '../systems/planet-helpers';
import { goodCategory, goodLabel } from '../systems/trade-good-visuals';
import { CodexThumbnailService } from './codex-thumbnail.service';
import { CodexWaypointViewerComponent } from './codex-waypoint-viewer.component';
import { CodexArtViewerComponent } from './codex-art-viewer.component';
import { GOODS_CODEX, WAYPOINT_CODEX } from './codex-catalog';
import { AchievementProgress } from './achievements';
import { AchievementsService } from './achievements.service';

export type CodexTab = 'waypoints' | 'factions' | 'goods' | 'achievements';

export interface CodexCard {
  id: string;
  label: string;
  sub: string;
  description: string;
  unlocked: boolean;
}

interface CodexDetail {
  tab: CodexTab;
  card: CodexCard;
}

const GOOD_CATEGORY_BLURB: Record<string, string> = {
  fuel: 'A combustible commodity that keeps reactors and engines running.',
  minerals: 'Raw and refined minerals extracted from rock and regolith.',
  chemicals: 'Volatile compounds and ices used across industry.',
  food: 'Sustenance, textiles and consumer staples in steady demand.',
  tech: 'Advanced manufactured equipment and machinery.',
  goods: 'A traded commodity moving through the markets of the sector.',
};

@Component({
  selector: 'app-codex',
  templateUrl: './codex.component.html',
  imports: [CodexWaypointViewerComponent, CodexArtViewerComponent],
})
export class CodexComponent implements OnInit, OnDestroy {
  readonly discovery = inject(DiscoveryStore);
  readonly achievements = inject(AchievementsService);
  private readonly api = inject(SpaceTradersApiService);
  private readonly thumbnails = inject(CodexThumbnailService);
  private readonly background = inject(PageBackgroundService);

  readonly factionColor = factionColor;

  readonly tab = signal<CodexTab>('waypoints');
  readonly selected = signal<CodexDetail | null>(null);
  readonly factions = signal<FactionData[]>([]);

  readonly tabs: ReadonlyArray<{ id: CodexTab; label: string }> = [
    { id: 'waypoints', label: 'Waypoints' },
    { id: 'factions', label: 'Factions' },
    { id: 'goods', label: 'Goods' },
    { id: 'achievements', label: 'Achievements' },
  ];

  private readonly unlockedWaypointTypes = computed(
    () => new Set([...this.discovery.waypointTypesSeen()].map((t) => resolveWaypointType(t))),
  );

  readonly waypointCards = computed<CodexCard[]>(() => {
    const unlocked = this.unlockedWaypointTypes();
    return WAYPOINT_CODEX.map((entry) => ({
      id: entry.type,
      label: entry.label,
      sub: 'Waypoint',
      description: entry.description,
      unlocked: unlocked.has(resolveWaypointType(entry.type)),
    }));
  });

  readonly factionCards = computed<CodexCard[]>(() => {
    const met = new Set([...this.discovery.factionsMet()].map((s) => s.toUpperCase()));
    return this.factions().map((faction) => ({
      id: faction.symbol,
      label: faction.name,
      sub: faction.headquarters,
      description: faction.description,
      unlocked: met.has(faction.symbol.toUpperCase()),
    }));
  });

  readonly goodCards = computed<CodexCard[]>(() => {
    const seen = this.discovery.goodsSeen();
    const symbols = [...new Set([...GOODS_CODEX, ...seen])].sort((a, b) => a.localeCompare(b));
    return symbols.map((symbol) => ({
      id: symbol,
      label: goodLabel(symbol),
      sub: goodCategory(symbol),
      description: GOOD_CATEGORY_BLURB[goodCategory(symbol)] ?? GOOD_CATEGORY_BLURB['goods']!,
      unlocked: seen.has(symbol),
    }));
  });

  readonly activeCards = computed<CodexCard[]>(() => {
    const tab = this.tab();
    switch (tab) {
      case 'waypoints':
        return this.waypointCards();
      case 'factions':
        return this.factionCards();
      case 'goods':
        return this.goodCards();
      case 'achievements':
        return [];
      default: {
        const _exhaustive: never = tab;
        void _exhaustive;
        return [];
      }
    }
  });

  readonly headerUnlocked = computed(() =>
    this.tab() === 'achievements' ? this.achievements.unlockedCount() : this.activeCards().filter((c) => c.unlocked).length,
  );
  readonly headerTotal = computed(() =>
    this.tab() === 'achievements' ? this.achievements.total : this.activeCards().length,
  );
  readonly progressPct = computed(() => {
    const total = this.headerTotal();
    return total ? Math.round((this.headerUnlocked() / total) * 100) : 0;
  });

  ngOnInit(): void {
    this.background.setBackground('/assets/img/background.png');
    void this.loadFactions();
  }

  ngOnDestroy(): void {
    this.thumbnails.dispose();
  }

  setTab(tab: CodexTab): void {
    this.tab.set(tab);
    this.selected.set(null);
  }

  openDetail(card: CodexCard): void {
    if (!card.unlocked) return;
    this.selected.set({ tab: this.tab(), card });
  }

  closeDetail(): void {
    this.selected.set(null);
  }

  thumbnail(card: CodexCard): string {
    const tab = this.tab();
    switch (tab) {
      case 'waypoints':
        return this.thumbnails.waypointThumbnail(card.id);
      case 'factions':
        return this.thumbnails.factionThumbnail(card.id);
      case 'goods':
        return this.thumbnails.goodThumbnail(card.id);
      case 'achievements':
        return '';
      default: {
        const _exhaustive: never = tab;
        void _exhaustive;
        return '';
      }
    }
  }

  unlockHint(): string {
    const tab = this.tab();
    switch (tab) {
      case 'waypoints':
        return 'Travel to a waypoint of this type to chart it.';
      case 'factions':
        return 'Encounter this faction (open its registry entry or take its contract) to reveal it.';
      case 'goods':
        return 'Trade or scan this good at a market to catalog it.';
      case 'achievements':
        return '';
      default: {
        const _exhaustive: never = tab;
        void _exhaustive;
        return '';
      }
    }
  }

  badgeFor(state: AchievementProgress): string {
    return this.thumbnails.achievementBadge(
      state.achievement.id,
      state.achievement.color,
      state.achievement.tier,
      state.unlocked,
    );
  }

  formatCompactNum(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
    return Math.round(value).toLocaleString();
  }

  private async loadFactions(): Promise<void> {
    try {
      this.factions.set(await this.api.getAllFactions());
    } catch {
      this.factions.set([]);
    }
  }
}
