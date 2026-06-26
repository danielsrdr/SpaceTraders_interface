import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { SurfaceCollider } from './surface-collider-registry';

export interface DepotPadAnchor {
  position: Vector3;
}

export interface DepotBuildResult {
  group: Group;
  padAnchor: DepotPadAnchor;
  colliders: SurfaceCollider[];
}

const DEPOT_HALF = 5;

export function buildDepotStructuresAt(
  originX: number,
  originZ: number,
  groundY = 0,
): DepotBuildResult {
  const group = new Group();
  group.name = 'depot-structures';
  group.position.set(originX, groundY, originZ);

  const padMat = new MeshStandardMaterial({
    color: 0x44403c,
    roughness: 0.9,
    metalness: 0.1,
  });
  const pad = new Mesh(new BoxGeometry(DEPOT_HALF * 2, 0.3, DEPOT_HALF * 2), padMat);
  pad.position.set(2, 0.15, 2);
  pad.receiveShadow = true;
  group.add(pad);

  const tankMat = new MeshStandardMaterial({
    color: 0xea580c,
    emissive: new Color(0xc2410c),
    emissiveIntensity: 0.25,
    roughness: 0.35,
    metalness: 0.55,
  });

  for (const [lx, lz] of [
    [-2, -1],
    [2, -1],
    [0, 2.5],
  ]) {
    const tank = new Mesh(new CylinderGeometry(1.1, 1.1, 2.8, 12), tankMat);
    tank.position.set(lx + 2, 1.7, lz + 2);
    tank.castShadow = true;
    tank.userData['nightGlow'] = 0.4;
    group.add(tank);
  }

  const padWorldX = originX + 2;
  const padWorldZ = originZ + 2;
  const colliders: SurfaceCollider[] = [
    {
      kind: 'box',
      minX: padWorldX - DEPOT_HALF,
      maxX: padWorldX + DEPOT_HALF,
      minZ: padWorldZ - DEPOT_HALF,
      maxZ: padWorldZ + DEPOT_HALF,
      baseY: groundY,
      topY: groundY + 4,
    },
  ];

  return {
    group,
    padAnchor: { position: new Vector3(padWorldX, groundY + 2, padWorldZ) },
    colliders,
  };
}
