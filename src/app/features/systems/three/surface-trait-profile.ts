import { PlanetView, hasTrait } from '../../../models/system.model';
import { isAsteroidWaypoint, isGasGiantWaypoint } from '../planet-helpers';
import type { BiomeKind } from './terrain/terrain-height';
import {
  planetEnvironment,
  type PlanetEnvironment,
  type SurfaceWeatherKind as EnvironmentWeatherKind,
} from './planet-environment';

export type SurfaceWeatherKind = EnvironmentWeatherKind;

export interface SurfaceTraitProfile {
  biomeBias: Partial<Record<BiomeKind, number>>;
  fogColor: number;
  skyTint: number;
  propDensity: number;
  weatherPool: SurfaceWeatherKind[];
  hazardLevel: number;
  sandColor: number;
  rockColor: number;
  grassColor: number;
  /** Physical environment the profile was derived from (plain data, worker-safe). */
  environment: PlanetEnvironment;
}

/** Environment terrain hints → the five walkable biomes. */
const BIOME_OF_HINT: Record<string, BiomeKind> = {
  jungle: 'jungle',
  swamp: 'jungle',
  shore: 'sand',
  desert: 'desert',
  saltflat: 'desert',
  sand: 'sand',
  ice: 'rocky',
  lava: 'rocky',
  rocky: 'rocky',
  industrial: 'industrial',
};

/**
 * Derive walkable-surface palette, biome bias, sky/fog and weather pool from the
 * physical environment (type + traits + host star) plus a few legacy trait tweaks.
 */
export function buildSurfaceTraitProfile(
  planet: PlanetView,
  starType?: string | null,
): SurfaceTraitProfile {
  const environment = planetEnvironment(planet, { starType });
  const { terrain, sky } = environment;

  const biomeBias: Partial<Record<BiomeKind, number>> = {};
  for (const [hint, weight] of Object.entries(terrain.biomeBias)) {
    const biome = BIOME_OF_HINT[hint];
    if (biome && weight) biomeBias[biome] = (biomeBias[biome] ?? 0) + weight;
  }

  const profile: SurfaceTraitProfile = {
    biomeBias,
    fogColor: sky.fogColor,
    skyTint: sky.horizonColor,
    propDensity: 1,
    weatherPool: [...environment.weatherPool],
    hazardLevel: environment.hazardLevel,
    sandColor: terrain.sandColor,
    rockColor: terrain.rockColor,
    grassColor: terrain.grassColor,
    environment,
  };

  if (isGasGiantWaypoint(planet)) {
    profile.propDensity = 0.35;
    profile.weatherPool = ['giant-winds'];
    return profile;
  }

  if (isAsteroidWaypoint(planet)) {
    profile.propDensity = 1.3;
    profile.weatherPool = [];
    return profile;
  }

  profile.propDensity = 0.4 + Math.min(1.2, terrain.floraDensity) * 0.9;

  if (hasTrait(planet, 'HAZARDOUS')) {
    profile.hazardLevel = Math.max(profile.hazardLevel, 0.7);
    profile.fogColor = 0xf97316;
    profile.weatherPool.push('acid-rain');
  }

  if (hasTrait(planet, 'MINERAL_DEPOSITS')) {
    profile.propDensity += 0.4;
    biomeBias.industrial = (biomeBias.industrial ?? 0) + 0.2;
    biomeBias.rocky = (biomeBias.rocky ?? 0) + 0.2;
  }

  profile.weatherPool = [...new Set(profile.weatherPool)];
  return profile;
}
