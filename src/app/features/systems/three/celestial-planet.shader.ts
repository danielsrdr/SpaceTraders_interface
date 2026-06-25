import { Color, FrontSide, ShaderMaterial, Texture, Vector3 } from 'three';
import { NOISE_GLSL, seedFromName } from './shader-noise.glsl';

export interface LitPlanetMaterialOptions {
  baseColor: number;
  glowColor: number;
  sunPosition?: Vector3;
  planetType?: string;
  seed?: number;
  /** Pre-baked equirectangular surface (rgb = albedo, a = specular mask). When
   * provided, the shader samples it instead of recomputing noise each frame. */
  bakedSurface?: Texture;
}

/** Maps a resolved waypoint type to the shader's surface family code. */
export function planetTypeCode(planetType: string | undefined): number {
  switch (planetType) {
    case 'GAS_GIANT':
    case 'NEBULA':
      return 1;
    case 'MOON':
    case 'ASTEROID':
    case 'ENGINEERED_ASTEROID':
    case 'ASTEROID_FIELD':
    case 'ASTEROID_BASE':
    case 'DEBRIS_FIELD':
      return 2;
    default:
      return 0;
  }
}

export function createLitPlanetMaterial(options: LitPlanetMaterialOptions): ShaderMaterial {
  const base = new Color(options.baseColor);
  const glow = new Color(options.glowColor);
  const sunPos = options.sunPosition?.clone() ?? new Vector3(0, 0, 0);
  const seed = options.seed ?? 0;
  const baked = options.bakedSurface ?? null;

  const uniforms: ShaderMaterial['uniforms'] = {
    sunPosition: { value: sunPos },
    baseColor: { value: new Vector3(base.r, base.g, base.b) },
    glowColor: { value: new Vector3(glow.r, glow.g, glow.b) },
    uTime: { value: 0 },
    uSeed: { value: seed },
    uPlanetType: { value: planetTypeCode(options.planetType) },
  };
  if (baked) {
    uniforms['uSurfaceTex'] = { value: baked };
  }

  // The surface-determination block differs: baked bodies sample a texture,
  // procedural bodies (gas giants/nebulae) keep the live noise path.
  const surfaceBlock = baked
    ? `
        vec2 equirect = dirToEquirect(normalize(vObjNormal));
        vec4 sampledSurface = texture2D(uSurfaceTex, equirect);
        albedo = sampledSurface.rgb;
        specMask = sampledSurface.a;
      `
    : `
        if (uPlanetType == 1) {
          float lat = vObjNormal.y;
          vec3 warp = domainWarp(noiseCoord * 1.5 + vec3(uTime * 0.02, 0.0, 0.0), 0.6);
          float w = fbm(warp, 4);
          float bands = sin(lat * 9.0 + w * 3.0 + uTime * 0.05);
          float detail = w;
          float t = bands * 0.5 + 0.5;
          vec3 darkBand = baseColor * 0.6;
          vec3 lightBand = mix(baseColor, glowColor, 0.4) * 1.15;
          albedo = mix(darkBand, lightBand, t) + detail * 0.06;
          vec3 spotDir = normalize(vec3(0.5, -0.35, 0.8));
          float spot = smoothstep(0.32, 0.0, distance(sp, spotDir));
          albedo = mix(albedo, vec3(0.85, 0.45, 0.3), spot * 0.8);
        } else if (uPlanetType == 2) {
          float craters = ridgedFbm(noiseCoord * 3.5, 5);
          float fine = fbm(noiseCoord * 9.0, 4) * 0.5 + 0.5;
          float shade = mix(0.6, 1.15, craters);
          albedo = baseColor * shade * (0.8 + fine * 0.3);
        } else {
          float h = fbm(noiseCoord * 2.0, 6) * 0.5 + 0.5;
          float land = smoothstep(0.5, 0.55, h);
          vec3 ocean = mix(vec3(0.02, 0.12, 0.28), vec3(0.05, 0.25, 0.45), h);
          vec3 landLow = baseColor * 0.7;
          vec3 landHigh = mix(baseColor, vec3(0.45, 0.38, 0.28), 0.5);
          float detail = fbm(noiseCoord * 6.0, 5) * 0.5 + 0.5;
          vec3 landCol = mix(landLow, landHigh, detail);
          albedo = mix(ocean, landCol, land);
          float lat = abs(vObjNormal.y);
          float ice = smoothstep(0.78, 0.9, lat + h * 0.08);
          albedo = mix(albedo, vec3(0.92, 0.95, 1.0), ice);
          specMask = (1.0 - land) * (1.0 - ice);
        }
      `;

  const noiseHelpers = baked
    ? `
      vec2 dirToEquirect(vec3 n) {
        float u = atan(n.z, n.x) / 6.2831853 + 0.5;
        float v = asin(clamp(n.y, -1.0, 1.0)) / 3.1415926 + 0.5;
        return vec2(u, v);
      }
    `
    : NOISE_GLSL;

  const bakedUniformDecl = baked ? 'uniform sampler2D uSurfaceTex;' : '';

  return new ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vObjPos;
      varying vec3 vObjNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vObjNormal = normalize(normal);
        vObjPos = position;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sunPosition;
      uniform vec3 baseColor;
      uniform vec3 glowColor;
      uniform float uTime;
      uniform float uSeed;
      uniform int uPlanetType;
      ${bakedUniformDecl}
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec3 vObjPos;
      varying vec3 vObjNormal;

      ${noiseHelpers}

      void main() {
        vec3 N = normalize(vNormal);
        vec3 toSun = normalize(sunPosition - vWorldPos);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float ndl = dot(N, toSun);

        vec3 sp = normalize(vObjPos);
        vec3 noiseCoord = sp * 2.2 + vec3(uSeed * 41.0);

        vec3 albedo = baseColor;
        float specMask = 0.0;

        ${surfaceBlock}

        // Crisp-but-soft day/night terminator.
        float day = smoothstep(-0.05, 0.12, ndl);
        float diff = max(ndl, 0.0);
        vec3 ambientNight = albedo * 0.03;
        vec3 dayLit = albedo * (0.12 + diff * 1.0);
        vec3 surface = mix(ambientNight, dayLit, day);

        if (specMask > 0.0) {
          vec3 halfDir = normalize(toSun + viewDir);
          float spec = pow(max(dot(N, halfDir), 0.0), 90.0) * specMask * day;
          surface += vec3(1.0, 0.98, 0.9) * spec * 0.9;
        }

        float fres = pow(1.0 - max(dot(viewDir, N), 0.0), 3.0);
        float limb = clamp(diff * 1.2 + 0.1, 0.0, 1.0);
        surface += glowColor * fres * (0.25 + limb * 0.7);

        gl_FragColor = vec4(surface, 1.0);
      }
    `,
    side: FrontSide,
  });
}

export function updateLitPlanetSun(material: ShaderMaterial, sunPosition: Vector3): void {
  material.uniforms['sunPosition']!.value.copy(sunPosition);
}

export { seedFromName };
