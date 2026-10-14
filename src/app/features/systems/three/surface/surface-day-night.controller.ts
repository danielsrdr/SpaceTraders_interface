import { Color, DirectionalLight, Fog, HemisphereLight, Scene } from 'three';
import { smoothstep } from '../motion.util';

export const DAY_LENGTH_S = 150;

const SUN_NOON = new Color(0xfff7ed);
const SUN_DUSK = new Color(0xff9a4d);
const SKY_DAY = new Color(0xc7e4ff);
const SKY_DUSK = new Color(0xe8915a);
const SKY_NIGHT = new Color(0x0a1024);
const FOG_DUSK = new Color(0xc4632f);
const FOG_NIGHT = new Color(0x0a1228);
const SKY_VACUUM = new Color(0x000000);

export interface DayNightLights {
  sun: DirectionalLight;
  hemi: HemisphereLight;
  ambient: { intensity: number };
}

export interface DayNightScene {
  background: Color | null;
  fog: Fog | null;
}

export interface DayNightNightEmitters {
  nightLights: Array<{ light: { intensity: number }; base: number }>;
  nightGlows: Array<{ mat: { emissiveIntensity: number }; base: number }>;
}

export interface DayNightState {
  baseFogNear: number;
  baseFogFar: number;
  fogDayColor: Color;
  weatherIntensity: number;
  /** Surface day length in seconds (defaults to {@link DAY_LENGTH_S}). */
  cycleSec?: number;
  /** Daytime sky colour from the planet environment. */
  skyDay?: Color;
  /** No atmosphere: sky stays black, no dusk glow. */
  vacuum?: boolean;
  /** Sun never sets (PERPETUAL_DAYLIGHT). */
  perpetualDaylight?: boolean;
  sunColor?: Color;
  /** Direct light relative to the default Earth-like 1.0. */
  sunIntensityScale?: number;
  /** Fill light relative to the default Earth-like 1.0. */
  ambientScale?: number;
}

export function computeDayNight(
  elapsed: number,
  lights: DayNightLights,
  scene: DayNightScene,
  emitters: DayNightNightEmitters,
  state: DayNightState,
  setTerrainSun: (x: number, y: number, z: number) => void,
  setTunnelNightBoost: (boost: boolean) => void,
): { dayness: number; elevation: number } {
  const angle = (elapsed / (state.cycleSec ?? DAY_LENGTH_S)) * Math.PI * 2;
  const elevation = state.perpetualDaylight ? 0.55 + 0.15 * Math.sin(angle) : Math.sin(angle);
  const dayness = smoothstep(-0.08, 0.25, elevation);
  const night = 1 - dayness;
  const dusk = state.vacuum ? 0 : Math.max(0, 1 - Math.abs(elevation) / 0.22) * dayness;
  const sunScale = state.sunIntensityScale ?? 1;
  const fillScale = state.ambientScale ?? 1;

  lights.sun.position.set(Math.cos(angle) * 80, elevation * 90, 30);
  lights.sun.intensity = (0.04 + dayness * 1.5) * sunScale;
  lights.sun.color.copy(new Color().copy(state.sunColor ?? SUN_NOON).lerp(SUN_DUSK, dusk));

  setTunnelNightBoost(elevation < 0.12);

  if (scene.background) {
    scene.background.copy(
      state.vacuum
        ? SKY_VACUUM
        : new Color()
            .copy(SKY_NIGHT)
            .lerp(state.skyDay ?? SKY_DAY, dayness)
            .lerp(SKY_DUSK, dusk * 0.6),
    );
  }
  if (scene.fog) {
    const fogColor = new Color()
      .copy(state.vacuum ? SKY_VACUUM : FOG_NIGHT)
      .lerp(state.fogDayColor, dayness)
      .lerp(FOG_DUSK, dusk * 0.6);
    scene.fog.color.copy(fogColor);
    const weatherShrink = 1 - state.weatherIntensity * 0.45;
    scene.fog.near = state.baseFogNear * weatherShrink;
    scene.fog.far = state.baseFogFar * (0.6 + dayness * 0.4) * weatherShrink;
  }

  lights.hemi.intensity = (0.12 + dayness * 0.45) * fillScale;
  lights.ambient.intensity = (0.05 + dayness * 0.14) * fillScale;

  setTerrainSun(lights.sun.position.x, lights.sun.position.y, lights.sun.position.z);

  for (const nl of emitters.nightLights) nl.light.intensity = nl.base * night;
  for (const ng of emitters.nightGlows) ng.mat.emissiveIntensity = ng.base * (0.4 + 0.9 * night);

  return { dayness, elevation };
}

export function applyWeatherFogShrink(
  fog: Fog,
  baseNear: number,
  baseFar: number,
  weatherIntensity: number,
): void {
  const shrink = 1 - weatherIntensity * 0.45;
  fog.near = baseNear * shrink;
  fog.far = baseFar * shrink;
}
