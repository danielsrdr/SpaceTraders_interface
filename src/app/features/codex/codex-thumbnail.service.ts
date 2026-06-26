import { Injectable } from '@angular/core';
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three';
import { PlanetView } from '../../models/system.model';
import { buildCelestialBody } from '../systems/three/celestial-body.builder';
import { SurfaceBaker } from '../systems/three/celestial-surface.baker';
import { SystemLayout3d } from '../systems/three/system-scene.layout';
import { disposeObject3D } from '../systems/three/three-dispose.util';
import { drawAchievementBadge, drawFactionSigil, drawGoodGlyph } from './codex-art';

const DUMMY_LAYOUT: SystemLayout3d = {
  scale: 1,
  centerX: 0,
  centerY: 0,
  displayPositions: new Map(),
  sceneExtent: 100,
};

/**
 * Produces small illustrative thumbnails for codex cards, cached by key.
 * Waypoint types are rendered once with an offscreen WebGL renderer reusing the
 * live `buildCelestialBody` geometry; factions and goods use seeded 2D canvas
 * art. The offscreen renderer is created lazily and freed via {@link dispose}.
 */
@Injectable({ providedIn: 'root' })
export class CodexThumbnailService {
  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private baker: SurfaceBaker | null = null;
  private art2d: HTMLCanvasElement | null = null;

  private readonly waypointCache = new Map<string, string>();
  private readonly factionCache = new Map<string, string>();
  private readonly goodCache = new Map<string, string>();
  private readonly achievementCache = new Map<string, string>();

  waypointThumbnail(type: string, size = 220): string {
    const key = `${type}@${size}`;
    const cached = this.waypointCache.get(key);
    if (cached !== undefined) return cached;
    const url = this.renderWaypoint(type, size);
    this.waypointCache.set(key, url);
    return url;
  }

  factionThumbnail(symbol: string, size = 220): string {
    const key = `${symbol}@${size}`;
    const cached = this.factionCache.get(key);
    if (cached !== undefined) return cached;
    const ctx = this.art2dContext(size);
    if (!ctx) return '';
    drawFactionSigil(ctx, symbol, size, 0);
    const url = ctx.canvas.toDataURL('image/png');
    this.factionCache.set(key, url);
    return url;
  }

  goodThumbnail(symbol: string, size = 220): string {
    const key = `${symbol}@${size}`;
    const cached = this.goodCache.get(key);
    if (cached !== undefined) return cached;
    const ctx = this.art2dContext(size);
    if (!ctx) return '';
    drawGoodGlyph(ctx, symbol, size, 0);
    const url = ctx.canvas.toDataURL('image/png');
    this.goodCache.set(key, url);
    return url;
  }

  achievementBadge(id: string, color: string, tier: number, unlocked: boolean, size = 160): string {
    const key = `${id}:${tier}:${unlocked}@${size}`;
    const cached = this.achievementCache.get(key);
    if (cached !== undefined) return cached;
    const ctx = this.art2dContext(size);
    if (!ctx) return '';
    drawAchievementBadge(ctx, { seed: id, color, tier, unlocked, size, time: 0 });
    const url = ctx.canvas.toDataURL('image/png');
    this.achievementCache.set(key, url);
    return url;
  }

  /** Release the offscreen WebGL context. Call when leaving the codex. */
  dispose(): void {
    this.baker?.dispose();
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.baker = null;
  }

  private art2dContext(size: number): CanvasRenderingContext2D | null {
    if (!this.art2d) this.art2d = document.createElement('canvas');
    this.art2d.width = size;
    this.art2d.height = size;
    return this.art2d.getContext('2d');
  }

  private ensureRenderer(size: number): boolean {
    if (!this.renderer) {
      try {
        this.renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      } catch {
        return false;
      }
      this.renderer.setClearColor(0x000000, 0);
      this.scene = new Scene();
      this.scene.add(new AmbientLight(0xffffff, 0.7));
      const key = new DirectionalLight(0xffffff, 1.3);
      key.position.set(5, 8, 6);
      this.scene.add(key);
      const rim = new DirectionalLight(0x93c5fd, 0.6);
      rim.position.set(-6, 2, -4);
      this.scene.add(rim);
      const fill = new DirectionalLight(0xfde68a, 0.3);
      fill.position.set(-3, -4, 5);
      this.scene.add(fill);
      this.camera = new PerspectiveCamera(40, 1, 0.1, 4000);
      this.baker = new SurfaceBaker(this.renderer);
    }
    this.renderer.setSize(size, size, false);
    this.camera!.aspect = 1;
    this.camera!.updateProjectionMatrix();
    return true;
  }

  private renderWaypoint(type: string, size: number): string {
    if (!this.ensureRenderer(size)) return '';
    const renderer = this.renderer!;
    const scene = this.scene!;
    const camera = this.camera!;

    const planet: PlanetView = {
      name: `CODEX-${type}`,
      type,
      system: 'CODEX',
      position: { x: 0, y: 0 },
      traits: [],
    };

    const built = buildCelestialBody(planet, DUMMY_LAYOUT, this.baker ?? undefined);
    const group = built.group;
    group.position.set(0, 0, 0);
    group.rotation.set(0.35, 0.6, 0);

    const sun = new Vector3(60, 40, 60);
    group.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material instanceof ShaderMaterial && material.uniforms['sunPosition']) {
          (material.uniforms['sunPosition'].value as Vector3).copy(sun);
        }
      }
    });

    scene.add(group);

    const sphere = new Box3().setFromObject(group).getBoundingSphere(new Sphere());
    const radius = Math.max(0.5, sphere.radius);
    const fov = (camera.fov * Math.PI) / 180;
    const distance = (radius / Math.sin(fov / 2)) * 1.15;
    const direction = new Vector3(0.55, 0.42, 1).normalize();
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    camera.lookAt(sphere.center);

    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');

    scene.remove(group);
    disposeObject3D(group);
    built.surfaceTarget?.dispose();
    return url;
  }
}
