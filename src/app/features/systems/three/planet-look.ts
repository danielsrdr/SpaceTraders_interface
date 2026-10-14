import type { PlanetView } from '../../../models/system.model';
import { mixColor, planetEnvironment, type EnvironmentKind } from './planet-environment';

/**
 * Orbital (distant) appearance of a planet, derived from its surface
 * environment so the globe seen from space matches what the player lands on.
 * Pure and deterministic.
 */
export interface PlanetLook {
  kind: EnvironmentKind;
  /** Lowland / highland land colours (sRGB hex). */
  landLow: number;
  landHigh: number;
  /** Surface liquid colour; irrelevant when seaLevel is 0. */
  liquidColor: number;
  /** Noise threshold below which the surface is liquid; 0 = no liquid. */
  seaLevel: number;
  /** Liquid reflects the sun (water / methane); lava glows, ice is matte. */
  liquidSpecular: boolean;
  /** Lava is self-lit: visible on the night side. */
  liquidEmissive: boolean;
  /** Polar cap colour and extent (0 = none, 1 = whole globe). */
  capColor: number;
  capCover: number;
  /** Cloud layer coverage 0..1 and colour. */
  cloudCover: number;
  cloudColor: number;
  /** Atmospheric halo; thickness 0 = no halo at all (airless body). */
  atmosphere: { color: number; thickness: number; shellScale: number; alpha: number };
  /** Direct light colour and multiplier on the diffuse term. */
  sunColor: number;
  sunIntensity: number;
}

const SEA_LEVEL: Partial<Record<EnvironmentKind, number>> = {
  ocean: 0.62,
  temperate: 0.5,
  jungle: 0.4,
  swamp: 0.45,
  frozen: 0.42,
  volcanic: 0.4,
  toxic: 0.4,
};

const BASE_CLOUDS: Partial<Record<EnvironmentKind, number>> = {
  ocean: 0.55,
  temperate: 0.4,
  jungle: 0.55,
  swamp: 0.5,
  frozen: 0.3,
  volcanic: 0.5,
  toxic: 0.95,
  desert: 0.1,
  'gas-giant': 0,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function planetLook(planet: PlanetView, starType?: string | null): PlanetLook {
  const env = planetEnvironment(planet, { starType });
  const t = env.terrain;
  const p = env.atmosphere.pressureBar;

  // 0 (vacuum) .. 1 (≈10 bar): drives halo thickness and cloud presence.
  const density = p > 0 ? clamp01(Math.log10(1 + p * 9) / 2) : 0;

  const liquid = t.liquid;
  const seaLevel = liquid ? (SEA_LEVEL[env.kind] ?? 0.35) : 0;

  let cloudCover = (BASE_CLOUDS[env.kind] ?? 0.15) * clamp01(density * 2);
  if (env.sky.overcast) cloudCover = Math.max(cloudCover, 0.85 * clamp01(density * 2));
  if (p <= 0) cloudCover = 0;

  let cloudColor = mixColor(0xffffff, env.sky.sunColor, 0.15);
  if (env.kind === 'toxic') cloudColor = mixColor(0xe8d9a0, env.atmosphere.scatterColor, 0.2);
  else if (env.kind === 'volcanic') cloudColor = 0x5a5550;
  else if (env.atmosphere.toxic)
    cloudColor = mixColor(cloudColor, env.atmosphere.scatterColor, 0.4);

  const iceish = env.kind === 'frozen';
  const capCover = clamp01(Math.max(t.snowCover, iceish ? 0.5 : 0));
  const capColor = mixColor(0xeef4ff, env.sky.sunColor, 0.1);

  const thickness = density;
  return {
    kind: env.kind,
    landLow: mixColor(t.sandColor, t.rockColor, 0.35),
    landHigh: mixColor(t.rockColor, t.grassColor, t.floraDensity > 0.2 ? 0.45 : 0.1),
    liquidColor: t.liquidColor,
    seaLevel,
    liquidSpecular: liquid === 'water' || liquid === 'methane',
    liquidEmissive: liquid === 'lava',
    capColor,
    capCover,
    cloudCover,
    cloudColor,
    atmosphere: {
      color: env.atmosphere.scatterColor,
      thickness,
      shellScale: thickness > 0 ? 1.015 + 0.055 * thickness : 1,
      alpha: thickness > 0 ? 0.25 + 0.6 * thickness : 0,
    },
    sunColor: env.sky.sunColor,
    sunIntensity: Math.max(0.6, Math.min(1.5, env.sky.sunIntensity / 1.4)),
  };
}
