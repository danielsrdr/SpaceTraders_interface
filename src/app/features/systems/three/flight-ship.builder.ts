import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
} from 'three';

export interface FlightShipResult {
  root: Group;
  thrusterLights: PointLight[];
}

export function buildFlightShip(): FlightShipResult {
  const root = new Group();
  root.name = 'flight-ship';

  const hullMat = new MeshStandardMaterial({
    color: 0x1e3a8a,
    emissive: new Color(0x0f172a),
    emissiveIntensity: 0.2,
    metalness: 0.6,
    roughness: 0.35,
  });

  const accentMat = new MeshStandardMaterial({
    color: 0x60a5fa,
    emissive: new Color(0x38bdf8),
    emissiveIntensity: 0.35,
    metalness: 0.5,
    roughness: 0.4,
  });

  const body = new Mesh(new BoxGeometry(1.4, 0.5, 2.2), hullMat);
  body.position.y = 0.25;
  root.add(body);

  const nose = new Mesh(new ConeGeometry(0.55, 1.2, 4), accentMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.25, -1.7);
  root.add(nose);

  const wingL = new Mesh(new BoxGeometry(1.6, 0.08, 0.9), hullMat);
  wingL.position.set(-1.1, 0.2, 0.3);
  root.add(wingL);

  const wingR = wingL.clone();
  wingR.position.x = 1.1;
  root.add(wingR);

  const thrusterLights: PointLight[] = [];

  for (const x of [-0.9, 0.9]) {
    const thruster = new Mesh(
      new CylinderGeometry(0.22, 0.28, 0.35, 12),
      new MeshStandardMaterial({
        color: 0x1e293b,
        emissive: new Color(0xf97316),
        emissiveIntensity: 1.2,
      }),
    );
    thruster.rotation.x = Math.PI / 2;
    thruster.position.set(x, 0.2, 1.15);
    root.add(thruster);

    const light = new PointLight(0xf97316, 1.5, 8);
    light.position.set(x, 0.2, 1.4);
    root.add(light);
    thrusterLights.push(light);
  }

  const antenna = new Mesh(
    new CylinderGeometry(0.04, 0.04, 0.5, 6),
    new MeshStandardMaterial({
      color: 0x334155,
      emissive: new Color(0xef4444),
      emissiveIntensity: 0.8,
    }),
  );
  antenna.position.set(0, 0.65, -0.2);
  root.add(antenna);

  return { root, thrusterLights };
}
