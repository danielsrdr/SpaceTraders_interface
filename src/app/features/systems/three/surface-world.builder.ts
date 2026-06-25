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
import { MarketData, PlanetView } from '../../../models/system.model';
import { buildMinePitMeshes, PIT_RADIUS } from './mine/mine-pit.builder';
import { createMineTunnelManager, MineTunnelManager } from './mine/mine-tunnel.manager';
import { buildSurfaceProps } from './surface-props.builder';
import { buildSurfacePoiConfig } from './surface-poi';
import { buildProceduralSurfaceZones, SurfaceZone } from './surface-zones';
import { createSurfaceCollision, SurfaceCollision } from './surface-collision';
import { buildMarketStructuresAt, MarketStallAnchor } from './zone-buildings.builder';
import { createTerrainHeightField, TerrainHeightField } from './terrain/terrain-height';
import { createTerrainChunkManager, TerrainChunkManager } from './terrain/terrain-chunk.manager';
import type { SurfaceZoneKind } from './system-view-mode';

export interface SurfacePoiAnchor {
  kind: SurfaceZoneKind;
  label: string;
  position: Vector3;
}

const POI_BEACON_COLORS: Record<SurfaceZoneKind, number> = {
  market: 0xfbbf24,
  mine: 0x22d3ee,
};

export interface SurfaceWorldResult {
  root: Group;
  heightField: TerrainHeightField;
  terrainManager: TerrainChunkManager;
  tunnels: MineTunnelManager | null;
  collision: SurfaceCollision;
  zones: SurfaceZone[];
  poiAnchors: SurfacePoiAnchor[];
  marketStalls: MarketStallAnchor[];
  marketOrigin: { x: number; z: number; baseY: number } | null;
  spawn: { x: number; y: number; z: number };
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

export function buildSurfaceWorld(
  planet: PlanetView,
  market: MarketData | null = null,
): SurfaceWorldResult {
  const poiConfig = buildSurfacePoiConfig(planet);
  const heightField = createTerrainHeightField(poiConfig);
  const terrainManager = createTerrainChunkManager(heightField, poiConfig);
  const tunnels = createMineTunnelManager(heightField.getPitConfig(), poiConfig.seed);
  const collision = createSurfaceCollision(heightField, tunnels);
  const spawn = heightField.getSpawn();
  const zones = buildProceduralSurfaceZones(poiConfig.hasMarket, poiConfig.hasMine, poiConfig.poi);

  const root = new Group();
  root.name = 'surface-world';
  root.add(terrainManager.root);

  const poiAnchors: SurfacePoiAnchor[] = [];
  let marketStalls: MarketStallAnchor[] = [];
  let marketOrigin: { x: number; z: number; baseY: number } | null = null;

  if (poiConfig.hasMine && heightField.getPitConfig()) {
    const pitMeshes = buildMinePitMeshes(heightField.getPitConfig()!, heightField.getPitFloorY());
    root.add(pitMeshes);
    tunnels?.ensureBuilt();
    if (tunnels) root.add(tunnels.root);
  }

  if (poiConfig.hasMarket && poiConfig.poi.market) {
    const { x, z } = poiConfig.poi.market;
    const baseY = heightField.getHeight(x + 5, z + 5);
    const built = buildMarketStructuresAt(x, z, baseY, market);
    root.add(built.group);
    marketStalls = built.stalls;
    marketOrigin = { x, z, baseY };
    root.add(buildPoiBeacon(x + 5, z + 5, baseY, POI_BEACON_COLORS.market));
    poiAnchors.push({ kind: 'market', label: 'Market', position: new Vector3(x + 5, baseY + 7, z + 5) });
  }

  if (poiConfig.hasMine && poiConfig.poi.mine) {
    const { x, z } = poiConfig.poi.mine;
    const rimY = heightField.getHeight(x + PIT_RADIUS * 0.9, z);
    root.add(buildPoiBeacon(x, z, rimY, POI_BEACON_COLORS.mine));
    poiAnchors.push({
      kind: 'mine',
      label: poiConfig.isGas ? 'Siphon' : 'Mine',
      position: new Vector3(x, rimY + 6, z),
    });
  }

  root.add(buildSurfaceProps(heightField, poiConfig.seed));

  terrainManager.update(spawn.x, spawn.z);

  return {
    root,
    heightField,
    terrainManager,
    tunnels,
    collision,
    zones,
    poiAnchors,
    marketStalls,
    marketOrigin,
    spawn,
  };
}

export function disposeSurfaceWorldResult(world: SurfaceWorldResult): void {
  world.terrainManager.dispose();
  world.tunnels?.dispose();
}
