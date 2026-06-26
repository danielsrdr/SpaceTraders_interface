import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Vector3,
} from 'three';
import { noise2d } from '../terrain/terrain-noise';
import { PIT_FLOOR_Y, type MinePitConfig } from './mine-pit.builder';

export type TunnelBlockKind = 'stone' | 'ore' | 'rail' | 'torch';

export interface OreNode {
  key: string;
  instanceIndex: number;
  broken: boolean;
}

export interface BlockPick {
  x: number;
  y: number;
  z: number;
  key: string;
  isOre: boolean;
}

export interface BreakBlockResult {
  key: string;
  wasOre: boolean;
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

export class MineTunnelManager {
  readonly root = new Group();
  private readonly solids = new Set<string>();
  private readonly air = new Set<string>();
  private readonly oreNodes = new Map<string, OreNode>();
  private readonly sharedGeometry = new BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  private readonly materials: Record<TunnelBlockKind, MeshStandardMaterial>;
  private readonly hideMatrix = new Matrix4();
  private oreMesh: InstancedMesh | null = null;
  private built = false;
  private brokenCount = 0;
  private totalOres = 0;
  private nightVeinBoost = false;

  constructor(
    readonly pitConfig: MinePitConfig,
    private readonly seed: number,
    private readonly depositSymbols: string[] = [],
  ) {
    this.hideMatrix.makeScale(HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE);
    this.materials = {
      stone: new MeshStandardMaterial({ color: 0x57534e, flatShading: true }),
      ore: new MeshStandardMaterial({
        color: 0xb45309,
        emissive: new Color(0x92400e),
        emissiveIntensity: 0.35,
        flatShading: true,
      }),
      rail: new MeshStandardMaterial({ color: 0x78716c, metalness: 0.6, flatShading: true }),
      torch: new MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: new Color(0xf59e0b),
        emissiveIntensity: 1.4,
        flatShading: true,
      }),
    };
    this.root.name = 'mine-tunnels';
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

  getOreNodes(): readonly OreNode[] {
    return [...this.oreNodes.values()];
  }

  getTotalOres(): number {
    return this.totalOres;
  }

  getNetworkProgress(): number {
    if (this.totalOres <= 0) return 0;
    return this.brokenCount / this.totalOres;
  }

  getRailBounds(): { centerX: number; floorY: number; zStart: number; zEnd: number } {
    const { centerX, centerZ } = this.pitConfig;
    return {
      centerX,
      floorY: PIT_FLOOR_Y - 5,
      zStart: centerZ,
      zEnd: centerZ + 16,
    };
  }

  setNightVeinBoost(active: boolean): void {
    this.nightVeinBoost = active;
    this.materials.ore.emissiveIntensity = active ? 0.85 : 0.35;
  }

