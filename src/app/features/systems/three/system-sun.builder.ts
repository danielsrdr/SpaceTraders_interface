import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  SphereGeometry,
} from 'three';

export interface SystemSunResult {
  group: Group;
  light: PointLight;
}

export function buildSystemSun(radius = 14): SystemSunResult {
  const group = new Group();
  group.name = 'system-sun';

  const core = new Mesh(
    new SphereGeometry(radius, 48, 48),
    new MeshBasicMaterial({
      color: 0xfff7cc,
    }),
  );
  group.add(core);

  const innerGlow = new Mesh(
    new SphereGeometry(radius * 1.35, 32, 32),
    new MeshBasicMaterial({
      color: 0xffdd55,
      transparent: true,
      opacity: 0.45,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(innerGlow);

  const corona = new Mesh(
    new SphereGeometry(radius * 2.2, 32, 32),
    new MeshBasicMaterial({
      color: 0xff9933,
      transparent: true,
      opacity: 0.18,
      blending: AdditiveBlending,
      side: BackSide,
      depthWrite: false,
    }),
  );
  group.add(corona);

  const outerHalo = new Mesh(
    new SphereGeometry(radius * 3.5, 24, 24),
    new MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.06,
      blending: AdditiveBlending,
      side: BackSide,
      depthWrite: false,
    }),
  );
  group.add(outerHalo);

  const light = new PointLight(new Color(0xffeebb), 3.5, 0, 1.4);
  light.position.set(0, 0, 0);
  group.add(light);

  return { group, light };
}
