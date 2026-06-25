import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  isDevMode,
  output,
  signal,
} from '@angular/core';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BufferGeometry,
  Clock,
  Color,
  Float32BufferAttribute,
  Frustum,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  QuadraticBezierCurve3,
  Raycaster,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShipData } from '../../models/ship.model';
import { PlanetView } from '../../models/system.model';
import {
  getTransitProgress,
  shipInTransit,
  shipOrbitOffset,
  shipsOnMap,
} from './planet-helpers';
import { buildCelestialBody } from './three/celestial-body.builder';
import { SurfaceBaker } from './three/celestial-surface.baker';
import { updateLitPlanetSun } from './three/celestial-planet.shader';
import { buildProceduralShip, disposeShip } from '../ships/ship-procedural.builder';
import {
  computeLabelLayout,
  type PlanetScreenLabel,
} from './three/god-view-labels';
import {
  buildGodViewMarkers,
  syncMarkerPositions,
  updateGodMarkerFilter,
  updateGodMarkerHighlights,
  type GodMarkerContext,
  type GodViewFilter,
} from './three/god-view-markers.builder';
import { buildNebulaBackground, buildStarfieldEnhanced } from './three/nebula-background.builder';
import {
  buildEphemerisTrails,
  buildOrbitRings,
  syncEphemerisTrails,
  syncOrbitTickPositions,
  updateOrbitTicks,
} from './three/orbit-rings.builder';
import { buildSystemSun } from './three/system-sun.builder';
import { SystemOrbitEngine } from './three/system-orbit.engine';
import {
  computeSystemLayout3d,
  shipMarkerScale,
  shipOrbitDistance,
  SystemLayout3d,
} from './three/system-scene.layout';
import { disposeObject3D } from './three/three-dispose.util';

interface PlanetEntry {
  planet: PlanetView;
  group: Group;
  radius: number;
  spinAxis: Vector3;
  spinRate: number;
  surfaceTarget?: WebGLRenderTarget;
  /** Atmosphere/glow shells hidden when the body is far from the camera. */
  decorShells: Mesh[];
}

/** A `uTime` ShaderMaterial plus the object that owns it. Materials attached to
 * a celestial body (`gate=true`) are frozen when off-frustum/far; background and
 * sun materials (`gate=false`) are always refreshed. */
interface AnimatedMaterialEntry {
  mat: ShaderMaterial;
  host: Object3D | null;
  gate: boolean;
}

interface DockedShipMarkerData {
  kind: 'docked';
  ship: ShipData;
  waypointSymbol: string;
  orbitIndex: number;
  orbitTotal: number;
}

interface TransitShipMarkerData {
  kind: 'transit';
  ship: ShipData;
  originSymbol: string;
  destSymbol: string;
}

type ShipMarkerData = DockedShipMarkerData | TransitShipMarkerData;

interface TransitArcData {
  ship: ShipData;
  curve: QuadraticBezierCurve3;
  line: Line;
  dot: Mesh;
}

export type { PlanetScreenLabel };

export interface GodViewTooltip {
  planet: PlanetView;
  x: number;
  y: number;
  shipCount: number;
}

type CameraMode = 'flight' | 'god';

const GOD_VIEW_FILTERS: GodViewFilter[] = ['important', 'all', 'markets', 'ships', 'contracts'];

/** Orbital-motion time-warp multipliers (0 = paused). */
const TIME_SCALE_OPTIONS = [0, 1, 10, 100] as const;

const BLIP_SELECTED_COLOR = 0xfbbf24;
const BLIP_DOCKED_COLOR = 0x38bdf8;
const BLIP_TRANSIT_COLOR = 0x5eead4;

const ARC_SEGMENTS = 36;

/** Player ship is rendered at full scale (~4 units); shrink it so it reads as a
 * small vessel next to celestial bodies (MOON r=2.5, PLANET r=5). */
const PLAYER_SHIP_SCALE = 0.5;

/** Fraction of the scene extent past which a body is rendered at low detail
 * (no atmosphere/glow shells, frozen animated shader). */
const LOD_FAR_FACTOR = 0.5;

@Component({
  selector: 'app-system-flight-view',
  templateUrl: './system-flight-view.component.html',
})
export class SystemFlightViewComponent implements AfterViewInit, OnDestroy {
  readonly planets = input<PlanetView[]>([]);
  readonly ships = input<ShipData[]>([]);
  readonly systemSymbol = input('');
  readonly systemName = input('');
  readonly focusPlanetName = input<string | null>(null);
  readonly focusShipSymbol = input<string | null>(null);
  readonly selectedShipSymbol = input<string | null>(null);
  readonly selectedShipRole = input<string | null>(null);
  readonly landingPlanet = input<PlanetView | null>(null);
  readonly landingActive = input(false);
  readonly actionPulse = input(0);
  /** Waypoints relevant to active contracts (highlighted in god view). */
  readonly contractWaypoints = input<Set<string>>(new Set<string>());

  readonly planetClick = output<PlanetView>();
  readonly shipClick = output<ShipData>();
  readonly landingComplete = output<void>();

  readonly cameraMode = signal<CameraMode>('flight');
  readonly planetLabels = signal<PlanetScreenLabel[]>([]);
  readonly landingFade = signal(0);
  readonly showPlanetNames = signal(true);
  readonly godViewFilter = signal<GodViewFilter>('important');
  readonly hoveredPlanet = signal<PlanetView | null>(null);
  readonly hoverTooltip = signal<GodViewTooltip | null>(null);
  readonly godViewFilters = GOD_VIEW_FILTERS;
  readonly timeScale = signal(1);
  readonly timeScaleOptions = TIME_SCALE_OPTIONS;

