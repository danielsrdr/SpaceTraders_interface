import { Component, computed, inject } from '@angular/core';
import { CockpitLogService } from '../../cockpit-log.service';
import { ShipActionsService } from '../../ship-actions.service';
import { SystemMapStore } from '../../system-map.store';

@Component({
  selector: 'app-cockpit-gate-tab',
  templateUrl: './cockpit-gate-tab.component.html',
})
export class CockpitGateTabComponent {
  private readonly mapStore = inject(SystemMapStore);
  private readonly shipActions = inject(ShipActionsService);
  private readonly cockpitLog = inject(CockpitLogService);

  readonly selectedShip = this.mapStore.selectedShip;
  readonly selectedPlanet = this.mapStore.selectedPlanet;
  readonly ships = this.mapStore.ships;
  readonly jumpGate = this.shipActions.jumpGate;
  readonly jumpTarget = this.shipActions.jumpTarget;

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

  loadJumpGate(): void {
    void this.shipActions.loadJumpGate();
  }

  jumpShip(shipSymbol: string): void {
    void this.shipActions.jumpShip(shipSymbol);
  }
}
