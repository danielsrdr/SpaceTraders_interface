import { Object3D, Quaternion, Vector3 } from 'three';
import { ShipData, ShipNavFlightMode } from '../../../models/ship.model';
import { shipInTransit } from '../planet-helpers';
import { getMuForBody } from './celestial-mass';
import { circularOrbitSpeedKmS } from './gravity-field';
import {
  ORBIT_ALTITUDE_KM,
  USE_PHYSICS_DYNAMICS,
  VISUAL_TIME_SCALE,
} from './physics-units';
import { renderRadius, shipOrbitRenderDistance, shipOrbitVerticalOffset } from './render-transform';
import { orientAlongArc, sampleTransitArc } from './transit-arc.math';

export interface ShipPose {
  position: Vector3;
  velocity: Vector3;
  quaternion: Quaternion;
}

interface TransitPath {
  points: Vector3[];
  cumulative: number[];
  totalLength: number;
  flightMode: string;
}

interface OrbitSlot {
  waypointSymbol: string;
  orbitIndex: number;
  orbitTotal: number;
  phaseOffset: number;
}

const SEGMENTS = 48;
const scratchA = new Vector3();
const scratchB = new Vector3();
const scratchC = new Vector3();

function flightModeLiftMultiplier(mode: string): number {
  switch (mode) {
    case 'DRIFT':
      return 1.35;
    case 'STEALTH':
      return 0.85;
    case 'BURN':
      return 0.45;
    case 'CRUISE':
    default:
      return 1.0;
  }
}

function ballisticMidpoint(
  v0: Vector3,
  v2: Vector3,
  flightMode: string,
  target: Vector3,
): Vector3 {
  const dist = v0.distanceTo(v2);
  const lift = Math.max(6, dist * 0.18) * flightModeLiftMultiplier(flightMode);
  return target.set((v0.x + v2.x) * 0.5, (v0.y + v2.y) * 0.5 + lift, (v0.z + v2.z) * 0.5);
}

function buildArcPoints(v0: Vector3, v2: Vector3, flightMode: string): Vector3[] {
  const mid = ballisticMidpoint(v0, v2, flightMode, scratchA);
  const points: Vector3[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const u = 1 - t;
    const x = u * u * v0.x + 2 * u * t * mid.x + t * t * v2.x;
    const y = u * u * v0.y + 2 * u * t * mid.y + t * t * v2.y;
    const z = u * u * v0.z + 2 * u * t * mid.z + t * t * v2.z;
    points.push(new Vector3(x, y, z));
  }
  return points;
}

function buildArcLengths(points: Vector3[]): { cumulative: number[]; totalLength: number } {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1]! + points[i]!.distanceTo(points[i - 1]!));
  }
  return { cumulative, totalLength: cumulative[cumulative.length - 1] ?? 0 };
}

function sampleAlongPath(
  points: Vector3[],
  cumulative: number[],
  totalLength: number,
  t: number,
  target: Vector3,
): Vector3 {
  if (points.length === 0) return target.set(0, 0, 0);
  if (points.length === 1 || totalLength <= 1e-6) return target.copy(points[0]!);
  const dist = Math.max(0, Math.min(1, t)) * totalLength;
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid]! <= dist) lo = mid;
    else hi = mid;
  }
  const segLen = cumulative[hi]! - cumulative[lo]!;
  const frac = segLen > 1e-6 ? (dist - cumulative[lo]!) / segLen : 0;
  return target.lerpVectors(points[lo]!, points[hi]!, frac);
}

function orientAlongPath(
  obj: Object3D,
  points: Vector3[],
  cumulative: number[],
  totalLength: number,
  t: number,
  scratch: Vector3,
): void {
  sampleAlongPath(points, cumulative, totalLength, t, scratch);
  const t2 = Math.min(1, t + 0.03);
  const ahead = sampleAlongPath(points, cumulative, totalLength, t2, scratchA);
  obj.lookAt(ahead);
  obj.rotateY(Math.PI);
}

