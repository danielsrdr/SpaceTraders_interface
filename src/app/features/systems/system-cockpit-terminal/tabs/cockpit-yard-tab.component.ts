import { Component, inject } from '@angular/core';
import { CockpitLogService } from '../../cockpit-log.service';
import { ShipActionsService } from '../../ship-actions.service';

@Component({
  selector: 'app-cockpit-yard-tab',
  templateUrl: './cockpit-yard-tab.component.html',
})
export class CockpitYardTabComponent {
  private readonly shipActions = inject(ShipActionsService);
  private readonly cockpitLog = inject(CockpitLogService);

  readonly shipyard = this.shipActions.shipyard;
  readonly purchaseShipType = this.shipActions.purchaseShipType;

  actionLoading(key: string): boolean {
    return this.cockpitLog.actionLoading(key);
  }

  loadShipyard(): void {
    void this.shipActions.loadShipyard();
  }

  purchaseShipDirect(): void {
    void this.shipActions.purchaseShipDirect();
  }
}
