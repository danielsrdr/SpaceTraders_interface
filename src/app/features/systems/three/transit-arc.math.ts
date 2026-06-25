import { Object3D, Vector3 } from 'three';

/** Vertical lift applied to a transit arc's midpoint control point. Keeps short
 * hops visibly bowed while scaling with distance for longer legs. */
export function transitArcLift(v0: Vector3, v2: Vector3): number {
  return Math.max(6, v0.distanceTo(v2) * 0.18);
}

/**
 * Point on a transit arc at progress `t`. The arc is the quadratic bezier whose
 * control point is the origin/dest midpoint lifted in Y by {@link transitArcLift}.
 * Markers, the drawn line, and the camera-followed ship all sample this so they
 * ride exactly the same curve.
 */
export function sampleTransitArc(v0: Vector3, v2: Vector3, t: number, target: Vector3): Vector3 {
  const lift = transitArcLift(v0, v2);
  const mx = (v0.x + v2.x) * 0.5;
  const my = (v0.y + v2.y) * 0.5 + lift;
  const mz = (v0.z + v2.z) * 0.5;
  const u = 1 - t;
  const a = u * u;
  const b = 2 * u * t;
  const c = t * t;
  return target.set(
    a * v0.x + b * mx + c * v2.x,
    a * v0.y + b * my + c * v2.y,
    a * v0.z + b * mz + c * v2.z,
  );
}

/**
 * Yaw/pitch an object so its nose (the procedural hull faces -Z) points along
 * the arc's tangent at progress `t`. Uses a small look-ahead sample on the same
 * bezier the line is drawn from, so the object banks into the curve.
 */
export function orientAlongArc(
  obj: Object3D,
  v0: Vector3,
  v2: Vector3,
  t: number,
  scratch: Vector3,
): void {
  const ahead = sampleTransitArc(v0, v2, Math.min(1, t + 0.03), scratch);
  if (ahead.distanceToSquared(obj.position) < 1e-5) return;
  obj.lookAt(ahead);
  obj.rotateY(Math.PI);
}

/** Symmetric ease-in-out (smoothstep-like) used for the landing approach. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