  readonly shipCountsByWaypoint = computed(() => {
    const counts = new Map<string, number>();
    const onMap = shipsOnMap(this.ships(), this.systemSymbol());
    for (const ship of onMap) {
      if (shipInTransit(ship)) continue;
      const key = ship.nav.waypointSymbol;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  });

  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('radar', { static: true }) radarRef!: ElementRef<HTMLCanvasElement>;

  private readonly zone = inject(NgZone);
  private scene!: Scene;
  private camera!: PerspectiveCamera;
  private renderer!: WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  /** Gate bloom/post-processing cost; falls back to direct render when off.
   * Exposed for the UI toggle and driven adaptively by the frame-time budget. */
  readonly highQuality = signal(true);
  /** When true the user pinned bloom; adaptive auto-tuning stops touching it. */
  private bloomManual = false;
  private surfaceBaker: SurfaceBaker | null = null;
  /** ShaderMaterials carrying a `uTime` uniform, refreshed each rebuild. */
  private animatedMaterials: AnimatedMaterialEntry[] = [];
  private shipGroup!: Group;
  private thrusterLights: import('three').PointLight[] = [];
  private playerShipRole: string | null = null;
  private planetEntries: PlanetEntry[] = [];
  /** name -> entry index to avoid O(n) scans in the per-frame hot paths. */
  private planetByName = new Map<string, PlanetEntry>();
  private orbitRingsGroup: Group | null = null;
  private ephemerisTrailsGroup: Group | null = null;
  private godMarkersGroup: Group | null = null;
  private sunGroup: Group | null = null;
  private sunLight: PointLight | null = null;
  /** Viewer-side fill light that tracks the camera so ships never silhouette. */
  private headLight: PointLight | null = null;
  private readonly systemCenter = new Vector3(0, 0, 0);
  private shipMarkers = new Group();
  private shipBlips = new Group();
  private transitArcs = new Group();
  /** Structural fingerprint of the last-built marker set; skips redundant rebuilds. */
  private lastMarkerSignature: string | null = null;
  private readonly arcScratch = new Vector3();
  private readonly arcMid = new Vector3();
  private readonly orbitEngine = new SystemOrbitEngine();
  private layout: SystemLayout3d = {
    scale: 2,
    centerX: 0,
    centerY: 0,
    displayPositions: new Map(),
    sceneExtent: 120,
  };
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly clock = new Clock();
  private animFrameId = 0;
  private resizeObserver: ResizeObserver | null = null;
  /** Render loop gates: paused when the tab is hidden or the host is off-screen. */
  private running = false;
  private onScreen = true;
  private visObserver: IntersectionObserver | null = null;
  /** Reused per-frame frustum for gating animated-material updates and body LOD. */
  private readonly frustum = new Frustum();
  private readonly frustumMat = new Matrix4();
  private readonly lodScratch = new Vector3();
  private disposed = false;
  private sceneReady = false;
  private radarFlashUntil = 0;
  private shakeUntil = 0;
  private shakeSeed = 0;
  private lastPointerClientX = 0;
  private lastPointerClientY = 0;

  private cameraYaw = 0;
  private cameraPitch = 0.25;
  private godViewYaw = 0;
  private godViewPitch = 1.15;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartYaw = 0;
  private dragStartPitch = 0;
  private pointerDownX = 0;
  private pointerDownY = 0;

  private landingProgress = 0;
  private landingFrom = new Vector3();
  private landingTo = new Vector3();
  private landingTarget: PlanetEntry | null = null;
  private landingEmitted = false;

  private readonly cameraOffset = new Vector3(0, 4, 11);
  private readonly tempVec = new Vector3();
  private followPosition = new Vector3();

  // Pre-allocated scratch vectors reused every frame to avoid GC pressure.
  private readonly markerOriginPos = new Vector3();
  private readonly markerDestPos = new Vector3();
  private readonly camOffsetScratch = new Vector3();
  private readonly camTargetScratch = new Vector3();
  private readonly viewOffsetScratch = new Vector3();
  private readonly shipResolveA = new Vector3();
  private readonly shipResolveB = new Vector3();
  private readonly shipResolveResult = new Vector3();
  private readonly landingOffsetScratch = new Vector3();
  private readonly xAxis = new Vector3(1, 0, 0);
  private readonly yAxis = new Vector3(0, 1, 0);

  // Frame-time instrumentation + adaptive quality.
  private readonly devMode = isDevMode();
  private frameMsEma = 0;
  private frameSampleCount = 0;
  private overBudgetMs = 0;
  private lowPixelRatio = false;
  private lastRadarDraw = 0;

  toggleCameraMode(): void {
    const next = this.cameraMode() === 'flight' ? 'god' : 'flight';
    this.cameraMode.set(next);
    if (next === 'god') {
      this.godViewYaw = this.cameraYaw;
      this.godViewPitch = 1.15;
    } else {
      this.hoveredPlanet.set(null);
      this.hoverTooltip.set(null);
    }
    this.updateGodModeVisibility();
  }

  togglePlanetNames(): void {
    this.showPlanetNames.update((v) => !v);
  }

  setGodViewFilter(filter: GodViewFilter): void {
    this.godViewFilter.set(filter);
    this.applyGodViewFilter();
  }

  setTimeScale(scale: number): void {
    this.timeScale.set(scale);
  }

  private godMarkerContext(): GodMarkerContext {
    return {
      filter: this.godViewFilter(),
      focusPlanetName: this.focusPlanetName(),
      selectedPlanetName: this.focusPlanetName(),
      shipCounts: this.shipCountsByWaypoint(),
      contractWaypoints: this.contractWaypoints(),
    };
  }

  private updateGodModeVisibility(): void {
    const isGod = this.cameraMode() === 'god';
    if (this.orbitRingsGroup) {
      this.orbitRingsGroup.visible = isGod;
    }
    if (this.ephemerisTrailsGroup) {
      this.ephemerisTrailsGroup.visible = isGod;
    }
    if (this.godMarkersGroup) {
      this.godMarkersGroup.visible = isGod;
    }
    for (const entry of this.planetEntries) {
      entry.group.visible = !isGod;
    }
    if (this.sunGroup) {
      this.sunGroup.visible = true;
    }
  }

  /** Rebuild just the god-view marker discs/rings (e.g. when contract highlights change). */
  private rebuildGodMarkers(): void {
    if (!this.godMarkersGroup) return;
    const ctx = this.godMarkerContext();
    this.scene.remove(this.godMarkersGroup);
    disposeObject3D(this.godMarkersGroup);
    this.godMarkersGroup = buildGodViewMarkers(this.planets(), this.layout, ctx);
    this.godMarkersGroup.visible = this.cameraMode() === 'god';
    this.scene.add(this.godMarkersGroup);
  }

  private applyGodViewFilter(): void {
    const ctx = this.godMarkerContext();
    if (this.godMarkersGroup) {
      updateGodMarkerFilter(this.godMarkersGroup, ctx);
      updateGodMarkerHighlights(this.godMarkersGroup, this.hoveredPlanet()?.name ?? null, ctx);
    }
    if (this.orbitRingsGroup) {
      updateOrbitTicks(this.orbitRingsGroup, this.planets(), this.layout, ctx);
    }
  }

  constructor() {
    effect(() => {
      const list = this.planets();
      if (!this.sceneReady) return;
      this.rebuildPlanets(list);
    });

    effect(() => {
      const fleet = this.ships();
      const sys = this.systemSymbol();
      if (!this.sceneReady) return;
      this.updateShipMarkers(fleet, sys);
      if (this.cameraMode() === 'god') {
        this.applyGodViewFilter();
      }
    });

    effect(() => {
      const name = this.focusPlanetName();
      if (!this.sceneReady || !name) return;
      this.focusOnPlanet(name);
      if (this.cameraMode() === 'god') {
        this.applyGodViewFilter();
      }
    });

    effect(() => {
      const symbol = this.focusShipSymbol();
      const fleet = this.ships();
      const sys = this.systemSymbol();
      if (!this.sceneReady || !symbol) return;
      const ship = fleet.find((s) => s.symbol === symbol);
      if (ship) this.focusOnShip(ship, sys);
    });

    effect(() => {
      const role = this.selectedShipRole();
      if (!this.sceneReady) return;
      this.rebuildPlayerShip(role ?? 'EXPLORER');
    });

    effect(() => {
      const active = this.landingActive();
      const target = this.landingPlanet();
      if (!this.sceneReady || !active || !target) return;
      this.startLanding(target);
    });

    effect(() => {
      if (!this.sceneReady) return;
      this.godViewFilter();
      this.shipCountsByWaypoint();
      if (this.cameraMode() === 'god') {
        this.applyGodViewFilter();
      }
    });

    effect(() => {
      this.contractWaypoints();
      if (!this.sceneReady) return;
      this.rebuildGodMarkers();
    });

    effect(() => {
      const pulse = this.actionPulse();
      if (!this.sceneReady || pulse === 0) return;
      this.triggerActionPulse();
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.initScene();
      this.rebuildPlanets(this.planets());
      this.updateShipMarkers(this.ships(), this.systemSymbol());
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
    this.clearPlanets();
    this.clearShipBlips();
    this.clearTransitArcs();
    if (this.shipGroup) disposeShip(this.shipGroup);
    this.surfaceBaker?.dispose();
    this.composer?.dispose();
    this.renderer?.dispose();
  }

  onRadarClick(event: MouseEvent): void {
    const canvas = this.radarRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = event.clientX - rect.left - cx;
    const dy = event.clientY - rect.top - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > cx) return;

    const angle = Math.atan2(dy, dx);
    let nearest: PlanetEntry | null = null;
    let nearestDist = Infinity;

    for (const entry of this.planetEntries) {
      const pos = entry.group.position;
      const a = Math.atan2(pos.z - this.shipGroup.position.z, pos.x - this.shipGroup.position.x);
      const diff = Math.abs(Math.atan2(Math.sin(a - angle), Math.cos(a - angle)));
      const d = this.tempVec.copy(pos).sub(this.shipGroup.position).length();
      if (diff < 0.5 && d < nearestDist) {
        nearest = entry;
        nearestDist = d;
      }
    }

    if (nearest) {
      this.zone.run(() => this.planetClick.emit(nearest!.planet));
    }
  }

  private initScene(): void {
    const host = this.hostRef.nativeElement;

    this.scene = new Scene();
    this.scene.background = new Color(0x050810);
    this.scene.add(buildNebulaBackground());
    this.scene.add(buildStarfieldEnhanced());

    const sun = buildSystemSun(Math.max(10, 8));
    this.sunGroup = sun.group;
    this.sunLight = sun.light;
    this.scene.add(this.sunGroup);

    this.camera = new PerspectiveCamera(55, 1, 0.1, 4000);
    this.camera.position.set(0, 4, 12);

    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(this.targetPixelRatio());
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = SRGBColorSpace;
    const canvasEl = this.renderer.domElement;
    canvasEl.style.display = 'block';
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    host.appendChild(canvasEl);

    this.scene.add(new AmbientLight(0x1a2040, 0.12));
    // Sky/ground hemisphere fill gives ship hulls soft volumetric shading
    // (the planets are shader-lit, so this only shapes the standard-material
    // ship meshes). A camera-tracking point light keeps the focused ship lit
    // from the viewer's side so it never collapses into a black cut-out.
    this.scene.add(new HemisphereLight(0x9fb6ff, 0x141026, 0.55));
    this.headLight = new PointLight(0xcfe0ff, 0.85, 0, 1.6);
    this.headLight.position.copy(this.camera.position);
    this.scene.add(this.headLight);

    this.surfaceBaker = new SurfaceBaker(this.renderer);

    this.shipGroup = new Group();
    this.scene.add(this.shipGroup);

    this.shipMarkers = new Group();
    this.shipMarkers.name = 'ship-markers';
    this.scene.add(this.shipMarkers);

    this.shipBlips = new Group();
    this.shipBlips.name = 'ship-blips';
    this.scene.add(this.shipBlips);

    this.transitArcs = new Group();
    this.transitArcs.name = 'transit-arcs';
    this.scene.add(this.transitArcs);

    this.setupComposer();
    this.refreshAnimatedMaterials();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  private setupComposer(): void {
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));

    // Bloom runs at half resolution (its blur mip-chain is the expensive part);
    // the composite back to full res keeps the glow looking smooth.
    const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.6, 0.4, 0.85);
    composer.addPass(bloom);
    // OutputPass performs the single ACES tone map + sRGB conversion from the
    // renderer settings; intermediate passes stay linear, so it is not doubled.
    composer.addPass(new OutputPass());

    this.composer = composer;
    this.bloomPass = bloom;
  }

