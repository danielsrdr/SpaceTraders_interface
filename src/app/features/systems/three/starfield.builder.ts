import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
} from 'three';

function hash(i: number): number {
  let h = (i * 2654435761) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

function starColor(t: number): Color {
  if (t > 0.85) return new Color(0x9db4ff);
  if (t > 0.65) return new Color(0xcfe0ff);
  if (t > 0.4) return new Color(0xffffff);
  if (t > 0.2) return new Color(0xfff1c1);
  return new Color(0xffcaa0);
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

export function buildStarfield(count = 2500, spread = 400): Points {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r1 = hash(i);
    const r2 = hash(i + 1000);
    const r3 = hash(i + 2000);
    const r4 = hash(i + 3000);
    const r5 = hash(i + 4000);

    const theta = r1 * Math.PI * 2;
    const phi = Math.acos(2 * r2 - 1);
    const radius = spread * (0.4 + r3 * 0.6);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.35;
    positions[i * 3 + 2] = radius * Math.cos(phi);

    const bright = r4 > 0.97;
    sizes[i] = bright ? 3.0 + r4 * 2.8 : 0.4 + r4 * 1.6;

    const tint = starColor(r5);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;

    phases[i] = hash(i + 5000);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
  geometry.setAttribute('aPhase', new BufferAttribute(phases, 1));

  const points = new Points(geometry, createStarMaterial());
  points.name = 'starfield';
  return points;
}
