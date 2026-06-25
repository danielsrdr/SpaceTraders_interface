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
  output,
  signal,
} from '@angular/core';
import {
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ShipData } from '../../models/ship.model';
import { buildProceduralShip, disposeShip } from './ship-procedural.builder';
import { applyShipHealth, isLowHealth } from './ship-visual-state';
import { resolveHotspotLabel, resolveHotspotTab, type ShipModalTab } from './ship-hotspots';

@Component({
  selector: 'app-ship-viewer-3d',
  templateUrl: './ship-viewer-3d.component.html',
})
export class ShipViewer3dComponent implements AfterViewInit, OnDestroy {
  readonly ship = input.required<ShipData>();
  readonly partClick = output<Exclude<ShipModalTab, null>>();

  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  readonly tooltipLabel = signal<string | null>(null);
  readonly tooltipX = signal(0);
  readonly tooltipY = signal(0);

  private readonly zone = inject(NgZone);
  private scene!: Scene;
  private camera!: PerspectiveCamera;
  private renderer!: WebGLRenderer;
  private controls!: OrbitControls;
  private shipGroup: Group | null = null;
  private reactorMeshes: Mesh[] = [];
  private hotspotMeshes: Mesh[] = [];
  private hoveredMesh: Mesh | null = null;
  private hoveredBackup: { emissive: Color; intensity: number } | null = null;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly clock = new Clock();
  private animFrameId = 0;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private reduceMotion = false;
  private baseReactorIntensity: number[] = [];
  private sceneReady = false;
  private hullMeshes: Mesh[] = [];
  private lowHealth = false;
  private focused = false;
  private cameraTween: {
    fromPos: Vector3;
    toPos: Vector3;
    fromTarget: Vector3;
    toTarget: Vector3;
    start: number;
    duration: number;
  } | null = null;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private readonly onPointerMove = (event: PointerEvent): void => {
    this.updatePointer(event);
    this.handleHover();
  };
  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.updatePointer(event);
  };
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const moved =
      Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY) > 6;
    if (moved) return;
    this.updatePointer(event);
    this.handleClick();
  };
  private readonly onPointerLeave = (): void => {
    this.clearHover();
  };

  constructor() {
    effect(() => {
      const currentShip = this.ship();
      if (!this.sceneReady) return;
      this.loadShip(currentShip.registration.role);
    });
  }

  ngAfterViewInit(): void {
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.zone.runOutsideAngular(() => {
      this.initScene();
      this.loadShip(this.ship().registration.role);
      this.attachListeners();
      this.startRenderLoop();
      this.sceneReady = true;
    });
  }

  ngOnDestroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animFrameId);
    this.detachListeners();
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    if (this.shipGroup) {
      this.scene?.remove(this.shipGroup);
      disposeShip(this.shipGroup);
    }
    this.renderer?.dispose();
  }

  private initScene(): void {
    const host = this.hostRef.nativeElement;

    this.scene = new Scene();
    this.scene.background = null;

    this.camera = new PerspectiveCamera(45, 1, 0.1, 200);
    this.camera.position.set(4.5, 2.2, 6.5);

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    const canvasEl = this.renderer.domElement;
    canvasEl.style.display = 'block';
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    host.appendChild(canvasEl);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 14;
    this.controls.target.set(0, 0.2, 0);
    this.controls.update();

    this.scene.add(new AmbientLight(0xffffff, 0.65));
    const keyLight = new DirectionalLight(0xffffff, 1.25);
    keyLight.position.set(5, 8, 6);
    this.scene.add(keyLight);
    const rimLight = new DirectionalLight(0x93c5fd, 0.55);
    rimLight.position.set(-6, 2, -4);
    this.scene.add(rimLight);
    const fillLight = new DirectionalLight(0xfde68a, 0.25);
    fillLight.position.set(-3, -4, 5);
    this.scene.add(fillLight);
    const reactorLight = new PointLight(0x38bdf8, 1.2, 12);
    reactorLight.position.set(0, 0, 3);
    this.scene.add(reactorLight);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  private loadShip(role: string): void {
    if (this.shipGroup) {
      this.scene.remove(this.shipGroup);
      disposeShip(this.shipGroup);
      this.shipGroup = null;
    }

    const built = buildProceduralShip(role);
    this.shipGroup = built.root;
    this.reactorMeshes = built.reactorMeshes;
    this.hullMeshes = built.hullMeshes;

    const currentShip = this.ship();
    applyShipHealth(this.hullMeshes, this.reactorMeshes, currentShip);
    this.lowHealth = isLowHealth(currentShip);
    this.baseReactorIntensity = this.reactorMeshes.map((mesh) => {
      const material = mesh.material as MeshStandardMaterial;
      return material.emissiveIntensity;
    });

    this.hotspotMeshes = [];
    this.shipGroup.traverse((child) => {
      if (child instanceof Mesh && child.name.startsWith('hotspot-')) {
        this.hotspotMeshes.push(child);
      }
    });

    this.scene.add(this.shipGroup);
    this.clearHover();
    this.cameraTween = null;
    this.focused = false;
    this.controls.enabled = true;
    this.controls.target.set(0, 0.15, 0);
    const isSatellite = role === 'SATELLITE';
    this.controls.minDistance = isSatellite ? 3 : 2.4;
    this.controls.maxDistance = isSatellite ? 16 : 14;
    this.camera.position.set(isSatellite ? 5.5 : 4.5, isSatellite ? 2.5 : 2.2, isSatellite ? 7.5 : 6.5);
    this.controls.update();
  }

  private attachListeners(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
  }

  private detachListeners(): void {
    const canvas = this.renderer?.domElement;
    if (!canvas) return;
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
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
      if (this.shipGroup && !this.reduceMotion) {
        if (!this.focused) {
          this.shipGroup.position.y = Math.sin(elapsed * 1.2) * 0.06;
        }
        for (let i = 0; i < this.reactorMeshes.length; i++) {
          const mesh = this.reactorMeshes[i];
          const material = mesh.material as MeshStandardMaterial;
          const base = this.baseReactorIntensity[i] ?? 0.8;
          let intensity = base + Math.sin(elapsed * 4 + i) * 0.15;
          if (this.lowHealth && Math.sin(elapsed * 23.3 + i * 2.1) > 0.6) {
            intensity *= 0.35;
          }
          material.emissiveIntensity = Math.max(0, intensity);
        }
      }

      if (this.cameraTween) {
        this.advanceCameraTween(elapsed);
      } else {
        this.controls.update();
      }
      this.renderer.render(this.scene, this.camera);
    };
    render();
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.tooltipX.set(event.clientX - rect.left + 12);
    this.tooltipY.set(event.clientY - rect.top - 28);
  }

  private handleHover(): void {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.hotspotMeshes, false);
    const next = hits[0]?.object instanceof Mesh ? hits[0].object : null;

    if (next === this.hoveredMesh) {
      if (next) {
        const label = resolveHotspotLabel(next.name);
        this.zone.run(() => this.tooltipLabel.set(label));
      }
      return;
    }

    this.clearHover(false);
    if (!next) return;

    this.hoveredMesh = next;
    const material = next.material as MeshStandardMaterial;
    this.hoveredBackup = {
      emissive: material.emissive.clone(),
      intensity: material.emissiveIntensity,
    };
    material.emissive = new Color(0x4580ff);
    material.emissiveIntensity = 0.35;
    this.renderer.domElement.style.cursor = 'pointer';
    const label = resolveHotspotLabel(next.name);
    this.zone.run(() => this.tooltipLabel.set(label));
  }

  private handleClick(): void {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.hotspotMeshes, false);
    const hit = hits[0]?.object;
    if (!(hit instanceof Mesh)) return;

    const tab = resolveHotspotTab(hit.name);
    if (!tab) return;

    this.focusOnMesh(hit);
    this.zone.run(() => this.partClick.emit(tab));
  }

  private focusOnMesh(mesh: Mesh): void {
    const target = new Vector3();
    mesh.getWorldPosition(target);
    const direction = new Vector3().subVectors(this.camera.position, this.controls.target);
    if (direction.lengthSq() < 1e-4) direction.set(0.6, 0.4, 1);
    direction.normalize();
    const distance = this.controls.minDistance + 0.4;
    const toPos = new Vector3().copy(target).addScaledVector(direction, distance);
    this.focused = true;
    this.startCameraTween(toPos, target);
  }

  resetView(): void {
    if (!this.sceneReady) return;
    this.focused = false;
    const role = this.ship().registration.role;
    const isSatellite = role === 'SATELLITE';
    const toTarget = new Vector3(0, 0.15, 0);
    const toPos = new Vector3(
      isSatellite ? 5.5 : 4.5,
      isSatellite ? 2.5 : 2.2,
      isSatellite ? 7.5 : 6.5,
    );
    this.startCameraTween(toPos, toTarget);
  }

  private startCameraTween(toPos: Vector3, toTarget: Vector3): void {
    if (this.reduceMotion) {
      this.camera.position.copy(toPos);
      this.controls.target.copy(toTarget);
      this.controls.update();
      this.cameraTween = null;
      this.controls.enabled = true;
      return;
    }
    this.controls.enabled = false;
    this.cameraTween = {
      fromPos: this.camera.position.clone(),
      toPos: toPos.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: toTarget.clone(),
      start: this.clock.getElapsedTime(),
      duration: 0.6,
    };
  }

  private advanceCameraTween(elapsed: number): void {
    const tween = this.cameraTween;
    if (!tween) return;
    const raw = (elapsed - tween.start) / tween.duration;
    const t = raw >= 1 ? 1 : raw;
    const eased = 1 - Math.pow(1 - t, 3);
    this.camera.position.lerpVectors(tween.fromPos, tween.toPos, eased);
    this.controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
    this.controls.update();
    if (t >= 1) {
      this.cameraTween = null;
      this.controls.enabled = true;
    }
  }

  private clearHover(clearTooltip = true): void {
    if (this.hoveredMesh && this.hoveredBackup) {
      const material = this.hoveredMesh.material as MeshStandardMaterial;
      material.emissive.copy(this.hoveredBackup.emissive);
      material.emissiveIntensity = this.hoveredBackup.intensity;
      this.hoveredMesh = null;
      this.hoveredBackup = null;
    }
    if (this.renderer?.domElement) {
      this.renderer.domElement.style.cursor = 'grab';
    }
    if (clearTooltip) {
      this.zone.run(() => this.tooltipLabel.set(null));
    }
  }
}
