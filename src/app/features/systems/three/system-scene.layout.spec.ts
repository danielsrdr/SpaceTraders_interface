import { PlanetView } from '../../../models/system.model';
import {
  API_RENDER_SCALE,
  apiRelativeOffset,
  computeSystemLayout3d,
  getPlanetRadius3d,
  getPlanetSimRadiusKm,
  starRenderRadius,
} from './system-scene.layout';
import { getSimRadiusKm } from './celestial-mass';
import { API_UNIT_KM, renderBodyRadius, SYSTEM_KM_PER_RENDER_UNIT } from './universe-physics';

function makePlanet(name: string, x: number, y: number, type = 'PLANET'): PlanetView {
  return { name, type, system: 'X1-TEST', position: { x, y }, traits: [] };
}

describe('computeSystemLayout3d', () => {
  it('returns sane defaults for an empty system', () => {
    const layout = computeSystemLayout3d([]);
    expect(layout.scale).toBe(API_RENDER_SCALE);
    expect(layout.centerX).toBe(0);
    expect(layout.centerY).toBe(0);
    expect(layout.sceneExtent).toBe(120);
    expect(layout.displayPositions.size).toBe(0);
  });

  it('uses one universal scale regardless of how spread out the system is', () => {
    const small = computeSystemLayout3d([makePlanet('A', -5, 0), makePlanet('B', 5, 0)]);
    const large = computeSystemLayout3d([makePlanet('A', -300, 0), makePlanet('B', 300, 0)]);
    expect(small.scale).toBe(large.scale);
    expect(large.scale).toBe(API_UNIT_KM / SYSTEM_KM_PER_RENDER_UNIT);
  });

  it('keeps the star at the API origin (no recentering)', () => {
    const layout = computeSystemLayout3d([makePlanet('A', 100, 40), makePlanet('B', 120, 60)]);
    expect(layout.centerX).toBe(0);
    expect(layout.centerY).toBe(0);
    expect(layout.displayPositions.get('A')).toEqual({
      x: 100 * API_RENDER_SCALE,
      z: 40 * API_RENDER_SCALE,
    });
  });

  it('keeps the scene extent at or above the 120 floor and grows with distance', () => {
    const near = computeSystemLayout3d([makePlanet('A', 1, 1)]);
    const far = computeSystemLayout3d([makePlanet('A', 200, 0)]);
    expect(near.sceneExtent).toBeGreaterThanOrEqual(120);
    expect(far.sceneExtent).toBeGreaterThan(near.sceneExtent);
  });

  it('records a display position for every planet', () => {
    const layout = computeSystemLayout3d([makePlanet('A', 10, 0), makePlanet('B', -10, 5)]);
    expect(layout.displayPositions.has('A')).toBe(true);
    expect(layout.displayPositions.has('B')).toBe(true);
  });
});

describe('getPlanetRadius3d', () => {
  it('maps body radii through the universal size map', () => {
    for (const type of ['PLANET', 'MOON', 'GAS_GIANT', 'MYSTERY_TYPE']) {
      const body = makePlanet('p', 0, 0, type);
      expect(getPlanetRadius3d(body)).toBeCloseTo(renderBodyRadius(getSimRadiusKm(body)), 9);
    }
  });

  it('preserves size ordering: gas giant > planet > moon', () => {
    const giant = getPlanetRadius3d(makePlanet('g', 0, 0, 'GAS_GIANT'));
    const planet = getPlanetRadius3d(makePlanet('g', 0, 0, 'PLANET'));
    const moon = getPlanetRadius3d(makePlanet('g', 0, 0, 'MOON'));
    expect(giant).toBeGreaterThan(planet);
    expect(planet).toBeGreaterThan(moon);
  });
});

describe('getPlanetSimRadiusKm', () => {
  it('returns sim km for a planet type', () => {
    expect(getPlanetSimRadiusKm(makePlanet('p', 0, 0, 'PLANET'))).toBeGreaterThan(4_000);
  });
});

describe('starRenderRadius', () => {
  it('never swallows the innermost heliocentric orbit (hypergiant)', () => {
    const planets = [makePlanet('A', 12, 0)];
    const r = starRenderRadius('HYPERGIANT', planets);
    expect(r).toBeLessThanOrEqual(12 * API_RENDER_SCALE * 0.4 + 1e-9);
  });

  it('is larger for a blue star than for a white dwarf in the same system', () => {
    const planets = [makePlanet('A', 80, 0)];
    expect(starRenderRadius('BLUE_STAR', planets)).toBeGreaterThan(
      starRenderRadius('WHITE_DWARF', planets),
    );
  });
});

describe('apiRelativeOffset', () => {
  it('returns the scaled offset from the star when there is no parent', () => {
    const offset = apiRelativeOffset(makePlanet('A', 10, -4), null, { scale: 2 });
    expect(offset).toEqual({ x: 20, z: -8 });
  });

  it('returns the scaled offset from a parent waypoint', () => {
    const parent = makePlanet('P', 5, 5);
    const child = makePlanet('C', 8, 9);
    expect(apiRelativeOffset(child, parent, { scale: 3 })).toEqual({ x: 9, z: 12 });
  });
});
