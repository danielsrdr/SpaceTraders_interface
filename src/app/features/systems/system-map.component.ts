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

import { DiscoveryStore } from '../../core/state/discovery.store';

import { logCategoryClass, LogbookStore, LogEntry } from '../../core/state/logbook.store';
import { FlightRecorderStore, Voyage } from '../../core/state/flight-recorder.store';

import { getAgentSystem } from '../../models/agent.model';

import { ShipData, ShipCargo, ShipNavFlightMode } from '../../models/ship.model';

import { ShipModule, ShipMount } from '../../models/api.model';

import {

  ConstructionData,

  hasTrait,

  JumpGateData,

  mapWaypoint,

  MarketData,

  PlanetView,

  ScannedWaypoint,

  ShipyardData,

  SystemData,

  WaypointData,

} from '../../models/system.model';

import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { ProgressionService } from '../progression/progression.service';

import { DialogService } from '../../shared/services/dialog.service';

import { PageBackgroundService } from '../../shared/services/page-background.service';

import { SnackbarService } from '../../shared/services/snackbar.service';
import { RadioService } from '../../shared/services/radio.service';

import {

  formatPlanetInfo,

  formatShipInfo,

  formatTradeGoods,

  formatCargo,

  formatRouteEta,

  formatTransitInfo,

  flightModeDescription,

  isAsteroidWaypoint,

  isDockableWaypoint,

  isGasGiantWaypoint,

  resolveWaypointType,

  shipAtWaypoint,

  shipDocked,

  shipFlightModeClass,

  shipInOrbit,

  shipInSystem,

  shipInTransit,

  shipsInSystem,

  shipsOnMap,

  shipStatusClass,

  transitInSystem,

} from './planet-helpers';

import { PlanetSurfaceViewComponent } from './planet-surface-view.component';

import { SystemFlightViewComponent } from './system-flight-view.component';

import { TravelModalComponent } from './travel-modal.component';

import { TradeGoodRowComponent } from './trade-good-row.component';

import { CargoItemRowComponent } from './cargo-item-row.component';

import {

  buildTravelPlan,

  filterMarketWaypoints,

  pickShipForTravel,

  shipsAvailableForTravel,

  type TravelIntent,

  type TravelPlanStep,

} from './travel-plan';

import { SystemViewMode, type SurfaceZoneKind } from './three/system-view-mode';

import { TravelExecutorService } from './travel-executor.service';

import { buildRouteNodes } from './routing/route-graph';

import { planRoute, RoutePlan } from './routing/route-planner';

import { ContractOptimizerService } from './contract-optimizer.service';

import { buildSnapshot, encodeSnapshotWithGuard } from '../spectate/spectate-state';

import { shareOrCopyUrl } from '../../shared/share.util';

import { PostcardDialogComponent } from '../postcard/postcard-dialog.component';

import { PostcardOptions } from '../postcard/postcard-canvas';



type DetailPanel =
  | 'info'
  | 'market'
  | 'shipyard'
  | 'jumpgate'
  | 'construction'
  | 'scan'
  | 'cargo'
  | 'surface'
  | 'mounts'
  | 'maint';

type CockpitTab = 'nav' | 'market' | 'yard' | 'gate' | 'scan' | 'cargo';

interface CockpitLogLine {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

const FLIGHT_MODES: ShipNavFlightMode[] = ['DRIFT', 'STEALTH', 'CRUISE', 'BURN'];



@Component({

  selector: 'app-system-map',

  imports: [
    SystemFlightViewComponent,
    PlanetSurfaceViewComponent,
    TravelModalComponent,
    TradeGoodRowComponent,
    CargoItemRowComponent,
    PostcardDialogComponent,
  ],

  templateUrl: './system-map.component.html',

})

export class SystemMapComponent implements OnInit, AfterViewInit, OnDestroy {

  private readonly api = inject(SpaceTradersApiService);

  private readonly agentStore = inject(AgentStore);

  private readonly fleetStore = inject(FleetStore);

  private readonly logbook = inject(LogbookStore);

  private readonly flightRecorder = inject(FlightRecorderStore);

  private readonly route = inject(ActivatedRoute);

  private readonly router = inject(Router);

  private readonly background = inject(PageBackgroundService);

  private readonly snackbar = inject(SnackbarService);

  private readonly radio = inject(RadioService);

  private readonly dialog = inject(DialogService);

  private readonly discovery = inject(DiscoveryStore);

  private readonly progression = inject(ProgressionService);

  private readonly travelExecutor = inject(TravelExecutorService);

  private readonly contractOptimizer = inject(ContractOptimizerService);



  readonly systemData = signal<SystemData | null>(null);

  readonly systemSymbol = signal('');

  readonly planets = signal<PlanetView[]>([]);

  readonly selectedPlanet = signal<PlanetView | null>(null);

  readonly waypointDetail = signal<WaypointData | null>(null);

  readonly ships = this.fleetStore.ships;

  readonly selectedShip = this.fleetStore.selectedShip;

  readonly searchQuery = signal('');

  readonly viewMode = signal<SystemViewMode>('flight');

  readonly focusPlanetName = signal<string | null>(null);

  readonly focusShipSymbol = signal<string | null>(null);

  readonly landingPlanet = signal<PlanetView | null>(null);

  readonly surfaceEntryActive = signal(false);

  readonly shipViewMode = signal<'map' | 'hangar'>('map');

  readonly detailPanel = signal<DetailPanel>('info');

  readonly loadingAction = signal<string | null>(null);

  readonly market = signal<MarketData | null>(null);

  readonly shipyard = signal<ShipyardData | null>(null);

  readonly jumpGate = signal<JumpGateData | null>(null);

  readonly construction = signal<ConstructionData | null>(null);

