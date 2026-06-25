import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';

export const PIT_RADIUS = 40;
export const PIT_TERRACES = 7;
export const PIT_STEP = 2.5;
export const PIT_FLOOR_Y = 2;

export interface MinePitConfig {
  centerX: number;
  centerZ: number;
  seed: number;
}

export function pitDistance(x: number, z: number, config: MinePitConfig): number {
  return Math.hypot(x - config.centerX, z - config.centerZ);
}

/** Terraced open-pit height override; returns null if outside pit influence. */
export function samplePitHeight(x: number, z: number, config: MinePitConfig, baseHeight: number): number | null {
  const dist = pitDistance(x, z, config);
  if (dist > PIT_RADIUS + 4) return null;

  const rimY = baseHeight + 4;
  if (dist <= 2) {
    return PIT_FLOOR_Y;
  }

  const terraceIndex = Math.min(
    PIT_TERRACES - 1,
    Math.floor(((dist - 2) / (PIT_RADIUS - 2)) * PIT_TERRACES),
  );
  const terraceY = rimY - (terraceIndex + 1) * PIT_STEP;

  if (dist > PIT_RADIUS) {
    const blend = (dist - PIT_RADIUS) / 4;
    return terraceY * (1 - blend) + baseHeight * blend;
  }

  return Math.max(PIT_FLOOR_Y, terraceY);
}

/** Flatten terrain under market pad. */
export function sampleMarketPadHeight(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  baseHeight: number,
): number | null {
  const dist = Math.hypot(x - centerX - 5, z - centerZ - 5);
  if (dist > 14) return null;
  const padY = baseHeight + 0.2;
  if (dist > 10) {
    const blend = (dist - 10) / 4;
    return padY * (1 - blend) + baseHeight * blend;
  }
  return padY;
}

export function buildMinePitMeshes(config: MinePitConfig, floorY: number): Group {
  const group = new Group();
  group.name = 'mine-pit-structures';

  const waterMat = new MeshStandardMaterial({
    color: 0x0d9488,
    emissive: new Color(0x115e59),
    emissiveIntensity: 0.25,
    roughness: 0.15,
    metalness: 0.1,
  });
  const pool = new Mesh(new PlaneGeometry(6, 6), waterMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(config.centerX, floorY + 0.05, config.centerZ);
  pool.receiveShadow = true;
  group.add(pool);

  const rampMat = new MeshStandardMaterial({ color: 0x78716c, roughness: 0.85 });
  const ramp = new Mesh(new BoxGeometry(4, 0.4, 18), rampMat);
  ramp.position.set(config.centerX + PIT_RADIUS * 0.55, floorY + 6, config.centerZ);
  ramp.rotation.y = config.seed % 2 === 0 ? 0.3 : -0.25;
  ramp.receiveShadow = true;
  ramp.castShadow = true;
  group.add(ramp);

  return group;
}
