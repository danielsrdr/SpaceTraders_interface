import { PlanetView } from '../../../models/system.model';
import { isAsteroidWaypoint, isGasGiantWaypoint } from '../planet-helpers';
import { buildSurfaceTraitProfile, type SurfaceTraitProfile } from './surface-trait-profile';
import { resolveSurfacePois, type SurfacePoiDefinition } from './surface-poi-registry';
import { planetSeedInt } from './planet-seed';
import type { SurfaceZoneKind } from './system-view-mode';

export interface PoiPositions {
  market: { x: number; z: number } | null;
  mine: { x: number; z: number } | null;
  shipyard: { x: number; z: number } | null;
  ruins: { x: number; z: number } | null;
  depot: { x: number; z: number } | null;
  cave: { x: number; z: number } | null;
}

export interface SurfacePoiConfig {
  seed: number;
  hasMarket: boolean;
  hasMine: boolean;
  hasShipyard: boolean;
  hasRuins: boolean;
  hasDepot: boolean;
  isGas: boolean;
  isAsteroid: boolean;
  pois: SurfacePoiDefinition[];
  poi: PoiPositions;
  profile: SurfaceTraitProfile;
}

function emptyPoiPositions(): PoiPositions {
  return { market: null, mine: null, shipyard: null, ruins: null, depot: null, cave: null };
}

function projectPoiPositions(pois: SurfacePoiDefinition[]): PoiPositions {
  const positions = emptyPoiPositions();
  for (const poi of pois) {
    positions[poi.kind] = { x: poi.position.x, z: poi.position.z };
  }
  return positions;
}

export function buildSurfacePoiConfig(planet: PlanetView): SurfacePoiConfig {
  const seed = planetSeedInt(planet.name);
  const pois = resolveSurfacePois(planet);
  const poi = projectPoiPositions(pois);

  return {
    seed,
    hasMarket: poi.market !== null,
    hasMine: poi.mine !== null,
    hasShipyard: poi.shipyard !== null,
    hasRuins: poi.ruins !== null,
    hasDepot: poi.depot !== null,
    isGas: isGasGiantWaypoint(planet),
    isAsteroid: isAsteroidWaypoint(planet),
    pois,
    poi,
    profile: buildSurfaceTraitProfile(planet),
  };
}

export function hasPoiKind(config: SurfacePoiConfig, kind: SurfaceZoneKind): boolean {
  return config.pois.some((p) => p.kind === kind);
}
