import { PlanetView } from '../../../models/system.model';
import { MIN_ORBIT_RADIUS_KM } from './physics-units';
import { bodyPhysics, EARTH_GRAVITY_MS2, starProfile } from './universe-physics';

/**
 * Legacy normalised star μ, only used by the visual-calibration helpers in
 * `orbit-visual-scale`. Real μ values come from {@link starProfile}.
 * @deprecated
 */
export const STAR_MU = 1.0;

export interface CelestialProfile {
  radiusKm: number;
  /** Gravitational parameter μ = G·M (km³/s²). */
  mu: number;
}

export function getCelestialProfile(planet: PlanetView): CelestialProfile {
  const { radiusKm, mu } = bodyPhysics(planet);
  return { radiusKm, mu };
}

export function getSimRadiusKm(planet: PlanetView): number {
  return bodyPhysics(planet).radiusKm;
}

export function getMuForBody(planet: PlanetView): number {
  return bodyPhysics(planet).mu;
}

/** μ of the body `planet` orbits; the star's μ for top-level bodies. */
export function getParentMu(
  planet: PlanetView,
  bySymbol: ReadonlyMap<string, PlanetView>,
  starMu: number = starProfile(null).mu,
): number {
  const parentName = planet.orbits?.trim();
  if (!parentName || parentName === planet.name) return starMu;
  const parent = bySymbol.get(parentName);
  if (!parent) return starMu;
  return getMuForBody(parent);
}

/** Minimum orbit semi-major axis (km) keeping child clear of parent's surface. */
export function minOrbitSemiMajorKm(child: PlanetView, parent: PlanetView | null): number {
  if (!parent) return MIN_ORBIT_RADIUS_KM;
  return getSimRadiusKm(parent) + getSimRadiusKm(child) + 500;
}

/** Surface gravity (m/s²) from the body's real mass and radius. */
export function surfaceGravityMs2(planet: PlanetView): number {
  return bodyPhysics(planet).surfaceGravityMs2;
}

/** FPS gravity constant derived from the active waypoint body. */
export function fpsGravityForPlanet(planet: PlanetView): number {
  const earthRatio = surfaceGravityMs2(planet) / EARTH_GRAVITY_MS2;
  return Math.max(4, Math.min(28, 22 * earthRatio));
}
