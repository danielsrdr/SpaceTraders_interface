import { describe, expect, it } from 'vitest';
import type { PlanetView } from '../../../models/system.model';
import {
  fpsGravityFromMs2,
  planetEnvironment,
  rayleighScatter,
  surfaceCycleSeconds,
} from './planet-environment';

function waypoint(name: string, type: string, traits: string[] = [], x = 60, y = 0): PlanetView {
  return {
    name,
    type,
    system: 'TEST',
    position: { x, y },
    traits: traits.map((symbol) => ({ symbol, name: symbol })),
  };
}

describe('planetEnvironment', () => {
  it('is deterministic for the same waypoint and star', () => {
    const p = waypoint('X1-TEST-A1', 'PLANET', ['TEMPERATE']);
    expect(planetEnvironment(p, { starType: 'YELLOW_STAR' })).toEqual(
      planetEnvironment(p, { starType: 'YELLOW_STAR' }),
    );
  });

  it('gives airless bodies a black sky, hard shadows and stars by day', () => {
    const env = planetEnvironment(waypoint('X1-TEST-M1', 'MOON', ['BARREN']));
    expect(env.atmosphere.pressureBar).toBe(0);
    expect(env.sky.zenithColor).toBe(0x000000);
    expect(env.sky.fogDensity).toBe(0);
    expect(env.sky.starsByDay).toBe(true);
    expect(env.sky.ambientScale).toBeLessThan(0.1);
    expect(env.terrain.craterDensity).toBeGreaterThan(0.2);
    expect(env.weatherPool).toEqual([]);
  });

  it('makes a temperate world breathable with a blue-dominant sky', () => {
    const env = planetEnvironment(
      waypoint('X1-TEST-E1', 'PLANET', ['TEMPERATE', 'BREATHABLE_ATMOSPHERE']),
    );
    expect(env.kind).toBe('temperate');
    expect(env.atmosphere.breathable).toBe(true);
    const zenith = env.sky.zenithColor;
    expect(zenith & 255).toBeGreaterThan((zenith >> 16) & 255);
    expect(env.temperatureK).toBeGreaterThan(268);
    expect(env.temperatureK).toBeLessThan(310);
  });

  it('makes frozen worlds cold, snowy and auroral', () => {
    const env = planetEnvironment(waypoint('X1-TEST-F1', 'PLANET', ['FROZEN']));
    expect(env.kind).toBe('frozen');
    expect(env.temperatureK).toBeLessThan(260);
    expect(env.terrain.snowCover).toBeGreaterThan(0.5);
    expect(env.weatherPool).toContain('snow');
    expect(env.weatherPool).toContain('aurora');
  });

  it('makes volcanic worlds hot with lava and ash', () => {
    const env = planetEnvironment(waypoint('X1-TEST-V1', 'PLANET', ['VOLCANIC', 'SUPERVOLCANOES']));
    expect(env.kind).toBe('volcanic');
    expect(env.temperatureK).toBeGreaterThan(400);
    expect(env.terrain.liquid).toBe('lava');
    expect(env.weatherPool).toContain('ash-fall');
  });

  it('flags toxic and corrosive atmospheres as unbreathable with acid rain', () => {
    const env = planetEnvironment(waypoint('X1-TEST-T1', 'PLANET', ['CORROSIVE_ATMOSPHERE']));
    expect(env.atmosphere.breathable).toBe(false);
    expect(env.atmosphere.corrosive).toBe(true);
    expect(env.weatherPool).toContain('acid-rain');
    expect(env.hazardLevel).toBeGreaterThan(0.3);
  });

  it('keeps the habitable breathable trait on stations', () => {
    const env = planetEnvironment(waypoint('X1-TEST-S1', 'ORBITAL_STATION'));
    expect(env.kind).toBe('station');
    expect(env.atmosphere.breathable).toBe(true);
  });

  it('warms a planet orbiting a hotter star and dims it around a dwarf', () => {
    const p = waypoint('X1-TEST-P1', 'PLANET', ['TEMPERATE']);
    const hot = planetEnvironment({ ...p, traits: [] }, { starType: 'BLUE_STAR' });
    const cool = planetEnvironment({ ...p, traits: [] }, { starType: 'RED_STAR' });
    expect(hot.flux).toBeGreaterThan(cool.flux);
    expect(hot.temperatureK).toBeGreaterThan(cool.temperatureK);
    expect(hot.sky.sunIntensity).toBeGreaterThan(cool.sky.sunIntensity);
  });

  it('scales gravity into FPS units and relief inversely with gravity', () => {
    expect(fpsGravityFromMs2(9.80665)).toBeCloseTo(22, 5);
    expect(fpsGravityFromMs2(0.1)).toBe(4);
    expect(fpsGravityFromMs2(100)).toBe(28);
    const moon = planetEnvironment(waypoint('X1-TEST-M2', 'MOON', ['BARREN']));
    const giantWorld = planetEnvironment(waypoint('X1-TEST-P2', 'PLANET', ['TEMPERATE']));
    if (moon.gravityMs2 < giantWorld.gravityMs2) {
      expect(moon.terrain.reliefScale).toBeGreaterThanOrEqual(giantWorld.terrain.reliefScale);
    }
  });

  it('keeps the surface day cycle within sane bounds', () => {
    const env = planetEnvironment(waypoint('X1-TEST-P3', 'PLANET', ['TEMPERATE']));
    const cycle = surfaceCycleSeconds(env);
    expect(cycle).toBeGreaterThanOrEqual(80);
    expect(cycle).toBeLessThanOrEqual(300);
  });

  it('scatters short wavelengths most (Rayleigh)', () => {
    const c = rayleighScatter(0xffffff);
    expect(c & 255).toBeGreaterThan((c >> 16) & 255);
  });

  it('puts gas giants on a thick, overcast, windy cloud deck', () => {
    const env = planetEnvironment(waypoint('X1-TEST-G1', 'GAS_GIANT'));
    expect(env.kind).toBe('gas-giant');
    expect(env.sky.overcast).toBe(true);
    expect(env.weatherPool).toContain('giant-winds');
    expect(env.sky.fogDensity).toBeGreaterThan(0.5);
  });
});
