import { Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import { ShipData } from '../../models/ship.model';
import {
  canvasPosition,
  MapLayout,
  mapWaypoint,
  PlanetView,
} from '../../models/system.model';
import {
  shipCanvasPosition,
  shipInTransit,
  shipsOnMap,
} from '../systems/planet-helpers';

interface MiniDot {
  x: number;
  y: number;
}

interface ShipDot {
  symbol: string;
  x: number;
  y: number;
  status: string;
}

const WIDTH = 320;
const HEIGHT = 200;
const PADDING = 20;

@Component({
  selector: 'app-fleet-mini-map',
  template: `
    <div class="sk-mini-map sk-fleet-mini-map">
      @if (loading()) {
        <p class="sk-mini-map-msg">Charting {{ systemSymbol() }}…</p>
      } @else if (error()) {
        <p class="sk-mini-map-msg">No chart data for {{ systemSymbol() }}</p>
      } @else {
        <svg
          class="sk-mini-map-svg"
          [attr.viewBox]="'0 0 ' + width + ' ' + height"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          [attr.aria-label]="'Fleet map of ' + systemSymbol()"
        >
          @for (d of planetDots(); track $index) {
            <circle [attr.cx]="d.x" [attr.cy]="d.y" r="2.2" class="sk-mini-dot" />
          }
          @for (s of shipDots(); track s.symbol) {
            <polygon
              [attr.points]="triangle(s.x, s.y)"
              [class]="shipClass(s.status)"
              (click)="focusShip(s.symbol)"
            />
          }
        </svg>
        <span class="sk-mini-map-tag">{{ systemSymbol() }} · {{ shipDots().length }} ships</span>
      }
    </div>
  `,
})
export class FleetMiniMapComponent {
  private readonly api = inject(SpaceTradersApiService);
  private readonly router = inject(Router);

  readonly systemSymbol = input.required<string>();
  readonly ships = input<ShipData[]>([]);

  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly planetDots = signal<MiniDot[]>([]);
  readonly shipDots = signal<ShipDot[]>([]);

  private planets: PlanetView[] = [];
  private layout: MapLayout | null = null;

  constructor() {
    effect(() => {
      const system = this.systemSymbol();
      const fleet = this.ships();
      void this.load(system, fleet);
    });
  }

  triangle(x: number, y: number): string {
    const s = 5;
    return `${x},${y - s} ${x - s},${y + s} ${x + s},${y + s}`;
  }

  shipClass(status: string): string {
    if (status === 'IN_TRANSIT') return 'sk-mini-ship-transit';
    if (status === 'IN_ORBIT') return 'sk-mini-ship-orbit';
    return 'sk-mini-ship-docked';
  }

  focusShip(symbol: string): void {
    const ship = this.ships().find((s) => s.symbol === symbol);
    if (!ship) return;
    void this.router.navigate(['/systems'], {
      queryParams: {
        name: this.systemSymbol(),
        travelTo: ship.nav.waypointSymbol,
        fallback: '0',
      },
    });
  }

  private async load(system: string, fleet: ShipData[]): Promise<void> {
    if (!system) {
      this.error.set(true);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set(false);
    try {
      const waypoints = await this.api.getAllWaypoints(system);
      this.planets = waypoints.map(mapWaypoint);
      if (!this.planets.length) {
        this.error.set(true);
        return;
      }
      this.layout = this.computeLayout(this.planets);
      this.planetDots.set(
        this.planets.map((p) => {
          const pos = canvasPosition(p.position, this.layout!);
          return { x: pos.x, y: pos.y };
        }),
      );
      this.refreshShipDots(fleet);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private refreshShipDots(fleet: ShipData[]): void {
    const layout = this.layout;
    if (!layout) return;
    const system = this.systemSymbol();
    const onMap = shipsOnMap(fleet, system);
    const byWaypoint = new Map<string, ShipData[]>();
    for (const ship of onMap) {
      const key = shipInTransit(ship)
        ? `transit:${ship.symbol}`
        : ship.nav.waypointSymbol;
      const list = byWaypoint.get(key) ?? [];
      list.push(ship);
      byWaypoint.set(key, list);
    }

    const dots: ShipDot[] = [];
    for (const group of byWaypoint.values()) {
      group.forEach((ship, index) => {
        const pos = shipCanvasPosition(ship, this.planets, layout, index, group.length);
        if (!pos) return;
        dots.push({
          symbol: ship.symbol,
          x: pos.x,
          y: pos.y,
          status: ship.nav.status,
        });
      });
    }
    this.shipDots.set(dots);
  }

  private computeLayout(planets: PlanetView[]): MapLayout {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const planet of planets) {
      minX = Math.min(minX, planet.position.x);
      maxX = Math.max(maxX, planet.position.x);
      minY = Math.min(minY, planet.position.y);
      maxY = Math.max(maxY, planet.position.y);
    }
    const rangeX = Math.max(maxX - minX, 1);
    const rangeY = Math.max(maxY - minY, 1);
    const coordScale = Math.min(
      (WIDTH - PADDING * 2) / rangeX,
      (HEIGHT - PADDING * 2) / rangeY,
    );
    return {
      coordScale,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      canvasWidth: WIDTH,
      canvasHeight: HEIGHT,
    };
  }
}
