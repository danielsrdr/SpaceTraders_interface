import { Vector3 } from 'three';
import { PlanetView } from '../../../models/system.model';
import { getParentMu } from './celestial-mass';
import { getPlanetRadius3d, starRenderRadius, SystemLayout3d } from './system-scene.layout';
import {
  apiDistanceToKm,
  AU_KM,
  bodyPhysics,
  displayMeanMotion,
  renderSatelliteDistance,
  renderSystemDistance,
  starProfile,
  symbolUnit,
  SYSTEM_KM_PER_RENDER_UNIT,
  UNIVERSE_TIME_SCALE,
  universeTimeSec,
} from './universe-physics';

/**
 * Analytic two-body Keplerian orbit element set. Position is a pure function of
 * absolute universe time (see `universeTimeSec`), so motion is deterministic,
 * reversible, identical for every viewer, and needs no integrator. Mean motion
 * comes from the real μ of the parent (star or planet) and the physical
 * semi-major axis; only the render-space radius is compressed.
 */
interface OrbitBody {
  symbol: string;
  parent: string | null;
  /** Semi-major axis (world units). */
  a: number;
  /** Physical semi-major axis (km) — drives Kepler mean motion. */
  aKm: number;
  /** Eccentricity (0 = circle). */
  e: number;
  /** Inclination of the orbital plane (radians). */
  inc: number;
  /** Longitude of ascending node (radians). */
  raan: number;
  /** Argument of periapsis (radians). */
  argPeri: number;
  /** Mean anomaly at the universe epoch (radians), from the API-relative angle. */
  M0: number;
  /** Mean motion (rad per universe second), Kepler's third law on the parent's real μ. */
  n: number;
  /** Own rotation rate (rad per universe second); equals `n` when tidally locked. */
  spinRate: number;
  tidallyLocked: boolean;
  /** Apoapsis distance a*(1+e), cached for extent math. */
  apo: number;
  tickOrder: number;
}

export interface OrbitBuildOptions {
  /** API system `type`: selects the star (μ, radius). Unknown → orange dwarf. */
  systemType?: string | null;
  /** Initial universe time (s). Defaults to the shared live clock. */
  timeSec?: number;
}

/** Clearance kept between a child body's surface and its parent's surface (render units). */
const ORBIT_CLEARANCE = 3.5;
/** Upper bound on seeded eccentricity so orbits stay visually sane. */
const MAX_ECCENTRICITY = 0.22;
/** Moons are nearly circular. */
const MAX_SATELLITE_ECCENTRICITY = 0.06;
/** Upper bound on seeded inclination (radians) so systems stay mostly planar. */
const MAX_INCLINATION = 0.3;
/** Shortest displayed rotation period (real seconds) so fast spinners do not strobe. */
const MIN_ROTATION_DISPLAY_SEC = 4;
/** Sun-orbiters closer than this are tidally locked to the star (km). */
const STAR_LOCK_DISTANCE_KM = 0.1 * AU_KM;
/** Satellite semi-major axis spans [2.5, 32.5] parent radii (seeded). */
const SATELLITE_MIN_RADII = 2.5;
const SATELLITE_SPAN_RADII = 30;

/** Newton iteration for the eccentric anomaly E from mean anomaly M. */
function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 6; i++) {
    E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}

/** Mean anomaly for a true anomaly ν on an ellipse of eccentricity e. */
function meanAnomalyFromTrue(nu: number, e: number): number {
  const E =
    2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
  return E - e * Math.sin(E);
}

function resolveParentSymbol(planet: PlanetView, bySymbol: Map<string, PlanetView>): string | null {
  const parent = planet.orbits?.trim();
  if (!parent || parent === planet.name) return null;
  if (!bySymbol.has(parent)) return null;
  return parent;
}

function wrapAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  return angle - twoPi * Math.floor(angle / twoPi);
}

export class SystemOrbitEngine {
  private bodies = new Map<string, OrbitBody>();
  private tickOrder: string[] = [];
  private positions = new Map<string, Vector3>();
  private readonly scratch = new Vector3();
  /** Absolute universe time (s): `universeTimeSec()` plus the cumulative UI warp. */
  private simTime = 0;
  /** Largest world-space reach of any body (apoapsis-based), cached at build. */
  private maxExtent = 120;

