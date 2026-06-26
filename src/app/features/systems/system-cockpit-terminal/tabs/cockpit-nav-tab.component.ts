import { Component, computed, inject, input } from '@angular/core';
import { ShipNavFlightMode } from '../../../../models/ship.model';
import { PlanetView } from '../../../../models/system.model';
import { CockpitLogService } from '../../cockpit-log.service';
import {
  flightModeDescription,
  shipDocked,
  shipFlightModeClass,
  shipInOrbit,
  shipInSystem,
  shipStatusClass,
} from '../../planet-helpers';
import { ShipActionsService } from '../../ship-actions.service';
import { SystemMapStore } from '../../system-map.store';
import { TravelIntent } from '../../travel-plan';

const FLIGHT_MODES: ShipNavFlightMode[] = ['DRIFT', 'STEALTH', 'CRUISE', 'BURN'];

@Component({
  selector: 'app-cockpit-nav-tab',
  templateUrl: './cockpit-nav-tab.component.html',
})
export class CockpitNavTabComponent {
  private readonly mapStore = inject(SystemMapStore);
  private readonly shipActions = inject(ShipActionsService);
  private readonly cockpitLog = inject(CockpitLogService);

  readonly openTravel = input.required<(planet: PlanetView, intent: TravelIntent) => void>();

  readonly selectedPlanet = this.mapStore.selectedPlanet;
  readonly ships = this.mapStore.ships;
  readonly selectedShip = this.mapStore.selectedShip;
  readonly construction = this.shipActions.construction;
  readonly flightMode = this.shipActions.flightMode;
  readonly refuelShipSymbol = this.shipActions.refuelShipSymbol;
  readonly refuelUnits = this.shipActions.refuelUnits;
  readonly supplyShip = this.shipActions.supplyShip;
  readonly supplyMaterial = this.shipActions.supplyMaterial;
  readonly supplyUnits = this.shipActions.supplyUnits;

  readonly terminalShip = computed(() => {
    const ship = this.selectedShip();
    if (ship) return ship;
    const planet = this.selectedPlanet();
    if (!planet) return null;
    return this.ships().find((s) => s.nav.waypointSymbol === planet.name) ?? null;
  });

  readonly flightModes = FLIGHT_MODES;
  readonly shipDocked = shipDocked;
  readonly shipInOrbit = shipInOrbit;
  readonly shipInSystem = shipInSystem;
  readonly shipStatusClass = shipStatusClass;
  readonly shipFlightModeClass = shipFlightModeClass;
  readonly flightModeDescription = flightModeDescription;

  actionLoading(key: string): boolean {
    return this.cockpitLog.actionLoading(key);
  }

  dockedAt(waypointSymbol: string) {
    return this.ships().filter(
      (s) => s.nav.waypointSymbol === waypointSymbol && s.nav.status === 'DOCKED',
    );
  }

  shipsThatCanNavigate(planet: PlanetView) {
    return this.ships().filter(
      (s) =>
        shipInSystem(s, planet.system) &&
        shipInOrbit(s) &&
        s.nav.waypointSymbol !== planet.name,
    );
  }

  setFlightMode(shipSymbol: string): void {
    void this.shipActions.setFlightMode(shipSymbol);
  }

  orbitShip(shipSymbol: string): void {
    void this.shipActions.orbitShip(shipSymbol);
  }

  dockShip(shipSymbol: string): void {
    void this.shipActions.dockShip(shipSymbol);
  }

  chartShip(shipSymbol: string): void {
    void this.shipActions.chartShip(shipSymbol);
  }

  refuelShipAction(): void {
    void this.shipActions.refuelShipAction();
  }

  navigateShip(shipSymbol: string): void {
    void this.shipActions.navigateShip(shipSymbol);
  }

  warpShip(shipSymbol: string): void {
    void this.shipActions.warpShip(shipSymbol);
  }

  loadConstruction(): void {
    void this.shipActions.loadConstruction();
  }

  supplyConstruction(): void {
    void this.shipActions.supplyConstruction();
  }
}
