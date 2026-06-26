import {
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
  Vector3,
} from 'three';
import { ShipData } from '../../../models/ship.model';
import { buildProceduralShip, disposeShip } from '../../ships/ship-procedural.builder';
import { getStableTransitProgress, shipInTransit, shipOrbitOffset } from '../planet-helpers';
import { orientAlongArc, sampleTransitArc } from './transit-arc.math';
import { shipMarkerScale, shipOrbitDistance } from './system-scene.layout';
import { SystemOrbitEngine } from './system-orbit.engine';
import { disposeObject3D } from './three-dispose.util';

const BLIP_DOCKED_COLOR = 0x38bdf8;
const BLIP_TRANSIT_COLOR = 0x5eead4;

interface DockedShipMarkerData {
  kind: 'docked';
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

type ShipMarkerData = DockedShipMarkerData | TransitShipMarkerData;

/** Minimal waypoint info the marker manager needs (radius for scale/offset). */
export interface MarkerPlanetEntry {
  radius: number;
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
  private readonly orientScratch = new Vector3();

  constructor() {
    this.markers.name = 'ship-markers';
    this.blips.name = 'ship-blips';
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
        const marker = this.createShipMarker(ship, shipMarkerScale(entry.radius, false));
        marker.userData['markerData'] = {
          kind: 'docked',
          ship,
          waypointSymbol,
          orbitIndex: index,
          orbitTotal: shipsAt.length,
        } satisfies DockedShipMarkerData;
        const blip = this.createShipBlip(Math.max(2.5, entry.radius * 0.5), BLIP_DOCKED_COLOR);
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
      // The selected ship is drawn as the camera-followed shipGroup; its arc is
      // still drawn by the TransitArcManager, but skip its duplicate marker.
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
  ): void {
    const originPos = this.originScratch;
    const destPos = this.destScratch;

    for (const child of this.markers.children) {
      const data = child.userData['markerData'] as ShipMarkerData | undefined;
      if (!data) continue;

      if (data.kind === 'docked') {
        const entry = planetByName.get(data.waypointSymbol);
        if (!entry) continue;
        const orbitR = shipOrbitDistance(entry.radius);
        const offset = shipOrbitOffset(data.orbitIndex, data.orbitTotal, orbitR);
        orbitEngine.getWorldPosition(data.waypointSymbol, originPos);
        child.position.set(
          originPos.x + offset.x,
          originPos.y + entry.radius * 0.35 + 1.5,
          originPos.z + offset.y,
        );
        this.syncBlipToMarker(child);
        continue;
      }

      const ship = fleetBySymbol.get(data.ship.symbol) ?? data.ship;
      const route = ship.nav.route;
      if (!route) continue;
      const originEntry = planetByName.get(data.originSymbol);
      const destEntry = planetByName.get(data.destSymbol);
      if (!originEntry || !destEntry) continue;

      const t = getStableTransitProgress(ship);
      orbitEngine.getWorldPosition(data.originSymbol, originPos);
      orbitEngine.getWorldPosition(data.destSymbol, destPos);
      sampleTransitArc(originPos, destPos, t, child.position);
      orientAlongArc(child, originPos, destPos, t, this.orientScratch);
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
      // In transit, waypointSymbol can flicker between polls; the route leg is enough.
      const loc =
        shipInTransit(s) && route
          ? `${route.origin.symbol}>${route.destination.symbol}`
          : s.nav.waypointSymbol;
      return `${s.symbol}|${s.registration.role}|${s.nav.status}|${loc}`;
    })
    .sort();
  return `${systemSymbol}#${selected ?? ''}#${parts.join(',')}`;
}
