import { Vector3 } from 'three';
import { PlanetView } from '../../../models/system.model';
import { resolveWaypointType } from '../planet-helpers';
import { getPlanetRadius3d, SystemLayout3d } from './system-scene.layout';

/**
 * Analytic two-body Keplerian orbit element set. Position is a pure function of
 * absolute simulation time, so motion is deterministic, reversible, and stable
 * (no integrator). Bodies accelerate near periapsis and slow near apoapsis.
 */
interface OrbitBody {
  symbol: string;
  parent: string | null;
  /** Semi-major axis (world units). */
  a: number;
  /** Eccentricity (0 = circle). */
  e: number;
  /** Inclination of the orbital plane (radians). */
  inc: number;
  /** Longitude of ascending node (radians). */
  raan: number;
  /** Argument of periapsis (radians). */
  argPeri: number;
  /** Mean anomaly at epoch (radians), derived from the API-relative angle. */
  M0: number;
  /** Mean motion (rad/s) — from Kepler's third law on the semi-major axis. */
  n: number;
  /** Apoapsis distance a*(1+e), cached for extent math. */
  apo: number;
  tickOrder: number;
}

/** Inner-orbit reference: ~30s per revolution at this radius. */
const BASE_OMEGA = (2 * Math.PI) / 30;
const REF_RADIUS = 80;
const MIN_RADIUS = 4;
const MIN_OMEGA = 0.02;
const MAX_OMEGA = 0.35;
/** Clearance kept between a child body's surface and its parent's surface. */
const ORBIT_CLEARANCE = 3.5;
/** Upper bound on seeded eccentricity so orbits stay visually sane. */
const MAX_ECCENTRICITY = 0.22;
/** Upper bound on seeded inclination (radians) so systems stay mostly planar. */
const MAX_INCLINATION = 0.3;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Deterministic pseudo-random fraction in [0, 1) from a hash and a salt. */
function seededUnit(hash: number, salt: number): number {
  const x = Math.sin(hash * 0.000123 + salt * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Newton iteration for the eccentric anomaly E from mean anomaly M. */
function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 5; i++) {
    E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}

function keplerMeanMotion(semiMajor: number, typeMultiplier = 1): number {
  const r = Math.max(MIN_RADIUS, semiMajor);
  const omega = BASE_OMEGA * Math.pow(REF_RADIUS / r, 1.5) * typeMultiplier;
  return Math.min(MAX_OMEGA, Math.max(MIN_OMEGA, omega));
}

function typeSpeedMultiplier(type: string): number {
  const resolved = resolveWaypointType(type);
  switch (resolved) {
    case 'GRAVITY_WELL':
    case 'ARTIFICIAL_GRAVITY_WELL':
    case 'ARTIFICAL_GRAVITY_WELL':
      return 1.15;
    case 'MOON':
      return 1.25;
    default:
      return 1;
  }
}

function resolveParentSymbol(
  planet: PlanetView,
  bySymbol: Map<string, PlanetView>,
): string | null {
  const parent = planet.orbits?.trim();
  if (!parent || parent === planet.name) return null;
  if (!bySymbol.has(parent)) return null;
  return parent;
}

function parentApiPosition(
  parentSymbol: string | null,
  bySymbol: Map<string, PlanetView>,
  layout: SystemLayout3d,
): { x: number; y: number } {
  if (!parentSymbol) {
    return { x: layout.centerX, y: layout.centerY };
  }
  const parent = bySymbol.get(parentSymbol);
  return parent ? parent.position : { x: layout.centerX, y: layout.centerY };
}

export class SystemOrbitEngine {
  private bodies = new Map<string, OrbitBody>();
  private tickOrder: string[] = [];
  private positions = new Map<string, Vector3>();
  private readonly scratch = new Vector3();
  /** Absolute simulation time (seconds), advanced by tick(delta). */
  private simTime = 0;
  /** Largest world-space reach of any body (apoapsis-based), cached at build. */
  private maxExtent = 120;

  build(planets: PlanetView[], layout: SystemLayout3d): void {
    this.bodies.clear();
    this.tickOrder = [];
    this.positions.clear();
    this.simTime = 0;

    if (!planets.length) {
      this.maxExtent = 120;
      return;
    }

    const bySymbol = new Map(planets.map((p) => [p.name, p]));

    for (const planet of planets) {
      const parent = resolveParentSymbol(planet, bySymbol);
      const parentPos = parentApiPosition(parent, bySymbol, layout);
      const dx = planet.position.x - parentPos.x;
      const dy = planet.position.y - parentPos.y;
      const apiDist = Math.hypot(dx, dy);
      const minOrbit = this.minOrbitRadius(planet, parent, bySymbol);
      const a = Math.max(minOrbit, apiDist * layout.scale);
      const M0 = apiDist > 0.001 ? Math.atan2(dy, dx) : hashString(planet.name) * 0.0001;
      const hash = hashString(planet.name);

      // Clamp eccentricity so periapsis a*(1-e) never dips inside the parent
      // clearance, regardless of the seeded value.
      const maxE = Math.max(0, Math.min(MAX_ECCENTRICITY, 1 - minOrbit / a));
      const e = seededUnit(hash, 1) * maxE;
      const inc = (seededUnit(hash, 2) - 0.5) * 2 * MAX_INCLINATION;
      const raan = seededUnit(hash, 3) * Math.PI * 2;
      const argPeri = seededUnit(hash, 4) * Math.PI * 2;

      this.bodies.set(planet.name, {
        symbol: planet.name,
        parent,
        a,
        e,
        inc,
        raan,
        argPeri,
        M0,
        n: keplerMeanMotion(a, typeSpeedMultiplier(planet.type)),
        apo: a * (1 + e),
        tickOrder: 0,
      });
    }

    this.assignTickOrder(bySymbol);
    this.computeMaxExtent(planets);
    this.recomputePositions();
  }

  /**
   * Smallest orbit radius that keeps a child body clear of its parent's surface.
   * Falls back to MIN_RADIUS for top-level bodies orbiting the sun.
   */
  private minOrbitRadius(
    planet: PlanetView,
    parent: string | null,
    bySymbol: Map<string, PlanetView>,
  ): number {
    if (!parent) return MIN_RADIUS;
    const parentBody = bySymbol.get(parent);
    if (!parentBody) return MIN_RADIUS;
    const parentRadius = getPlanetRadius3d(parentBody);
    const childRadius = getPlanetRadius3d(planet);
    return parentRadius + childRadius + ORBIT_CLEARANCE;
  }

  private assignTickOrder(bySymbol: Map<string, PlanetView>): void {
    const depthCache = new Map<string, number>();

    const depth = (symbol: string, visiting = new Set<string>()): number => {
      const cached = depthCache.get(symbol);
      if (cached !== undefined) return cached;
      if (visiting.has(symbol)) return 0;
      visiting.add(symbol);

      const body = this.bodies.get(symbol);
      if (!body?.parent || !bySymbol.has(body.parent)) {
        depthCache.set(symbol, 0);
        return 0;
      }

      const d = depth(body.parent, visiting) + 1;
      depthCache.set(symbol, d);
      return d;
    };

    const ordered = [...this.bodies.keys()].sort((a, b) => depth(a) - depth(b));
    ordered.forEach((symbol, index) => {
      const body = this.bodies.get(symbol);
      if (body) body.tickOrder = index;
    });
    this.tickOrder = ordered;
  }

  /**
   * Cumulative apoapsis reach down each parent chain. Orbital elements are
   * static, so the worst-case extent is fixed and can be cached at build time.
   */
  private computeMaxExtent(planets: PlanetView[]): void {
    const reach = new Map<string, number>();
    let extent = 120;

    for (const symbol of this.tickOrder) {
      const body = this.bodies.get(symbol);
      if (!body) continue;
      const parentReach = body.parent ? reach.get(body.parent) ?? 0 : 0;
      reach.set(symbol, parentReach + body.apo);
    }

    for (const planet of planets) {
      const r = reach.get(planet.name);
      if (r === undefined) continue;
      extent = Math.max(extent, r + getPlanetRadius3d(planet) + 40);
    }

    this.maxExtent = extent;
  }

  tick(delta: number): void {
    if (!this.bodies.size) return;
    this.simTime += delta;
    this.recomputePositions();
  }

  /** Position of a body relative to its parent (focus at origin) at a given mean anomaly. */
  private orbitalPoint(body: OrbitBody, meanAnomaly: number, target: Vector3): Vector3 {
    const E = solveKepler(meanAnomaly, body.e);
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);

    // Perifocal coordinates (periapsis along +x of the orbital plane).
    const px = body.a * (cosE - body.e);
    const py = body.a * Math.sqrt(1 - body.e * body.e) * sinE;

    // Rotate by argument of periapsis within the orbital plane.
    const cosW = Math.cos(body.argPeri);
    const sinW = Math.sin(body.argPeri);
    const x1 = px * cosW - py * sinW;
    const y1 = px * sinW + py * cosW;

    // Tilt by inclination about the line of nodes (x-axis).
    const cosI = Math.cos(body.inc);
    const sinI = Math.sin(body.inc);
    const x2 = x1;
    const y2 = y1 * cosI;
    const z2 = y1 * sinI;

    // Rotate by the longitude of the ascending node about the vertical axis.
    const cosO = Math.cos(body.raan);
    const sinO = Math.sin(body.raan);
    const planarX = x2 * cosO - y2 * sinO;
    const planarY = x2 * sinO + y2 * cosO;

    // Map math frame -> scene frame: horizontal plane is scene X/Z, Y is up.
    return target.set(planarX, z2, planarY);
  }

  private recomputePositions(): void {
    this.positions.clear();

    for (const symbol of this.tickOrder) {
      const body = this.bodies.get(symbol);
      if (!body) continue;

      const M = body.M0 + body.n * this.simTime;
      this.orbitalPoint(body, M, this.scratch);

      if (!body.parent) {
        this.positions.set(symbol, this.scratch.clone());
        continue;
      }

      const parentPos = this.positions.get(body.parent);
      if (!parentPos) {
        this.positions.set(symbol, this.scratch.clone());
        continue;
      }

      this.scratch.add(parentPos);
      this.positions.set(symbol, this.scratch.clone());
    }
  }

  getWorldPosition(symbol: string, target = new Vector3()): Vector3 {
    const pos = this.positions.get(symbol);
    if (pos) return target.copy(pos);
    return target.set(0, 0, 0);
  }

  getAllPositions(): ReadonlyMap<string, Vector3> {
    return this.positions;
  }

  /**
   * Full ellipse sampled in parent-relative scene coordinates, for drawing the
   * body's ephemeris trail. Re-center on the parent's current world position.
   */
  getOrbitPath(symbol: string, segments = 128): Vector3[] {
    const body = this.bodies.get(symbol);
    if (!body) return [];
    const path: Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const M = (i / segments) * Math.PI * 2;
      path.push(this.orbitalPoint(body, M, new Vector3()));
    }
    return path;
  }

  /** Symbol of a body's orbital parent (null for sun-orbiting bodies). */
  getParentSymbol(symbol: string): string | null {
    return this.bodies.get(symbol)?.parent ?? null;
  }

  /** Scene extent including body radii — used for camera far plane and god view. */
  sceneExtent(_planets?: PlanetView[]): number {
    return this.maxExtent;
  }
}
