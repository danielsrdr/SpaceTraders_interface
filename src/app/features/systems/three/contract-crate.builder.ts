import {
  AdditiveBlending,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
} from 'three';
import type { SurfaceCollider } from './surface-collider-registry';
import {
  beaconPositionForPoi,
  type SurfaceContractBeacon,
} from './surface-contract-beacons';
import type { SurfacePoiDefinition } from './surface-poi-registry';

export interface ContractCrateAnchor {
  beacon: SurfaceContractBeacon;
  position: { x: number; y: number; z: number };
}

export function buildContractCrates(
  beacons: SurfaceContractBeacon[],
  pois: SurfacePoiDefinition[],
  sampleHeight: (x: number, z: number) => number,
): { group: Group; anchors: ContractCrateAnchor[]; colliders: SurfaceCollider[] } {
  const group = new Group();
  group.name = 'contract-crates';
  const anchors: ContractCrateAnchor[] = [];
  const colliders: SurfaceCollider[] = [];

  for (const beacon of beacons) {
    if (beacon.kind === 'survey-ruins') continue;

    const poi = pois.find((p) => p.kind === beacon.poiKind);
    if (!poi) continue;

    const baseY = sampleHeight(poi.position.x, poi.position.z);
    const pos = beaconPositionForPoi(poi, baseY);
    anchors.push({ beacon, position: pos });

    const crateGroup = new Group();
    crateGroup.name = `contract-crate-${beacon.contractId}`;
    crateGroup.position.set(pos.x, pos.y, pos.z);
    crateGroup.userData['contractBeacon'] = beacon;

    const body = new Mesh(
      new BoxGeometry(1.2, 1.0, 1.2),
      new MeshStandardMaterial({
        color: 0x854d0e,
        emissive: 0xfbbf24,
        emissiveIntensity: 0.35,
        metalness: 0.2,
        roughness: 0.75,
      }),
    );
    body.position.y = 0.5;
    crateGroup.add(body);

    const glow = new Mesh(
      new BoxGeometry(1.35, 1.15, 1.35),
      new MeshStandardMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.15,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.position.y = 0.5;
    crateGroup.add(glow);

    const light = new PointLight(0xfbbf24, 0.6, 8);
    light.position.set(0, 1.2, 0);
    crateGroup.add(light);

    group.add(crateGroup);

    colliders.push({
      kind: 'box',
      minX: pos.x - 0.7,
      maxX: pos.x + 0.7,
      minZ: pos.z - 0.7,
      maxZ: pos.z + 0.7,
      baseY: pos.y,
      topY: pos.y + 1.2,
    });
  }

  return { group, anchors, colliders };
}
