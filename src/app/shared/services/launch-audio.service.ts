import { inject, Injectable } from '@angular/core';
import { SoundService } from './sound.service';

export type LaunchAudioPhase = 'preflight' | 'levitate' | 'ignition' | 'climb' | 'pitch';

/**
 * Synthesized launch SFX: repulsor hum, ignition burst, climb roar.
 * Uses Web Audio — no asset files required.
 */
@Injectable({ providedIn: 'root' })
export class LaunchAudioService {
  private readonly sound = inject(SoundService);

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private repulsorGain: GainNode | null = null;
  private climbGain: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private active = false;
  private lastPhase: LaunchAudioPhase | null = null;

  start(): void {
    if (this.sound.muted() || this.active) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    void ctx.resume();
    this.active = true;
    this.lastPhase = null;
    this.startRepulsorHum(ctx);
  }

  setPhase(phase: LaunchAudioPhase, heat: number): void {
    if (!this.active || this.sound.muted()) return;
    const ctx = this.ctx;
    if (!ctx || !this.masterGain || !this.repulsorGain || !this.climbGain) return;

    if (phase === 'preflight' && this.lastPhase !== 'preflight') {
      this.repulsorGain.gain.setTargetAtTime(0.08, ctx.currentTime, 0.4);
    }

    if (phase === 'levitate') {
      const target = 0.12 + heat * 0.22;
      this.repulsorGain.gain.setTargetAtTime(target, ctx.currentTime, 0.25);
    }

    if (phase === 'pitch' && this.lastPhase !== 'pitch') {
      this.playIgnitionBurst(ctx);
      this.repulsorGain.gain.setTargetAtTime(0.18, ctx.currentTime, 0.08);
      this.climbGain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.12);
    }

    if (phase === 'climb') {
      const roar = 0.15 + heat * 0.45;
      this.climbGain.gain.setTargetAtTime(roar, ctx.currentTime, 0.2);
      this.repulsorGain.gain.setTargetAtTime(0.1 + heat * 0.12, ctx.currentTime, 0.3);
    }

    this.lastPhase = phase;
  }

  stop(): void {
    const ctx = this.ctx;
    if (!ctx || !this.masterGain) {
      this.active = false;
      this.lastPhase = null;
      return;
    }
    const t = ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(0, t + 0.35);
    setTimeout(() => this.disposeNodes(), 400);
    this.active = false;
    this.lastPhase = null;
  }

  private startRepulsorHum(ctx: AudioContext): void {
    const buffer = this.createNoiseBuffer(ctx, 2);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;

    this.repulsorGain = ctx.createGain();
    this.repulsorGain.gain.value = 0.0001;

    this.climbGain = ctx.createGain();
    this.climbGain.gain.value = 0.0001;

    const climbFilter = ctx.createBiquadFilter();
    climbFilter.type = 'bandpass';
    climbFilter.frequency.value = 420;
    climbFilter.Q.value = 0.6;

    source.connect(filter);
    filter.connect(this.repulsorGain);
    source.connect(climbFilter);
    climbFilter.connect(this.climbGain);

    this.repulsorGain.connect(this.masterGain!);
    this.climbGain.connect(this.masterGain!);
    source.start();
    this.noiseSource = source;
  }

  private playIgnitionBurst(ctx: AudioContext): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }

  private createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private disposeNodes(): void {
    try {
      this.noiseSource?.stop();
      this.noiseSource?.disconnect();
    } catch {
      // Already stopped.
    }
    this.noiseSource = null;
    this.repulsorGain = null;
    this.climbGain = null;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.55;
      this.masterGain.connect(this.ctx.destination);
    } catch {
      return null;
    }
    return this.ctx;
  }
}
