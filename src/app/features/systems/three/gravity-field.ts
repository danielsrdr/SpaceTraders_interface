import { Vector3 } from 'three';
import { PlanetView } from '../../../models/system.model';
import { getMuForBody } from './celestial-mass';
import { GRAVITY_SOFTENING_KM } from './physics-units';

export interface GravitySource {
  symbol: string;
  position: Vector3;
  /** Gravitational parameter μ = G·M in sim units. */
  mu: number;
  softening?: number;
}

const scratch = new Vector3();

/** Acceleration due to all sources at `pos` (sim units: km, km/s²). */
export function gravitationalAcceleration(
  pos: Vector3,
  sources: readonly GravitySource[],
  target = new Vector3(),
): Vector3 {
  target.set(0, 0, 0);
  for (const src of sources) {
    scratch.subVectors(pos, src.position);
    const soft = src.softening ?? GRAVITY_SOFTENING_KM;
    const r2 = scratch.lengthSq() + soft * soft;
    const r = Math.sqrt(r2);
    if (r < 1e-6) continue;
    const accel = src.mu / r2;
    target.addScaledVector(scratch, -accel / r);
  }
  return target;
}

/** Surface gravity g = μ / R² (m/s²), calibrated to Earth-like planets. */
export function surfaceGravity(mu: number, radiusKm: number): number {
  const refMu = 3e-6;
  const refR = 6_000;
  const earthG = 9.80665;
  return earthG * (mu / refMu) * (refR / radiusKm) ** 2;
}

/** Build gravity sources from planets at their current world positions (km). */
export function buildGravitySources(
  planets: PlanetView[],
  positionsKm: ReadonlyMap<string, Vector3>,
): GravitySource[] {
  return planets.map((planet) => ({
    symbol: planet.name,
    position: positionsKm.get(planet.name)?.clone() ?? new Vector3(),
    mu: getMuForBody(planet),
  }));
}

/** Circular orbital speed at radius `aKm` around a body with parameter μ. */
export function circularOrbitSpeedKmS(mu: number, aKm: number): number {
  return Math.sqrt(mu / aKm);
}
