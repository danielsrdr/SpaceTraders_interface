import { PlanetView } from '../../../models/system.model';
import { resolveWaypointType } from '../planet-helpers';
import { MIN_ORBIT_RADIUS_KM } from './physics-units';
export const STAR_MU = 1.0;

export interface CelestialProfile {
  radiusKm: number;
  mu: number;
}

const TYPE_PROFILE: Record<string, CelestialProfile> = {
  PLANET: { radiusKm: 6_000, mu: 3e-6 },
  GAS_GIANT: { radiusKm: 60_000, mu: 1e-3 },
  MOON: { radiusKm: 1_500, mu: 1e-7 },
  ORBITAL_STATION: { radiusKm: 1_200, mu: 1e-9 },
  JUMP_GATE: { radiusKm: 2_000, mu: 1e-8 },
  ASTEROID: { radiusKm: 900, mu: 1e-10 },
  ASTEROID_FIELD: { radiusKm: 3_500, mu: 1e-9 },
  ASTEROID_BASE: { radiusKm: 2_200, mu: 1e-9 },
  ENGINEERED_ASTEROID: { radiusKm: 1_600, mu: 1e-9 },
  NEBULA: { radiusKm: 5_000, mu: 1e-8 },
  DEBRIS_FIELD: { radiusKm: 2_800, mu: 1e-9 },
  GRAVITY_WELL: { radiusKm: 2_400, mu: 1e-1 },
  ARTIFICIAL_GRAVITY_WELL: { radiusKm: 2_400, mu: 1e-1 },
  ARTIFICAL_GRAVITY_WELL: { radiusKm: 2_400, mu: 1e-1 },
  FUEL_STATION: { radiusKm: 800, mu: 1e-10 },
  ARTIFACT: { radiusKm: 1_800, mu: 1e-8 },
};

const DEFAULT_PROFILE: CelestialProfile = { radiusKm: 4_200, mu: 2e-6 };

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Deterministic ±20 % radius variation from waypoint traits / name hash. */
function traitRadiusMultiplier(planet: PlanetView): number {
  const hash = hashString(planet.name);
  const base = 0.8 + (hash % 401) / 1000;
  const traitBoost =
    planet.traits?.some((t) => t.symbol === 'UNSTABLE' || t.symbol === 'HOLLOW') === true
      ? 0.85
      : 1;
  return base * traitBoost;
}

function baseProfile(planet: PlanetView): CelestialProfile {
  const resolved = resolveWaypointType(planet.type);
  return TYPE_PROFILE[resolved] ?? DEFAULT_PROFILE;
}

export function getCelestialProfile(planet: PlanetView): CelestialProfile {
  const base = baseProfile(planet);
  const mult = traitRadiusMultiplier(planet);
  return {
    radiusKm: base.radiusKm * mult,
    mu: base.mu,
  };
}

export function getSimRadiusKm(planet: PlanetView): number {
  return getCelestialProfile(planet).radiusKm;
}

export function getMuForBody(planet: PlanetView): number {
  return getCelestialProfile(planet).mu;
}

export function getParentMu(
  planet: PlanetView,
  bySymbol: ReadonlyMap<string, PlanetView>,
): number {
  const parentName = planet.orbits?.trim();
  if (!parentName || parentName === planet.name) return STAR_MU;
  const parent = bySymbol.get(parentName);
  if (!parent) return STAR_MU;
  return getMuForBody(parent);
}

/** Minimum orbit semi-major axis (km) keeping child clear of parent's surface. */
export function minOrbitSemiMajorKm(
  child: PlanetView,
  parent: PlanetView | null,
): number {
  if (!parent) return MIN_ORBIT_RADIUS_KM;
  const parentR = getSimRadiusKm(parent);
  const childR = getSimRadiusKm(child);
  return parentR + childR + 500;
}

/** Surface gravity (m/s²) from normalized μ and radius, calibrated to ~9.8 for Earth-like planets. */
export function surfaceGravityMs2(planet: PlanetView): number {
  const { radiusKm, mu } = getCelestialProfile(planet);
  const refMu = 3e-6;
  const refR = 6_000;
  const earthG = 9.80665;
  return earthG * (mu / refMu) * (refR / radiusKm) ** 2;
}

/** FPS gravity constant derived from the active waypoint body. */
export function fpsGravityForPlanet(planet: PlanetView): number {
  const g = surfaceGravityMs2(planet);
  const earthRatio = g / 9.80665;
  return Math.max(4, Math.min(28, 22 * earthRatio));
}
