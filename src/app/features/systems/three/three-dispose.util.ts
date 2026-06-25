import { Material, Mesh, Object3D, ShaderMaterial, Sprite, Texture } from 'three';

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
  // ShaderMaterials hold their textures inside `uniforms`, which the property
  // scan above does not reach (e.g. baked surface textures).
  if (material instanceof ShaderMaterial) {
    for (const uniform of Object.values(material.uniforms)) {
      if (uniform && uniform.value instanceof Texture) {
        uniform.value.dispose();
      }
    }
  }
  material.dispose();
}
