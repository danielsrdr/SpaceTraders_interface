import { Object3D, Vector3 } from 'three';
import { easeInOut, orientAlongArc, sampleTransitArc, transitArcLift } from './transit-arc.math';

describe('transitArcLift', () => {
  it('never drops below the 6-unit floor for short hops', () => {
    expect(transitArcLift(new Vector3(0, 0, 0), new Vector3(1, 0, 0))).toBe(6);
  });

  it('scales with distance for long legs', () => {
    expect(transitArcLift(new Vector3(0, 0, 0), new Vector3(0, 0, 100))).toBeCloseTo(18, 6);
  });
});

describe('sampleTransitArc', () => {
  const v0 = new Vector3(0, 0, 0);
  const v2 = new Vector3(10, 0, 0);

  it('returns the endpoints at t=0 and t=1', () => {
    expect(sampleTransitArc(v0, v2, 0, new Vector3()).distanceTo(v0)).toBeCloseTo(0, 10);
    expect(sampleTransitArc(v0, v2, 1, new Vector3()).distanceTo(v2)).toBeCloseTo(0, 10);
  });

  it('lifts the midpoint above the straight line', () => {
    const mid = sampleTransitArc(v0, v2, 0.5, new Vector3());
    expect(mid.x).toBeCloseTo(5, 6);
    expect(mid.z).toBeCloseTo(0, 6);
    // Lift is max(6, 10*0.18)=6; the bezier midpoint sits at half of that.
    expect(mid.y).toBeCloseTo(3, 6);
  });

  it('writes into the provided target vector', () => {
    const target = new Vector3();
    const result = sampleTransitArc(v0, v2, 0.25, target);
    expect(result).toBe(target);
  });
});

describe('orientAlongArc', () => {
  it('rotates an object to face along the arc tangent', () => {
    const obj = new Object3D();
    obj.position.set(0, 0, 0);
    const before = obj.quaternion.clone();
    orientAlongArc(obj, new Vector3(0, 0, 0), new Vector3(0, 0, 50), 0, new Vector3());
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
