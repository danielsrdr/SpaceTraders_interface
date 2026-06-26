import { Component, inject, input, output } from '@angular/core';
import { MarketData } from '../../../models/system.model';
import { PlanetView } from '../../../models/system.model';
import { ShipData } from '../../../models/ship.model';
import { CockpitLogService } from '../cockpit-log.service';
import { ShipActionsService } from '../ship-actions.service';
import { SystemMapStore } from '../system-map.store';
import { TradeGoodRowComponent } from '../trade-good-row.component';

@Component({
  selector: 'app-market-overlay',
  imports: [TradeGoodRowComponent],
  templateUrl: './market-overlay.component.html',
})
export class MarketOverlayComponent {
  private readonly mapStore = inject(SystemMapStore);
  private readonly shipActions = inject(ShipActionsService);
  private readonly cockpitLog = inject(CockpitLogService);

  readonly market = input.required<MarketData>();
  readonly selectedPlanet = input<PlanetView | null>(null);
  readonly dockedAt = input<ShipData[]>([]);
  readonly cargoUnitsOf = input.required<(symbol: string) => number>();
  readonly maxCargoProceeds = input(0);

  readonly close = output<void>();

  readonly tradeSymbol = this.shipActions.tradeSymbol;
  readonly tradeShip = this.shipActions.tradeShip;
  readonly tradeUnits = this.shipActions.tradeUnits;
  readonly loadingAction = this.cockpitLog.loadingAction;

  actionLoading(key: string): boolean {
    return this.cockpitLog.actionLoading(key);
  }

  tradeCargo(mode: 'buy' | 'sell'): void {
    void this.shipActions.tradeCargo(mode);
  }
}
