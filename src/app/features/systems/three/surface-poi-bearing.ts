import type { SurfacePoiAnchor } from './surface-world.builder';

export interface NearestPoiInfo {
  label: string;
  kind: string;
  bearingDeg: number;
  distanceM: number;
}

/** Bearing in degrees (0 = +Z) from a world position toward the nearest POI anchor. */
export function nearestPoiInfo(
  x: number,
  z: number,
  anchors: SurfacePoiAnchor[],
): NearestPoiInfo | null {
  if (!anchors.length) return null;
  let best = anchors[0]!;
  let bestDist = Infinity;
  for (const anchor of anchors) {
    const dx = anchor.position.x - x;
    const dz = anchor.position.z - z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = anchor;
    }
  }
  const dx = best.position.x - x;
  const dz = best.position.z - z;
  const bearingRad = Math.atan2(dx, dz);
  const bearingDeg = ((bearingRad * 180) / Math.PI + 360) % 360;
  return {
    label: best.label,
    kind: best.kind,
    bearingDeg,
    distanceM: Math.sqrt(bestDist),
  };
}

/** Compass-relative bearing: POI direction minus camera yaw (degrees). */
export function relativePoiBearing(poiBearingDeg: number, cameraYawRad: number): number {
  const cameraDeg = (cameraYawRad * 180) / Math.PI;
  return ((poiBearingDeg - cameraDeg + 540) % 360) - 180;
}

export function bearingToCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return dirs[idx]!;
}
