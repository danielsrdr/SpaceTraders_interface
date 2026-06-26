/**
 * Lightweight spatial-hash registry of solid colliders on the planet surface.
 *
 * Props, rocks and buildings are generated procedurally, so instead of
 * raycasting the scene we emit one cheap collider per object at world-build
 * time and bucket them into a 2D grid keyed by `cx,cz`. Movement queries then
 * only test the handful of colliders in the cells around the player (O(1) on
 * average), which keeps collision affordable in the browser.
 *
 * Colliders carry a vertical extent (`baseY`..`topY`) so the FPS controller can
 * resolve a capsule sweep: body blocking, step-up onto low obstacles, and
 * ceiling clamping.
 */

export type SurfaceCollider =
  | {
      kind: 'box';
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      baseY: number;
      topY: number;
    }
  | {
      kind: 'cylinder';
      x: number;
      z: number;
      radius: number;
      baseY: number;
      topY: number;
    };

export interface ColliderFootprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const COLLIDER_CELL_SIZE = 8;

function cellKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

/** XZ bounding rectangle of a collider, used for spatial bucketing. */
export function colliderFootprint(collider: SurfaceCollider): ColliderFootprint {
  switch (collider.kind) {
    case 'box':
      return {
        minX: collider.minX,
        maxX: collider.maxX,
        minZ: collider.minZ,
        maxZ: collider.maxZ,
      };
    case 'cylinder':
      return {
        minX: collider.x - collider.radius,
        maxX: collider.x + collider.radius,
        minZ: collider.z - collider.radius,
        maxZ: collider.z + collider.radius,
      };
    default: {
      const _exhaustive: never = collider;
      return _exhaustive;
    }
  }
}

/** True when a disc of `radius` centered at `(x, z)` overlaps the collider in XZ. */
export function horizontalOverlap(
  collider: SurfaceCollider,
  x: number,
  z: number,
  radius: number,
): boolean {
  switch (collider.kind) {
    case 'box': {
      const nearestX = Math.max(collider.minX, Math.min(x, collider.maxX));
      const nearestZ = Math.max(collider.minZ, Math.min(z, collider.maxZ));
      const dx = x - nearestX;
      const dz = z - nearestZ;
      return dx * dx + dz * dz <= radius * radius;
    }
    case 'cylinder': {
      const dx = x - collider.x;
      const dz = z - collider.z;
      const reach = radius + collider.radius;
      return dx * dx + dz * dz <= reach * reach;
    }
    default: {
      const _exhaustive: never = collider;
      return _exhaustive;
    }
  }
}

export class SurfaceColliderRegistry {
  private readonly cells = new Map<string, SurfaceCollider[]>();
  private readonly byTag = new Map<string, SurfaceCollider[]>();

  /** Register a collider, bucketed into every grid cell its footprint touches. */
  add(collider: SurfaceCollider, tag = 'static'): void {
    const tagged = this.byTag.get(tag);
    if (tagged) tagged.push(collider);
    else this.byTag.set(tag, [collider]);

    this.forEachFootprintCell(collider, (key) => {
      const cell = this.cells.get(key);
      if (cell) cell.push(collider);
      else this.cells.set(key, [collider]);
    });
  }

  /** Remove every collider previously added under `tag` (e.g. on market rebuild). */
  removeTag(tag: string): void {
    const tagged = this.byTag.get(tag);
    if (!tagged) return;

    const removing = new Set(tagged);
    const affected = new Set<string>();
    for (const collider of tagged) {
      this.forEachFootprintCell(collider, (key) => affected.add(key));
    }
    for (const key of affected) {
      const cell = this.cells.get(key);
      if (!cell) continue;
      const kept = cell.filter((c) => !removing.has(c));
      if (kept.length) this.cells.set(key, kept);
      else this.cells.delete(key);
    }
    this.byTag.delete(tag);
  }

  /** Candidate colliders whose cells fall within `radius` of `(x, z)`. */
  queryNear(x: number, z: number, radius: number): SurfaceCollider[] {
    const minCx = Math.floor((x - radius) / COLLIDER_CELL_SIZE);
    const maxCx = Math.floor((x + radius) / COLLIDER_CELL_SIZE);
    const minCz = Math.floor((z - radius) / COLLIDER_CELL_SIZE);
    const maxCz = Math.floor((z + radius) / COLLIDER_CELL_SIZE);

    const result: SurfaceCollider[] = [];
    const seen = new Set<SurfaceCollider>();
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const cell = this.cells.get(cellKey(cx, cz));
        if (!cell) continue;
        for (const collider of cell) {
          if (seen.has(collider)) continue;
          seen.add(collider);
          result.push(collider);
        }
      }
    }
    return result;
  }

  /**
   * True when a vertical capsule body (`lowerY`..`upperY`) of `radius` centered
   * at `(x, z)` intersects any collider. Pass `lowerY = feet + stepHeight` so
   * low, steppable obstacles are not treated as body blockers.
   */
  blocksBody(x: number, z: number, radius: number, lowerY: number, upperY: number): boolean {
    for (const collider of this.queryNear(x, z, radius)) {
      if (!horizontalOverlap(collider, x, z, radius)) continue;
      if (collider.topY > lowerY && collider.baseY < upperY) return true;
    }
    return false;
  }

  /**
   * Highest collider top under the footprint that is no higher than `maxTopY`
   * (used to stand on / step up onto obstacles). Returns `-Infinity` if none.
   */
  maxSupportTop(x: number, z: number, radius: number, maxTopY: number): number {
    let best = -Infinity;
    for (const collider of this.queryNear(x, z, radius)) {
      if (!horizontalOverlap(collider, x, z, radius)) continue;
      if (collider.topY <= maxTopY && collider.topY > best) best = collider.topY;
    }
    return best;
  }

  /**
   * Lowest collider base above `aboveY` under the footprint (used to clamp the
   * head when jumping). Returns `+Infinity` if none.
   */
  minCeilingBase(x: number, z: number, radius: number, aboveY: number): number {
    let best = Infinity;
    for (const collider of this.queryNear(x, z, radius)) {
      if (!horizontalOverlap(collider, x, z, radius)) continue;
      if (collider.baseY >= aboveY && collider.baseY < best) best = collider.baseY;
    }
    return best;
  }

  private forEachFootprintCell(collider: SurfaceCollider, fn: (key: string) => void): void {
    const footprint = colliderFootprint(collider);
    const minCx = Math.floor(footprint.minX / COLLIDER_CELL_SIZE);
    const maxCx = Math.floor(footprint.maxX / COLLIDER_CELL_SIZE);
    const minCz = Math.floor(footprint.minZ / COLLIDER_CELL_SIZE);
    const maxCz = Math.floor(footprint.maxZ / COLLIDER_CELL_SIZE);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        fn(cellKey(cx, cz));
      }
    }
  }
}

export function createSurfaceColliderRegistry(): SurfaceColliderRegistry {
  return new SurfaceColliderRegistry();
}
