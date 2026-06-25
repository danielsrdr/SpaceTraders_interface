import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PointLight,
} from 'three';
import { noise2d } from '../terrain/terrain-noise';
import { PIT_FLOOR_Y, type MinePitConfig } from './mine-pit.builder';

export type TunnelBlockKind = 'stone' | 'ore' | 'rail' | 'torch';

const BLOCK_SIZE = 1;

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
  private readonly sharedGeometry = new BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  private readonly materials: Record<TunnelBlockKind, MeshStandardMaterial>;
  private built = false;

  constructor(
    private readonly pitConfig: MinePitConfig,
    private readonly seed: number,
  ) {
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

  dispose(): void {
    this.root.clear();
    this.solids.clear();
    this.air.clear();
    this.sharedGeometry.dispose();
    for (const mat of Object.values(this.materials)) {
      mat.dispose();
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

    // Entry shaft
    this.carveBox(centerX - 1, floorY, centerZ - 1, 3, 5, 3);

    // Main tunnel heading south
    this.carveBox(centerX - 1, floorY - 5, centerZ - 1, 3, 3, 18);

    // Side branches
    this.carveBox(centerX - 9, floorY - 8, centerZ + 4, 8, 3, 3);
    this.carveBox(centerX + 2, floorY - 10, centerZ + 8, 3, 3, 8);
    this.carveBox(centerX - 6, floorY - 12, centerZ + 12, 6, 3, 3);

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

    // Rails along main tunnel floor
    for (let z = centerZ; z <= centerZ + 16; z++) {
      if ((z - centerZ) % 2 === 0) {
        blockPositions.rail.push([centerX, floorY - 5, z]);
      }
    }

    // Torches
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
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
  }
}

export function createMineTunnelManager(
  pitConfig: MinePitConfig | null,
  seed: number,
): MineTunnelManager | null {
  if (!pitConfig) return null;
  return new MineTunnelManager(pitConfig, seed);
}
