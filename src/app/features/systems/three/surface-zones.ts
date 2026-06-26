import { SurfaceZoneKind } from './system-view-mode';
import type { PoiPositions } from './surface-poi';
import type { SurfacePoiDefinition } from './surface-poi-registry';
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

function zoneAabbForKind(kind: SurfaceZoneKind, x: number, z: number): Aabb {
  switch (kind) {
    case 'market':
      return { minX: x - 2, maxX: x + 14, minY: 0, maxY: 12, minZ: z - 2, maxZ: z + 14 };
    case 'mine':
      return {
        minX: x - PIT_RADIUS,
        maxX: x + PIT_RADIUS,
        minY: -20,
        maxY: 30,
        minZ: z - PIT_RADIUS,
        maxZ: z + PIT_RADIUS,
      };
    case 'shipyard':
      return { minX: x - 4, maxX: x + 16, minY: 0, maxY: 14, minZ: z - 4, maxZ: z + 16 };
    case 'ruins':
      return { minX: x - 8, maxX: x + 8, minY: 0, maxY: 12, minZ: z - 8, maxZ: z + 8 };
    case 'depot':
      return { minX: x - 6, maxX: x + 10, minY: 0, maxY: 10, minZ: z - 6, maxZ: z + 10 };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function buildSurfaceZones(pois: SurfacePoiDefinition[]): SurfaceZone[] {
  return pois.map((poi) => {
    const { x, z } = poi.position;
    return {
      kind: poi.kind,
      label: poi.label,
      aabb: zoneAabbForKind(poi.kind, x, z),
    };
  });
}

/** @deprecated Use buildSurfaceZones */
export function buildProceduralSurfaceZones(
  hasMarket: boolean,
  hasMine: boolean,
  poi: PoiPositions,
): SurfaceZone[] {
  const pois: SurfacePoiDefinition[] = [];
  if (hasMarket && poi.market) {
    pois.push({ kind: 'market', label: 'Market', position: poi.market, priority: 80 });
  }
  if (hasMine && poi.mine) {
    pois.push({ kind: 'mine', label: 'Mine', position: poi.mine, priority: 70 });
  }
  return buildSurfaceZones(pois);
}

/** @deprecated Use buildSurfaceZones */
export function buildSurfaceZonesLegacy(
  hasMarket: boolean,
  hasMine: boolean,
): SurfaceZone[] {
  return buildProceduralSurfaceZones(hasMarket, hasMine, {
    market: hasMarket ? { x: 8, z: 8 } : null,
    mine: hasMine ? { x: -12, z: -10 } : null,
    shipyard: null,
    ruins: null,
    depot: null,
  });
}
