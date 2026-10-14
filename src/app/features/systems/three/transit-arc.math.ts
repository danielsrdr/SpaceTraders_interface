import { Matrix4, Object3D, Quaternion, Vector3 } from 'three';

/**
 * Pure transit kinematics. A leg is a 1-D velocity profile s(t) (progress along
 * the path, t = API progress in [0, 1]) applied to a planar path
 *   p(s) = (1 - s)·O + s·D + dev · sin(π s)
 * where O/D are the (moving) endpoint frames and `dev` is a lateral deviation in
 * the ecliptic: a small prograde arc for satellite hops and/or a detour around
 * the star (world origin) when the chord would pass inside its clearance radius.
 */

// ─── Velocity profiles ───────────────────────────────────────────────────────

/** Fractions of the leg spent accelerating / decelerating (rest is coast). */
export interface ProfilePhases {
  accel: number;
  decel: number;
}

/**
 * BURN: constant acceleration, flip at the midpoint (brachistochrone).
 * CRUISE: accelerate 20%, coast, brake 20%. STEALTH: same with gentler ramps.
 * DRIFT: short impulse, long coast, low final braking.
 */
export function profilePhases(flightMode: string | undefined): ProfilePhases {
  switch (flightMode) {
    case 'BURN':
      return { accel: 0.5, decel: 0.5 };
    case 'DRIFT':
      return { accel: 0.1, decel: 0.1 };
    case 'STEALTH':
      return { accel: 0.3, decel: 0.3 };
    case 'CRUISE':
    default:
      return { accel: 0.2, decel: 0.2 };
  }
}

function peakRate({ accel, decel }: ProfilePhases): number {
  return 1 / (1 - (accel + decel) / 2);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Normalised distance s(t) ∈ [0, 1] for a trapezoidal velocity profile.
 * s(0)=0, s(1)=1, s'(0)=s'(1)=0 and s' is continuous (matched frame velocities).
 * BURN reduces to s = 2t² then 1 − 2(1 − t)².
 */
export function transitProfile(flightMode: string | undefined, t: number): number {
  const ph = profilePhases(flightMode);
  const u = clamp01(t);
  const v = peakRate(ph);
  if (u < ph.accel) return (v * u * u) / (2 * ph.accel);
  if (u <= 1 - ph.decel) return v * (ph.accel / 2 + (u - ph.accel));
  const r = 1 - u;
  return 1 - (v * r * r) / (2 * ph.decel);
}

/** ds/dt of {@link transitProfile} (per unit of normalised time). */
export function transitProfileRate(flightMode: string | undefined, t: number): number {
  const ph = profilePhases(flightMode);
  const u = clamp01(t);
  const v = peakRate(ph);
  if (u < ph.accel) return (v * u) / ph.accel;
  if (u <= 1 - ph.decel) return v;
  return (v * (1 - u)) / ph.decel;
}

// ─── Geometry ────────────────────────────────────────────────────────────────

/** Chords shorter than this (render units) get a prograde hop arc. */
const SHORT_HOP_UNITS = 24;
const HOP_ARC_FRACTION = 0.18;
const STAR_SAMPLES = 256;
const STAR_MARGIN = 1.02;
const UP = new Vector3(0, 1, 0);

const gDir = new Vector3();
const gNormal = new Vector3();
const gDev = new Vector3();
const gPoint = new Vector3();
const gChord = new Vector3();
const gClosest = new Vector3();
const gMatrix = new Matrix4();
const gFlip = new Quaternion().setFromAxisAngle(UP, Math.PI);
const ZERO = new Vector3();

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Lateral bump shape: zero at both ends. */
export function transitBump(s: number): number {
  return Math.sin(Math.PI * s);
}

/** Point on the planar path at path progress `s`. */
export function transitPoint(
  o: Vector3,
  d: Vector3,
  dev: Vector3,
  s: number,
  target: Vector3,
): Vector3 {
  const b = transitBump(s);
  return target.set(
    o.x + (d.x - o.x) * s + dev.x * b,
    o.y + (d.y - o.y) * s + dev.y * b,
    o.z + (d.z - o.z) * s + dev.z * b,
  );
}

/** dp/ds at path progress `s` (not normalised). */
export function transitTangent(
  o: Vector3,
  d: Vector3,
  dev: Vector3,
  s: number,
  target: Vector3,
): Vector3 {
  const db = Math.PI * Math.cos(Math.PI * s);
  return target.set(d.x - o.x + dev.x * db, d.y - o.y + dev.y * db, d.z - o.z + dev.z * db);
}

function starDistanceAt(o: Vector3, d: Vector3, dev: Vector3, s: number): number {
  return transitPoint(o, d, dev, s, gPoint).length();
}

/** Minimum distance from the origin along the path (sampled, then refined). */
function minStarDistance(o: Vector3, d: Vector3, dev: Vector3): number {
  let best = Infinity;
  let bestI = 0;
  for (let i = 0; i <= STAR_SAMPLES; i++) {
    const dist = starDistanceAt(o, d, dev, i / STAR_SAMPLES);
    if (dist < best) {
      best = dist;
      bestI = i;
    }
  }
  let lo = Math.max(0, (bestI - 1) / STAR_SAMPLES);
  let hi = Math.min(1, (bestI + 1) / STAR_SAMPLES);
  for (let k = 0; k < 24; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (starDistanceAt(o, d, dev, m1) < starDistanceAt(o, d, dev, m2)) hi = m2;
    else lo = m1;
  }
  return Math.min(best, starDistanceAt(o, d, dev, (lo + hi) / 2));
}

/**
 * Full-amplitude lateral deviation vector for the leg O→D (in the ecliptic).
 * `starClearance` is the radius (render units) kept free around the world origin;
 * 0 disables avoidance. Endpoints themselves are never moved.
 */
export function computeTransitDeviation(
  o: Vector3,
  d: Vector3,
  starClearance = 0,
  target = new Vector3(),
): Vector3 {
  gChord.subVectors(d, o);
  const len = gChord.length();
  target.set(0, 0, 0);
  if (len < 1e-6) return target;

  // Horizontal normal on the prograde side (counter-rotation of increasing orbital phase).
  gNormal.crossVectors(gChord, UP);
  if (gNormal.lengthSq() < 1e-12) gNormal.set(1, 0, 0);
  gNormal.normalize();

  const hop = HOP_ARC_FRACTION * len * (1 - smoothstep01(SHORT_HOP_UNITS / 2, SHORT_HOP_UNITS, len));
  gDev.copy(gNormal).multiplyScalar(hop);
  target.copy(gDev);

  if (starClearance <= 0 || o.length() <= starClearance || d.length() <= starClearance) {
    return target;
  }
  const goal = starClearance * STAR_MARGIN;
  if (minStarDistance(o, d, target) >= goal) return target;

  // Push the closest-approach side of the chord further away from the star.
  const u = clamp01(-o.dot(gChord) / (len * len));
  gClosest.copy(o).addScaledVector(gChord, u);
  const side = gClosest.dot(gNormal) >= 0 ? 1 : -1;
  const base = gDev.copy(target);
  const dev = new Vector3();
  const at = (a: number): number => {
    dev.copy(base).addScaledVector(gNormal, side * a);
    return minStarDistance(o, d, dev);
  };
  let hi = Math.max(starClearance, 1);
  while (at(hi) < goal && hi < 1e7) hi *= 2;
  let lo = 0;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < goal) lo = mid;
    else hi = mid;
  }
  return target.copy(base).addScaledVector(gNormal, side * hi);
}

