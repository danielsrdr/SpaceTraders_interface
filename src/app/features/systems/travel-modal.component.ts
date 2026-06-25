import { Component, computed, input, output } from '@angular/core';
import { hasTrait, PlanetView } from '../../models/system.model';
import { ShipData, ShipNavFlightMode } from '../../models/ship.model';
import {
  buildTravelPlan,
  describeTravelPlan,
  findTravelBlockers,
  hasTravelBlockers,
  TravelBlocker,
  TravelIntent,
} from './travel-plan';

const FLIGHT_MODES: ShipNavFlightMode[] = ['DRIFT', 'STEALTH', 'CRUISE', 'BURN'];

@Component({
  selector: 'app-travel-modal',
  templateUrl: './travel-modal.component.html',
})
export class TravelModalComponent {
  readonly open = input(false);
  readonly target = input<PlanetView | null>(null);
  readonly intent = input<TravelIntent>('visit');
  readonly ships = input<ShipData[]>([]);
  readonly selectedShipSymbol = input<string | null>(null);
  readonly flightMode = input<ShipNavFlightMode>('CRUISE');
  readonly executing = input(false);

  readonly shipSymbolChange = output<string>();
  readonly flightModeChange = output<ShipNavFlightMode>();
  readonly confirm = output<void>();
  readonly cancel = output<void>();

  readonly flightModes = FLIGHT_MODES;
  readonly hasTrait = hasTrait;

  readonly blockers = computed((): TravelBlocker[] => {
    if (this.executing()) return [];

    const planet = this.target();
    const symbol = this.selectedShipSymbol();
    if (!planet || !symbol) {
      if (planet && !this.ships().length) {
        return [{ message: 'No ships in this system.', severity: 'error' }];
      }
      if (planet && this.ships().length > 1 && !symbol) {
        return [{ message: 'Select a ship to continue.', severity: 'error' }];
      }
      return [];
    }
    const ship = this.ships().find((s) => s.symbol === symbol);
    if (!ship) {
      return [{ message: 'Selected ship not found.', severity: 'error' }];
    }
    return findTravelBlockers(ship, planet);
  });

  readonly planPreview = computed((): string[] => {
    const planet = this.target();
    const symbol = this.selectedShipSymbol();
    if (!planet || !symbol) return [];
    const ship = this.ships().find((s) => s.symbol === symbol);
    if (!ship) return [];
    const steps = buildTravelPlan(planet, ship, this.intent(), this.flightMode());
    return describeTravelPlan(steps, planet.name);
  });

  goDisabled(): boolean {
    if (!this.selectedShipSymbol() || !this.ships().length) return true;
    return hasTravelBlockers(this.blockers());
  }
}
