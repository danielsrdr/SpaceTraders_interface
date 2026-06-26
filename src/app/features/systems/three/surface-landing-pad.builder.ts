import {
  BoxGeometry,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
} from 'three';

export interface LandingPadBuildResult {
  group: Group;
  /** World Y of the pad deck surface. */
  deckY: number;
}

/** Emissive landing pad placed under the docked ship. */
export function buildLandingPad(
  x: number,
  z: number,
  groundY: number,
  heading: number,
): LandingPadBuildResult {
  const deckY = groundY + 0.04;
  const group = new Group();
  group.name = 'landing-pad';
  group.position.set(x, deckY, z);
  group.rotation.y = heading;

  const deckMat = new MeshStandardMaterial({
    color: 0x334155,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.35,
    metalness: 0.55,
    roughness: 0.4,
    side: DoubleSide,
  });
  const deck = new Mesh(new CircleGeometry(5.2, 6), deckMat);
  deck.rotation.x = -Math.PI / 2;
  deck.receiveShadow = true;
  group.add(deck);

  const ringMat = new MeshStandardMaterial({
    color: 0x64748b,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.55,
    metalness: 0.7,
    roughness: 0.25,
    transparent: true,
    opacity: 0.85,
    side: DoubleSide,
  });
  const ring = new Mesh(new RingGeometry(4.6, 5.4, 6), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  ring.receiveShadow = true;
  group.add(ring);

  const rampMat = new MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.45,
    roughness: 0.55,
  });
  const ramp = new Mesh(new BoxGeometry(1.2, 0.08, 3.6), rampMat);
  ramp.position.set(-3.8, 0.06, 1.8);
  ramp.rotation.y = Math.PI / 6;
  ramp.castShadow = true;
  ramp.receiveShadow = true;
  group.add(ramp);

  return { group, deckY };
}
