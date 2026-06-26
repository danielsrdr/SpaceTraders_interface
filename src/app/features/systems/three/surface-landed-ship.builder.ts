import { Group, Vector3 } from 'three';
import { buildProceduralShip, disposeShip } from '../../ships/ship-procedural.builder';

export interface LandedShipBuildResult {
  group: Group;
  position: Vector3;
  symbol: string;
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
  group.position.set(pos.x, groundY + 0.55, pos.z);
  group.rotation.set(0, spawnHeading, 0);
  group.userData['reactorMeshes'] = built.reactorMeshes;
  group.userData['surfaceScale'] = SURFACE_SHIP_SCALE;

  return {
    group,
    position: new Vector3(pos.x, groundY + 2.2, pos.z),
    symbol: shipSymbol,
  };
}

export function disposeLandedShip(group: Group): void {
  disposeShip(group);
}
