import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PointLight,
  Vector3,
} from 'three';
import { noise2d } from '../terrain/terrain-noise';

export const CAVE_DEPTH_OFFSET = 18;
export const CAVE_NETWORK_RADIUS = 22;

export type CaveBlockKind = 'stone' | 'crystal' | 'torch';

export interface CaveConfig {
  centerX: number;
  centerZ: number;
  floorY: number;
  seed: number;
}

export interface CrystalNode {
  key: string;
  instanceIndex: number;
  broken: boolean;
}

export interface BlockPick {
  x: number;
  y: number;
  z: number;
  key: string;
  isCrystal: boolean;
}

export interface BreakBlockResult {
  key: string;
  wasCrystal: boolean;
}

const BLOCK_SIZE = 1;
const HIDDEN_SCALE = 0.001;

function blockKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function parseKey(key: string): [number, number, number] {
  const parts = key.split(',').map(Number);
  return [parts[0]!, parts[1]!, parts[2]!];
}

export class CaveTunnelManager {
  readonly root = new Group();
  private readonly solids = new Set<string>();
  private readonly air = new Set<string>();
  private readonly crystalNodes = new Map<string, CrystalNode>();
  private readonly sharedGeometry = new BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  private readonly materials: Record<CaveBlockKind, MeshStandardMaterial>;
  private readonly hideMatrix = new Matrix4();
  private crystalMesh: InstancedMesh | null = null;
  private built = false;
  private brokenCount = 0;
  private totalCrystals = 0;