/**
 * Newtonian ship motion: ballistic transits (API-time authoritative) and
 * analytic circular orbits for IN_ORBIT status.
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

  /** Precompute or refresh a ballistic transit path between two world positions. */
  ensureTransitPath(
    ship: ShipData,
    originPos: Vector3,
    destPos: Vector3,
  ): TransitPath {
    const key = this.transitKey(ship);
    const existing = this.transitPaths.get(key);
    if (existing) return existing;

    const points = buildArcPoints(originPos, destPos, ship.nav.flightMode ?? 'CRUISE');
    const { cumulative, totalLength } = buildArcLengths(points);
    const path: TransitPath = {
      points,
      cumulative,
      totalLength,
      flightMode: ship.nav.flightMode ?? 'CRUISE',
    };
    this.transitPaths.set(key, path);
    return path;
  }

  /** Sample transit pose at API progress t ∈ [0, 1]. */
  sampleTransit(
    ship: ShipData,
    originPos: Vector3,
    destPos: Vector3,
    t: number,
    targetObj?: Object3D,
  ): ShipPose {
    if (!USE_PHYSICS_DYNAMICS) {
      sampleTransitArc(originPos, destPos, t, this.posePosition);
      if (targetObj) orientAlongArc(targetObj, originPos, destPos, t, scratchA);
      return {
        position: this.posePosition.clone(),
        velocity: this.poseVelocity.set(0, 0, 0),
        quaternion: targetObj
          ? targetObj.quaternion.clone()
          : this.poseQuat.set(0, 0, 0, 1),
      };
    }

    const path = this.ensureTransitPath(ship, originPos, destPos);
    sampleAlongPath(path.points, path.cumulative, path.totalLength, t, this.posePosition);
    if (targetObj) {
      orientAlongPath(targetObj, path.points, path.cumulative, path.totalLength, t, scratchA);
    }
    const tAhead = Math.min(1, t + 0.02);
    sampleAlongPath(path.points, path.cumulative, path.totalLength, tAhead, scratchB);
    this.poseVelocity.subVectors(scratchB, this.posePosition).multiplyScalar(50);

    return {
      position: this.posePosition.clone(),
      velocity: this.poseVelocity.clone(),
      quaternion: targetObj
        ? targetObj.quaternion.clone()
        : this.poseQuat.set(0, 0, 0, 1),
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

  /** Analytic circular orbit pose for IN_ORBIT ships. */
  sampleOrbit(
    shipSymbol: string,
    parentPos: Vector3,
    simRadiusKm: number,
    parentMu: number,
    simTime: number,
    orbitIndex: number,
    orbitTotal: number,
    target = new Vector3(),
  ): Vector3 {
    const orbitRenderR = shipOrbitRenderDistance(renderRadius(simRadiusKm, 'local'), simRadiusKm);
    const orbitKm = simRadiusKm + ORBIT_ALTITUDE_KM;
    const omega =
      (circularOrbitSpeedKmS(parentMu, orbitKm) / orbitKm) * VISUAL_TIME_SCALE;
    const phase =
      (orbitTotal > 1 ? (orbitIndex / orbitTotal) * Math.PI * 2 : 0) + omega * simTime;
    const x = Math.cos(phase) * orbitRenderR;
    const z = Math.sin(phase) * orbitRenderR;
    const y = shipOrbitVerticalOffset(renderRadius(simRadiusKm, 'local'));
    return target.set(parentPos.x + x, parentPos.y + y, parentPos.z + z);
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
  ): ShipPose {
    if (shipInTransit(ship) && originPos && destPos) {
      return this.sampleTransit(ship, originPos, destPos, transitProgress, targetObj);
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
      );
      return {
        position: pos,
        velocity: this.poseVelocity.set(0, 0, 0),
        quaternion: this.poseQuat.set(0, 0, 0, 1),
      };
    }

    // DOCKED — stationary standoff
    const orbitR = shipOrbitRenderDistance(renderRadius(simRadiusKm, 'local'), simRadiusKm);
    const angle = orbitTotal > 1 ? (orbitIndex / orbitTotal) * Math.PI * 2 : 0;
    const y = shipOrbitVerticalOffset(renderRadius(simRadiusKm, 'local'));
    this.posePosition.set(
      parentPos.x + Math.cos(angle) * orbitR,
      parentPos.y + y,
      parentPos.z + Math.sin(angle) * orbitR,
    );
    if (targetObj) targetObj.rotation.set(0, Math.PI * 0.12, 0);
    return {
      position: this.posePosition.clone(),
      velocity: this.poseVelocity.set(0, 0, 0),
      quaternion: this.poseQuat.set(0, 0, 0, 1),
    };
  }

  /** Points along the transit path for arc drawing. */
  getTransitPathPoints(ship: ShipData, originPos: Vector3, destPos: Vector3): Vector3[] {
    return this.ensureTransitPath(ship, originPos, destPos).points;
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

/** Thrust direction magnitude hint per flight mode (visual only). */
export function thrustForMode(mode: ShipNavFlightMode | string): number {
  switch (mode) {
    case 'DRIFT':
      return 0;
    case 'STEALTH':
      return 0.3;
    case 'BURN':
      return 1.0;
    case 'CRUISE':
    default:
      return 0.6;
  }
}

