import { Vector3 } from 'three';
import { easeInOut } from './transit-arc.math';

/** Body being landed on; radius drives the touchdown standoff offset. */
export interface LandingTarget {
  name: string;
  radius: number;
}

export interface LandingFrame {
  /** Eased descent position to copy onto the ship. */
  position: Vector3;
  /** Screen white-out fade in [0,1] as the ship touches down. */
  fade: number;
  /** True exactly once, on the frame the descent finishes. */
  done: boolean;
}

/** Seconds for a full descent. */
const LANDING_DURATION_S = 1.5;

/**
 * Drives the camera-followed ship's descent onto a body. Pure state machine:
 * the component feeds it deltas and current target world positions, and applies
 * the returned position/fade. Completion is reported once via {@link LandingFrame.done}.
 */
export class LandingAnimation {
  private progress = 0;
  private emitted = false;
  private current: LandingTarget | null = null;
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly position = new Vector3();
  private readonly offsetScratch = new Vector3();

  get target(): LandingTarget | null {
    return this.current;
  }

  get descentProgress(): number {
    return this.progress;
  }

  /** Begin a descent from `from` toward `target` at its current world position. */
  start(from: Vector3, target: LandingTarget, targetWorld: Vector3): void {
    this.current = target;
    this.progress = 0;
    this.emitted = false;
    this.from.copy(from);
    this.to.copy(targetWorld).add(this.offset(target.radius));
  }

  /** Re-aim the touchdown point as the body keeps orbiting mid-descent. */
  retarget(targetWorld: Vector3): void {
    if (!this.current) return;
    this.to.copy(targetWorld).add(this.offset(this.current.radius));
  }

  update(delta: number): LandingFrame {
    this.progress = Math.min(1, this.progress + delta / LANDING_DURATION_S);
    const eased = easeInOut(this.progress);
    this.position.lerpVectors(this.from, this.to, eased);
    const fadeRaw = Math.min(1, Math.max(0, (this.progress - 0.4) / 0.6));
    const fade = Math.pow(fadeRaw, 1.2);
    let done = false;
    if (this.progress >= 1 && !this.emitted) {
      this.emitted = true;
      done = true;
    }
    return { position: this.position, fade, done };
  }

  reset(): void {
    this.current = null;
    this.progress = 0;
    this.emitted = false;
  }

  private offset(radius: number): Vector3 {
    return this.offsetScratch.set(0, radius * 0.5, radius + 2);
  }
}
