import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  OnInit,
  output,
  signal,
  Type,
  untracked,
} from '@angular/core';
import { FleetStore } from '../../../core/state/fleet.store';
import { ShipData } from '../../../models/ship.model';
import { hasTrait, PlanetView } from '../../../models/system.model';
import { resolveWaypointType } from '../planet-helpers';
import { CockpitLogService } from '../cockpit-log.service';
import { ShipActionsService } from '../ship-actions.service';
import { SystemMapStore } from '../system-map.store';
import { TravelIntent } from '../travel-plan';
import { COCKPIT_TABS, CockpitTab } from './cockpit-tab.type';

@Component({
  selector: 'app-system-cockpit-terminal',
  imports: [NgComponentOutlet],
  templateUrl: './system-cockpit-terminal.component.html',
})
export class SystemCockpitTerminalComponent implements OnInit {
  private readonly mapStore = inject(SystemMapStore);
  private readonly fleetStore = inject(FleetStore);
  private readonly shipActions = inject(ShipActionsService);
  private readonly cockpitLog = inject(CockpitLogService);

  readonly close = output<void>();
  readonly openTravel = output<{ planet: PlanetView; intent: TravelIntent }>();

  readonly cockpitTab = signal<CockpitTab>('nav');
  readonly tabComponentTypes = signal<Partial<Record<CockpitTab, Type<unknown>>>>({});

  readonly loadingAction = this.cockpitLog.loadingAction;
  readonly logLines = this.cockpitLog.logLines;
  readonly selectedPlanet = this.mapStore.selectedPlanet;
  readonly selectedShip = this.mapStore.selectedShip;

  readonly cockpitTabs = COCKPIT_TABS;

  readonly terminalOpen = computed(() => !!this.selectedPlanet() || !!this.selectedShip());

  readonly terminalShip = computed<ShipData | null>(() => {
    const ship = this.selectedShip();
    if (ship) return ship;
    const planet = this.selectedPlanet();
    if (!planet) return null;
    return this.mapStore.ships().find((s) => s.nav.waypointSymbol === planet.name) ?? null;
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

  readonly activeTabComponent = computed(
    () => this.tabComponentTypes()[this.cockpitTab()] ?? null,
  );

  readonly tabInputs = computed(() => {
    if (this.cockpitTab() === 'nav') {
      return {
        openTravel: (planet: PlanetView, intent: TravelIntent) =>
          this.openTravel.emit({ planet, intent }),
      };
    }
    return {};
  });

  private readonly selectionKey = computed(
    () => `${this.selectedPlanet()?.name ?? ''}:${this.selectedShip()?.symbol ?? ''}`,
  );

  constructor() {
    effect(() => {
      this.selectionKey();
      untracked(() => {
        this.cockpitTab.set('nav');
        void this.ensureTabLoaded('nav');
      });
    });
  }

  ngOnInit(): void {
    void this.selectTab('nav');
  }

  onClose(): void {
    this.close.emit();
  }

  selectTab(tab: CockpitTab): void {
    if (!this.isTabEnabled(tab)) return;
    this.cockpitTab.set(tab);
    void this.ensureTabLoaded(tab);
    switch (tab) {
      case 'nav':
        break;
      case 'market':
        void this.shipActions.loadMarket();
        break;
      case 'yard':
        void this.shipActions.loadShipyard();
        break;
      case 'gate':
        void this.shipActions.loadJumpGate();
        break;
      case 'scan':
        break;
      case 'cargo': {
        const ship = this.terminalShip();
        if (ship) void this.shipActions.loadShipCargo(ship.symbol);
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

  private async ensureTabLoaded(tab: CockpitTab): Promise<void> {
    if (this.tabComponentTypes()[tab]) return;
    let type: Type<unknown>;
    switch (tab) {
      case 'nav':
        type = (await import('./tabs/cockpit-nav-tab.component')).CockpitNavTabComponent;
        break;
      case 'market':
        type = (await import('./tabs/cockpit-market-tab.component')).CockpitMarketTabComponent;
        break;
      case 'yard':
        type = (await import('./tabs/cockpit-yard-tab.component')).CockpitYardTabComponent;
        break;
      case 'gate':
        type = (await import('./tabs/cockpit-gate-tab.component')).CockpitGateTabComponent;
        break;
      case 'scan':
        type = (await import('./tabs/cockpit-scan-tab.component')).CockpitScanTabComponent;
        break;
      case 'cargo':
        type = (await import('./tabs/cockpit-cargo-tab.component')).CockpitCargoTabComponent;
        break;
      default: {
        const _exhaustive: never = tab;
        void _exhaustive;
        return;
      }
    }
    this.tabComponentTypes.update((types) => ({ ...types, [tab]: type }));
  }
}
