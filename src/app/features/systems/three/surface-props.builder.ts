import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { noise2d } from './terrain/terrain-noise';
import { TerrainHeightField } from './terrain/terrain-height';
import type { SurfaceCollider } from './surface-collider-registry';
import type { SurfaceTraitProfile } from './surface-trait-profile';

/** Props near the spawn point are left collider-free so the player never starts stuck. */
const SPAWN_CLEAR_RADIUS = 3;

export interface SurfacePropsOptions {
  spawn: { x: number; z: number };
  profile: SurfaceTraitProfile;
}

export interface SurfacePropsResult {
  group: Group;
  colliders: SurfaceCollider[];
}

export function buildSkydome(): Mesh {
  const geometry = new BufferGeometry();
  const verts: number[] = [];
  const colors: number[] = [];
  const segments = 32;
  const rings = 16;
  const radius = 180;

  const zenith = new Color(0x1e40af);
  const horizon = new Color(0xc7e4ff);
  const tmp = new Color();

  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * (Math.PI / 2);
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);
      verts.push(x, y, z);
      tmp.copy(zenith).lerp(horizon, r / rings);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * (segments + 1) + s;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  geometry.setAttribute('position', new Float32BufferAttribute(verts, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: true }),
  );
  mesh.name = 'skydome';
  return mesh;
}

export function buildSurfaceProps(
  heightField: TerrainHeightField,
  seed: number,
  options: SurfacePropsOptions,
): SurfacePropsResult {
  const { spawn, profile } = options;
  const propDensity = profile.propDensity;
  const treeThreshold = Math.max(0.55, 0.72 - propDensity * 0.08);
  const rockThreshold = Math.max(0.5, 0.65 - propDensity * 0.06);
  const group = new Group();
  group.name = 'surface-props';
  const colliders: SurfaceCollider[] = [];

  const trunkMat = new MeshStandardMaterial({ color: 0x78350f, flatShading: true });
  const leafMat = new MeshStandardMaterial({ color: 0x166534, flatShading: true });
  const rockMat = new MeshStandardMaterial({ color: 0x78716c, flatShading: true, roughness: 0.9 });

  const trunkGeo = new BoxGeometry(0.4, 1, 0.4);
  const leafGeo = new BoxGeometry(1.2, 0.6, 1.2);
  const rockGeo = new BoxGeometry(1, 0.8, 1);

  const palms: Array<[number, number, number]> = [];
  const rocks: Array<[number, number, number, number]> = [];

  for (let x = -100; x <= 100; x += 7) {
    for (let z = -100; z <= 100; z += 7) {
      if (Math.hypot(x, z) > 120) continue;
      const n = noise2d(seed + 77, x * 0.15, z * 0.15);
      const biome = heightField.getBiome(x, z);
      const h = heightField.getHeight(x, z);
      const slope = heightField.getSlope(x, z);

      if ((biome === 'desert' || biome === 'jungle') && n > treeThreshold) {
        palms.push([x, h, z]);
      }
      if ((biome === 'rocky' || biome === 'industrial') && slope > 0.45 && n > rockThreshold) {
        rocks.push([x, h, z, 0.6 + n * 0.8]);
      }
    }
  }

  if (palms.length) {
    const trunkMesh = new InstancedMesh(trunkGeo, trunkMat, palms.length * 3);
    const leafMesh = new InstancedMesh(leafGeo, leafMat, palms.length);
    const matrix = new Matrix4();
    palms.forEach(([x, h, z], i) => {
      for (let t = 0; t < 3; t++) {
        matrix.makeTranslation(x + 0.5, h + t + 0.5, z + 0.5);
        trunkMesh.setMatrixAt(i * 3 + t, matrix);
      }
      matrix.makeTranslation(x + 0.5, h + 3.5, z + 0.5);
      leafMesh.setMatrixAt(i, matrix);

      const cx = x + 0.5;
      const cz = z + 0.5;
      if (Math.hypot(cx - spawn.x, cz - spawn.z) > SPAWN_CLEAR_RADIUS) {
        // Trunk only (canopy excluded so the player does not snag on leaves).
        colliders.push({ kind: 'cylinder', x: cx, z: cz, radius: 0.3, baseY: h, topY: h + 3 });
      }
    });
    trunkMesh.instanceMatrix.needsUpdate = true;
    leafMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.castShadow = true;
    leafMesh.castShadow = true;
    group.add(trunkMesh, leafMesh);
  }

  if (rocks.length) {
    const rockMesh = new InstancedMesh(rockGeo, rockMat, rocks.length);
    const matrix = new Matrix4();
    const pos = new Vector3();
    const scale = new Vector3();
    const quat = new Quaternion();
    rocks.forEach(([x, h, z, s], i) => {
      scale.set(s, s * 0.7, s);
      pos.set(x + 0.5, h + s * 0.35, z + 0.5);
      matrix.compose(pos, quat, scale);
      rockMesh.setMatrixAt(i, matrix);

      const cx = x + 0.5;
      const cz = z + 0.5;
      if (Math.hypot(cx - spawn.x, cz - spawn.z) > SPAWN_CLEAR_RADIUS) {
        const half = s * 0.5;
        colliders.push({
          kind: 'box',
          minX: cx - half,
          maxX: cx + half,
          minZ: cz - half,
          maxZ: cz + half,
          baseY: h,
          topY: h + s * 0.7,
        });
      }
    });
    rockMesh.instanceMatrix.needsUpdate = true;
    rockMesh.castShadow = true;
    group.add(rockMesh);
  }

  return { group, colliders };
}
