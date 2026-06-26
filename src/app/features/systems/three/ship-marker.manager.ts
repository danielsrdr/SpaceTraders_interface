import {
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
  Vector3,
} from 'three';
import { ShipData } from '../../../models/ship.model';
import { PlanetView } from '../../../models/system.model';
import { buildProceduralShip, disposeShip } from '../../ships/ship-procedural.builder';
import {
  getStableTransitProgress,
  shipInOrbit,
  shipInTransit,
} from '../planet-helpers';
import { getMuForBody } from './celestial-mass';
import { ShipDynamicsEngine } from './ship-dynamics.engine';
import { shipMarkerScale } from './system-scene.layout';
import { SystemOrbitEngine } from './system-orbit.engine';
import { disposeObject3D } from './three-dispose.util';

const BLIP_DOCKED_COLOR = 0x38bdf8;
const BLIP_ORBIT_COLOR = 0x7dd3fc;
const BLIP_TRANSIT_COLOR = 0x5eead4;

interface StationaryShipMarkerData {
  kind: 'docked' | 'orbit';
  ship: ShipData;
  waypointSymbol: string;
  orbitIndex: number;
  orbitTotal: number;
}

interface TransitShipMarkerData {
  kind: 'transit';
  ship: ShipData;
  originSymbol: string;
  destSymbol: string;
}

type ShipMarkerData = StationaryShipMarkerData | TransitShipMarkerData;

/** Minimal waypoint info the marker manager needs (radius for scale/offset). */
export interface MarkerPlanetEntry {
  radius: number;
  simRadiusKm: number;
  planet: PlanetView;
}

