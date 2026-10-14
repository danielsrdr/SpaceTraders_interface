import { Vector3 } from 'three';
import {
  DEFAULT_SHIP_LENGTH_M,
  MIN_SCREEN_SHIP_PX,
  ORBIT_ALTITUDE_KM,
  RENDER_KM_PER_UNIT,
  SHIP_LENGTH_M,
} from './physics-units';
import { renderBodyRadius, renderSystemDistance } from './universe-physics';

export type RenderContext = 'system' | 'local';

/**
 * Convert a distance (km) to Three.js world units. `system` uses the universal
 * position map; `local` is the fine linear scale for near-body offsets (ship altitude).
 */
export function renderDistance(simKm: number, context: RenderContext = 'system'): number {
  return context === 'system' ? renderSystemDistance(simKm) : simKm / RENDER_KM_PER_UNIT;
}

/** Rendered body radius (universal size map, identical in every system). */
export function renderRadius(simRadiusKm: number, _context: RenderContext = 'local'): number {
  return renderBodyRadius(simRadiusKm);
}

/** Orbit ring radius in render units for a body with the given sim radius. */
export function shipOrbitRenderDistance(simRadiusKm: number): number {
  const bodyR = renderRadius(simRadiusKm);
  return bodyR + Math.max(renderDistance(ORBIT_ALTITUDE_KM, 'local'), bodyR * 0.15);
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
  const baseScale =
    hullLengthRender > 0 ? hullLengthRender : (lengthM / 1000 / RENDER_KM_PER_UNIT) * 100;

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
