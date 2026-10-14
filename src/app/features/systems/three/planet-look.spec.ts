import { describe, expect, it } from 'vitest';
import type { PlanetView } from '../../../models/system.model';
import { planetLook } from './planet-look';

function waypoint(name: string, type: string, traits: string[] = [], x = 60, y = 0): PlanetView {
  return {
    name,
    type,
    system: 'TEST',
    position: { x, y },
    traits: traits.map((symbol) => ({ symbol, name: symbol })),
  };
}

describe('planetLook', () => {
  it('is deterministic', () => {
    const p = waypoint('X1-TEST-A1', 'PLANET', ['TEMPERATE']);
    expect(planetLook(p, 'YELLOW_STAR')).toEqual(planetLook(p, 'YELLOW_STAR'));
  });

  it('gives airless bodies no halo and no clouds', () => {
    const look = planetLook(waypoint('X1-TEST-M1', 'MOON', ['BARREN']));
    expect(look.atmosphere.thickness).toBe(0);
    expect(look.atmosphere.alpha).toBe(0);
    expect(look.atmosphere.shellScale).toBe(1);
    expect(look.cloudCover).toBe(0);
  });

  it('gives a temperate ocean world a water sea, a halo and clouds', () => {
    const look = planetLook(
      waypoint('X1-TEST-A2', 'PLANET', ['OCEAN', 'TEMPERATE']),
      'YELLOW_STAR',
    );
    expect(look.seaLevel).toBeGreaterThan(0);
    expect(look.liquidSpecular).toBe(true);
    expect(look.atmosphere.thickness).toBeGreaterThan(0);
    expect(look.atmosphere.shellScale).toBeGreaterThan(1);
    expect(look.cloudCover).toBeGreaterThan(0);
  });

  it('makes volcanic liquid emissive and not specular', () => {
    const look = planetLook(waypoint('X1-TEST-V1', 'PLANET', ['VOLCANIC', 'MAGMA_SEAS']));
    if (look.seaLevel > 0) {
      expect(look.liquidEmissive).toBe(true);
      expect(look.liquidSpecular).toBe(false);
    }
  });

  it('thickens the halo with pressure', () => {
    const thin = planetLook(waypoint('X1-TEST-T1', 'PLANET', ['THIN_ATMOSPHERE']));
    const dense = planetLook(waypoint('X1-TEST-D1', 'PLANET', ['EXTREME_PRESSURE']));
    expect(dense.atmosphere.thickness).toBeGreaterThan(thin.atmosphere.thickness);
  });

  it('keeps values within shader ranges', () => {
    const look = planetLook(waypoint('X1-TEST-F1', 'PLANET', ['FROZEN']), 'RED_STAR');
    for (const v of [look.capCover, look.cloudCover, look.atmosphere.thickness]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(look.sunIntensity).toBeGreaterThanOrEqual(0.6);
    expect(look.sunIntensity).toBeLessThanOrEqual(1.5);
  });

  it('shifts the light colour with the star type', () => {
    const p = waypoint('X1-TEST-S1', 'PLANET', ['TEMPERATE']);
    expect(planetLook(p, 'RED_STAR').sunColor).not.toBe(planetLook(p, 'BLUE_STAR').sunColor);
  });
});
