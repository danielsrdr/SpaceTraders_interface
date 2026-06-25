import { PlanetView, Position } from '../../../models/system.model';
import { resolveWaypointType } from '../planet-helpers';

export interface SystemLayout3d {
  scale: number;
  centerX: number;
  centerY: number;
  /** Initial display positions from API coords (updated each frame by orbit engine). */
  displayPositions: Map<string, { x: number; z: number }>;
  sceneExtent: number;
}

/** Absolute world radii — not tied to coordinate spread. */
const TYPE_WORLD_RADIUS: Record<string, number> = {
  PLANET: 5,
  GAS_GIANT: 12,
  MOON: 2.5,
  ORBITAL_STATION: 2.2,
  JUMP_GATE: 3.5,
  ASTEROID: 1.8,
  ASTEROID_FIELD: 7,
  ASTEROID_BASE: 4.5,
  ENGINEERED_ASTEROID: 3.2,
  NEBULA: 10,
  DEBRIS_FIELD: 5.5,
  GRAVITY_WELL: 4,
  ARTIFICIAL_GRAVITY_WELL: 4,
  ARTIFICAL_GRAVITY_WELL: 4,
  FUEL_STATION: 1.6,
  ARTIFACT: 3.5,
};

export function computeSystemLayout3d(planets: PlanetView[]): SystemLayout3d {
  if (!planets.length) {
    return { scale: 2, centerX: 0, centerY: 0, displayPositions: new Map(), sceneExtent: 120 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const planet of planets) {
    minX = Math.min(minX, planet.position.x);
    maxX = Math.max(maxX, planet.position.x);
    minY = Math.min(minY, planet.position.y);
    maxY = Math.max(maxY, planet.position.y);
  }

  const rangeX = Math.max(maxX - minX, 10);
  const rangeY = Math.max(maxY - minY, 10);
  const maxRange = Math.max(rangeX, rangeY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const scale = Math.max(4, 520 / maxRange);
  const displayPositions = new Map<string, { x: number; z: number }>();
  let extent = 0;

  for (const planet of planets) {
    const offset = apiRelativeOffset(planet, null, { scale, centerX, centerY });
    displayPositions.set(planet.name, offset);
    const r = getPlanetRadius3d(planet);
    extent = Math.max(extent, Math.hypot(offset.x, offset.z) + r);
  }

  return {
    scale,
    centerX,
    centerY,
    displayPositions,
    sceneExtent: Math.max(extent + 40, 120),
  };
}

/** API offset from a parent waypoint (or sun at origin when parent is null). */
export function apiRelativeOffset(
  child: PlanetView,
  parent: PlanetView | null,
  layout: Pick<SystemLayout3d, 'scale' | 'centerX' | 'centerY'>,
): { x: number; z: number } {
  const parentX = parent?.position.x ?? layout.centerX;
  const parentY = parent?.position.y ?? layout.centerY;
  const dx = child.position.x - parentX;
  const dy = child.position.y - parentY;
  return {
    x: dx * layout.scale,
    z: dy * layout.scale,
  };
}

export function worldPosition3d(
  position: Position,
  layout: SystemLayout3d,
): { x: number; y: number; z: number } {
  return {
    x: (position.x - layout.centerX) * layout.scale,
    y: 0,
    z: (position.y - layout.centerY) * layout.scale,
  };
}

export function planetWorldPosition3d(
  planet: PlanetView,
  layout: SystemLayout3d,
): { x: number; y: number; z: number } {
  const spread = layout.displayPositions.get(planet.name);
  if (spread) {
    return { x: spread.x, y: 0, z: spread.z };
  }
  return worldPosition3d(planet.position, layout);
}

export function getPlanetRadius3d(planet: PlanetView, _layout?: SystemLayout3d): number {
  const resolved = resolveWaypointType(planet.type);
  return TYPE_WORLD_RADIUS[resolved] ?? 3.5;
}

/** Ship marker scale relative to nearby waypoint radius. */
export function shipMarkerScale(waypointRadius: number, selected: boolean): number {
  const base = Math.min(0.35, Math.max(0.1, waypointRadius * 0.045));
  return selected ? base * 1.25 : base;
}

/** Orbit ring distance for fleet markers around a waypoint. */
export function shipOrbitDistance(waypointRadius: number): number {
  return waypointRadius * 1.5 + 10;
}