  readonly scanResults = signal<ScannedWaypoint[] | SystemData[] | null>(null);

  readonly supplyShip = signal('');

  readonly supplyMaterial = signal('');

  readonly supplyUnits = signal(1);

  readonly shipCargo = signal<ShipCargo | null>(null);

  readonly cargoShip = signal('');

  readonly tradeShip = signal('');

  readonly tradeSymbol = signal('');

  readonly tradeUnits = signal(1);

  readonly refuelShipSymbol = signal('');

  readonly refuelUnits = signal(1);

  readonly jettisonShipSymbol = signal('');

  readonly jettisonSymbol = signal('');

  readonly jettisonUnits = signal(1);

  readonly jumpShipSymbol = signal('');

  readonly jumpTarget = signal('');

  readonly purchaseShipType = signal('');

  readonly surfaceScanResults = signal<unknown[] | null>(null);

  readonly shipScanResults = signal<unknown[] | null>(null);

  readonly shipSurveys = signal<unknown[]>([]);

  readonly surveyShipSymbol = signal('');

  readonly transferTargetShip = signal('');

  readonly transferSymbol = signal('');

  readonly transferUnits = signal(1);

  readonly repairShipSymbol = signal('');

  readonly scrapShipSymbol = signal('');

  readonly repairQuote = signal<number | null>(null);

  readonly scrapQuote = signal<number | null>(null);

  readonly shipMounts = signal<ShipMount[]>([]);

  readonly shipModules = signal<ShipModule[]>([]);

  readonly mountSymbol = signal('');

  readonly moduleSymbol = signal('');

  readonly flightMode = signal<ShipNavFlightMode>('CRUISE');

  readonly travelModalOpen = signal(false);

  readonly travelModalTarget = signal<PlanetView | null>(null);

  readonly travelIntent = signal<TravelIntent>('visit');

  readonly travelModalShipSymbol = signal<string | null>(null);

  readonly travelExecuting = signal(false);

  readonly marketOverlayOpen = signal(false);

  readonly pendingMarketOpen = signal(false);

  readonly pendingTravelSteps = signal<TravelPlanStep[]>([]);

  readonly contractWaypoints = signal<Set<string>>(new Set<string>());

  readonly postcardOptions = signal<PostcardOptions | null>(null);

  readonly transitTick = signal(0);

  readonly marketSearchResults = computed(() =>

    filterMarketWaypoints(this.planets(), this.searchQuery()),

  );



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

  readonly formatRouteEta = formatRouteEta;

  readonly formatTransitInfo = formatTransitInfo;

  readonly shipInTransit = shipInTransit;

  readonly shipsOnMap = shipsOnMap;

  readonly flightModes = FLIGHT_MODES;



  readonly formatPlanetInfo = formatPlanetInfo;

  readonly formatShipInfo = formatShipInfo;

  readonly formatTradeGoods = formatTradeGoods;

  readonly formatCargo = formatCargo;

  readonly hasTrait = hasTrait;

  readonly shipsInSystem = shipsInSystem;

  readonly isAsteroidWaypoint = isAsteroidWaypoint;

  readonly isGasGiantWaypoint = isGasGiantWaypoint;

  readonly isDockableWaypoint = isDockableWaypoint;

  readonly shipAtWaypoint = shipAtWaypoint;

  readonly shipInOrbit = shipInOrbit;

  readonly shipDocked = shipDocked;

  readonly shipInSystem = shipInSystem;

  readonly shipStatusClass = shipStatusClass;

  readonly shipFlightModeClass = shipFlightModeClass;

  readonly flightModeDescription = flightModeDescription;

  readonly cockpitTab = signal<CockpitTab>('nav');
  readonly logLines = signal<CockpitLogLine[]>([]);
  readonly actionPulse = signal(0);
  /** Active black-box replay voyage passed to the flight view (null = none). */
  readonly replayVoyage = signal<Voyage | null>(null);
  private logSeq = 0;

  readonly cockpitTabs: ReadonlyArray<{ id: CockpitTab; label: string }> = [
    { id: 'nav', label: 'Nav' },
    { id: 'market', label: 'Market' },
    { id: 'yard', label: 'Yard' },
    { id: 'gate', label: 'Gate' },
    { id: 'scan', label: 'Scan' },
    { id: 'cargo', label: 'Cargo' },
  ];

  readonly terminalOpen = computed(() => !!this.selectedPlanet() || !!this.selectedShip());

  readonly terminalShip = computed<ShipData | null>(() => {
    const ship = this.selectedShip();
    if (ship) return ship;
    const planet = this.selectedPlanet();
    if (!planet) return null;
    return this.ships().find((s) => s.nav.waypointSymbol === planet.name) ?? null;
  });

  readonly terminalTitle = computed(
    () => this.selectedPlanet()?.name ?? this.selectedShip()?.symbol ?? 'TERMINAL',
  );

  readonly terminalSubtitle = computed(() => {
    const planet = this.selectedPlanet();
    if (planet) return planet.type;
    const ship = this.selectedShip();
    if (ship) return `${ship.nav.status} · ${ship.nav.waypointSymbol}`;
    return '';
  });

  readonly logLinesReversed = computed(() => [...this.logLines()].reverse());

  readonly logbookTail = computed(() => [...this.logbook.recent(8)].reverse());

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

  cargoUnitsOf(symbol: string): number {
    const cargo = this.shipCargo();
    if (!cargo) return 0;
    return cargo.inventory.find((item) => item.symbol === symbol)?.units ?? 0;
  }

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private beginnerDialogShown = false;



  ngOnInit(): void {

    this.background.backgroundImage.set('none');

    void this.loadShips();

  }



