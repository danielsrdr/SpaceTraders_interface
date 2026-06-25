import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { AgentData, mapAgent } from '../../models/agent.model';
import { AgentStore } from '../../core/state/agent.store';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { factionColor } from '../../shared/faction-colors';

interface LeaderboardRow {
  rank: number;
  symbol: string;
  name: string;
  credits: number;
  hq: string;
  faction: string;
  ships: number;
}

const RIVAL_THRESHOLD = 0.1;

@Component({
  selector: 'app-leaderboard',
  templateUrl: './leaderboard.component.html',
})
export class LeaderboardComponent implements OnInit {
  private readonly api = inject(SpaceTradersApiService);
  private readonly agentStore = inject(AgentStore);
  private readonly background = inject(PageBackgroundService);
  private readonly snackbar = inject(SnackbarService);

  readonly rows = signal<LeaderboardRow[]>([]);
  readonly selectedFaction = signal<string | null>(null);
  readonly selectedAgent = signal<ReturnType<typeof mapAgent> | null>(null);
  readonly detailLoading = signal(false);

  readonly factionColor = factionColor;

  readonly factions = computed(() => {
    const set = new Set<string>();
    for (const row of this.rows()) {
      if (row.faction) set.add(row.faction);
    }
    return [...set].sort();
  });

  readonly visibleRows = computed(() => {
    const faction = this.selectedFaction();
    if (!faction) return this.rows();
    return this.rows().filter((row) => row.faction === faction);
  });

  readonly podium = computed(() => {
    const top = this.rows().slice(0, 3);
    const [first, second, third] = top;
    return [second, first, third].filter((row): row is LeaderboardRow => !!row);
  });

  private readonly playerRow = computed(() => {
    const me = this.agentStore.agent();
    if (!me) return null;
    return this.rows().find((row) => row.symbol === me.name) ?? null;
  });

  ngOnInit(): void {
    this.background.setBackground('/assets/img/background.png');
    void this.load();
  }

  isYou(row: LeaderboardRow): boolean {
    return this.playerRow()?.symbol === row.symbol;
  }

  isRival(row: LeaderboardRow): boolean {
    const me = this.playerRow();
    if (!me || me.symbol === row.symbol) return false;
    if (Math.abs(me.rank - row.rank) === 1) return true;
    const base = me.credits || 1;
    return Math.abs(me.credits - row.credits) / base <= RIVAL_THRESHOLD;
  }

  private async load(): Promise<void> {
    const agents = await this.api.getAllAgents();
    const mapped = agents.map((a) => mapAgent(a));
    mapped.sort((a, b) => b.credits - a.credits);
    this.rows.set(
      mapped.map((a, i) => ({
        rank: i + 1,
        symbol: a.name,
        name: a.name,
        credits: a.credits,
        hq: a.hq,
        faction: a.faction,
        ships: a.ships_cpt,
      })),
    );
  }

  selectFaction(faction: string | null): void {
    this.selectedFaction.set(faction);
  }

  async showAgent(symbol: string): Promise<void> {
    this.detailLoading.set(true);
    this.selectedAgent.set(null);
    try {
      const data: AgentData = await this.api.getAgentBySymbol(symbol);
      this.selectedAgent.set(mapAgent(data));
    } catch {
      this.snackbar.show('Failed to load agent details', 'error');
    } finally {
      this.detailLoading.set(false);
    }
  }

  closeDetail(): void {
    this.selectedAgent.set(null);
  }
}
