import { effect, inject, Injectable, signal } from '@angular/core';
import { LogbookStore, LogCategory, LogEntry } from '../../core/state/logbook.store';

const MUTE_KEY = 'sk_radio_muted';
/** Only announce log entries fresher than this (skips history hydration). */
const FRESH_WINDOW_MS = 15_000;
/** Suppress repeat arrival calls for the same ship+waypoint within this window. */
const ARRIVAL_DEDUPE_MS = 30_000;

/**
 * Procedural ship-board control radio. A synthetic "voice of control" announces
 * gameplay events (arrivals, contracts, contacts, space weather) through the
 * browser SpeechSynthesis API, bracketed by short bursts of bandpass-filtered
 * white noise for radio "friture". Arrivals + contracts are picked up by
 * observing the persistent logbook; other events call the announce helpers
 * directly. Mute state is persisted to localStorage.
 */
@Injectable({ providedIn: 'root' })
export class RadioService {
  private readonly logbook = inject(LogbookStore);

  readonly muted = signal<boolean>(this.readMuted());

  private ctx: AudioContext | null = null;
  /** Highest logbook id already considered (monotonic). */
  private lastSeenId: number | null = null;
  private readonly recentArrivals = new Map<string, number>();

  constructor() {
    effect(() => {
      const entries = this.logbook.entries();
      // First emission establishes the baseline so persisted history is silent.
      if (this.lastSeenId === null) {
        this.lastSeenId = entries.length ? entries[entries.length - 1]!.id : 0;
        return;
      }
      let maxId = this.lastSeenId;
      for (const entry of entries) {
        if (entry.id <= this.lastSeenId) continue;
        this.onLogEntry(entry);
        if (entry.id > maxId) maxId = entry.id;
      }
      this.lastSeenId = maxId;
    });
  }

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    if (next && typeof window !== 'undefined') window.speechSynthesis?.cancel();
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      // Storage may be unavailable (private mode / quota); fail silently.
    }
  }

  announceArrival(ship: string | undefined, waypoint: string | undefined): void {
    const who = ship ?? 'Vessel';
    const where = waypoint ?? 'destination';
    const key = `${who}->${where}`;
    const now = Date.now();
    const last = this.recentArrivals.get(key);
    if (last !== undefined && now - last < ARRIVAL_DEDUPE_MS) return;
    this.recentArrivals.set(key, now);
    this.announce(`Arrival confirmed. ${this.speakable(who)} is now at ${this.speakable(where)}.`);
  }

  announceContract(message: string): void {
    this.announce(`Contract update. ${message}.`);
  }

  announceDirector(line: string, faction?: string | null): void {
    const prefix = faction ? `${this.speakable(faction)} director.` : 'Mission director.';
    this.announce(`${prefix} ${line}`);
  }

  announcePirate(count: number, waypoint?: string | null): void {
    const vessels = count === 1 ? 'an unidentified vessel' : `${count} unidentified vessels`;
    const where = waypoint ? ` near ${this.speakable(waypoint)}` : '';
    this.announce(`Warning. Sensors detect ${vessels}${where}. Stay alert.`);
  }

  /** Generic announcement used by space weather and any ad-hoc callers. */
  announce(text: string): void {
    if (this.muted()) return;
    if (typeof window === 'undefined') return;

    this.playStatic(220, 0.06);

    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;

    // Lead with the static, then speak; a short static tail closes the call.
    window.setTimeout(() => {
      if (this.muted()) return;
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.02;
      utter.pitch = 0.82;
      utter.volume = 0.9;
      const voice = this.pickVoice(synth);
      if (voice) utter.voice = voice;
      utter.onend = () => this.playStatic(140, 0.04);
      try {
        synth.speak(utter);
      } catch {
        // Some browsers throw if speech is invoked outside a gesture; ignore.
      }
    }, 170);
  }

  /** One-shot proximity call when entering ruins or cave zones on foot. */
  announceZoneProximity(kind: 'ruins' | 'cave', planet?: string): void {
    const where = planet ? ` at ${this.speakable(planet)}` : '';
    switch (kind) {
      case 'ruins':
        this.announce(`Anomaly field detected${where} — artifact resonance elevated.`);
        break;
      case 'cave':
        this.announce(`Subsurface cavity${where} — recommend structural scan before ingress.`);
        break;
      default: {
        const _exhaustive: never = kind;
        void _exhaustive;
      }
    }
  }

  private onLogEntry(entry: LogEntry): void {
    if (Date.now() - entry.timestamp > FRESH_WINDOW_MS) return;
    const category: LogCategory = entry.category;
    switch (category) {
      case 'navigate':
        if (entry.message.startsWith('Arrived at')) {
          this.announceArrival(entry.ship, entry.waypoint);
        }
        break;
      case 'contract':
        this.announceContract(entry.message);
        break;
      case 'extract':
      case 'siphon':
      case 'trade':
      case 'refuel':
      case 'surface':
        break;
      default: {
        const _exhaustive: never = category;
        void _exhaustive;
      }
    }
  }

  /** Make ship/waypoint symbols read more naturally (dashes -> spaces). */
  private speakable(symbol: string): string {
    return symbol.replace(/[-_]/g, ' ');
  }

  private pickVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
    const voices = synth.getVoices();
    if (!voices.length) return null;
    return (
      voices.find((v) => /en[-_]?(US|GB)/i.test(v.lang)) ??
      voices.find((v) => v.lang.toLowerCase().startsWith('en')) ??
      voices[0]!
    );
  }

  /** Short burst of bandpass-filtered white noise — the radio "friture". */
  private playStatic(durationMs: number, gainPeak: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    void ctx.resume();

    const now = ctx.currentTime;
    const dur = durationMs / 1000;
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 1800;
    bandpass.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
    source.stop(now + dur + 0.02);
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
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
