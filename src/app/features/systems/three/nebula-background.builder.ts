import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
} from 'three';

function hash(i: number): number {
  let h = (i * 2654435761) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export function buildNebulaBackground(): Group {
  const group = new Group();
  group.name = 'nebula-bg';

  const dome = new Mesh(
    new SphereGeometry(900, 32, 24),
    new MeshBasicMaterial({
      color: 0x0a1028,
      side: BackSide,
      depthWrite: false,
    }),
  );
  group.add(dome);

  for (let i = 0; i < 6; i++) {
    const r1 = hash(i);
    const r2 = hash(i + 50);
    const r3 = hash(i + 100);
    const cloud = new Mesh(
      new SphereGeometry(120 + r1 * 80, 16, 12),
      new MeshBasicMaterial({
        color: new Color().setHSL(0.58 + r2 * 0.12, 0.55, 0.35 + r3 * 0.15),
        transparent: true,
        opacity: 0.07 + r1 * 0.05,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    const angle = r2 * Math.PI * 2;
    cloud.position.set(Math.cos(angle) * 280, -80 + r3 * 160, Math.sin(angle) * 280);
    cloud.scale.set(1.8 + r3, 0.5 + r1 * 0.4, 1.2 + r2);
    group.add(cloud);
  }

  return group;
}

export function buildStarfieldEnhanced(count = 4000, spread = 650): Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r1 = hash(i);
    const r2 = hash(i + 1000);
    const r3 = hash(i + 2000);
    const r4 = hash(i + 3000);

    const theta = r1 * Math.PI * 2;
    const phi = Math.acos(2 * r2 - 1);
    const radius = spread * (0.35 + r3 * 0.65);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.4;
    positions[i * 3 + 2] = radius * Math.cos(phi);

    const tint = r4 > 0.75 ? new Color(0x93c5fd) : r4 > 0.5 ? new Color(0xfff1c1) : new Color(0xffffff);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));

  const material = new PointsMaterial({
    size: 1.4,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  const points = new Points(geometry, material);
  points.name = 'starfield-enhanced';
  return points;
}
