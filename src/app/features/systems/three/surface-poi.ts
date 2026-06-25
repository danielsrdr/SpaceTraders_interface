import { PlanetView, hasTrait } from '../../../models/system.model';
import {
  isAsteroidWaypoint,
  isGasGiantWaypoint,
  resolveWaypointType,
} from '../planet-helpers';
import { hashString } from './terrain/terrain-noise';

export interface PoiPositions {
  market: { x: number; z: number } | null;
  mine: { x: number; z: number } | null;
}

export interface SurfacePoiConfig {
  seed: number;
  hasMarket: boolean;
  hasMine: boolean;
  isGas: boolean;
  isAsteroid: boolean;
  poi: PoiPositions;
}

export function buildSurfacePoiConfig(planet: PlanetView): SurfacePoiConfig {
  const seed = hashString(planet.name);
  const isAsteroid = isAsteroidWaypoint(planet);
  const isGas = isGasGiantWaypoint(planet);
  const hasMarket = hasTrait(planet, 'MARKETPLACE');
  const hasMine =
    isAsteroid ||
    isGas ||
    hasTrait(planet, 'MINERAL_DEPOSITS') ||
    resolveWaypointType(planet.type) === 'PLANET';

  const poi: PoiPositions = {
    market: hasMarket
      ? { x: 8 + (seed % 6), z: 8 + ((seed >> 3) % 6) }
      : null,
    mine: hasMine
      ? { x: -12 - ((seed >> 6) % 8), z: -10 - ((seed >> 10) % 8) }
      : null,
  };

  return { seed, hasMarket, hasMine, isGas, isAsteroid, poi };
}
