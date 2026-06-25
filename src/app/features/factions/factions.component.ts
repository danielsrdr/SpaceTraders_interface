import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FactionData } from '../../models/faction.model';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { factionColor } from '../../shared/faction-colors';
import { ContractMiniMapComponent } from '../contracts/contract-mini-map.component';

@Component({
  selector: 'app-factions',
  imports: [FormsModule, ContractMiniMapComponent],
  templateUrl: './factions.component.html',
})
export class FactionsComponent implements OnInit {
  private readonly api = inject(SpaceTradersApiService);
  private readonly background = inject(PageBackgroundService);
  private readonly snackbar = inject(SnackbarService);
  private readonly router = inject(Router);

  readonly factionColor = factionColor;

  readonly factions = signal<FactionData[]>([]);
  readonly selected = signal<FactionData | null>(null);
  readonly search = signal('');
  readonly loading = signal(false);
  readonly detailLoading = signal(false);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.factions();
    if (!q) return list;
    return list.filter(
      (f) =>
        f.symbol.toLowerCase().includes(q) ||
        f.name.toLowerCase().includes(q) ||
        f.headquarters.toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    this.background.setBackground('/assets/img/background.png');
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.api.getAllFactions();
      this.factions.set(list);
    } catch {
      this.snackbar.show('Failed to load factions', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  async selectFaction(faction: FactionData): Promise<void> {
    this.detailLoading.set(true);
    this.selected.set(faction);
    try {
      const detail = await this.api.getFaction(faction.symbol);
      this.selected.set(detail);
    } catch {
      this.snackbar.show('Failed to load faction details', 'error');
    } finally {
      this.detailLoading.set(false);
    }
  }

  travelToHq(): void {
    const hq = this.selected()?.headquarters;
    if (!hq) return;
    const system = hq.split('-').slice(0, 2).join('-');
    void this.router.navigate(['/systems'], {
      queryParams: { name: system, travelTo: hq, fallback: '0' },
    });
  }
}