  /** Capped device pixel ratio; drops to 1.0 when the frame budget is blown. */
  private targetPixelRatio(): number {
    const cap = Math.min(window.devicePixelRatio || 1, 1.5);
    return this.lowPixelRatio ? Math.min(1, cap) : cap;
  }

  toggleBloom(): void {
    this.bloomManual = true;
    this.highQuality.update((v) => !v);
  }

  private refreshAnimatedMaterials(): void {
    const list: AnimatedMaterialEntry[] = [];
    this.scene.traverse((obj) => {
      const raw = (obj as Mesh).material;
      if (!raw) return;
      const mats = Array.isArray(raw) ? raw : [raw];
      // Only celestial-body materials are gated; background/sun cover the whole
      // view (or sit at the center) and must keep animating off-frustum.
      const gate = obj.userData['planet'] !== undefined;
      for (const m of mats) {
        if (m instanceof ShaderMaterial && m.uniforms['uTime']) {
          list.push({ mat: m, host: obj, gate });
        }
      }
    });
    this.animatedMaterials = list;
  }

  private rebuildPlayerShip(role: string): void {
    if (this.playerShipRole === role && this.shipGroup?.children.length) return;
    this.playerShipRole = role;

    if (this.shipGroup) {
      this.scene?.remove(this.shipGroup);
      disposeShip(this.shipGroup);
    }

    const built = buildProceduralShip(role);
    this.shipGroup = built.root;
    this.shipGroup.scale.setScalar(PLAYER_SHIP_SCALE);
    this.thrusterLights = [];
    this.scene?.add(this.shipGroup);
    this.shipGroup.position.copy(this.followPosition);
    this.shipGroup.visible = !!this.selectedShipSymbol();
  }

  private shipMarkerScaleForRole(role: string, baseScale: number): number {
    const profile = role === 'SATELLITE' ? 0.6 : 1;
    return baseScale * profile;
  }

  private createShipMarker(ship: ShipData, baseScale: number): Group {
    const marker = buildProceduralShip(ship.registration.role).root;
    const finalScale = this.shipMarkerScaleForRole(ship.registration.role, baseScale);
    marker.scale.setScalar(finalScale);
    marker.userData['ship'] = ship;
    marker.userData['baseScale'] = finalScale;
    marker.userData['pulsePhase'] = this.markerPulsePhase(ship.symbol);
    return marker;
  }