/** Quaternion pointing the hull nose (-Z) along `dir`. Identity for a null vector. */
export function facingQuaternion(dir: Vector3, out: Quaternion): Quaternion {
  gDir.copy(dir);
  if (gDir.lengthSq() < 1e-14) return out.identity();
  gMatrix.lookAt(gDir, ZERO, UP);
  return out.setFromRotationMatrix(gMatrix).multiply(gFlip);
}

// ─── Convenience sampler (legacy API) ────────────────────────────────────────

/**
 * Point on a transit leg at API progress `t`, using the flight-mode velocity
 * profile and the planar path. Markers, the drawn line and the followed ship
 * all ride the same curve.
 */
export function sampleTransitArc(
  v0: Vector3,
  v2: Vector3,
  t: number,
  target: Vector3,
  flightMode = 'CRUISE',
  starClearance = 0,
): Vector3 {
  const dev = computeTransitDeviation(v0, v2, starClearance, new Vector3());
  return transitPoint(v0, v2, dev, transitProfile(flightMode, t), target);
}

/** Point the hull nose along the path tangent at progress `t`. */
export function orientAlongArc(
  obj: Object3D,
  v0: Vector3,
  v2: Vector3,
  t: number,
  scratch: Vector3,
  flightMode = 'CRUISE',
  starClearance = 0,
): void {
  const dev = computeTransitDeviation(v0, v2, starClearance, new Vector3());
  transitTangent(v0, v2, dev, transitProfile(flightMode, t), scratch);
  if (scratch.lengthSq() < 1e-14) return;
  facingQuaternion(scratch, obj.quaternion);
}

/** Symmetric ease-in-out (smoothstep-like) used for the boarding approach. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
