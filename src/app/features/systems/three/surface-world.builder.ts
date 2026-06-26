import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
} from 'three';
import { MarketData, PlanetView, ShipyardData } from '../../../models/system.model';
import { buildMinePitMeshes, PIT_RADIUS } from './mine/mine-pit.builder';
import { createMineTunnelManager, MineTunnelManager } from './mine/mine-tunnel.manager';
import { createMineCart, MineCart } from './mine/mine-cart';
import { buildSurfaceProps } from './surface-props.builder';
import { buildSurfacePoiConfig } from './surface-poi';
import { buildSurfaceZones, SurfaceZone } from './surface-zones';
import { createSurfaceCollision, SurfaceCollision } from './surface-collision';
import {
  createSurfaceColliderRegistry,
  SurfaceColliderRegistry,
} from './surface-collider-registry';
import { buildMarketStructuresAt, MarketStallAnchor } from './zone-buildings.builder';
import { buildShipyardStructuresAt } from './zone-shipyard.builder';
import { buildRuinsStructuresAt } from './zone-ruins.builder';
import { buildDepotStructuresAt } from './zone-depot.builder';
import { createTerrainHeightField, TerrainHeightField } from './terrain/terrain-height';
import { applyTerrainProfile } from './terrain/terrain-material';
import { createTerrainChunkManager, TerrainChunkManager } from './terrain/terrain-chunk.manager';
import type { SurfaceTraitProfile } from './surface-trait-profile';
import type { SurfaceZoneKind } from './system-view-mode';
import type { SurfacePoiDefinition } from './surface-poi-registry';

export interface SurfacePoiAnchor {
  kind: SurfaceZoneKind;
  label: string;
  position: Vector3;
  priority: number;
}

const POI_BEACON_COLORS: Record<SurfaceZoneKind, number> = {
  market: 0xfbbf24,
  mine: 0x22d3ee,
  shipyard: 0x06b6d4,
  ruins: 0x10b981,
  depot: 0xea580c,
};

export interface SurfaceWorldResult {
  root: Group;
  heightField: TerrainHeightField;
  terrainManager: TerrainChunkManager;
  tunnels: MineTunnelManager | null;
  cart: MineCart | null;
  collision: SurfaceCollision;
  colliders: SurfaceColliderRegistry;
  zones: SurfaceZone[];
  poiAnchors: SurfacePoiAnchor[];
  marketStalls: MarketStallAnchor[];
  marketOrigin: { x: number; z: number; baseY: number } | null;
  shipyardOrigin: { x: number; z: number; baseY: number } | null;
  spawn: { x: number; y: number; z: number };
  spawnHeading: number;
  profile: SurfaceTraitProfile;
}

function buildPoiBeacon(x: number, z: number, baseY: number, color: number): Group {
  const group = new Group();
  group.name = 'poi-beacon';

  const height = 14;
  const beam = new Mesh(
    new CylinderGeometry(0.32, 0.32, height, 10, 1, true),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.2,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  beam.position.set(x, baseY + height / 2, z);
  group.add(beam);

  const ring = new Mesh(
    new RingGeometry(1.3, 1.9, 24),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, baseY + 0.15, z);
  group.add(ring);

  return group;
}

function beaconPositionForPoi(poi: SurfacePoiDefinition, baseY: number): Vector3 {
  switch (poi.kind) {
    case 'market':
      return new Vector3(poi.position.x + 5, baseY + 7, poi.position.z + 5);
    case 'mine':
      return new Vector3(poi.position.x, baseY + 6, poi.position.z);
    case 'shipyard':
      return new Vector3(poi.position.x + 5, baseY + 7, poi.position.z + 5);
    case 'ruins':
      return new Vector3(poi.position.x, baseY + 5, poi.position.z);
    case 'depot':
      return new Vector3(poi.position.x + 2, baseY + 5, poi.position.z + 2);
    default: {
      const _exhaustive: never = poi.kind;
      return _exhaustive;
    }
  }
}

function computeSpawnHeading(
  spawn: { x: number; z: number },
  anchors: SurfacePoiAnchor[],
): number {
  if (!anchors.length) return 0;
  let best: SurfacePoiAnchor | null = null;
  let bestDist = Infinity;
  for (const anchor of anchors) {
    const dx = anchor.position.x - spawn.x;
    const dz = anchor.position.z - spawn.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = anchor;
    }
  }
  if (!best) return 0;
  return Math.atan2(best.position.x - spawn.x, best.position.z - spawn.z);
}

