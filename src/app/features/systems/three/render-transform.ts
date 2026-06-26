import { Vector3 } from 'three';
import {
  DEFAULT_SHIP_LENGTH_M,
  MIN_SCREEN_SHIP_PX,
  ORBIT_ALTITUDE_KM,
  RENDER_KM_PER_UNIT,
  SHIP_LENGTH_M,
} from './physics-units';

export type RenderContext = 'system' | 'local';

/** Convert simulation distance (km) to Three.js world units. */
export function renderDistance(simKm: number, _context: RenderContext = 'system'): number {
  return simKm / RENDER_KM_PER_UNIT;
}

/** Convert a body radius (km) to render units. */
export function renderRadius(simRadiusKm: number, context: RenderContext = 'local'): number {
  return renderDistance(simRadiusKm, context);
}

/** Orbit ring radius in render units for a body with the given render radius. */
export function shipOrbitRenderDistance(bodyRenderRadius: number, simRadiusKm: number): number {
  return renderRadius(simRadiusKm + ORBIT_ALTITUDE_KM, 'local');
}

/** Vertical offset placing ships above a body's equatorial plane (render units). */
export function shipOrbitVerticalOffset(bodyRenderRadius: number): number {
  return bodyRenderRadius * 0.35 + renderDistance(ORBIT_ALTITUDE_KM * 0.15, 'local');
}

/** Camera standoff from a body centre (render units). */
export function bodyViewRenderOffset(bodyRenderRadius: number): Vector3 {
  const y = bodyRenderRadius * 0.6 + renderDistance(ORBIT_ALTITUDE_KM * 0.5, 'local');
  const z = bodyRenderRadius * 2.4 + renderDistance(ORBIT_ALTITUDE_KM * 2, 'local');
  return new Vector3(0, y, z);
}

/** Map sim position (km, X/Z plane) to render position using layout scale. */
export function simToRender(
  simX: number,
  simZ: number,
  layoutScale: number,
  target = new Vector3(),
): Vector3 {
  const renderScale = layoutScale * (10_000 / RENDER_KM_PER_UNIT);
  return target.set(simX * renderScale, 0, simZ * renderScale);
}

/**
 * Ship mesh scale ensuring at least MIN_SCREEN_SHIP_PX on screen.
 * `hullLengthRender` is the desired hull length in world units.
 */
export function shipRenderScale(
  role: string,
  hullLengthRender: number,
  cameraDistance: number,
  viewportHeight: number,
  fovDeg: number,
): number {
  const lengthM = SHIP_LENGTH_M[role] ?? DEFAULT_SHIP_LENGTH_M;
  const baseScale = hullLengthRender > 0 ? hullLengthRender : lengthM / 1000 / RENDER_KM_PER_UNIT * 100;

  if (cameraDistance <= 0 || viewportHeight <= 0) return baseScale;

  const fovRad = (fovDeg * Math.PI) / 180;
  const worldHeight = 2 * Math.tan(fovRad / 2) * cameraDistance;
  const pxPerUnit = viewportHeight / worldHeight;
  const minScale = MIN_SCREEN_SHIP_PX / pxPerUnit;

  return Math.max(baseScale, minScale);
}

/** Marker scale relative to nearby waypoint render radius. */
export function shipMarkerRenderScale(waypointRadius: number, selected: boolean): number {
  const base = Math.min(0.35, Math.max(0.1, waypointRadius * 0.045));
  return selected ? base * 1.25 : base;
}
