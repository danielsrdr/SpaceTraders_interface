import { Component, computed, inject } from '@angular/core';
import { CockpitLogService } from '../../cockpit-log.service';
import { ShipActionsService } from '../../ship-actions.service';
import { SystemMapStore } from '../../system-map.store';
import { TradeGoodRowComponent } from '../../trade-good-row.component';

@Component({
  selector: 'app-cockpit-market-tab',
  imports: [TradeGoodRowComponent],
  templateUrl: './cockpit-market-tab.component.html',
})
export class CockpitMarketTabComponent {
  private readonly mapStore = inject(SystemMapStore);
  private readonly shipActions = inject(ShipActionsService);
  private readonly cockpitLog = inject(CockpitLogService);

  readonly selectedPlanet = this.mapStore.selectedPlanet;
  readonly ships = this.mapStore.ships;
  readonly market = this.shipActions.market;
  readonly shipCargo = this.shipActions.shipCargo;
  readonly tradeShip = this.shipActions.tradeShip;
  readonly tradeSymbol = this.shipActions.tradeSymbol;
  readonly tradeUnits = this.shipActions.tradeUnits;

  readonly maxCargoProceeds = computed(() => {
    const market = this.market();
    const cargo = this.shipCargo();
    if (!market?.tradeGoods || !cargo) return 0;
    let max = 0;
    for (const good of market.tradeGoods) {
      const held = cargo.inventory.find((item) => item.symbol === good.symbol)?.units ?? 0;
      max = Math.max(max, held * good.sellPrice);
    }
    return max;
  });

  actionLoading(key: string): boolean {
    return this.cockpitLog.actionLoading(key);
  }

  cargoUnitsOf(symbol: string): number {
    const cargo = this.shipCargo();
    if (!cargo) return 0;
    return cargo.inventory.find((item) => item.symbol === symbol)?.units ?? 0;
  }

  dockedAt(waypointSymbol: string) {
    return this.ships().filter(
      (s) => s.nav.waypointSymbol === waypointSymbol && s.nav.status === 'DOCKED',
    );
  }

  loadMarket(): void {
    void this.shipActions.loadMarket();
  }

  loadShipCargo(shipSymbol: string): void {
    void this.shipActions.loadShipCargo(shipSymbol);
  }

  tradeCargo(mode: 'buy' | 'sell'): void {
    void this.shipActions.tradeCargo(mode);
  }
}
