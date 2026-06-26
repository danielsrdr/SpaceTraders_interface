import { Injectable, signal } from '@angular/core';
import { PlanetView } from '../../models/system.model';

/**
 * Live system-map context shared with the command palette for ship actions.
 * Updated by {@link SystemMapComponent} when waypoints load.
 */
@Injectable({ providedIn: 'root' })
export class ShipCommandContextService {
  readonly systemSymbol = signal<string | null>(null);
  readonly planets = signal<PlanetView[]>([]);

  setContext(systemSymbol: string, planets: PlanetView[]): void {
    this.systemSymbol.set(systemSymbol);
    this.planets.set(planets);
  }

  clear(): void {
    this.systemSymbol.set(null);
    this.planets.set([]);
  }
}
