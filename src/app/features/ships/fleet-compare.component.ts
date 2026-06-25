import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipData } from '../../models/ship.model';
import { ShipViewer3dComponent } from './ship-viewer-3d.component';
import { compareShips, recommend, type CompareRow } from './ship-compare';

@Component({
  selector: 'app-fleet-compare',
  imports: [FormsModule, ShipViewer3dComponent],
  templateUrl: './fleet-compare.component.html',
})
export class FleetCompareComponent {
  readonly ships = input.required<ShipData[]>();

  readonly aSymbol = signal('');
  readonly bSymbol = signal('');

  readonly aShip = computed(() => this.resolve(this.aSymbol(), 0));
  readonly bShip = computed(() => this.resolve(this.bSymbol(), 1));

  readonly rows = computed<CompareRow[]>(() => {
    const a = this.aShip();
    const b = this.bShip();
    return a && b ? compareShips(a, b) : [];
  });

  readonly recommendation = computed(() => {
    const a = this.aShip();
    const b = this.bShip();
    return a && b ? recommend(a, b) : null;
  });

  barPercent(value: number, row: CompareRow): number {
    const max = Math.max(row.aValue, row.bValue, 1);
    return Math.round((value / max) * 100);
  }

  private resolve(symbol: string, fallbackIndex: number): ShipData | null {
    const list = this.ships();
    if (!list.length) return null;
    const found = list.find((ship) => ship.symbol === symbol);
    if (found) return found;
    return list[Math.min(fallbackIndex, list.length - 1)] ?? null;
  }
}
