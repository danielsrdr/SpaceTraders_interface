import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';
import type { SurfaceCollider } from './surface-collider-registry';

export interface SiphonBuildResult {
  group: Group;
  colliders: SurfaceCollider[];
}

/** Floating siphon deck for gas giant surface approach. */
export function buildSiphonPlatformAt(x: number, z: number, baseY: number): SiphonBuildResult {
  const group = new Group();
  group.name = 'siphon-platform';
  group.position.set(x, baseY + 6, z);

  const deck = new Mesh(
    new CylinderGeometry(5, 5.5, 0.6, 12),
    new MeshStandardMaterial({
      color: 0x4c1d95,
      emissive: 0x7c3aed,
      emissiveIntensity: 0.35,
      metalness: 0.5,
      roughness: 0.45,
    }),
  );
  group.add(deck);

  const hose = new Mesh(
    new CylinderGeometry(0.35, 0.35, 14, 8),
    new MeshBasicMaterial({
      color: 0xa78bfa,
      transparent: true,
      opacity: 0.55,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  hose.position.y = -7;
  group.add(hose);

  const intake = new Mesh(
    new BoxGeometry(1.2, 1.2, 1.2),
    new MeshStandardMaterial({
      color: 0xc4b5fd,
      emissive: 0x8b5cf6,
      emissiveIntensity: 0.6,
    }),
  );
  intake.position.y = -14;
  group.add(intake);

  const colliders: SurfaceCollider[] = [
    {
      kind: 'cylinder',
      x,
      z,
      radius: 5.5,
      baseY: baseY + 5.5,
      topY: baseY + 6.8,
    },
  ];

  return { group, colliders };
}
