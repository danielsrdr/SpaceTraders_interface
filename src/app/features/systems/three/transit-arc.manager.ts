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
import { getStableTransitProgress, shipInTransit } from '../planet-helpers';
import { ShipDynamicsEngine } from './ship-dynamics.engine';
import { USE_PHYSICS_DYNAMICS } from './physics-units';
import { transitArcLift } from './transit-arc.math';
import { SystemOrbitEngine } from './system-orbit.engine';
import { disposeObject3D } from './three-dispose.util';

const ARC_SEGMENTS = 36;
const ARC_SELECTED_COLOR = 0xfbbf24;
const ARC_TRANSIT_COLOR = 0x5eead4;

interface TransitArcData {
  ship: ShipData;
  /** Legacy bezier fallback. */
  curve: QuadraticBezierCurve3;
  line: Line;
  dot: Mesh;
  pathPoints: Vector3[] | null;
}

/** Lookup the manager needs to verify a leg's endpoints exist on the map. */
export interface ArcPlanetLookup {
  has(symbol: string): boolean;
}

/** Owns the per-leg transit arcs (ballistic or bezier line plus travelling dot). */
export class TransitArcManager {
  readonly arcs = new Group();

  private readonly scratch = new Vector3();
  private readonly mid = new Vector3();
  private readonly dynamics = new ShipDynamicsEngine();

  constructor() {
    this.arcs.name = 'transit-arcs';
  }

  get dynamicsEngine(): ShipDynamicsEngine {
    return this.dynamics;
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
        (arc.userData['arc'] as TransitArcData).dot.visible = false;
      }
      this.arcs.add(arc);
    }
  }

  /** Re-fit each arc to current orbital positions and advance the dot. */
  update(
    elapsed: number,
    orbitEngine: SystemOrbitEngine,
    fleetBySymbol: ReadonlyMap<string, ShipData>,
  ): void {
    const dotPulse = 1 + Math.sin(elapsed * 6) * 0.25;
    for (const group of this.arcs.children) {
      const arc = group.userData['arc'] as TransitArcData | undefined;
      if (!arc) continue;
      const ship = fleetBySymbol.get(arc.ship.symbol) ?? arc.ship;
      arc.ship = ship;
      const route = ship.nav.route;
      if (!route) continue;

      orbitEngine.getWorldPosition(route.origin.symbol, arc.curve.v0);
      orbitEngine.getWorldPosition(route.destination.symbol, arc.curve.v2);

      const geometry = arc.line.geometry as BufferGeometry;
      const attr = geometry.getAttribute('position') as Float32BufferAttribute;

      if (USE_PHYSICS_DYNAMICS) {
        const points = this.dynamics.getTransitPathPoints(ship, arc.curve.v0, arc.curve.v2);
        arc.pathPoints = points;
        const step = Math.max(1, Math.floor(points.length / ARC_SEGMENTS));
        let idx = 0;
        for (let i = 0; i <= ARC_SEGMENTS; i++) {
          const pi = Math.min(points.length - 1, i * step);
          const p = points[pi]!;
          attr.setXYZ(idx, p.x, p.y, p.z);
          idx++;
        }
        for (; idx <= ARC_SEGMENTS; idx++) {
          const last = points[points.length - 1]!;
          attr.setXYZ(idx, last.x, last.y, last.z);
        }
        const t = getStableTransitProgress(ship);
        const path = points;
        const total = path.length - 1;
        const fi = Math.min(total, Math.floor(t * total));
        const frac = t * total - fi;
        this.scratch.lerpVectors(path[fi]!, path[Math.min(total, fi + 1)]!, frac);
        arc.dot.position.copy(this.scratch);
      } else {
        this.mid.addVectors(arc.curve.v0, arc.curve.v2).multiplyScalar(0.5);
        this.mid.y += transitArcLift(arc.curve.v0, arc.curve.v2);
        arc.curve.v1.copy(this.mid);

        for (let i = 0; i <= ARC_SEGMENTS; i++) {
          arc.curve.getPoint(i / ARC_SEGMENTS, this.scratch);
          attr.setXYZ(i, this.scratch.x, this.scratch.y, this.scratch.z);
        }
        arc.curve.getPoint(getStableTransitProgress(ship), this.scratch);
        arc.dot.position.copy(this.scratch);
      }

      attr.needsUpdate = true;
      arc.dot.scale.setScalar(dotPulse);
    }
  }

  dispose(): void {
    this.clear();
    this.dynamics.clear();
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
      pathPoints: null,
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
