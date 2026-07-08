import { PerspectiveCamera, Vector3 } from 'three';
import type { SurfaceZoneKind } from '../system-view-mode';

export interface SurfacePoiLabel {
  kind: SurfaceZoneKind;
  label: string;
  x: number;
  y: number;
  opacity: number;
  inRange: boolean;
}

export interface SurfacePoiAnchor {
  kind: SurfaceZoneKind;
  label: string;
  position: Vector3;
}

export function projectPoiLabels(
  anchors: readonly SurfacePoiAnchor[],
  camera: PerspectiveCamera,
  width: number,
  height: number,
  activeKind: SurfaceZoneKind | null,
  scratch: Vector3,
): SurfacePoiLabel[] {
  if (!anchors.length || !width || !height) return [];

  const labels: SurfacePoiLabel[] = [];
  for (const anchor of anchors) {
    if (anchor.kind === 'market') continue;
    scratch.copy(anchor.position).project(camera);
    const onScreen =
      scratch.z < 1 &&
      scratch.x >= -1.1 &&
      scratch.x <= 1.1 &&
      scratch.y >= -1.1 &&
      scratch.y <= 1.1;
    if (!onScreen) continue;

    const dist = camera.position.distanceTo(anchor.position);
    labels.push({
      kind: anchor.kind,
      label: anchor.label,
      x: (scratch.x * 0.5 + 0.5) * width,
      y: (-scratch.y * 0.5 + 0.5) * height,
      opacity: Math.max(0.45, Math.min(1, 1.3 - dist / 160)),
      inRange: activeKind === anchor.kind,
    });
  }
  return labels;
}
