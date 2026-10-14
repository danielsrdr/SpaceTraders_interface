import { PlanetView, Position } from '../../../models/system.model';
import { getSimRadiusKm } from './celestial-mass';
import { bodyViewRenderOffset, renderRadius, shipOrbitVerticalOffset } from './render-transform';
import {
  API_UNIT_KM,
  apiDistanceToKm,
  fitStarRadiusKm,
  renderBodyRadius,
  renderSystemDistance,
  starProfile,
  SYSTEM_KM_PER_RENDER_UNIT,
} from './universe-physics';

/** Render units per API unit: one universal value, identical for every system. */
export const API_RENDER_SCALE = API_UNIT_KM / SYSTEM_KM_PER_RENDER_UNIT;

/** Smallest rendered star radius so compact remnants stay visible. */
const MIN_STAR_RENDER_RADIUS = 3;

export interface SystemLayout3d {
  /** Universal render units per API unit (constant; kept for layout consumers). */
  scale: number;
  /** The star sits at the API origin. */
  centerX: number;
  centerY: number;
  /** Initial display positions from API coords (updated each frame by orbit engine). */
  displayPositions: Map<string, { x: number; z: number }>;
  sceneExtent: number;
}

export function computeSystemLayout3d(planets: PlanetView[]): SystemLayout3d {
  const displayPositions = new Map<string, { x: number; z: number }>();
  let extent = 0;

  for (const planet of planets) {
    const offset = apiRelativeOffset(planet, null, { scale: API_RENDER_SCALE });
    displayPositions.set(planet.name, offset);
    extent = Math.max(extent, Math.hypot(offset.x, offset.z) + getPlanetRadius3d(planet));
  }

  return {
    scale: API_RENDER_SCALE,
    centerX: 0,
    centerY: 0,
    displayPositions,
    sceneExtent: Math.max(extent + 40, 120),
  };
}

/**
 * Rendered radius of the star: the universal size map, clamped so it never
 * swallows the innermost heliocentric orbit.
 */
export function starRenderRadius(
  systemType: string | null | undefined,
  planets: readonly PlanetView[],
): number {
  const star = starProfile(systemType);
  let innermostKm = Infinity;
  for (const p of planets) {
    if (p.orbits?.trim()) continue;
    innermostKm = Math.min(innermostKm, apiDistanceToKm(Math.hypot(p.position.x, p.position.y)));
  }
  if (!Number.isFinite(innermostKm)) {
    return Math.max(MIN_STAR_RENDER_RADIUS, renderBodyRadius(star.radiusKm));
  }
  const radius = Math.max(
    MIN_STAR_RENDER_RADIUS,
    renderBodyRadius(fitStarRadiusKm(star, innermostKm)),
  );
  return Math.min(
    radius,
    Math.max(MIN_STAR_RENDER_RADIUS, renderSystemDistance(innermostKm) * 0.4),
  );
}

/** API offset from a parent waypoint (or the star at the origin when parent is null). */
export function apiRelativeOffset(
  child: PlanetView,
  parent: PlanetView | null,
  layout: Pick<SystemLayout3d, 'scale'>,
): { x: number; z: number } {
  const dx = child.position.x - (parent?.position.x ?? 0);
  const dy = child.position.y - (parent?.position.y ?? 0);
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

/** Render radius in Three.js world units (universal size map). */
export function getPlanetRadius3d(planet: PlanetView): number {
  return renderRadius(getSimRadiusKm(planet));
}

/** Sim radius in km for physics calculations. */
export function getPlanetSimRadiusKm(planet: PlanetView): number {
  return getSimRadiusKm(planet);
}

/** Vertical offset for docked / orbiting ships above the equatorial plane. */
export function shipOrbitHeightOffset(waypointRenderRadius: number): number {
  return shipOrbitVerticalOffset(waypointRenderRadius);
}

/** Camera standoff from a body centre (render units). */
export function bodyViewOffsetForRadius(bodyRenderRadius: number): {
  x: number;
  y: number;
  z: number;
} {
  const v = bodyViewRenderOffset(bodyRenderRadius);
  return { x: v.x, y: v.y, z: v.z };
}
