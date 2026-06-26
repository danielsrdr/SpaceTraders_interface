import { inject, Injectable } from '@angular/core';
import { RadioService } from './radio.service';
import { SoundService } from './sound.service';
import type { SurfaceAmbienceKind, SurfaceAmbienceProfile } from '../../features/systems/three/surface-ambience';
import type { SurfaceWeatherKind } from '../../features/systems/three/surface-trait-profile';

type LoopKey = SurfaceAmbienceKind | 'storm-layer' | 'market-chatter';

interface ActiveLoop {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const LOOP_PATHS: Record<LoopKey, string> = {
  'desert-wind': '/assets/audio/surface/desert-wind.wav',
  'industrial-hum': '/assets/audio/surface/industrial-hum.wav',
  'frozen-silence': '/assets/audio/surface/frozen-silence.wav',
  'jungle-hum': '/assets/audio/surface/jungle-hum.wav',
  'storm-layer': '/assets/audio/surface/storm-layer.wav',
  'market-chatter': '/assets/audio/surface/market-chatter.wav',
};

const STORM_WEATHER: SurfaceWeatherKind[] = ['sand-storm', 'acid-rain', 'giant-winds'];

/**
 * Ambient surface audio loops loaded from assets and crossfaded on biome / weather
 * changes. Respects the global mute flag shared with {@link SoundService}.
 */
@Injectable({ providedIn: 'root' })
export class SurfaceAudioService {
  private readonly sound = inject(SoundService);
  private readonly radio = inject(RadioService);

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private buffers = new Map<LoopKey, AudioBuffer>();
  private active = new Map<LoopKey, ActiveLoop>();
  private currentKind: SurfaceAmbienceKind | null = null;
  private marketNear = false;
  private marketFactionAnnounced: string | null = null;
  private running = false;

  async start(profile: SurfaceAmbienceProfile, weather: SurfaceWeatherKind | null): Promise<void> {
    if (this.sound.muted()) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    await ctx.resume();
    this.running = true;
    await this.ensureBuffers();
    await this.applyAmbience(profile, weather, 0);
  }

  async crossfade(
    profile: SurfaceAmbienceProfile,
    weather: SurfaceWeatherKind | null,
    durationMs = 1500,
  ): Promise<void> {
    if (!this.running || this.sound.muted()) return;
    await this.applyAmbience(profile, weather, durationMs);
  }

  setMarketProximity(active: boolean, faction?: string): void {
    if (active && !this.marketNear && faction) {
      if (this.marketFactionAnnounced !== faction) {
        this.marketFactionAnnounced = faction;
        this.radio.announce(`${faction} market frequency — trade chatter on the ground.`);
      }
    }
    if (!active) {
      this.marketFactionAnnounced = null;
    }
    this.marketNear = active;
    this.syncMarketChatter(active ? 0.22 : 0, 800);
  }

  setStormIntensity(intensity: number): void {
    if (!this.running) return;
    const target = intensity * 0.75;
    this.fadeLoop('storm-layer', target, 400);
  }

  stop(): void {
    this.running = false;
    this.currentKind = null;
    this.marketNear = false;
    this.marketFactionAnnounced = null;
    for (const key of [...this.active.keys()]) {
      this.stopLoop(key);
    }
  }

  /** Crossfade all active loops out before launch SFX take over. */
  fadeOut(durationMs = 800): void {
    if (!this.running) return;
    const fadeMs = Math.max(0, durationMs);
    for (const key of [...this.active.keys()]) {
      this.fadeLoop(key, 0, fadeMs);
    }
    setTimeout(() => {
      if (!this.running) return;
      this.stop();
    }, fadeMs + 60);
  }

  private async applyAmbience(
    profile: SurfaceAmbienceProfile,
    weather: SurfaceWeatherKind | null,
    fadeMs: number,
  ): Promise<void> {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const kind = profile.kind;
    if (this.currentKind !== kind) {
      if (this.currentKind) {
        this.fadeLoop(this.currentKind, 0, fadeMs);
        setTimeout(() => this.stopLoop(this.currentKind!), fadeMs + 50);
      }
      this.currentKind = kind;
      this.startLoop(kind, profile.volume, fadeMs);
    } else {
      this.setLoopVolume(kind, profile.volume);
    }

    const stormActive = weather !== null && STORM_WEATHER.includes(weather);
    if (stormActive) {
      if (!this.active.has('storm-layer')) {
        this.startLoop('storm-layer', 0.35, fadeMs);
      }
    } else {
      this.fadeLoop('storm-layer', 0, fadeMs);
      if (this.active.has('storm-layer')) {
        setTimeout(() => this.stopLoop('storm-layer'), fadeMs + 50);
      }
    }

    this.syncMarketChatter(this.marketNear ? 0.22 : 0, fadeMs);
    this.masterGain.gain.setTargetAtTime(this.sound.muted() ? 0 : 1, ctx.currentTime, 0.05);
  }

  private syncMarketChatter(volume: number, fadeMs: number): void {
    if (volume > 0.01) {
      if (!this.active.has('market-chatter')) {
        this.startLoop('market-chatter', volume, fadeMs);
      } else {
        this.fadeLoop('market-chatter', volume, fadeMs);
      }
    } else {
      this.fadeLoop('market-chatter', 0, fadeMs);
      if (this.active.has('market-chatter')) {
        setTimeout(() => this.stopLoop('market-chatter'), fadeMs + 50);
      }
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
    } catch {
      return null;
    }
    return this.ctx;
  }

  private async ensureBuffers(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const pending = (Object.keys(LOOP_PATHS) as LoopKey[]).filter((k) => !this.buffers.has(k));
    await Promise.all(
      pending.map(async (key) => {
        try {
          const res = await fetch(LOOP_PATHS[key]);
          if (!res.ok) return;
          const buf = await res.arrayBuffer();
          this.buffers.set(key, await ctx.decodeAudioData(buf));
        } catch {
          // Asset missing or decode failed — loop stays silent.
        }
      }),
    );
  }

  private startLoop(key: LoopKey, volume: number, fadeMs: number): void {
    const ctx = this.ctx;
    const master = this.masterGain;
    const buffer = this.buffers.get(key);
    if (!ctx || !master || !buffer || this.active.has(key)) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(master);
    source.start();

    this.active.set(key, { source, gain });
    this.fadeLoop(key, volume, fadeMs);
  }

  private fadeLoop(key: LoopKey, volume: number, fadeMs: number): void {
    const ctx = this.ctx;
    const loop = this.active.get(key);
    if (!ctx || !loop) return;
    const t = ctx.currentTime;
    loop.gain.gain.cancelScheduledValues(t);
    loop.gain.gain.setValueAtTime(loop.gain.gain.value, t);
    loop.gain.gain.linearRampToValueAtTime(volume, t + fadeMs / 1000);
  }

  private setLoopVolume(key: LoopKey, volume: number): void {
    const loop = this.active.get(key);
    if (!loop) return;
    loop.gain.gain.value = volume;
  }

  private stopLoop(key: LoopKey): void {
    const loop = this.active.get(key);
    if (!loop) return;
    try {
      loop.source.stop();
      loop.source.disconnect();
      loop.gain.disconnect();
    } catch {
      // Already stopped.
    }
    this.active.delete(key);
  }
}
