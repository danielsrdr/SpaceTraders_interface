import { inject, Injectable, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FleetStore } from '../../core/state/fleet.store';
import { GhostFleetService } from '../../shared/services/ghost-fleet.service';
import { ShipCommandContextService } from '../../shared/services/ship-command-context.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { DialogService } from '../../shared/services/dialog.service';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { mapWaypoint, PlanetView, SystemData, WaypointData } from '../../models/system.model';
import { type ContractView } from '../../models/contract.model';
import { shipsOnMap, shipInTransit } from './planet-helpers';
import { ContractOptimizerService } from './contract-optimizer.service';
import { resolveSurfaceContractBeacons, type SurfaceContractBeacon } from './three/surface-contract-beacons';
import { buildSurfacePoiConfig } from './three/surface-poi';

@Injectable({ providedIn: 'root' })
export class SystemMapStore {
  private readonly api = inject(SpaceTradersApiService);
  private readonly fleetStore = inject(FleetStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(SnackbarService);
  private readonly dialog = inject(DialogService);
  private readonly shipCommandContext = inject(ShipCommandContextService);
  private readonly contractOptimizer = inject(ContractOptimizerService);
  readonly ghostFleet = inject(GhostFleetService);

  readonly systemData = signal<SystemData | null>(null);
  readonly systemSymbol = signal('');
  readonly planets = signal<PlanetView[]>([]);
  readonly selectedPlanet = signal<PlanetView | null>(null);
  readonly waypointDetail = signal<WaypointData | null>(null);
  readonly contractWaypoints = signal<Set<string>>(new Set());
  readonly surfaceContractBeacons = signal<SurfaceContractBeacon[]>([]);
  readonly transitTick = signal(0);

  activeContracts: ContractView[] = [];

  readonly ships = this.fleetStore.ships;
  readonly selectedShip = this.fleetStore.selectedShip;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private beginnerDialogShown = false;

  syncSelectedFromList(): void {
    this.fleetStore.syncSelectedFromList();
  }

  async loadShips(): Promise<void> {
    try {
      await this.fleetStore.refreshShips();
      this.syncTransitPolling();
      if (this.planets().length && !this.selectedShip()) {
        this.applyBeginnerDefaults();
      }
    } catch {
      // Ship actions hidden when unavailable
    }
  }

  async loadSystem(sysName: string, tryFallback: boolean): Promise<void> {
    if (!sysName) {
      this.snackbar.show('No system specified', 'error');
      void this.router.navigate(['/home']);
      return;
    }

    this.systemSymbol.set(sysName);
    this.ghostFleet.setSystem(sysName);
    this.selectedPlanet.set(null);

    try {
      const system = await this.api.getSystem(sysName);
      this.systemData.set(system);
      await this.reloadWaypoints();
    } catch {
      if (tryFallback) {
        await this.handleInvalidSystem(sysName);
      } else {
        this.snackbar.show(`System not found: ${sysName}`, 'error');
        void this.router.navigate(['/home']);
      }
    }
  }

  async reloadWaypoints(): Promise<void> {
    const sysName = this.systemSymbol();
    try {
      const waypoints = await this.api.getAllWaypoints(sysName);
      const planetViews = waypoints.map(mapWaypoint);
      this.planets.set(planetViews);
      this.shipCommandContext.setContext(sysName, planetViews);
      this.applyBeginnerDefaults();
      void this.refreshContractHighlights();
    } catch {
      this.snackbar.show('Failed to load waypoints', 'error');
    }
  }

  async refreshContractHighlights(): Promise<void> {
    const sysName = this.systemSymbol();
    if (!sysName) return;
    try {
      const set = await this.contractOptimizer.computeForSystem(sysName, this.planets());
      this.contractWaypoints.set(set);
    } catch {
      // Highlights are best-effort
    }
  }

  async refreshSurfaceContractBeacons(): Promise<void> {
    const planet = this.selectedPlanet();
    if (!planet) {
      this.surfaceContractBeacons.set([]);
      return;
    }
    try {
      const raw = await this.api.getContracts();
      this.activeContracts = raw;
      const pois = buildSurfacePoiConfig(planet).pois;
      this.surfaceContractBeacons.set(
        resolveSurfaceContractBeacons(this.activeContracts, planet, pois),
      );
    } catch {
      this.surfaceContractBeacons.set([]);
    }
  }

  async loadWaypointDetail(planet: PlanetView): Promise<void> {
    try {
      const detail = await this.api.getWaypoint(planet.system, planet.name);
      this.waypointDetail.set(detail);
      const updated = mapWaypoint(detail);
      this.selectedPlanet.set(updated);
    } catch {
      this.waypointDetail.set(null);
    }
  }

  applyBeginnerDefaults(): void {
    const sys = this.systemSymbol();
    const onMap = shipsOnMap(this.ships(), sys);
    const inSystem = onMap.filter((s) => !shipInTransit(s));
    const hasShipParam = !!this.route.snapshot.queryParamMap.get('ship');

    if (!hasShipParam && !this.selectedShip() && onMap.length) {
      const target = inSystem[0] ?? onMap[0]!;
      this.fleetStore.selectShip(target);
      const planet = this.planets().find((p) => p.name === target.nav.waypointSymbol);
      if (planet) this.selectedPlanet.set(planet);
    }

    if (!this.beginnerDialogShown && !inSystem.length && this.ships().length) {
      const elsewhere = this.ships().find((s) => s.nav.systemSymbol !== sys);
      if (elsewhere) {
        this.beginnerDialogShown = true;
        this.dialog.showInfo(
          'Ships in another system',
          `No ships in ${sys}. Your fleet is in ${elsewhere.nav.systemSymbol}.\n\nSwitch to that system?`,
          () => {
            void this.router.navigate(['/systems'], {
              queryParams: { name: elsewhere.nav.systemSymbol, fallback: '0' },
            });
          },
        );
      }
    }
  }

  stopTransitPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  syncTransitPolling(): void {
    const inTransit = shipsOnMap(this.ships(), this.systemSymbol()).some(shipInTransit);
    if (inTransit) {
      this.transitTick.update((n) => n + 1);
      if (!this.pollTimer) {
        this.pollTimer = setInterval(() => void this.loadShips(), 4000);
      }
    } else {
      this.stopTransitPolling();
    }
  }

  private async handleInvalidSystem(sysName: string): Promise<void> {
    try {
      const ships = await this.api.getAllShips();
      if (ships.length > 0) {
        const shipSystem = ships[0].nav.systemSymbol;
        if (shipSystem !== sysName) {
          void this.router.navigate(['/systems'], {
            queryParams: { name: shipSystem, fallback: '0' },
          });
          return;
        }
      }
      const systems = await this.api.getSystems(1, 1);
      const valid = systems.data[0]?.symbol;
      if (valid) {
        this.dialog.showInfo(
          'System Not Found',
          `System not found: ${sysName}\n\nYour agent was created before the API reset.\nLoading system ${valid} for demonstration.`,
          () => {
            void this.router.navigate(['/systems'], {
              queryParams: { name: valid, fallback: '0' },
            });
          },
        );
      } else {
        this.dialog.showInfo(
          'Error',
          'Cannot find any valid system. Please create a new agent.',
          () => void this.router.navigate(['/home']),
        );
      }
    } catch {
      this.dialog.showInfo(
        'System Not Found',
        `System not found: ${sysName}\n\nPlease create a new agent.`,
        () => void this.router.navigate(['/home']),
      );
    }
  }
}