  constructor(readonly config: CaveConfig) {
    this.hideMatrix.makeScale(HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE);
    this.materials = {
      stone: new MeshStandardMaterial({ color: 0x44403c, flatShading: true }),
      crystal: new MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: new Color(0x0ea5e9),
        emissiveIntensity: 0.55,
        flatShading: true,
      }),
      torch: new MeshStandardMaterial({
        color: 0xa5f3fc,
        emissive: new Color(0x22d3ee),
        emissiveIntensity: 1.2,
        flatShading: true,
      }),
    };
    this.root.name = 'cave-tunnels';
  }

  ensureBuilt(): void {
    if (this.built) return;
    this.buildTunnels();
    this.built = true;
  }

  isSolidBlock(x: number, y: number, z: number): boolean {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);
    return this.solids.has(blockKey(fx, fy, fz));
  }

  isInNetworkBounds(x: number, z: number): boolean {
    const dx = x - this.config.centerX;
    const dz = z - this.config.centerZ;
    return Math.hypot(dx, dz) <= CAVE_NETWORK_RADIUS + 2;
  }

  getCrystalNodes(): readonly CrystalNode[] {
    return [...this.crystalNodes.values()];
  }

  getTotalCrystals(): number {
    return this.totalCrystals;
  }

  getNetworkProgress(): number {
    if (this.totalCrystals <= 0) return 0;
    return this.brokenCount / this.totalCrystals;
  }

  getInteriorSpawn(): { x: number; y: number; z: number; heading: number } {
    const { centerX, centerZ, floorY } = this.config;
    return {
      x: centerX,
      y: floorY + 1.8,
      z: centerZ + 2,
      heading: Math.PI,
    };
  }

  isNearExit(x: number, y: number, z: number): boolean {
    const spawn = this.getInteriorSpawn();
    return Math.hypot(x - spawn.x, z - spawn.z) < 2.5 && Math.abs(y - spawn.y) < 2;
  }

  applyBrokenKeys(keys: readonly string[]): void {
    this.ensureBuilt();
    for (const key of keys) {
      if (!this.solids.has(key)) continue;
      const node = this.crystalNodes.get(key);
      if (!node || node.broken) continue;
      this.breakBlockInternal(key, node, false);
    }
    this.brokenCount = keys.filter((k) => this.crystalNodes.get(k)?.broken).length;
  }

  pickBlock(origin: Vector3, direction: Vector3, maxDist = 4): BlockPick | null {
    this.ensureBuilt();
    const dir = direction.clone().normalize();
    const step = 0.2;
    for (let t = 0.4; t <= maxDist; t += step) {
      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;
      const fx = Math.floor(px);
      const fy = Math.floor(py);
      const fz = Math.floor(pz);
      const key = blockKey(fx, fy, fz);
      if (!this.solids.has(key)) continue;
      const node = this.crystalNodes.get(key);
      if (node?.broken) continue;
      return { x: fx, y: fy, z: fz, key, isCrystal: !!node };
    }
    return null;
  }

  breakBlock(x: number, y: number, z: number): BreakBlockResult | null {
    this.ensureBuilt();
    const key = blockKey(Math.floor(x), Math.floor(y), Math.floor(z));
    if (!this.solids.has(key)) return null;

    const node = this.crystalNodes.get(key);
    if (node?.broken) return null;

    const wasCrystal = !!node;
    this.breakBlockInternal(key, node ?? null, true);
    return { key, wasCrystal };
  }

  dispose(): void {
    this.root.clear();
    this.solids.clear();
    this.air.clear();
    this.crystalNodes.clear();
    this.crystalMesh = null;
    this.sharedGeometry.dispose();
    for (const mat of Object.values(this.materials)) {
      mat.dispose();
    }
  }

  private breakBlockInternal(key: string, node: CrystalNode | null, countProgress: boolean): void {
    this.solids.delete(key);
    if (node && !node.broken) {
      node.broken = true;
      if (this.crystalMesh) {
        this.crystalMesh.setMatrixAt(node.instanceIndex, this.hideMatrix);
        this.crystalMesh.instanceMatrix.needsUpdate = true;
      }
      if (countProgress) {
        this.brokenCount++;
      }
    }
  }

  private markAir(x: number, y: number, z: number): void {
    this.air.add(blockKey(x, y, z));
  }

  private carveBox(x0: number, y0: number, z0: number, w: number, h: number, d: number): void {
    for (let x = x0; x < x0 + w; x++) {
      for (let y = y0; y > y0 - h; y--) {
        for (let z = z0; z < z0 + d; z++) {
          this.markAir(x, y, z);
        }
      }
    }
  }

  private buildTunnels(): void {
    const { centerX, centerZ, floorY, seed } = this.config;

    // Entrance shaft + main gallery (horizontal emphasis).
    this.carveBox(centerX - 1, floorY + 1, centerZ, 3, 4, 4);
    this.carveBox(centerX - 1, floorY, centerZ - 14, 3, 4, 18);
    this.carveBox(centerX - 8, floorY - 1, centerZ - 8, 8, 3, 3);
    this.carveBox(centerX + 2, floorY - 2, centerZ - 12, 3, 3, 10);
    this.carveBox(centerX - 6, floorY - 3, centerZ - 16, 6, 3, 6);

    const branchCount = 2 + (Math.abs(seed >> 4) % 2);
    for (let i = 0; i < branchCount; i++) {
      const h = (seed * (i + 3)) | 0;
      const ox = (Math.abs(h) % 12) - 6;
      const oz = -6 - (Math.abs(h >> 3) % 10) - i * 3;
      const depth = floorY - 1 - (Math.abs(h >> 6) % 3);
      this.carveBox(centerX + ox, depth, centerZ + oz, 4, 3, 5 + (Math.abs(h >> 9) % 5));
    }

    const blockPositions: Record<CaveBlockKind, Array<[number, number, number]>> = {
      stone: [],
      crystal: [],
      torch: [],
    };

    const candidates = new Set<string>();
    for (const key of this.air) {
      const [ax, ay, az] = parseKey(key);
      const neighbors = [
        [ax + 1, ay, az],
        [ax - 1, ay, az],
        [ax, ay, az + 1],
        [ax, ay, az - 1],
        [ax, ay + 1, az],
        [ax, ay - 1, az],
      ];
      for (const [nx, ny, nz] of neighbors) {
        const nKey = blockKey(nx, ny, nz);
        if (!this.air.has(nKey)) {
          candidates.add(nKey);
        }
      }
    }

    for (const key of candidates) {
      const [x, y, z] = parseKey(key);
      const crystalNoise = noise2d(seed + 77, x * 0.5, z * 0.5);
      if (crystalNoise > 0.72 && y <= floorY - 1) {
        blockPositions.crystal.push([x, y, z]);
      } else {
        blockPositions.stone.push([x, y, z]);
      }
      this.solids.add(key);
    }

    const torchSpots: Array<[number, number, number]> = [
      [centerX - 2, floorY + 1, centerZ - 2],
      [centerX + 2, floorY, centerZ - 6],
      [centerX - 2, floorY - 1, centerZ - 10],
      [centerX - 7, floorY - 2, centerZ - 8],
      [centerX + 1, floorY - 2, centerZ - 14],
    ];
    for (const [tx, ty, tz] of torchSpots) {
      blockPositions.torch.push([tx, ty, tz]);
      const light = new PointLight(0x22d3ee, 1.1, 12);
      light.position.set(tx + 0.5, ty + 1, tz + 0.5);
      this.root.add(light);
    }

    const matrix = new Matrix4();
    for (const kind of Object.keys(blockPositions) as CaveBlockKind[]) {
      const positions = blockPositions[kind];
      if (!positions.length) continue;
      const mesh = new InstancedMesh(this.sharedGeometry, this.materials[kind], positions.length);
      mesh.name = `cave-${kind}`;
      for (let i = 0; i < positions.length; i++) {
        const [bx, by, bz] = positions[i]!;
        matrix.makeTranslation(bx + 0.5, by + 0.5, bz + 0.5);
        mesh.setMatrixAt(i, matrix);
        if (kind === 'crystal') {
          const key = blockKey(bx, by, bz);
          this.crystalNodes.set(key, { key, instanceIndex: i, broken: false });
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      if (kind === 'crystal') {
        this.crystalMesh = mesh;
      }
    }

    this.totalCrystals = this.crystalNodes.size;
  }
}

export function createCaveTunnelManager(
  centerX: number,
  centerZ: number,
  surfaceBaseY: number,
  seed: number,
): CaveTunnelManager | null {
  const floorY = surfaceBaseY - CAVE_DEPTH_OFFSET;
  return new CaveTunnelManager({ centerX, centerZ, floorY, seed: seed ^ 0xca7e });
}
