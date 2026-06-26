import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AgentStore } from '../../core/state/agent.store';
import { AnalyticsStore } from '../../core/state/analytics.store';
import { DiscoveryStore } from '../../core/state/discovery.store';
import { FleetStore } from '../../core/state/fleet.store';
import { NavActivityService } from '../../shared/services/nav-activity.service';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { Achievement, ACHIEVEMENT_BY_ID } from '../codex/achievements';
import { AchievementsService } from '../codex/achievements.service';
import { CodexThumbnailService } from '../codex/codex-thumbnail.service';

interface TimeWindow {
  label: string;
  hours: number;
}

interface ChartBar {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  gross: number;
  net: number;
  start: number;
}

const WINDOWS: TimeWindow[] = [
  { label: '1H', hours: 1 },
  { label: '6H', hours: 6 },
  { label: '24H', hours: 24 },
  { label: '7D', hours: 168 },
];

const CHART_WIDTH = 600;
const CHART_HEIGHT = 150;
const BUCKETS = 24;

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly analytics = inject(AnalyticsStore);
  readonly discovery = inject(DiscoveryStore);
  private readonly agentStore = inject(AgentStore);
  private readonly fleet = inject(FleetStore);
  private readonly navActivity = inject(NavActivityService);
  private readonly achievementsSvc = inject(AchievementsService);
  private readonly thumbnails = inject(CodexThumbnailService);
  private readonly background = inject(PageBackgroundService);
  private readonly router = inject(Router);

  readonly windows = WINDOWS;
  readonly windowHours = signal(24);
  readonly hovered = signal<number | null>(null);

  private readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly hasData = computed(() => this.analytics.totalEvents() > 0);
  readonly analyticsCount = computed(() => this.analytics.totalEvents());

  readonly revenuePerHour = computed(() => this.analytics.revenuePerHour(this.windowHours(), this.now()));
  readonly netCredits = computed(() => this.analytics.netCredits(this.windowHours(), this.now()));
  readonly fuelBurned = computed(() => this.analytics.fuelBurned(this.windowHours(), this.now()));

  readonly topRoutes = computed(() => this.analytics.topRoutes(6, this.windowHours(), this.now()));
  readonly maxRouteCount = computed(() => Math.max(1, ...this.topRoutes().map((r) => r.count)));

  readonly fuelByShip = computed(() => this.analytics.fuelByShip(this.windowHours(), this.now()).slice(0, 6));
  readonly maxShipFuel = computed(() => Math.max(1, ...this.fuelByShip().map((s) => s.fuel)));

  readonly chart = computed(() => {
    const buckets = this.analytics.revenueBuckets(this.windowHours(), BUCKETS, this.now());
    const max = Math.max(1, ...buckets.map((b) => b.gross));
    const gap = 3;
    const barWidth = (CHART_WIDTH - gap * (buckets.length - 1)) / buckets.length;
    const bars: ChartBar[] = buckets.map((bucket, index) => {
      const height = (bucket.gross / max) * CHART_HEIGHT;
      return {
        index,
        x: index * (barWidth + gap),
        y: CHART_HEIGHT - height,
        width: barWidth,
        height,
        gross: bucket.gross,
        net: bucket.net,
        start: bucket.start,
      };
    });
    return { bars, max };
  });

  readonly hoveredBar = computed(() => {
    const index = this.hovered();
    if (index === null) return null;
    return this.chart().bars[index] ?? null;
  });

  readonly fleetSummary = computed(() => {
    const ships = this.fleet.ships();
    return {
      total: ships.length,
      inTransit: ships.filter((s) => s.nav.status === 'IN_TRANSIT').length,
    };
  });

  readonly agentCredits = computed(() => this.agentStore.agent()?.credits ?? null);

  readonly openContracts = computed(
    () => this.navActivity.activeContracts().filter((c) => c.accepted && !c.fulfilled).length,
  );

  readonly achievementUnlocked = computed(() => this.achievementsSvc.unlockedCount());
  readonly achievementTotal = this.achievementsSvc.total;

  readonly recentAchievements = computed(() =>
    this.achievementsSvc
      .recent()
      .slice(0, 5)
      .map((entry) => ACHIEVEMENT_BY_ID.get(entry.id))
      .filter((achievement): achievement is Achievement => achievement !== undefined),
  );

  readonly nextAchievements = computed(() =>
    this.achievementsSvc
      .states()
      .filter((state) => !state.unlocked)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3),
  );

  readonly chartWidth = CHART_WIDTH;
  readonly chartHeight = CHART_HEIGHT;

  ngOnInit(): void {
    this.background.setBackground('/assets/img/background.png');
    void this.fleet.refreshShips();
    this.timer = setInterval(() => this.now.set(Date.now()), 30_000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.thumbnails.dispose();
  }

  openCodex(): void {
    void this.router.navigate(['/codex']);
  }

  setWindow(hours: number): void {
    this.windowHours.set(hours);
    this.hovered.set(null);
  }

  formatCredits(value: number): string {
    const rounded = Math.round(value);
    return `${rounded < 0 ? '-' : ''}${Math.abs(rounded).toLocaleString()}c`;
  }

  formatCompact(value: number): string {
    return Math.round(value).toLocaleString();
  }

  formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    if (this.windowHours() > 48) {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  badge(achievement: Achievement, unlocked = true): string {
    return this.thumbnails.achievementBadge(achievement.id, achievement.color, achievement.tier, unlocked);
  }

  pct(ratio: number): number {
    return Math.round(ratio * 100);
  }

  plotRoute(destination: string): void {
    if (!destination) return;
    const system = destination.split('-').slice(0, 2).join('-');
    void this.router.navigate(['/systems'], {
      queryParams: { name: system, travelTo: destination, fallback: '0' },
    });
  }
}
