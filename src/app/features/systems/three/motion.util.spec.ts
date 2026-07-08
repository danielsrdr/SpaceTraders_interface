import { Vector3 } from 'three';
import { applyCameraShake, prefersReducedMotion, smoothstep } from './motion.util';

describe('prefersReducedMotion', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('returns true when the user prefers reduced motion', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    expect(prefersReducedMotion()).toBe(true);
  });

  it('returns false when reduced motion is not preferred', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('smoothstep', () => {
  it('returns 0 below the lower edge', () => {
    expect(smoothstep(0, 1, -0.5)).toBe(0);
  });

  it('returns 1 above the upper edge', () => {
    expect(smoothstep(0, 1, 1.5)).toBe(1);
  });

  it('returns 0.5 at the midpoint', () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });

  it('eases between custom edges', () => {
    expect(smoothstep(-0.08, 0.25, -0.08)).toBe(0);
    expect(smoothstep(-0.08, 0.25, 0.25)).toBe(1);
  });
});

describe('applyCameraShake', () => {
  it('does nothing when amplitude is zero or negative', () => {
    const position = new Vector3(1, 2, 3);
    applyCameraShake(position, 0, 42, 1000);
    expect(position).toEqual(new Vector3(1, 2, 3));
    applyCameraShake(position, -0.5, 42, 1000);
    expect(position).toEqual(new Vector3(1, 2, 3));
  });

  it('offsets the camera position using the shared shake curve', () => {
    const position = new Vector3(0, 0, 0);
    const seed = 7;
    const nowMs = 1000;
    applyCameraShake(position, 1, seed, nowMs);

    const t = nowMs * 0.05 + seed;
    expect(position.x).toBeCloseTo(Math.sin(t * 1.7));
    expect(position.y).toBeCloseTo(Math.cos(t * 2.3));
    expect(position.z).toBeCloseTo(Math.sin(t * 1.1));
  });

  it('scales offsets by amplitude', () => {
    const low = new Vector3(0, 0, 0);
    const high = new Vector3(0, 0, 0);
    applyCameraShake(low, 0.5, 3, 500);
    applyCameraShake(high, 2, 3, 500);
    expect(high.x).toBeCloseTo(low.x * 4);
    expect(high.y).toBeCloseTo(low.y * 4);
    expect(high.z).toBeCloseTo(low.z * 4);
  });
});
