import {
  BackSide,
  BoxGeometry,
  Color,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  OctahedronGeometry,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  TorusGeometry,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { PlanetView } from '../../../models/system.model';
import { resolveWaypointType } from '../planet-helpers';
import { createLitPlanetMaterial, planetTypeCode } from './celestial-planet.shader';
import { SurfaceBaker } from './celestial-surface.baker';
import { seedFromName } from './shader-noise.glsl';
import { getPlanetRadius3d, SystemLayout3d } from './system-scene.layout';

const TYPE_PALETTE: Record<string, { color: number; emissive: number; glow: number }> = {
  PLANET: { color: 0x2563eb, emissive: 0x1d4ed8, glow: 0x60a5fa },
  GAS_GIANT: { color: 0x7c3aed, emissive: 0x5b21b6, glow: 0xa78bfa },
  MOON: { color: 0x64748b, emissive: 0x334155, glow: 0x94a3b8 },
  ORBITAL_STATION: { color: 0xf59e0b, emissive: 0xb45309, glow: 0xfbbf24 },
  JUMP_GATE: { color: 0x06b6d4, emissive: 0x0891b2, glow: 0x22d3ee },
  ASTEROID: { color: 0x78716c, emissive: 0x44403c, glow: 0xa8a29e },
  ASTEROID_FIELD: { color: 0x57534e, emissive: 0x292524, glow: 0x78716c },
  ASTEROID_BASE: { color: 0x92400e, emissive: 0x78350f, glow: 0xd97706 },
  ENGINEERED_ASTEROID: { color: 0x0d9488, emissive: 0x115e59, glow: 0x2dd4bf },
  NEBULA: { color: 0xec4899, emissive: 0xbe185d, glow: 0xf472b6 },
  DEBRIS_FIELD: { color: 0x52525b, emissive: 0x27272a, glow: 0x71717a },
  GRAVITY_WELL: { color: 0x111827, emissive: 0x000000, glow: 0x6366f1 },
  ARTIFICIAL_GRAVITY_WELL: { color: 0x1e1b4b, emissive: 0x312e81, glow: 0x818cf8 },
  ARTIFICAL_GRAVITY_WELL: { color: 0x1e1b4b, emissive: 0x312e81, glow: 0x818cf8 },
  FUEL_STATION: { color: 0xea580c, emissive: 0xc2410c, glow: 0xfb923c },
  ARTIFACT: { color: 0x10b981, emissive: 0x059669, glow: 0x34d399 },
};

export interface CelestialBodyResult {
  group: Group;
  radius: number;
  planet: PlanetView;
  /** Normalized axis (with axial tilt) the body rotates around. */
  spinAxis: Vector3;
  /** Angular spin rate (rad/s) at 1x time scale; 0 for non-spinning bodies. */
  spinRate: number;
  /** Baked surface render target for static bodies; caller owns disposal. */
  surfaceTarget?: WebGLRenderTarget;
}

function hashTint(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (h % 20) / 100 - 0.1;
}

function hashSpin(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

function seededSpinUnit(hash: number, salt: number): number {
  const x = Math.sin(hash * 0.000137 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Seeded axial tilt and spin rate, by body type. */
function computeSpin(planet: PlanetView): { axis: Vector3; rate: number } {
  const hash = hashSpin(planet.name);
  const resolved = resolveWaypointType(planet.type);

  // Axial tilt: lean the spin axis off vertical by up to ~0.4 rad.
  const tilt = seededSpinUnit(hash, 1) * 0.4;
  const tiltDir = seededSpinUnit(hash, 2) * Math.PI * 2;
  const axis = new Vector3(
    Math.sin(tilt) * Math.cos(tiltDir),
    Math.cos(tilt),
    Math.sin(tilt) * Math.sin(tiltDir),
  ).normalize();

  const direction = seededSpinUnit(hash, 3) < 0.5 ? -1 : 1;
  const jitter = 0.7 + seededSpinUnit(hash, 4) * 0.6;

  let base: number;
  switch (resolved) {
    case 'GAS_GIANT':
    case 'NEBULA':
      base = 0.45;
      break;
    case 'PLANET':
      base = 0.25;
      break;
    case 'MOON':
      base = 0.12;
      break;
    case 'ASTEROID':
    case 'ENGINEERED_ASTEROID':
      base = 0.3;
      break;
    case 'ORBITAL_STATION':
    case 'FUEL_STATION':
    case 'JUMP_GATE':
    case 'GRAVITY_WELL':
    case 'ARTIFICIAL_GRAVITY_WELL':
    case 'ARTIFICAL_GRAVITY_WELL':
    case 'ASTEROID_FIELD':
    case 'DEBRIS_FIELD':
    case 'ASTEROID_BASE':
    case 'ARTIFACT':
      base = 0.05;
      break;
    default:
      base = 0.18;
      break;
  }

  return { axis, rate: base * jitter * direction };
}

function tintedColor(base: number, name: string): Color {
  const c = new Color(base);
  const t = hashTint(name);
  c.offsetHSL(t, 0, t * 0.15);
  return c;
}

function addAtmosphereRim(group: Group, radius: number, glowColor: number, planet: PlanetView): void {
  const glow = new Color(glowColor);
  const material = new ShaderMaterial({
    uniforms: {
      sunPosition: { value: new Vector3(0, 0, 0) },
      uColor: { value: new Vector3(glow.r, glow.g, glow.b) },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sunPosition;
      uniform vec3 uColor;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vWorldPos;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 toSun = normalize(sunPosition - vWorldPos);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float ndl = dot(N, toSun);

        float lit = smoothstep(-0.25, 0.35, ndl);
        float rim = pow(1.0 - abs(dot(viewDir, N)), 2.5);
        float shimmer = 0.96 + 0.04 * sin(uTime * 0.7);

        vec3 dayCol = mix(uColor, vec3(0.4, 0.6, 1.0), 0.5);
        // Softer, less saturated Rayleigh sunset confined to a thin terminator band.
        vec3 sunsetCol = vec3(1.0, 0.62, 0.42);
        float term = 1.0 - smoothstep(0.0, 0.22, abs(ndl));

        vec3 col = mix(uColor * 0.3, dayCol, lit);
        col = mix(col, sunsetCol, term * lit * 0.45);

        float alpha = clamp(rim * lit, 0.0, 1.0) * 0.85 * shimmer;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    blending: NormalBlending,
    side: BackSide,
    depthWrite: false,
  });

  const atmosphere = new Mesh(new SphereGeometry(radius * 1.06, 32, 32), material);
  atmosphere.userData['planet'] = planet;
  atmosphere.userData['decor'] = true;
  group.add(atmosphere);
}

function addGlowShell(group: Group, radius: number, glowColor: number, planet: PlanetView): void {
  const glow = new Mesh(
    new SphereGeometry(radius * 1.08, 24, 24),
    new MeshStandardMaterial({
      color: glowColor,
      emissive: new Color(glowColor),
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.28,
      side: BackSide,
      depthWrite: false,
    }),
  );
  glow.userData['planet'] = planet;
  glow.userData['decor'] = true;
  group.add(glow);
}

function buildSphereBody(
  group: Group,
  radius: number,
  palette: { color: number; emissive: number; glow: number },
  planet: PlanetView,
  segments = 32,
  sunPosition = new Vector3(0, 0, 0),
  planetType = 'PLANET',
  baker?: SurfaceBaker,
): WebGLRenderTarget | undefined {
  const tinted = tintedColor(palette.color, planet.name);
  const seed = seedFromName(planet.name);
  const typeCode = planetTypeCode(planetType);

  // Static rocky/ocean (0) and moon/asteroid (2) surfaces are baked once so the
  // live shader only does lighting. Gas giants/nebulae (1) stay procedural.
  let surfaceTarget: WebGLRenderTarget | undefined;
  let bakedSurface: Texture | undefined;
  if (baker && (typeCode === 0 || typeCode === 2)) {
    surfaceTarget = baker.bake({
      planetType: typeCode,
      seed,
      baseColor: tinted,
      size: typeCode === 2 ? 256 : 512,
    });
    bakedSurface = surfaceTarget.texture;
  }

  const core = new Mesh(
    new SphereGeometry(radius, segments, segments),
    createLitPlanetMaterial({
      baseColor: tinted.getHex(),
      glowColor: palette.glow,
      sunPosition,
      planetType,
      seed,
      bakedSurface,
    }),
  );
  core.userData['planet'] = planet;
  group.add(core);
  addAtmosphereRim(group, radius, palette.glow, planet);
  return surfaceTarget;
}

function buildStation(group: Group, radius: number, palette: typeof TYPE_PALETTE['ORBITAL_STATION'], planet: PlanetView): void {
  const mat = new MeshStandardMaterial({
    color: palette.color,
    emissive: new Color(palette.emissive),
    emissiveIntensity: 0.35,
    metalness: 0.7,
    roughness: 0.35,
  });
  const ring = new Mesh(new TorusGeometry(radius * 1.1, radius * 0.18, 8, 24), mat);
  ring.rotation.x = Math.PI / 2;
  ring.userData['planet'] = planet;
  group.add(ring);

  const hub = new Mesh(new BoxGeometry(radius * 0.9, radius * 0.5, radius * 0.9), mat);
  hub.userData['planet'] = planet;
  group.add(hub);

  for (let i = 0; i < 4; i++) {
    const arm = new Mesh(new BoxGeometry(radius * 0.15, radius * 0.15, radius * 1.4), mat);
    arm.rotation.y = (Math.PI / 2) * i;
    arm.position.set(Math.sin(arm.rotation.y) * radius * 0.7, 0, Math.cos(arm.rotation.y) * radius * 0.7);
    arm.userData['planet'] = planet;
    group.add(arm);
  }
  addGlowShell(group, radius * 1.5, palette.glow, planet);
}

function buildJumpGate(group: Group, radius: number, palette: typeof TYPE_PALETTE['JUMP_GATE'], planet: PlanetView): void {
  const mat = new MeshStandardMaterial({
    color: palette.color,
    emissive: new Color(palette.glow),
    emissiveIntensity: 0.9,
    metalness: 0.5,
    roughness: 0.3,
    transparent: true,
    opacity: 0.85,
  });
  const portal = new Mesh(new TorusGeometry(radius, radius * 0.22, 12, 48), mat);
  portal.rotation.x = Math.PI / 2;
  portal.userData['planet'] = planet;
  group.add(portal);

  const inner = new Mesh(
    new RingGeometry(radius * 0.55, radius * 0.75, 32),
    new MeshStandardMaterial({
      color: palette.glow,
      emissive: new Color(palette.glow),
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.6,
      side: BackSide,
    }),
  );
  inner.rotation.x = Math.PI / 2;
  inner.userData['planet'] = planet;
  group.add(inner);
}

function buildAsteroid(group: Group, radius: number, palette: typeof TYPE_PALETTE['ASTEROID'], planet: PlanetView): void {
  const mat = new MeshStandardMaterial({
    color: tintedColor(palette.color, planet.name),
    emissive: new Color(palette.emissive),
    emissiveIntensity: 0.15,
    flatShading: true,
    roughness: 0.95,
  });
  const rock = new Mesh(new DodecahedronGeometry(radius, 0), mat);
  rock.rotation.set(0.4, 0.8, 0.2);
  rock.userData['planet'] = planet;
  group.add(rock);
}

function buildDebrisField(group: Group, radius: number, palette: typeof TYPE_PALETTE['DEBRIS_FIELD'], planet: PlanetView): void {
  const mat = new MeshStandardMaterial({
    color: palette.color,
    emissive: new Color(palette.emissive),
    emissiveIntensity: 0.1,
    flatShading: true,
  });
  for (let i = 0; i < 12; i++) {
    const s = radius * (0.15 + (i % 5) * 0.08);
    const rock = new Mesh(new OctahedronGeometry(s, 0), mat);
    const angle = (i / 12) * Math.PI * 2;
    rock.position.set(Math.cos(angle) * radius * 0.65, (i % 3) * 0.4 - 0.4, Math.sin(angle) * radius * 0.65);
    rock.userData['planet'] = planet;
    group.add(rock);
  }
}

function buildGravityWell(group: Group, radius: number, palette: typeof TYPE_PALETTE['GRAVITY_WELL'], planet: PlanetView): void {
  const core = new Mesh(
    new SphereGeometry(radius * 0.55, 24, 24),
    new MeshStandardMaterial({
      color: 0x020617,
      emissive: new Color(palette.glow),
      emissiveIntensity: 0.6,
      roughness: 1,
    }),
  );
  core.userData['planet'] = planet;
  group.add(core);

  const disk = new Mesh(
    new RingGeometry(radius * 0.7, radius * 1.6, 48),
    new MeshStandardMaterial({
      color: palette.glow,
      emissive: new Color(palette.glow),
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.45,
      side: BackSide,
    }),
  );
  disk.rotation.x = Math.PI / 2.2;
  disk.userData['planet'] = planet;
  group.add(disk);
}

export function buildCelestialBody(
  planet: PlanetView,
  layout: SystemLayout3d,
  baker?: SurfaceBaker,
): CelestialBodyResult {
  const resolved = resolveWaypointType(planet.type);
  const palette = TYPE_PALETTE[resolved] ?? TYPE_PALETTE['PLANET']!;
  const radius = getPlanetRadius3d(planet, layout);

  const group = new Group();
  group.name = `planet-${planet.name}`;

  let surfaceTarget: WebGLRenderTarget | undefined;

  switch (resolved) {
    case 'ORBITAL_STATION':
    case 'FUEL_STATION':
      buildStation(group, radius, palette, planet);
      break;
    case 'JUMP_GATE':
      buildJumpGate(group, radius, palette, planet);
      break;
    case 'ASTEROID':
    case 'ENGINEERED_ASTEROID':
      buildAsteroid(group, radius, palette, planet);
      break;
    case 'DEBRIS_FIELD':
    case 'ASTEROID_FIELD':
      buildDebrisField(group, radius, palette, planet);
      break;
    case 'GRAVITY_WELL':
    case 'ARTIFICIAL_GRAVITY_WELL':
    case 'ARTIFICAL_GRAVITY_WELL':
      buildGravityWell(group, radius, palette, planet);
      break;
    case 'GAS_GIANT':
    case 'NEBULA': {
      buildSphereBody(group, radius, palette, planet, 36, undefined, resolved, baker);
      const ring = new Mesh(
        new RingGeometry(radius * 1.4, radius * 2.2, 64),
        new MeshStandardMaterial({
          color: palette.glow,
          emissive: new Color(palette.glow),
          emissiveIntensity: 0.45,
          transparent: true,
          opacity: 0.5,
          side: BackSide,
          flatShading: true,
        }),
      );
      ring.rotation.x = Math.PI / 2.6;
      ring.userData['planet'] = planet;
      group.add(ring);
      break;
    }
    case 'MOON':
      surfaceTarget = buildSphereBody(group, radius, palette, planet, 24, undefined, resolved, baker);
      break;
    default: {
      surfaceTarget = buildSphereBody(group, radius, palette, planet, 32, undefined, resolved, baker);
      break;
    }
  }

  group.userData['planet'] = planet;
  group.traverse((child) => {
    if (child instanceof Mesh && !child.userData['planet']) {
      child.userData['planet'] = planet;
    }
  });

  const spin = computeSpin(planet);
  return { group, radius, planet, spinAxis: spin.axis, spinRate: spin.rate, surfaceTarget };
}
