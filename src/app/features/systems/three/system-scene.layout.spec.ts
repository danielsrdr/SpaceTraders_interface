import { PlanetView } from '../../../models/system.model';
import {
  apiRelativeOffset,
  computeSystemLayout3d,
  getPlanetRadius3d,
  shipMarkerScale,
  shipOrbitDistance,
} from './system-scene.layout';

function makePlanet(name: string, x: number, y: number, type = 'PLANET'): PlanetView {
  return { name, type, system: 'X1-TEST', position: { x, y }, traits: [] };
}

describe('computeSystemLayout3d', () => {
  it('returns sane defaults for an empty system', () => {
    const layout = computeSystemLayout3d([]);
    expect(layout.scale).toBe(2);
    expect(layout.centerX).toBe(0);
    expect(layout.centerY).toBe(0);
    expect(layout.sceneExtent).toBe(120);
    expect(layout.displayPositions.size).toBe(0);
  });

  it('clamps the scale to a minimum of 4 for a widely-spread system', () => {
    const layout = computeSystemLayout3d([makePlanet('A', -300, 0), makePlanet('B', 300, 0)]);
    expect(layout.scale).toBe(4);
  });

  it('keeps the scene extent at or above the 120 floor', () => {
    const layout = computeSystemLayout3d([makePlanet('A', 1, 1)]);
    expect(layout.sceneExtent).toBeGreaterThanOrEqual(120);
  });

  it('records a display position for every planet', () => {
    const layout = computeSystemLayout3d([makePlanet('A', 10, 0), makePlanet('B', -10, 5)]);
    expect(layout.displayPositions.has('A')).toBe(true);
    expect(layout.displayPositions.has('B')).toBe(true);
  });
});

describe('getPlanetRadius3d', () => {
  it('maps known waypoint types to fixed world radii', () => {
    expect(getPlanetRadius3d(makePlanet('p', 0, 0, 'PLANET'))).toBe(5);
    expect(getPlanetRadius3d(makePlanet('m', 0, 0, 'MOON'))).toBe(2.5);
    expect(getPlanetRadius3d(makePlanet('g', 0, 0, 'GAS_GIANT'))).toBe(12);
  });

  it('falls back to a default radius for unknown types', () => {
    expect(getPlanetRadius3d(makePlanet('x', 0, 0, 'MYSTERY_TYPE'))).toBe(3.5);
  });
});

describe('shipMarkerScale', () => {
  it('scales with waypoint radius and bumps up the selected ship', () => {
    expect(shipMarkerScale(5, false)).toBeCloseTo(0.225, 6);
    expect(shipMarkerScale(5, true)).toBeCloseTo(0.225 * 1.25, 6);
  });

  it('clamps to the [0.1, 0.35] range', () => {
    expect(shipMarkerScale(0, false)).toBe(0.1);
    expect(shipMarkerScale(1000, false)).toBe(0.35);
  });
});

describe('shipOrbitDistance', () => {
  it('offsets fleet rings outward from the waypoint radius', () => {
    expect(shipOrbitDistance(10)).toBe(25);
    expect(shipOrbitDistance(0)).toBe(10);
  });
});

describe('apiRelativeOffset', () => {
  it('returns the scaled offset from the system center when there is no parent', () => {
    const offset = apiRelativeOffset(makePlanet('A', 10, -4), null, {
      scale: 2,
      centerX: 0,
      centerY: 0,
    });
    expect(offset).toEqual({ x: 20, z: -8 });
  });

  it('returns the scaled offset from a parent waypoint', () => {
    const parent = makePlanet('P', 5, 5);
    const child = makePlanet('C', 8, 9);
    const offset = apiRelativeOffset(child, parent, { scale: 3, centerX: 0, centerY: 0 });
    expect(offset).toEqual({ x: 9, z: 12 });
  });
});
