/**
 * Shared physical model of the SpaceTraders universe.
 *
 * Every system uses the same constants and laws: real SI-derived values in km,
 * kg and seconds, one universal clock, one API → km mapping and one render
 * mapping. Gameplay data (waypoint type, traits, system type) only selects
 * physical parameters; it never changes the laws.
 *
 * Pure module (no Three.js, no Angular) so engines, workers and specs can share it.
 */

import type { PlanetView } from '../../../models/system.model';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Newtonian constant of gravitation in km³ / (kg · s²). */
export const G_KM3_KG_S2 = 6.674_30e-20;
/** Solar mass (kg) and gravitational parameter μ☉ (km³/s²). */
export const SOLAR_MASS_KG = 1.988_92e30;
export const SOLAR_MU_KM3_S2 = 1.327_124_4e11;
/** Solar radius (km) and luminosity reference (L☉ = 1). */
export const SOLAR_RADIUS_KM = 695_700;
/** Earth reference body. */
export const EARTH_MU_KM3_S2 = 398_600.4;
export const EARTH_RADIUS_KM = 6_371;
export const EARTH_GRAVITY_MS2 = 9.806_65;
/** Astronomical unit (km). */
export const AU_KM = 149_597_870.7;
/** Speed of light (km/s) — used for compact-object radii. */
export const LIGHT_SPEED_KM_S = 299_792.458;

/**
 * One SpaceTraders coordinate unit in km. Waypoints sit 10–80 units from the
 * star in typical systems, i.e. ≈ 0.7–5 AU: the scale of a real planetary system.
 */
export const API_UNIT_KM = 1e7;

/**
 * Universal clock: simulated seconds per real second. A single value for every
 * system keeps Kepler's third law intact across moons, planets and stars
 * (1 day ≈ 43 s, a 1 AU year ≈ 4.4 h, the Moon ≈ 19 min).
 */
export const UNIVERSE_TIME_SCALE = 2_000;
/** Universal epoch: API coordinates are the body positions at this instant. */
export const UNIVERSE_EPOCH_MS = Date.UTC(2024, 0, 1);

/** Shortest displayed orbital period (s): anti-aliasing guard for close orbits. */
export const MIN_DISPLAY_PERIOD_SEC = 24;

// ─── Universal clock ─────────────────────────────────────────────────────────

/** Universe simulation time (s) at a wall-clock instant — same for every viewer. */
export function universeTimeSec(nowMs: number = Date.now()): number {
  return ((nowMs - UNIVERSE_EPOCH_MS) / 1000) * UNIVERSE_TIME_SCALE;
}

// ─── Stars ───────────────────────────────────────────────────────────────────

export type StarClass =
  | 'NEUTRON_STAR'
  | 'RED_STAR'
  | 'ORANGE_STAR'
  | 'BLUE_STAR'
  | 'YOUNG_STAR'
  | 'WHITE_DWARF'
  | 'BLACK_HOLE'
  | 'HYPERGIANT'
  | 'NEBULA'
  | 'UNSTABLE';

export interface StarProfile {
  starClass: StarClass;
  /** Mass in solar masses. */
  massSolar: number;
  /** μ = G·M (km³/s²). */
  mu: number;
  /** Physical radius (km) before the system-fit clamp. */
  radiusKm: number;
  /** Bolometric luminosity (L☉). */
  luminositySolar: number;
  /** Effective temperature (K). */
  temperatureK: number;
  /** Emitted light colour (sRGB hex). */
  color: number;
}

interface StarSeed {
  massSolar: number;
  radiusSolar: number;
  luminositySolar: number;
  temperatureK: number;
  color: number;
}

