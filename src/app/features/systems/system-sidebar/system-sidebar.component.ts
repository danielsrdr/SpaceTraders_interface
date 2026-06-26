import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ShipData } from '../../../models/ship.model';
import { PlanetView } from '../../../models/system.model';
import { GhostFleetService } from '../../../shared/services/ghost-fleet.service';
import { shipInTransit, shipsOnMap, shipStatusClass } from '../planet-helpers';
import { SystemMapStore } from '../system-map.store';
import { filterMarketWaypoints } from '../travel-plan';
import { TravelIntent } from '../travel-plan';

export type SidebarPanel = 'fleet' | 'find' | 'ops';

@Component({
  selector: 'app-system-sidebar',
  templateUrl: './system-sidebar.component.html',
})
export class SystemSidebarComponent {
  private readonly mapStore = inject(SystemMapStore);
  readonly ghostFleet = inject(GhostFleetService);

  readonly searchQuery = input('');
  readonly shipEtaFn = input.required<(ship: ShipData) => string>();

  readonly marketSearch = output<Event>();
  readonly shareSpectator = output<void>();
  readonly openPostcard = output<void>();
  readonly openTravel = output<{ planet: PlanetView; intent: TravelIntent }>();
  readonly selectShip = output<ShipData>();

  readonly activePanel = signal<SidebarPanel | null>(null);

  readonly systemData = this.mapStore.systemData;
  readonly systemSymbol = this.mapStore.systemSymbol;
  readonly planets = this.mapStore.planets;
  readonly selectedShip = this.mapStore.selectedShip;
  readonly ships = this.mapStore.ships;

  readonly systemLabel = computed(() => {
    const system = this.systemData();
    if (!system) return '—';
    const name = system.name ?? system.symbol;
    return name.length > 8 ? name.slice(0, 7) + '…' : name;
  });

  readonly fleetCount = computed(() => shipsOnMap(this.ships(), this.systemSymbol()).length);

  readonly ghostShipsOnMap = computed(() =>
    this.ghostFleet.enabled() ? this.ghostFleet.ghostsForSystem(this.systemSymbol()) : [],
  );

  readonly marketSearchResults = computed(() =>
    filterMarketWaypoints(this.planets(), this.searchQuery()),
  );

  readonly shipsOnMap = shipsOnMap;
  readonly shipInTransit = shipInTransit;
  readonly shipStatusClass = shipStatusClass;

  togglePanel(panel: SidebarPanel): void {
    this.activePanel.update((current) => (current === panel ? null : panel));
  }

  closePanel(): void {
    this.activePanel.set(null);
  }

  isPanelOpen(panel: SidebarPanel): boolean {
    return this.activePanel() === panel;
  }

  onShipSelect(ship: ShipData): void {
    this.selectShip.emit(ship);
    this.closePanel();
  }

  onMarketSelect(planet: PlanetView): void {
    this.openTravel.emit({ planet, intent: 'market' });
    this.closePanel();
  }
}
