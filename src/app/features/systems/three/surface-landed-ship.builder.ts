import { Group, Mesh, Vector3 } from 'three';
import { buildProceduralShip, disposeShip } from '../../ships/ship-procedural.builder';
import type { SurfaceCollider } from './surface-collider-registry';
import { buildLandingPad } from './surface-landing-pad.builder';

export interface LandedShipBuildResult {
  group: Group;
  pad: Group;
  position: Vector3;
  symbol: string;
  collider: SurfaceCollider;
}

/** Large enough to read on foot, still fits beside the spawn pad. */
export const SURFACE_SHIP_SCALE = 0.82;

/** Place the player's docked ship a few metres beside the landing spawn. */
export function computeLandedShipPosition(
  spawn: { x: number; y: number; z: number },
  spawnHeading: number,
): { x: number; y: number; z: number } {
  const lateral = 7;
  const back = -3;
  return {
    x: spawn.x + Math.sin(spawnHeading) * back + Math.cos(spawnHeading) * lateral,
    y: spawn.y,
    z: spawn.z + Math.cos(spawnHeading) * back - Math.sin(spawnHeading) * lateral,
  };
}

function computeShipRestY(deckY: number, reactors: Mesh[], scale: number): number {
  let lowest = 0;
  for (const mesh of reactors) {
    lowest = Math.min(lowest, mesh.position.y * scale);
  }
  return deckY + 0.12 - lowest;
}

function enableShadows(root: Group): void {
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
}

export function buildLandedShipAt(
  spawn: { x: number; y: number; z: number },
  spawnHeading: number,
  groundY: number,
  shipRole: string,
  shipSymbol: string,
): LandedShipBuildResult {
  const pos = computeLandedShipPosition(spawn, spawnHeading);
  const built = buildProceduralShip(shipRole);
  const group = built.root;
  group.name = 'landed-ship';
  group.scale.setScalar(SURFACE_SHIP_SCALE);
  group.rotation.set(0, spawnHeading, 0);

  const padBuilt = buildLandingPad(pos.x, pos.z, groundY, spawnHeading);
  group.position.set(pos.x, computeShipRestY(padBuilt.deckY, built.reactorMeshes, SURFACE_SHIP_SCALE), pos.z);

  enableShadows(group);
  enableShadows(padBuilt.group);

  group.userData['reactorMeshes'] = built.reactorMeshes;
  group.userData['surfaceScale'] = SURFACE_SHIP_SCALE;
  group.userData['shipRole'] = shipRole;

  const halfW = 2.8 * SURFACE_SHIP_SCALE;
  const halfL = 4.5 * SURFACE_SHIP_SCALE;
  const collider: SurfaceCollider = {
    kind: 'box',
    minX: pos.x - halfW,
    maxX: pos.x + halfW,
    minZ: pos.z - halfL,
    maxZ: pos.z + halfL,
    baseY: groundY,
    topY: group.position.y + 3.5 * SURFACE_SHIP_SCALE,
  };

  return {
    group,
    pad: padBuilt.group,
    position: new Vector3(pos.x, group.position.y + 2.2, pos.z),
    symbol: shipSymbol,
    collider,
  };
}

export function disposeLandedShip(group: Group): void {
  disposeShip(group);
}

export function disposeLandingPad(pad: Group): void {
  pad.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else {
        mat.dispose();
      }
    }
  });
}
