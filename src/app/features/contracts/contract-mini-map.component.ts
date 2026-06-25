import { Component, effect, inject, input, signal } from '@angular/core';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';
import {
  canvasPosition,
  MapLayout,
  mapWaypoint,
  PlanetView,
} from '../../models/system.model';

interface MiniDot {
  x: number;
  y: number;
  isDest: boolean;
}

const WIDTH = 220;
const HEIGHT = 150;
const PADDING = 16;

@Component({
  selector: 'app-contract-mini-map',
  template: `
    <div class="sk-mini-map">
      @if (loading()) {
        <p class="sk-mini-map-msg">Mapping {{ systemSymbol() }}…</p>
      } @else if (error()) {
        <p class="sk-mini-map-msg">No chart data for {{ systemSymbol() }}</p>
      } @else {
        <svg
          class="sk-mini-map-svg"
          [attr.viewBox]="'0 0 ' + width + ' ' + height"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          @for (d of backgroundDots(); track $index) {
            <circle [attr.cx]="d.x" [attr.cy]="d.y" r="1.6" class="sk-mini-dot" />
          }
          @for (d of destDots(); track $index) {
            <circle [attr.cx]="d.x" [attr.cy]="d.y" r="6" class="sk-mini-dest-ring" />
            <circle [attr.cx]="d.x" [attr.cy]="d.y" r="2.6" class="sk-mini-dest" />
          }
        </svg>
        <span class="sk-mini-map-tag">{{ systemSymbol() }}</span>
      }
    </div>
  `,
})
export class ContractMiniMapComponent {
  private readonly api = inject(SpaceTradersApiService);

  readonly destinationSymbol = input.required<string>();

  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly dots = signal<MiniDot[]>([]);
  readonly systemSymbol = signal('');

  constructor() {
    effect(() => {
      const dest = this.destinationSymbol();
      this.systemSymbol.set(this.toSystem(dest));
      void this.load(dest);
    });
  }

  backgroundDots(): MiniDot[] {
    return this.dots().filter((d) => !d.isDest);
  }

  destDots(): MiniDot[] {
    return this.dots().filter((d) => d.isDest);
  }

  private toSystem(dest: string): string {
    return dest.split('-').slice(0, 2).join('-');
  }

  private async load(dest: string): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    const system = this.toSystem(dest);
    if (!system || !dest) {
      this.error.set(true);
      this.loading.set(false);
      return;
    }
    try {
      const waypoints = await this.api.getAllWaypoints(system);
      const planets = waypoints.map(mapWaypoint);
      this.dots.set(this.computeDots(planets, dest));
      if (!planets.length) this.error.set(true);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private computeDots(planets: PlanetView[], dest: string): MiniDot[] {
    if (!planets.length) return [];

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

    const layout: MapLayout = {
      coordScale,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      canvasWidth: WIDTH,
      canvasHeight: HEIGHT,
    };

    return planets.map((planet) => {
      const pos = canvasPosition(planet.position, layout);
      return { x: pos.x, y: pos.y, isDest: planet.name === dest };
    });
  }
}
