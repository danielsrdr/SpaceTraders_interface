import { Vector3 } from 'three';
import { applyCameraShake, prefersReducedMotion } from '../motion.util';

export interface CameraShakeState {
  shakeUntil: number;
  shakeSeed: number;
}

export function computeShakeAmplitude(
  now: number,
  state: CameraShakeState,
  landingActive: boolean,
  landingProgress: number,
): number {
  let amp = now < state.shakeUntil ? 0.35 * ((state.shakeUntil - now) / 320) : 0;
  if (landingActive && !prefersReducedMotion()) {
    amp = Math.max(amp, 0.12 + landingProgress * 0.55);
  }
  return amp;
}

export function applyFlightCameraShake(
  position: Vector3,
  now: number,
  state: CameraShakeState,
  landingActive: boolean,
  landingProgress: number,
): void {
  const amp = computeShakeAmplitude(now, state, landingActive, landingProgress);
  applyCameraShake(position, amp, state.shakeSeed, now);
}

export function triggerActionPulse(now: number, state: CameraShakeState): void {
  state.shakeUntil = now + 320;
  state.shakeSeed = Math.random() * 1000;
}
