import { Material, Mesh, Object3D, Sprite, Texture } from 'three';

export function disposeObject3D(root: Object3D): void {
  root.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      disposeMaterial(child.material);
    } else if (child instanceof Sprite) {
      disposeMaterial(child.material);
    }
  });
}

export function disposeMaterial(material: Material | Material[]): void {
  if (Array.isArray(material)) {
    for (const m of material) disposeMaterial(m);
    return;
  }
  for (const value of Object.values(material)) {
    if (value instanceof Texture) value.dispose();
  }
  material.dispose();
}
