import { Object3D, Quaternion, Vector3 } from 'three';
import { ShipData } from '../../../models/ship.model';
import { shipInTransit } from '../planet-helpers';
import { ORBIT_ALTITUDE_KM } from './physics-units';
import { shipOrbitRenderDistance } from './render-transform';
import {
  computeTransitDeviation,
  facingQuaternion,
  transitPoint,
  transitProfile,
  transitProfileRate,
  transitTangent,
} from './transit-arc.math';
import {
  UNIVERSE_TIME_SCALE,
  displayMeanMotion,
  symbolUnit,
  universeTimeSec,
} from './universe-physics';

export interface ShipPose {
  position: Vector3;
  /** Render units per universe second (per unit of progress when route times are unknown). */
  velocity: Vector3;
  quaternion: Quaternion;
}

/** Body a ship departs from / arrives at; when given, legs start/end on its parking orbit. */
export interface ParkingBody {
  simRadiusKm: number;
  mu: number;
}

export interface TransitSampleOptions {
  /** Star render radius (clearance kept around the world origin). 0/absent = no avoidance. */
  starRadius?: number;
  originBody?: ParkingBody;
  destBody?: ParkingBody;
}

interface TransitPath {
  points: Vector3[];
  totalLength: number;
  flightMode: string;
  /** Cached endpoint snapshots — invalidated when orbital positions drift. */
  origin: Vector3;
  dest: Vector3;
  starRadius: number;
  /** Parking-orbit offsets from the body centres at departure / arrival. */
  originOffset: Vector3;
  destOffset: Vector3;
  /** Full-amplitude lateral deviation (see transit-arc.math). */
  dev: Vector3;
}

interface OrbitSlot {
  waypointSymbol: string;
  orbitIndex: number;
  orbitTotal: number;
  phaseOffset: number;
}

const SEGMENTS = 48;
/** Rebuild transit geometry when an endpoint moves more than this (world units). */
const TRANSIT_ENDPOINT_EPS = 0.1;
/** Parking-orbit inclination cap (rad): 25°. */
const MAX_INCLINATION = (25 * Math.PI) / 180;
const scratchO = new Vector3();
const scratchD = new Vector3();
const scratchT = new Vector3();
const scratchV = new Vector3();
const scratchOffA = new Vector3();
const scratchOffB = new Vector3();

function endpointsMatch(a: Vector3, b: Vector3, eps: number): boolean {
  return a.distanceToSquared(b) <= eps * eps;
}

function transitPathStillValid(
  path: TransitPath,
  flightMode: string,
  originPos: Vector3,
  destPos: Vector3,
  starRadius: number,
): boolean {
  return (
    path.flightMode === flightMode &&
    path.starRadius === starRadius &&
    endpointsMatch(path.origin, originPos, TRANSIT_ENDPOINT_EPS) &&
    endpointsMatch(path.dest, destPos, TRANSIT_ENDPOINT_EPS)
  );
}

