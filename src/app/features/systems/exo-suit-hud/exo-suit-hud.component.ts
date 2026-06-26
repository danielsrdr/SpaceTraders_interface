import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import type { SurfaceWeatherKind } from '../three/surface-trait-profile';

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
  readonly showControls = input(true);

  readonly hazardPct = computed(() => Math.round(this.hazardLevel() * 100));
  readonly sensorPct = computed(() => Math.round(this.sensorQuality() * 100));
  readonly sensorDegraded = computed(() => this.sensorQuality() < 0.92);
  readonly vignetteOpacity = computed(() => (1 - this.sensorQuality()) * 0.85);
  readonly stormOverlay = computed(() => {
    const evt = this.weatherEvent();
    if (!evt) return null;
    if (evt === 'sand-storm') return 'sand';
    if (evt === 'acid-rain') return 'acid';
    if (evt === 'giant-winds') return 'wind';
    return null;
  });

}
