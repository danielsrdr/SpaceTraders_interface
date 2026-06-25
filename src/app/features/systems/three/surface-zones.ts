import { SurfaceZoneKind } from './system-view-mode';
import type { PoiPositions } from './surface-poi';
import { PIT_RADIUS } from './mine/mine-pit.builder';

export interface Aabb {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface SurfaceZone {
  kind: SurfaceZoneKind;
  label: string;
  aabb: Aabb;
}

export function isInZone(x: number, y: number, z: number, zone: SurfaceZone): boolean {
  const { aabb } = zone;
  return x >= aabb.minX && x <= aabb.maxX && y >= aabb.minY && y <= aabb.maxY && z >= aabb.minZ && z <= aabb.maxZ;
}

export function getActiveZone(x: number, y: number, z: number, zones: SurfaceZone[]): SurfaceZone | null {
  for (const zone of zones) {
    if (isInZone(x, y, z, zone)) return zone;
  }
  return null;
}

export function buildProceduralSurfaceZones(
  hasMarket: boolean,
  hasMine: boolean,
  poi: PoiPositions,
): SurfaceZone[] {
  const zones: SurfaceZone[] = [];

  if (hasMarket && poi.market) {
    const { x, z } = poi.market;
    zones.push({
      kind: 'market',
      label: 'Market',
      aabb: { minX: x - 2, maxX: x + 14, minY: 0, maxY: 12, minZ: z - 2, maxZ: z + 14 },
    });
  }

  if (hasMine && poi.mine) {
    const { x, z } = poi.mine;
    zones.push({
      kind: 'mine',
      label: 'Mine',
      aabb: {
        minX: x - PIT_RADIUS,
        maxX: x + PIT_RADIUS,
        minY: -20,
        maxY: 30,
        minZ: z - PIT_RADIUS,
        maxZ: z + PIT_RADIUS,
      },
    });
  }

  return zones;
}

/** @deprecated Use buildProceduralSurfaceZones */
export function buildSurfaceZones(
  hasMarket: boolean,
  hasMine: boolean,
): SurfaceZone[] {
  return buildProceduralSurfaceZones(hasMarket, hasMine, {
    market: hasMarket ? { x: 8, z: 8 } : null,
    mine: hasMine ? { x: -12, z: -10 } : null,
  });
}
