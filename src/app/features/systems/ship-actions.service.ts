import { inject, Injectable, signal } from '@angular/core';
import { AgentStore } from '../../core/state/agent.store';
import { DiscoveryStore } from '../../core/state/discovery.store';
import { LogbookStore } from '../../core/state/logbook.store';
import { ShipModule, ShipMount } from '../../models/api.model';
import { ShipCargo, ShipNavFlightMode } from '../../models/ship.model';
import {
  ConstructionData,
  JumpGateData,
  mapWaypoint,
  MarketData,
  PlanetView,
  ScannedWaypoint,
  ShipyardData,
  SystemData,
} from '../../models/system.model';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { DialogService } from '../../shared/services/dialog.service';
import { RadioService } from '../../shared/services/radio.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { SurfaceWeatherService } from '../../shared/services/surface-weather.service';
import { ProgressionService } from '../progression/progression.service';
import { CockpitLogService } from './cockpit-log.service';
import { shipDocked } from './planet-helpers';
import { SystemMapStore } from './system-map.store';
import { SystemViewModeStore } from './three/system-view-mode.store';

export type DetailPanel =
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

@Injectable({ providedIn: 'root' })
export class ShipActionsService {
  private readonly api = inject(SpaceTradersApiService);
  private readonly mapStore = inject(SystemMapStore);
  private readonly viewModeStore = inject(SystemViewModeStore);
  private readonly agentStore = inject(AgentStore);
  private readonly logbook = inject(LogbookStore);
  private readonly discovery = inject(DiscoveryStore);
  private readonly progression = inject(ProgressionService);
  private readonly snackbar = inject(SnackbarService);
  private readonly dialog = inject(DialogService);
  private readonly radio = inject(RadioService);
  private readonly surfaceWeather = inject(SurfaceWeatherService);
  private readonly cockpitLog = inject(CockpitLogService);

  readonly detailPanel = signal<DetailPanel>('info');
  readonly market = signal<MarketData | null>(null);
  readonly shipyard = signal<ShipyardData | null>(null);
  readonly jumpGate = signal<JumpGateData | null>(null);
  readonly construction = signal<ConstructionData | null>(null);
  readonly scanResults = signal<ScannedWaypoint[] | SystemData[] | null>(null);
  readonly shipCargo = signal<ShipCargo | null>(null);
  readonly surfaceScanResults = signal<unknown[] | null>(null);
  readonly shipScanResults = signal<unknown[] | null>(null);
  readonly shipSurveys = signal<unknown[]>([]);
  readonly shipMounts = signal<ShipMount[]>([]);
  readonly shipModules = signal<ShipModule[]>([]);
  readonly surfaceScanDeposits = signal<unknown[]>([]);
  readonly repairQuote = signal<number | null>(null);
  readonly scrapQuote = signal<number | null>(null);

  readonly supplyShip = signal('');
  readonly supplyMaterial = signal('');
  readonly supplyUnits = signal(1);
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
  readonly surveyShipSymbol = signal('');
  readonly transferTargetShip = signal('');
  readonly transferSymbol = signal('');
  readonly transferUnits = signal(1);
  readonly repairShipSymbol = signal('');
  readonly scrapShipSymbol = signal('');
  readonly mountSymbol = signal('');
  readonly moduleSymbol = signal('');
  readonly flightMode = signal<ShipNavFlightMode>('CRUISE');

  clearDetailData(): void {
    this.market.set(null);
    this.shipyard.set(null);
    this.jumpGate.set(null);
    this.construction.set(null);
    this.scanResults.set(null);
    this.surfaceScanResults.set(null);
    this.shipCargo.set(null);
    this.mapStore.waypointDetail.set(null);
    this.shipMounts.set([]);
    this.shipModules.set([]);
  }

  actionLoading(key: string): boolean {
    return this.cockpitLog.actionLoading(key);
  }

  async runShipAction(
    key: string,
    action: () => Promise<void>,
    successMessage: string,
    options?: { skipReloadCargo?: boolean },
  ): Promise<void> {
    this.cockpitLog.loadingAction.set(key);
    this.cockpitLog.signalAction(this.cockpitLog.actionLogPrefix(key) + '…');
    try {
      await action();
      await this.mapStore.loadShips();
      this.mapStore.syncSelectedFromList();
      if (this.cargoShip() && !options?.skipReloadCargo) {
        await this.loadShipCargo(this.cargoShip());
      }
      this.cockpitLog.pushLog(successMessage, 'success');
      this.snackbar.show(successMessage, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed';
      this.cockpitLog.pushLog(message, 'error');
      this.snackbar.show(message, 'error');
    } finally {
      this.cockpitLog.loadingAction.set(null);
    }
  }

  async refreshWaypoint(): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    if (!planet) return;
    await this.mapStore.loadWaypointDetail(planet);
    this.snackbar.show('Waypoint refreshed', 'success');
  }

