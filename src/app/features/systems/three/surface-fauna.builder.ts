import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
} from 'three';
import { noise2d } from './terrain/terrain-noise';
import { resolveSurfaceAmbience } from './surface-ambience';
import type { SurfaceTraitProfile } from './surface-trait-profile';

interface FaunaPoiAnchor {
  position: { x: number; z: number };
}

export interface SurfaceFaunaResult {
  group: Group;
  update(dt: number): void;
  dispose(): void;
}

const SPECIES_BY_BIOME: Record<string, { color: number; count: number; speed: number; scale: number }> = {
  desert: { color: 0xd97706, count: 6, speed: 0.4, scale: 0.35 },
  jungle: { color: 0x84cc16, count: 8, speed: 0.55, scale: 0.3 },
  frozen: { color: 0x67e8f9, count: 5, speed: 0.25, scale: 0.28 },
  industrial: { color: 0x94a3b8, count: 4, speed: 0.35, scale: 0.32 },
  default: { color: 0xa8a29e, count: 5, speed: 0.35, scale: 0.3 },
};

interface CritterPath {
  cx: number;
  cz: number;
  radius: number;
  phase: number;
  y: number;
}

export function buildSurfaceFauna(
  seed: number,
  profile: SurfaceTraitProfile,
  spawn: { x: number; z: number },
  poiAnchors: FaunaPoiAnchor[],
  sampleHeight: (x: number, z: number) => number,
): SurfaceFaunaResult {
  const group = new Group();
  group.name = 'surface-fauna';

  const ambience = resolveSurfaceAmbience(profile, null).kind;
  const biomeKey =
    ambience === 'desert-wind'
      ? 'desert'
      : ambience === 'jungle-hum'
        ? 'jungle'
        : ambience === 'industrial-hum'
          ? 'industrial'
          : 'frozen';
  const species = SPECIES_BY_BIOME[biomeKey] ?? SPECIES_BY_BIOME['default']!;
  const geometry = new BoxGeometry(0.5, 0.35, 0.7);
  const material = new MeshStandardMaterial({
    color: species.color,
    flatShading: true,
  });
  const mesh = new InstancedMesh(geometry, material, species.count);
  mesh.name = 'fauna-critters';

  const paths: CritterPath[] = [];
  const matrix = new Matrix4();
  const minPoiDist = 14;

  for (let i = 0; i < species.count; i++) {
    let cx = 0;
    let cz = 0;
    let ok = false;
    for (let attempt = 0; attempt < 24; attempt++) {
      const nx = noise2d(seed + i * 17 + attempt, i * 0.7, attempt * 0.3);
      const nz = noise2d(seed + i * 31 + attempt, attempt * 0.5, i * 0.9);
      cx = spawn.x + (nx - 0.5) * 90;
      cz = spawn.z + (nz - 0.5) * 90;
      const poiOk = poiAnchors.every((a) => {
        const dx = a.position.x - cx;
        const dz = a.position.z - cz;
        return dx * dx + dz * dz >= minPoiDist * minPoiDist;
      });
      if (poiOk && Math.hypot(cx, cz) < 120) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      cx = spawn.x + Math.cos(i) * 20;
      cz = spawn.z + Math.sin(i) * 20;
    }
    const y = sampleHeight(cx, cz);
    paths.push({
      cx,
      cz,
      radius: 2 + (i % 3),
      phase: (seed + i * 47) * 0.01,
      y,
    });
    matrix.makeTranslation(cx, y + 0.2, cz);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);

  let elapsed = 0;

  return {
    group,
    update(dt: number): void {
      elapsed += dt;
      for (let i = 0; i < paths.length; i++) {
        const path = paths[i]!;
        const t = elapsed * species.speed + path.phase;
        const x = path.cx + Math.cos(t + i) * path.radius;
        const z = path.cz + Math.sin(t * 1.1 + i) * path.radius;
        const y = sampleHeight(x, z) + 0.2;
        matrix.makeScale(species.scale, species.scale, species.scale);
        matrix.setPosition(x, y, z);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
