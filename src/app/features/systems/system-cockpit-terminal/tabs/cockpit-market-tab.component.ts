import { Component, computed, inject } from '@angular/core';
import { CockpitLogService } from '../../cockpit-log.service';
import { cargoUnitsOf, maxCargoProceeds, shipsDockedAt } from '../../planet-helpers';
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

  readonly maxCargoProceeds = computed(() => maxCargoProceeds(this.market(), this.shipCargo()));

  actionLoading(key: string): boolean {
    return this.cockpitLog.actionLoading(key);
  }

  cargoUnitsOf(symbol: string): number {
    return cargoUnitsOf(this.shipCargo(), symbol);
  }

  dockedAt(waypointSymbol: string) {
    return shipsDockedAt(this.ships(), waypointSymbol);
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
