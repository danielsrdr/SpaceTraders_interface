import { Component, computed, inject } from '@angular/core';
import { ShipData } from '../../../../models/ship.model';
import { CockpitLogService } from '../../cockpit-log.service';
import { ShipActionsService } from '../../ship-actions.service';
import { SystemMapStore } from '../../system-map.store';
import { CargoItemRowComponent } from '../../cargo-item-row.component';

@Component({
  selector: 'app-cockpit-cargo-tab',
  imports: [CargoItemRowComponent],
  templateUrl: './cockpit-cargo-tab.component.html',
})
export class CockpitCargoTabComponent {
  private readonly mapStore = inject(SystemMapStore);
  private readonly shipActions = inject(ShipActionsService);
  private readonly cockpitLog = inject(CockpitLogService);

  readonly selectedShip = this.mapStore.selectedShip;
  readonly selectedPlanet = this.mapStore.selectedPlanet;
  readonly ships = this.mapStore.ships;
  readonly shipCargo = this.shipActions.shipCargo;
  readonly jettisonSymbol = this.shipActions.jettisonSymbol;
  readonly jettisonUnits = this.shipActions.jettisonUnits;
  readonly jettisonShipSymbol = this.shipActions.jettisonShipSymbol;
  readonly transferTargetShip = this.shipActions.transferTargetShip;
  readonly transferSymbol = this.shipActions.transferSymbol;
  readonly transferUnits = this.shipActions.transferUnits;
  readonly shipMounts = this.shipActions.shipMounts;
  readonly shipModules = this.shipActions.shipModules;
  readonly mountSymbol = this.shipActions.mountSymbol;
  readonly moduleSymbol = this.shipActions.moduleSymbol;
  readonly repairQuote = this.shipActions.repairQuote;
  readonly scrapQuote = this.shipActions.scrapQuote;
  readonly repairShipSymbol = this.shipActions.repairShipSymbol;
  readonly scrapShipSymbol = this.shipActions.scrapShipSymbol;

  readonly terminalShip = computed(() => {
    const ship = this.selectedShip();
    if (ship) return ship;
    const planet = this.selectedPlanet();
    if (!planet) return null;
    return this.ships().find((s) => s.nav.waypointSymbol === planet.name) ?? null;
  });

  actionLoading(key: string): boolean {
    return this.cockpitLog.actionLoading(key);
  }

  shipsAtWaypoint(waypointSymbol: string): ShipData[] {
    return this.ships().filter((s) => s.nav.waypointSymbol === waypointSymbol);
  }

  loadShipCargo(shipSymbol: string): void {
    void this.shipActions.loadShipCargo(shipSymbol);
  }

  jettisonCargo(): void {
    void this.shipActions.jettisonCargo();
  }

  transferCargoAction(): void {
    void this.shipActions.transferCargoAction();
  }

  loadShipMounts(shipSymbol: string): void {
    void this.shipActions.loadShipMounts(shipSymbol);
  }

  installMountAction(shipSymbol: string): void {
    void this.shipActions.installMountAction(shipSymbol);
  }

  removeMountAction(shipSymbol: string, symbol: string): void {
    void this.shipActions.removeMountAction(shipSymbol, symbol);
  }

  installModuleAction(shipSymbol: string): void {
    void this.shipActions.installModuleAction(shipSymbol);
  }

  removeModuleAction(shipSymbol: string, symbol: string): void {
    void this.shipActions.removeModuleAction(shipSymbol, symbol);
  }

  loadShipMaintenance(shipSymbol: string): void {
    void this.shipActions.loadShipMaintenance(shipSymbol);
  }

  repairShipAction(): void {
    void this.shipActions.repairShipAction();
  }

  scrapShipAction(): void {
    void this.shipActions.scrapShipAction();
  }
}
