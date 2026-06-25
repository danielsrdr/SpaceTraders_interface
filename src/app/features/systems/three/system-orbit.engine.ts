import { Vector3 } from 'three';
import { PlanetView } from '../../../models/system.model';
import { resolveWaypointType } from '../planet-helpers';
import { getPlanetRadius3d, SystemLayout3d } from './system-scene.layout';

interface OrbitBody {
  symbol: string;
  parent: string | null;
  radius: number;
  phase0: number;
  angularSpeed: number;
  inclination: number;
  phase: number;
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

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function keplerAngularSpeed(radius: number, typeMultiplier = 1): number {
  const r = Math.max(MIN_RADIUS, radius);
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

  build(planets: PlanetView[], layout: SystemLayout3d): void {
    this.bodies.clear();
    this.tickOrder = [];
    this.positions.clear();

    if (!planets.length) return;

    const bySymbol = new Map(planets.map((p) => [p.name, p]));

    for (const planet of planets) {
      const parent = resolveParentSymbol(planet, bySymbol);
      const parentPos = parentApiPosition(parent, bySymbol, layout);
      const dx = planet.position.x - parentPos.x;
      const dy = planet.position.y - parentPos.y;
      const apiDist = Math.hypot(dx, dy);
      const minOrbit = this.minOrbitRadius(planet, parent, bySymbol);
      const radius = Math.max(minOrbit, apiDist * layout.scale);
      const phase0 = apiDist > 0.001 ? Math.atan2(dy, dx) : hashString(planet.name) * 0.0001;
      const hash = hashString(planet.name);
      const inclination = ((hash % 1000) / 1000 - 0.5) * 0.12;

      this.bodies.set(planet.name, {
        symbol: planet.name,
        parent,
        radius,
        phase0,
        angularSpeed: keplerAngularSpeed(radius, typeSpeedMultiplier(planet.type)),
        inclination,
        phase: 0,
        tickOrder: 0,
      });
    }

    this.assignTickOrder(bySymbol);
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

  tick(delta: number): void {
    if (!this.bodies.size) return;

    for (const symbol of this.tickOrder) {
      const body = this.bodies.get(symbol);
      if (!body) continue;
      body.phase += body.angularSpeed * delta;
    }

    this.recomputePositions();
  }

  private recomputePositions(): void {
    this.positions.clear();

    for (const symbol of this.tickOrder) {
      const body = this.bodies.get(symbol);
      if (!body) continue;

      const angle = body.phase0 + body.phase;
      const localX = Math.cos(angle) * body.radius;
      const localZ = Math.sin(angle) * body.radius;
      const localY = Math.sin(angle * 2 + body.inclination) * body.inclination * body.radius;

      if (!body.parent) {
        this.positions.set(symbol, new Vector3(localX, localY, localZ));
        continue;
      }

      const parentPos = this.positions.get(body.parent);
      if (!parentPos) {
        this.positions.set(symbol, new Vector3(localX, localY, localZ));
        continue;
      }

      this.scratch.set(localX, localY, localZ).add(parentPos);
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

  /** Scene extent including body radii — used for camera far plane and god view. */
  sceneExtent(planets: PlanetView[]): number {
    let extent = 120;
    for (const planet of planets) {
      const pos = this.positions.get(planet.name);
      if (!pos) continue;
      const r = getPlanetRadius3d(planet);
      extent = Math.max(extent, Math.hypot(pos.x, pos.z) + r + 40);
    }
    return extent;
  }
}
