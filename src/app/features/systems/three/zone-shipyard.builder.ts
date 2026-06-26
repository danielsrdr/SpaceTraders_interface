import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { ShipyardData } from '../../../models/system.model';
import type { SurfaceCollider } from './surface-collider-registry';

export interface ShipyardPadAnchor {
  position: Vector3;
}

export interface ShipyardBuildResult {
  group: Group;
  padAnchor: ShipyardPadAnchor;
  colliders: SurfaceCollider[];
}

const PAD_HALF = 7;
const PAD_BASE_Y = 0.35;
const PAD_TOP_Y = 0.55;

export function buildShipyardStructuresAt(
  originX: number,
  originZ: number,
  groundY = 0,
  shipyard: ShipyardData | null = null,
): ShipyardBuildResult {
  const group = new Group();
  group.name = 'shipyard-structures';
  group.position.set(originX, groundY, originZ);

  const padMat = new MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.85,
    metalness: 0.15,
  });
  const pad = new Mesh(new BoxGeometry(PAD_HALF * 2, 0.35, PAD_HALF * 2), padMat);
  pad.position.set(5, 0.175, 5);
  pad.receiveShadow = true;
  group.add(pad);

  const accentMat = new MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: new Color(0x06b6d4),
    emissiveIntensity: 0.35,
    roughness: 0.4,
    metalness: 0.6,
  });

  const ring = new Mesh(new BoxGeometry(14.5, 0.08, 14.5), accentMat);
  ring.position.set(5, 0.38, 5);
  ring.userData['nightGlow'] = 0.5;
  group.add(ring);

  const shipType = shipyard?.ships?.[0]?.type ?? shipyard?.shipTypes[0]?.type ?? 'SHIP';
  const scale = shipType.includes('CARGO') ? 1.3 : shipType.includes('MINER') ? 1.1 : 1;

  const hull = new Mesh(new BoxGeometry(3.2 * scale, 1.2, 6 * scale), accentMat);
  hull.position.set(5, 1.1, 5);
  hull.castShadow = true;
  group.add(hull);

  const nacelleMat = new MeshStandardMaterial({
    color: 0x0891b2,
    roughness: 0.5,
    metalness: 0.7,
  });
  for (const side of [-1.6 * scale, 1.6 * scale]) {
    const nacelle = new Mesh(new BoxGeometry(0.6, 0.5, 1.8), nacelleMat);
    nacelle.position.set(5 + side, 0.85, 5 + 2.2 * scale);
    group.add(nacelle);
  }

  const beaconMat = new MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: new Color(0x22d3ee),
    emissiveIntensity: 0.8,
  });
  const beacon = new Mesh(new BoxGeometry(0.4, 2.5, 0.4), beaconMat);
  beacon.position.set(11, 1.5, 11);
  beacon.userData['nightGlow'] = 0.9;
  group.add(beacon);

  const padWorldX = originX + 5;
  const padWorldZ = originZ + 5;
  const colliders: SurfaceCollider[] = [
    {
      kind: 'box',
      minX: padWorldX - PAD_HALF,
      maxX: padWorldX + PAD_HALF,
      minZ: padWorldZ - PAD_HALF,
      maxZ: padWorldZ + PAD_HALF,
      baseY: groundY + PAD_BASE_Y,
      topY: groundY + PAD_TOP_Y + 2,
    },
  ];

  return {
    group,
    padAnchor: { position: new Vector3(padWorldX, groundY + 2, padWorldZ) },
    colliders,
  };
}