  build(planets: PlanetView[], _layout?: SystemLayout3d, options: OrbitBuildOptions = {}): void {
    this.bodies.clear();
    this.tickOrder = [];
    this.positions.clear();
    this.simTime = options.timeSec ?? universeTimeSec();

    if (!planets.length) {
      this.maxExtent = 120;
      return;
    }

    const bySymbol = new Map(planets.map((p) => [p.name, p]));
    const star = starProfile(options.systemType);
    const starRadiusRender = starRenderRadius(options.systemType, planets);

    for (const planet of planets) {
      const parent = resolveParentSymbol(planet, bySymbol);
      const parentBody = parent ? (bySymbol.get(parent) ?? null) : null;
      const physics = bodyPhysics(planet);
      const childRender = getPlanetRadius3d(planet);

      // The star is the API origin; satellites are measured from their parent.
      const originX = parentBody?.position.x ?? 0;
      const originY = parentBody?.position.y ?? 0;
      const dx = planet.position.x - originX;
      const dy = planet.position.y - originY;
      const apiDist = Math.hypot(dx, dy);
      const theta = apiDist > 0.001 ? Math.atan2(dy, dx) : symbolUnit(planet.name, 5) * Math.PI * 2;

      let rKm: number;
      let rRender: number;
      let minRender: number;
      let maxE = MAX_ECCENTRICITY;
      if (parentBody) {
        const parentPhys = bodyPhysics(parentBody);
        const parentRender = getPlanetRadius3d(parentBody);
        const u = symbolUnit(planet.name, 6);
        rKm =
          parentPhys.radiusKm * (SATELLITE_MIN_RADII + SATELLITE_SPAN_RADII * u * u) +
          physics.radiusKm;
        minRender = parentRender + childRender + ORBIT_CLEARANCE;
        rRender = Math.max(
          minRender,
          renderSatelliteDistance(rKm, parentPhys.radiusKm, parentRender, childRender),
        );
        maxE = MAX_SATELLITE_ECCENTRICITY;
      } else {
        // Periapsis ≥ 0.64 r for e ≤ 0.22, so this keeps the body clear of the star.
        minRender = (starRadiusRender * 1.5 + childRender + ORBIT_CLEARANCE) / 0.6;
        rRender = Math.max(minRender, renderSystemDistance(apiDistanceToKm(apiDist)));
        rKm = apiDistanceToKm(apiDist);
        // The physical axis follows the (possibly clamped) rendered one.
        rKm = Math.max(rKm, rRender * SYSTEM_KM_PER_RENDER_UNIT);
      }

      const e =
        symbolUnit(planet.name, 1) * Math.max(0, Math.min(maxE, 1 - (1.1 * minRender) / rRender));
      const inc = (symbolUnit(planet.name, 2) - 0.5) * 2 * MAX_INCLINATION;
      const argPeri = symbolUnit(planet.name, 4) * Math.PI * 2;
      // In-plane angle whose inclined projection lands on the API angle.
      const phi = Math.atan2(Math.sin(theta) / Math.cos(inc), Math.cos(theta));
      const nu0 = phi - argPeri;
      // Choose a so the distance at the epoch equals the API distance.
      const radialFactor = (1 + e * Math.cos(nu0)) / (1 - e * e);
      const a = rRender * radialFactor;
      const aKm = rKm * radialFactor;

      const parentMu = parentBody ? getParentMu(planet, bySymbol, star.mu) : star.mu;
      const n = displayMeanMotion(parentMu, aKm);

      const tidallyLocked = parentBody
        ? !physics.artificial
        : !physics.artificial && aKm < STAR_LOCK_DISTANCE_KM;
      const maxSpin = (2 * Math.PI) / (MIN_ROTATION_DISPLAY_SEC * UNIVERSE_TIME_SCALE);
      const ownSpin =
        physics.rotationPeriodSec !== 0 ? (2 * Math.PI) / physics.rotationPeriodSec : 0;
      const spinRate = tidallyLocked
        ? n
        : Math.sign(ownSpin) * Math.min(Math.abs(ownSpin), maxSpin);

      this.bodies.set(planet.name, {
        symbol: planet.name,
        parent,
        a,
        aKm,
        e,
        inc,
        raan: 0,
        argPeri,
        M0: meanAnomalyFromTrue(nu0, e),
        n,
        spinRate,
        tidallyLocked,
        apo: a * (1 + e),
        tickOrder: 0,
      });
    }

    this.assignTickOrder(bySymbol);
    this.computeMaxExtent(planets, starRadiusRender);
    this.recomputePositions();
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

  private computeMaxExtent(planets: PlanetView[], starRadiusRender: number): void {
    const reach = new Map<string, number>();
    let extent = Math.max(120, starRadiusRender + 40);

    for (const symbol of this.tickOrder) {
      const body = this.bodies.get(symbol);
      if (!body) continue;
      const parentReach = body.parent ? (reach.get(body.parent) ?? 0) : 0;
      reach.set(symbol, parentReach + body.apo);
    }

    for (const planet of planets) {
      const r = reach.get(planet.name);
      if (r === undefined) continue;
      extent = Math.max(extent, r + getPlanetRadius3d(planet) + 40);
    }

    this.maxExtent = extent;
  }

  /**
   * Advance by `delta` real seconds (already multiplied by the UI warp factor):
   * the warp accumulates as an offset on the shared universe clock.
   */
  tick(delta: number): void {
    if (!this.bodies.size) return;
    this.simTime += delta * UNIVERSE_TIME_SCALE;
    this.recomputePositions();
  }

  /** Jump to an absolute universe time (s), e.g. `universeTimeSec(ms)` for replays. */
  seekTo(absoluteSeconds: number): void {
    this.simTime = absoluteSeconds;
    if (this.bodies.size) this.recomputePositions();
  }

  /** Current universe time (s). */
  get currentTime(): number {
    return this.simTime;
  }

  /** Own-rotation angle (rad, [0, 2π)) of a body at the current universe time. */
  getSpinAngle(symbol: string): number {
    const body = this.bodies.get(symbol);
    return body ? wrapAngle(body.spinRate * this.simTime) : 0;
  }

  /** Own-rotation rate in rad per real second at 1× warp. */
  getSpinRatePerSec(symbol: string): number {
    const body = this.bodies.get(symbol);
    return body ? body.spinRate * UNIVERSE_TIME_SCALE : 0;
  }

  isTidallyLocked(symbol: string): boolean {
    return this.bodies.get(symbol)?.tidallyLocked ?? false;
  }

  /** Orbital period (universe seconds) of a body around its parent. */
  getOrbitalPeriodSec(symbol: string): number {
    const body = this.bodies.get(symbol);
    return body && body.n > 0 ? (2 * Math.PI) / body.n : Infinity;
  }

  private orbitalPoint(body: OrbitBody, meanAnomaly: number, target: Vector3): Vector3 {
    const E = solveKepler(meanAnomaly, body.e);
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);

    const px = body.a * (cosE - body.e);
    const py = body.a * Math.sqrt(1 - body.e * body.e) * sinE;

    const cosW = Math.cos(body.argPeri);
    const sinW = Math.sin(body.argPeri);
    const x1 = px * cosW - py * sinW;
    const y1 = px * sinW + py * cosW;

    const cosI = Math.cos(body.inc);
    const sinI = Math.sin(body.inc);
    const x2 = x1;
    const y2 = y1 * cosI;
    const z2 = y1 * sinI;

    const cosO = Math.cos(body.raan);
    const sinO = Math.sin(body.raan);
    const planarX = x2 * cosO - y2 * sinO;
    const planarY = x2 * sinO + y2 * cosO;

    return target.set(planarX, z2, planarY);
  }

  private recomputePositions(): void {
    this.positions.clear();

    for (const symbol of this.tickOrder) {
      const body = this.bodies.get(symbol);
      if (!body) continue;

      const M = wrapAngle(body.M0 + body.n * this.simTime);
      this.orbitalPoint(body, M, this.scratch);

      const parentPos = body.parent ? this.positions.get(body.parent) : undefined;
      if (parentPos) this.scratch.add(parentPos);
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

  getParentSymbol(symbol: string): string | null {
    return this.bodies.get(symbol)?.parent ?? null;
  }

  sceneExtent(_planets?: PlanetView[]): number {
    return this.maxExtent;
  }
}
