import type { SurfaceTraitProfile, SurfaceWeatherKind } from './surface-trait-profile';

export type SurfaceAmbienceKind = 'desert-wind' | 'industrial-hum' | 'frozen-silence' | 'jungle-hum';

export interface SurfaceAmbienceProfile {
  kind: SurfaceAmbienceKind;
  volume: number;
}

/** Pick a surface ambience loop from biome bias and active weather. */
export function resolveSurfaceAmbience(
  profile: SurfaceTraitProfile,
  weather: SurfaceWeatherKind | null,
): SurfaceAmbienceProfile {
  if (weather === 'sand-storm') {
    return { kind: 'desert-wind', volume: 0.85 };
  }
  if (weather === 'aurora' || (profile.biomeBias.rocky ?? 0) > 0.4) {
    return { kind: 'frozen-silence', volume: 0.35 };
  }
  if ((profile.biomeBias.industrial ?? 0) > 0.35) {
    return { kind: 'industrial-hum', volume: 0.55 };
  }
  if ((profile.biomeBias.jungle ?? 0) > 0.35) {
    return { kind: 'jungle-hum', volume: 0.4 };
  }
  if ((profile.biomeBias.desert ?? 0) > 0.3 || (profile.biomeBias.sand ?? 0) > 0.3) {
    return { kind: 'desert-wind', volume: 0.45 };
  }
  return { kind: 'frozen-silence', volume: 0.25 };
}

/** Human label for HUD / debug (no Web Audio in v1 — hook for future audio). */
export function surfaceAmbienceLabel(kind: SurfaceAmbienceKind): string {
  switch (kind) {
    case 'desert-wind':
      return 'Wind across open regolith';
    case 'industrial-hum':
      return 'Distant machinery';
    case 'frozen-silence':
      return 'Thin frozen air';
    case 'jungle-hum':
      return 'Dense canopy resonance';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
