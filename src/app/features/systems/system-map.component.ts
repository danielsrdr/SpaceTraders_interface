import {
  AfterViewInit,
  Component,
  computed,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AgentStore } from '../../core/state/agent.store';
import { FleetStore } from '../../core/state/fleet.store';
import { FlightRecorderStore, Voyage } from '../../core/state/flight-recorder.store';
import { getAgentSystem } from '../../models/agent.model';
import { ShipData, ShipNavFlightMode } from '../../models/ship.model';
import { hasTrait, PlanetView } from '../../models/system.model';
import { PageBackgroundService } from '../../shared/services/page-background.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import {
  formatRouteEta,
  shipAtWaypoint,
  shipDocked,
  shipInTransit,
  shipsOnMap,
} from './planet-helpers';
import { PlanetSurfaceViewComponent } from './planet-surface-view.component';
import { SystemFlightViewComponent } from './system-flight-view.component';
import { TravelModalComponent } from './travel-modal.component';
import {
  buildTravelPlan,
  pickShipForTravel,
  shipsAvailableForTravel,
  type TravelIntent,
  type TravelPlanStep,
} from './travel-plan';
import { type SurfaceZoneKind } from './three/system-view-mode';
import { TravelExecutorService } from './travel-executor.service';
import { buildRouteNodes } from './routing/route-graph';
import { planRoute, RoutePlan } from './routing/route-planner';
import { buildSnapshot, encodeSnapshotWithGuard } from '../spectate/spectate-state';
import { shareOrCopyUrl } from '../../shared/share.util';
import { PostcardDialogComponent } from '../postcard/postcard-dialog.component';
import { PostcardOptions } from '../postcard/postcard-canvas';
import { type SurfaceContractBeacon } from './three/surface-contract-beacons';
import { SystemMapStore } from './system-map.store';
import { SystemViewModeStore } from './three/system-view-mode.store';
import { ShipActionsService } from './ship-actions.service';
import { CockpitLogService } from './cockpit-log.service';
import { SurfaceMapBridgeService } from './surface-map-bridge.service';
import { MarketOverlayComponent } from './market-overlay/market-overlay.component';
import { SystemSidebarComponent } from './system-sidebar/system-sidebar.component';
import { SystemCockpitTerminalComponent } from './system-cockpit-terminal/system-cockpit-terminal.component';
import { NotificationDrawerService } from '../../shared/services/notification-drawer.service';
import { LogbookDrawerService } from '../../shared/services/logbook-drawer.service';
import { NotificationStore } from '../../core/state/notification.store';
import { LogbookStore } from '../../core/state/logbook.store';

const FLIGHT_MODES: ShipNavFlightMode[] = ['DRIFT', 'STEALTH', 'CRUISE', 'BURN'];