/** Representative main-sequence / remnant parameters per SpaceTraders system type. */
const STAR_SEEDS: Record<StarClass, StarSeed> = {
  RED_STAR: {
    massSolar: 0.3,
    radiusSolar: 0.35,
    luminositySolar: 0.015,
    temperatureK: 3_200,
    color: 0xffa070,
  },
  ORANGE_STAR: {
    massSolar: 0.75,
    radiusSolar: 0.8,
    luminositySolar: 0.35,
    temperatureK: 4_500,
    color: 0xffc58a,
  },
  YOUNG_STAR: {
    massSolar: 1.2,
    radiusSolar: 2.2,
    luminositySolar: 3,
    temperatureK: 5_400,
    color: 0xfff0d0,
  },
  BLUE_STAR: {
    massSolar: 8,
    radiusSolar: 4,
    luminositySolar: 2_000,
    temperatureK: 20_000,
    color: 0xa8bfff,
  },
  WHITE_DWARF: {
    massSolar: 0.6,
    radiusSolar: 0.012,
    luminositySolar: 0.003,
    temperatureK: 15_000,
    color: 0xe6edff,
  },
  NEUTRON_STAR: {
    massSolar: 1.4,
    radiusSolar: 12 / SOLAR_RADIUS_KM,
    luminositySolar: 0.0005,
    temperatureK: 600_000,
    color: 0xc8d6ff,
  },
  // Accretion-disk luminosity; the radius is set to the Schwarzschild radius below.
  BLACK_HOLE: {
    massSolar: 10,
    radiusSolar: 0,
    luminositySolar: 0.05,
    temperatureK: 10_000,
    color: 0xffb070,
  },
  HYPERGIANT: {
    massSolar: 40,
    radiusSolar: 120,
    luminositySolar: 300_000,
    temperatureK: 9_000,
    color: 0xf4f2ff,
  },
  // Protostar embedded in its nebula.
  NEBULA: {
    massSolar: 1,
    radiusSolar: 3,
    luminositySolar: 2,
    temperatureK: 4_200,
    color: 0xffd2b0,
  },
  // Irregular variable star.
  UNSTABLE: {
    massSolar: 2.5,
    radiusSolar: 6,
    luminositySolar: 60,
    temperatureK: 6_500,
    color: 0xfff0a0,
  },
};

const DEFAULT_STAR_CLASS: StarClass = 'ORANGE_STAR';

export function resolveStarClass(systemType: string | null | undefined): StarClass {
  const normalized = (systemType ?? '').trim().toUpperCase();
  return normalized in STAR_SEEDS ? (normalized as StarClass) : DEFAULT_STAR_CLASS;
}

/** Star of a system from its API `type` (unknown types fall back to an orange dwarf). */
export function starProfile(systemType: string | null | undefined): StarProfile {
  const starClass = resolveStarClass(systemType);
  const seed = STAR_SEEDS[starClass];
  const mu = seed.massSolar * SOLAR_MU_KM3_S2;
  const radiusKm =
    starClass === 'BLACK_HOLE' ? schwarzschildRadiusKm(mu) : seed.radiusSolar * SOLAR_RADIUS_KM;
  return {
    starClass,
    massSolar: seed.massSolar,
    mu,
    radiusKm,
    luminositySolar: seed.luminositySolar,
    temperatureK: seed.temperatureK,
    color: seed.color,
  };
}

export function schwarzschildRadiusKm(mu: number): number {
  return (2 * mu) / (LIGHT_SPEED_KM_S * LIGHT_SPEED_KM_S);
}

/**
 * A star cannot engulf its own planets: clamp the radius to a fraction of the
 * innermost heliocentric periapsis (km). Only affects hypergiants.
 */
export function fitStarRadiusKm(star: StarProfile, innermostOrbitKm: number): number {
  if (!(innermostOrbitKm > 0)) return star.radiusKm;
  return Math.min(star.radiusKm, innermostOrbitKm * 0.4);
}

// ─── Bodies ──────────────────────────────────────────────────────────────────

