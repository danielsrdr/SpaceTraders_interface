import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  QuadraticBezierCurve3,
  SphereGeometry,
  Vector3,
} from 'three';
import { ShipData } from '../../../models/ship.model';
import { getTransitProgress, shipInTransit } from '../planet-helpers';
import { transitArcLift } from './transit-arc.math';
import { SystemOrbitEngine } from './system-orbit.engine';
import { disposeObject3D } from './three-dispose.util';

const ARC_SEGMENTS = 36;
const ARC_SELECTED_COLOR = 0xfbbf24;
const ARC_TRANSIT_COLOR = 0x5eead4;

interface TransitArcData {
  ship: ShipData;
  curve: QuadraticBezierCurve3;
  line: Line;
  dot: Mesh;
}

/** Lookup the manager needs to verify a leg's endpoints exist on the map. */
export interface ArcPlanetLookup {
  has(symbol: string): boolean;
}

/** Owns the per-leg transit arcs (a bezier line plus a travelling dot). */
export class TransitArcManager {
  readonly arcs = new Group();

  private readonly scratch = new Vector3();
  private readonly mid = new Vector3();

  constructor() {
    this.arcs.name = 'transit-arcs';
  }

  /** Rebuild one arc per in-transit ship whose endpoints are on the map. */
  rebuild(onMap: ShipData[], selected: string | null, planetByName: ArcPlanetLookup): void {
    this.clear();

    for (const ship of onMap.filter(shipInTransit)) {
      const route = ship.nav.route;
      if (!route) continue;
      if (!planetByName.has(route.origin.symbol) || !planetByName.has(route.destination.symbol)) {
        continue;
      }

      const isSelected = ship.symbol === selected;
      const arc = this.createArc(ship, isSelected ? ARC_SELECTED_COLOR : ARC_TRANSIT_COLOR);
      if (isSelected) {
        // The followed ship rides the arc itself, so hide the marker dot.
        (arc.userData['arc'] as TransitArcData).dot.visible = false;
      }
      this.arcs.add(arc);
    }
  }

  /** Re-fit each arc to current orbital positions and advance the dot. */
  update(elapsed: number, orbitEngine: SystemOrbitEngine): void {
    const dotPulse = 1 + Math.sin(elapsed * 6) * 0.25;
    for (const group of this.arcs.children) {
      const arc = group.userData['arc'] as TransitArcData | undefined;
      if (!arc) continue;
      const route = arc.ship.nav.route;
      if (!route) continue;

      orbitEngine.getWorldPosition(route.origin.symbol, arc.curve.v0);
      orbitEngine.getWorldPosition(route.destination.symbol, arc.curve.v2);
      this.mid.addVectors(arc.curve.v0, arc.curve.v2).multiplyScalar(0.5);
      this.mid.y += transitArcLift(arc.curve.v0, arc.curve.v2);
      arc.curve.v1.copy(this.mid);

      const geometry = arc.line.geometry as BufferGeometry;
      const attr = geometry.getAttribute('position') as Float32BufferAttribute;
      for (let i = 0; i <= ARC_SEGMENTS; i++) {
        arc.curve.getPoint(i / ARC_SEGMENTS, this.scratch);
        attr.setXYZ(i, this.scratch.x, this.scratch.y, this.scratch.z);
      }
      attr.needsUpdate = true;

      arc.curve.getPoint(getTransitProgress(route), this.scratch);
      arc.dot.position.copy(this.scratch);
      arc.dot.scale.setScalar(dotPulse);
    }
  }

  dispose(): void {
    this.clear();
  }

  private createArc(ship: ShipData, color: number): Group {
    const positions = new Float32Array((ARC_SEGMENTS + 1) * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const line = new Line(
      geometry,
      new LineBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    const dot = new Mesh(
      new SphereGeometry(1.1, 12, 12),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    const group = new Group();
    group.add(line);
    group.add(dot);
    group.userData['arc'] = {
      ship,
      curve: new QuadraticBezierCurve3(),
      line,
      dot,
    } satisfies TransitArcData;
    return group;
  }

  private clear(): void {
    while (this.arcs.children.length) {
      const child = this.arcs.children[0]!;
      this.arcs.remove(child);
      disposeObject3D(child);
    }
  }
}
