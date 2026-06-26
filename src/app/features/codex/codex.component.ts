import { Component, computed, effect, ElementRef, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FactionData } from '../../models/faction.model';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { DiscoveryStore } from '../../core/state/discovery.store';
import {
  FOOTPRINT_CELL_SIZE,
  SurfaceDiscoveryStore,
} from '../../core/state/surface-discovery.store';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { factionColor } from '../../shared/faction-colors';
import { resolveWaypointType } from '../systems/planet-helpers';
import { goodCategory, goodLabel } from '../systems/trade-good-visuals';
import { WORLD_RADIUS } from '../systems/three/terrain/terrain-height';
import { CodexThumbnailService } from './codex-thumbnail.service';
import { CodexWaypointViewerComponent } from './codex-waypoint-viewer.component';
import { CodexArtViewerComponent } from './codex-art-viewer.component';
import { GOODS_CODEX, SURFACE_BIOME_CODEX, WAYPOINT_CODEX } from './codex-catalog';
import { AchievementProgress } from './achievements';
import { AchievementsService } from './achievements.service';
import { MissionDirectorService } from '../mission-director/mission-director.service';

export type CodexTab = 'waypoints' | 'factions' | 'goods' | 'surface' | 'achievements' | 'operations';

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
  imports: [CodexWaypointViewerComponent, CodexArtViewerComponent, DatePipe],
})
export class CodexComponent implements OnInit, OnDestroy {
  readonly discovery = inject(DiscoveryStore);
  readonly surfaceDiscovery = inject(SurfaceDiscoveryStore);
  readonly achievements = inject(AchievementsService);
  readonly missionDirector = inject(MissionDirectorService);
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
    { id: 'surface', label: 'Surface' },
    { id: 'achievements', label: 'Achievements' },
    { id: 'operations', label: 'Operations' },
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

  readonly surfaceBiomeCards = computed<CodexCard[]>(() => {
    const seen = this.surfaceDiscovery.biomesSeen();
    return SURFACE_BIOME_CODEX.map((entry) => ({
      id: entry.id,
      label: entry.label,
      sub: 'Surface biome',
      description: entry.description,
      unlocked: seen.has(entry.id),
    }));
  });

  readonly surfaceMineEntries = computed(() => {
    const map = this.surfaceDiscovery.maxMinePercent();
    return Object.entries(map)
      .filter(([, pct]) => pct > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([planet, pct]) => ({ planet, pct }));
  });

  readonly surfaceCaveEntries = computed(() => {
    const map = this.surfaceDiscovery.maxCavePercent();
    return Object.entries(map)
      .filter(([, pct]) => pct > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([planet, pct]) => ({ planet, pct }));
  });

  readonly surfaceExploreEntries = computed(() => {
    const map = this.surfaceDiscovery.maxExplorePercent();
    return Object.entries(map)
      .filter(([, pct]) => pct > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([planet, pct]) => ({ planet, pct }));
  });

  readonly footprintPlanets = computed(() => [...this.surfaceDiscovery.planetsLanded()].sort());

  readonly footprintPlanet = signal<string | null>(null);

  private readonly footprintCanvas = viewChild<ElementRef<HTMLCanvasElement>>('footprintCanvas');

  readonly activeCards = computed<CodexCard[]>(() => {
    const tab = this.tab();
    switch (tab) {
      case 'waypoints':
        return this.waypointCards();
      case 'factions':
        return this.factionCards();
      case 'goods':
        return this.goodCards();
      case 'surface':
        return this.surfaceBiomeCards();
      case 'achievements':
        return [];
      case 'operations':
        return [];
      default: {
        const _exhaustive: never = tab;
        void _exhaustive;
        return [];
      }
    }
  });

  readonly headerUnlocked = computed(() => {
    if (this.tab() === 'achievements') return this.achievements.unlockedCount();
    if (this.tab() === 'operations') return this.missionDirector.recentOperations().length;
    return this.activeCards().filter((c) => c.unlocked).length;
  });
  readonly headerTotal = computed(() => {
    if (this.tab() === 'achievements') return this.achievements.total;
    if (this.tab() === 'operations') return Math.max(5, this.missionDirector.recentOperations().length);
    return this.activeCards().length;
  });
  readonly progressPct = computed(() => {
    const total = this.headerTotal();
    return total ? Math.round((this.headerUnlocked() / total) * 100) : 0;
  });

  constructor() {
    effect(() => {
      const planets = this.footprintPlanets();
      if (!this.footprintPlanet() && planets.length) {
        this.footprintPlanet.set(planets[0]!);
      }
    });
    effect(() => {
      const planet = this.footprintPlanet();
      const cells = planet ? this.surfaceDiscovery.getVisitedCellsForPlanet(planet) : [];
      const canvasRef = this.footprintCanvas();
      if (!canvasRef || !planet) return;
      this.drawFootprintHeatmap(canvasRef.nativeElement, cells);
    });
  }

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

  setFootprintPlanet(planet: string): void {
    this.footprintPlanet.set(planet);
  }

  private drawFootprintHeatmap(canvas: HTMLCanvasElement, cells: readonly string[]): void {
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0a1024';
    ctx.fillRect(0, 0, size, size);

    const visited = new Set(cells);
    const cellsPerRadius = Math.ceil(WORLD_RADIUS / FOOTPRINT_CELL_SIZE);
    const scale = size / (cellsPerRadius * 2 + 2);

    for (let cx = -cellsPerRadius; cx <= cellsPerRadius; cx++) {
      for (let cz = -cellsPerRadius; cz <= cellsPerRadius; cz++) {
        const centerX = (cx + 0.5) * FOOTPRINT_CELL_SIZE;
        const centerZ = (cz + 0.5) * FOOTPRINT_CELL_SIZE;
        if (Math.hypot(centerX, centerZ) > WORLD_RADIUS) continue;
        const px = (cx + cellsPerRadius + 0.5) * scale;
        const pz = (cz + cellsPerRadius + 0.5) * scale;
        ctx.fillStyle = visited.has(`${cx},${cz}`)
          ? 'rgba(45, 212, 191, 0.75)'
          : 'rgba(30, 41, 59, 0.6)';
        ctx.fillRect(px - scale * 0.45, pz - scale * 0.45, scale * 0.9, scale * 0.9);
      }
    }
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
      case 'surface':
        return '';
      case 'achievements':
        return '';
      case 'operations':
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
      case 'surface':
        return 'Walk this biome on a planetary surface to log it.';
      case 'achievements':
        return '';
      case 'operations':
        return 'Complete faction contracts to archive operations here.';
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
