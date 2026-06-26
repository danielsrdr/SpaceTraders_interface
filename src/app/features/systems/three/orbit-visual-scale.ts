import { STAR_MU } from './celestial-mass';
import {
  MAX_ORBIT_OMEGA,
  MIN_ORBIT_OMEGA,
  MIN_ORBIT_RADIUS_KM,
  REF_GIANT_ORBIT_KM,
  REF_GIANT_PERIOD_SEC,
  REF_HELIO_ORBIT_KM,
  REF_HELIO_PERIOD_SEC,
  REF_PLANET_ORBIT_KM,
  REF_PLANET_PERIOD_SEC,
  STAR_MU_THRESHOLD,
} from './physics-units';

interface OrbitReference {
  refAKm: number;
  refPeriodSec: number;
}

/** Reference orbit used to calibrate animation speed for a given parent's μ. */
export function orbitReference(parentMu: number): OrbitReference {
  if (parentMu >= STAR_MU * STAR_MU_THRESHOLD) {
    return { refAKm: REF_HELIO_ORBIT_KM, refPeriodSec: REF_HELIO_PERIOD_SEC };
  }
  if (parentMu >= 5e-4) {
    return { refAKm: REF_GIANT_ORBIT_KM, refPeriodSec: REF_GIANT_PERIOD_SEC };
  }
  return { refAKm: REF_PLANET_ORBIT_KM, refPeriodSec: REF_PLANET_PERIOD_SEC };
}

/**
 * Multiplier applied to sim Kepler mean motion so a reference orbit completes in
 * refPeriodSec while preserving n ∝ a^(-3/2) across all semi-major axes.
 */
export function orbitVisualTimeScale(parentMu: number): number {
  const { refAKm, refPeriodSec } = orbitReference(parentMu);
  const nRef = Math.sqrt(parentMu / (refAKm * refAKm * refAKm));
  const targetN = (2 * Math.PI) / refPeriodSec;
  return nRef > 0 ? targetN / nRef : targetN;
}

/**
 * Display mean motion (rad/s) from Kepler's third law, scaled for visible motion.
 * Heliocentric orbits are deliberately slow (minutes per revolution); moons faster.
 */
export function displayMeanMotion(semiMajorKm: number, parentMu: number): number {
  const a = Math.max(MIN_ORBIT_RADIUS_KM, semiMajorKm);
  const nSim = Math.sqrt(parentMu / (a * a * a));
  const n = nSim * orbitVisualTimeScale(parentMu);
  return Math.min(MAX_ORBIT_OMEGA, Math.max(MIN_ORBIT_OMEGA, n));
}

/** Estimated revolution period in seconds at the given semi-major axis. */
export function orbitPeriodSec(semiMajorKm: number, parentMu: number): number {
  const n = displayMeanMotion(semiMajorKm, parentMu);
  return n > 0 ? (2 * Math.PI) / n : Infinity;
}
