import { Color, Mesh, MeshStandardMaterial } from 'three';
import type { ShipData } from '../../models/ship.model';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function conditionFactor(ship: ShipData): number {
  return clamp01(ship.frame.condition);
}

export function fuelFactor(ship: ShipData): number {
  if (ship.fuel.capacity <= 0) return 1;
  return clamp01(ship.fuel.current / ship.fuel.capacity);
}

export function reactorGlowFactor(ship: ShipData): number {
  const weakest = Math.min(fuelFactor(ship), clamp01(ship.reactor.condition));
  return 0.2 + 0.8 * weakest;
}

export function isLowHealth(ship: ShipData): boolean {
  const fuelLow = ship.fuel.capacity > 0 && ship.fuel.current / ship.fuel.capacity < 0.2;
  return ship.frame.condition < 0.4 || ship.reactor.condition < 0.4 || fuelLow;
}

const DAMAGE_SEAM = new Color(0.5, 0.06, 0.03);

export function applyShipHealth(hullMeshes: Mesh[], reactorMeshes: Mesh[], ship: ShipData): void {
  const glow = reactorGlowFactor(ship);
  const scaledReactors = new Set<MeshStandardMaterial>();
  for (const mesh of reactorMeshes) {
    const material = mesh.material as MeshStandardMaterial;
    if (scaledReactors.has(material)) continue;
    scaledReactors.add(material);
    material.emissiveIntensity *= glow;
  }

  const damage = 1 - conditionFactor(ship);
  if (damage <= 0.4) return;

  const darken = 1 - 0.4 * damage;
  const tinted = new Set<MeshStandardMaterial>();
  for (const mesh of hullMeshes) {
    const material = mesh.material as MeshStandardMaterial;
    if (tinted.has(material)) continue;
    tinted.add(material);
    material.color.multiplyScalar(darken);
    material.roughness = Math.min(1, material.roughness + 0.3 * damage);
    material.metalness = Math.max(0, material.metalness - 0.2 * damage);
    material.emissive.copy(DAMAGE_SEAM);
    material.emissiveIntensity = 0.18 * damage;
  }
}