  ngAfterViewInit(): void {

    const shipParam = this.route.snapshot.queryParamMap.get('ship');

    if (shipParam) {

      this.fleetStore.selectShipBySymbol(shipParam);

      this.focusShipSymbol.set(shipParam);

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

  private startReplayFromQuery(idStr: string): void {
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;
    const voyage = this.flightRecorder.voyages().find((v) => v.id === id);
    if (!voyage) {
      this.snackbar.show('Recorded voyage not found.', 'warning');
      return;
    }
    this.viewMode.set('flight');
    this.replayVoyage.set(voyage);
  }

  onReplayExit(): void {
    this.replayVoyage.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { replay: null },
      queryParamsHandling: 'merge',
    });
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



  ngOnDestroy(): void {

    this.stopTransitPolling();

  }



  onMarketSearch(event: Event): void {

    const query = (event.target as HTMLInputElement).value;

    this.searchQuery.set(query);

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

    this.detailPanel.set('info');

    this.cockpitTab.set('nav');

    this.clearDetailData();

    this.focusPlanet(planet);

    await this.loadWaypointDetail(planet);

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

        this.pendingTravelSteps.set(remaining);

        this.landingPlanet.set(p);

        this.viewMode.set('landing');

      },

      onOpenMarket: async () => {

        await this.loadMarket();

        this.marketOverlayOpen.set(true);

        this.pendingMarketOpen.set(false);

      },

    });

  }



  private async continuePendingTravel(): Promise<void> {

    const steps = this.pendingTravelSteps();

    const planet = this.selectedPlanet();

    const ship = this.selectedShip();

    if (!steps.length || !planet || !ship) {

      this.pendingTravelSteps.set([]);

      return;

    }

    this.pendingTravelSteps.set([]);

    try {

      await this.executeTravelSteps(planet, ship.symbol, steps);

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Travel failed', 'error');

    }

  }



  async onPlanetLandingRequest(planet: PlanetView): Promise<void> {

    await this.onPlanetClick(planet);

  }



  onLandingComplete(): void {

    this.surfaceEntryActive.set(true);

    this.viewMode.set('surface');

    this.landingPlanet.set(null);

    void this.continuePendingTravel();

    const planet = this.selectedPlanet();

    if (planet && hasTrait(planet, 'MARKETPLACE')) {

      void this.loadMarket();

    }

  }

  onSurfaceEntryComplete(): void {

    this.surfaceEntryActive.set(false);

  }



  onExitSurface(): void {

    this.viewMode.set('launch');

  }



  onLaunchComplete(): void {

    this.viewMode.set('flight');

    this.detailPanel.set('info');

  }



  async onSurfaceZoneInteract(kind: SurfaceZoneKind): Promise<void> {

    const planet = this.selectedPlanet();

    if (!planet) return;

    if (kind === 'market') {

      return;

    }

    const orbitShips = this.ships().filter(

      (s) => shipAtWaypoint(s, planet.name) && shipInOrbit(s),

    );

    if (!orbitShips.length) {

      this.snackbar.show('Select a ship in orbit at this waypoint to mine', 'error');

      this.detailPanel.set('info');

      return;

    }

    const ship = orbitShips[0];

    this.fleetStore.selectShip(ship);

    if (isGasGiantWaypoint(planet)) {

      await this.siphonResources(ship.symbol);

    } else if (isAsteroidWaypoint(planet)) {

      await this.extractResources(ship.symbol);

    } else {

      await this.scanSurface(ship.symbol);

    }

  }



  async onSurfaceMarketTrade(event: { symbol: string; mode: 'buy' | 'sell'; units: number }): Promise<void> {

    const planet = this.selectedPlanet();

    if (!planet) return;

    const shipsHere = this.shipsForWaypoint(planet);

    const ship = shipsHere.find((s) => shipDocked(s)) ?? shipsHere[0];

    if (!ship) {

      this.snackbar.show('No ship at this waypoint to trade', 'error');

      return;

    }

    if (!shipDocked(ship)) {

      try {

        await this.api.dockShip(ship.symbol);

        await this.loadShips();

      } catch (error) {

        this.snackbar.show(error instanceof Error ? error.message : 'Auto-dock failed', 'error');

        return;

      }

    }

    this.tradeShip.set(ship.symbol);

    this.tradeSymbol.set(event.symbol);

    this.tradeUnits.set(event.units);

    await this.tradeCargo(event.mode);

    await this.loadMarket();

  }



  selectShip(ship: ShipData): void {

    this.fleetStore.selectShip(ship);

    this.selectedPlanet.set(null);

    this.detailPanel.set('info');

    this.cockpitTab.set('nav');

    this.clearDetailData();

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



  shipsAtWaypoint(waypointSymbol: string): ShipData[] {

    return this.ships().filter((s) => s.nav.waypointSymbol === waypointSymbol);

  }



  shipsInOrbitAt(waypointSymbol: string, systemSymbol: string): ShipData[] {

    return this.ships().filter(

      (s) =>

        s.nav.waypointSymbol === waypointSymbol &&

        s.nav.systemSymbol === systemSymbol &&

        s.nav.status === 'IN_ORBIT',

    );

  }



  shipsInOrbitInSystem(systemSymbol: string): ShipData[] {

    return this.ships().filter(

      (s) => s.nav.systemSymbol === systemSymbol && s.nav.status === 'IN_ORBIT',

    );

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



  shipsThatCanNavigate(planet: PlanetView): ShipData[] {

    return this.ships().filter(

      (s) =>

        shipInSystem(s, planet.system) &&

        shipInOrbit(s) &&

        s.nav.waypointSymbol !== planet.name,

    );

  }



  actionLoading(key: string): boolean {

    return this.loadingAction() === key;

  }



  shipEta(ship: ShipData): string {

    this.transitTick();

    return formatRouteEta(ship.nav.route);

  }



  private async runShipAction(

    key: string,

    action: () => Promise<void>,

    successMessage: string,

  ): Promise<void> {

    this.loadingAction.set(key);

    this.signalAction(this.actionLogPrefix(key) + '…');

    try {

      await action();

      await this.loadShips();

      this.fleetStore.syncSelectedFromList();

      if (this.cargoShip()) {

        await this.loadShipCargo(this.cargoShip());

      }

      this.pushLog(successMessage, 'success');

      this.snackbar.show(successMessage, 'success');

    } catch (error) {

      const message = error instanceof Error ? error.message : 'Action failed';

      this.pushLog(message, 'error');

      this.snackbar.show(message, 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  async refreshWaypoint(): Promise<void> {

    const planet = this.selectedPlanet();

    if (!planet) return;

    await this.loadWaypointDetail(planet);

    this.snackbar.show('Waypoint refreshed', 'success');

  }



  async loadMarket(): Promise<void> {

    const planet = this.selectedPlanet();

    if (!planet) return;

    this.loadingAction.set('market');

    this.signalAction('REQUESTING MARKET FEED…');

    try {

      const data = await this.api.getMarket(planet.system, planet.name);

      this.market.set(data);
      this.progression.markGoodsSeen([
        ...data.exports.map((g) => g.symbol),
        ...data.imports.map((g) => g.symbol),
        ...data.exchange.map((g) => g.symbol),
        ...(data.tradeGoods ?? []).map((g) => g.symbol),
      ]);

      this.detailPanel.set('market');

      if (data.exchange.length) {

        this.tradeSymbol.set(data.exchange[0].symbol);

      }

      const docked = this.dockedAt(planet.name);

      if (docked.length && !this.tradeShip()) {

        this.tradeShip.set(docked[0]!.symbol);

      }

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Market unavailable', 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  async loadShipyard(): Promise<void> {

    const planet = this.selectedPlanet();

    if (!planet) return;

    this.loadingAction.set('shipyard');

    this.signalAction('QUERYING SHIPYARD…');

    try {

      const data = await this.api.getShipyard(planet.system, planet.name);

      this.shipyard.set(data);

      this.detailPanel.set('shipyard');

      const firstType = data.ships?.[0]?.type ?? data.shipTypes[0]?.type;

      if (firstType) this.purchaseShipType.set(firstType);

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Shipyard unavailable', 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  async loadJumpGate(): Promise<void> {

    const planet = this.selectedPlanet();

    if (!planet) return;

    this.loadingAction.set('jumpgate');

    this.signalAction('PINGING JUMP GATE…');

    try {

      const data = await this.api.getJumpGate(planet.system, planet.name);

      this.jumpGate.set(data);

      this.detailPanel.set('jumpgate');

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Jump gate unavailable', 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  async loadConstruction(): Promise<void> {

    const planet = this.selectedPlanet();

    if (!planet) return;

    this.loadingAction.set('construction');

    try {

      const data = await this.api.getConstruction(planet.system, planet.name);

      this.construction.set(data);

      this.detailPanel.set('construction');

      if (data.materials.length) {

        this.supplyMaterial.set(data.materials[0].tradeSymbol);

      }

    } catch (error) {

      this.snackbar.show(

        error instanceof Error ? error.message : 'Construction site unavailable',

        'error',

      );

    } finally {

      this.loadingAction.set(null);

    }

  }



  async supplyConstruction(): Promise<void> {

    const planet = this.selectedPlanet();

    const ship = this.supplyShip();

    const material = this.supplyMaterial();

    const units = this.supplyUnits();

    if (!planet || !ship || !material || units < 1) {

      this.snackbar.show('Select ship, material, and units', 'warning');

      return;

    }

    this.loadingAction.set('supply');

    try {

      const response = await this.api.supplyConstruction(

        planet.system,

        planet.name,

        ship,

        material,

        units,

      );

      this.construction.set(response.data.construction);

      await this.loadShips();

      await this.reloadWaypoints();

      this.snackbar.show('Materials supplied', 'success');

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Supply failed', 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  async navigateShip(shipSymbol: string): Promise<void> {

    const planet = this.selectedPlanet();

    if (!planet) return;

    await this.runShipAction(

      `nav-${shipSymbol}`,

      async () => {

        const navBefore = this.ships().find((s) => s.symbol === shipSymbol);
        const navRes = await this.api.navigateShip(shipSymbol, planet.name);
        this.progression.recordNavigate({
          ship: shipSymbol,
          origin: navBefore?.nav.waypointSymbol,
          destination: planet.name,
          system: navRes.data.nav.systemSymbol,
          destinationType: navRes.data.nav.route?.destination?.type ?? planet.type,
          fuelConsumed: navRes.data.fuel?.consumed?.amount,
        });

      },

      `${shipSymbol} navigating to ${planet.name}`,

    );

  }



  async warpShip(shipSymbol: string): Promise<void> {

    const planet = this.selectedPlanet();

    if (!planet) return;

    await this.runShipAction(

      `warp-${shipSymbol}`,

      async () => {

        const warpBefore = this.ships().find((s) => s.symbol === shipSymbol);
        const warpRes = await this.api.warpShip(shipSymbol, planet.name);
        this.progression.recordNavigate({
          ship: shipSymbol,
          origin: warpBefore?.nav.waypointSymbol,
          destination: planet.name,
          system: warpRes.data.nav.systemSymbol,
          destinationType: warpRes.data.nav.route?.destination?.type ?? planet.type,
          fuelConsumed: warpRes.data.fuel?.consumed?.amount,
        });

      },

      `${shipSymbol} warped to ${planet.name}`,

    );

  }



  async orbitShip(shipSymbol: string, orbitAtWaypoint?: string): Promise<void> {

    const ship = this.ships().find((s) => s.symbol === shipSymbol);

    const waypointSymbol =

      orbitAtWaypoint ??

      ship?.nav.waypointSymbol ??

      this.selectedPlanet()?.name;

    if (!waypointSymbol) return;

    await this.runShipAction(

      `orbit-${shipSymbol}`,

      async () => {

        await this.api.orbitShip(shipSymbol, waypointSymbol);

      },

      `${shipSymbol} entered orbit`,

    );

  }



  async dockShip(shipSymbol: string): Promise<void> {

    await this.runShipAction(

      `dock-${shipSymbol}`,

      async () => {

        await this.api.dockShip(shipSymbol);

      },

      `${shipSymbol} docked`,

    );

  }



  async jumpShip(shipSymbol: string): Promise<void> {

    const target = this.jumpTarget().trim();

    if (!target) {

      this.snackbar.show('Enter a target waypoint symbol', 'warning');

      return;

    }

    await this.runShipAction(

      `jump-${shipSymbol}`,

      async () => {

        const jumpBefore = this.ships().find((s) => s.symbol === shipSymbol);
        const jumpRes = await this.api.jumpShip(shipSymbol, target);
        this.progression.recordNavigate({
          ship: shipSymbol,
          origin: jumpBefore?.nav.waypointSymbol,
          destination: target,
          system: jumpRes.data.nav.systemSymbol,
          destinationType: jumpRes.data.nav.route?.destination?.type,
          fuelConsumed: jumpRes.data.fuel?.consumed?.amount,
        });

      },

      `${shipSymbol} jumped to ${target}`,

    );

  }



  async refuelShipAction(): Promise<void> {

    const ship = this.refuelShipSymbol();

    const units = this.refuelUnits();

    if (!ship || units < 1) {

      this.snackbar.show('Select ship and fuel units', 'warning');

      return;

    }

    const waypoint = this.waypointForShip(ship);

    await this.runShipAction(

      `refuel-${ship}`,

      async () => {

        const res = await this.api.refuelShip(ship, units);

        const tx = res.data.transaction;

        this.logbook.recordRefuel(ship, tx?.units ?? null, tx?.totalPrice ?? null, waypoint);
        this.progression.recordRefuel({
          ship,
          units: tx?.units ?? null,
          totalPrice: tx?.totalPrice ?? null,
          waypoint,
          credits: res.data.agent?.credits,
        });

      },

      `${ship} refueled`,

    );

  }



  async extractResources(shipSymbol: string): Promise<void> {

    const waypoint = this.waypointForShip(shipSymbol);

    await this.runShipAction(

      `extract-${shipSymbol}`,

      async () => {

        const res = await this.api.extractResources(shipSymbol);

        const y = res.data.extraction.yield;

        this.logbook.recordExtraction('extract', shipSymbol, y.symbol, y.units, waypoint);

        this.discovery.unlockData();

      },

      `${shipSymbol} extracted resources`,

    );

  }



  async siphonResources(shipSymbol: string): Promise<void> {

    const waypoint = this.waypointForShip(shipSymbol);

    await this.runShipAction(

      `siphon-${shipSymbol}`,

      async () => {

        const res = await this.api.siphonResources(shipSymbol);

        const y = res.data.siphon.yield;

        this.logbook.recordExtraction('siphon', shipSymbol, y.symbol, y.units, waypoint);

        this.discovery.unlockData();

      },

      `${shipSymbol} siphoned gas`,

    );

  }



  async surveyWaypoint(shipSymbol: string): Promise<void> {

    this.loadingAction.set(`survey-${shipSymbol}`);

    this.signalAction('DEEP SURVEY SWEEP…');

    try {

      const response = await this.api.surveyWaypoint(shipSymbol);

      this.shipSurveys.set(response.data.surveys ?? []);

      this.surveyShipSymbol.set(shipSymbol);

      this.snackbar.show(`${shipSymbol} surveyed waypoint`, 'success');

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Survey failed', 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  async extractWithSurvey(shipSymbol: string, survey: unknown): Promise<void> {

    const waypoint = this.waypointForShip(shipSymbol);

    await this.runShipAction(

      `extract-survey-${shipSymbol}`,

      async () => {

        const res = await this.api.extractWithSurvey(shipSymbol, survey);

        const y = res.data.extraction.yield;

        this.logbook.recordExtraction('extract', shipSymbol, y.symbol, y.units, waypoint);

        this.discovery.unlockData();

      },

      `${shipSymbol} extracted with survey`,

    );

  }



  async scanSurface(shipSymbol: string): Promise<void> {

    this.loadingAction.set(`scan-surface-${shipSymbol}`);

    this.signalAction('SURFACE SCAN…');

    try {

      const response = await this.api.scanSurface(shipSymbol);

      this.surfaceScanResults.set(response.data.deposits);

      this.detailPanel.set('surface');

      this.snackbar.show(`Surface scan complete`, 'success');

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Surface scan failed', 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  async loadShipCargo(shipSymbol: string): Promise<void> {

    this.loadingAction.set(`cargo-${shipSymbol}`);

    try {

      const cargo = await this.api.getShipCargo(shipSymbol);

      this.cargoShip.set(shipSymbol);

      this.shipCargo.set(cargo);

      if (cargo.inventory.length) {

        this.jettisonSymbol.set(cargo.inventory[0].symbol);

        this.jettisonShipSymbol.set(shipSymbol);

      }

      this.detailPanel.set('cargo');

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Failed to load cargo', 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  async tradeCargo(mode: 'buy' | 'sell'): Promise<void> {

    const ship = this.tradeShip();

    const symbol = this.tradeSymbol();

    const units = this.tradeUnits();

    if (!ship || !symbol || units < 1) {

      this.snackbar.show('Select ship, good, and units', 'warning');

      return;

    }

    const waypoint = this.waypointForShip(ship);

    await this.runShipAction(

      `${mode}-${ship}`,

      async () => {

        const res =
          mode === 'buy'
            ? await this.api.purchaseCargo(ship, symbol, units)
            : await this.api.sellCargo(ship, symbol, units);

        const tx = res.data.transaction;

        this.logbook.recordTrade(mode, ship, tx?.units ?? units, tx?.tradeSymbol ?? symbol, tx?.totalPrice ?? null, waypoint);
        this.progression.recordTrade({
          mode,
          ship,
          units: tx?.units ?? units,
          good: tx?.tradeSymbol ?? symbol,
          totalPrice: tx?.totalPrice ?? null,
          waypoint,
          credits: res.data.agent?.credits,
        });

      },

      mode === 'buy' ? `${ship} purchased ${units} ${symbol}` : `${ship} sold ${units} ${symbol}`,

    );

  }



  async jettisonCargo(): Promise<void> {

    const ship = this.jettisonShipSymbol();

    const symbol = this.jettisonSymbol();

    const units = this.jettisonUnits();

    if (!ship || !symbol || units < 1) {

      this.snackbar.show('Select ship, cargo, and units', 'warning');

      return;

    }

    await this.runShipAction(

      `jettison-${ship}`,

      async () => {

        await this.api.jettisonCargo(ship, symbol, units);

      },

      `${ship} jettisoned ${units} ${symbol}`,

    );

  }



  async purchaseShip(): Promise<void> {

    const planet = this.selectedPlanet();

    const ship = this.tradeShip();

    const shipType = this.purchaseShipType();

    if (!planet || !ship || !shipType) {

      this.snackbar.show('Select ship and ship type', 'warning');

      return;

    }

    await this.runShipAction(

      `purchase-ship-${ship}`,

      async () => {

        await this.api.purchaseShipAtShipyard(ship, shipType, planet.name);

      },

      `${shipType} purchased`,

    );

  }



  async purchaseShipDirect(): Promise<void> {

    const planet = this.selectedPlanet();

    const shipType = this.purchaseShipType();

    if (!planet || !shipType) {

      this.snackbar.show('Select ship type', 'warning');

      return;

    }

    this.loadingAction.set('purchase-direct');

    try {

      await this.api.purchaseShip(shipType, planet.name);

      await this.loadShips();

      this.snackbar.show(`${shipType} purchased`, 'success');

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Purchase failed', 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  async loadRepairQuote(shipSymbol: string): Promise<void> {

    this.repairShipSymbol.set(shipSymbol);

    try {

      const quote = await this.api.getRepairQuote(shipSymbol);

      this.repairQuote.set(quote.transaction?.totalPrice ?? null);

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Failed to get repair quote', 'error');

    }

  }



  async repairShipAction(): Promise<void> {

    const ship = this.repairShipSymbol();

    if (!ship) return;

    await this.runShipAction(

      `repair-${ship}`,

      async () => {

        await this.api.repairShip(ship);

      },

      `${ship} repaired`,

    );

  }



  async loadScrapQuote(shipSymbol: string): Promise<void> {

    this.scrapShipSymbol.set(shipSymbol);

    try {

      const quote = await this.api.getScrapValue(shipSymbol);

      this.scrapQuote.set(quote.transaction?.totalPrice ?? null);

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Failed to get scrap quote', 'error');

    }

  }



  async scrapShipAction(): Promise<void> {

    const ship = this.scrapShipSymbol();

    if (!ship) return;

    this.dialog.showInfo(

      'Scrap ship',

      `Scrap ${ship} for ${this.scrapQuote() ?? '?'} credits?`,

      () => void this.runShipAction(

        `scrap-${ship}`,

        async () => {

          await this.api.scrapShip(ship);

          await this.loadShips();

        },

        `${ship} scrapped`,

      ),

    );

  }



  async transferCargoAction(): Promise<void> {

    const from = this.cargoShip();

    const to = this.transferTargetShip();

    const symbol = this.transferSymbol();

    const units = this.transferUnits();

    if (!from || !to || !symbol || units < 1) {

      this.snackbar.show('Select ships, good, and units', 'warning');

      return;

    }

    await this.runShipAction(

      `transfer-${from}`,

      async () => {

        await this.api.transferCargo(from, to, symbol, units);

        await this.loadShipCargo(from);

      },

      `Transferred ${units} ${symbol}`,

    );

  }



  async patchShip(shipSymbol: string): Promise<void> {

    await this.runShipAction(

      `patch-${shipSymbol}`,

      async () => {

        await this.api.patchShip(shipSymbol);

      },

      `${shipSymbol} repaired`,

    );

  }



  async loadShipMounts(shipSymbol: string): Promise<void> {

    this.loadingAction.set(`mounts-${shipSymbol}`);

    try {

      const [m, mod] = await Promise.all([

        this.api.getMounts(shipSymbol),

        this.api.getShipModules(shipSymbol),

      ]);

      this.shipMounts.set(m);

      this.shipModules.set(mod);

      this.detailPanel.set('mounts');

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Failed to load mounts', 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  async installMountAction(shipSymbol: string): Promise<void> {

    const symbol = this.mountSymbol().trim();

    if (!symbol) {

      this.snackbar.show('Enter mount symbol from cargo', 'warning');

      return;

    }

    await this.runShipAction(

      `install-mount-${shipSymbol}`,

      async () => {

        const result = await this.api.installMount(shipSymbol, symbol);

        this.shipMounts.set(result.data.mounts ?? []);

      },

      `Mount ${symbol} installed`,

    );

  }



  async removeMountAction(shipSymbol: string, symbol: string): Promise<void> {

    await this.runShipAction(

      `remove-mount-${shipSymbol}`,

      async () => {

        await this.api.removeMount(shipSymbol, symbol);

        await this.loadShipMounts(shipSymbol);

      },

      `Mount ${symbol} removed`,

    );

  }



  async installModuleAction(shipSymbol: string): Promise<void> {

    const symbol = this.moduleSymbol().trim();

    if (!symbol) {

      this.snackbar.show('Enter module symbol from cargo', 'warning');

      return;

    }

    await this.runShipAction(

      `install-module-${shipSymbol}`,

      async () => {

        const result = await this.api.installShipModule(shipSymbol, symbol);

        this.shipModules.set(result.data.modules ?? []);

      },

      `Module ${symbol} installed`,

    );

  }



  async removeModuleAction(shipSymbol: string, symbol: string): Promise<void> {

    await this.runShipAction(

      `remove-module-${shipSymbol}`,

      async () => {

        await this.api.removeShipModule(shipSymbol, symbol);

        await this.loadShipMounts(shipSymbol);

      },

      `Module ${symbol} removed`,

    );

  }



  async loadShipMaintenance(shipSymbol: string): Promise<void> {

    this.repairShipSymbol.set(shipSymbol);

    this.detailPanel.set('maint');

    await Promise.all([this.loadRepairQuote(shipSymbol), this.loadScrapQuote(shipSymbol)]);

  }



  async setFlightMode(shipSymbol: string): Promise<void> {

    const mode = this.flightMode();

    await this.runShipAction(

      `flight-${shipSymbol}`,

      async () => {

        await this.api.patchShipNav(shipSymbol, mode);

      },

      `Flight mode set to ${mode}`,

    );

  }



  async chartShip(shipSymbol: string): Promise<void> {

    this.loadingAction.set(`chart-${shipSymbol}`);

    try {

      const response = await this.api.chartWaypoint(shipSymbol);

      const updated = mapWaypoint(response.data.waypoint);

      this.selectedPlanet.set(updated);

      this.waypointDetail.set(response.data.waypoint);

      await this.reloadWaypoints();

      this.snackbar.show(`${shipSymbol} charted waypoint`, 'success');

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Chart failed', 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  async scanSystems(shipSymbol: string): Promise<void> {

    this.loadingAction.set(`scan-sys-${shipSymbol}`);

    this.signalAction('LONG-RANGE SYSTEM SCAN…');

    try {

      const response = await this.api.scanSystems(shipSymbol);

      this.scanResults.set(response.data.systems);

      this.detailPanel.set('scan');

      this.snackbar.show(`Scanned ${response.data.systems.length} systems`, 'success');

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'System scan failed', 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  async scanWaypoints(shipSymbol: string): Promise<void> {

    this.loadingAction.set(`scan-wp-${shipSymbol}`);

    this.signalAction('WAYPOINT SCAN…');

    try {

      const response = await this.api.scanWaypoints(shipSymbol);

      this.scanResults.set(response.data.waypoints);

      this.detailPanel.set('scan');

      this.snackbar.show(`Scanned ${response.data.waypoints.length} waypoints`, 'success');

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Waypoint scan failed', 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  async scanShips(shipSymbol: string): Promise<void> {

    this.loadingAction.set(`scan-ships-${shipSymbol}`);

    this.signalAction('SHIP SCAN…');

    try {

      const response = await this.api.scanShips(shipSymbol);

      const scanned = response.data.ships ?? [];

      this.shipScanResults.set(scanned);

      this.scanResults.set(null);

      this.detailPanel.set('scan');

      const mine = new Set(this.ships().map((s) => s.symbol));

      const contacts = scanned.filter((s) => {
        const sym = (s as { symbol?: string }).symbol;
        return !sym || !mine.has(sym);
      });

      if (contacts.length) {
        const wp = this.ships().find((s) => s.symbol === shipSymbol)?.nav.waypointSymbol;
        this.radio.announcePirate(contacts.length, wp);
      }

      this.snackbar.show('Ship scan complete', 'success');

    } catch (error) {

      this.snackbar.show(error instanceof Error ? error.message : 'Ship scan failed', 'error');

    } finally {

      this.loadingAction.set(null);

    }

  }



  selectTab(tab: CockpitTab): void {
    if (!this.isTabEnabled(tab)) return;
    this.cockpitTab.set(tab);
    switch (tab) {
      case 'nav':
        break;
      case 'market':
        void this.loadMarket();
        break;
      case 'yard':
        void this.loadShipyard();
        break;
      case 'gate':
        void this.loadJumpGate();
        break;
      case 'scan':
        break;
      case 'cargo': {
        const ship = this.terminalShip();
        if (ship) void this.loadShipCargo(ship.symbol);
        break;
      }
      default: {
        const _exhaustive: never = tab;
        void _exhaustive;
      }
    }
  }

  isTabEnabled(tab: CockpitTab): boolean {
    const planet = this.selectedPlanet();
    switch (tab) {
      case 'nav':
        return this.terminalOpen();
      case 'market':
        return !!planet && hasTrait(planet, 'MARKETPLACE');
      case 'yard':
        return !!planet && hasTrait(planet, 'SHIPYARD');
      case 'gate':
        return !!planet && resolveWaypointType(planet.type) === 'JUMP_GATE';
      case 'scan':
        return !!this.terminalShip();
      case 'cargo':
        return !!this.terminalShip();
      default: {
        const _exhaustive: never = tab;
        void _exhaustive;
        return false;
      }
    }
  }

  closeTerminal(): void {
    this.fleetStore.selectShip(null);
    this.focusShipSymbol.set(null);
    this.selectedPlanet.set(null);
    this.clearDetailData();
  }

  pushLog(text: string, tone: CockpitLogLine['tone'] = 'info'): void {
    const entry: CockpitLogLine = { id: ++this.logSeq, text, tone };
    this.logLines.update((lines) => [...lines, entry].slice(-20));
  }

  private waypointForShip(shipSymbol: string): string | undefined {
    return this.ships().find((s) => s.symbol === shipSymbol)?.nav.waypointSymbol;
  }

  logbookDay(entry: LogEntry): string {
    return this.logbook.formatDay(entry);
  }

  logbookCategoryClass(entry: LogEntry): string {
    return logCategoryClass(entry.category);
  }

  private pulse(): void {
    this.actionPulse.update((n) => n + 1);
  }

  private signalAction(message: string): void {
    this.pushLog(message, 'info');
    this.pulse();
  }

  private actionLogPrefix(key: string): string {
    const verb = key.split('-')[0];
    switch (verb) {
      case 'dock':
        return 'DOCKING SEQUENCE INITIATED';
      case 'orbit':
        return 'BREAKING TO ORBIT';
      case 'nav':
        return 'PLOTTING NAV COURSE';
      case 'warp':
        return 'SPOOLING WARP DRIVE';
      case 'jump':
        return 'CHARGING JUMP DRIVE';
      case 'refuel':
        return 'PUMPING FUEL';
      case 'extract':
        return 'EXTRACTION ARM ENGAGED';
      case 'siphon':
        return 'SIPHON ONLINE';
      case 'buy':
        return 'PURCHASE ORDER SENT';
      case 'sell':
        return 'SELL ORDER SENT';
      case 'jettison':
        return 'VENTING CARGO';
      case 'transfer':
        return 'TRANSFERRING CARGO';
      case 'flight':
        return 'ADJUSTING FLIGHT MODE';
      case 'chart':
        return 'CHARTING WAYPOINT';
      case 'repair':
        return 'REPAIR BAY ENGAGED';
      case 'scrap':
        return 'SCRAPPING HULL';
      case 'install':
        return 'INSTALLING HARDWARE';
      case 'remove':
        return 'REMOVING HARDWARE';
      case 'supply':
        return 'SUPPLYING MATERIALS';
      case 'patch':
        return 'PATCHING HULL';
      case 'purchase':
        return 'ACQUIRING SHIP';
      default:
        return 'EXECUTING COMMAND';
    }
  }

  showPanel(panel: DetailPanel): void {

    this.detailPanel.set(panel);

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



  private async loadShips(): Promise<void> {

    try {

      await this.fleetStore.refreshShips();

      this.syncTransitPolling();

      // Ships load asynchronously after the waypoints, so re-run the default
      // focus once the fleet is available to avoid spawning at the system star.

      if (this.planets().length && !this.selectedShip()) {

        this.applyBeginnerDefaults();

      }

    } catch {

      // Ship actions hidden when unavailable

    }

  }



  private async loadSystem(sysName: string, tryFallback: boolean): Promise<void> {

    if (!sysName) {

      this.snackbar.show('No system specified', 'error');

      void this.router.navigate(['/home']);

      return;

    }



    this.systemSymbol.set(sysName);

    this.selectedPlanet.set(null);

    this.clearDetailData();



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



  private async reloadWaypoints(): Promise<void> {

    const sysName = this.systemSymbol();

    try {

      const waypoints = await this.api.getAllWaypoints(sysName);

      const planetViews = waypoints.map(mapWaypoint);

      this.planets.set(planetViews);

      this.applyBeginnerDefaults();

      void this.refreshContractHighlights();

    } catch {

      this.snackbar.show('Failed to load waypoints', 'error');

    }

  }



  private async refreshContractHighlights(): Promise<void> {

    const sysName = this.systemSymbol();

    if (!sysName) return;

    try {

      const set = await this.contractOptimizer.computeForSystem(sysName, this.planets());

      this.contractWaypoints.set(set);

    } catch {

      // Highlights are best-effort; ignore failures.

    }

  }



  private applyBeginnerDefaults(): void {

    const sys = this.systemSymbol();

    const onMap = shipsOnMap(this.ships(), sys);

    const inSystem = onMap.filter((s) => !shipInTransit(s));

    const hasShipParam = !!this.route.snapshot.queryParamMap.get('ship');

    // Open the system view focused on one of the fleet's ships rather than the
    // star at the system center. Prefer a docked/orbiting ship, falling back to
    // any ship that is on the map (including in transit).

    if (!hasShipParam && !this.selectedShip() && onMap.length) {

      const target = inSystem[0] ?? onMap[0]!;

      this.fleetStore.selectShip(target);

      this.focusShipSymbol.set(target.symbol);

      const planet = this.planets().find((p) => p.name === target.nav.waypointSymbol);

      if (planet) this.focusPlanet(planet);

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



  private async loadWaypointDetail(planet: PlanetView): Promise<void> {

    try {

      const detail = await this.api.getWaypoint(planet.system, planet.name);

      this.waypointDetail.set(detail);

      const updated = mapWaypoint(detail);

      this.selectedPlanet.set(updated);

      this.focusPlanet(updated);

    } catch {

      this.waypointDetail.set(null);

    }

  }



  private clearDetailData(): void {

    this.market.set(null);

    this.shipyard.set(null);

    this.jumpGate.set(null);

    this.construction.set(null);

    this.scanResults.set(null);

    this.surfaceScanResults.set(null);

    this.shipCargo.set(null);

    this.waypointDetail.set(null);

    this.shipMounts.set([]);

    this.shipModules.set([]);

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



  private stopTransitPolling(): void {

    if (this.pollTimer) {

      clearInterval(this.pollTimer);

      this.pollTimer = null;

    }

  }



  private syncTransitPolling(): void {

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

}

