import { Injectable, signal } from '@angular/core';

const MUTE_KEY = 'sk_sound_muted';

interface Note {
  freq: number;
  start: number;
  duration: number;
}

/**
 * Lightweight arcade-style sound cues synthesized at runtime via the Web Audio
 * API (no asset files). The AudioContext is created lazily on the first cue —
 * which always originates from a user gesture (accept/fulfill clicks) — so the
 * browser autoplay policy is satisfied. Mute state is persisted in localStorage.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  readonly muted = signal<boolean>(this.readMuted());
  private ctx: AudioContext | null = null;

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      // Storage may be unavailable (private mode / quota); fail silently.
    }
  }

  /** Short rising blip when a contract is accepted. */
  playAccept(): void {
    this.playSequence([
      { freq: 523.25, start: 0, duration: 0.08 }, // C5
      { freq: 783.99, start: 0.07, duration: 0.13 }, // G5
    ]);
  }

  /** Ascending arcade "complete" arpeggio when a contract is fulfilled. */
  playFulfill(): void {
    this.playSequence([
      { freq: 523.25, start: 0, duration: 0.09 }, // C5
      { freq: 659.25, start: 0.09, duration: 0.09 }, // E5
      { freq: 783.99, start: 0.18, duration: 0.09 }, // G5
      { freq: 1046.5, start: 0.27, duration: 0.2 }, // C6
    ]);
  }

  private playSequence(notes: Note[]): void {
    if (this.muted()) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    void ctx.resume();
    const now = ctx.currentTime;
    for (const note of notes) {
      this.playNote(ctx, note.freq, now + note.start, note.duration);
    }
  }

  private playNote(ctx: AudioContext, freq: number, startTime: number, duration: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, startTime);

    const peak = 0.16;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.03);
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private readMuted(): boolean {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
