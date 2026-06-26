import { easeInOut } from './transit-arc.math';

export type LaunchPhase = 'preflight' | 'levitate' | 'pitch' | 'climb';

export interface LaunchFrame {
  yLift: number;
  pitch: number;
  roll: number;
  heat: number;
  fov: number;
  shakeAmp: number;
  veil: number;
  phase: LaunchPhase;
  climbProgress: number;
  done: boolean;
}

export interface LaunchAnimationOptions {
  reducedMotion?: boolean;
  /** Fighter skips long levitation; industrial lingers on repulsors. */
  shipRole?: string;
  stormActive?: boolean;
}

const DEFAULT_DURATION_S = 5.8;
const REDUCED_DURATION_S = 2.8;
const PREFLIGHT_FRACTION = 1.5 / DEFAULT_DURATION_S;
const LEVITATION_END = 0.38;
const PITCH_END = 0.48;
const BASE_FOV = 70;
const CLIMB_FOV = 55;
const LEVITATION_LIFT = 4.2;
const CLIMB_LIFT = 98;
const MAX_PITCH = -0.55;
const MAX_ROLL = 0.08;

function easeInCubic(t: number): number {
  return t * t * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInExpo(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, 10 * t - 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function roleLevitationEnd(role: string | undefined): number {
  const profile = role?.toUpperCase() ?? '';
  if (profile.includes('INTERCEPTOR') || profile.includes('PATROL') || profile.includes('FIGHTER')) {
    return 0.28;
  }
  if (
    profile.includes('FABRICATOR') ||
    profile.includes('HARVESTER') ||
    profile.includes('EXCAVATOR') ||
    profile.includes('REFINERY')
  ) {
    return 0.48;
  }
  return LEVITATION_END;
}

/**
 * Drives the landed-ship launch sequence: preflight, VTOL levitation, nose-up pitch,
 * then exponential climb-out. Pure state machine — the surface view applies the frame.
 */
export class LaunchAnimation {
  private progress = 0;
  private emitted = false;
  private durationS = DEFAULT_DURATION_S;
  private reducedMotion = false;
  private levitationEnd = LEVITATION_END;
  private stormActive = false;

  reset(): void {
    this.progress = 0;
    this.emitted = false;
  }

  start(options: LaunchAnimationOptions = {}): void {
    this.progress = 0;
    this.emitted = false;
    this.reducedMotion = options.reducedMotion ?? false;
    this.stormActive = options.stormActive ?? false;
    this.durationS = this.reducedMotion ? REDUCED_DURATION_S : DEFAULT_DURATION_S;
    this.levitationEnd = this.reducedMotion ? 0.32 : roleLevitationEnd(options.shipRole);
  }

  update(delta: number): LaunchFrame {
    this.progress = Math.min(1, this.progress + delta / this.durationS);
    const u = this.progress;

    if (u <= PREFLIGHT_FRACTION && !this.reducedMotion) {
      const p = u / PREFLIGHT_FRACTION;
      const heat = easeInOut(p) * 0.18;
      return {
        yLift: 0,
        pitch: 0,
        roll: 0,
        heat,
        fov: BASE_FOV,
        shakeAmp: 0,
        veil: 0,
        phase: 'preflight',
        climbProgress: 0,
        done: false,
      };
    }

    const motionU = this.reducedMotion
      ? u
      : (u - PREFLIGHT_FRACTION) / (1 - PREFLIGHT_FRACTION);
    const levEnd = this.levitationEnd;
    const pitchEnd = this.reducedMotion ? levEnd + 0.08 : PITCH_END;

    if (motionU <= levEnd) {
      const p = motionU / levEnd;
      const eased = easeInOut(p);
      const heat = 0.12 + eased * 0.33;
      const shakeAmp = this.reducedMotion ? 0 : 0.04 + heat * 0.08;
      return {
        yLift: eased * LEVITATION_LIFT,
        pitch: 0,
        roll: 0,
        heat,
        fov: BASE_FOV,
        shakeAmp,
        veil: 0,
        phase: 'levitate',
        climbProgress: 0,
        done: false,
      };
    }

    if (motionU <= pitchEnd) {
      const p = (motionU - levEnd) / (pitchEnd - levEnd);
      const tilt = easeOutCubic(p);
      const roll = this.reducedMotion ? 0 : Math.sin(p * Math.PI) * MAX_ROLL;
      const heat = 0.45 + tilt * 0.2;
      const shakeAmp = this.reducedMotion ? 0 : 0.08 + heat * 0.12;
      return {
        yLift: LEVITATION_LIFT,
        pitch: -tilt * MAX_PITCH * 0.35,
        roll,
        heat,
        fov: lerp(BASE_FOV, 62, tilt),
        shakeAmp,
        veil: 0,
        phase: 'pitch',
        climbProgress: 0,
        done: false,
      };
    }

    const p = (motionU - pitchEnd) / (1 - pitchEnd);
    const climb = easeInExpo(p);
    const pitchBlend = easeOutCubic(Math.min(1, p * 1.2));
    const heat = 0.65 + climb * 0.35;
    const climbProgress = climb;
    const veilRaw = Math.max(0, (p - 0.5) * 2.4);
    const veil = this.stormActive ? veilRaw * 0.75 : veilRaw;
    const shakeAmp = this.reducedMotion ? 0 : 0.12 + heat * climb * 0.45;

    let done = false;
    if (this.progress >= 1 && !this.emitted) {
      this.emitted = true;
      done = true;
    }

    return {
      yLift: LEVITATION_LIFT + climb * CLIMB_LIFT,
      pitch: lerp(-MAX_PITCH * 0.35, MAX_PITCH, pitchBlend),
      roll: this.reducedMotion ? 0 : Math.sin(p * Math.PI * 2) * MAX_ROLL * (1 - p),
      heat,
      fov: lerp(BASE_FOV, CLIMB_FOV, climb),
      shakeAmp,
      veil,
      phase: 'climb',
      climbProgress,
      done,
    };
  }
}
