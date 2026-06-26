import { inject, Injectable, signal } from '@angular/core';
import { RadioService } from './radio.service';
import type { SurfaceWeatherKind } from '../../features/systems/three/surface-trait-profile';

interface ActiveSurfaceWeather {
  kind: SurfaceWeatherKind;
  startMs: number;
  durationMs: number;
}

const ANNOUNCEMENTS: Record<SurfaceWeatherKind, string> = {
  'sand-storm': 'Sand storm rolling in. Visibility dropping on the surface.',
  'acid-rain': 'Acid rain detected. Surface sensors degraded.',
  aurora: 'Polar aurora active. Night veins may be visible.',
  'giant-winds': 'Upper-atmosphere winds intensifying near the siphon deck.',
};

/**
 * Trait-driven surface weather. Configured per planet when the player lands;
 * the surface view advances it once per frame via {@link update}.
 */
@Injectable({ providedIn: 'root' })
export class SurfaceWeatherService {
  private readonly radio = inject(RadioService);

  readonly event = signal<SurfaceWeatherKind | null>(null);

  /** 0 = calm, 1 = peak intensity — modulates fog density. */
  intensity = 0;

  /** 1 = clear sensors; dips during acid rain / sand storms. */
  readonly sensorQualitySig = signal(1);

  get sensorQuality(): number {
    return this.sensorQualitySig();
  }

  private pool: SurfaceWeatherKind[] = ['sand-storm'];
  private hazardLevel = 0;
  private current: ActiveSurfaceWeather | null = null;
  private nextAtMs = 0;
  private configured = false;

  configure(pool: SurfaceWeatherKind[], hazardLevel: number): void {
    this.pool = pool.length ? [...pool] : ['sand-storm'];
    this.hazardLevel = hazardLevel;
    this.current = null;
    this.event.set(null);
    this.intensity = 0;
    this.sensorQualitySig.set(1);
    this.nextAtMs = 0;
    this.configured = true;
  }

  reset(): void {
    this.current = null;
    this.event.set(null);
    this.intensity = 0;
    this.sensorQualitySig.set(1);
    this.nextAtMs = 0;
    this.configured = false;
  }

  update(nowMs: number): void {
    if (!this.configured) return;

    if (this.nextAtMs === 0) {
      this.nextAtMs = nowMs + 20_000 + Math.random() * 30_000;
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

    this.intensity = this.intensity > 0.001 ? this.intensity * 0.92 : 0;
    const sq = this.sensorQualitySig();
    this.sensorQualitySig.set(sq < 0.999 ? sq + (1 - sq) * 0.05 : 1);
  }

  private startEvent(nowMs: number): void {
    const kind = this.pool[Math.floor(Math.random() * this.pool.length)]!;
    const durationMs =
      kind === 'aurora' ? 22_000 : kind === 'giant-winds' ? 14_000 : kind === 'acid-rain' ? 18_000 : 12_000;

    this.current = { kind, startMs: nowMs, durationMs };
    this.event.set(kind);
    this.radio.announce(ANNOUNCEMENTS[kind]);
  }

  private applyEvent(ev: ActiveSurfaceWeather, t: number): void {
    switch (ev.kind) {
      case 'sand-storm': {
        const rise = Math.min(1, t / 0.2);
        const decay = 1 - Math.max(0, (t - 0.2) / 0.8);
        this.intensity = Math.max(0, rise * decay);
        this.sensorQualitySig.set(1 - this.intensity * (0.35 + this.hazardLevel * 0.15));
        break;
      }
      case 'acid-rain': {
        const dip = Math.sin(Math.min(1, t) * Math.PI);
        this.intensity = dip * 0.85;
        this.sensorQualitySig.set(1 - dip * (0.45 + this.hazardLevel * 0.25));
        break;
      }
      case 'aurora': {
        this.intensity = 0.35 + 0.25 * Math.sin(t * Math.PI * 4);
        this.sensorQualitySig.set(1);
        break;
      }
      case 'giant-winds': {
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
        this.intensity = pulse * 0.7;
        this.sensorQualitySig.set(1 - pulse * 0.1);
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
    this.nextAtMs = nowMs + 30_000 + Math.random() * 50_000;
  }
}
