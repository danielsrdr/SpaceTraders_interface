import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Vector3,
} from 'three';
import type { MarketData, TradeGoodType } from '../../../models/system.model';
import type { SurfaceCollider } from './surface-collider-registry';

export interface MarketClerkAnchor {
  position: Vector3;
  /** World-space yaw (radians) the clerk faces — toward the door. */
  facing: number;
}

export interface MarketBuildResult {
  group: Group;
  clerk: MarketClerkAnchor | null;
  colliders: SurfaceCollider[];
}

const BUILDING_W = 12;
const BUILDING_D = 10;
const WALL_H = 3.9;
const DOOR_W = 2.6;
const CLERK_INTERACT_SQ = 12;

function addBox(
  group: Group,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: MeshStandardMaterial,
  castShadow = true,
): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function wallCollider(
  colliders: SurfaceCollider[],
  originX: number,
  originZ: number,
  groundY: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  topY: number,
): void {
  colliders.push({
    kind: 'box',
    minX: originX + minX,
    maxX: originX + maxX,
    minZ: originZ + minZ,
    maxZ: originZ + maxZ,
    baseY: groundY,
    topY: groundY + topY,
  });
}

/** Enclosed trading post with a single clerk behind the counter — no floating stall sprites. */
function marketGroup(
  originX: number,
  originZ: number,
  groundY: number,
  market: MarketData | null,
): MarketBuildResult {
  const group = new Group();
  group.name = 'market-structures';
  group.position.set(originX, groundY, originZ);

  const stoneMat = new MeshStandardMaterial({ color: 0x57534e, roughness: 0.92 });
  const trimMat = new MeshStandardMaterial({
    color: 0x0ea5e9,
    emissive: new Color(0x0284c7),
    emissiveIntensity: 0.35,
    roughness: 0.5,
  });
  const floorMat = new MeshStandardMaterial({ color: 0x292524, roughness: 0.95 });
  const roofMat = new MeshStandardMaterial({ color: 0x1c1917, roughness: 0.88, metalness: 0.15 });
  const woodMat = new MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
  const npcBody = new MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 });
  const npcHead = new MeshStandardMaterial({
    color: 0xfcd34d,
    emissive: new Color(0xca8a04),
    emissiveIntensity: 0.15,
  });

  // Interior floor slab
  addBox(group, BUILDING_W, 0.2, BUILDING_D, BUILDING_W / 2, 0, BUILDING_D / 2, floorMat, false);

  // Perimeter walls (door gap on south / +Z face)
  const wallT = 0.35;
  addBox(group, BUILDING_W, WALL_H, wallT, BUILDING_W / 2, 0.2, wallT / 2, stoneMat);
  addBox(group, wallT, WALL_H, BUILDING_D, wallT / 2, 0.2, BUILDING_D / 2, stoneMat);
  addBox(group, wallT, WALL_H, BUILDING_D, BUILDING_W - wallT / 2, 0.2, BUILDING_D / 2, stoneMat);

  const doorSide = (BUILDING_W - DOOR_W) / 2;
  addBox(group, doorSide, WALL_H, wallT, doorSide / 2, 0.2, BUILDING_D - wallT / 2, stoneMat);
  addBox(
    group,
    doorSide,
    WALL_H,
    wallT,
    BUILDING_W - doorSide / 2,
    0.2,
    BUILDING_D - wallT / 2,
    stoneMat,
  );

  // Low door header
  addBox(
    group,
    DOOR_W,
    0.5,
    wallT,
    BUILDING_W / 2,
    WALL_H - 0.25,
    BUILDING_D - wallT / 2,
    stoneMat,
  );

  // Roof with slight overhang
  addBox(group, BUILDING_W + 0.8, 0.35, BUILDING_D + 0.8, BUILDING_W / 2, WALL_H + 0.15, BUILDING_D / 2, roofMat);

  // Trim band + sign panel above door (mesh, not billboard)
  const sign = addBox(group, 3.2, 0.55, 0.12, BUILDING_W / 2, WALL_H - 0.35, BUILDING_D - 0.05, trimMat);
  sign.userData['nightGlow'] = 0.35;

  // Counter spanning interior
  addBox(group, BUILDING_W - 2.4, 1.05, 0.55, BUILDING_W / 2, 0.2, BUILDING_D * 0.42, woodMat);

  // Clerk behind counter, facing the door (+Z)
  const clerkLocalX = BUILDING_W / 2;
  const clerkLocalZ = BUILDING_D * 0.28;
  const clerkBody = addBox(group, 0.5, 1.05, 0.38, clerkLocalX, 0.2, clerkLocalZ, npcBody);
  clerkBody.name = 'market-clerk';
  addBox(group, 0.34, 0.34, 0.34, clerkLocalX, 1.35, clerkLocalZ, npcHead);

  // Crate shelves along side walls
  const crateColors = [0xb45309, 0x059669, 0x6366f1, 0xdb2777, 0x0891b2, 0xa16207];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? 1.2 : BUILDING_W - 1.2;
    const row = Math.floor(i / 2);
    const crateMat = new MeshStandardMaterial({ color: crateColors[i]!, roughness: 0.75 });
    addBox(group, 0.55, 0.55, 0.55, side, 0.2, 2.2 + row * 1.1, crateMat);
    addBox(group, 0.55, 0.55, 0.55, side, 0.78, 2.75 + row * 1.1, crateMat);
  }

  // Warm interior lamp
  const lamp = new PointLight(0xfbbf24, 1.1, 14);
  lamp.position.set(BUILDING_W / 2, WALL_H - 0.6, BUILDING_D / 2);
  lamp.userData['nightLight'] = lamp.intensity;
  group.add(lamp);

  // Exterior pad leading to door
  addBox(group, 3.5, 0.12, 2.2, BUILDING_W / 2, -0.02, BUILDING_D + 1.1, floorMat, false);

  const colliders: SurfaceCollider[] = [];
  wallCollider(colliders, originX, originZ, groundY, 0, BUILDING_W, 0, wallT, WALL_H + 0.2);
  wallCollider(
    colliders,
    originX,
    originZ,
    groundY,
    0,
    wallT,
    wallT,
    BUILDING_D - wallT,
    WALL_H + 0.2,
  );
  wallCollider(
    colliders,
    originX,
    originZ,
    groundY,
    BUILDING_W - wallT,
    BUILDING_W,
    wallT,
    BUILDING_D - wallT,
    WALL_H + 0.2,
  );
  wallCollider(
    colliders,
    originX,
    originZ,
    groundY,
    0,
    doorSide,
    BUILDING_D - wallT,
    BUILDING_D,
    WALL_H + 0.2,
  );
  wallCollider(
    colliders,
    originX,
    originZ,
    groundY,
    BUILDING_W - doorSide,
    BUILDING_W,
    BUILDING_D - wallT,
    BUILDING_D,
    WALL_H + 0.2,
  );
  wallCollider(
    colliders,
    originX,
    originZ,
    groundY,
    doorSide,
    BUILDING_W - doorSide,
    BUILDING_D - wallT,
    BUILDING_D,
    WALL_H + 0.2,
  );
  wallCollider(
    colliders,
    originX,
    originZ,
    groundY,
    1.2,
    BUILDING_W - 1.2,
    BUILDING_D * 0.38,
    BUILDING_D * 0.48,
    1.35,
  );

  const clerk: MarketClerkAnchor = {
    position: new Vector3(originX + clerkLocalX, groundY + 1.75, originZ + clerkLocalZ),
    facing: Math.PI / 2,
  };

  void market;

  return { group, clerk, colliders };
}

export function buildMarketStructuresAt(
  originX: number,
  originZ: number,
  groundY = 0,
  market: MarketData | null = null,
): MarketBuildResult {
  return marketGroup(originX, originZ, groundY, market);
}

export function isNearMarketClerk(
  cx: number,
  cz: number,
  clerk: MarketClerkAnchor | null,
): boolean {
  if (!clerk) return false;
  const dx = cx - clerk.position.x;
  const dz = cz - clerk.position.z;
  return dx * dx + dz * dz <= CLERK_INTERACT_SQ;
}

/** @deprecated Mine surface props are built via mine-pit.builder */
export function buildMineStructuresAt(_originX: number, _originZ: number): Group {
  return new Group();
}

/** @deprecated */
export function buildMineStructures(): Group {
  return new Group();
}