@Component({
  selector: 'app-system-map',
  imports: [
    SystemFlightViewComponent,
    PlanetSurfaceViewComponent,
    TravelModalComponent,
    PostcardDialogComponent,
    MarketOverlayComponent,
    SystemSidebarComponent,
    SystemCockpitTerminalComponent,
  ],
  templateUrl: './system-map.component.html',
  host: { class: 'block h-full min-h-0' },
})
export class SystemMapComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly mapStore = inject(SystemMapStore);
  private readonly viewModeStore = inject(SystemViewModeStore);
  private readonly shipActions = inject(ShipActionsService);
  private readonly cockpitLog = inject(CockpitLogService);
  private readonly surfaceBridge = inject(SurfaceMapBridgeService);

  private readonly agentStore = inject(AgentStore);
  private readonly fleetStore = inject(FleetStore);
  private readonly flightRecorder = inject(FlightRecorderStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly background = inject(PageBackgroundService);
  private readonly snackbar = inject(SnackbarService);
  private readonly travelExecutor = inject(TravelExecutorService);
  private readonly notificationDrawer = inject(NotificationDrawerService);
  private readonly logbookDrawer = inject(LogbookDrawerService);
  readonly notificationStore = inject(NotificationStore);
  readonly logbookStore = inject(LogbookStore);

  readonly ghostFleet = this.mapStore.ghostFleet;
  readonly systemData = this.mapStore.systemData;
  readonly systemSymbol = this.mapStore.systemSymbol;
  readonly planets = this.mapStore.planets;
  readonly selectedPlanet = this.mapStore.selectedPlanet;
  readonly ships = this.mapStore.ships;
  readonly selectedShip = this.mapStore.selectedShip;
  readonly contractWaypoints = this.mapStore.contractWaypoints;
  readonly surfaceContractBeacons = this.mapStore.surfaceContractBeacons;
  readonly transitTick = this.mapStore.transitTick;

  readonly viewMode = this.viewModeStore.viewMode;
  readonly landingPlanet = this.viewModeStore.landingPlanet;
  readonly surfaceEntryActive = this.viewModeStore.surfaceEntryActive;
  readonly launchHandoffActive = this.viewModeStore.launchHandoffActive;
  readonly pendingMarketOpen = this.viewModeStore.pendingMarketOpen;

  readonly market = this.shipActions.market;
  readonly shipyard = this.shipActions.shipyard;
  readonly shipCargo = this.shipActions.shipCargo;
  readonly surfaceScanDeposits = this.shipActions.surfaceScanDeposits;
  readonly flightMode = this.shipActions.flightMode;

  readonly actionPulse = this.cockpitLog.actionPulse;

  readonly searchQuery = signal('');
  readonly focusPlanetName = signal<string | null>(null);
  readonly focusShipSymbol = signal<string | null>(null);
  readonly terminalVisible = signal(false);
  readonly travelModalOpen = signal(false);
  readonly travelModalTarget = signal<PlanetView | null>(null);
  readonly travelIntent = signal<TravelIntent>('visit');
  readonly travelModalShipSymbol = signal<string | null>(null);
  readonly travelExecuting = signal(false);
  readonly marketOverlayOpen = signal(false);
  readonly postcardOptions = signal<PostcardOptions | null>(null);
  readonly replayVoyage = signal<Voyage | null>(null);

  readonly ghostShipsOnMap = computed(() =>
    this.ghostFleet.enabled() ? this.ghostFleet.ghostsForSystem(this.systemSymbol()) : [],
  );

  readonly surfaceCaptain = computed(() => {
    const agent = this.agentStore.agent();
    if (!agent) return null;
    return { name: agent.name, faction: agent.faction, credits: agent.credits };
  });

  readonly surfaceBoardingShip = computed(() => {
    const planet = this.selectedPlanet();
    if (!planet) return null;
    const docked = this.shipsForWaypoint(planet).filter((s) => shipDocked(s));
    if (!docked.length) return null;
    const selected = this.selectedShip();
    if (selected && shipDocked(selected) && shipAtWaypoint(selected, planet.name)) {
      return selected;
    }
    return docked[0] ?? null;
  });

  readonly travelRoute = computed((): RoutePlan | null => {
    const target = this.travelModalTarget();
    const symbol = this.travelModalShipSymbol();
    if (!target || !symbol) return null;
    const ship = this.ships().find((s) => s.symbol === symbol);
    if (!ship) return null;
    if (ship.nav.systemSymbol !== target.system) return null;
    const start = ship.nav.waypointSymbol;
    if (start === target.name) return null;
    return planRoute({
      nodes: buildRouteNodes(this.planets()),
      start,
      goal: target.name,
      tankCapacity: ship.fuel.capacity,
      currentFuel: ship.fuel.current,
      flightMode: this.flightMode(),
    });
  });

  readonly travelModalShips = computed(() => {
    const target = this.travelModalTarget();
    if (!target) return [];
    return shipsAvailableForTravel(target, this.ships());
  });

  readonly terminalOpen = computed(
    () =>
      this.terminalVisible() && (!!this.selectedPlanet() || !!this.selectedShip()),
  );

  readonly showReopenTerminal = computed(
    () =>
      !this.terminalVisible() && (!!this.selectedPlanet() || !!this.selectedShip()),
  );

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

  readonly formatRouteEta = formatRouteEta;
  readonly shipInTransit = shipInTransit;
  readonly shipsOnMap = shipsOnMap;
  readonly flightModes = FLIGHT_MODES;

  readonly cargoUnitsOfFn = (symbol: string): number => this.cargoUnitsOf(symbol);
  readonly shipEtaFn = (ship: ShipData): string => this.shipEta(ship);

  ngOnInit(): void {
    this.background.backgroundImage.set('none');
    void this.loadShips();
  }

  ngAfterViewInit(): void {
    const shipParam = this.route.snapshot.queryParamMap.get('ship');
    if (shipParam) {
      this.fleetStore.selectShipBySymbol(shipParam);
      this.focusShipSymbol.set(shipParam);
      this.terminalVisible.set(true);
    }

    const name =
      this.route.snapshot.queryParamMap.get('name') ??
      (this.agentStore.agent() ? getAgentSystem(this.agentStore.agent()!) : '');
    const tryFallback = this.route.snapshot.queryParamMap.get('fallback') === '1';
    const travelTo = this.route.snapshot.queryParamMap.get('travelTo');
    const replayId = this.route.snapshot.queryParamMap.get('replay');

    void this.loadSystem(name, tryFallback).then(() => {
      if (travelTo) void this.openTravelFromQuery(travelTo);
      if (replayId) this.startReplayFromQuery(replayId);
    });
  }

  ngOnDestroy(): void {
    this.mapStore.stopTransitPolling();
  }

  cargoUnitsOf(symbol: string): number {
    const cargo = this.shipCargo();
    if (!cargo) return 0;
    return cargo.inventory.find((item) => item.symbol === symbol)?.units ?? 0;
  }

  onMarketSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  async shareSpectatorLink(): Promise<void> {
    const planets = this.planets();
    if (!planets.length) {
      this.snackbar.show('Load a system before sharing a spectator link.', 'warning');
      return;
    }
    const agent = this.agentStore.agent();
    const snapshot = buildSnapshot({
      systemSymbol: this.systemSymbol(),
      systemName: this.systemData()?.name ?? this.systemSymbol(),
      planets,
      ships: this.ships(),
      captain: { name: agent?.name ?? 'Anonymous captain', faction: agent?.faction ?? '' },
    });
    try {
      const { payload, droppedShips } = await encodeSnapshotWithGuard(snapshot);
      const url = `${location.origin}/spectate#s=${payload}`;
      const result = await shareOrCopyUrl(url, `Spectate ${snapshot.systemName}`);
      if (result === 'failed') {
        this.snackbar.show('Could not create the spectator link.', 'error');
      } else if (result === 'copied') {
        this.snackbar.show(
          droppedShips
            ? 'Spectator link copied (fleet omitted — system too large).'
            : 'Spectator link copied to clipboard.',
          'success',
        );
      }
    } catch {
      this.snackbar.show('Could not create the spectator link.', 'error');
    }
  }

  openPostcard(): void {
    if (!this.planets().length) {
      this.snackbar.show('Load a system before making a postcard.', 'warning');
      return;
    }
    const agent = this.agentStore.agent();
    this.postcardOptions.set({
      systemSymbol: this.systemSymbol(),
      systemName: this.systemData()?.name ?? this.systemSymbol(),
      planets: this.planets(),
      highlightWaypoint: this.selectedPlanet()?.name ?? null,
      captain: {
        name: agent?.name ?? 'Anonymous captain',
        faction: agent?.faction ?? '',
        credits: agent?.credits,
      },
    });
  }

  closePostcard(): void {
    this.postcardOptions.set(null);
  }

  async selectPlanet(planet: PlanetView, options?: { keepShip?: boolean }): Promise<void> {
    this.selectedPlanet.set(planet);
    if (!options?.keepShip) {
      this.fleetStore.selectShip(null);
      this.focusShipSymbol.set(null);
    }
    this.terminalVisible.set(true);
    this.shipActions.detailPanel.set('info');
    this.shipActions.clearDetailData();
    this.focusPlanet(planet);
    await this.mapStore.loadWaypointDetail(planet);
  }

  focusPlanet(planet: PlanetView): void {
    this.focusPlanetName.set(planet.name);
  }

  async onPlanetClick(planet: PlanetView): Promise<void> {
    await this.selectPlanet(planet, { keepShip: true });
    this.openTravelModal(planet, 'visit');
  }

  openTravelModal(planet: PlanetView, intent: TravelIntent): void {
    void this.selectPlanet(planet, { keepShip: true });
    this.travelModalTarget.set(planet);
    this.travelIntent.set(intent);
    const picked = pickShipForTravel(planet, this.selectedShip(), this.ships());
    this.travelModalShipSymbol.set(picked?.symbol ?? this.selectedShip()?.symbol ?? null);
    if (picked) {
      this.flightMode.set((picked.nav.flightMode as ShipNavFlightMode) || 'CRUISE');
    }
    this.travelModalOpen.set(true);
  }

  closeTravelModal(): void {
    this.travelModalOpen.set(false);
    this.travelModalTarget.set(null);
    this.travelExecuting.set(false);
  }

  onTravelShipChange(symbol: string): void {
    this.travelModalShipSymbol.set(symbol || null);
    const ship = this.ships().find((s) => s.symbol === symbol);
    if (ship) {
      this.fleetStore.selectShip(ship);
      this.flightMode.set((ship.nav.flightMode as ShipNavFlightMode) || 'CRUISE');
    }
  }

  async onTravelConfirm(): Promise<void> {
    const planet = this.travelModalTarget();
    const shipSymbol = this.travelModalShipSymbol();
    if (!planet || !shipSymbol) return;

    const ship = this.ships().find((s) => s.symbol === shipSymbol);
    if (!ship) return;

    const steps = buildTravelPlan(planet, ship, this.travelIntent(), this.flightMode());
    if (!steps.length) {
      this.snackbar.show('Nothing to do — you are already at this waypoint.', 'info');
      this.closeTravelModal();
      return;
    }

    this.travelExecuting.set(true);
    this.fleetStore.selectShip(ship);
    this.pendingMarketOpen.set(
      this.travelIntent() === 'market' && hasTrait(planet, 'MARKETPLACE'),
    );
    this.travelModalOpen.set(false);
    this.travelModalTarget.set(null);
    this.snackbar.show(`${shipSymbol} en route to ${planet.name}`, 'success');

    try {
      await this.executeTravelSteps(planet, shipSymbol, steps);
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Travel failed', 'error');
    } finally {
      this.travelExecuting.set(false);
    }
  }

  closeMarketOverlay(): void {
    this.marketOverlayOpen.set(false);
  }

  toggleNotifications(): void {
    this.notificationDrawer.toggle();
    if (this.notificationDrawer.open()) {
      this.notificationStore.markAllRead();
    }
  }

  toggleLogbook(): void {
    this.logbookDrawer.toggle();
  }

  onTerminalClose(): void {
    this.terminalVisible.set(false);
  }

  openTerminal(): void {
    if (this.selectedPlanet() || this.selectedShip()) {
      this.terminalVisible.set(true);
    }
  }

  async onPlanetLandingRequest(planet: PlanetView): Promise<void> {
    await this.onPlanetClick(planet);
  }

  onLandingComplete(): void {
    this.viewModeStore.dispatch({ type: 'LANDING_COMPLETE' });
    void this.continuePendingTravel();
    const planet = this.selectedPlanet();
    if (planet && hasTrait(planet, 'MARKETPLACE')) void this.shipActions.loadMarket();
    if (planet && hasTrait(planet, 'SHIPYARD')) void this.shipActions.loadShipyard();
    void this.mapStore.refreshSurfaceContractBeacons();
  }

  onSurfaceEntryComplete(): void {
    this.viewModeStore.onSurfaceEntryComplete();
    this.surfaceBridge.onSurfaceEntryComplete();
  }

  onExitSurface(): void {
    this.viewModeStore.dispatch({ type: 'EXIT_SURFACE' });
  }

  onLaunchComplete(): void {
    this.viewModeStore.dispatch({ type: 'LAUNCH_COMPLETE' });
    this.shipActions.detailPanel.set('info');
    this.cockpitLog.pulse();
  }

  onSurfaceZoneInteract(kind: SurfaceZoneKind): Promise<void> {
    return this.surfaceBridge.onSurfaceZoneInteract(kind);
  }

  onSurfaceOreBroken(_event: { blockKey: string }): Promise<void> {
    return this.surfaceBridge.onSurfaceOreBroken();
  }

  onSurfaceCartDelivered(): Promise<void> {
    return this.surfaceBridge.onSurfaceCartDelivered();
  }

  onSurfaceRuinsScanned(): void {
    this.surfaceBridge.onSurfaceRuinsScanned();
  }

  onSurfaceCaveMapped(event: { percent: number }): void {
    this.surfaceBridge.onSurfaceCaveMapped(event);
  }

  onSurfaceContractDeliver(beacon: SurfaceContractBeacon): Promise<void> {
    return this.surfaceBridge.onSurfaceContractDeliver(beacon);
  }

  onSurfaceMarketTrade(event: { symbol: string; mode: 'buy' | 'sell'; units: number }): Promise<void> {
    return this.surfaceBridge.onSurfaceMarketTrade(event);
  }

  selectShip(ship: ShipData): void {
    this.fleetStore.selectShip(ship);
    this.selectedPlanet.set(null);
    this.terminalVisible.set(true);
    this.shipActions.detailPanel.set('info');
    this.shipActions.clearDetailData();
    this.pushLog('UPLINK · ' + ship.symbol + ' ONLINE');
    this.flightMode.set((ship.nav.flightMode as ShipNavFlightMode) || 'CRUISE');
    this.focusShipSymbol.set(ship.symbol);

    const planet = this.planets().find((p) => p.name === ship.nav.waypointSymbol);
    if (planet) this.focusPlanet(planet);
    if (shipInTransit(ship) && ship.nav.route) {
      const dest = this.planets().find((p) => p.name === ship.nav.route!.destination.symbol);
      if (dest) this.focusPlanet(dest);
    }
  }

  selectNextShip(): void {
    this.fleetStore.selectNextInSystem(this.systemSymbol());
    const ship = this.selectedShip();
    if (ship) this.selectShip(ship);
  }

  selectPrevShip(): void {
    this.fleetStore.selectPrevInSystem(this.systemSymbol());
    const ship = this.selectedShip();
    if (ship) this.selectShip(ship);
  }

  @HostListener('document:keydown', ['$event'])
  onFleetKeydown(event: KeyboardEvent): void {
    if (this.viewMode() !== 'flight') return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
      return;
    }
    if (event.key >= '1' && event.key <= '9') {
      const index = Number(event.key) - 1;
      this.fleetStore.selectByIndexInSystem(this.systemSymbol(), index);
      const ship = this.selectedShip();
      if (ship) this.selectShip(ship);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowRight') {
      this.selectNextShip();
      event.preventDefault();
    }
    if (event.key === 'ArrowLeft') {
      this.selectPrevShip();
      event.preventDefault();
    }
  }

  dockedAt(waypointSymbol: string): ShipData[] {
    return this.ships().filter(
      (s) => s.nav.waypointSymbol === waypointSymbol && s.nav.status === 'DOCKED',
    );
  }

  shipsForWaypoint(planet: PlanetView): ShipData[] {
    return this.ships().filter(
      (s) => s.nav.systemSymbol === planet.system && s.nav.waypointSymbol === planet.name,
    );
  }

  shipEta(ship: ShipData): string {
    this.transitTick();
    return formatRouteEta(ship.nav.route);
  }

  pushLog(text: string, tone: 'info' | 'success' | 'error' = 'info'): void {
    this.cockpitLog.pushLog(text, tone);
  }

  onReplayExit(): void {
    this.replayVoyage.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { replay: null },
      queryParamsHandling: 'merge',
    });
  }

  private startReplayFromQuery(idStr: string): void {
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    const voyage = this.flightRecorder.voyages().find((v) => v.id === id);
    if (!voyage) {
      this.snackbar.show('Recorded voyage not found.', 'warning');
      return;
    }
    this.viewModeStore.viewMode.set('flight');
    this.replayVoyage.set(voyage);
  }

  private async openTravelFromQuery(travelTo: string): Promise<void> {
    if (!this.planets().length) return;
    await this.loadShips();
    const planet = this.planets().find((p) => p.name === travelTo);
    if (!planet) {
      this.snackbar.show(`Destination ${travelTo} not charted in ${this.systemSymbol()}`, 'warning');
      return;
    }
    this.openTravelModal(planet, 'visit');
  }

  private async loadSystem(sysName: string, tryFallback: boolean): Promise<void> {
    this.shipActions.clearDetailData();
    await this.mapStore.loadSystem(sysName, tryFallback);
    this.syncFocusFromSelection();
  }

  private loadShips(): Promise<void> {
    return this.mapStore.loadShips().then(() => this.syncFocusFromSelection());
  }

  private syncFocusFromSelection(): void {
    const ship = this.selectedShip();
    if (!ship) return;
    this.focusShipSymbol.set(ship.symbol);
    const planet = this.planets().find((p) => p.name === ship.nav.waypointSymbol);
    if (planet) this.focusPlanet(planet);
  }

  private async executeTravelSteps(
    planet: PlanetView,
    shipSymbol: string,
    steps: TravelPlanStep[],
  ): Promise<void> {
    await this.travelExecutor.executeSteps(steps, {
      shipSymbol,
      planet,
      reloadShips: () => this.loadShips(),
      getShips: () => this.ships(),
      onSurface: (p, remaining) => {
        this.viewModeStore.dispatch({
          type: 'START_LANDING',
          planet: p,
          pendingSteps: remaining,
        });
      },
      onOpenMarket: async () => {
        await this.shipActions.loadMarket();
        this.marketOverlayOpen.set(true);
        this.pendingMarketOpen.set(false);
      },
    });
  }

  private async continuePendingTravel(): Promise<void> {
    const steps = this.viewModeStore.takePendingTravelSteps();
    const planet = this.selectedPlanet();
    const ship = this.selectedShip();
    if (!steps.length || !planet || !ship) return;
    try {
      await this.executeTravelSteps(planet, ship.symbol, steps);
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Travel failed', 'error');
    }
  }
}
