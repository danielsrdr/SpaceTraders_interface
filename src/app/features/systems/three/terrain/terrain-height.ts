import { fbm2d, noise2d } from './terrain-noise';
import { PIT_FLOOR_Y, PIT_RADIUS, sampleMarketPadHeight, samplePitHeight, type MinePitConfig } from '../mine/mine-pit.builder';
import type { SurfacePoiConfig } from '../surface-poi';

export type BiomeKind = 'jungle' | 'industrial' | 'desert' | 'rocky' | 'sand';

export interface BiomeWeights {
  sand: number;
  rock: number;
  grass: number;
}

export const WORLD_RADIUS = 128;
export const MAX_TERRAIN_HEIGHT = 30;

export class TerrainHeightField {
  private readonly pitConfig: MinePitConfig | null;

  constructor(
    private readonly config: SurfacePoiConfig,
    pitCenter: { x: number; z: number } | null,
  ) {
    this.pitConfig = pitCenter
      ? { centerX: pitCenter.x, centerZ: pitCenter.z, seed: config.seed }
      : null;
  }

  getBiome(x: number, z: number): BiomeKind {
    if (this.config.isGas) return 'sand';
    if (this.config.isAsteroid) return 'rocky';

    const n = noise2d(this.config.seed + 5, x * 0.03, z * 0.03);
    const bias = this.config.profile.biomeBias;

    const scores: Record<BiomeKind, number> = {
      jungle: (n > 0.65 ? n : 0) + (bias.jungle ?? 0),
      industrial: (n > 0.45 && n <= 0.65 ? n : 0) + (bias.industrial ?? 0),
      desert: (n > 0.25 && n <= 0.45 ? n : 0) + (bias.desert ?? 0),
      rocky: (n <= 0.25 ? 1 - n : 0) + (bias.rocky ?? 0),
      sand: bias.sand ?? 0,
    };

    let best: BiomeKind = 'rocky';
    let bestScore = -Infinity;
    for (const kind of ['jungle', 'industrial', 'desert', 'rocky', 'sand'] as BiomeKind[]) {
      if (scores[kind] > bestScore) {
        bestScore = scores[kind];
        best = kind;
      }
    }
    return best;
  }

  getBiomeWeights(x: number, z: number): BiomeWeights {
    const biome = this.getBiome(x, z);
    switch (biome) {
      case 'sand':
      case 'desert':
        return { sand: 1, rock: 0.15, grass: 0 };
      case 'rocky':
      case 'industrial':
        return { sand: 0.2, rock: 1, grass: 0.05 };
      case 'jungle':
        return { sand: 0.05, rock: 0.2, grass: 1 };
      default: {
        const _exhaustive: never = biome;
        return _exhaustive;
      }
    }
  }

  getBaseHeight(x: number, z: number): number {
    const { seed, isGas, isAsteroid } = this.config;

    if (isGas) {
      const plateau = fbm2d(seed, x * 0.04, z * 0.04, 3);
      const island = Math.max(0, 1 - Math.hypot(x, z) / 80);
      return 4 + plateau * 6 * island;
    }

    if (isAsteroid) {
      const jagged =
        fbm2d(seed, x * 0.12, z * 0.12, 4, 2.2, 0.55) * 12 +
        fbm2d(seed + 11, x * 0.35, z * 0.35, 2) * 4;
      return 6 + jagged;
    }

    const biome = this.getBiome(x, z);
    let h = 5;

    switch (biome) {
      case 'desert':
      case 'sand':
        h +=
          fbm2d(seed, x * 0.025, z * 0.025, 4) * 18 +
          fbm2d(seed + 1, x * 0.08, z * 0.08, 2) * 5;
        break;
      case 'rocky':
      case 'industrial':
        h +=
          fbm2d(seed + 2, x * 0.05, z * 0.05, 4, 2.1, 0.48) * 14 +
          Math.abs(fbm2d(seed + 3, x * 0.15, z * 0.15, 2)) * 6;
        break;
      case 'jungle':
        h += fbm2d(seed + 4, x * 0.04, z * 0.04, 3) * 10 + fbm2d(seed + 5, x * 0.1, z * 0.1, 2) * 3;
        break;
      default: {
        const _exhaustive: never = biome;
        return _exhaustive;
      }
    }

    return Math.min(Math.max(h, 1), MAX_TERRAIN_HEIGHT);
  }

  getHeight(x: number, z: number): number {
    const dist = Math.hypot(x, z);
    if (dist > WORLD_RADIUS) {
      return MAX_TERRAIN_HEIGHT + 8;
    }

    let h = this.getBaseHeight(x, z);

    if (this.pitConfig) {
      const pitH = samplePitHeight(x, z, this.pitConfig, h);
      if (pitH !== null) h = pitH;
    }

    if (this.config.poi.market) {
      const { x: mx, z: mz } = this.config.poi.market;
      const padH = sampleMarketPadHeight(x, z, mx, mz, h);
      if (padH !== null) h = padH;
    }

    return h;
  }

  getSlope(x: number, z: number): number {
    const e = 0.5;
    const h = this.getHeight(x, z);
    const hx = this.getHeight(x + e, z) - h;
    const hz = this.getHeight(x, z + e) - h;
    return Math.hypot(hx, hz) / e;
  }

  getSpawn(): { x: number; y: number; z: number } {
    const { seed, poi, hasMine, hasMarket } = this.config;

    if (hasMine && this.pitConfig) {
      const angle = ((seed % 360) * Math.PI) / 180;
      const rimDist = PIT_RADIUS * 0.92;
      const x = this.pitConfig.centerX + Math.cos(angle) * rimDist;
      const z = this.pitConfig.centerZ + Math.sin(angle) * rimDist;
      const y = this.getHeight(x, z) + 2;
      return { x, y, z };
    }

    if (hasMarket && poi.market) {
      const { x: mx, z: mz } = poi.market;
      const angle = (((seed >> 4) % 360) * Math.PI) / 180;
      const x = mx + Math.cos(angle) * 12;
      const z = mz + Math.sin(angle) * 12;
      const y = this.getHeight(x, z) + 2;
      return { x, y, z };
    }

    const y = this.getHeight(0, 0) + 2;
    return { x: 0, y, z: 0 };
  }

  getPitFloorY(): number {
    return PIT_FLOOR_Y;
  }

  getPitConfig(): MinePitConfig | null {
    return this.pitConfig;
  }
}

export function createTerrainHeightField(config: SurfacePoiConfig): TerrainHeightField {
  return new TerrainHeightField(config, config.poi.mine);
}