export interface BodyPhysics {
  /** Mean physical radius (km). */
  radiusKm: number;
  /** Mass (kg). */
  massKg: number;
  /** μ = G·M (km³/s²). */
  mu: number;
  /** Bulk density (kg/m³). */
  densityKgM3: number;
  /** Sidereal rotation period (s); negative = retrograde. Tidal locking is decided by the orbit engine. */
  rotationPeriodSec: number;
  /** Surface gravity (m/s²). */
  surfaceGravityMs2: number;
  /** Escape velocity (km/s). */
  escapeVelocityKmS: number;
  /** True for artificial structures whose gravity is negligible or simulated. */
  artificial: boolean;
}

interface BodySeed {
  /** Base radius (km); varied deterministically ±25 % per body. */
  radiusKm: number;
  densityKgM3: number;
  rotationHours: number;
  artificial?: boolean;
}

/** Physical archetype per waypoint type (orders of magnitude of real analogues). */
const BODY_SEEDS: Record<string, BodySeed> = {
  PLANET: { radiusKm: 6_000, densityKgM3: 5_000, rotationHours: 24 }, // Earth / Venus / Mars class
  GAS_GIANT: { radiusKm: 60_000, densityKgM3: 1_100, rotationHours: 10 }, // Jupiter / Saturn
  MOON: { radiusKm: 1_600, densityKgM3: 3_200, rotationHours: 0 }, // Moon / Io — tidally locked
  ASTEROID: { radiusKm: 25, densityKgM3: 2_200, rotationHours: 6 },
  ENGINEERED_ASTEROID: { radiusKm: 15, densityKgM3: 2_600, rotationHours: 0.05 }, // spun for gravity
  ASTEROID_BASE: { radiusKm: 40, densityKgM3: 2_400, rotationHours: 8 },
  ASTEROID_FIELD: { radiusKm: 30, densityKgM3: 2_000, rotationHours: 9 }, // largest body of the field
  DEBRIS_FIELD: { radiusKm: 2, densityKgM3: 2_000, rotationHours: 3 },
  NEBULA: { radiusKm: 5, densityKgM3: 500, rotationHours: 0 },
  ORBITAL_STATION: { radiusKm: 2, densityKgM3: 400, rotationHours: 0.03, artificial: true },
  FUEL_STATION: { radiusKm: 1, densityKgM3: 400, rotationHours: 0.03, artificial: true },
  JUMP_GATE: { radiusKm: 5, densityKgM3: 600, rotationHours: 0, artificial: true },
  // Compact anomalies: small but extremely dense (a few Earth masses).
  GRAVITY_WELL: { radiusKm: 400, densityKgM3: 2e7, rotationHours: 0.5 },
  ARTIFICIAL_GRAVITY_WELL: {
    radiusKm: 300,
    densityKgM3: 3e7,
    rotationHours: 0.2,
    artificial: true,
  },
};

const DEFAULT_BODY_SEED: BodySeed = { radiusKm: 3_000, densityKgM3: 3_500, rotationHours: 20 };

/** Trait multipliers applied to density (mass at fixed radius). */
const TRAIT_DENSITY: Record<string, number> = {
  WEAK_GRAVITY: 0.55,
  STRONG_GRAVITY: 1.6,
  CRUSHING_GRAVITY: 2.6,
  HOLLOWED_INTERIOR: 0.45,
  STRIPPED: 0.85,
  MICRO_GRAVITY_ANOMALIES: 0.8,
};

/** Trait multipliers applied to radius. */
const TRAIT_RADIUS: Record<string, number> = {
  JOVIAN: 1.15,
  STRIPPED: 0.9,
  UNSTABLE_COMPOSITION: 0.92,
};

export function normalizeWaypointType(type: string): string {
  const normalized = type.trim().toUpperCase();
  if (normalized === 'ARTIFICAL_GRAVITY_WELL') return 'ARTIFICIAL_GRAVITY_WELL';
  return normalized;
}

