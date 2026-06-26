import { InstancedMesh, Mesh, Object3D } from 'three';
import { TerrainHeightField, WORLD_RADIUS } from './terrain/terrain-height';
import { MineTunnelManager } from './mine/mine-tunnel.manager';
import type { CaveConfig, CaveTunnelManager } from './cave/cave-tunnel.manager';
import { createCaveTunnelManager } from './cave/cave-tunnel.manager';
import type { SurfaceColliderRegistry } from './surface-collider-registry';

const PLAYER_RADIUS = 0.35;

export interface SurfaceCollision {
  getGroundHeight(x: number, z: number): number;
  isSolid(x: number, y: number, z: number): boolean;
  /**
   * True when a vertical capsule body (`lowerY`..`upperY`) of `radius` at
   * `(x, z)` hits a registered collider. Callers pass `lowerY = feet + step`
   * so low, steppable obstacles do not block.
   */
  blocksCapsuleBody(
    x: number,
    z: number,
    radius: number,
    lowerY: number,
    upperY: number,
  ): boolean;
  /** Highest collider top no higher than `maxTopY` to stand on / step onto. */
  supportHeight(x: number, z: number, radius: number, maxTopY: number): number;
  /** Lowest collider base above `aboveY` to clamp the head against. */
  ceilingHeight(x: number, z: number, radius: number, aboveY: number): number;
}

export function createSurfaceCollision(
  heightField: TerrainHeightField,
  tunnels: MineTunnelManager | null,
  colliders: SurfaceColliderRegistry | null = null,
  caveTunnels: CaveTunnelManager | null = null,
): SurfaceCollision {
  return {
    getGroundHeight(x: number, z: number): number {
      return heightField.getHeight(x, z);
    },

    isSolid(x: number, y: number, z: number): boolean {
      const dist = Math.hypot(x, z);
      if (dist > WORLD_RADIUS + 1) {
        return y < heightField.getHeight(x, z) + 20;
      }

      if (tunnels && y < heightField.getPitFloorY() + 2) {
        if (tunnels.isSolidBlock(x, y, z)) return true;
      }

      if (caveTunnels && caveTunnels.isInNetworkBounds(x, z) && y < caveTunnels.config.floorY + 4) {
        if (caveTunnels.isSolidBlock(x, y, z)) return true;
      }

      const ground = heightField.getHeight(x, z);
      const slopeProbe = heightField.getSlope(x, z);
      if (slopeProbe > 1.2 && y < ground + 1.5) {
        return true;
      }

      return false;
    },

    blocksCapsuleBody(
      x: number,
      z: number,
      radius: number,
      lowerY: number,
      upperY: number,
    ): boolean {
      return colliders ? colliders.blocksBody(x, z, radius, lowerY, upperY) : false;
    },

    supportHeight(x: number, z: number, radius: number, maxTopY: number): number {
      return colliders ? colliders.maxSupportTop(x, z, radius, maxTopY) : -Infinity;
    },

    ceilingHeight(x: number, z: number, radius: number, aboveY: number): number {
      return colliders ? colliders.minCeilingBase(x, z, radius, aboveY) : Infinity;
    },
  };
}

/** Flat-floor collision for the underground cave interior view. */
export function createCaveInteriorCollision(caveTunnels: CaveTunnelManager): SurfaceCollision {
  const floorY = caveTunnels.config.floorY + 0.05;
  return {
    getGroundHeight(): number {
      return floorY;
    },

    isSolid(x: number, y: number, z: number): boolean {
      if (!caveTunnels.isInNetworkBounds(x, z)) {
        return y < floorY - 2;
      }
      return caveTunnels.isSolidBlock(x, y, z);
    },

    blocksCapsuleBody(): boolean {
      return false;
    },

    supportHeight(_x: number, _z: number, _radius: number, maxTopY: number): number {
      return maxTopY >= floorY ? floorY : -Infinity;
    },

    ceilingHeight(x: number, z: number, _radius: number, aboveY: number): number {
      for (let dy = 0; dy <= 4; dy++) {
        const testY = aboveY + dy;
        if (caveTunnels.isSolidBlock(x, testY, z)) {
          return testY;
        }
      }
      return Infinity;
    },
  };
}

/** Check if player would collide with steep terrain at footprint corners. */
export function isSteepTerrainBlocked(
  collision: SurfaceCollision,
  x: number,
  z: number,
  y: number,
): boolean {
  const offsets = [
    [PLAYER_RADIUS, 0],
    [-PLAYER_RADIUS, 0],
    [0, PLAYER_RADIUS],
    [0, -PLAYER_RADIUS],
  ];
  let maxGround = -Infinity;
  let minGround = Infinity;
  for (const [ox, oz] of offsets) {
    const h = collision.getGroundHeight(x + ox, z + oz);
    maxGround = Math.max(maxGround, h);
    minGround = Math.min(minGround, h);
  }
  return maxGround - minGround > 1.8 && y - 1.7 < maxGround;
}

export function disposeSurfaceWorld(root: Object3D): void {
  root.traverse((child) => {
    if (child instanceof Mesh || child instanceof InstancedMesh) {
      if (child.geometry) child.geometry.dispose();
    }
  });
}