  applyBrokenKeys(keys: readonly string[]): void {
    this.ensureBuilt();
    for (const key of keys) {
      if (!this.solids.has(key)) continue;
      const node = this.oreNodes.get(key);
      if (!node || node.broken) continue;
      this.breakBlockInternal(key, node, false);
    }
    this.brokenCount = keys.filter((k) => this.oreNodes.get(k)?.broken).length;
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
      const node = this.oreNodes.get(key);
      if (node?.broken) continue;
      return { x: fx, y: fy, z: fz, key, isOre: !!node };
    }
    return null;
  }

  breakBlock(x: number, y: number, z: number): BreakBlockResult | null {
    this.ensureBuilt();
    const key = blockKey(Math.floor(x), Math.floor(y), Math.floor(z));
    if (!this.solids.has(key)) return null;

    const node = this.oreNodes.get(key);
    if (node?.broken) return null;

    const wasOre = !!node;
    this.breakBlockInternal(key, node ?? null, true);
    return { key, wasOre };
  }

  dispose(): void {
    this.root.clear();
    this.solids.clear();
    this.air.clear();
    this.oreNodes.clear();
    this.oreMesh = null;
    this.sharedGeometry.dispose();
    for (const mat of Object.values(this.materials)) {
      mat.dispose();
    }
  }

  private breakBlockInternal(key: string, node: OreNode | null, countProgress: boolean): void {
    this.solids.delete(key);
    if (node && !node.broken) {
      node.broken = true;
      if (this.oreMesh) {
        this.oreMesh.setMatrixAt(node.instanceIndex, this.hideMatrix);
        this.oreMesh.instanceMatrix.needsUpdate = true;
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
    const { centerX, centerZ } = this.pitConfig;
    const floorY = PIT_FLOOR_Y;

    this.carveBox(centerX - 1, floorY, centerZ - 1, 3, 5, 3);
    this.carveBox(centerX - 1, floorY - 5, centerZ - 1, 3, 3, 18);
    this.carveBox(centerX - 9, floorY - 8, centerZ + 4, 8, 3, 3);
    this.carveBox(centerX + 2, floorY - 10, centerZ + 8, 3, 3, 8);
    this.carveBox(centerX - 6, floorY - 12, centerZ + 12, 6, 3, 3);

    for (let i = 0; i < this.depositSymbols.length; i++) {
      let h = this.seed;
      const sym = this.depositSymbols[i] ?? '';
      for (let c = 0; c < sym.length; c++) {
        h = (h * 31 + sym.charCodeAt(c)) | 0;
      }
      const ox = (Math.abs(h) % 10) - 5;
      const oz = (Math.abs(h >> 4) % 12) + 6 + i * 2;
      const depth = floorY - 8 - (Math.abs(h >> 8) % 6);
      this.carveBox(centerX + ox, depth, centerZ + oz, 3, 3, 5 + (Math.abs(h >> 12) % 4));
    }

    const blockPositions: Record<TunnelBlockKind, Array<[number, number, number]>> = {
      stone: [],
      ore: [],
      rail: [],
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
      const oreNoise = noise2d(this.seed + 42, x * 0.45, z * 0.45);
      if (oreNoise > 0.78 && y < floorY - 6) {
        blockPositions.ore.push([x, y, z]);
      } else {
        blockPositions.stone.push([x, y, z]);
      }
      this.solids.add(key);
    }

    for (let z = centerZ; z <= centerZ + 16; z++) {
      if ((z - centerZ) % 2 === 0) {
        blockPositions.rail.push([centerX, floorY - 5, z]);
      }
    }

    const torchSpots: Array<[number, number, number]> = [
      [centerX - 2, floorY - 4, centerZ + 2],
      [centerX + 2, floorY - 6, centerZ + 6],
      [centerX - 2, floorY - 8, centerZ + 10],
      [centerX - 8, floorY - 9, centerZ + 5],
    ];
    for (const [tx, ty, tz] of torchSpots) {
      blockPositions.torch.push([tx, ty, tz]);
      const light = new PointLight(0xf59e0b, 1.2, 10);
      light.position.set(tx + 0.5, ty + 1, tz + 0.5);
      this.root.add(light);
    }

    const matrix = new Matrix4();
    for (const kind of Object.keys(blockPositions) as TunnelBlockKind[]) {
      const positions = blockPositions[kind];
      if (!positions.length) continue;
      const mesh = new InstancedMesh(this.sharedGeometry, this.materials[kind], positions.length);
      mesh.name = `tunnel-${kind}`;
      for (let i = 0; i < positions.length; i++) {
        const [bx, by, bz] = positions[i]!;
        matrix.makeTranslation(bx + 0.5, by + 0.5, bz + 0.5);
        mesh.setMatrixAt(i, matrix);
        if (kind === 'ore') {
          const key = blockKey(bx, by, bz);
          this.oreNodes.set(key, { key, instanceIndex: i, broken: false });
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      if (kind === 'ore') {
        this.oreMesh = mesh;
      }
    }

    this.totalOres = this.oreNodes.size;
  }
}

export function createMineTunnelManager(
  pitConfig: MinePitConfig | null,
  seed: number,
  depositSymbols: string[] = [],
): MineTunnelManager | null {
  if (!pitConfig) return null;
  return new MineTunnelManager(pitConfig, seed, depositSymbols);
}
