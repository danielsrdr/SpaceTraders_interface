import { inject, Injectable } from '@angular/core';
import { AgentStore } from '../../core/state/agent.store';
import { DiscoveryStore } from '../../core/state/discovery.store';
import { LogbookStore } from '../../core/state/logbook.store';
import { ShipData } from '../../models/ship.model';
import { PlanetView } from '../../models/system.model';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { RadioService } from '../../shared/services/radio.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { SoundService } from '../../shared/services/sound.service';
import { ProgressionService } from '../progression/progression.service';
import {
  isAsteroidWaypoint,
  isGasGiantWaypoint,
  shipAtWaypoint,
  shipDocked,
  shipInOrbit,
} from './planet-helpers';
import { ShipActionsService } from './ship-actions.service';
import { SystemMapStore } from './system-map.store';
import { type SurfaceZoneKind } from './three/system-view-mode';
import { type SurfaceContractBeacon } from './three/surface-contract-beacons';
import { SurfaceWeatherService } from '../../shared/services/surface-weather.service';
import { buildSurfaceTraitProfile } from './three/surface-trait-profile';

@Injectable({ providedIn: 'root' })
export class SurfaceMapBridgeService {
  private readonly mapStore = inject(SystemMapStore);
  private readonly shipActions = inject(ShipActionsService);
  private readonly api = inject(SpaceTradersApiService);
  private readonly snackbar = inject(SnackbarService);
  private readonly progression = inject(ProgressionService);
  private readonly logbook = inject(LogbookStore);
  private readonly radio = inject(RadioService);
  private readonly sound = inject(SoundService);
  private readonly surfaceWeather = inject(SurfaceWeatherService);
  private readonly agentStore = inject(AgentStore);
  private readonly discovery = inject(DiscoveryStore);

  async onSurfaceZoneInteract(kind: SurfaceZoneKind): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    if (!planet) return;

    if (kind === 'market') {
      await this.shipActions.loadMarket();
      return;
    }
    if (kind === 'shipyard') {
      await this.shipActions.loadShipyard();
      return;
    }
    if (kind === 'ruins') return;

    if (kind === 'depot') {
      const shipsHere = this.shipsForWaypoint(planet);
      const ship = shipsHere.find((s) => shipDocked(s)) ?? shipsHere[0];
      if (!ship) {
        this.snackbar.show('Dock a ship at this waypoint to refuel', 'error');
        return;
      }
      if (!shipDocked(ship)) {
        try {
          await this.api.dockShip(ship.symbol);
          await this.mapStore.loadShips();
        } catch (error) {
          this.snackbar.show(error instanceof Error ? error.message : 'Dock failed', 'error');
          return;
        }
      }
      this.shipActions.refuelShipSymbol.set(ship.symbol);
      this.shipActions.refuelUnits.set(1);
      await this.shipActions.refuelShipAction();
      return;
    }

