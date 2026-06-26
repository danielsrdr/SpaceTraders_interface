import { describe, expect, it } from 'vitest';
import { LaunchAnimation } from './launch-animation';

describe('LaunchAnimation', () => {
  it('starts in preflight with zero lift', () => {
    const anim = new LaunchAnimation();
    anim.start({});
    const frame = anim.update(0.05);
    expect(frame.phase).toBe('preflight');
    expect(frame.yLift).toBe(0);
    expect(frame.done).toBe(false);
  });

  it('monotonically increases yLift after preflight', () => {
    const anim = new LaunchAnimation();
    anim.start({ reducedMotion: true });
    let lastY = -1;
    for (let i = 0; i < 120; i++) {
      const frame = anim.update(0.05);
      expect(frame.yLift).toBeGreaterThanOrEqual(lastY);
      lastY = frame.yLift;
    }
  });

  it('emits done exactly once at completion', () => {
    const anim = new LaunchAnimation();
    anim.start({ reducedMotion: true });
    let doneCount = 0;
    for (let i = 0; i < 80; i++) {
      const frame = anim.update(0.05);
      if (frame.done) doneCount++;
    }
    expect(doneCount).toBe(1);
  });

  it('skips shake when reduced motion is enabled', () => {
    const anim = new LaunchAnimation();
    anim.start({ reducedMotion: true });
    let maxShake = 0;
    for (let i = 0; i < 80; i++) {
      maxShake = Math.max(maxShake, anim.update(0.05).shakeAmp);
    }
    expect(maxShake).toBe(0);
  });
});
