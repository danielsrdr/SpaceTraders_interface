import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PointLight } from 'three';
import type { SurfaceCollider } from './surface-collider-registry';

export interface CaveBuildResult {
  group: Group;
  colliders: SurfaceCollider[];
}

/** Procedural cave mouth — exploration POI away from the mine pit. */
export function buildCaveStructuresAt(x: number, z: number, baseY: number): CaveBuildResult {
  const group = new Group();
  group.name = 'cave-structures';
  group.position.set(x, baseY, z);

  const stone = new MeshStandardMaterial({ color: 0x57534e, roughness: 0.95 });
  const dark = new MeshStandardMaterial({
    color: 0x0f172a,
    emissive: 0x1e293b,
    emissiveIntensity: 0.25,
  });

  for (const [lx, lz, sx, sz] of [
    [-2.5, 0, 1.2, 3.5],
    [2.5, 0, 1.2, 3.5],
    [0, -1.8, 4.5, 1.2],
  ] as const) {
    const block = new Mesh(new BoxGeometry(sx, 2.8, sz), stone);
    block.position.set(lx, 1.4, lz);
    block.rotation.y = (lx + lz) * 0.08;
    block.castShadow = true;
    group.add(block);
  }

  const mouth = new Mesh(new BoxGeometry(2.2, 2, 0.8), dark);
  mouth.position.set(0, 1.2, 0.2);
  group.add(mouth);

  const glow = new PointLight(0x38bdf8, 0.5, 8);
  glow.position.set(0, 1.5, -1.2);
  glow.userData['nightLight'] = glow.intensity;
  group.add(glow);

  const colliders: SurfaceCollider[] = [
    {
      kind: 'box',
      minX: x - 3,
      maxX: x + 3,
      minZ: z - 2.5,
      maxZ: z + 2.5,
      baseY,
      topY: baseY + 3.2,
    },
  ];

  return { group, colliders };
}
