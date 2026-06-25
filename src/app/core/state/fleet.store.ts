import { computed, inject, Injectable, signal } from '@angular/core';
import { ShipData } from '../../models/ship.model';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { shipInSystem, shipsOnMap } from '../../features/systems/planet-helpers';

@Injectable({ providedIn: 'root' })
export class FleetStore {
  private readonly api = inject(SpaceTradersApiService);

  readonly ships = signal<ShipData[]>([]);
  readonly selectedShipSymbol = signal<string | null>(null);

  readonly selectedShip = computed(() => {
    const symbol = this.selectedShipSymbol();
    if (!symbol) return null;
    return this.ships().find((s) => s.symbol === symbol) ?? null;
  });

  selectShip(ship: ShipData | null): void {
    this.selectedShipSymbol.set(ship?.symbol ?? null);
  }

  selectShipBySymbol(symbol: string | null): void {
    this.selectedShipSymbol.set(symbol);
  }

  selectNextInSystem(systemSymbol: string): void {
    const list = shipsOnMap(this.ships(), systemSymbol);
    if (!list.length) return;
    const current = this.selectedShipSymbol();
    const idx = list.findIndex((s) => s.symbol === current);
    const next = list[(idx + 1) % list.length]!;
    this.selectedShipSymbol.set(next.symbol);
  }

  selectPrevInSystem(systemSymbol: string): void {
    const list = shipsOnMap(this.ships(), systemSymbol);
    if (!list.length) return;
    const current = this.selectedShipSymbol();
    const idx = list.findIndex((s) => s.symbol === current);
    const prev = list[(idx - 1 + list.length) % list.length]!;
    this.selectedShipSymbol.set(prev.symbol);
  }

  selectByIndexInSystem(systemSymbol: string, index: number): void {
    const list = shipsOnMap(this.ships(), systemSymbol);
    const ship = list[index];
    if (ship) this.selectedShipSymbol.set(ship.symbol);
  }

  async refreshShips(): Promise<ShipData[]> {
    try {
      const list = await this.api.getAllShips();
      this.ships.set(list);
      const selected = this.selectedShipSymbol();
      if (selected && !list.some((s) => s.symbol === selected)) {
        this.selectedShipSymbol.set(null);
      }
      return list;
    } catch {
      return this.ships();
    }
  }

  syncSelectedFromList(): void {
    const symbol = this.selectedShipSymbol();
    if (!symbol) return;
    const fresh = this.ships().find((s) => s.symbol === symbol);
    if (!fresh) this.selectedShipSymbol.set(null);
  }

  shipsInCurrentSystem(systemSymbol: string): ShipData[] {
    return this.ships().filter((s) => shipInSystem(s, systemSymbol));
  }
}
