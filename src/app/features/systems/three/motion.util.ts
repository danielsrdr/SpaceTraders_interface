import { Vector3 } from 'three';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function applyCameraShake(
  position: Vector3,
  amplitude: number,
  seed: number,
  nowMs = performance.now(),
): void {
  if (amplitude <= 0) return;
  const t = nowMs * 0.05 + seed;
  position.x += Math.sin(t * 1.7) * amplitude;
  position.y += Math.cos(t * 2.3) * amplitude;
  position.z += Math.sin(t * 1.1) * amplitude;
}
