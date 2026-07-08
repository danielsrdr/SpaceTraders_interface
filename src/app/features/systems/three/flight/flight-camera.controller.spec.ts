import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { computeShakeAmplitude } from './flight-camera.controller';

describe('flight-camera.controller', () => {
  it('decays shake amplitude after pulse', () => {
    const state = { shakeUntil: 1000, shakeSeed: 42 };
    const amp = computeShakeAmplitude(900, state, false, 0);
    expect(amp).toBeCloseTo(0.35 * (100 / 320), 5);
  });

  it('returns zero when shake window elapsed', () => {
    const state = { shakeUntil: 500, shakeSeed: 42 };
    expect(computeShakeAmplitude(600, state, false, 0)).toBe(0);
  });
});
