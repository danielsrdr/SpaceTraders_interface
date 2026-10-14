import { Object3D, Vector3 } from 'three';
import {
  computeTransitDeviation,
  easeInOut,
  orientAlongArc,
  sampleTransitArc,
  transitPoint,
  transitProfile,
  transitProfileRate,
} from './transit-arc.math';

const MODES = ['BURN', 'CRUISE', 'DRIFT', 'STEALTH'];

describe('transitProfile', () => {
  it.each(MODES)('%s starts at 0 and ends at 1 and is monotonic', (mode) => {
    expect(transitProfile(mode, 0)).toBeCloseTo(0, 10);
    expect(transitProfile(mode, 1)).toBeCloseTo(1, 10);
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const s = transitProfile(mode, i / 100);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it.each(MODES)('%s has zero rest velocity at both ends', (mode) => {
    expect(transitProfileRate(mode, 0)).toBeCloseTo(0, 10);
    expect(transitProfileRate(mode, 1)).toBeCloseTo(0, 10);
  });

  it('BURN is a brachistochrone: flip at the midpoint', () => {
    expect(transitProfile('BURN', 0.5)).toBeCloseTo(0.5, 10);
    expect(transitProfile('BURN', 0.25)).toBeCloseTo(2 * 0.25 * 0.25, 10);
  });

  it('coast modes have a constant-velocity phase, BURN does not', () => {
    expect(transitProfileRate('CRUISE', 0.4)).toBeCloseTo(transitProfileRate('CRUISE', 0.6), 10);
    expect(transitProfileRate('BURN', 0.4)).not.toBeCloseTo(transitProfileRate('BURN', 0.5), 3);
  });
});

describe('sampleTransitArc', () => {
  const v0 = new Vector3(100, 0, 0);
  const v2 = new Vector3(0, 0, 150);

  it.each(MODES)('%s departs from and arrives at the endpoints', (mode) => {
    expect(sampleTransitArc(v0, v2, 0, new Vector3(), mode, 30).distanceTo(v0)).toBeCloseTo(0, 8);
    expect(sampleTransitArc(v0, v2, 1, new Vector3(), mode, 30).distanceTo(v2)).toBeCloseTo(0, 8);
  });

  it('writes into the provided target vector', () => {
    const target = new Vector3();
    expect(sampleTransitArc(v0, v2, 0.25, target)).toBe(target);
  });

  it('adds a prograde hop arc on short legs only', () => {
    const a = new Vector3(0, 0, 0);
    const shortDev = computeTransitDeviation(a, new Vector3(10, 0, 0));
    const longDev = computeTransitDeviation(a, new Vector3(500, 0, 0));
    expect(shortDev.length()).toBeGreaterThan(0);
    expect(longDev.length()).toBeCloseTo(0, 10);
  });
});

describe('star avoidance', () => {
  const clearance = 40;

  function minDistance(o: Vector3, d: Vector3, mode: string): number {
    const p = new Vector3();
    let min = Infinity;
    for (let i = 0; i <= 400; i++) {
      sampleTransitArc(o, d, i / 400, p, mode, clearance);
      min = Math.min(min, p.length());
    }
    return min;
  }

  it('would cross the star without avoidance', () => {
    const o = new Vector3(200, 0, 3);
    const d = new Vector3(-200, 0, -3);
    const p = new Vector3();
    let min = Infinity;
    for (let i = 0; i <= 400; i++) {
      sampleTransitArc(o, d, i / 400, p, 'BURN', 0);
      min = Math.min(min, p.length());
    }
    expect(min).toBeLessThan(clearance);
  });

  it.each(MODES)('%s never enters the star clearance radius', (mode) => {
    const o = new Vector3(200, 0, 3);
    const d = new Vector3(-200, 0, -3);
    expect(minDistance(o, d, mode)).toBeGreaterThanOrEqual(clearance - 1e-6);
  });

  it('keeps endpoints fixed and leaves unobstructed legs straight', () => {
    const o = new Vector3(200, 0, 100);
    const d = new Vector3(300, 0, 150);
    const dev = computeTransitDeviation(o, d, clearance);
    expect(dev.length()).toBeCloseTo(0, 10);
    expect(transitPoint(o, d, dev, 0, new Vector3()).distanceTo(o)).toBeCloseTo(0, 10);
    expect(transitPoint(o, d, dev, 1, new Vector3()).distanceTo(d)).toBeCloseTo(0, 10);
  });
});

describe('orientAlongArc', () => {
  it('rotates an object to face along the arc tangent', () => {
    const obj = new Object3D();
    const before = obj.quaternion.clone();
    orientAlongArc(obj, new Vector3(0, 0, 0), new Vector3(0, 0, 500), 0.3, new Vector3());
    expect(obj.quaternion.angleTo(before)).toBeGreaterThan(0);
  });
});

describe('easeInOut', () => {
  it('pins the endpoints and the midpoint', () => {
    expect(easeInOut(0)).toBeCloseTo(0, 10);
    expect(easeInOut(1)).toBeCloseTo(1, 10);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
  });

  it('is symmetric about the midpoint', () => {
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1, 10);
  });
});
