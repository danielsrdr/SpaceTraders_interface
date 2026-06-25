import {
  ClampToEdgeWrapping,
  Color,
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { NOISE_GLSL } from './shader-noise.glsl';

export interface SurfaceBakeOptions {
  /** Surface family code, matching planetTypeCode(): 0 = rocky/ocean, 2 = moon/asteroid. */
  planetType: number;
  /** Stable per-body seed in 0..1. */
  seed: number;
  /** Linear base color of the body. */
  baseColor: Color;
  /** Equirectangular texture width (height is width / 2). */
  size?: number;
}

/**
 * Bakes the static (non-animated) celestial surface shading into an
 * equirectangular RGBA texture once, so the live planet shader only has to do
 * lighting instead of recomputing 6 octaves of noise every frame.
 *
 * Albedo is stored in rgb, the water/specular mask in alpha. The mapping matches
 * `dirToEquirect()` in celestial-planet.shader.ts so the lit shader can sample
 * it by object-space normal.
 */
export class SurfaceBaker {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: Mesh;
  private readonly material: ShaderMaterial;

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.material = new ShaderMaterial({
      uniforms: {
        uSeed: { value: 0 },
        uPlanetType: { value: 0 },
        baseColor: { value: new Vector3(1, 1, 1) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uSeed;
        uniform int uPlanetType;
        uniform vec3 baseColor;
        varying vec2 vUv;

        ${NOISE_GLSL}

        void main() {
          // Reconstruct the sphere direction from equirectangular UV. Must mirror
          // dirToEquirect() in celestial-planet.shader.ts.
          float lon = (vUv.x - 0.5) * 6.2831853;
          float lat = (vUv.y - 0.5) * 3.1415926;
          float cl = cos(lat);
          vec3 sp = vec3(cl * cos(lon), sin(lat), cl * sin(lon));
          vec3 noiseCoord = sp * 2.2 + vec3(uSeed * 41.0);

          vec3 albedo = baseColor;
          float specMask = 0.0;

          if (uPlanetType == 2) {
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
            float latAbs = abs(sp.y);
            float ice = smoothstep(0.78, 0.9, latAbs + h * 0.08);
            albedo = mix(albedo, vec3(0.92, 0.95, 1.0), ice);
            specMask = (1.0 - land) * (1.0 - ice);
          }

          gl_FragColor = vec4(albedo, specMask);
        }
      `,
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.scene.add(this.quad);
  }

  /** Renders the surface into a fresh render target. Caller owns disposal. */
  bake(options: SurfaceBakeOptions): WebGLRenderTarget {
    const width = options.size ?? 512;
    const height = Math.max(2, Math.floor(width / 2));
    const target = new WebGLRenderTarget(width, height, {
      format: RGBAFormat,
      type: UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
      wrapS: RepeatWrapping,
      wrapT: ClampToEdgeWrapping,
    });

    const u = this.material.uniforms;
    u['uSeed']!.value = options.seed;
    u['uPlanetType']!.value = options.planetType;
    (u['baseColor']!.value as Vector3).set(options.baseColor.r, options.baseColor.g, options.baseColor.b);

    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prevTarget);

    return target;
  }

  dispose(): void {
    this.quad.geometry.dispose();
    this.material.dispose();
    this.scene.remove(this.quad);
  }
}
