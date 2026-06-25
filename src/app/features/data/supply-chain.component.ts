import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { SnackbarService } from '../../shared/services/snackbar.service';

interface SupplyRow {
  exportGood: string;
  importGoods: string[];
}

@Component({
  selector: 'app-supply-chain',
  imports: [FormsModule],
  templateUrl: './supply-chain.component.html',
})
export class SupplyChainComponent implements OnInit {
  private readonly api = inject(SpaceTradersApiService);
  private readonly background = inject(PageBackgroundService);
  private readonly snackbar = inject(SnackbarService);

  readonly rows = signal<SupplyRow[]>([]);
  readonly search = signal('');
  readonly loading = signal(false);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.rows();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.exportGood.toLowerCase().includes(q) ||
        r.importGoods.some((g) => g.toLowerCase().includes(q)),
    );
  });

  ngOnInit(): void {
    this.background.setBackground('/assets/img/background.png');
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.api.getSupplyChain();
      const mapped = Object.entries(data.exportToImportMap).map(([exportGood, importGoods]) => ({
        exportGood,
        importGoods,
      }));
      mapped.sort((a, b) => a.exportGood.localeCompare(b.exportGood));
      this.rows.set(mapped);
    } catch {
      this.snackbar.show('Failed to load supply chain data', 'error');
    } finally {
      this.loading.set(false);
    }
  }
}
