import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  PointsMaterial,
} from 'three';

function hash(i: number): number {
  let h = (i * 2654435761) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

export function buildStarfield(count = 2500, spread = 400): Points {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colors = new Float32Array(count * 3);

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

    sizes[i] = 0.4 + r4 * 2.8;

    const tint = r5 > 0.7 ? new Color(0x93c5fd) : new Color(0xffffff);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('size', new BufferAttribute(sizes, 1));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));

  const material = new PointsMaterial({
    size: 1.2,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  const points = new Points(geometry, material);
  points.name = 'starfield';
  return points;
}
