import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { PriceComparatorService, PriceQuote } from '../../shared/services/price-comparator.service';
import { ShipCommandContextService } from '../../shared/services/ship-command-context.service';
import { FleetStore } from '../../core/state/fleet.store';
import { AgentStore } from '../../core/state/agent.store';
import { getAgentSystem } from '../../models/agent.model';
import { mapWaypoint } from '../../models/system.model';

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
  private readonly priceComparator = inject(PriceComparatorService);
  private readonly shipContext = inject(ShipCommandContextService);
  private readonly fleet = inject(FleetStore);
  private readonly agentStore = inject(AgentStore);

  readonly rows = signal<SupplyRow[]>([]);
  readonly search = signal('');
  readonly loading = signal(false);
  readonly priceSymbol = signal('');
  readonly priceQuotes = signal<PriceQuote[]>([]);
  readonly priceLoading = signal(false);

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

  async comparePrices(): Promise<void> {
    const symbol = this.priceSymbol().trim().toUpperCase();
    if (!symbol) {
      this.snackbar.show('Enter a trade good symbol', 'warning');
      return;
    }
    this.priceLoading.set(true);
    try {
      let planets = this.shipContext.planets();
      const agent = this.agentStore.agent();
      const system =
        this.shipContext.systemSymbol() ??
        this.fleet.ships().find((s) => s.nav.systemSymbol)?.nav.systemSymbol ??
        (agent ? getAgentSystem(agent) : null);
      if (!system) {
        this.snackbar.show('Could not determine current system', 'error');
        return;
      }
      if (!planets.length) {
        const waypoints = await this.api.getAllWaypoints(system);
        planets = waypoints.map(mapWaypoint);
        this.shipContext.setContext(system, planets);
      }
      const quotes = await this.priceComparator.compareInSystem(system, planets, [symbol]);
      this.priceQuotes.set(quotes);
      if (!quotes.length || (!quotes[0]?.bestSell && !quotes[0]?.bestBuy)) {
        this.snackbar.show(`No market data for ${symbol} in ${system}`, 'info');
      }
    } catch {
      this.snackbar.show('Price comparison failed', 'error');
    } finally {
      this.priceLoading.set(false);
    }
  }
}
