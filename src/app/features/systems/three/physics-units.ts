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
 * Real n (rad/s sim) × this factor → displayed angular velocity.
 */
export const VISUAL_TIME_SCALE = 8_000;

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
