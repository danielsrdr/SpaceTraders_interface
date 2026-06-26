import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, ElementRef, input, viewChild } from '@angular/core';
import type { SurfaceWeatherKind } from '../three/surface-trait-profile';
import { FOOTPRINT_CELL_SIZE, TOTAL_WALKABLE_CELLS } from '../../../core/state/surface-discovery.store';
import { WORLD_RADIUS } from '../three/terrain/terrain-height';

export interface ExoPoiCompass {
  label: string;
  relativeBearing: number;
  distanceM: number;
  cardinal: string;
}

@Component({
  selector: 'app-exo-suit-hud',
  templateUrl: './exo-suit-hud.component.html',
  imports: [DecimalPipe],
})
export class ExoSuitHudComponent {
  readonly hazardLevel = input(0);
  readonly sensorQuality = input(1);
  readonly weatherEvent = input<SurfaceWeatherKind | null>(null);
  readonly weatherIntensity = input(0);
  readonly jetpackFuel = input(1);
  readonly poiCompass = input<ExoPoiCompass | null>(null);
  readonly mineProgressPct = input<number | null>(null);
  readonly caveProgressPct = input<number | null>(null);
  readonly footprintCells = input<readonly string[]>([]);
  readonly playerFootprintCell = input<{ cx: number; cz: number } | null>(null);
  readonly showControls = input(true);

  private readonly radarCanvas = viewChild<ElementRef<HTMLCanvasElement>>('radarCanvas');

  readonly hazardPct = computed(() => Math.round(this.hazardLevel() * 100));
  readonly sensorPct = computed(() => Math.round(this.sensorQuality() * 100));
  readonly sensorDegraded = computed(() => this.sensorQuality() < 0.92);
  readonly vignetteOpacity = computed(() => (1 - this.sensorQuality()) * 0.85);
  readonly explorePct = computed(() =>
    Math.round((this.footprintCells().length / TOTAL_WALKABLE_CELLS) * 100),
  );
  readonly stormOverlay = computed(() => {
    const evt = this.weatherEvent();
    if (!evt) return null;
    if (evt === 'sand-storm') return 'sand';
    if (evt === 'acid-rain') return 'acid';
    if (evt === 'giant-winds') return 'wind';
    return null;
  });

  constructor() {
    effect(() => {
      const cells = this.footprintCells();
      const player = this.playerFootprintCell();
      const canvasRef = this.radarCanvas();
      if (!canvasRef) return;
      this.drawRadar(canvasRef.nativeElement, cells, player);
    });
  }

  private drawRadar(
    canvas: HTMLCanvasElement,
    cells: readonly string[],
    player: { cx: number; cz: number } | null,
  ): void {
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'rgba(8, 12, 24, 0.85)';
    ctx.fillRect(0, 0, size, size);

    const visited = new Set(cells);
    const cellsPerRadius = Math.ceil(WORLD_RADIUS / FOOTPRINT_CELL_SIZE);
    const scale = size / (cellsPerRadius * 2 + 2);

    for (let cx = -cellsPerRadius; cx <= cellsPerRadius; cx++) {
      for (let cz = -cellsPerRadius; cz <= cellsPerRadius; cz++) {
        const centerX = (cx + 0.5) * FOOTPRINT_CELL_SIZE;
        const centerZ = (cz + 0.5) * FOOTPRINT_CELL_SIZE;
        if (Math.hypot(centerX, centerZ) > WORLD_RADIUS) continue;
        const px = (cx + cellsPerRadius + 0.5) * scale;
        const pz = (cz + cellsPerRadius + 0.5) * scale;
        if (visited.has(`${cx},${cz}`)) {
          ctx.fillStyle = 'rgba(34, 211, 238, 0.35)';
          ctx.fillRect(px - scale * 0.45, pz - scale * 0.45, scale * 0.9, scale * 0.9);
        }
      }
    }

    if (player) {
      const px = (player.cx + cellsPerRadius + 0.5) * scale;
      const pz = (player.cz + cellsPerRadius + 0.5) * scale;
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(px, pz, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  }
}
