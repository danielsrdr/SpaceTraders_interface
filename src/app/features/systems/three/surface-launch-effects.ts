import {
  AdditiveBlending,
  CircleGeometry,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  Scene,
  Vector3,
} from 'three';

export interface LaunchExhaustEffects {
  update(heat: number, time: number, shipPos: Vector3, groundY: number): void;
  dispose(): void;
}

const PLUME_OFFSETS: [number, number, number][] = [
  [-0.55, -0.08, 1.05],
  [0, -0.06, 1.15],
  [0.55, -0.08, 1.05],
];

function heatColor(heat: number): number {
  const t = Math.min(1, Math.max(0, heat));
  // Deep orange → white-hot core as thrust ramps up.
  const r = 1;
  const g = 0.35 + t * 0.55;
  const b = 0.05 + t * 0.45;
  return (Math.floor(r * 255) << 16) | (Math.floor(g * 255) << 8) | Math.floor(b * 255);
}

export function attachLaunchExhaustEffects(scene: Scene, ship: Group, shipScale: number): LaunchExhaustEffects {
  const exhaustRoot = new Group();
  exhaustRoot.name = 'launch-exhaust';
  ship.add(exhaustRoot);

  const plumes: Mesh[] = [];
  const plumeMats: MeshBasicMaterial[] = [];
  for (const [x, y, z] of PLUME_OFFSETS) {
    const mat = new MeshBasicMaterial({
      color: 0xff6b1a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    plumeMats.push(mat);
    const cone = new Mesh(new ConeGeometry(0.22 * shipScale, 1.4 * shipScale, 10, 1, true), mat);
    cone.position.set(x * shipScale, y * shipScale, z * shipScale);
    cone.rotation.x = Math.PI / 2;
    exhaustRoot.add(cone);
    plumes.push(cone);
  }

  const groundMat = new MeshBasicMaterial({
    color: 0xff8c42,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const groundHeat = new Mesh(new CircleGeometry(4.5, 32), groundMat);
  groundHeat.rotation.x = -Math.PI / 2;
  groundHeat.name = 'launch-ground-heat';
  scene.add(groundHeat);

  const lights: PointLight[] = [];
  for (const [x, y, z] of PLUME_OFFSETS) {
    const light = new PointLight(0xff9f43, 0, 14 * shipScale);
    light.position.set(x * shipScale, y * shipScale, z * shipScale);
    exhaustRoot.add(light);
    lights.push(light);
  }

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
        const len = (0.35 + h * 2.8) * shipScale * flicker;
        cone.scale.set(0.6 + h * 1.4, len, 0.6 + h * 1.4);
        mat.color.setHex(color);
        mat.opacity = (0.08 + h * 0.72) * pulse;
      }

      groundHeat.position.set(shipPos.x, groundY + 0.04, shipPos.z);
      groundMat.color.setHex(color);
      groundMat.opacity = (0.06 + h * 0.58) * Math.max(0, 1 - altitude / 10);

      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        light.color.setHex(color);
        light.intensity = (0.2 + h * 6.5) * pulse;
        light.distance = (10 + h * 22) * shipScale;
      }
    },

    dispose(): void {
      scene.remove(groundHeat);
      groundMat.dispose();
      groundHeat.geometry.dispose();
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
