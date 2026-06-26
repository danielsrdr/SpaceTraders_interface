import { inject, Injectable, signal } from '@angular/core';
import { RadioService } from './radio.service';

export type WeatherKind = 'solar-flare' | 'ion-storm';

interface ActiveWeather {
  kind: WeatherKind;
  startMs: number;
  durationMs: number;
  color: readonly [number, number, number];
}

const FLARE_COLORS: readonly (readonly [number, number, number])[] = [
  [1.0, 0.55, 0.2],
  [1.0, 0.35, 0.18],
  [1.0, 0.78, 0.32],
];

/**
 * Ambient "space weather" generator. Periodically rolls solar flares (which
 * light up the nebula background and pulse the star) and ion storms (which
 * degrade sensors -> fog of war on the tactical radar). Events are announced on
 * the control radio. The flight view advances it once per frame via
 * {@link update} and reads the sampled values directly.
 */
@Injectable({ providedIn: 'root' })
export class SpaceWeatherService {
  private readonly radio = inject(RadioService);

  /** Current weather event (null when calm) — for optional HUD readouts. */
  readonly event = signal<WeatherKind | null>(null);

  /** Per-frame sampled values, read by the render loop (0 = none, 1 = peak). */
  flare = 0;
  readonly flareColor: [number, number, number] = [1, 0.55, 0.2];
  /** 1 = clear sensors, approaching 0 during an ion storm. */
  sensorQuality = 1;

  private current: ActiveWeather | null = null;
  private nextAtMs = 0;

  /** Advance the weather simulation. Call once per frame with performance.now(). */
  update(nowMs: number): void {
    if (this.nextAtMs === 0) {
      this.nextAtMs = nowMs + 15_000 + Math.random() * 25_000;
    }

    if (!this.current && nowMs >= this.nextAtMs) {
      this.startEvent(nowMs);
    }

    if (this.current) {
      const t = (nowMs - this.current.startMs) / this.current.durationMs;
      if (t >= 1) {
        this.endEvent(nowMs);
      } else {
        this.applyEvent(this.current, t);
      }
      return;
    }

    // Calm: relax flare + sensors back to baseline.
    this.flare = this.flare > 0.001 ? this.flare * 0.92 : 0;
    this.sensorQuality =
      this.sensorQuality < 0.999 ? this.sensorQuality + (1 - this.sensorQuality) * 0.05 : 1;
  }

  private startEvent(nowMs: number): void {
    const kind: WeatherKind = Math.random() < 0.5 ? 'solar-flare' : 'ion-storm';
    const color = FLARE_COLORS[Math.floor(Math.random() * FLARE_COLORS.length)]!;
    this.current = {
      kind,
      startMs: nowMs,
      durationMs: kind === 'solar-flare' ? 6500 : 16_000,
      color,
    };
    this.event.set(kind);

    switch (kind) {
      case 'solar-flare':
        this.flareColor[0] = color[0];
        this.flareColor[1] = color[1];
        this.flareColor[2] = color[2];
        this.radio.announce('Solar flare detected. Radiation surge across the sector.');
        break;
      case 'ion-storm':
        this.radio.announce('Ion storm inbound. Sensor resolution degraded.');
        break;
      default: {
        const _exhaustive: never = kind;
        void _exhaustive;
      }
    }
  }

  private applyEvent(ev: ActiveWeather, t: number): void {
    switch (ev.kind) {
      case 'solar-flare': {
        // Fast rise, long decay.
        const rise = Math.min(1, t / 0.18);
        const decay = 1 - Math.max(0, (t - 0.18) / 0.82);
        this.flare = Math.max(0, rise * decay);
        this.sensorQuality = 1 - this.flare * 0.2;
        break;
      }
      case 'ion-storm': {
        // Smooth dip down and back up over the event.
        const dip = Math.sin(Math.min(1, t) * Math.PI);
        this.sensorQuality = 1 - dip * 0.7;
        this.flare = 0;
        break;
      }
      default: {
        const _exhaustive: never = ev.kind;
        void _exhaustive;
      }
    }
  }

  private endEvent(nowMs: number): void {
    this.current = null;
    this.event.set(null);
    this.nextAtMs = nowMs + 25_000 + Math.random() * 45_000;
  }
}
