import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import { NOISE_GLSL } from './shader-noise.glsl';

function hash(i: number): number {
  let h = (i * 2654435761) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function buildNebulaBackground(): Group {
  const group = new Group();
  group.name = 'nebula-bg';

  const dome = new Mesh(
    new SphereGeometry(900, 64, 48),
    new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        // Driven by SpaceWeatherService: solar flares light up the clouds.
        uFlare: { value: 0 },
        uFlareColor: { value: new Color(1.0, 0.55, 0.2) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uFlare;
        uniform vec3 uFlareColor;
        varying vec3 vDir;

        ${NOISE_GLSL}

        void main() {
          vec3 d = vDir;
          float n = fbm(d * 2.5 + vec3(uTime * 0.005), 6) * 0.5 + 0.5;
          float n2 = fbm(d * 6.0, 5) * 0.5 + 0.5;

          float band = exp(-pow(d.y * 3.2, 2.0));
          band *= (0.4 + 0.6 * n2);

          vec3 deep = vec3(0.02, 0.03, 0.08);
          vec3 neb1 = vec3(0.12, 0.10, 0.30);
          vec3 neb2 = vec3(0.10, 0.22, 0.35);

          vec3 col = deep;
          col = mix(col, neb1, smoothstep(0.45, 0.8, n) * 0.7);
          col = mix(col, neb2, smoothstep(0.5, 0.85, n2) * 0.4);
          col += vec3(0.5, 0.45, 0.6) * band * 0.25;

          // Solar-flare wash: ignite the clouds along the dust lanes.
          col += uFlareColor * (uFlare * (0.15 + 0.85 * n2));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: BackSide,
      depthWrite: false,
    }),
  );
  group.add(dome);

  return group;
}

function createStarMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vColor = aColor;
        float tw = 0.78 + 0.22 * sin(uTime * 1.4 + aPhase * 6.2831853);
        vTwinkle = tw;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * tw * (320.0 / max(-mv.z, 0.001));
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float core = smoothstep(0.5, 0.0, d);
        float alpha = core * vTwinkle;
        if (alpha <= 0.01) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
}

function starColor(t: number): Color {
  if (t > 0.85) return new Color(0x9db4ff);
  if (t > 0.65) return new Color(0xcfe0ff);
  if (t > 0.4) return new Color(0xffffff);
  if (t > 0.2) return new Color(0xfff1c1);
  return new Color(0xffcaa0);
}

export function buildStarfieldEnhanced(count = 4000, spread = 650): Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r1 = hash(i);
    const r2 = hash(i + 1000);
    const r3 = hash(i + 2000);
    const r4 = hash(i + 3000);
    const r5 = hash(i + 4000);

    const theta = r1 * Math.PI * 2;
    const phi = Math.acos(2 * r2 - 1);
    const radius = spread * (0.35 + r3 * 0.65);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.4;
    positions[i * 3 + 2] = radius * Math.cos(phi);

    const tint = starColor(r4);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;

    const bright = r5 > 0.97;
    sizes[i] = bright ? 3.2 + r5 * 3.0 : 0.5 + r5 * 1.6;
    phases[i] = hash(i + 5000);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new BufferAttribute(phases, 1));

  const points = new Points(geometry, createStarMaterial());
  points.name = 'starfield-enhanced';
  return points;
}