export function buildSurfaceWorld(
  planet: PlanetView,
  market: MarketData | null = null,
  shipyard: ShipyardData | null = null,
): SurfaceWorldResult {
  const poiConfig = buildSurfacePoiConfig(planet);
  const heightField = createTerrainHeightField(poiConfig);
  const terrainManager = createTerrainChunkManager(heightField, poiConfig);
  const tunnels = createMineTunnelManager(heightField.getPitConfig(), poiConfig.seed);
  const cart = createMineCart(tunnels);
  const colliders = createSurfaceColliderRegistry();
  const collision = createSurfaceCollision(heightField, tunnels, colliders);
  const spawn = heightField.getSpawn();
  const zones = buildSurfaceZones(poiConfig.pois);
  applyTerrainProfile(terrainManager.material, poiConfig.profile);

  const root = new Group();
  root.name = 'surface-world';
  root.add(terrainManager.root);

  const poiAnchors: SurfacePoiAnchor[] = [];
  let marketStalls: MarketStallAnchor[] = [];
  let marketOrigin: { x: number; z: number; baseY: number } | null = null;
  let shipyardOrigin: { x: number; z: number; baseY: number } | null = null;

  if (poiConfig.hasMine && heightField.getPitConfig()) {
    const pitMeshes = buildMinePitMeshes(heightField.getPitConfig()!, heightField.getPitFloorY());
    root.add(pitMeshes);
    tunnels?.ensureBuilt();
    if (tunnels) root.add(tunnels.root);
    if (cart) root.add(cart.root);
  }

  for (const poi of poiConfig.pois) {
    const { x, z } = poi.position;
    const baseY = heightField.getHeight(x, z);
    const beaconColor = POI_BEACON_COLORS[poi.kind];

    switch (poi.kind) {
      case 'market': {
        const built = buildMarketStructuresAt(x, z, baseY, market);
        root.add(built.group);
        marketStalls = built.stalls;
        built.colliders.forEach((c) => colliders.add(c, 'market'));
        marketOrigin = { x, z, baseY };
        const bx = x + 5;
        const bz = z + 5;
        root.add(buildPoiBeacon(bx, bz, baseY, beaconColor));
        poiAnchors.push({
          kind: poi.kind,
          label: poi.label,
          position: beaconPositionForPoi(poi, baseY),
          priority: poi.priority,
        });
        break;
      }
      case 'mine': {
        const rimY = heightField.getHeight(x + PIT_RADIUS * 0.9, z);
        root.add(buildPoiBeacon(x, z, rimY, beaconColor));
        poiAnchors.push({
          kind: poi.kind,
          label: poi.label,
          position: beaconPositionForPoi(poi, rimY),
          priority: poi.priority,
        });
        break;
      }
      case 'shipyard': {
        const built = buildShipyardStructuresAt(x, z, baseY, shipyard);
        root.add(built.group);
        built.colliders.forEach((c) => colliders.add(c, 'shipyard'));
        shipyardOrigin = { x, z, baseY };
        const bx = x + 5;
        const bz = z + 5;
        root.add(buildPoiBeacon(bx, bz, baseY, beaconColor));
        poiAnchors.push({
          kind: poi.kind,
          label: poi.label,
          position: beaconPositionForPoi(poi, baseY),
          priority: poi.priority,
        });
        break;
      }
      case 'ruins': {
        const built = buildRuinsStructuresAt(x, z, baseY);
        root.add(built.group);
        built.colliders.forEach((c) => colliders.add(c, 'ruins'));
        root.add(buildPoiBeacon(x, z, baseY, beaconColor));
        poiAnchors.push({
          kind: poi.kind,
          label: poi.label,
          position: beaconPositionForPoi(poi, baseY),
          priority: poi.priority,
        });
        break;
      }
      case 'depot': {
        const built = buildDepotStructuresAt(x, z, baseY);
        root.add(built.group);
        built.colliders.forEach((c) => colliders.add(c, 'depot'));
        const bx = x + 2;
        const bz = z + 2;
        root.add(buildPoiBeacon(bx, bz, baseY, beaconColor));
        poiAnchors.push({
          kind: poi.kind,
          label: poi.label,
          position: beaconPositionForPoi(poi, baseY),
          priority: poi.priority,
        });
        break;
      }
      default: {
        const _exhaustive: never = poi.kind;
        return _exhaustive;
      }
    }
  }

  const props = buildSurfaceProps(heightField, poiConfig.seed, {
    spawn: { x: spawn.x, z: spawn.z },
    profile: poiConfig.profile,
  });
  root.add(props.group);
  props.colliders.forEach((c) => colliders.add(c, 'static'));

  terrainManager.update(spawn.x, spawn.z);

  const spawnHeading = computeSpawnHeading(spawn, poiAnchors);

  return {
    root,
    heightField,
    terrainManager,
    tunnels,
    cart,
    collision,
    colliders,
    zones,
    poiAnchors,
    marketStalls,
    marketOrigin,
    shipyardOrigin,
    spawn,
    spawnHeading,
    profile: poiConfig.profile,
  };
}

export function disposeSurfaceWorldResult(world: SurfaceWorldResult): void {
  world.terrainManager.dispose();
  world.tunnels?.dispose();
}
