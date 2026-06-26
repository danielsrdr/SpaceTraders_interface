import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  input,
} from '@angular/core';
import {
  AmbientLight,
  Box3,
  Clock,
  DirectionalLight,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PlanetView } from '../../models/system.model';
import { buildCelestialBody } from '../systems/three/celestial-body.builder';
import { SurfaceBaker } from '../systems/three/celestial-surface.baker';
import { SystemLayout3d } from '../systems/three/system-scene.layout';
import { disposeObject3D } from '../systems/three/three-dispose.util';

const DUMMY_LAYOUT: SystemLayout3d = {
  scale: 1,
  centerX: 0,
  centerY: 0,
  displayPositions: new Map(),
  sceneExtent: 100,
};

/** Live, draggable 3D viewer for a single waypoint type (codex detail panel). */
@Component({
  selector: 'app-codex-waypoint-viewer',
  template: '<div #host class="h-full w-full"></div>',
  styles: [':host { display: block; width: 100%; height: 100%; }'],
})
export class CodexWaypointViewerComponent implements AfterViewInit, OnDestroy {
  readonly waypointType = input.required<string>();

  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  private readonly zone = inject(NgZone);
  private scene!: Scene;
  private camera!: PerspectiveCamera;
  private renderer!: WebGLRenderer;
  private controls!: OrbitControls;
  private baker!: SurfaceBaker;
  private body: Group | null = null;
  private surfaceTargetDispose: (() => void) | null = null;
  private spinAxis = new Vector3(0, 1, 0);
  private spinRate = 0.15;
  private readonly timeMaterials: ShaderMaterial[] = [];
  private readonly clock = new Clock();
  private lastElapsed = 0;
  private animFrameId = 0;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private reduceMotion = false;
  private sceneReady = false;

  constructor() {
    effect(() => {
      const type = this.waypointType();
      if (this.sceneReady) this.loadBody(type);
    });
  }

  ngAfterViewInit(): void {
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.zone.runOutsideAngular(() => {
      this.initScene();
      this.loadBody(this.waypointType());
      this.startRenderLoop();
      this.sceneReady = true;
    });
  }

  ngOnDestroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animFrameId);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    this.clearBody();
    this.baker?.dispose();
    this.renderer?.dispose();
  }

  private initScene(): void {
    const host = this.hostRef.nativeElement;

    this.scene = new Scene();
    this.scene.background = null;

    this.camera = new PerspectiveCamera(42, 1, 0.1, 4000);
    this.camera.position.set(0, 0, 20);

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.cursor = 'grab';
    host.appendChild(canvas);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;

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

    this.baker = new SurfaceBaker(this.renderer);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  private loadBody(type: string): void {
    this.clearBody();

    const planet: PlanetView = {
      name: `CODEX-${type}`,
      type,
      system: 'CODEX',
      position: { x: 0, y: 0 },
      traits: [],
    };
    const built = buildCelestialBody(planet, DUMMY_LAYOUT, this.baker);
    this.body = built.group;
    this.spinAxis = built.spinAxis.clone().normalize();
    this.spinRate = built.spinRate || 0.15;
    if (built.surfaceTarget) {
      const target = built.surfaceTarget;
      this.surfaceTargetDispose = () => target.dispose();
    }

    const sun = new Vector3(60, 40, 60);
    this.timeMaterials.length = 0;
    this.body.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!(material instanceof ShaderMaterial)) continue;
        if (material.uniforms['sunPosition']) {
          (material.uniforms['sunPosition'].value as Vector3).copy(sun);
        }
        if (material.uniforms['uTime']) this.timeMaterials.push(material);
      }
    });

    this.scene.add(this.body);
    this.frameCamera();
  }

  private frameCamera(): void {
    if (!this.body) return;
    const sphere = new Box3().setFromObject(this.body).getBoundingSphere(new Sphere());
    const radius = Math.max(0.5, sphere.radius);
    const fov = (this.camera.fov * Math.PI) / 180;
    const distance = (radius / Math.sin(fov / 2)) * 1.2;
    this.controls.target.copy(sphere.center);
    this.controls.minDistance = distance * 0.6;
    this.controls.maxDistance = distance * 2.2;
    const direction = new Vector3(0.5, 0.35, 1).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.controls.update();
  }

  private resize(): void {
    const host = this.hostRef.nativeElement;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private startRenderLoop(): void {
    const render = (): void => {
      if (this.disposed) return;
      this.animFrameId = requestAnimationFrame(render);

      const elapsed = this.clock.getElapsedTime();
      const delta = elapsed - this.lastElapsed;
      this.lastElapsed = elapsed;

      if (this.body && !this.reduceMotion) {
        this.body.rotateOnWorldAxis(this.spinAxis, this.spinRate * delta);
      }
      for (const material of this.timeMaterials) {
        if (material.uniforms['uTime']) material.uniforms['uTime'].value = elapsed;
      }

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    render();
  }

  private clearBody(): void {
    if (this.body) {
      this.scene.remove(this.body);
      disposeObject3D(this.body);
      this.body = null;
    }
    if (this.surfaceTargetDispose) {
      this.surfaceTargetDispose();
      this.surfaceTargetDispose = null;
    }
    this.timeMaterials.length = 0;
  }
}
