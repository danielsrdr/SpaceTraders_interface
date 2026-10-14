import type { PlanetView } from '../../../models/system.model';
import {
  API_UNIT_KM,
  AU_KM,
  bodyPhysics,
  equilibriumTemperatureK,
  normalizeWaypointType,
  orbitalPeriodSec,
  relativeFlux,
  starProfile,
  symbolUnit,
} from './universe-physics';

/**
 * Surface environment of a waypoint: atmosphere, climate, sky, weather and
 * terrain hints. Pure and deterministic — derived from the waypoint type, its
 * API traits/modifiers, the host star and the symbol (for per-body variation).
 */

export type EnvironmentKind =
  | 'temperate'
  | 'ocean'
  | 'jungle'
  | 'swamp'
  | 'desert'
  | 'frozen'
  | 'volcanic'
  | 'toxic'
  | 'barren'
  | 'gas-giant'
  | 'asteroid'
  | 'station';

export type SurfaceWeatherKind =
  | 'sand-storm'
  | 'acid-rain'
  | 'aurora'
  | 'giant-winds'
  | 'ash-fall'
  | 'snow';

export type EnvironmentLiquid = 'water' | 'lava' | 'ice' | 'methane';

export interface EnvironmentAtmosphere {
  /** Surface pressure (bar); 0 = vacuum. */
  pressureBar: number;
  breathable: boolean;
  toxic: boolean;
  corrosive: boolean;
  /** Rayleigh-like scattered sky colour (sRGB hex); black without atmosphere. */
  scatterColor: number;
}

export interface EnvironmentSky {
  zenithColor: number;
  horizonColor: number;
  fogColor: number;
  /** 0 = no fog (vacuum) .. 1 = opaque. */
  fogDensity: number;
  /** Colour of the direct sunlight. */
  sunColor: number;
  /** Direct light intensity (≈1.4 for Earth at noon). */
  sunIntensity: number;
  /** Apparent angular radius of the star (rad). */
  sunAngularRadius: number;
  /** Fill light relative to Earth (≈0 in vacuum: hard shadows). */
  ambientScale: number;
  /** Stars are visible by day (vacuum / very thin air). */
  starsByDay: boolean;
  /** Heavy cloud cover: soft light, grey sky. */
  overcast: boolean;
}

export interface EnvironmentTerrain {
  biomeBias: Partial<Record<string, number>>;
  sandColor: number;
  rockColor: number;
  grassColor: number;
  /** Surface liquid kind and level (terrain height units), if any. */
  liquid: EnvironmentLiquid | null;
  liquidLevel: number;
  liquidColor: number;
  /** 0..1 */
  craterDensity: number;
  craterDepth: number;
  canyonStrength: number;
  floraDensity: number;
  saltFlats: number;
  /** Multiplier on relief amplitude (low gravity ⇒ taller, rougher relief). */
  reliefScale: number;
  /** Fraction of the surface covered in snow/frost (0..1). */
  snowCover: number;
}

export interface PlanetEnvironment {
  kind: EnvironmentKind;
  atmosphere: EnvironmentAtmosphere;
  /** Mean daytime surface temperature (K). */
  temperatureK: number;
  /** Peak-to-peak day/night temperature swing (K). */
  dayNightSwingK: number;
  gravityMs2: number;
  /** Physical length of the solar day (s). */
  dayLengthSec: number;
  tidallyLocked: boolean;
  perpetualDaylight: boolean;
  /** Heliocentric distance (km) used for flux. */
  distanceKm: number;
  /** Stellar flux relative to Earth. */
  flux: number;
  sky: EnvironmentSky;
  weatherPool: SurfaceWeatherKind[];
  terrain: EnvironmentTerrain;
  hazardLevel: number;
}

export interface PlanetEnvironmentOptions {
  starType?: string | null;
  /** Parent body (for moons): heliocentric position and tidal day. */
  parent?: PlanetView | null;
}

