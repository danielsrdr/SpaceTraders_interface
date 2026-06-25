import { InstancedMesh, Mesh, Object3D } from 'three';
import { TerrainHeightField, WORLD_RADIUS } from './terrain/terrain-height';
import { MineTunnelManager } from './mine/mine-tunnel.manager';

const PLAYER_RADIUS = 0.35;

export interface SurfaceCollision {
  getGroundHeight(x: number, z: number): number;
  isSolid(x: number, y: number, z: number): boolean;
}

export function createSurfaceCollision(
  heightField: TerrainHeightField,
  tunnels: MineTunnelManager | null,
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

      const ground = heightField.getHeight(x, z);
      const slopeProbe = heightField.getSlope(x, z);
      if (slopeProbe > 1.2 && y < ground + 1.5) {
        return true;
      }

      return false;
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