  private markerPulsePhase(symbol: string): number {
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
      hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
    }
    return (hash % 1000) / 1000;
  }

  private createShipBlip(radius: number, color: number): Mesh {
    const blip = new Mesh(
      new RingGeometry(radius * 0.68, radius, 28),
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    blip.rotation.x = -Math.PI / 2;
    return blip;
  }

  private clearShipBlips(): void {
    while (this.shipBlips.children.length) {
      const child = this.shipBlips.children[0]!;
      this.shipBlips.remove(child);
      disposeObject3D(child);
    }
  }

  private createTransitArc(ship: ShipData, color: number): Group {
    const positions = new Float32Array((ARC_SEGMENTS + 1) * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const line = new Line(
      geometry,
      new LineBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    const dot = new Mesh(
      new SphereGeometry(1.1, 12, 12),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    const group = new Group();
    group.add(line);
    group.add(dot);
    group.userData['arc'] = {
      ship,
      curve: new QuadraticBezierCurve3(),
      line,
      dot,
    } satisfies TransitArcData;
    return group;
  }

  private clearTransitArcs(): void {
    while (this.transitArcs.children.length) {
      const child = this.transitArcs.children[0]!;
      this.transitArcs.remove(child);
      disposeObject3D(child);
    }
  }

  /**
   * Point on a transit arc at progress `t`, matching the drawn line exactly:
   * a quadratic bezier whose control point is the origin/dest midpoint lifted
   * in Y by `max(6, dist * 0.18)` (see {@link updateTransitArcs}). Both the
   * marker and the camera-followed ship sample this so they ride the line.
   */
  private sampleTransitArc(v0: Vector3, v2: Vector3, t: number, target: Vector3): Vector3 {
    const lift = Math.max(6, v0.distanceTo(v2) * 0.18);
    const mx = (v0.x + v2.x) * 0.5;
    const my = (v0.y + v2.y) * 0.5 + lift;
    const mz = (v0.z + v2.z) * 0.5;
    const u = 1 - t;
    const a = u * u;
    const b = 2 * u * t;
    const c = t * t;
    return target.set(
      a * v0.x + b * mx + c * v2.x,
      a * v0.y + b * my + c * v2.y,
      a * v0.z + b * mz + c * v2.z,
    );
  }

  /**
   * Yaw/pitch a transit object so its nose (the procedural hull faces -Z)
   * points along the arc's tangent at progress `t`. Uses a look-ahead sample
   * on the same bezier the line is drawn from, so the ship banks into the curve.
   */
  private orientAlongArc(obj: Object3D, v0: Vector3, v2: Vector3, t: number): void {
    const ahead = this.sampleTransitArc(v0, v2, Math.min(1, t + 0.03), this.tempVec);
    if (ahead.distanceToSquared(obj.position) < 1e-5) return;
    obj.lookAt(ahead);
    obj.rotateY(Math.PI);
  }

  private updateTransitArcs(elapsed: number): void {
    const dotPulse = 1 + Math.sin(elapsed * 6) * 0.25;
    for (const group of this.transitArcs.children) {
      const arc = group.userData['arc'] as TransitArcData | undefined;
      if (!arc) continue;
      const route = arc.ship.nav.route;
      if (!route) continue;

      this.orbitEngine.getWorldPosition(route.origin.symbol, arc.curve.v0);
      this.orbitEngine.getWorldPosition(route.destination.symbol, arc.curve.v2);
      const dist = arc.curve.v0.distanceTo(arc.curve.v2);
      this.arcMid.addVectors(arc.curve.v0, arc.curve.v2).multiplyScalar(0.5);
      this.arcMid.y += Math.max(6, dist * 0.18);
      arc.curve.v1.copy(this.arcMid);

      const geometry = arc.line.geometry as BufferGeometry;
      const attr = geometry.getAttribute('position') as Float32BufferAttribute;
      for (let i = 0; i <= ARC_SEGMENTS; i++) {
        arc.curve.getPoint(i / ARC_SEGMENTS, this.arcScratch);
        attr.setXYZ(i, this.arcScratch.x, this.arcScratch.y, this.arcScratch.z);
      }
      attr.needsUpdate = true;

      arc.curve.getPoint(getTransitProgress(route), this.arcScratch);
      arc.dot.position.copy(this.arcScratch);
      arc.dot.scale.setScalar(dotPulse);
    }
  }

  private animateShipMarkers(elapsed: number): void {
    for (const child of this.shipMarkers.children) {
      const baseScale = child.userData['baseScale'] as number | undefined;
      const phase = (child.userData['pulsePhase'] as number | undefined) ?? 0;
      if (baseScale !== undefined) {
        const breathe = 1 + Math.sin(elapsed * 4 + phase * Math.PI * 2) * 0.08;
        child.scale.setScalar(baseScale * breathe);
      }
      const blip = child.userData['blip'] as Mesh | undefined;
      if (blip) {
        const ping = (((elapsed * 0.65 + phase) % 1) + 1) % 1;
        blip.scale.setScalar(0.6 + ping * 1.4);
        (blip.material as MeshBasicMaterial).opacity = Math.max(0, (1 - ping) * 0.55);
      }
    }
  }

  private applyBodySpin(warpedDelta: number): void {
    if (warpedDelta <= 0) return;
    for (const entry of this.planetEntries) {
      if (entry.spinRate === 0) continue;
      entry.group.rotateOnAxis(entry.spinAxis, entry.spinRate * warpedDelta);
    }
  }

  /** Squared distance beyond which a body is treated as "far": its atmosphere/
   * glow shells are hidden and its animated shader is frozen. Derived from the
   * scene extent so it scales with system size. */
  private lodFarDistanceSq(): number {
    const d = this.layout.sceneExtent * LOD_FAR_FACTOR;
    return d * d;
  }

  /** Hides decorative shells on bodies far from the camera. The body shader is
   * frozen separately in updateAnimatedMaterials using the same distance test. */
  private applyPlanetLod(): void {
    const farSq = this.lodFarDistanceSq();
    for (const entry of this.planetEntries) {
      if (!entry.decorShells.length) continue;
      const far = this.camera.position.distanceToSquared(entry.group.position) > farSq;
      for (const shell of entry.decorShells) {
        if (shell.visible === far) shell.visible = !far;
      }
    }
  }

  private rebuildPlanets(planets: PlanetView[]): void {
    this.clearPlanets();
    this.layout = computeSystemLayout3d(planets);
    this.orbitEngine.build(planets, this.layout);
    this.syncLayoutDisplayPositions();

    if (this.orbitRingsGroup) {
      this.scene.remove(this.orbitRingsGroup);
      disposeObject3D(this.orbitRingsGroup);
      this.orbitRingsGroup = null;
    }
    if (this.ephemerisTrailsGroup) {
      this.scene.remove(this.ephemerisTrailsGroup);
      disposeObject3D(this.ephemerisTrailsGroup);
      this.ephemerisTrailsGroup = null;
    }
    if (this.godMarkersGroup) {
      this.scene.remove(this.godMarkersGroup);
      disposeObject3D(this.godMarkersGroup);
      this.godMarkersGroup = null;
    }

    for (const planet of planets) {
      const built = buildCelestialBody(planet, this.layout, this.surfaceBaker ?? undefined);
      const pos = this.orbitEngine.getWorldPosition(planet.name);
      built.group.position.copy(pos);
      this.scene.add(built.group);
      const decorShells: Mesh[] = [];
      built.group.traverse((child) => {
        if (child instanceof Mesh && child.userData['decor']) decorShells.push(child);
      });
      const entry: PlanetEntry = {
        planet,
        group: built.group,
        radius: built.radius,
        spinAxis: built.spinAxis,
        spinRate: built.spinRate,
        surfaceTarget: built.surfaceTarget,
        decorShells,
      };
      this.planetEntries.push(entry);
      this.planetByName.set(planet.name, entry);
    }

    const ctx = this.godMarkerContext();
    this.orbitRingsGroup = buildOrbitRings(planets, this.layout, this.godViewFilter(), ctx);
    this.orbitRingsGroup.visible = this.cameraMode() === 'god';
    this.scene.add(this.orbitRingsGroup);

    this.ephemerisTrailsGroup = buildEphemerisTrails(this.orbitEngine, planets);
    this.ephemerisTrailsGroup.visible = this.cameraMode() === 'god';
    this.scene.add(this.ephemerisTrailsGroup);

    this.godMarkersGroup = buildGodViewMarkers(planets, this.layout, ctx);
    this.godMarkersGroup.visible = this.cameraMode() === 'god';
    this.scene.add(this.godMarkersGroup);

    this.updateGodModeVisibility();

    if (this.planetEntries.length && this.shipGroup.position.lengthSq() < 0.01) {
      const first = this.planetEntries[0]!;
      this.orbitEngine.getWorldPosition(first.planet.name, this.followPosition);
      this.followPosition.add(this.bodyViewOffset(first.radius));
      this.shipGroup.position.copy(this.followPosition);
    }

    this.camera.far = Math.max(4000, this.orbitEngine.sceneExtent(planets) * 5);
    this.camera.updateProjectionMatrix();

    if (this.sunLight) {
      const extent = this.orbitEngine.sceneExtent(planets);
      this.sunLight.intensity = Math.min(5, 2.5 + extent * 0.008);
      this.sunLight.distance = extent * 6;
    }

    this.refreshAnimatedMaterials();
    this.drawRadar();
  }

  private clearPlanets(): void {
    for (const entry of this.planetEntries) {
      this.scene.remove(entry.group);
      disposeObject3D(entry.group);
      entry.surfaceTarget?.dispose();
    }
    this.planetEntries = [];
    this.planetByName.clear();
  }

  private updateShipMarkers(fleet: ShipData[], systemSymbol: string): void {
    const selected = this.selectedShipSymbol();
    const onMap = shipsOnMap(fleet, systemSymbol);

    // Transit polling re-emits the fleet every few seconds purely to refresh
    // ETA/progress, but per-frame motion is driven by getTransitProgress in the
    // render loop — not by these markers. Rebuilding every procedural hull on
    // each poll is what makes navigation stutter, so skip the expensive
    // teardown unless the fleet's *structure* actually changed.
    const signature = this.computeMarkerSignature(onMap, systemSymbol, selected);
    if (signature === this.lastMarkerSignature) return;
    this.lastMarkerSignature = signature;

    while (this.shipMarkers.children.length) {
      const child = this.shipMarkers.children[0];
      this.shipMarkers.remove(child);
      disposeShip(child);
    }
    this.clearShipBlips();
    this.clearTransitArcs();

    const byWaypoint = new Map<string, ShipData[]>();

    for (const ship of onMap) {
      if (shipInTransit(ship)) continue;
      const key = ship.nav.waypointSymbol;
      const list = byWaypoint.get(key) ?? [];
      list.push(ship);
      byWaypoint.set(key, list);
    }

    for (const [waypointSymbol, shipsAt] of byWaypoint) {
      const entry = this.planetByName.get(waypointSymbol);
      if (!entry) continue;

      shipsAt.forEach((ship, index) => {
        const isSelected = ship.symbol === selected;
        // The selected ship is already drawn as the camera-followed shipGroup;
        // skip its marker so it doesn't render twice.
        if (isSelected) return;
        const marker = this.createShipMarker(ship, shipMarkerScale(entry.radius, isSelected));
        marker.userData['markerData'] = {
          kind: 'docked',
          ship,
          waypointSymbol,
          orbitIndex: index,
          orbitTotal: shipsAt.length,
        } satisfies DockedShipMarkerData;
        if (isSelected) {
          marker.userData['selected'] = true;
        }
        const blip = this.createShipBlip(
          Math.max(2.5, entry.radius * 0.5),
          isSelected ? BLIP_SELECTED_COLOR : BLIP_DOCKED_COLOR,
        );
        marker.userData['blip'] = blip;
        this.shipBlips.add(blip);
        this.shipMarkers.add(marker);
      });
    }

    for (const ship of onMap.filter(shipInTransit)) {
      const route = ship.nav.route;
      if (!route) continue;
      const originPlanet = this.planetByName.get(route.origin.symbol);
      const destPlanet = this.planetByName.get(route.destination.symbol);
      if (!originPlanet || !destPlanet) continue;

      const isSelected = ship.symbol === selected;
      // The selected ship is drawn as the camera-followed shipGroup, so skip its
      // duplicate marker — but still draw its arc so it visibly rides the line.
      if (!isSelected) {
        const marker = this.createShipMarker(ship, shipMarkerScale(originPlanet.radius, isSelected));
        marker.userData['markerData'] = {
          kind: 'transit',
          ship,
          originSymbol: route.origin.symbol,
          destSymbol: route.destination.symbol,
        } satisfies TransitShipMarkerData;
        marker.userData['ship'] = ship;
        const blip = this.createShipBlip(
          Math.max(2.5, originPlanet.radius * 0.5),
          BLIP_TRANSIT_COLOR,
        );
        marker.userData['blip'] = blip;
        this.shipBlips.add(blip);
        this.shipMarkers.add(marker);
      }

      const arc = this.createTransitArc(ship, isSelected ? BLIP_SELECTED_COLOR : BLIP_TRANSIT_COLOR);
      if (isSelected) {
        (arc.userData['arc'] as TransitArcData).dot.visible = false;
      }
      this.transitArcs.add(arc);
    }

    this.applyShipMarkerPositions();
    this.syncFollowShip(fleet, systemSymbol);
  }

  /**
   * Structural fingerprint of the on-map fleet (identity, role, status, location
   * and transit route). Excludes transit *progress*, which animates per-frame,
   * so polling that only advances ETA does not trigger a marker rebuild.
   */
  private computeMarkerSignature(
    onMap: ShipData[],
    systemSymbol: string,
    selected: string | null,
  ): string {
    const parts = onMap
      .map((s) => {
        const route = s.nav.route;
        const leg = shipInTransit(s) && route
          ? `${route.origin.symbol}>${route.destination.symbol}`
          : '';
        return `${s.symbol}|${s.registration.role}|${s.nav.status}|${s.nav.waypointSymbol}|${leg}`;
      })
      .sort();
    return `${systemSymbol}#${selected ?? ''}#${parts.join(',')}`;
  }

  private syncLayoutDisplayPositions(): void {
    for (const [symbol, pos] of this.orbitEngine.getAllPositions()) {
      this.layout.displayPositions.set(symbol, { x: pos.x, z: pos.z });
    }
    this.layout.sceneExtent = this.orbitEngine.sceneExtent(this.planets());
  }

  private applyOrbitalPositions(): void {
    this.syncLayoutDisplayPositions();

    for (const entry of this.planetEntries) {
      this.orbitEngine.getWorldPosition(entry.planet.name, entry.group.position);
    }

    if (this.godMarkersGroup) {
      syncMarkerPositions(this.godMarkersGroup, this.orbitEngine.getAllPositions());
    }

    if (this.orbitRingsGroup) {
      syncOrbitTickPositions(this.orbitRingsGroup, this.orbitEngine.getAllPositions());
    }

    if (this.ephemerisTrailsGroup) {
      syncEphemerisTrails(this.ephemerisTrailsGroup, this.orbitEngine.getAllPositions());
    }

    this.applyShipMarkerPositions();

    if (this.landingActive() && this.landingTarget) {
      this.orbitEngine.getWorldPosition(this.landingTarget.planet.name, this.landingTo);
      this.landingTo.add(
        this.landingOffsetScratch.set(0, this.landingTarget.radius * 0.5, this.landingTarget.radius + 2),
      );
    }

    if (this.cameraMode() === 'flight' && !this.landingActive()) {
      this.syncFollowShip(this.ships(), this.systemSymbol());
    }
  }

  private applyShipMarkerPositions(): void {
    const originPos = this.markerOriginPos;
    const destPos = this.markerDestPos;

    for (const child of this.shipMarkers.children) {
      const data = child.userData['markerData'] as ShipMarkerData | undefined;
      if (!data) continue;

      if (data.kind === 'docked') {
        const entry = this.planetByName.get(data.waypointSymbol);
        if (!entry) continue;
        const orbitR = shipOrbitDistance(entry.radius);
        const offset = shipOrbitOffset(data.orbitIndex, data.orbitTotal, orbitR);
        this.orbitEngine.getWorldPosition(data.waypointSymbol, originPos);
        child.position.set(
          originPos.x + offset.x,
          originPos.y + entry.radius * 0.35 + 1.5,
          originPos.z + offset.y,
        );
        this.syncBlipToMarker(child);
        continue;
      }

      const route = data.ship.nav.route;
      if (!route) continue;
      const originEntry = this.planetByName.get(data.originSymbol);
      const destEntry = this.planetByName.get(data.destSymbol);
      if (!originEntry || !destEntry) continue;

      const t = getTransitProgress(route);
      this.orbitEngine.getWorldPosition(data.originSymbol, originPos);
      this.orbitEngine.getWorldPosition(data.destSymbol, destPos);
      this.sampleTransitArc(originPos, destPos, t, child.position);
      this.orientAlongArc(child, originPos, destPos, t);
      this.syncBlipToMarker(child);
    }
  }

  private syncBlipToMarker(marker: Object3D): void {
    const blip = marker.userData['blip'] as Mesh | undefined;
    if (blip) {
      blip.position.set(marker.position.x, marker.position.y - 0.4, marker.position.z);
    }
  }

  private syncFollowShip(fleet: ShipData[], systemSymbol: string): void {
    if (this.cameraMode() === 'god') return;

    const selected = this.selectedShipSymbol();
    const ship = selected ? fleet.find((s) => s.symbol === selected) : null;
    if (ship) {
      this.followPosition.copy(this.resolveShipWorldPosition(ship, systemSymbol));
    } else if (this.planetEntries.length) {
      const first = this.planetEntries[0]!;
      this.followPosition.copy(first.group.position).add(this.bodyViewOffset(first.radius));
    }
    this.shipGroup.position.copy(this.followPosition);
    this.shipGroup.visible = !!ship;
    this.orientFollowShip(ship ?? null);
  }

  /** Point the followed ship down its travel arc; rest in its built pose otherwise. */
  private orientFollowShip(ship: ShipData | null): void {
    if (ship && shipInTransit(ship) && ship.nav.route) {
      const route = ship.nav.route;
      if (this.planetByName.has(route.origin.symbol) && this.planetByName.has(route.destination.symbol)) {
        const t = getTransitProgress(route);
        this.orbitEngine.getWorldPosition(route.origin.symbol, this.shipResolveA);
        this.orbitEngine.getWorldPosition(route.destination.symbol, this.shipResolveB);
        this.orientAlongArc(this.shipGroup, this.shipResolveA, this.shipResolveB, t);
        return;
      }
    }
    this.shipGroup.rotation.set(0, Math.PI * 0.12, 0);
  }

  private resolveShipWorldPosition(ship: ShipData, _systemSymbol: string): Vector3 {
    if (shipInTransit(ship) && ship.nav.route) {
      const route = ship.nav.route;
      const originEntry = this.planetByName.get(route.origin.symbol);
      const destEntry = this.planetByName.get(route.destination.symbol);
      if (originEntry && destEntry) {
        const t = getTransitProgress(route);
        this.orbitEngine.getWorldPosition(route.origin.symbol, this.shipResolveA);
        this.orbitEngine.getWorldPosition(route.destination.symbol, this.shipResolveB);
        this.sampleTransitArc(this.shipResolveA, this.shipResolveB, t, this.shipResolveResult);
        return this.shipResolveResult;
      }
    }
    const entry = this.planetByName.get(ship.nav.waypointSymbol);
    if (!entry) {
      return this.shipResolveResult.copy(this.followPosition);
    }
    const offset = shipOrbitOffset(0, 1, shipOrbitDistance(entry.radius));
    this.orbitEngine.getWorldPosition(entry.planet.name, this.shipResolveA);
    return this.shipResolveResult
      .copy(this.shipResolveA)
      .add(this.shipResolveB.set(offset.x, entry.radius * 0.35 + 1.5, offset.y));
  }

  focusOnShip(ship: ShipData, systemSymbol: string): void {
    if (!this.sceneReady) return;
    this.followPosition.copy(this.resolveShipWorldPosition(ship, systemSymbol));
    this.shipGroup.position.copy(this.followPosition);
  }

  /** Standoff offset placing the ship above and in front of a body, scaled so
   * larger bodies are viewed from proportionally farther away. */
  private bodyViewOffset(radius: number): Vector3 {
    return this.viewOffsetScratch.set(0, radius * 0.6 + 4, radius * 2.4 + 16);
  }

  private focusOnPlanet(name: string): void {
    const entry = this.planetByName.get(name);
    if (!entry) return;
    this.orbitEngine.getWorldPosition(name, this.followPosition);
    this.followPosition.add(this.bodyViewOffset(entry.radius));
    this.shipGroup.position.copy(this.followPosition);
  }

  private startLanding(planet: PlanetView): void {
    const entry = this.planetByName.get(planet.name);
    if (!entry) {
      this.zone.run(() => this.landingComplete.emit());
      return;
    }
    this.landingTarget = entry;
    this.landingProgress = 0;
    this.landingEmitted = false;
    this.landingFade.set(0);
    this.shakeSeed = Math.random() * 1000;
    this.landingFrom.copy(this.shipGroup.position);
    this.orbitEngine.getWorldPosition(planet.name, this.landingTo);
    this.landingTo.add(this.landingOffsetScratch.set(0, entry.radius * 0.5, entry.radius + 2));
  }

  private attachListeners(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    document.addEventListener('visibilitychange', this.onVisibility);
    this.visObserver = new IntersectionObserver(
      (entries) => {
        this.onScreen = entries.some((e) => e.isIntersecting);
        if (this.shouldRender()) this.resumeRenderLoop();
        else this.stopRenderLoop();
      },
      { threshold: 0 },
    );
    this.visObserver.observe(this.hostRef.nativeElement);
  }

  private detachListeners(): void {
    const canvas = this.renderer?.domElement;
    if (canvas) {
      canvas.removeEventListener('pointerdown', this.onPointerDown);
      canvas.removeEventListener('pointermove', this.onPointerMove);
      canvas.removeEventListener('pointerup', this.onPointerUp);
      canvas.removeEventListener('pointerleave', this.onPointerLeave);
    }
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);

    document.removeEventListener('visibilitychange', this.onVisibility);
    this.visObserver?.disconnect();
    this.visObserver = null;
  }

  private readonly onVisibility = (): void => {
    if (this.shouldRender()) this.resumeRenderLoop();
    else this.stopRenderLoop();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyP') {
      if (this.cameraMode() === 'flight') {
        this.cameraYaw = 0;
        this.cameraPitch = 0.25;
      } else {
        this.godViewYaw = 0;
        this.godViewPitch = 1.15;
      }
    }
    if (event.code === 'KeyG') {
      this.toggleCameraMode();
    }
  };

  private readonly onKeyUp = (_event: KeyboardEvent): void => {
    // camera-only controls
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.lastPointerClientX = event.clientX;
    this.lastPointerClientY = event.clientY;
    this.updatePointer(event);
    if (this.landingActive()) return;
    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragStartYaw = this.cameraMode() === 'god' ? this.godViewYaw : this.cameraYaw;
    this.dragStartPitch = this.cameraMode() === 'god' ? this.godViewPitch : this.cameraPitch;
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.updatePointer(event);
    this.lastPointerClientX = event.clientX;
    this.lastPointerClientY = event.clientY;

    if (this.cameraMode() === 'god' && !this.isDragging && !this.landingActive()) {
      this.updateGodHover();
    }

    if (!this.isDragging || this.landingActive()) return;
    const dx = event.clientX - this.dragStartX;
    const dy = event.clientY - this.dragStartY;
    if (this.cameraMode() === 'god') {
      this.godViewYaw = this.dragStartYaw - dx * 0.004;
      this.godViewPitch = Math.max(0.9, Math.min(1.35, this.dragStartPitch + dy * 0.003));
    } else {
      this.cameraYaw = this.dragStartYaw - dx * 0.005;
      this.cameraPitch = Math.max(-0.3, Math.min(1.2, this.dragStartPitch + dy * 0.004));
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.isDragging = false;
    const moved = Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY) > 6;
    if (!moved && !this.landingActive()) {
      this.updatePointer(event);
      this.handleClick();
    }
  };

  private readonly onPointerLeave = (_event: PointerEvent): void => {
    this.isDragging = false;
    if (this.cameraMode() === 'god') {
      this.zone.run(() => {
        this.hoveredPlanet.set(null);
        this.hoverTooltip.set(null);
      });
      if (this.godMarkersGroup) {
        updateGodMarkerHighlights(this.godMarkersGroup, null, this.godMarkerContext());
      }
    }
  };

  private updateGodHover(): void {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const markerMeshes: Mesh[] = [];
    this.godMarkersGroup?.traverse((child) => {
      if (child instanceof Mesh && child.userData['planet']) {
        markerMeshes.push(child);
      }
    });

    const hits = this.raycaster.intersectObjects(markerMeshes, false);
    const hit = hits[0]?.object;
    const planet = hit?.userData['planet'] as PlanetView | undefined;

    if (this.godMarkersGroup) {
      updateGodMarkerHighlights(
        this.godMarkersGroup,
        planet?.name ?? null,
        this.godMarkerContext(),
      );
    }

    this.zone.run(() => {
      if (planet) {
        this.hoveredPlanet.set(planet);
        this.hoverTooltip.set({
          planet,
          x: this.lastPointerClientX + 14,
          y: this.lastPointerClientY + 14,
          shipCount: this.shipCountsByWaypoint().get(planet.name) ?? 0,
        });
      } else {
        this.hoveredPlanet.set(null);
        this.hoverTooltip.set(null);
      }
    });
  }

  private updatePointer(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private handleClick(): void {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const shipHits = this.raycaster.intersectObjects(this.shipMarkers.children, true);
    for (const hit of shipHits) {
      let obj = hit.object;
      while (obj.parent && obj.parent !== this.shipMarkers) {
        obj = obj.parent;
      }
      const ship = obj.userData['ship'] as ShipData | undefined;
      if (ship) {
        this.zone.run(() => this.shipClick.emit(ship));
        return;
      }
    }

    if (this.cameraMode() === 'god' && this.godMarkersGroup) {
      const markerMeshes: Mesh[] = [];
      this.godMarkersGroup.traverse((child) => {
        if (child instanceof Mesh && child.userData['planet']) {
          markerMeshes.push(child);
        }
      });
      const hits = this.raycaster.intersectObjects(markerMeshes, false);
      const planet = hits[0]?.object.userData['planet'] as PlanetView | undefined;
      if (planet) {
        this.zone.run(() => this.planetClick.emit(planet));
        return;
      }
    }

    const meshes: Mesh[] = [];
    for (const entry of this.planetEntries) {
      entry.group.traverse((child) => {
        if (child instanceof Mesh) meshes.push(child);
      });
    }
    const hits = this.raycaster.intersectObjects(meshes, false);
    const hit = hits[0]?.object;
    const planet = hit?.userData['planet'] as PlanetView | undefined;
    if (planet) {
      this.zone.run(() => this.planetClick.emit(planet));
    }
  }

  private resize(): void {
    const host = this.hostRef.nativeElement;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.targetPixelRatio());
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    this.bloomPass?.setSize(Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2)));
  }

  /** True only when nothing should pause the loop: not disposed, tab visible,
   * and the host element is on-screen. */
  private shouldRender(): boolean {
    return !this.disposed && !document.hidden && this.onScreen;
  }

  /** Halts requestAnimationFrame scheduling without tearing down the scene. */
  private stopRenderLoop(): void {
    this.running = false;
    cancelAnimationFrame(this.animFrameId);
  }

  /** Restarts the loop after a pause; purges the accumulated clock delta so the
   * first resumed frame does not jump the simulation forward. */
  private resumeRenderLoop(): void {
    if (this.running || !this.shouldRender()) return;
    this.clock.getDelta();
    this.startRenderLoop();
  }

  private startRenderLoop(): void {
    this.running = true;
    const render = (): void => {
      if (this.disposed || !this.running) return;
      this.animFrameId = requestAnimationFrame(render);
      const frameStart = performance.now();
      const delta = Math.min(this.clock.getDelta(), 0.05);
      const elapsed = this.clock.getElapsedTime();
      const warpedDelta = delta * this.timeScale();

      this.orbitEngine.tick(warpedDelta);
      this.applyOrbitalPositions();
      this.applyBodySpin(warpedDelta);
      this.applyPlanetLod();
      this.updateAnimatedMaterials(elapsed);
      this.animateShipMarkers(elapsed);
      this.updateTransitArcs(elapsed);

      if (this.landingActive() && this.landingTarget) {
        this.landingProgress = Math.min(1, this.landingProgress + delta / 1.5);
        const eased = this.easeInOut(this.landingProgress);
        this.shipGroup.position.lerpVectors(this.landingFrom, this.landingTo, eased);
        this.shipGroup.lookAt(this.orbitEngine.getWorldPosition(this.landingTarget.planet.name, this.tempVec));
        const fade = Math.min(1, Math.max(0, (this.landingProgress - 0.4) / 0.6));
        this.landingFade.set(Math.pow(fade, 1.2));
        if (this.landingProgress >= 1) {
          if (!this.landingEmitted) {
            this.landingEmitted = true;
            this.zone.run(() => this.landingComplete.emit());
          }
        }
      } else if (this.landingFade() !== 0) {
        this.landingFade.set(0);
      }

      this.updateCamera();
      this.updatePlanetLabels();
      this.updateThrusters(elapsed);
      this.drawRadar();
      if (this.highQuality() && this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      this.sampleFrameTime(performance.now() - frameStart);
    };
    render();
  }

  /** Tracks an EMA of ms/frame and drives adaptive quality. */
  private sampleFrameTime(ms: number): void {
    this.frameMsEma = this.frameMsEma === 0 ? ms : this.frameMsEma * 0.9 + ms * 0.1;
    this.frameSampleCount++;
    if (this.devMode && this.frameSampleCount % 120 === 0) {
      const fps = this.frameMsEma > 0 ? 1000 / this.frameMsEma : 0;
      console.debug(
        `[system-flight-view] ~${this.frameMsEma.toFixed(2)} ms/frame (${fps.toFixed(0)} fps), ` +
          `bloom=${this.highQuality() ? 'on' : 'off'}, pixelRatio=${this.renderer.getPixelRatio().toFixed(2)}`,
      );
    }
    this.updateAdaptiveQuality(ms);
  }

  /** Drops bloom (then pixel ratio) when the frame budget is sustained-blown,
   * and recovers once headroom returns. Manual bloom toggle disables auto-bloom. */
  private updateAdaptiveQuality(ms: number): void {
    const BUDGET_MS = 22; // ~45fps
    const RECOVER_MS = BUDGET_MS * 0.6;

    if (this.frameMsEma > BUDGET_MS) {
      this.overBudgetMs += ms;
    } else if (this.frameMsEma < RECOVER_MS) {
      this.overBudgetMs = Math.max(0, this.overBudgetMs - ms * 2);
    }

    const sustainedOver = this.overBudgetMs > 1000;
    const sustainedHeadroom = this.frameMsEma < RECOVER_MS && this.overBudgetMs === 0;

    if (!this.bloomManual) {
      if (sustainedOver && this.highQuality()) {
        this.highQuality.set(false);
        this.overBudgetMs = 0;
        return;
      }
      if (sustainedHeadroom && !this.highQuality()) {
        this.highQuality.set(true);
        return;
      }
    }

    // Last resort once bloom is already off: halve pixel ratio on HiDPI.
    const wantLow = sustainedOver && !this.highQuality();
    if (wantLow && !this.lowPixelRatio) {
      this.lowPixelRatio = true;
      this.overBudgetMs = 0;
      this.resize();
    } else if (sustainedHeadroom && this.lowPixelRatio) {
      this.lowPixelRatio = false;
      this.resize();
    }
  }

  private updateAnimatedMaterials(elapsed: number): void {
    this.frustumMat.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.frustumMat);
    const farSq = this.lodFarDistanceSq();

    for (const entry of this.animatedMaterials) {
      // Freeze gated (per-body) materials the camera cannot see or that are far
      // away; ungated background/sun materials always advance.
      if (entry.gate && entry.host) {
        entry.host.getWorldPosition(this.lodScratch);
        if (!this.frustum.containsPoint(this.lodScratch)) continue;
        if (this.camera.position.distanceToSquared(this.lodScratch) > farSq) continue;
      }
      const m = entry.mat;
      m.uniforms['uTime']!.value = elapsed;
      if (m.uniforms['sunPosition']) {
        updateLitPlanetSun(m, this.systemCenter);
      }
    }
  }

  private updatePlanetLabels(): void {
    if (this.cameraMode() !== 'god' || !this.showPlanetNames()) {
      if (this.planetLabels().length) this.planetLabels.set([]);
      return;
    }

    const host = this.hostRef.nativeElement;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;

    const entries = this.planetEntries.map((entry) => ({
      planet: entry.planet,
      worldPosition: entry.group.position.clone(),
      radius: entry.radius,
    }));

    const labels = computeLabelLayout(entries, this.camera, w, h, {
      filter: this.godViewFilter(),
      focusPlanetName: this.focusPlanetName(),
      selectedPlanetName: this.focusPlanetName(),
      hoveredPlanetName: this.hoveredPlanet()?.name ?? null,
      shipCounts: this.shipCountsByWaypoint(),
    });

    this.planetLabels.set(labels);
  }

  private updateCamera(): void {
    if (this.cameraMode() === 'god') {
      const extent = this.orbitEngine.sceneExtent(this.planets());
      const dist = extent * 1.7;
      const pitch = this.godViewPitch;
      const yaw = this.godViewYaw;
      const y = dist * Math.sin(pitch);
      const horizontal = dist * Math.cos(pitch);
      this.camera.position.set(
        this.systemCenter.x + Math.sin(yaw) * horizontal,
        this.systemCenter.y + y,
        this.systemCenter.z + Math.cos(yaw) * horizontal,
      );
      this.camera.lookAt(this.systemCenter);
      this.applyCameraShake();
      this.headLight?.position.copy(this.camera.position);
      return;
    }

    const anchor = this.followPosition;
    const offset = this.camOffsetScratch.copy(this.cameraOffset);
    offset.applyAxisAngle(this.xAxis, -this.cameraPitch);
    offset.applyAxisAngle(this.yAxis, -this.cameraYaw);

    const target = this.camTargetScratch.copy(anchor);
    target.y += 1;
    this.camera.position.copy(target).add(offset);
    this.camera.lookAt(target);
    this.applyCameraShake();
    this.headLight?.position.copy(this.camera.position);
  }

  private triggerActionPulse(): void {
    const now = performance.now();
    this.radarFlashUntil = now + 450;
    if (!this.prefersReducedMotion()) {
      this.shakeUntil = now + 320;
      this.shakeSeed = Math.random() * 1000;
    }
  }

  private applyCameraShake(): void {
    const now = performance.now();
    let amp = now < this.shakeUntil ? 0.35 * ((this.shakeUntil - now) / 320) : 0;

    if (this.landingActive() && this.landingTarget && !this.prefersReducedMotion()) {
      amp = Math.max(amp, 0.12 + this.landingProgress * 0.55);
    }

    if (amp <= 0) return;
    const t = now * 0.05 + this.shakeSeed;
    this.camera.position.x += Math.sin(t * 1.7) * amp;
    this.camera.position.y += Math.cos(t * 2.3) * amp;
    this.camera.position.z += Math.sin(t * 1.1) * amp;
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private updateThrusters(elapsed: number): void {
    const pulse = 1 + Math.sin(elapsed * 8) * 0.25;
    for (const light of this.thrusterLights) {
      light.intensity = 1.2 * pulse;
    }
  }

  private drawRadar(): void {
    const canvas = this.radarRef?.nativeElement;
    if (!canvas) return;

    // Throttle to ~12fps; the radar reads fine at a low refresh. Always redraw
    // while the action-pulse flash is animating so it stays smooth.
    const now = performance.now();
    if (now < this.radarFlashUntil || now - this.lastRadarDraw >= 83) {
      this.lastRadarDraw = now;
    } else {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const range = Math.max(80, this.orbitEngine.sceneExtent(this.planets()) * 0.85);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10, 14, 26, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1;
    for (let r = 0.25; r <= 1; r += 0.25) {
      ctx.beginPath();
      ctx.arc(cx, cy, (cx - 4) * r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, 4);
    ctx.lineTo(cx, h - 4);
    ctx.moveTo(4, cy);
    ctx.lineTo(w - 4, cy);
    ctx.stroke();

    const anchor = this.followPosition;
    for (const entry of this.planetEntries) {
      const dx = entry.group.position.x - anchor.x;
      const dz = entry.group.position.z - anchor.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      const px = cx + (dx / range) * (cx - 8);
      const py = cy + (dz / range) * (cy - 8);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    if (now < this.radarFlashUntil) {
      const intensity = (this.radarFlashUntil - now) / 450;
      ctx.save();
      ctx.globalAlpha = 0.45 * intensity;
      ctx.fillStyle = '#86f7b0';
      ctx.beginPath();
      ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9 * intensity;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#bdffd6';
      ctx.beginPath();
      ctx.arc(cx, cy, (cx - 4) * (1 - intensity), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  godFilterLabel(filter: GodViewFilter): string {
    switch (filter) {
      case 'important':
        return 'Important';
      case 'all':
        return 'All';
      case 'markets':
        return 'Markets';
      case 'ships':
        return 'My ships';
      case 'contracts':
        return 'Contracts';
      default: {
        const _exhaustive: never = filter;
        void _exhaustive;
        return filter;
      }
    }
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
}
