import { Component, computed, input, output, signal } from '@angular/core';
import type { MarketData, TradeGoodType } from '../../models/system.model';
import { PlanetView } from '../../models/system.model';
import { goodLabel, tradeTypeColor } from './trade-good-visuals';

export interface MarketListingRow {
  symbol: string;
  type: TradeGoodType;
  purchasePrice?: number;
  sellPrice?: number;
}

@Component({
  selector: 'app-surface-market-dialog',
  templateUrl: './surface-market-dialog.component.html',
})
export class SurfaceMarketDialogComponent {
  readonly open = input(false);
  readonly planet = input<PlanetView | null>(null);
  readonly market = input<MarketData | null>(null);
  readonly marketPending = input(false);

  readonly trade = output<{ symbol: string; mode: 'buy' | 'sell'; units: number }>();
  readonly close = output<void>();

  readonly selectedSymbol = signal<string | null>(null);
  readonly units = signal(1);

  readonly goodLabel = goodLabel;

  readonly listings = computed((): MarketListingRow[] => {
    const market = this.market();
    if (!market) return [];
    if (market.tradeGoods?.length) {
      return market.tradeGoods.map((g) => ({
        symbol: g.symbol,
        type: g.type,
        purchasePrice: g.purchasePrice,
        sellPrice: g.sellPrice,
      }));
    }
    const rows: MarketListingRow[] = [];
    for (const g of market.exports ?? []) {
      rows.push({ symbol: g.symbol, type: 'EXPORT' });
    }
    for (const g of market.imports ?? []) {
      rows.push({ symbol: g.symbol, type: 'IMPORT' });
    }
    for (const g of market.exchange ?? []) {
      rows.push({ symbol: g.symbol, type: 'EXCHANGE' });
    }
    return rows;
  });

  readonly clerkTitle = computed(() => {
    const faction = this.planet()?.faction?.name;
    return faction ? `${faction} Exchange` : 'Surface Trading Post';
  });

  readonly clerkLine = computed(() => {
    const planet = this.planet()?.name ?? 'this waypoint';
    return `Prices are locked to orbit feed for ${planet}. What do you need?`;
  });

  typeColor(type: TradeGoodType): string {
    const hex = tradeTypeColor(type);
    return `#${hex.toString(16).padStart(6, '0')}`;
  }

  selectSymbol(symbol: string): void {
    this.selectedSymbol.set(symbol);
  }

  adjustUnits(delta: number): void {
    this.units.update((u) => Math.max(1, u + delta));
  }

  canBuy(): boolean {
    const sym = this.selectedSymbol();
    if (!sym) return false;
    const row = this.listings().find((r) => r.symbol === sym);
    return row?.purchasePrice != null;
  }

  canSell(): boolean {
    const sym = this.selectedSymbol();
    if (!sym) return false;
    const row = this.listings().find((r) => r.symbol === sym);
    return row?.sellPrice != null;
  }

  submit(mode: 'buy' | 'sell'): void {
    const sym = this.selectedSymbol();
    if (!sym) return;
    this.trade.emit({ symbol: sym, mode, units: this.units() });
  }

  onClose(): void {
    this.close.emit();
  }
}
