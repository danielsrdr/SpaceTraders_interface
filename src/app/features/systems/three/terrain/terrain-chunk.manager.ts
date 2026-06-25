import {
  BoxGeometry,
  BufferAttribute,
  CylinderGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
import { TerrainHeightField, WORLD_RADIUS } from './terrain-height';
import { createTerrainMaterial } from './terrain-material';

export const CHUNK_SIZE = 16;
export const LOAD_RADIUS = 3;
export const CHUNK_SEGMENTS = 32;

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export class TerrainChunkManager {
  readonly root = new Group();
  readonly material: ShaderMaterial;

  private readonly loadedChunks = new Map<string, Mesh>();
  private boundaryBuilt = false;

  constructor(private readonly heightField: TerrainHeightField) {
    this.material = createTerrainMaterial();
    this.root.name = 'terrain-chunks';
  }

  update(playerX: number, playerZ: number): void {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const needed = new Set<string>();

    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
      for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz++) {
        needed.add(chunkKey(pcx + dx, pcz + dz));
      }
    }

    for (const key of this.loadedChunks.keys()) {
      if (!needed.has(key)) {
        const mesh = this.loadedChunks.get(key)!;
        this.root.remove(mesh);
        mesh.geometry.dispose();
        this.loadedChunks.delete(key);
      }
    }

    for (const key of needed) {
      if (!this.loadedChunks.has(key)) {
        const [cx, cz] = key.split(',').map(Number);
        this.loadChunk(cx!, cz!);
      }
    }

    if (!this.boundaryBuilt) {
      this.buildBoundaryWall();
      this.boundaryBuilt = true;
    }
  }

  dispose(): void {
    for (const mesh of this.loadedChunks.values()) {
      mesh.geometry.dispose();
    }
    this.loadedChunks.clear();
    this.root.clear();
    this.material.dispose();
  }

  private loadChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    const geometry = new PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEGMENTS, CHUNK_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes['position'] as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = baseX + lx + CHUNK_SIZE / 2;
      const wz = baseZ + lz + CHUNK_SIZE / 2;
      const h = this.heightField.getHeight(wx, wz);
      pos.setY(i, h);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();

    const mesh = new Mesh(geometry, this.material);
    mesh.position.set(baseX + CHUNK_SIZE / 2, 0, baseZ + CHUNK_SIZE / 2);
    mesh.name = `terrain-chunk-${key}`;
    mesh.receiveShadow = true;
    mesh.castShadow = false;

    this.root.add(mesh);
    this.loadedChunks.set(key, mesh);
  }

  private buildBoundaryWall(): void {
    const wallMat = this.material.clone();
    const wall = new Mesh(
      new CylinderGeometry(WORLD_RADIUS + 2, WORLD_RADIUS + 4, 40, 48, 1, true),
      wallMat,
    );
    wall.position.y = 12;
    wall.name = 'terrain-boundary';
    wall.receiveShadow = true;
    this.root.add(wall);

    const floor = new Mesh(new BoxGeometry(WORLD_RADIUS * 2.2, 1, WORLD_RADIUS * 2.2), wallMat);
    floor.position.y = -2;
    floor.receiveShadow = true;
    this.root.add(floor);
  }
}

export function createTerrainChunkManager(heightField: TerrainHeightField): TerrainChunkManager {
  return new TerrainChunkManager(heightField);
}

export { WORLD_RADIUS };