  async loadMarket(): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    if (!planet) return;
    this.cockpitLog.loadingAction.set('market');
    this.cockpitLog.signalAction('REQUESTING MARKET FEED…');
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
      const docked = this.mapStore.ships().filter(
        (s) => s.nav.waypointSymbol === planet.name && s.nav.status === 'DOCKED',
      );
      if (docked.length && !this.tradeShip()) {
        this.tradeShip.set(docked[0]!.symbol);
      }
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Market unavailable', 'error');
    } finally {
      this.cockpitLog.loadingAction.set(null);
    }
  }

  async loadShipyard(): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    if (!planet) return;
    this.cockpitLog.loadingAction.set('shipyard');
    this.cockpitLog.signalAction('QUERYING SHIPYARD…');
    try {
      const data = await this.api.getShipyard(planet.system, planet.name);
      this.shipyard.set(data);
      this.detailPanel.set('shipyard');
      const firstType = data.ships?.[0]?.type ?? data.shipTypes[0]?.type;
      if (firstType) this.purchaseShipType.set(firstType);
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Shipyard unavailable', 'error');
    } finally {
      this.cockpitLog.loadingAction.set(null);
    }
  }

  async loadJumpGate(): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    if (!planet) return;
    this.cockpitLog.loadingAction.set('jumpgate');
    this.cockpitLog.signalAction('PINGING JUMP GATE…');
    try {
      const data = await this.api.getJumpGate(planet.system, planet.name);
      this.jumpGate.set(data);
      this.detailPanel.set('jumpgate');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Jump gate unavailable', 'error');
    } finally {
      this.cockpitLog.loadingAction.set(null);
    }
  }

  async loadConstruction(): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    if (!planet) return;
    this.cockpitLog.loadingAction.set('construction');
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
      this.cockpitLog.loadingAction.set(null);
    }
  }

  async supplyConstruction(): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    const ship = this.supplyShip();
    const material = this.supplyMaterial();
    const units = this.supplyUnits();
    if (!planet || !ship || !material || units < 1) {
      this.snackbar.show('Select ship, material, and units', 'warning');
      return;
    }
    this.cockpitLog.loadingAction.set('supply');
    try {
      const response = await this.api.supplyConstruction(planet.system, planet.name, ship, material, units);
      this.construction.set(response.data.construction);
      await this.mapStore.loadShips();
      await this.mapStore.reloadWaypoints();
      this.snackbar.show('Materials supplied', 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Supply failed', 'error');
    } finally {
      this.cockpitLog.loadingAction.set(null);
    }
  }

  async navigateShip(shipSymbol: string): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    if (!planet) return;
    await this.runShipAction(`nav-${shipSymbol}`, async () => {
      const navBefore = this.mapStore.ships().find((s) => s.symbol === shipSymbol);
      const navRes = await this.api.navigateShip(shipSymbol, planet.name);
      this.progression.recordNavigate({
        ship: shipSymbol,
        origin: navBefore?.nav.waypointSymbol,
        destination: planet.name,
        system: navRes.data.nav.systemSymbol,
        destinationType: navRes.data.nav.route?.destination?.type ?? planet.type,
        fuelConsumed: navRes.data.fuel?.consumed?.amount,
      });
    }, `${shipSymbol} navigating to ${planet.name}`);
  }

  async warpShip(shipSymbol: string): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    if (!planet) return;
    await this.runShipAction(`warp-${shipSymbol}`, async () => {
      const warpBefore = this.mapStore.ships().find((s) => s.symbol === shipSymbol);
      const warpRes = await this.api.warpShip(shipSymbol, planet.name);
      this.progression.recordNavigate({
        ship: shipSymbol,
        origin: warpBefore?.nav.waypointSymbol,
        destination: planet.name,
        system: warpRes.data.nav.systemSymbol,
        destinationType: warpRes.data.nav.route?.destination?.type ?? planet.type,
        fuelConsumed: warpRes.data.fuel?.consumed?.amount,
      });
    }, `${shipSymbol} warped to ${planet.name}`);
  }

  async orbitShip(shipSymbol: string, orbitAtWaypoint?: string): Promise<void> {
    const ship = this.mapStore.ships().find((s) => s.symbol === shipSymbol);
    const waypointSymbol = orbitAtWaypoint ?? ship?.nav.waypointSymbol ?? this.mapStore.selectedPlanet()?.name;
    if (!waypointSymbol) return;
    await this.runShipAction(`orbit-${shipSymbol}`, async () => {
      await this.api.orbitShip(shipSymbol, waypointSymbol);
    }, `${shipSymbol} entered orbit`);
  }

  async dockShip(shipSymbol: string): Promise<void> {
    await this.runShipAction(`dock-${shipSymbol}`, async () => {
      await this.api.dockShip(shipSymbol);
    }, `${shipSymbol} docked`);
  }

  async jumpShip(shipSymbol: string): Promise<void> {
    const target = this.jumpTarget().trim();
    if (!target) {
      this.snackbar.show('Enter a target waypoint symbol', 'warning');
      return;
    }
    await this.runShipAction(`jump-${shipSymbol}`, async () => {
      const jumpBefore = this.mapStore.ships().find((s) => s.symbol === shipSymbol);
      const jumpRes = await this.api.jumpShip(shipSymbol, target);
      this.progression.recordNavigate({
        ship: shipSymbol,
        origin: jumpBefore?.nav.waypointSymbol,
        destination: target,
        system: jumpRes.data.nav.systemSymbol,
        destinationType: jumpRes.data.nav.route?.destination?.type,
        fuelConsumed: jumpRes.data.fuel?.consumed?.amount,
      });
    }, `${shipSymbol} jumped to ${target}`);
  }

  async refuelShipAction(): Promise<void> {
    const ship = this.refuelShipSymbol();
    const units = this.refuelUnits();
    if (!ship || units < 1) {
      this.snackbar.show('Select ship and fuel units', 'warning');
      return;
    }
    const waypoint = this.waypointForShip(ship);
    await this.runShipAction(`refuel-${ship}`, async () => {
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
      if (this.viewModeStore.viewMode() === 'surface') {
        this.progression.recordSurfaceSupplyAction();
      }
    }, `${ship} refueled`);
  }

  async extractResources(shipSymbol: string): Promise<void> {
    const waypoint = this.waypointForShip(shipSymbol);
    await this.runShipAction(`extract-${shipSymbol}`, async () => {
      const res = await this.api.extractResources(shipSymbol);
      const y = res.data.extraction.yield;
      this.logbook.recordExtraction('extract', shipSymbol, y.symbol, y.units, waypoint);
      this.discovery.unlockData();
    }, `${shipSymbol} extracted resources`);
  }

  async siphonResources(shipSymbol: string): Promise<void> {
    const waypoint = this.waypointForShip(shipSymbol);
    await this.runShipAction(`siphon-${shipSymbol}`, async () => {
      const res = await this.api.siphonResources(shipSymbol);
      const y = res.data.siphon.yield;
      this.logbook.recordExtraction('siphon', shipSymbol, y.symbol, y.units, waypoint);
      this.discovery.unlockData();
    }, `${shipSymbol} siphoned gas`);
  }

  async surveyWaypoint(shipSymbol: string): Promise<void> {
    this.cockpitLog.loadingAction.set(`survey-${shipSymbol}`);
    this.cockpitLog.signalAction('DEEP SURVEY SWEEP…');
    try {
      const response = await this.api.surveyWaypoint(shipSymbol);
      this.shipSurveys.set(response.data.surveys ?? []);
      this.surveyShipSymbol.set(shipSymbol);
      this.snackbar.show(`${shipSymbol} surveyed waypoint`, 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Survey failed', 'error');
    } finally {
      this.cockpitLog.loadingAction.set(null);
    }
  }

  async extractWithSurvey(shipSymbol: string, survey: unknown): Promise<void> {
    const waypoint = this.waypointForShip(shipSymbol);
    await this.runShipAction(`extract-survey-${shipSymbol}`, async () => {
      const res = await this.api.extractWithSurvey(shipSymbol, survey);
      const y = res.data.extraction.yield;
      this.logbook.recordExtraction('extract', shipSymbol, y.symbol, y.units, waypoint);
      this.discovery.unlockData();
    }, `${shipSymbol} extracted with survey`);
  }

  async scanSurface(shipSymbol: string): Promise<void> {
    if (this.viewModeStore.viewMode() === 'surface' && this.surfaceWeather.sensorQuality < 0.85) {
      this.snackbar.show('Surface weather degrading scan accuracy', 'error');
    }
    this.cockpitLog.loadingAction.set(`scan-surface-${shipSymbol}`);
    this.cockpitLog.signalAction('SURFACE SCAN…');
    try {
      const response = await this.api.scanSurface(shipSymbol);
      this.surfaceScanResults.set(response.data.deposits);
      this.surfaceScanDeposits.set(response.data.deposits ?? []);
      this.detailPanel.set('surface');
      this.snackbar.show('Surface scan complete', 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Surface scan failed', 'error');
    } finally {
      this.cockpitLog.loadingAction.set(null);
    }
  }

  async loadShipCargo(shipSymbol: string): Promise<void> {
    this.cockpitLog.loadingAction.set(`cargo-${shipSymbol}`);
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
      this.cockpitLog.loadingAction.set(null);
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
    await this.runShipAction(`${mode}-${ship}`, async () => {
      const res =
        mode === 'buy'
          ? await this.api.purchaseCargo(ship, symbol, units)
          : await this.api.sellCargo(ship, symbol, units);
      const tx = res.data.transaction;
      this.logbook.recordTrade(
        mode,
        ship,
        tx?.units ?? units,
        tx?.tradeSymbol ?? symbol,
        tx?.totalPrice ?? null,
        waypoint,
      );
      this.progression.recordTrade({
        mode,
        ship,
        units: tx?.units ?? units,
        good: tx?.tradeSymbol ?? symbol,
        totalPrice: tx?.totalPrice ?? null,
        waypoint,
        credits: res.data.agent?.credits,
      });
    }, mode === 'buy' ? `${ship} purchased ${units} ${symbol}` : `${ship} sold ${units} ${symbol}`);
  }

  async jettisonCargo(): Promise<void> {
    const ship = this.jettisonShipSymbol();
    const symbol = this.jettisonSymbol();
    const units = this.jettisonUnits();
    if (!ship || !symbol || units < 1) {
      this.snackbar.show('Select ship, cargo, and units', 'warning');
      return;
    }
    await this.runShipAction(`jettison-${ship}`, async () => {
      await this.api.jettisonCargo(ship, symbol, units);
    }, `${ship} jettisoned ${units} ${symbol}`);
  }

  async purchaseShip(): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    const ship = this.tradeShip();
    const shipType = this.purchaseShipType();
    if (!planet || !ship || !shipType) {
      this.snackbar.show('Select ship and ship type', 'warning');
      return;
    }
    await this.runShipAction(`purchase-ship-${ship}`, async () => {
      await this.api.purchaseShipAtShipyard(ship, shipType, planet.name);
    }, `${shipType} purchased`);
  }

  async purchaseShipDirect(): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    const shipType = this.purchaseShipType();
    if (!planet || !shipType) {
      this.snackbar.show('Select ship type', 'warning');
      return;
    }
    this.cockpitLog.loadingAction.set('purchase-direct');
    try {
      await this.api.purchaseShip(shipType, planet.name);
      await this.mapStore.loadShips();
      this.snackbar.show(`${shipType} purchased`, 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Purchase failed', 'error');
    } finally {
      this.cockpitLog.loadingAction.set(null);
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
    await this.runShipAction(`repair-${ship}`, async () => {
      await this.api.repairShip(ship);
    }, `${ship} repaired`);
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
      () =>
        void this.runShipAction(`scrap-${ship}`, async () => {
          await this.api.scrapShip(ship);
          await this.mapStore.loadShips();
        }, `${ship} scrapped`),
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
    await this.runShipAction(`transfer-${from}`, async () => {
      await this.api.transferCargo(from, to, symbol, units);
      await this.loadShipCargo(from);
    }, `Transferred ${units} ${symbol}`);
  }

  async patchShip(shipSymbol: string): Promise<void> {
    await this.runShipAction(`patch-${shipSymbol}`, async () => {
      await this.api.patchShip(shipSymbol);
    }, `${shipSymbol} repaired`);
  }

  async loadShipMounts(shipSymbol: string): Promise<void> {
    this.cockpitLog.loadingAction.set(`mounts-${shipSymbol}`);
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
      this.cockpitLog.loadingAction.set(null);
    }
  }

  async installMountAction(shipSymbol: string): Promise<void> {
    const symbol = this.mountSymbol().trim();
    if (!symbol) {
      this.snackbar.show('Enter mount symbol from cargo', 'warning');
      return;
    }
    await this.runShipAction(`install-mount-${shipSymbol}`, async () => {
      const result = await this.api.installMount(shipSymbol, symbol);
      this.shipMounts.set(result.data.mounts ?? []);
    }, `Mount ${symbol} installed`);
  }

  async removeMountAction(shipSymbol: string, symbol: string): Promise<void> {
    await this.runShipAction(`remove-mount-${shipSymbol}`, async () => {
      await this.api.removeMount(shipSymbol, symbol);
      await this.loadShipMounts(shipSymbol);
    }, `Mount ${symbol} removed`);
  }

  async installModuleAction(shipSymbol: string): Promise<void> {
    const symbol = this.moduleSymbol().trim();
    if (!symbol) {
      this.snackbar.show('Enter module symbol from cargo', 'warning');
      return;
    }
    await this.runShipAction(`install-module-${shipSymbol}`, async () => {
      const result = await this.api.installShipModule(shipSymbol, symbol);
      this.shipModules.set(result.data.modules ?? []);
    }, `Module ${symbol} installed`);
  }

  async removeModuleAction(shipSymbol: string, symbol: string): Promise<void> {
    await this.runShipAction(`remove-module-${shipSymbol}`, async () => {
      await this.api.removeShipModule(shipSymbol, symbol);
      await this.loadShipMounts(shipSymbol);
    }, `Module ${symbol} removed`);
  }

  async loadShipMaintenance(shipSymbol: string): Promise<void> {
    this.repairShipSymbol.set(shipSymbol);
    this.detailPanel.set('maint');
    await Promise.all([this.loadRepairQuote(shipSymbol), this.loadScrapQuote(shipSymbol)]);
  }

  async setFlightMode(shipSymbol: string): Promise<void> {
    const mode = this.flightMode();
    await this.runShipAction(`flight-${shipSymbol}`, async () => {
      await this.api.patchShipNav(shipSymbol, mode);
    }, `Flight mode set to ${mode}`);
  }

  async chartShip(shipSymbol: string): Promise<void> {
    this.cockpitLog.loadingAction.set(`chart-${shipSymbol}`);
    try {
      const response = await this.api.chartWaypoint(shipSymbol);
      const updated = mapWaypoint(response.data.waypoint);
      this.mapStore.selectedPlanet.set(updated);
      this.mapStore.waypointDetail.set(response.data.waypoint);
      await this.mapStore.reloadWaypoints();
      this.snackbar.show(`${shipSymbol} charted waypoint`, 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Chart failed', 'error');
    } finally {
      this.cockpitLog.loadingAction.set(null);
    }
  }

  async scanSystems(shipSymbol: string): Promise<void> {
    this.cockpitLog.loadingAction.set(`scan-sys-${shipSymbol}`);
    this.cockpitLog.signalAction('LONG-RANGE SYSTEM SCAN…');
    try {
      const response = await this.api.scanSystems(shipSymbol);
      this.scanResults.set(response.data.systems);
      this.detailPanel.set('scan');
      this.snackbar.show(`Scanned ${response.data.systems.length} systems`, 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'System scan failed', 'error');
    } finally {
      this.cockpitLog.loadingAction.set(null);
    }
  }

  async scanWaypoints(shipSymbol: string): Promise<void> {
    this.cockpitLog.loadingAction.set(`scan-wp-${shipSymbol}`);
    this.cockpitLog.signalAction('WAYPOINT SCAN…');
    try {
      const response = await this.api.scanWaypoints(shipSymbol);
      this.scanResults.set(response.data.waypoints);
      this.detailPanel.set('scan');
      this.snackbar.show(`Scanned ${response.data.waypoints.length} waypoints`, 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Waypoint scan failed', 'error');
    } finally {
      this.cockpitLog.loadingAction.set(null);
    }
  }

  async scanShips(shipSymbol: string): Promise<void> {
    this.cockpitLog.loadingAction.set(`scan-ships-${shipSymbol}`);
    this.cockpitLog.signalAction('SHIP SCAN…');
    try {
      const response = await this.api.scanShips(shipSymbol);
      const scanned = response.data.ships ?? [];
      this.shipScanResults.set(scanned);
      this.scanResults.set(null);
      this.detailPanel.set('scan');
      const mine = new Set(this.mapStore.ships().map((s) => s.symbol));
      const contacts = scanned.filter((s) => {
        const sym = (s as { symbol?: string }).symbol;
        return !sym || !mine.has(sym);
      });
      if (contacts.length) {
        const wp = this.mapStore.ships().find((s) => s.symbol === shipSymbol)?.nav.waypointSymbol;
        this.radio.announcePirate(contacts.length, wp);
      }
      this.snackbar.show('Ship scan complete', 'success');
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Ship scan failed', 'error');
    } finally {
      this.cockpitLog.loadingAction.set(null);
    }
  }

  private waypointForShip(shipSymbol: string): string | undefined {
    return this.mapStore.ships().find((s) => s.symbol === shipSymbol)?.nav.waypointSymbol;
  }
}