function buildArcLength(points: Vector3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += points[i]!.distanceTo(points[i - 1]!);
  return total;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Route duration in universe seconds, or null when the API times are missing/invalid. */
function routeDurationUniverseSec(ship: ShipData): number | null {
  const route = ship.nav.route;
  if (!route) return null;
  const dep = Date.parse(route.departureTime);
  const arr = Date.parse(route.arrival);
  if (!Number.isFinite(dep) || !Number.isFinite(arr) || arr <= dep) return null;
  return ((arr - dep) / 1000) * UNIVERSE_TIME_SCALE;
}

function routeTimeUniverseSec(iso: string | undefined): number {
  const ms = iso ? Date.parse(iso) : NaN;
  return universeTimeSec(Number.isFinite(ms) ? ms : Date.now());
}

/**
 * Circular parking-orbit state relative to the body centre. The orbit lies on a
 * ship-specific plane (inclination ≤ 25°, RAAN from the symbol hash), has constant
 * radius and the displayed mean motion, and is traversed prograde.
 * Velocity is in render units per universe second.
 */
export function parkingOrbitState(
  shipSymbol: string,
  simRadiusKm: number,
  parentMu: number,
  simTime: number,
  orbitIndex: number,
  orbitTotal: number,
  offsetOut: Vector3,
  velocityOut?: Vector3,
): Vector3 {
  const r = shipOrbitRenderDistance(simRadiusKm);
  const omega = displayMeanMotion(parentMu, simRadiusKm + ORBIT_ALTITUDE_KM);
  const inc = symbolUnit(shipSymbol, 1) * MAX_INCLINATION;
  const raan = symbolUnit(shipSymbol, 2) * Math.PI * 2;
  const spacing = orbitTotal > 1 ? (orbitIndex / orbitTotal) * Math.PI * 2 : 0;
  const phase = spacing + symbolUnit(shipSymbol, 3) * Math.PI * 2 * 0.1 + omega * simTime;

  const sinI = Math.sin(inc);
  const cosI = Math.cos(inc);
  const sinO = Math.sin(raan);
  const cosO = Math.cos(raan);
  // In-plane unit vector (x, z) → tilt about X by inclination → rotate about Y by RAAN.
  const place = (px: number, pz: number, out: Vector3): Vector3 => {
    const y = -pz * sinI;
    const z = pz * cosI;
    return out.set(px * cosO + z * sinO, y, -px * sinO + z * cosO);
  };
  place(Math.cos(phase) * r, Math.sin(phase) * r, offsetOut);
  if (velocityOut) {
    place(-Math.sin(phase) * r * omega, Math.cos(phase) * r * omega, velocityOut);
  }
  return offsetOut;
}

/**
 * Newtonian-flavoured ship motion: transits follow a flight-mode velocity profile
 * (API-time authoritative) along a planar path that blends the endpoint frames and
 * bends around the star; IN_ORBIT ships fly circular, inclined parking orbits.
 */
export class ShipDynamicsEngine {
  private transitPaths = new Map<string, TransitPath>();
  private orbitSlots = new Map<string, OrbitSlot>();
  private readonly posePosition = new Vector3();
  private readonly poseVelocity = new Vector3();
  private readonly poseQuat = new Quaternion();

  /** Cache key for transit path rebuilds. */
  transitKey(ship: ShipData): string {
    const route = ship.nav.route;
    if (!route) return ship.symbol;
    return `${ship.symbol}|${route.origin.symbol}>${route.destination.symbol}|${ship.nav.flightMode}|${route.departureTime}|${route.arrival}`;
  }

  /** Precompute or refresh a transit path between two world positions. */
  ensureTransitPath(
    ship: ShipData,
    originPos: Vector3,
    destPos: Vector3,
    opts?: TransitSampleOptions,
  ): TransitPath {
    const key = this.transitKey(ship);
    const flightMode = ship.nav.flightMode ?? 'CRUISE';
    const starRadius = opts?.starRadius ?? 0;
    const existing = this.transitPaths.get(key);
    if (existing && transitPathStillValid(existing, flightMode, originPos, destPos, starRadius)) {
      return existing;
    }

    const path: TransitPath = existing ?? {
      points: [],
      totalLength: 0,
      flightMode,
      origin: new Vector3(),
      dest: new Vector3(),
      starRadius,
      originOffset: new Vector3(),
      destOffset: new Vector3(),
      dev: new Vector3(),
    };
    if (!existing) this.transitPaths.set(key, path);

    const route = ship.nav.route;
    path.originOffset.set(0, 0, 0);
    path.destOffset.set(0, 0, 0);
    if (opts?.originBody) {
      parkingOrbitState(
        ship.symbol,
        opts.originBody.simRadiusKm,
        opts.originBody.mu,
        routeTimeUniverseSec(route?.departureTime),
        0,
        1,
        path.originOffset,
      );
    }
    if (opts?.destBody) {
      parkingOrbitState(
        ship.symbol,
        opts.destBody.simRadiusKm,
        opts.destBody.mu,
        routeTimeUniverseSec(route?.arrival),
        0,
        1,
        path.destOffset,
      );
    }

    const o = scratchO.copy(originPos).add(path.originOffset);
    const d = scratchD.copy(destPos).add(path.destOffset);
    computeTransitDeviation(o, d, starRadius, path.dev);

    while (path.points.length < SEGMENTS + 1) path.points.push(new Vector3());
    path.points.length = SEGMENTS + 1;
    for (let i = 0; i <= SEGMENTS; i++) {
      transitPoint(o, d, path.dev, i / SEGMENTS, path.points[i]!);
    }
    path.totalLength = buildArcLength(path.points);
    path.flightMode = flightMode;
    path.starRadius = starRadius;
    path.origin.copy(originPos);
    path.dest.copy(destPos);
    return path;
  }

  /** Sample transit pose at API progress t ∈ [0, 1]. */
  sampleTransit(
    ship: ShipData,
    originPos: Vector3,
    destPos: Vector3,
    t: number,
    targetObj?: Object3D,
    opts?: TransitSampleOptions,
  ): ShipPose {
    const path = this.ensureTransitPath(ship, originPos, destPos, opts);
    const u = clamp01(t);
    const s = transitProfile(path.flightMode, u);
    // Endpoints follow the live frames exactly; only the lateral deviation is cached.
    const o = scratchO.copy(originPos).add(path.originOffset);
    const d = scratchD.copy(destPos).add(path.destOffset);

    transitPoint(o, d, path.dev, s, this.posePosition);
    transitTangent(o, d, path.dev, s, scratchT);
    facingQuaternion(scratchT, this.poseQuat);
    if (targetObj) targetObj.quaternion.copy(this.poseQuat);

    // v = dp/ds · ds/dt; ds/dt in universe seconds when the route times are known.
    const duration = routeDurationUniverseSec(ship);
    const rate = transitProfileRate(path.flightMode, u) / (duration ?? 1);
    this.poseVelocity.copy(scratchT).multiplyScalar(rate);

    return {
      position: this.posePosition.clone(),
      velocity: this.poseVelocity.clone(),
      quaternion: this.poseQuat.clone(),
    };
  }

  /** Register a ship's slot in a circular orbit around a waypoint. */
  registerOrbitSlot(
    shipSymbol: string,
    waypointSymbol: string,
    orbitIndex: number,
    orbitTotal: number,
  ): void {
    const phaseOffset = orbitTotal > 1 ? (orbitIndex / orbitTotal) * Math.PI * 2 : 0;
    this.orbitSlots.set(shipSymbol, {
      waypointSymbol,
      orbitIndex,
      orbitTotal,
      phaseOffset,
    });
  }

  clearOrbitSlot(shipSymbol: string): void {
    this.orbitSlots.delete(shipSymbol);
  }

  /**
   * Analytic circular parking-orbit position for IN_ORBIT ships. `simTime` is
   * universe seconds. Optionally writes the velocity (render units / universe s).
   */
  sampleOrbit(
    shipSymbol: string,
    parentPos: Vector3,
    simRadiusKm: number,
    parentMu: number,
    simTime: number,
    orbitIndex: number,
    orbitTotal: number,
    target = new Vector3(),
    velocityOut?: Vector3,
  ): Vector3 {
    parkingOrbitState(
      shipSymbol,
      simRadiusKm,
      parentMu,
      simTime,
      orbitIndex,
      orbitTotal,
      target,
      velocityOut,
    );
    return target.add(parentPos);
  }

  /** Resolve ship pose based on nav status. */
  resolvePose(
    ship: ShipData,
    originPos: Vector3 | null,
    destPos: Vector3 | null,
    parentPos: Vector3,
    simRadiusKm: number,
    parentMu: number,
    simTime: number,
    transitProgress: number,
    orbitIndex: number,
    orbitTotal: number,
    targetObj?: Object3D,
    opts?: TransitSampleOptions,
  ): ShipPose {
    if (shipInTransit(ship) && originPos && destPos) {
      return this.sampleTransit(ship, originPos, destPos, transitProgress, targetObj, opts);
    }

    if (ship.nav.status === 'IN_ORBIT') {
      const pos = this.sampleOrbit(
        ship.symbol,
        parentPos,
        simRadiusKm,
        parentMu,
        simTime,
        orbitIndex,
        orbitTotal,
        new Vector3(),
        scratchV,
      );
      facingQuaternion(scratchV, this.poseQuat);
      if (targetObj) targetObj.quaternion.copy(this.poseQuat);
      return {
        position: pos,
        velocity: scratchV.clone(),
        quaternion: this.poseQuat.clone(),
      };
    }

    // DOCKED — stationary standoff in the ecliptic, nose toward the body.
    const orbitR = shipOrbitRenderDistance(simRadiusKm);
    const angle =
      (orbitTotal > 1 ? (orbitIndex / orbitTotal) * Math.PI * 2 : 0) +
      symbolUnit(ship.symbol, 3) * Math.PI * 2 * 0.1;
    const radial = scratchOffA.set(Math.cos(angle), 0, Math.sin(angle));
    this.posePosition.copy(parentPos).addScaledVector(radial, orbitR);
    facingQuaternion(scratchOffB.copy(radial).negate(), this.poseQuat);
    if (targetObj) targetObj.quaternion.copy(this.poseQuat);
    return {
      position: this.posePosition.clone(),
      velocity: this.poseVelocity.set(0, 0, 0).clone(),
      quaternion: this.poseQuat.clone(),
    };
  }

  /** Points along the transit path (uniform in path progress) for arc drawing. */
  getTransitPathPoints(
    ship: ShipData,
    originPos: Vector3,
    destPos: Vector3,
    opts?: TransitSampleOptions,
  ): Vector3[] {
    return this.ensureTransitPath(ship, originPos, destPos, opts).points;
  }

  invalidateTransit(shipSymbol: string): void {
    for (const key of this.transitPaths.keys()) {
      if (key.startsWith(`${shipSymbol}|`)) this.transitPaths.delete(key);
    }
  }

  clear(): void {
    this.transitPaths.clear();
    this.orbitSlots.clear();
  }
}
