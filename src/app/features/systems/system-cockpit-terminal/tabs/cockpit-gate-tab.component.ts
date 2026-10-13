import { Component, computed, inject } from '@angular/core';
import { CockpitLogService } from '../../cockpit-log.service';
import { terminalShipFor } from '../../planet-helpers';
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

  readonly terminalShip = computed(() =>
    terminalShipFor(this.selectedShip(), this.selectedPlanet(), this.ships()),
  );

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
