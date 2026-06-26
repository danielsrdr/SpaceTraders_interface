import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  Vector3,
} from 'three';
import type { SurfaceCollider } from './surface-collider-registry';

export interface RuinsScanAnchor {
  position: Vector3;
}

export interface RuinsBuildResult {
  group: Group;
  scanAnchor: RuinsScanAnchor;
  colliders: SurfaceCollider[];
}

const RUINS_HALF = 6;

export function buildRuinsStructuresAt(
  originX: number,
  originZ: number,
  groundY = 0,
): RuinsBuildResult {
  const group = new Group();
  group.name = 'ruins-structures';
  group.position.set(originX, groundY, originZ);

  const stoneMat = new MeshStandardMaterial({
    color: 0x57534e,
    roughness: 0.95,
    metalness: 0.05,
  });

  const fragments: Array<[number, number, number, number, number, number]> = [
    [0, 0.8, 0, 2.2, 1.6, 0.8],
    [-2.5, 0.5, 1.5, 1.4, 1, 1.4],
    [2.8, 0.4, -1.2, 1.8, 0.8, 1.2],
    [-1.2, 0.3, -2.8, 1.2, 0.6, 1.6],
    [3.2, 0.6, 2.4, 1, 1.2, 1],
  ];

  for (const [lx, ly, lz, sx, sy, sz] of fragments) {
    const block = new Mesh(new BoxGeometry(sx, sy, sz), stoneMat);
    block.position.set(lx, ly, lz);
    block.rotation.y = (lx + lz) * 0.15;
    block.castShadow = true;
    block.receiveShadow = true;
    group.add(block);
  }

  const artifactMat = new MeshStandardMaterial({
    color: 0x10b981,
    emissive: new Color(0x059669),
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.5,
  });
  const artifact = new Mesh(new OctahedronGeometry(1.1, 0), artifactMat);
  artifact.position.set(0, 2.2, 0);
  artifact.userData['nightGlow'] = 1.2;
  group.add(artifact);

  const pedestal = new Mesh(new BoxGeometry(1.6, 0.4, 1.6), stoneMat);
  pedestal.position.set(0, 0.2, 0);
  group.add(pedestal);

  const padWorldX = originX;
  const padWorldZ = originZ;
  const colliders: SurfaceCollider[] = [
    {
      kind: 'box',
      minX: padWorldX - RUINS_HALF,
      maxX: padWorldX + RUINS_HALF,
      minZ: padWorldZ - RUINS_HALF,
      maxZ: padWorldZ + RUINS_HALF,
      baseY: groundY,
      topY: groundY + 4,
    },
  ];

  return {
    group,
    scanAnchor: { position: new Vector3(padWorldX, groundY + 3, padWorldZ) },
    colliders,
  };
}
