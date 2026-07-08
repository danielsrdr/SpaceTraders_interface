import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { computeDayNight, DAY_LENGTH_S } from './surface-day-night.controller';

describe('surface-day-night.controller', () => {
  it('ramps sun intensity through the day cycle', () => {
    const sun = {
      position: { set: () => {}, x: 0, y: 0, z: 0 },
      intensity: 0,
      color: new Color(),
    } as never;
    const hemi = { intensity: 0 } as never;
    const ambient = { intensity: 0 };
    const scene = { background: new Color(), fog: null };
    const emitters = { nightLights: [], nightGlows: [] };

    const noon = computeDayNight(
      DAY_LENGTH_S * 0.25,
      { sun, hemi, ambient },
      scene,
      emitters,
      { baseFogNear: 10, baseFogFar: 200, fogDayColor: new Color(0xffffff), weatherIntensity: 0 },
      () => {},
      () => {},
    );

    const midnight = computeDayNight(
      0,
      { sun, hemi, ambient },
      scene,
      emitters,
      { baseFogNear: 10, baseFogFar: 200, fogDayColor: new Color(0xffffff), weatherIntensity: 0 },
      () => {},
      () => {},
    );

    expect(noon.dayness).toBeGreaterThan(midnight.dayness);
  });
});
