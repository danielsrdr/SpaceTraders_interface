import { PlanetView, hasTrait } from '../../../models/system.model';
import { isAsteroidWaypoint, isGasGiantWaypoint } from '../planet-helpers';
import type { BiomeKind } from './terrain/terrain-height';

export type SurfaceWeatherKind = 'sand-storm' | 'acid-rain' | 'aurora' | 'giant-winds';

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
}

const BASE_PROFILE: SurfaceTraitProfile = {
  biomeBias: {},
  fogColor: 0xe8c896,
  skyTint: 0xc7e4ff,
  propDensity: 1,
  weatherPool: ['sand-storm'],
  hazardLevel: 0,
  sandColor: 0xd4a574,
  rockColor: 0xb45309,
  grassColor: 0x4ade80,
};

function cloneProfile(): SurfaceTraitProfile {
  return {
    ...BASE_PROFILE,
    biomeBias: { ...BASE_PROFILE.biomeBias },
    weatherPool: [...BASE_PROFILE.weatherPool],
  };
}

/** Derive walkable-surface palette, biome bias, and weather pool from API traits. */
export function buildSurfaceTraitProfile(planet: PlanetView): SurfaceTraitProfile {
  const profile = cloneProfile();

  if (isGasGiantWaypoint(planet)) {
    profile.fogColor = 0x4c1d95;
    profile.skyTint = 0x4c1d95;
    profile.weatherPool = ['giant-winds'];
    profile.propDensity = 0.35;
    profile.sandColor = 0xa78bfa;
    return profile;
  }

  if (isAsteroidWaypoint(planet)) {
    profile.biomeBias.rocky = 0.5;
    profile.propDensity = 1.3;
    profile.fogColor = 0x78716c;
    profile.rockColor = 0x57534e;
    profile.weatherPool = ['sand-storm'];
    return profile;
  }

  if (hasTrait(planet, 'JUNGLE')) {
    profile.biomeBias.jungle = (profile.biomeBias.jungle ?? 0) + 0.4;
    profile.fogColor = 0x86efac;
    profile.grassColor = 0x22c55e;
  }

  if (hasTrait(planet, 'FROZEN')) {
    profile.biomeBias.rocky = (profile.biomeBias.rocky ?? 0) + 0.35;
    profile.fogColor = 0x93c5fd;
    profile.skyTint = 0xbfdbfe;
    profile.sandColor = 0xd1d5db;
    profile.rockColor = 0x9ca3af;
    profile.weatherPool.push('aurora');
  }

  if (hasTrait(planet, 'HAZARDOUS')) {
    profile.hazardLevel = 0.7;
    profile.fogColor = 0xf97316;
    profile.weatherPool.push('acid-rain');
  }

  if (hasTrait(planet, 'MINERAL_DEPOSITS')) {
    profile.propDensity += 0.4;
    profile.biomeBias.industrial = (profile.biomeBias.industrial ?? 0) + 0.2;
    profile.biomeBias.rocky = (profile.biomeBias.rocky ?? 0) + 0.2;
  }

  profile.weatherPool = [...new Set(profile.weatherPool)];
  return profile;
}
