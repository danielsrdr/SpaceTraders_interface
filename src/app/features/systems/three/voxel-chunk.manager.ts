import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
} from 'three';
import { PlanetView, hasTrait } from '../../../models/system.model';
import {
  isAsteroidWaypoint,
  isGasGiantWaypoint,
  resolveWaypointType,
} from '../planet-helpers';
import { buildMarketStructuresAt, buildMineStructuresAt } from './zone-buildings.builder';
import { buildProceduralSurfaceZones, SurfaceZone } from './surface-zones';

export type BlockKind = 'grass' | 'dirt' | 'stone' | 'wood' | 'sand' | 'bedrock';

export const CHUNK_SIZE = 16;
export const LOAD_RADIUS = 3;
export const WORLD_RADIUS = 128;
export const MAX_HEIGHT = 24;
export const BLOCK_SIZE = 1;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function noise2d(seed: number, x: number, z: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

function blockKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

type Biome = 'jungle' | 'industrial' | 'desert' | 'rocky' | 'sand';

export interface PoiPositions {
  market: { x: number; z: number } | null;
  mine: { x: number; z: number } | null;
  shipyard: { x: number; z: number } | null;
  ruins: { x: number; z: number } | null;
  depot: { x: number; z: number } | null;
}

export class VoxelChunkManager {
  readonly root = new Group();
  readonly spawn: { x: number; y: number; z: number };
  readonly zones: SurfaceZone[];

  private readonly seed: number;
  private readonly isAsteroid: boolean;
  private readonly isGas: boolean;
  private readonly hasMarket: boolean;
  private readonly hasMine: boolean;
  private readonly poi: PoiPositions;
  private readonly loadedChunks = new Map<string, Group>();
  private readonly solidByChunk = new Map<string, Set<string>>();
  private readonly sharedGeometry = new BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  private readonly materials: Record<BlockKind, MeshStandardMaterial>;
  private poiBuilt = false;

  constructor(planet: PlanetView) {
    this.seed = hashString(planet.name);
    this.isAsteroid = isAsteroidWaypoint(planet);
    this.isGas = isGasGiantWaypoint(planet);
    this.hasMarket = hasTrait(planet, 'MARKETPLACE');
    this.hasMine =
      this.isAsteroid ||
      this.isGas ||
      hasTrait(planet, 'MINERAL_DEPOSITS') ||
      resolveWaypointType(planet.type) === 'PLANET';

    const surfaceY = this.getSurfaceHeight(0, 0);
    this.spawn = { x: 0, y: surfaceY + 2, z: 0 };

    this.poi = {
      market: this.hasMarket
        ? { x: 8 + (this.seed % 6), z: 8 + ((this.seed >> 3) % 6) }
        : null,
      mine: this.hasMine
        ? { x: -12 - ((this.seed >> 6) % 8), z: -10 - ((this.seed >> 10) % 8) }
        : null,
      shipyard: null,
      ruins: null,
      depot: null,
    };

    this.zones = buildProceduralSurfaceZones(this.hasMarket, this.hasMine, this.poi);

    this.materials = {
      grass: new MeshStandardMaterial({ color: 0x4ade80, flatShading: true }),
      dirt: new MeshStandardMaterial({ color: 0x92400e, flatShading: true }),
      stone: new MeshStandardMaterial({ color: 0x64748b, flatShading: true }),
      wood: new MeshStandardMaterial({ color: 0x78350f, flatShading: true }),
      sand: new MeshStandardMaterial({ color: 0xd4a574, flatShading: true }),
      bedrock: new MeshStandardMaterial({ color: 0x1e293b, flatShading: true }),
    };

    this.root.name = 'voxel-chunk-world';
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
        const group = this.loadedChunks.get(key)!;
        this.root.remove(group);
        group.clear();
        this.loadedChunks.delete(key);
        this.solidByChunk.delete(key);
      }
    }

    for (const key of needed) {
      if (!this.loadedChunks.has(key)) {
        const [cx, cz] = key.split(',').map(Number);
        this.loadChunk(cx!, cz!);
      }
    }

    if (!this.poiBuilt) {
      this.buildPoiStructures();
      this.poiBuilt = true;
    }
  }

  isSolidBlock(x: number, y: number, z: number): boolean {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);

    if (this.isBarrierColumn(fx, fz)) {
      return fy >= 0 && fy <= MAX_HEIGHT;
    }

    const cx = Math.floor(fx / CHUNK_SIZE);
    const cz = Math.floor(fz / CHUNK_SIZE);
    const solids = this.solidByChunk.get(chunkKey(cx, cz));
    if (!solids) return false;
    return solids.has(blockKey(fx, fy, fz));
  }

  dispose(): void {
    this.root.clear();
    this.loadedChunks.clear();
    this.solidByChunk.clear();
    this.sharedGeometry.dispose();
    for (const mat of Object.values(this.materials)) {
      mat.dispose();
    }
  }

  private buildPoiStructures(): void {
    if (this.poi.market) {
      this.root.add(buildMarketStructuresAt(this.poi.market.x, this.poi.market.z).group);
    }
    if (this.poi.mine) {
      this.root.add(buildMineStructuresAt(this.poi.mine.x, this.poi.mine.z));
    }
  }

  private isMineAir(x: number, y: number, z: number): boolean {
    if (!this.poi.mine) return false;
    const { x: mx, z: mz } = this.poi.mine;
    if (x >= mx - 2 && x <= mx + 2 && z >= mz - 2 && z <= mz + 2 && y >= 1 && y <= 4) {
      return true;
    }
    if ((x === mx || x === mx + 1) && z === mz && y >= 0 && y <= 4) {
      return true;
    }
    return false;
  }

  private isBarrierColumn(x: number, z: number): boolean {
    const dist = Math.hypot(x, z);
    return dist > WORLD_RADIUS;
  }

  private loadChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    const group = new Group();
    group.name = `chunk-${key}`;
    const solids = new Set<string>();
    const blockPositions: Record<BlockKind, Array<[number, number, number]>> = {
      grass: [],
      dirt: [],
      stone: [],
      wood: [],
      sand: [],
      bedrock: [],
    };

    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;

        if (this.isBarrierColumn(wx, wz)) {
          for (let y = 0; y <= MAX_HEIGHT; y++) {
            blockPositions.bedrock.push([wx, y, wz]);
            solids.add(blockKey(wx, y, wz));
          }
          continue;
        }

        const surfaceY = this.getSurfaceHeight(wx, wz);
        const biome = this.getBiome(wx, wz);

        for (let y = 0; y <= surfaceY; y++) {
          if (this.isMineAir(wx, y, wz)) continue;
          const kind = this.blockKindForColumn(y, surfaceY, biome);
          blockPositions[kind].push([wx, y, wz]);
          solids.add(blockKey(wx, y, wz));
        }

        if (biome === 'jungle' && this.shouldPlaceTree(wx, wz)) {
          const treeH = 3 + Math.floor(noise2d(this.seed + 99, wx, wz) * 3);
          for (let ty = 1; ty <= treeH; ty++) {
            blockPositions.wood.push([wx, surfaceY + ty, wz]);
            solids.add(blockKey(wx, surfaceY + ty, wz));
          }
          blockPositions.grass.push([wx, surfaceY + treeH + 1, wz]);
          solids.add(blockKey(wx, surfaceY + treeH + 1, wz));
        }
      }
    }

    const matrix = new Matrix4();
    for (const kind of Object.keys(blockPositions) as BlockKind[]) {
      const positions = blockPositions[kind];
      if (!positions.length) continue;
      const mesh = new InstancedMesh(this.sharedGeometry, this.materials[kind], positions.length);
      mesh.name = `blocks-${kind}-${key}`;
      for (let i = 0; i < positions.length; i++) {
        const [x, y, z] = positions[i]!;
        matrix.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }

    this.root.add(group);
    this.loadedChunks.set(key, group);
    this.solidByChunk.set(key, solids);
  }

  private getSurfaceHeight(x: number, z: number): number {
    const h =
      3 +
      noise2d(this.seed, x * 0.08, z * 0.08) * 5 +
      noise2d(this.seed + 1, x * 0.25, z * 0.25) * 2 +
      noise2d(this.seed + 2, x * 0.5, z * 0.5) * 1 +
      (this.isAsteroid ? 1 : 0);
    return Math.min(Math.floor(h), MAX_HEIGHT - 3);
  }

  private getBiome(x: number, z: number): Biome {
    if (this.isGas) return 'sand';
    if (this.isAsteroid) return 'rocky';
    const n = noise2d(this.seed + 5, x * 0.03, z * 0.03);
    if (n > 0.65) return 'jungle';
    if (n > 0.45) return 'industrial';
    if (n > 0.25) return 'desert';
    return 'rocky';
  }

  private blockKindForColumn(y: number, surfaceY: number, biome: Biome): BlockKind {
    if (y === surfaceY) {
      switch (biome) {
        case 'sand':
          return 'sand';
        case 'rocky':
        case 'industrial':
          return 'stone';
        case 'desert':
          return 'sand';
        case 'jungle':
          return 'grass';
        default: {
          const _exhaustive: never = biome;
          return _exhaustive;
        }
      }
    }
    if (y >= surfaceY - 2) {
      return biome === 'sand' || biome === 'desert' ? 'sand' : 'dirt';
    }
    return 'stone';
  }

  private shouldPlaceTree(x: number, z: number): boolean {
    if (this.isGas || this.isAsteroid) return false;
    const n = noise2d(this.seed + 77, x * 0.7, z * 0.7);
    return n > 0.82;
  }
}

export function createVoxelChunkManager(planet: PlanetView): VoxelChunkManager {
  return new VoxelChunkManager(planet);
}

export function isSolidAt(manager: VoxelChunkManager, x: number, y: number, z: number): boolean {
  return manager.isSolidBlock(x, y, z);
}

export { hashString, noise2d, blockKey };
