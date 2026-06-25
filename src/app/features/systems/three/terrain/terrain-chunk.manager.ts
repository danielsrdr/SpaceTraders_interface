import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  ShaderMaterial,
} from 'three';
import { TerrainHeightField, WORLD_RADIUS } from './terrain-height';
import { createTerrainMaterial } from './terrain-material';
import {
  buildChunkPositions,
  buildGridIndices,
  computeNormals,
} from './terrain-chunk-geometry';
import type { SurfacePoiConfig } from '../surface-poi';

export const CHUNK_SIZE = 16;
export const LOAD_RADIUS = 3;
export const CHUNK_SEGMENTS = 32;

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

interface ChunkReply {
  type: 'chunk';
  id: number;
  cx: number;
  cz: number;
  positions: Float32Array;
  normals: Float32Array;
}

/**
 * Streams height-field terrain chunks around the player. Heavy per-vertex noise
 * sampling and normal computation run in a WebWorker so the main thread never
 * freezes; geometry/material (which need WebGL) are built on arrival. A single
 * worker processes requests sequentially, which naturally throttles main-thread
 * geometry creation. When workers are unavailable it falls back to synchronous
 * generation.
 */
export class TerrainChunkManager {
  readonly root = new Group();
  readonly material: ShaderMaterial;

  private readonly loadedChunks = new Map<string, Mesh>();
  private readonly pending = new Set<string>();
  private currentNeeded = new Set<string>();
  private boundaryBuilt = false;

  private readonly indices: Uint32Array = buildGridIndices(CHUNK_SEGMENTS);
  private worker: Worker | null = null;
  private nextRequestId = 0;

  constructor(
    private readonly heightField: TerrainHeightField,
    poiConfig?: SurfacePoiConfig,
  ) {
    this.material = createTerrainMaterial();
    this.root.name = 'terrain-chunks';
    if (poiConfig) this.initWorker(poiConfig);
  }

  private initWorker(poiConfig: SurfacePoiConfig): void {
    try {
      this.worker = new Worker(new URL('./terrain.worker', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<ChunkReply>) => this.onChunkReady(event.data);
      this.worker.postMessage({
        type: 'init',
        config: poiConfig,
        chunkSize: CHUNK_SIZE,
        segments: CHUNK_SEGMENTS,
      });
    } catch {
      // Worker unsupported (e.g. SSR) — fall back to synchronous generation.
      this.worker = null;
    }
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
    this.currentNeeded = needed;

    for (const key of this.loadedChunks.keys()) {
      if (!needed.has(key)) {
        const mesh = this.loadedChunks.get(key)!;
        this.root.remove(mesh);
        mesh.geometry.dispose();
        this.loadedChunks.delete(key);
      }
    }

    for (const key of needed) {
      if (this.loadedChunks.has(key) || this.pending.has(key)) continue;
      const [cx, cz] = key.split(',').map(Number);
      this.requestChunk(cx!, cz!);
    }

    if (!this.boundaryBuilt) {
      this.buildBoundaryWall();
      this.boundaryBuilt = true;
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const mesh of this.loadedChunks.values()) {
      mesh.geometry.dispose();
    }
    this.loadedChunks.clear();
    this.pending.clear();
    this.root.clear();
    this.material.dispose();
  }

  private requestChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (this.worker) {
      this.pending.add(key);
      this.worker.postMessage({ type: 'chunk', id: this.nextRequestId++, cx, cz });
    } else {
      const positions = buildChunkPositions(
        (x, z) => this.heightField.getHeight(x, z),
        cx,
        cz,
        CHUNK_SIZE,
        CHUNK_SEGMENTS,
      );
      const normals = computeNormals(positions, this.indices);
      this.buildChunkMesh(cx, cz, positions, normals);
    }
  }

  private onChunkReady(reply: ChunkReply): void {
    const key = chunkKey(reply.cx, reply.cz);
    this.pending.delete(key);
    // Drop stale chunks the player has already moved away from.
    if (!this.currentNeeded.has(key) || this.loadedChunks.has(key)) return;
    this.buildChunkMesh(reply.cx, reply.cz, reply.positions, reply.normals);
  }

  private buildChunkMesh(
    cx: number,
    cz: number,
    positions: Float32Array,
    normals: Float32Array,
  ): void {
    const key = chunkKey(cx, cz);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setIndex(new BufferAttribute(new Uint32Array(this.indices), 1));

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

export function createTerrainChunkManager(
  heightField: TerrainHeightField,
  poiConfig?: SurfacePoiConfig,
): TerrainChunkManager {
  return new TerrainChunkManager(heightField, poiConfig);
}

export { WORLD_RADIUS };
