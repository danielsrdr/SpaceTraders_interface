import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
} from 'three';
import { PlanetView } from '../../../models/system.model';
import { createVoxelChunkManager, isSolidAt, VoxelChunkManager } from './voxel-chunk.manager';
import { SurfaceZone } from './surface-zones';

export type BlockKind = 'grass' | 'dirt' | 'stone' | 'wood' | 'sand' | 'bedrock';

export interface VoxelWorldResult {
  root: Group;
  chunkManager: VoxelChunkManager;
  zones: SurfaceZone[];
  spawn: { x: number; y: number; z: number };
}

export function buildVoxelWorld(planet: PlanetView): VoxelWorldResult {
  const chunkManager = createVoxelChunkManager(planet);
  chunkManager.update(0, 0);
  return {
    root: chunkManager.root,
    chunkManager,
    zones: chunkManager.zones,
    spawn: chunkManager.spawn,
  };
}

export function isSolidBlock(
  world: VoxelWorldResult | VoxelChunkManager,
  x: number,
  y: number,
  z: number,
): boolean {
  if (world instanceof VoxelChunkManager) {
    return world.isSolidBlock(x, y, z);
  }
  return isSolidAt(world.chunkManager, x, y, z);
}

export { BLOCK_SIZE, CHUNK_SIZE, WORLD_RADIUS, MAX_HEIGHT } from './voxel-chunk.manager';
