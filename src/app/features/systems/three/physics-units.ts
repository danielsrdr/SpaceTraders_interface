/**
 * Single source of truth for simulation and rendering unit conventions.
 *
 * Simulation layer: distances in km, masses normalized via μ = G·M.
 * Render layer: Three.js world units derived from km via RENDER_KM_PER_UNIT.
 */

/** One simulation unit equals one kilometre. */
export const SIM_UNIT_KM = 1;

/** Space Traders API coordinate units → kilometres (parent-relative orbital geometry). */
export const API_KM_PER_UNIT = 10_000;

/** Kilometres represented by one Three.js world unit at local (near-body) scale. */
export const RENDER_KM_PER_UNIT = 1_200;

/** Default circular orbit altitude above a parent body's surface (km). */
export const ORBIT_ALTITUDE_KM = 300;

/** Minimum gap between nested body surfaces when seeding orbits (km). */
export const ORBIT_CLEARANCE_KM = 500;

/** Normalized gravitational constant in sim units (km, s, M☉). */
export const G_SIM = 6.674e-2;

/**
 * Scales real Kepler mean motion into watchable animation speeds.
 * Prefer {@link orbitVisualTimeScale} — this flat factor is kept for legacy callers only.
 * @deprecated Use orbitVisualTimeScale(parentMu) for tiered heliocentric / planetary calibration.
 */
export const VISUAL_TIME_SCALE = 8_000;

/** Reference heliocentric orbit (km) calibrated to REF_HELIO_PERIOD_SEC. */
export const REF_HELIO_ORBIT_KM = 120_000;

/** Target revolution period at REF_HELIO_ORBIT_KM — slow but visibly orbiting the star. */
export const REF_HELIO_PERIOD_SEC = 150;

/** Reference orbit around a gas giant (km) and its target period (s). */
export const REF_GIANT_ORBIT_KM = 80_000;
export const REF_GIANT_PERIOD_SEC = 40;

/** Reference orbit around a rocky planet (km) and its target period (s). */
export const REF_PLANET_ORBIT_KM = 8_000;
export const REF_PLANET_PERIOD_SEC = 28;

/** Clamp displayed angular velocity (rad/s) — floor keeps outer sun-orbiters visibly drifting. */
export const MIN_ORBIT_OMEGA = 0.008;
export const MAX_ORBIT_OMEGA = 0.35;

/** Normalized μ threshold: parent at or above this is treated as the system star. */
export const STAR_MU_THRESHOLD = 0.5;

/** Minimum on-screen ship size in pixels (Kerbal / Elite style visibility floor). */
export const MIN_SCREEN_SHIP_PX = 8;

/** Maps surface gravity (m/s²) to FPS jump/walk feel. */
export const FPS_GRAVITY_SCALE = 2.2;

/** Standard Earth surface gravity for reference (m/s²). */
export const EARTH_GRAVITY_MS2 = 9.80665;

/**
 * When true, ship transits use ballistic paths from ShipDynamicsEngine.
 * When false, legacy quadratic Bézier arcs are used.
 */
export const USE_PHYSICS_DYNAMICS = true;

/** Softening length (km) to avoid gravity singularities at body centres. */
export const GRAVITY_SOFTENING_KM = 50;

/** Minimum semi-major axis for sun-orbiting bodies (km). */
export const MIN_ORBIT_RADIUS_KM = 4_800;

/** Ship hull length by registration role (metres). */
export const SHIP_LENGTH_M: Record<string, number> = {
  EXPLORER: 120,
  INTERCEPTOR: 80,
  FREIGHTER: 200,
  MINER: 150,
  REFINERY: 180,
  TRANSPORT: 160,
  SURVEYOR: 100,
  SATELLITE: 40,
};

export const DEFAULT_SHIP_LENGTH_M = 100;
