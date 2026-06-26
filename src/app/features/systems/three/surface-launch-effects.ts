import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  PointLight,
  Scene,
  Vector3,
} from 'three';
import type { SurfaceWeatherKind } from './surface-trait-profile';

export interface LaunchExhaustEffects {
  update(heat: number, time: number, shipPos: Vector3, groundY: number): void;
  dispose(): void;
}

export interface LaunchEffectsOptions {
  shipRole?: string;
  weather?: SurfaceWeatherKind | null;
}

const FALLBACK_OFFSETS: [number, number, number][] = [[0, -0.06, 1.15]];

const STORM_WEATHER: SurfaceWeatherKind[] = ['sand-storm', 'acid-rain', 'giant-winds'];

function heatColor(heat: number): number {
  const t = Math.min(1, Math.max(0, heat));
  const r = 1;
  const g = 0.35 + t * 0.55;
  const b = 0.05 + t * 0.45;
  return (Math.floor(r * 255) << 16) | (Math.floor(g * 255) << 8) | Math.floor(b * 255);
}

function rolePlumeScale(role: string | undefined): number {
  const r = role?.toUpperCase() ?? '';
  if (
    r.includes('FABRICATOR') ||
    r.includes('HARVESTER') ||
    r.includes('EXCAVATOR') ||
    r.includes('REFINERY')
  ) {
    return 1.35;
  }
  if (r.includes('INTERCEPTOR') || r.includes('PATROL')) {
    return 0.85;
  }
  return 1;
}

function resolveReactorOffsets(ship: Group): [number, number, number][] {
  const reactors = ship.userData['reactorMeshes'] as Mesh[] | undefined;
  if (!reactors?.length) return FALLBACK_OFFSETS;
  return reactors.map((mesh) => [mesh.position.x, mesh.position.y, mesh.position.z]);
}

function createDustField(count: number, stormDamp: number): {
  points: Points;
  geometry: BufferGeometry;
  velocities: Float32Array;
  material: PointsMaterial;
} {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 2.5;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 0.02;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    const speed = (0.4 + Math.random() * 1.6) * stormDamp;
    velocities[i * 3] = Math.cos(angle) * speed;
    velocities[i * 3 + 1] = Math.random() * 0.15;
    velocities[i * 3 + 2] = Math.sin(angle) * speed;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color: 0xc4a574,
    size: 0.22,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const points = new Points(geometry, material);
  points.name = 'launch-dust';
  return { points, geometry, velocities, material };
}

export function attachLaunchExhaustEffects(
  scene: Scene,
  ship: Group,
  shipScale: number,
  options: LaunchEffectsOptions = {},
): LaunchExhaustEffects {
  const exhaustRoot = new Group();
  exhaustRoot.name = 'launch-exhaust';
  ship.add(exhaustRoot);

  const plumeScale = rolePlumeScale(options.shipRole);
  const stormDamp =
    options.weather && STORM_WEATHER.includes(options.weather) ? 0.45 : 1;
  const offsets = resolveReactorOffsets(ship);

  const plumes: Mesh[] = [];
  const plumeMats: MeshBasicMaterial[] = [];
  for (const [x, y, z] of offsets) {
    const mat = new MeshBasicMaterial({
      color: 0xff6b1a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    plumeMats.push(mat);
    const cone = new Mesh(
      new ConeGeometry(0.22 * shipScale * plumeScale, 1.4 * shipScale * plumeScale, 10, 1, true),
      mat,
    );
    cone.position.set(x * shipScale, y * shipScale, z * shipScale);
    cone.rotation.x = Math.PI / 2;
    exhaustRoot.add(cone);
    plumes.push(cone);
  }

  const scorchMat = new MeshBasicMaterial({
    color: 0x1a1208,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
  });
  const scorch = new Mesh(new CircleGeometry(5.5, 32), scorchMat);
  scorch.rotation.x = -Math.PI / 2;
  scorch.name = 'launch-scorch';
  scene.add(scorch);

  const particleCount = Math.max(24, Math.floor(90 * stormDamp));
  const dust = createDustField(particleCount, stormDamp);
  scene.add(dust.points);

  const lights: PointLight[] = [];
  for (const [x, y, z] of offsets) {
    const light = new PointLight(0xff9f43, 0, 14 * shipScale);
    light.position.set(x * shipScale, y * shipScale, z * shipScale);
    exhaustRoot.add(light);
    lights.push(light);
  }

  const dustPositions = dust.geometry.getAttribute('position') as BufferAttribute;
  const basePositions = new Float32Array(dustPositions.array as Float32Array);

  return {
    update(heat: number, time: number, shipPos: Vector3, groundY: number): void {
      const h = Math.min(1, Math.max(0, heat));
      const pulse = 0.85 + Math.sin(time * 18) * 0.15;
      const color = heatColor(h);
      const altitude = Math.max(0, shipPos.y - groundY);

      for (let i = 0; i < plumes.length; i++) {
        const cone = plumes[i];
        const mat = plumeMats[i];
        const flicker = 0.92 + Math.sin(time * 22 + i * 1.7) * 0.08;
        const len = (0.35 + h * 2.8) * shipScale * plumeScale * flicker;
        cone.scale.set(0.6 + h * 1.4, len, 0.6 + h * 1.4);
        mat.color.setHex(color);
        mat.opacity = (0.08 + h * 0.72) * pulse;
      }

      scorch.position.set(shipPos.x, groundY + 0.03, shipPos.z);
      scorchMat.opacity = (0.08 + h * 0.42) * Math.max(0, 1 - altitude / 14);

      dust.points.position.set(shipPos.x, groundY, shipPos.z);
      dust.material.opacity = (0.05 + h * 0.55) * stormDamp * Math.max(0, 1 - altitude / 12);
      dust.material.size = 0.18 + h * 0.28;

      for (let i = 0; i < particleCount; i++) {
        const bx = basePositions[i * 3];
        const bz = basePositions[i * 3 + 2];
        const spread = 1 + h * 3.5 * time * 0.15;
        dustPositions.setXYZ(
          i,
          bx + dust.velocities[i * 3] * spread,
          0.02 + dust.velocities[i * 3 + 1] * h,
          bz + dust.velocities[i * 3 + 2] * spread,
        );
      }
      dustPositions.needsUpdate = true;

      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        light.color.setHex(color);
        light.intensity = (0.2 + h * 6.5) * pulse;
        light.distance = (10 + h * 22) * shipScale;
      }
    },

    dispose(): void {
      scene.remove(scorch);
      scorchMat.dispose();
      scorch.geometry.dispose();
      scene.remove(dust.points);
      dust.geometry.dispose();
      dust.material.dispose();
      exhaustRoot.parent?.remove(exhaustRoot);
      for (const cone of plumes) {
        cone.geometry.dispose();
      }
      for (const mat of plumeMats) {
        mat.dispose();
      }
      for (const light of lights) {
        light.dispose();
      }
    },
  };
}
