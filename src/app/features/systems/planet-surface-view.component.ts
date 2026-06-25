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
  untracked,
} from '@angular/core';
import {
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { MarketData, PlanetView } from '../../models/system.model';
import { isGasGiantWaypoint } from './planet-helpers';
import { createPointerLockControls, FpsControls } from './three/fps-controls';
import { getActiveZone, SurfaceZone } from './three/surface-zones';
import { disposeObject3D } from './three/three-dispose.util';
import { goodLabel } from './trade-good-visuals';
import {
  buildMarketStructuresAt,
  MarketStallAnchor,
} from './three/zone-buildings.builder';
import {
  buildSurfaceWorld,
  disposeSurfaceWorldResult,
  SurfaceWorldResult,
} from './three/surface-world.builder';
import {
  setTerrainSunDirection,
  updateTerrainMaterialTime,
} from './three/terrain/terrain-material';
import { buildSkydome } from './three/surface-props.builder';
import type { SurfaceZoneKind } from './three/system-view-mode';

export interface SurfacePoiLabel {
  kind: SurfaceZoneKind;
  label: string;
  x: number;
  y: number;
  opacity: number;
  inRange: boolean;
}

@Component({
  selector: 'app-planet-surface-view',
  templateUrl: './planet-surface-view.component.html',
})
export class PlanetSurfaceViewComponent implements AfterViewInit, OnDestroy {
  readonly planet = input.required<PlanetView>();
  readonly launchActive = input(false);
  readonly marketPending = input(false);
  readonly entryActive = input(true);
  readonly market = input<MarketData | null>(null);

  readonly zoneInteract = output<SurfaceZoneKind>();
  readonly exitSurface = output<void>();
  readonly launchComplete = output<void>();
  readonly entryComplete = output<void>();
  readonly marketTrade = output<{ symbol: string; mode: 'buy' | 'sell'; units: number }>();

  readonly activeZone = signal<SurfaceZone | null>(null);
  readonly pointerLocked = signal(false);
  readonly isGasGiant = signal(false);
  readonly entryRunning = signal(false);
  readonly entryVeil = signal(0);
  readonly poiLabels = signal<SurfacePoiLabel[]>([]);
  readonly focusedStall = signal<MarketStallAnchor | null>(null);
  readonly tradeUnits = signal(1);

  goodLabel = goodLabel;

  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  private readonly zone = inject(NgZone);
  private scene!: Scene;
  private camera!: PerspectiveCamera;
  private renderer!: WebGLRenderer;
  private sun!: DirectionalLight;
  private fps!: FpsControls;
  private world: SurfaceWorldResult | null = null;
  private readonly clock = new Clock();
  private animFrameId = 0;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private sceneReady = false;
  private launchProgress = 0;
  private launchStartY = 0;
  private launchEmitted = false;
  private entryProgress = 0;
  private entryDuration = 2;
  private entrySeed = 0;
  private builtMarket: MarketData | null = null;
  private readonly projVec = new Vector3();

  constructor() {
    effect(() => {
      const p = this.planet();
      if (!this.sceneReady) return;
      this.loadWorld(p, untracked(this.market));
    });

    effect(() => {
      const m = this.market();
      if (!this.sceneReady || !this.world) return;
      if (m === this.builtMarket) return;
      this.rebuildMarket(m);
    });

    effect(() => {
      if (!this.sceneReady || !this.launchActive()) return;
      this.launchProgress = 0;
      this.launchEmitted = false;
      this.launchStartY = this.camera.position.y;
      this.poiLabels.set([]);
      this.focusedStall.set(null);
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.initScene();
      this.loadWorld(this.planet(), this.market());
      this.attachListeners();
      this.startEntry();
      this.startRenderLoop();
      this.sceneReady = true;
    });
  }

  ngOnDestroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animFrameId);
    this.fps?.detach();
    this.detachListeners();
    this.resizeObserver?.disconnect();
    this.clearWorld();
    this.renderer?.dispose();
  }

  requestPointerLock(): void {
    if (this.entryRunning()) return;
    this.fps?.requestLock();
  }

  private startEntry(): void {
    if (!this.entryActive()) return;
    const reduced = this.prefersReducedMotion();
    this.entryProgress = 0;
    this.entrySeed = Math.random() * 1000;
    this.entryDuration = reduced ? 0.5 : 2;
    if (this.world && !reduced) {
      this.camera.position.y = this.world.spawn.y + 5;
    }
    this.zone.run(() => {
      this.entryVeil.set(1);
      this.entryRunning.set(true);
    });
  }

  private updateEntry(delta: number): void {
    this.entryProgress = Math.min(1, this.entryProgress + delta / this.entryDuration);
    const eased = this.easeOut(this.entryProgress);

    if (this.world && !this.prefersReducedMotion()) {
      this.camera.position.y = this.world.spawn.y + (1 - eased) * 5;
      const amp = (1 - this.entryProgress) * 0.5;
      const t = performance.now() * 0.05 + this.entrySeed;
      this.camera.position.x = this.world.spawn.x + Math.sin(t * 1.7) * amp;
      this.camera.position.z = this.world.spawn.z + Math.sin(t * 1.1) * amp;
    }

    const veil = 1 - eased;
    this.zone.run(() => this.entryVeil.set(veil));

    if (this.entryProgress >= 1) {
      this.finishEntry();
    }
  }

  private finishEntry(): void {
    if (this.world) {
      this.camera.position.set(this.world.spawn.x, this.world.spawn.y, this.world.spawn.z);
    }
    this.zone.run(() => {
      this.entryVeil.set(0);
      this.entryRunning.set(false);
      this.entryComplete.emit();
    });
  }

  private computePoiLabels(active: SurfaceZone | null): SurfacePoiLabel[] {
    const world = this.world;
    if (!world || !world.poiAnchors.length) return [];
    const host = this.hostRef.nativeElement;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return [];

    const labels: SurfacePoiLabel[] = [];
    for (const anchor of world.poiAnchors) {
      this.projVec.copy(anchor.position).project(this.camera);
      const onScreen =
        this.projVec.z < 1 &&
        this.projVec.x >= -1.1 &&
        this.projVec.x <= 1.1 &&
        this.projVec.y >= -1.1 &&
        this.projVec.y <= 1.1;
      if (!onScreen) continue;

      const dist = this.camera.position.distanceTo(anchor.position);
      labels.push({
        kind: anchor.kind,
        label: anchor.label,
        x: (this.projVec.x * 0.5 + 0.5) * w,
        y: (-this.projVec.y * 0.5 + 0.5) * h,
        opacity: Math.max(0.45, Math.min(1, 1.3 - dist / 160)),
        inRange: active?.kind === anchor.kind,
      });
    }
    return labels;
  }

  private easeOut(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  exit(): void {
    this.zone.run(() => this.exitSurface.emit());
  }

  private initScene(): void {
    const host = this.hostRef.nativeElement;

    this.scene = new Scene();
    this.scene.background = new Color(0xc7e4ff);
    this.scene.fog = new Fog(0xe8c896, 60, 220);

    this.camera = new PerspectiveCamera(70, 1, 0.1, 250);

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMappingExposure = 1.2;
    const canvasEl = this.renderer.domElement;
    canvasEl.style.display = 'block';
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    host.appendChild(canvasEl);

    this.scene.add(new HemisphereLight(0x93c5fd, 0xd4a574, 0.45));
    this.scene.add(new AmbientLight(0xfff7ed, 0.18));

    this.sun = new DirectionalLight(0xfff7ed, 1.4);
    this.sun.position.set(40, 70, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 200;
    this.sun.shadow.camera.left = -80;
    this.sun.shadow.camera.right = 80;
    this.sun.shadow.camera.top = 80;
    this.sun.shadow.camera.bottom = -80;
    this.scene.add(this.sun);

    this.scene.add(buildSkydome());

    const pointerLock = createPointerLockControls(this.camera, this.renderer.domElement);
    this.fps = new FpsControls(this.camera, this.renderer.domElement, pointerLock);
    this.fps.attach();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  private loadWorld(planet: PlanetView, market: MarketData | null): void {
    this.clearWorld();
    this.builtMarket = market;
    this.focusedStall.set(null);

    const gas = isGasGiantWaypoint(planet);
    this.zone.run(() => this.isGasGiant.set(gas));

    if (gas) {
      this.scene.background = new Color(0x4c1d95);
      this.scene.fog = new Fog(0x4c1d95, 15, 80);
    } else {
      this.scene.background = new Color(0xc7e4ff);
      this.scene.fog = new Fog(0xe8c896, 60, 220);
    }

    this.world = buildSurfaceWorld(planet, market);
    this.scene.add(this.world.root);

    setTerrainSunDirection(
      this.world.terrainManager.material,
      this.sun.position.x,
      this.sun.position.y,
      this.sun.position.z,
    );

    this.camera.position.set(this.world.spawn.x, this.world.spawn.y, this.world.spawn.z);
    this.camera.rotation.set(0, 0, 0);
    this.world.terrainManager.update(this.world.spawn.x, this.world.spawn.z);
  }

  private clearWorld(): void {
    if (this.world) {
      this.scene.remove(this.world.root);
      disposeSurfaceWorldResult(this.world);
      disposeObject3D(this.world.root);
      this.world = null;
    }
  }

  private rebuildMarket(market: MarketData | null): void {
    const world = this.world;
    this.builtMarket = market;
    if (!world?.marketOrigin) return;

    const existing = world.root.getObjectByName('market-structures');
    if (existing) {
      world.root.remove(existing);
      disposeObject3D(existing);
    }

    const built = buildMarketStructuresAt(
      world.marketOrigin.x,
      world.marketOrigin.z,
      world.marketOrigin.baseY,
      market,
    );
    world.root.add(built.group);
    world.marketStalls = built.stalls;
    this.focusedStall.set(null);
  }

  private attachListeners(): void {
    window.addEventListener('keydown', this.onKeyDown);
    this.renderer.domElement.addEventListener('click', this.onCanvasClick);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private detachListeners(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.renderer?.domElement.removeEventListener('click', this.onCanvasClick);
    this.renderer?.domElement.removeEventListener('wheel', this.onWheel);
  }

  private readonly onCanvasClick = (): void => {
    if (this.entryRunning()) return;
    if (!this.fps.isLocked()) this.fps.requestLock();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.focusedStall()) return;
    event.preventDefault();
    const dir = event.deltaY < 0 ? 1 : -1;
    this.zone.run(() => this.tradeUnits.update((u) => Math.max(1, u + dir)));
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      if (this.fps.isLocked()) {
        document.exitPointerLock();
      } else {
        this.zone.run(() => this.exitSurface.emit());
      }
      return;
    }

    if (event.code === 'KeyE') {
      const active = this.activeZone();
      if (!active) return;
      event.preventDefault();
      if (active.kind === 'market') {
        this.emitTrade('buy');
      } else {
        this.zone.run(() => this.zoneInteract.emit(active.kind));
      }
      return;
    }

    if (event.code === 'KeyQ') {
      if (this.activeZone()?.kind === 'market') {
        event.preventDefault();
        this.emitTrade('sell');
      }
    }
  };

  private emitTrade(mode: 'buy' | 'sell'): void {
    const stall = this.focusedStall();
    if (!stall) return;
    const units = this.tradeUnits();
    this.zone.run(() => this.marketTrade.emit({ symbol: stall.symbol, mode, units }));
  }

  private computeFocusedStall(zone: SurfaceZone | null): MarketStallAnchor | null {
    if (!this.world || zone?.kind !== 'market') return null;
    const stalls = this.world.marketStalls;
    if (!stalls.length) return null;
    const cx = this.camera.position.x;
    const cz = this.camera.position.z;
    let best: MarketStallAnchor | null = null;
    let bestDist = Infinity;
    for (const stall of stalls) {
      const dist = (stall.position.x - cx) ** 2 + (stall.position.z - cz) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = stall;
      }
    }
    return bestDist <= 49 ? best : null;
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
      const delta = Math.min(this.clock.getDelta(), 0.05);
      const elapsed = this.clock.elapsedTime;

      if (this.world) {
        updateTerrainMaterialTime(this.world.terrainManager.material, elapsed);
      }

      if (this.entryRunning()) {
        this.updateEntry(delta);
        this.renderer.render(this.scene, this.camera);
        return;
      }

      if (this.launchActive()) {
        this.launchProgress = Math.min(1, this.launchProgress + delta / 1.2);
        this.camera.position.y = this.launchStartY + this.launchProgress * 40;
        if (this.launchProgress >= 1) {
          if (!this.launchEmitted) {
            this.launchEmitted = true;
            this.zone.run(() => this.launchComplete.emit());
          }
        }
      } else if (this.world && this.fps.isLocked()) {
        const px = this.camera.position.x;
        const pz = this.camera.position.z;
        this.world.terrainManager.update(px, pz);

        const pitDist = this.world.heightField.getPitConfig()
          ? Math.hypot(
              px - this.world.heightField.getPitConfig()!.centerX,
              pz - this.world.heightField.getPitConfig()!.centerZ,
            )
          : Infinity;
        if (pitDist < 50) {
          this.world.tunnels?.ensureBuilt();
        }

        this.fps.update(
          delta,
          () => false,
          { collision: this.world.collision, useTerrainHeight: true },
        );

        const zone = getActiveZone(
          this.camera.position.x,
          this.camera.position.y - 1,
          this.camera.position.z,
          this.world.zones,
        );
        const poi = this.computePoiLabels(zone);
        const stall = this.computeFocusedStall(zone);
        this.zone.run(() => {
          this.activeZone.set(zone);
          this.pointerLocked.set(true);
          this.poiLabels.set(poi);
          this.focusedStall.set(stall);
        });
      } else {
        const poi = this.computePoiLabels(this.activeZone());
        this.zone.run(() => {
          this.pointerLocked.set(this.fps.isLocked());
          this.poiLabels.set(poi);
        });
      }

      this.renderer.render(this.scene, this.camera);
    };
    render();
  }
}