/** FNV-1a 32-bit hash: stable seed for per-body variation. */
export function hashSymbol(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic fraction in [0, 1) from a symbol and a salt. */
export function symbolUnit(symbol: string, salt: number): number {
  let h = hashSymbol(symbol) ^ Math.imul(salt + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4_294_967_296;
}

function traitSymbols(planet: Pick<PlanetView, 'traits' | 'modifiers'>): string[] {
  const traits = planet.traits?.map((t) => t.symbol) ?? [];
  const modifiers = planet.modifiers?.map((m) => m.symbol) ?? [];
  return [...traits, ...modifiers];
}

/** Physical description of a waypoint, derived from its type, traits and symbol. */
export function bodyPhysics(
  planet: Pick<PlanetView, 'name' | 'type' | 'traits' | 'modifiers'>,
): BodyPhysics {
  const type = normalizeWaypointType(planet.type);
  const seed = BODY_SEEDS[type] ?? DEFAULT_BODY_SEED;
  const symbols = traitSymbols(planet);

  let radiusKm = seed.radiusKm * (0.75 + 0.5 * symbolUnit(planet.name, 11));
  let density = seed.densityKgM3 * (0.85 + 0.3 * symbolUnit(planet.name, 12));
  for (const s of symbols) {
    radiusKm *= TRAIT_RADIUS[s] ?? 1;
    density *= TRAIT_DENSITY[s] ?? 1;
  }

  const radiusM = radiusKm * 1000;
  const massKg = density * (4 / 3) * Math.PI * radiusM * radiusM * radiusM;
  const mu = G_KM3_KG_S2 * massKg;
  const artificial = seed.artificial === true;
  // Stations spin for ~1 g on the habitat ring; gravity at the "surface" is simulated.
  const surfaceGravityMs2 = artificial
    ? EARTH_GRAVITY_MS2 * 0.9
    : surfaceGravityFromMu(mu, radiusKm);
  const retrograde = symbolUnit(planet.name, 13) < 0.08 ? -1 : 1;
  const rotationPeriodSec =
    seed.rotationHours * 3600 * (0.6 + 0.8 * symbolUnit(planet.name, 14)) * retrograde;

  return {
    radiusKm,
    massKg,
    mu,
    densityKgM3: density,
    rotationPeriodSec,
    surfaceGravityMs2,
    escapeVelocityKmS: Math.sqrt((2 * mu) / radiusKm),
    artificial,
  };
}

// ─── Laws ────────────────────────────────────────────────────────────────────

/** g = μ / R², converted from km/s² to m/s². */
export function surfaceGravityFromMu(mu: number, radiusKm: number): number {
  return radiusKm > 0 ? (mu / (radiusKm * radiusKm)) * 1000 : 0;
}

/** Kepler mean motion n = √(μ / a³) in rad/s (physical, unscaled). */
export function meanMotion(mu: number, semiMajorKm: number): number {
  return semiMajorKm > 0 ? Math.sqrt(mu / (semiMajorKm * semiMajorKm * semiMajorKm)) : 0;
}

/** Orbital period T = 2π √(a³ / μ) in seconds (physical, unscaled). */
export function orbitalPeriodSec(mu: number, semiMajorKm: number): number {
  const n = meanMotion(mu, semiMajorKm);
  return n > 0 ? (2 * Math.PI) / n : Infinity;
}

/**
 * Mean motion in universe time (rad per universe second) clamped so no orbit
 * completes faster than MIN_DISPLAY_PERIOD_SEC of real time.
 */
export function displayMeanMotion(mu: number, semiMajorKm: number): number {
  const n = meanMotion(mu, semiMajorKm);
  const maxN = (2 * Math.PI) / (MIN_DISPLAY_PERIOD_SEC * UNIVERSE_TIME_SCALE);
  return Math.min(n, maxN);
}

/** Circular orbital speed v = √(μ / r) in km/s. */
export function circularSpeedKmS(mu: number, radiusKm: number): number {
  return radiusKm > 0 ? Math.sqrt(mu / radiusKm) : 0;
}

/** Vis-viva: speed (km/s) at distance r on an orbit of semi-major axis a. */
export function visVivaSpeedKmS(mu: number, rKm: number, aKm: number): number {
  return Math.sqrt(Math.max(0, mu * (2 / rKm - 1 / aKm)));
}

/** Hill-sphere radius (km): region where the body dominates its parent's gravity. */
export function hillRadiusKm(
  semiMajorKm: number,
  eccentricity: number,
  mu: number,
  parentMu: number,
): number {
  return semiMajorKm * (1 - eccentricity) * Math.cbrt(mu / (3 * parentMu));
}

/** Roche limit (km) for a fluid satellite of density ρs around a primary (R, ρp). */
export function rocheLimitKm(
  primaryRadiusKm: number,
  primaryDensity: number,
  satelliteDensity: number,
): number {
  return 2.44 * primaryRadiusKm * Math.cbrt(primaryDensity / satelliteDensity);
}

/** Stellar flux at distance d relative to Earth's solar constant (1 = 1361 W/m²). */
export function relativeFlux(luminositySolar: number, distanceKm: number): number {
  const dAu = distanceKm / AU_KM;
  return dAu > 0 ? luminositySolar / (dAu * dAu) : Infinity;
}

/**
 * Radiative equilibrium temperature (K) for a body with Bond albedo A:
 * T = 278.6 K · (L / d²)^¼ · (1 − A)^¼.
 */
export function equilibriumTemperatureK(
  luminositySolar: number,
  distanceKm: number,
  albedo = 0.3,
): number {
  const flux = relativeFlux(luminositySolar, distanceKm);
  return 278.6 * Math.pow(flux * (1 - albedo), 0.25);
}

// ─── API ↔ physics ↔ render mapping ──────────────────────────────────────────

/** Heliocentric distance (km) from an API coordinate offset. */
export function apiDistanceToKm(apiUnits: number): number {
  return apiUnits * API_UNIT_KM;
}

/**
 * Render mapping. A single real scale cannot show a 6 000 km planet and a
 * 5 AU orbit together, so the universe uses two universal, monotonic maps:
 * - positions: linear, km / SYSTEM_KM_PER_RENDER_UNIT (distance ratios preserved);
 * - sizes: power law r = BODY_RENDER_REF · (R / BODY_REF_KM)^BODY_SIZE_EXPONENT
 *   (ordering preserved, compressed so stars and asteroids fit the same scene).
 * Satellite orbits are expressed in parent radii so moons never sit inside the
 * (enlarged) rendered parent.
 */
export const SYSTEM_KM_PER_RENDER_UNIT = 5e5;
export const BODY_REF_KM = 6_000;
export const BODY_RENDER_REF = 5;
export const BODY_SIZE_EXPONENT = 0.5;
/** Smallest rendered body radius (render units) so tiny bodies stay visible. */
export const MIN_BODY_RENDER_RADIUS = 0.35;

export function renderSystemDistance(km: number): number {
  return km / SYSTEM_KM_PER_RENDER_UNIT;
}

export function renderBodyRadius(radiusKm: number): number {
  const r = BODY_RENDER_REF * Math.pow(Math.max(0, radiusKm) / BODY_REF_KM, BODY_SIZE_EXPONENT);
  return Math.max(MIN_BODY_RENDER_RADIUS, r);
}

/**
 * Render distance of a satellite from its parent's centre: the physical ratio
 * a / R_parent is compressed with the same exponent as body sizes, then scaled
 * by the parent's rendered radius, plus the child's rendered radius as clearance.
 */
export function renderSatelliteDistance(
  semiMajorKm: number,
  parentRadiusKm: number,
  parentRenderRadius: number,
  childRenderRadius: number,
): number {
  const ratio = Math.max(1, semiMajorKm / Math.max(1e-6, parentRadiusKm));
  return parentRenderRadius * Math.pow(ratio, BODY_SIZE_EXPONENT) + childRenderRadius * 1.5;
}