    const ship = await this.resolveOrbitShipForExtraction(planet);
    if (!ship) {
      this.snackbar.show('No ship at this waypoint to mine', 'error');
      this.shipActions.detailPanel.set('info');
      return;
    }
    if (isGasGiantWaypoint(planet)) {
      await this.shipActions.siphonResources(ship.symbol);
    } else if (isAsteroidWaypoint(planet)) {
      await this.shipActions.extractResources(ship.symbol);
    } else {
      this.snackbar.show('Aim at ore in the tunnels and press E to extract', 'info');
    }
  }

  async onSurfaceOreBroken(): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    if (!planet) return;
    const ship = await this.resolveOrbitShipForExtraction(planet);
    if (!ship) {
      this.snackbar.show('No ship at this waypoint to extract', 'error');
      return;
    }
    await this.shipActions.extractResources(ship.symbol);
  }

  async onSurfaceCartDelivered(): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    if (!planet) return;
    const ship = await this.resolveOrbitShipForExtraction(planet);
    if (!ship) {
      this.snackbar.show('Cart arrived — no ship in orbit to receive cargo', 'warning');
      return;
    }
    this.snackbar.show('Cart delivered ore to the ramp — bonus extraction', 'success', 3500);
    await this.shipActions.extractResources(ship.symbol);
  }

  onSurfaceRuinsScanned(): void {
    const planet = this.mapStore.selectedPlanet();
    if (!planet) return;
    this.progression.recordRuinsScanned(planet.name);
    this.logbook.recordRuinsScan(planet.name);
    const surveyBeacon = this.mapStore.surfaceContractBeacons().find((b) => b.kind === 'survey-ruins');
    if (surveyBeacon) {
      this.snackbar.show('Survey objective updated — ruins logged for contract.', 'success', 4000);
      this.radio.announce('Ruins survey data uplinked to contract ledger.');
    }
  }

  onSurfaceCaveMapped(event: { percent: number }): void {
    const planet = this.mapStore.selectedPlanet();
    if (!planet) return;
    this.logbook.recordCaveMapped(planet.name, event.percent);
    const surveyBeacon = this.mapStore.surfaceContractBeacons().find((b) => b.kind === 'survey-cave');
    if (surveyBeacon && event.percent >= 50) {
      this.snackbar.show('Survey objective updated — cave network logged for contract.', 'success', 4000);
      this.radio.announce('Cave survey data uplinked to contract ledger.');
    }
  }

  async onSurfaceContractDeliver(beacon: SurfaceContractBeacon): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
    if (!planet || beacon.kind !== 'deliver-crate' || !beacon.tradeSymbol) return;

    const shipsHere = this.shipsForWaypoint(planet);
    const ship = shipsHere.find((s) => shipDocked(s)) ?? shipsHere[0];
    if (!ship) {
      this.snackbar.show('Dock a ship at this waypoint to deliver contract cargo', 'error');
      return;
    }
    if (!shipDocked(ship)) {
      try {
        await this.api.dockShip(ship.symbol);
        await this.mapStore.loadShips();
      } catch (error) {
        this.snackbar.show(error instanceof Error ? error.message : 'Dock failed', 'error');
        return;
      }
    }

    const cargoLine = ship.cargo?.inventory.find((i) => i.symbol === beacon.tradeSymbol);
    const onHand = cargoLine?.units ?? 0;
    if (onHand < 1) {
      this.snackbar.show(`No ${beacon.tradeSymbol} in ${ship.symbol} cargo`, 'error');
      return;
    }

    const units = Math.min(beacon.unitsRemaining ?? 1, onHand);
    try {
      await this.api.deliverContract(beacon.contractId, ship.symbol, beacon.tradeSymbol, units);
      this.logbook.recordSurfaceContract(`Delivered ${units} ${beacon.tradeSymbol} from surface`, planet.name);
      this.snackbar.show(`Delivered ${units} ${beacon.tradeSymbol}`, 'success');
      this.sound.playFulfill();
      this.radio.announce(`Contract delivery confirmed — ${units} units logged.`);

      const contracts = await this.api.getContracts();
      this.mapStore.activeContracts = contracts;
      const contract = this.mapStore.activeContracts.find((c) => c.id === beacon.contractId);
      if (contract && contract.deliver.every((d) => (d.unitsFulfilled ?? 0) >= d.unitsRequired)) {
        await this.api.fulfillContract(beacon.contractId);
        this.progression.recordContract({
          payment: contract.paymentFulfill,
          faction: contract.faction,
          credits: this.agentStore.agent()?.credits,
        });
        this.logbook.recordContract(`Fulfilled ${contract.type} contract from surface`, planet.name);
        this.snackbar.show('Contract fulfilled!', 'success', 5000);
        this.sound.playFulfill();
      }
      await this.mapStore.refreshSurfaceContractBeacons();
    } catch (error) {
      this.snackbar.show(error instanceof Error ? error.message : 'Delivery failed', 'error');
    }
  }

  async onSurfaceMarketTrade(event: { symbol: string; mode: 'buy' | 'sell'; units: number }): Promise<void> {
    const planet = this.mapStore.selectedPlanet();
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
        await this.mapStore.loadShips();
      } catch (error) {
        this.snackbar.show(error instanceof Error ? error.message : 'Auto-dock failed', 'error');
        return;
      }
    }
    this.shipActions.tradeShip.set(ship.symbol);
    this.shipActions.tradeSymbol.set(event.symbol);
    this.shipActions.tradeUnits.set(event.units);
    await this.shipActions.tradeCargo(event.mode);
    await this.shipActions.loadMarket();
  }

  onSurfaceEntryComplete(): void {
    const planet = this.mapStore.selectedPlanet();
    if (planet) {
      const profile = buildSurfaceTraitProfile(planet);
      const biomes = Object.entries(profile.biomeBias)
        .filter(([, v]) => (v ?? 0) > 0.2)
        .map(([k]) => k);
      this.progression.recordSurfaceVisit({
        planet,
        biomes,
        weather: this.surfaceWeather.event(),
      });
      this.logbook.recordSurfaceLand(planet.name, biomes);
    }
  }

  private shipsForWaypoint(planet: PlanetView): ShipData[] {
    return this.mapStore.ships().filter(
      (s) => s.nav.systemSymbol === planet.system && s.nav.waypointSymbol === planet.name,
    );
  }

  private async resolveOrbitShipForExtraction(planet: PlanetView): Promise<ShipData | null> {
    const atWaypoint = this.shipsForWaypoint(planet);
    const selected = this.mapStore.selectedShip();
    const preferred =
      (selected && shipAtWaypoint(selected, planet.name) ? selected : null) ??
      atWaypoint.find((s) => shipInOrbit(s)) ??
      atWaypoint.find((s) => shipDocked(s)) ??
      atWaypoint[0] ??
      null;
    if (!preferred) return null;
    if (shipDocked(preferred)) {
      try {
        await this.api.orbitShip(preferred.symbol, planet.name);
        await this.mapStore.loadShips();
        return this.mapStore.ships().find((s) => s.symbol === preferred.symbol) ?? preferred;
      } catch {
        return null;
      }
    }
    return preferred;
  }
}