/** Deterministic phase in [0,1) so markers do not all pulse in lockstep. */
function markerPulsePhase(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

/**
 * Owns the docked/transit ship markers and their radar blips. Rebuilds are gated
 * by {@link computeMarkerSignature} so per-frame transit polling does not tear
 * down and re-create every procedural hull.
 */
export class ShipMarkerManager {
  readonly markers = new Group();
  readonly blips = new Group();

  private readonly originScratch = new Vector3();
  private readonly destScratch = new Vector3();
  private readonly dynamics = new ShipDynamicsEngine();

  constructor() {
    this.markers.name = 'ship-markers';
    this.blips.name = 'ship-blips';
  }

  get dynamicsEngine(): ShipDynamicsEngine {
    return this.dynamics;
  }

  /**
   * Rebuild docked + transit markers (and blips) for the on-map fleet. The
   * camera-followed selected ship is skipped so it never renders twice.
   */
  rebuild(
    onMap: ShipData[],
    selected: string | null,
    planetByName: ReadonlyMap<string, MarkerPlanetEntry>,
  ): void {
    this.clearMarkers();
    this.clearBlips();
    this.dynamics.clear();

    const byWaypoint = new Map<string, ShipData[]>();
    for (const ship of onMap) {
      if (shipInTransit(ship)) continue;
      const key = ship.nav.waypointSymbol;
      const list = byWaypoint.get(key) ?? [];
      list.push(ship);
      byWaypoint.set(key, list);
    }

    for (const [waypointSymbol, shipsAt] of byWaypoint) {
      const entry = planetByName.get(waypointSymbol);
      if (!entry) continue;

      shipsAt.forEach((ship, index) => {
        if (ship.symbol === selected) return;
        const inOrbit = shipInOrbit(ship);
        const marker = this.createShipMarker(ship, shipMarkerScale(entry.radius, false));
        marker.userData['markerData'] = {
          kind: inOrbit ? 'orbit' : 'docked',
          ship,
          waypointSymbol,
          orbitIndex: index,
          orbitTotal: shipsAt.length,
        } satisfies StationaryShipMarkerData;
        const blip = this.createShipBlip(
          Math.max(2.5, entry.radius * 0.5),
          inOrbit ? BLIP_ORBIT_COLOR : BLIP_DOCKED_COLOR,
        );
        marker.userData['blip'] = blip;
        this.blips.add(blip);
        this.markers.add(marker);
      });
    }

    for (const ship of onMap.filter(shipInTransit)) {
      const route = ship.nav.route;
      if (!route) continue;
      const originPlanet = planetByName.get(route.origin.symbol);
      const destPlanet = planetByName.get(route.destination.symbol);
      if (!originPlanet || !destPlanet) continue;
      if (ship.symbol === selected) continue;

      const marker = this.createShipMarker(ship, shipMarkerScale(originPlanet.radius, false));
      marker.userData['markerData'] = {
        kind: 'transit',
        ship,
        originSymbol: route.origin.symbol,
        destSymbol: route.destination.symbol,
      } satisfies TransitShipMarkerData;
      marker.userData['ship'] = ship;
      const blip = this.createShipBlip(Math.max(2.5, originPlanet.radius * 0.5), BLIP_TRANSIT_COLOR);
      marker.userData['blip'] = blip;
      this.blips.add(blip);
      this.markers.add(marker);
    }
  }

  /** Position every marker (and its blip) from current orbital positions. */
  applyPositions(
    orbitEngine: SystemOrbitEngine,
    planetByName: ReadonlyMap<string, MarkerPlanetEntry>,
    fleetBySymbol: ReadonlyMap<string, ShipData>,
    simTime: number,
  ): void {
    const originPos = this.originScratch;
    const destPos = this.destScratch;

    for (const child of this.markers.children) {
      const data = child.userData['markerData'] as ShipMarkerData | undefined;
      if (!data) continue;

      if (data.kind === 'docked' || data.kind === 'orbit') {
        const entry = planetByName.get(data.waypointSymbol);
        if (!entry) continue;
        const ship = fleetBySymbol.get(data.ship.symbol) ?? data.ship;
        orbitEngine.getWorldPosition(data.waypointSymbol, originPos);
        const parentMu = getMuForBody(entry.planet);
        const pose = this.dynamics.resolvePose(
          { ...ship, nav: { ...ship.nav, status: data.kind === 'orbit' ? 'IN_ORBIT' : 'DOCKED' } },
          null,
          null,
          originPos,
          entry.simRadiusKm,
          parentMu,
          simTime,
          0,
          data.orbitIndex,
          data.orbitTotal,
          child,
        );
        child.position.copy(pose.position);
        if (data.kind === 'docked') {
          child.rotation.set(0, Math.PI * 0.12, 0);
        }
        this.syncBlipToMarker(child);
        continue;
      }

      if (data.kind !== 'transit') continue;

      const ship = fleetBySymbol.get(data.ship.symbol) ?? data.ship;
      const route = ship.nav.route;
      if (!route) continue;
      const originEntry = planetByName.get(data.originSymbol);
      const destEntry = planetByName.get(data.destSymbol);
      if (!originEntry || !destEntry) continue;

      const t = getStableTransitProgress(ship);
      orbitEngine.getWorldPosition(data.originSymbol, originPos);
      orbitEngine.getWorldPosition(data.destSymbol, destPos);
      const pose = this.dynamics.sampleTransit(ship, originPos, destPos, t, child);
      child.position.copy(pose.position);
      this.syncBlipToMarker(child);
    }
  }

  /** Breathe the hulls and ping-expand the blips. */
  animate(elapsed: number): void {
    for (const child of this.markers.children) {
      const baseScale = child.userData['baseScale'] as number | undefined;
      const phase = (child.userData['pulsePhase'] as number | undefined) ?? 0;
      if (baseScale !== undefined) {
        const breathe = 1 + Math.sin(elapsed * 4 + phase * Math.PI * 2) * 0.08;
        child.scale.setScalar(baseScale * breathe);
      }
      const blip = child.userData['blip'] as Mesh | undefined;
      if (blip) {
        const ping = (((elapsed * 0.65 + phase) % 1) + 1) % 1;
        blip.scale.setScalar(0.6 + ping * 1.4);
        (blip.material as MeshBasicMaterial).opacity = Math.max(0, (1 - ping) * 0.55);
      }
    }
  }

  dispose(): void {
    this.clearMarkers();
    this.clearBlips();
    this.dynamics.clear();
  }

  private createShipMarker(ship: ShipData, baseScale: number): Group {
    const marker = buildProceduralShip(ship.registration.role).root;
    const finalScale = this.shipMarkerScaleForRole(ship.registration.role, baseScale);
    marker.scale.setScalar(finalScale);
    marker.userData['ship'] = ship;
    marker.userData['baseScale'] = finalScale;
    marker.userData['pulsePhase'] = markerPulsePhase(ship.symbol);
    return marker;
  }

  private shipMarkerScaleForRole(role: string, baseScale: number): number {
    const profile = role === 'SATELLITE' ? 0.6 : 1;
    return baseScale * profile;
  }

  private createShipBlip(radius: number, color: number): Mesh {
    const blip = new Mesh(
      new RingGeometry(radius * 0.68, radius, 28),
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    blip.rotation.x = -Math.PI / 2;
    return blip;
  }

  private syncBlipToMarker(marker: Object3D): void {
    const blip = marker.userData['blip'] as Mesh | undefined;
    if (blip) {
      blip.position.set(marker.position.x, marker.position.y - 0.4, marker.position.z);
    }
  }

  private clearMarkers(): void {
    while (this.markers.children.length) {
      const child = this.markers.children[0]!;
      this.markers.remove(child);
      disposeShip(child);
    }
  }

  private clearBlips(): void {
    while (this.blips.children.length) {
      const child = this.blips.children[0]!;
      this.blips.remove(child);
      disposeObject3D(child);
    }
  }
}

/**
 * Structural fingerprint of the on-map fleet (identity, role, status, location
 * and transit route). Excludes transit *progress*, which animates per-frame, so
 * polling that only advances ETA does not trigger a marker rebuild.
 */
export function computeMarkerSignature(
  onMap: ShipData[],
  systemSymbol: string,
  selected: string | null,
): string {
  const parts = onMap
    .map((s) => {
      const route = s.nav.route;
      const loc =
        shipInTransit(s) && route
          ? `${route.origin.symbol}>${route.destination.symbol}`
          : s.nav.waypointSymbol;
      return `${s.symbol}|${s.registration.role}|${s.nav.status}|${loc}`;
    })
    .sort();
  return `${systemSymbol}#${selected ?? ''}#${parts.join(',')}`;
}