const MIN_DISTANCE_KM = 0.2 * AU_KM;
const AIRLESS_BAR = 1e-4;

// ─── colour helpers (sRGB hex ↔ linear-ish channels) ─────────────────────────

function rgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function pack(r: number, g: number, b: number): number {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

export function mixColor(a: number, b: number, t: number): number {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const k = Math.max(0, Math.min(1, t));
  return pack(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

function scaleColor(hex: number, f: number): number {
  const [r, g, b] = rgb(hex);
  return pack(r * f, g * f, b * f);
}

/** Rayleigh scattering ∝ λ⁻⁴ applied to the star colour (R 650 nm, G 550 nm, B 450 nm). */
export function rayleighScatter(starColor: number): number {
  const [r, g, b] = rgb(starColor);
  const sr = r * 1;
  const sg = g * 1.95;
  const sb = b * 4.35;
  const max = Math.max(sr, sg, sb, 1);
  return pack((sr / max) * 255, (sg / max) * 255, (sb / max) * 255);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─── traits ──────────────────────────────────────────────────────────────────

const ASTEROID_TYPES = new Set([
  'ASTEROID',
  'ENGINEERED_ASTEROID',
  'ASTEROID_BASE',
  'ASTEROID_FIELD',
  'DEBRIS_FIELD',
]);
const STATION_TYPES = new Set(['ORBITAL_STATION', 'FUEL_STATION', 'JUMP_GATE']);

/** Traits that give a MOON a real atmosphere. */
const MOON_ATMOSPHERE_TRAITS = [
  'BREATHABLE_ATMOSPHERE',
  'TOXIC_ATMOSPHERE',
  'CORROSIVE_ATMOSPHERE',
  'THIN_ATMOSPHERE',
  'TEMPERATE',
  'OCEAN',
  'JUNGLE',
  'SWAMP',
  'EXTREME_PRESSURE',
  'ASH_CLOUDS',
  'PERPETUAL_OVERCAST',
  'TERRAFORMED',
  'VIBRANT_AURORAS',
  'EXPLOSIVE_GASES',
];

function symbolSet(planet: PlanetView): Set<string> {
  const out = new Set<string>();
  for (const t of planet.traits ?? []) out.add(t.symbol);
  for (const m of planet.modifiers ?? []) out.add(m.symbol);
  return out;
}

function hasAny(set: Set<string>, ...symbols: string[]): boolean {
  return symbols.some((s) => set.has(s));
}

function heliocentricDistanceKm(planet: PlanetView, parent: PlanetView | null | undefined): number {
  const anchor = parent ?? planet;
  const units = Math.hypot(anchor.position.x, anchor.position.y);
  return Math.max(units * API_UNIT_KM, MIN_DISTANCE_KM);
}

const ALBEDO: Record<EnvironmentKind, number> = {
  temperate: 0.3,
  ocean: 0.3,
  jungle: 0.25,
  swamp: 0.25,
  desert: 0.32,
  frozen: 0.65,
  volcanic: 0.15,
  toxic: 0.6,
  barren: 0.12,
  'gas-giant': 0.5,
  asteroid: 0.06,
  station: 0.3,
};

const PALETTE: Record<EnvironmentKind, [number, number, number]> = {
  temperate: [0xc9b88a, 0x8a8478, 0x4a9a4a],
  ocean: [0xe0d2a8, 0x7a7a80, 0x3f8f5a],
  jungle: [0x8a7a50, 0x5c5a48, 0x1f8a3a],
  swamp: [0x5e5a3a, 0x4a4a3c, 0x4a6a2a],
  desert: [0xd4a574, 0xb45309, 0x8a8a3a],
  frozen: [0xe5eef5, 0x9fb2c4, 0xcfe3ee],
  volcanic: [0x2a2523, 0x3a2a26, 0x5a2a1a],
  toxic: [0xa8a64a, 0x6a6a3a, 0x7a9a2a],
  barren: [0x8a8480, 0x6a6560, 0x7a7468],
  'gas-giant': [0xa78bfa, 0x7c6ad0, 0x8b7fe0],
  asteroid: [0x6b645c, 0x57534e, 0x6b645c],
  station: [0x9ca3af, 0x6b7280, 0x9ca3af],
};

function classify(
  type: string,
  traits: Set<string>,
  temperatureK: number,
  hasAtmosphere: boolean,
): EnvironmentKind {
  if (STATION_TYPES.has(type)) return 'station';
  if (type === 'GAS_GIANT' || traits.has('JOVIAN')) return 'gas-giant';
  if (ASTEROID_TYPES.has(type)) return 'asteroid';
  if (hasAny(traits, 'VOLCANIC', 'MAGMA_SEAS', 'SUPERVOLCANOES')) return 'volcanic';
  if (hasAny(traits, 'FROZEN', 'ICE_CRYSTALS')) return 'frozen';
  if (traits.has('OCEAN')) return 'ocean';
  if (traits.has('SWAMP')) return 'swamp';
  if (traits.has('JUNGLE')) return 'jungle';
  if (hasAny(traits, 'TOXIC_ATMOSPHERE', 'CORROSIVE_ATMOSPHERE', 'RADIOACTIVE')) return 'toxic';
  if (hasAny(traits, 'DRY_SEABEDS', 'SALT_FLATS')) return 'desert';
  if (hasAny(traits, 'TEMPERATE', 'BREATHABLE_ATMOSPHERE', 'TERRAFORMED')) return 'temperate';
  if (traits.has('BARREN') || !hasAtmosphere) return 'barren';
  if (temperatureK < 245) return 'frozen';
  return 'desert';
}

function surfacePressureBar(
  planet: PlanetView,
  type: string,
  traits: Set<string>,
  gravityMs2: number,
): number {
  if (STATION_TYPES.has(type)) return 1;
  if (type === 'GAS_GIANT' || traits.has('JOVIAN')) return 1; // cloud deck reference level
  if (ASTEROID_TYPES.has(type)) return 0;
  if (traits.has('STRIPPED')) return 0;
  const u = symbolUnit(planet.name, 21);
  if (traits.has('EXTREME_PRESSURE')) return 50 + 45 * u;
  if (traits.has('THIN_ATMOSPHERE')) return 0.05;
  if (traits.has('BARREN')) return 0;
  if (type === 'MOON' && !hasAny(traits, ...MOON_ATMOSPHERE_TRAITS)) return 0;
  const gravityFactor = clamp(gravityMs2 / 9.8, 0.4, 2.5);
  let p = (0.5 + 1.0 * u) * gravityFactor;
  if (type === 'MOON') p *= 0.5;
  if (hasAny(traits, 'VOLCANIC', 'SUPERVOLCANOES')) p *= 1.5;
  return clamp(p, 0.1, 8);
}

function gasGiantScatter(temperatureK: number, name: string): number {
  const u = symbolUnit(name, 22);
  if (temperatureK < 130) return mixColor(0x7fb4d8, 0x9fd0e8, u);
  if (temperatureK < 260) return mixColor(0xc9a87a, 0xd9b98a, u);
  return mixColor(0xb8864a, 0xc96a3a, u);
}

function dayLength(
  planet: PlanetView,
  type: string,
  phys: ReturnType<typeof bodyPhysics>,
  parent: PlanetView | null | undefined,
): { sec: number; locked: boolean } {
  if (STATION_TYPES.has(type)) return { sec: 86_400, locked: false };
  if (Math.abs(phys.rotationPeriodSec) > 1) {
    return { sec: Math.abs(phys.rotationPeriodSec), locked: false };
  }
  // Tidally locked: the solar day equals the orbital period around the parent.
  if (parent) {
    const pp = bodyPhysics(parent);
    const a = pp.radiusKm * (8 + 20 * symbolUnit(planet.name, 23));
    const t = orbitalPeriodSec(pp.mu, a);
    if (Number.isFinite(t)) return { sec: clamp(t, 3_600, 30 * 86_400), locked: true };
  }
  return { sec: (1.5 + 6 * symbolUnit(planet.name, 24)) * 86_400, locked: true };
}

/** Physical environment of a waypoint (deterministic). */
export function planetEnvironment(
  planet: PlanetView,
  opts: PlanetEnvironmentOptions = {},
): PlanetEnvironment {
  const type = normalizeWaypointType(planet.type);
  const traits = symbolSet(planet);
  const star = starProfile(opts.starType);
  const parent = opts.parent ?? null;
  const phys = bodyPhysics(planet);
  const gravityMs2 = phys.surfaceGravityMs2;

  // ── atmosphere ──
  const isGasGiant = type === 'GAS_GIANT' || traits.has('JOVIAN');
  const pressureBar = surfacePressureBar(planet, type, traits, gravityMs2);
  const hasAtmosphere = pressureBar > AIRLESS_BAR;

  // ── climate ──
  const distanceKm = heliocentricDistanceKm(planet, parent);
  const flux = relativeFlux(star.luminositySolar, distanceKm);
  const kindForAlbedo = classify(type, traits, 280, hasAtmosphere);
  let temperatureK = equilibriumTemperatureK(
    star.luminositySolar,
    distanceKm,
    ALBEDO[kindForAlbedo],
  );
  if (isGasGiant) {
    temperatureK += 40; // internal heat
  } else if (hasAtmosphere) {
    const dense = hasAny(traits, 'TOXIC_ATMOSPHERE', 'CORROSIVE_ATMOSPHERE') ? 1.5 : 1;
    temperatureK += Math.min(700, 33 * Math.sqrt(pressureBar) * dense);
  }
  const kind = classify(type, traits, temperatureK, hasAtmosphere);

  const frozenTrait = hasAny(traits, 'FROZEN', 'ICE_CRYSTALS');
  const hotTrait = hasAny(traits, 'VOLCANIC', 'MAGMA_SEAS', 'SUPERVOLCANOES');
  if (traits.has('FROZEN')) temperatureK = Math.min(temperatureK, 258 - 18 * symbolUnit(planet.name, 25));
  if (traits.has('ICE_CRYSTALS')) temperatureK = Math.min(temperatureK, 268);
  if (hotTrait) {
    const floor = traits.has('MAGMA_SEAS') ? 520 : traits.has('SUPERVOLCANOES') ? 400 : 430;
    temperatureK = Math.max(temperatureK, floor + 60 * symbolUnit(planet.name, 26));
  }
  if (!frozenTrait && !hotTrait && hasAny(traits, 'TEMPERATE', 'BREATHABLE_ATMOSPHERE', 'TERRAFORMED')) {
    temperatureK = clamp(temperatureK, 270, 305);
  }
  temperatureK = Math.max(temperatureK, 3);

  const dayInfo = dayLength(planet, type, phys, parent);
  const perpetualDaylight = traits.has('PERPETUAL_DAYLIGHT');
  const overcast = hasAny(traits, 'PERPETUAL_OVERCAST', 'ASH_CLOUDS') || isGasGiant;

  let swing = (140 / (1 + 8 * pressureBar)) * clamp(Math.sqrt(dayInfo.sec / 86_400), 0.5, 2);
  if (STATION_TYPES.has(type)) swing = 4;
  if (traits.has('EXTREME_TEMPERATURES')) swing *= 2.5;
  if (perpetualDaylight) swing *= 0.2;
  if (overcast) swing *= 0.5;

  // ── atmosphere composition ──
  const toxic =
    isGasGiant || hasAny(traits, 'TOXIC_ATMOSPHERE', 'EXPLOSIVE_GASES', 'RADIOACTIVE');
  const corrosive = traits.has('CORROSIVE_ATMOSPHERE');
  const naturalBreathable =
    hasAtmosphere &&
    !toxic &&
    !corrosive &&
    pressureBar >= 0.5 &&
    pressureBar <= 3 &&
    hasAny(traits, 'BREATHABLE_ATMOSPHERE', 'TEMPERATE', 'TERRAFORMED');
  const breathable = STATION_TYPES.has(type) || naturalBreathable;

  let scatter = rayleighScatter(star.color);
  if (isGasGiant) scatter = gasGiantScatter(temperatureK, planet.name);
  else if (pressureBar >= 50) scatter = mixColor(scatter, 0xd9a14a, 0.7);
  else if (corrosive) scatter = mixColor(scatter, 0xd8c34a, 0.6);
  else if (toxic) scatter = mixColor(scatter, 0x9ab84a, 0.5);
  else if (traits.has('ASH_CLOUDS')) scatter = mixColor(scatter, 0x6a6058, 0.7);
  else if (hotTrait) scatter = mixColor(scatter, 0xb0705a, 0.45);
  else if (traits.has('SWAMP')) scatter = mixColor(scatter, 0x8aa86a, 0.35);

  const atmosphere: EnvironmentAtmosphere = {
    pressureBar: hasAtmosphere ? pressureBar : 0,
    breathable,
    toxic,
    corrosive,
    scatterColor: hasAtmosphere ? scatter : 0x000000,
  };

  // ── sky ──
  const skyLuma = clamp(0.35 + 0.65 * Math.sqrt(Math.min(flux, 1)), 0.25, 1);
  const thickness = hasAtmosphere ? clamp(0.55 + 0.2 * Math.log10(1 + pressureBar * 10), 0.4, 1) : 0;
  let zenith = scaleColor(scatter, 0.55 * skyLuma);
  let horizon = scaleColor(mixColor(scatter, star.color, 0.35 + 0.4 * (1 - thickness)), 0.95 * skyLuma);
  if (pressureBar >= 5 || isGasGiant) {
    zenith = mixColor(zenith, horizon, 0.5);
  }
  if (overcast) {
    const grey = scaleColor(mixColor(0x9a9a9a, scatter, 0.2), skyLuma);
    zenith = mixColor(zenith, scaleColor(grey, 0.8), 0.7);
    horizon = mixColor(horizon, grey, 0.7);
  }
  let fogDensity = 0;
  if (hasAtmosphere) {
    fogDensity = 0.1 + 0.12 * Math.log10(1 + pressureBar * 10);
    if (traits.has('ASH_CLOUDS')) fogDensity += 0.3;
    if (overcast) fogDensity += 0.2;
    if (kind === 'swamp') fogDensity += 0.15;
    if (kind === 'toxic') fogDensity += 0.1;
    if (isGasGiant) fogDensity += 0.4;
    fogDensity = clamp(fogDensity, 0, 0.95);
  }
  const fogColor = hasAtmosphere ? mixColor(horizon, 0xb8b8b8, overcast ? 0.1 : 0.05) : 0x000000;

  const sunBase = clamp(1.4 * Math.pow(Math.max(flux, 1e-6), 0.35), 0.15, 3);
  const atmoLoss = hasAtmosphere ? clamp(1 - 0.12 * Math.log10(1 + pressureBar * 10), 0.5, 1) : 1;
  const sunIntensity = sunBase * atmoLoss * (overcast ? 0.55 : 1) * (hasAtmosphere ? 1 : 1.15);
  const sunAngularRadius = clamp(Math.atan(star.radiusKm / distanceKm), 0.0015, 0.3);
  const ambientScale = hasAtmosphere
    ? clamp(Math.sqrt(pressureBar) * (overcast ? 1.3 : 1), 0.15, 1.5)
    : 0.03;
  const sky: EnvironmentSky = {
    zenithColor: hasAtmosphere ? zenith : 0x000000,
    horizonColor: hasAtmosphere ? horizon : 0x000000,
    fogColor,
    fogDensity,
    sunColor: star.color,
    sunIntensity,
    sunAngularRadius,
    ambientScale,
    starsByDay: !hasAtmosphere || pressureBar < 0.15,
    overcast,
  };

  // ── weather ──
  const weather: SurfaceWeatherKind[] = [];
  if (hasAtmosphere) {
    if (isGasGiant) weather.push('giant-winds');
    if (hasAny(traits, 'SUPERVOLCANOES', 'ASH_CLOUDS')) weather.push('ash-fall');
    if (corrosive || traits.has('TOXIC_ATMOSPHERE')) weather.push('acid-rain');
    if (hasAny(traits, 'STRONG_MAGNETOSPHERE', 'VIBRANT_AURORAS')) weather.push('aurora');
    if (frozenTrait || (kind === 'frozen' && pressureBar > 0.1)) weather.push('snow');
    if (kind === 'desert' || hasAny(traits, 'DRY_SEABEDS', 'SALT_FLATS')) weather.push('sand-storm');
    if (!weather.length && pressureBar >= 0.3 && kind !== 'ocean' && kind !== 'station') {
      weather.push(kind === 'frozen' ? 'snow' : 'sand-storm');
    }
  }

  // ── terrain ──
  const terrain = buildTerrainHints(planet, kind, traits, temperatureK, pressureBar, gravityMs2, hasAtmosphere);

  const hazardLevel = clamp(
    (toxic && !isGasGiant ? 0.4 : 0) +
      (corrosive ? 0.4 : 0) +
      (traits.has('RADIOACTIVE') ? 0.2 : 0) +
      (temperatureK > 400 ? 0.3 : 0) +
      (temperatureK < 200 ? 0.2 : 0) +
      (pressureBar >= 50 ? 0.3 : 0) +
      (!hasAtmosphere && !STATION_TYPES.has(type) ? 0.2 : 0),
    0,
    1,
  );

  return {
    kind,
    atmosphere,
    temperatureK,
    dayNightSwingK: swing,
    gravityMs2,
    dayLengthSec: dayInfo.sec,
    tidallyLocked: dayInfo.locked,
    perpetualDaylight,
    distanceKm,
    flux,
    sky,
    weatherPool: [...new Set(weather)],
    terrain,
    hazardLevel,
  };
}

function buildTerrainHints(
  planet: PlanetView,
  kind: EnvironmentKind,
  traits: Set<string>,
  temperatureK: number,
  pressureBar: number,
  gravityMs2: number,
  hasAtmosphere: boolean,
): EnvironmentTerrain {
  const [sandBase, rockBase, grassBase] = PALETTE[kind];
  const shade = 0.92 + 0.16 * symbolUnit(planet.name, 31);
  let sandColor = scaleColor(sandBase, shade);
  let rockColor = scaleColor(rockBase, shade);
  let grassColor = scaleColor(grassBase, shade);

  const bias: Partial<Record<string, number>> = {};
  const add = (k: string, v: number) => (bias[k] = (bias[k] ?? 0) + v);

  let liquid: EnvironmentLiquid | null = null;
  let liquidLevel = 0;
  let liquidColor = 0x2a6fb0;
  let flora = 0;
  let snow = 0;

  switch (kind) {
    case 'temperate':
      flora = 0.55;
      add('jungle', 0.15);
      break;
    case 'ocean':
      flora = 0.4;
      add('shore', 0.25);
      liquid = 'water';
      liquidLevel = 6.4;
      break;
    case 'jungle':
      flora = 0.95;
      add('jungle', 0.5);
      break;
    case 'swamp':
      flora = 0.6;
      add('swamp', 0.5);
      liquid = 'water';
      liquidLevel = 5.4;
      liquidColor = 0x4a5a2a;
      break;
    case 'desert':
      flora = 0.05;
      add('desert', 0.45);
      add('sand', 0.2);
      break;
    case 'frozen':
      add('ice', 0.55);
      add('rocky', 0.2);
      snow = 0.85;
      if (hasAtmosphere) {
        liquid = 'ice';
        liquidLevel = 5.6;
        liquidColor = 0xbfe3f5;
      }
      break;
    case 'volcanic':
      add('lava', 0.45);
      add('rocky', 0.3);
      break;
    case 'toxic':
      flora = 0.15;
      add('desert', 0.2);
      add('rocky', 0.15);
      break;
    case 'barren':
      add('rocky', 0.45);
      break;
    case 'gas-giant':
      add('sand', 0.6);
      break;
    case 'asteroid':
      add('rocky', 0.5);
      break;
    case 'station':
      add('industrial', 0.6);
      break;
  }

  // Traits.
  if (traits.has('MAGMA_SEAS')) {
    liquid = 'lava';
    liquidLevel = 6.2;
    liquidColor = 0xff5a14;
  } else if (hasAny(traits, 'VOLCANIC', 'SUPERVOLCANOES') && kind === 'volcanic') {
    liquid = 'lava';
    liquidLevel = traits.has('SUPERVOLCANOES') ? 4.6 : 3.4;
    liquidColor = 0xff5a14;
  }
  if (traits.has('SUPERVOLCANOES')) add('lava', 0.2);
  if (traits.has('METHANE_POOLS') && !liquid) {
    liquid = 'methane';
    liquidLevel = 4.4;
    liquidColor = 0x6a4a2a;
  }
  if (traits.has('ICE_CRYSTALS')) {
    add('ice', 0.3);
    snow = Math.max(snow, 0.5);
    sandColor = mixColor(sandColor, 0xe5eef5, 0.4);
  }
  if (traits.has('DRY_SEABEDS')) {
    add('desert', 0.25);
    sandColor = mixColor(sandColor, 0xd9c9a8, 0.35);
    liquid = null;
  }
  const saltFlats = traits.has('SALT_FLATS') ? 0.7 : 0;
  if (saltFlats) add('saltflat', 0.5);
  if (hasAny(traits, 'DIVERSE_LIFE')) flora = Math.max(flora, 0.5) * 1.5;
  if (traits.has('SCARCE_LIFE')) flora *= 0.25;
  if (traits.has('MUTATED_FLORA')) {
    grassColor = mixColor(grassColor, 0xb040d0, 0.55);
    flora = Math.max(flora, 0.4);
  }
  if (traits.has('RADIOACTIVE')) {
    grassColor = mixColor(grassColor, 0x6aff3a, 0.3);
    sandColor = mixColor(sandColor, 0x9aa84a, 0.2);
  }
  if (!hasAtmosphere || traits.has('BARREN') || traits.has('STRIPPED')) flora = 0;
  if (temperatureK > 450 && kind !== 'volcanic') flora = 0;

  const deep = traits.has('DEEP_CRATERS');
  const shallow = traits.has('SHALLOW_CRATERS');
  let craterDensity = 0;
  if (deep) craterDensity = 0.7;
  else if (shallow) craterDensity = 0.45;
  if (!hasAtmosphere) craterDensity = Math.max(craterDensity, 0.3 + 0.2 * symbolUnit(planet.name, 32));
  else craterDensity *= clamp(1 - pressureBar * 0.4, 0.2, 1);
  if (kind === 'gas-giant' || kind === 'station') craterDensity = 0;

  const canyonStrength = traits.has('CANYONS') ? 0.8 : 0;
  // Low gravity sustains taller relief (mountains scale ≈ 1/g).
  const reliefScale = clamp(Math.pow(9.8 / Math.max(gravityMs2, 0.05), 0.35), 0.7, 1.8);

  return {
    biomeBias: bias,
    sandColor,
    rockColor,
    grassColor,
    liquid,
    liquidLevel,
    liquidColor,
    craterDensity,
    craterDepth: deep ? 1 : shallow ? 0.45 : 0.7,
    canyonStrength,
    floraDensity: clamp(flora, 0, 1.5),
    saltFlats,
    reliefScale,
    snowCover: snow,
  };
}

/** Temperature in °C for display. */
export function kelvinToCelsius(k: number): number {
  return k - 273.15;
}
