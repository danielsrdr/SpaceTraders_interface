import { Component, computed, inject } from '@angular/core';
import { CockpitLogService } from '../../cockpit-log.service';
import { ShipActionsService } from '../../ship-actions.service';
import { SystemMapStore } from '../../system-map.store';

@Component({
  selector: 'app-cockpit-scan-tab',
  templateUrl: './cockpit-scan-tab.component.html',
})
export class CockpitScanTabComponent {
  private readonly mapStore = inject(SystemMapStore);
  private readonly shipActions = inject(ShipActionsService);
  private readonly cockpitLog = inject(CockpitLogService);

  readonly selectedShip = this.mapStore.selectedShip;
  readonly selectedPlanet = this.mapStore.selectedPlanet;
  readonly ships = this.mapStore.ships;
  readonly scanResults = this.shipActions.scanResults;
  readonly shipScanResults = this.shipActions.shipScanResults;
  readonly surfaceScanResults = this.shipActions.surfaceScanResults;
  readonly shipSurveys = this.shipActions.shipSurveys;

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

  scanSystems(shipSymbol: string): void {
    void this.shipActions.scanSystems(shipSymbol);
  }

  scanWaypoints(shipSymbol: string): void {
    void this.shipActions.scanWaypoints(shipSymbol);
  }

  scanShips(shipSymbol: string): void {
    void this.shipActions.scanShips(shipSymbol);
  }

  scanSurface(shipSymbol: string): void {
    void this.shipActions.scanSurface(shipSymbol);
  }

  extractResources(shipSymbol: string): void {
    void this.shipActions.extractResources(shipSymbol);
  }

  siphonResources(shipSymbol: string): void {
    void this.shipActions.siphonResources(shipSymbol);
  }

  surveyWaypoint(shipSymbol: string): void {
    void this.shipActions.surveyWaypoint(shipSymbol);
  }

  extractWithSurvey(shipSymbol: string, survey: unknown): void {
    void this.shipActions.extractWithSurvey(shipSymbol, survey);
  }

  formatSurfaceDeposit(deposit: unknown): string {
    if (deposit && typeof deposit === 'object' && 'symbol' in deposit) {
      const d = deposit as { symbol?: string; size?: number; type?: string };
      return [d.symbol, d.type, d.size != null ? `size ${d.size}` : null].filter(Boolean).join(' · ');
    }
    return String(deposit);
  }

  formatShipScan(ship: unknown): string {
    if (ship && typeof ship === 'object' && 'symbol' in ship) {
      const s = ship as { symbol?: string; registration?: { role?: string } };
      return `${s.symbol ?? '?'} · ${s.registration?.role ?? 'unknown'}`;
    }
    return String(ship);
  }

  formatSurvey(survey: unknown): string {
    if (survey && typeof survey === 'object') {
      const s = survey as { symbol?: string; type?: string; deposits?: unknown[] };
      return [s.symbol, s.type, s.deposits?.length ? `${s.deposits.length} deposits` : null]
        .filter(Boolean)
        .join(' · ');
    }
    return 'Survey';
  }
}
