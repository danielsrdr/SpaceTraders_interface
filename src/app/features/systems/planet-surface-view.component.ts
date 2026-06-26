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
  Group,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PointLight,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { MarketData, PlanetView, ShipyardData } from '../../models/system.model';
import type { ShipData } from '../../models/ship.model';
import type { ContractView } from '../../models/contract.model';
import { AgentStore } from '../../core/state/agent.store';
import { SurfaceWeatherService } from '../../shared/services/surface-weather.service';
import { SurfaceAudioService } from '../../shared/services/surface-audio.service';
import { SnackbarService } from '../../shared/services/snackbar.service';
import { RadioService } from '../../shared/services/radio.service';
import { ProgressionService } from '../progression/progression.service';
import { isGasGiantWaypoint } from './planet-helpers';
import {
  initMineProgress,
  isOreAlreadyBroken,
  mineProgressPercent,
  recordOreBroken,
} from '../../core/state/mine-progress.store';
import { createPointerLockControls, FpsControls } from './three/fps-controls';
import { fpsGravityForPlanet } from './three/celestial-mass';
import { getActiveZone, SurfaceZone } from './three/surface-zones';
import { disposeObject3D } from './three/three-dispose.util';
import { goodLabel } from './trade-good-visuals';
import {
  buildMarketStructuresAt,
  MarketStallAnchor,
} from './three/zone-buildings.builder';
import { buildShipyardStructuresAt } from './three/zone-shipyard.builder';
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
import type { SurfaceTraitProfile, SurfaceWeatherKind } from './three/surface-trait-profile';
import { resolveSurfaceAmbience } from './three/surface-ambience';
import { nearestPoiInfo, relativePoiBearing, bearingToCardinal } from './three/surface-poi-bearing';
import { buildContractCrates, type ContractCrateAnchor } from './three/contract-crate.builder';
import type { SurfaceContractBeacon } from './three/surface-contract-beacons';
import {
  buildLandedShipAt,
  disposeLandedShip,
  SURFACE_SHIP_SCALE,
} from './three/surface-landed-ship.builder';
import {
  attachLaunchExhaustEffects,
  type LaunchExhaustEffects,
} from './three/surface-launch-effects';
import { ExoSuitHudComponent, type ExoPoiCompass } from './exo-suit-hud/exo-suit-hud.component';
import { SurfacePostcardDialogComponent } from '../postcard/surface-postcard-dialog.component';
import type { SurfacePostcardOptions } from '../postcard/surface-postcard-canvas';

/** Seconds for one full surface day -> night -> day cycle. */
const DAY_LENGTH_S = 150;

/** Boarding launch: levitation hold then climb-out. */
const LAUNCH_DURATION_S = 5.8;
const LAUNCH_LEVITATION_END = 0.38;

const SKY_DAY = new Color(0xc7e4ff);
const SKY_DUSK = new Color(0xe8915a);
const SKY_NIGHT = new Color(0x0a1024);
const FOG_DAY = new Color(0xe8c896);
const FOG_DUSK = new Color(0xc4632f);
const FOG_NIGHT = new Color(0x0a1228);
const SUN_NOON = new Color(0xfff7ed);
const SUN_DUSK = new Color(0xff9a4d);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

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
  imports: [SurfacePostcardDialogComponent, ExoSuitHudComponent],
})
export class PlanetSurfaceViewComponent implements AfterViewInit, OnDestroy {
  readonly planet = input.required<PlanetView>();
  readonly launchActive = input(false);
  readonly marketPending = input(false);
  readonly entryActive = input(true);
  readonly market = input<MarketData | null>(null);
  readonly shipyard = input<ShipyardData | null>(null);
  readonly captain = input<{ name: string; faction: string; credits?: number } | null>(null);
  readonly contractBeacons = input<SurfaceContractBeacon[]>([]);
  readonly scanDeposits = input<unknown[]>([]);
  readonly boardingShip = input<ShipData | null>(null);

  readonly zoneInteract = output<SurfaceZoneKind>();
  readonly contractDeliver = output<SurfaceContractBeacon>();
  readonly oreBroken = output<{ blockKey: string }>();
  readonly cartDelivered = output<void>();
  readonly ruinsScanned = output<void>();
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

  readonly mineProgressPct = signal<number | null>(null);
  readonly weatherEvent = signal<SurfaceWeatherKind | null>(null);
  readonly hazardLevel = signal(0);
  readonly sensorQuality = signal(1);
  readonly weatherIntensity = signal(0);
  readonly poiCompass = signal<ExoPoiCompass | null>(null);
  readonly nearLandedShip = signal(false);
  readonly landedShipLabel = signal<string | null>(null);
  readonly launchPhaseLabel = signal<'levitate' | 'climb' | null>(null);
  readonly jetpackFuel = signal(1);
  readonly surfacePostcardOptions = signal<SurfacePostcardOptions | null>(null);

  goodLabel = goodLabel;

  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  private readonly zone = inject(NgZone);
  private readonly surfaceWeather = inject(SurfaceWeatherService);
  private readonly surfaceAudio = inject(SurfaceAudioService);
  private readonly agentStore = inject(AgentStore);
  private readonly progression = inject(ProgressionService);
  private readonly snackbar = inject(SnackbarService);
  private readonly radio = inject(RadioService);
  private scene!: Scene;
  private camera!: PerspectiveCamera;
  private renderer!: WebGLRenderer;
  private sun!: DirectionalLight;
  private hemi!: HemisphereLight;
  private ambient!: AmbientLight;
  private fps!: FpsControls;

  // Day/night cycle scratch + tagged emitters that brighten after dusk.
  private readonly sunColorScratch = new Color();
  private readonly skyScratch = new Color();
  private readonly fogScratch = new Color();
  private nightLights: { light: PointLight; base: number }[] = [];
  private nightGlows: { mat: MeshStandardMaterial; base: number }[] = [];
  private world: SurfaceWorldResult | null = null;
  private readonly clock = new Clock();
  private animFrameId = 0;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private sceneReady = false;
  private launchProgress = 0;
  private launchElapsed = 0;
  private launchEmitted = false;
  private entryProgress = 0;
  private entryDuration = 2;
  private entrySeed = 0;
  private builtMarket: MarketData | null = null;
  private builtShipyard: ShipyardData | null = null;
  private contractCrateAnchors: ContractCrateAnchor[] = [];
  private builtBeaconKey = '';
  private builtDepositKey = '';
  private landedShipGroup: Group | null = null;
  private landedShipPos = new Vector3();
  private launchShipBaseY = 0;
  private launchGroundY = 0;
  private launchCamAngle = 0;
  private launchCamStart = new Vector3();
  private launchEffects: LaunchExhaustEffects | null = null;
  private launchSequenceStarted = false;
  private builtBoardingKey = '';
  private activeProfile: SurfaceTraitProfile | null = null;
  private lastZoneKind: SurfaceZoneKind | null = null;
  private audioStarted = false;
  private lastAmbienceKey = '';
  private baseFogNear = 60;
  private baseFogFar = 220;
  private readonly projVec = new Vector3();
  private readonly lookDir = new Vector3();

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
      const y = this.shipyard();
      if (!this.sceneReady || !this.world) return;
      if (y === this.builtShipyard) return;
      this.rebuildShipyard(y);
    });

    effect(() => {
      const deposits = this.scanDeposits();
      if (!this.sceneReady || !this.world) return;
      const key = JSON.stringify(deposits);
      if (key === this.builtDepositKey) return;
      this.builtDepositKey = key;
      this.loadWorld(this.planet(), untracked(this.market));
    });

    effect(() => {
      const beacons = this.contractBeacons();
      if (!this.sceneReady || !this.world) return;
      this.rebuildContractCrates(beacons);
    });

    effect(() => {
      const ship = this.boardingShip();
      if (!this.sceneReady || !this.world) return;
      this.rebuildLandedShip(ship);
    });

    effect(() => {
      const launching = this.launchActive();
      if (!this.sceneReady) return;
      if (launching && !this.launchSequenceStarted) {
        this.launchSequenceStarted = true;
        this.beginLaunchSequence();
      }
      if (!launching) {
        this.launchSequenceStarted = false;
      }
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
    this.surfaceAudio.stop();
    this.surfaceWeather.reset();
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
      this.camera.rotation.set(0, this.world.spawnHeading, 0);
      this.announceNearestBeacon();
      this.tryStartAmbience();
    }
    this.zone.run(() => {
      this.entryVeil.set(0);
      this.entryRunning.set(false);
      this.entryComplete.emit();
    });
  }

  private tryStartAmbience(): void {
    if (this.audioStarted || !this.activeProfile) return;
    this.audioStarted = true;
    const profile = resolveSurfaceAmbience(this.activeProfile, this.surfaceWeather.event());
    void this.surfaceAudio.start(profile, this.surfaceWeather.event());
    this.lastAmbienceKey = `${profile.kind}:${this.surfaceWeather.event() ?? 'calm'}`;
  }

  private syncAmbienceCrossfade(): void {
    if (!this.activeProfile || !this.audioStarted) return;
    const profile = resolveSurfaceAmbience(this.activeProfile, this.surfaceWeather.event());
    const key = `${profile.kind}:${this.surfaceWeather.event() ?? 'calm'}`;
    if (key === this.lastAmbienceKey) return;
    this.lastAmbienceKey = key;
    void this.surfaceAudio.crossfade(profile, this.surfaceWeather.event());
  }

  private updateHudSignals(zone: SurfaceZone | null): void {
    const world = this.world;
    const hazard = this.activeProfile?.hazardLevel ?? 0;
    const sensor = this.surfaceWeather.sensorQuality;
    const intensity = this.surfaceWeather.intensity;
    const evt = this.surfaceWeather.event();

    let compass: ExoPoiCompass | null = null;
    if (world?.poiAnchors.length) {
      const info = nearestPoiInfo(this.camera.position.x, this.camera.position.z, world.poiAnchors);
      if (info) {
        compass = {
          label: info.label,
          relativeBearing: relativePoiBearing(info.bearingDeg, this.camera.rotation.y),
          distanceM: info.distanceM,
          cardinal: bearingToCardinal(info.bearingDeg),
        };
      }
    }

    const inMarket = zone?.kind === 'market';
    const faction = this.planet().faction?.symbol;
    this.surfaceAudio.setMarketProximity(inMarket, faction);
    this.surfaceAudio.setStormIntensity(intensity);

    this.hazardLevel.set(hazard);
    this.sensorQuality.set(sensor);
    this.weatherIntensity.set(intensity);
    if (evt !== this.weatherEvent()) {
      this.weatherEvent.set(evt);
    }
    this.poiCompass.set(compass);
  }

  private announceNearestBeacon(): void {
    const world = this.world;
    if (!world?.poiAnchors.length) return;
    let best = world.poiAnchors[0]!;
    let bestDist = Infinity;
    for (const anchor of world.poiAnchors) {
      const dx = anchor.position.x - world.spawn.x;
      const dz = anchor.position.z - world.spawn.z;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        best = anchor;
      }
    }
    const bearing = Math.round(
      ((Math.atan2(best.position.x - world.spawn.x, best.position.z - world.spawn.z) * 180) /
        Math.PI +
        360) %
        360,
    );
    this.radio.announce(`Beacon ${best.label} bearing ${bearing}° — proceed on foot.`);
  }

  private agentName(): string | null {
    return this.agentStore.agent()?.name ?? null;
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

  openStamp(): void {
    const captain = this.captain();
    if (!captain || !this.world) return;
    this.surfacePostcardOptions.set({
      planet: this.planet(),
      profile: this.world.profile,
      minePercent: this.mineProgressPct() ?? undefined,
      captain,
    });
  }

  closeStamp(): void {
    this.surfacePostcardOptions.set(null);
  }

  private beginLaunchSequence(): void {
    this.launchProgress = 0;
    this.launchElapsed = 0;
    this.launchEmitted = false;
    this.poiLabels.set([]);
    this.focusedStall.set(null);
    this.zone.run(() => {
      this.nearLandedShip.set(false);
      this.landedShipLabel.set(null);
      this.launchPhaseLabel.set('levitate');
    });

    if (this.fps.isLocked()) {
      document.exitPointerLock();
    }

    this.launchCamAngle = this.world?.spawnHeading ?? this.camera.rotation.y;
    this.launchShipBaseY = this.landedShipGroup?.position.y ?? this.camera.position.y;
    if (this.landedShipGroup && this.world) {
      this.launchGroundY = this.world.heightField.getHeight(
        this.landedShipGroup.position.x,
        this.landedShipGroup.position.z,
      );
    } else {
      this.launchGroundY = this.launchShipBaseY - 0.55;
    }
    this.launchCamStart.copy(this.camera.position);

    if (this.landedShipGroup && this.scene) {
      this.clearLaunchEffects();
      this.launchEffects = attachLaunchExhaustEffects(
        this.scene,
        this.landedShipGroup,
        SURFACE_SHIP_SCALE,
      );
    }

    this.radio.announce('Launch sequence — repulsors online.');
    this.surfaceAudio.stop();
  }

  private clearLaunchEffects(): void {
    this.launchEffects?.dispose();
    this.launchEffects = null;
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  private easeInCubic(t: number): number {
    return t * t * t;
  }

  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /** Levitation hold, then nose-up climb with heat ramp. */
  private sampleLaunchMotion(u: number): {
    yLift: number;
    pitch: number;
    heat: number;
    phase: 'levitate' | 'climb';
  } {
    if (u <= LAUNCH_LEVITATION_END) {
      const p = u / LAUNCH_LEVITATION_END;
      const eased = this.easeInOut(p);
      return {
        yLift: eased * 4.2,
        pitch: 0,
        heat: eased * 0.62,
        phase: 'levitate',
      };
    }

    const p = (u - LAUNCH_LEVITATION_END) / (1 - LAUNCH_LEVITATION_END);
    const climb = this.easeInCubic(p);
    const tilt = this.easeOutCubic(Math.min(1, p * 1.15));
    return {
      yLift: 4.2 + climb * 98,
      pitch: -tilt * 0.62,
      heat: 0.62 + climb * 0.38,
      phase: 'climb',
    };
  }

  private updateLaunch(delta: number): void {
    this.launchElapsed += delta;
    this.launchProgress = Math.min(1, this.launchProgress + delta / LAUNCH_DURATION_S);
    const u = this.launchProgress;
    const motion = this.sampleLaunchMotion(u);
    const ship = this.landedShipGroup;
    const bob =
      motion.phase === 'levitate'
        ? Math.sin(this.launchElapsed * 5.5) * 0.18 * (1 - u / LAUNCH_LEVITATION_END)
        : Math.sin(this.launchElapsed * 9) * 0.04 * (1 - u);

    if (ship) {
      ship.position.y = this.launchShipBaseY + motion.yLift + bob;
      ship.rotation.x = motion.pitch;

      const reactors = ship.userData['reactorMeshes'] as Mesh[] | undefined;
      if (reactors) {
        const pulse = 0.55 + motion.heat * 2.4 + Math.sin(this.launchElapsed * 24) * 0.25;
        for (const mesh of reactors) {
          const mat = mesh.material;
          if (mat instanceof MeshStandardMaterial) {
            mat.emissiveIntensity = pulse;
            mat.emissive.setHex(motion.heat > 0.35 ? 0xff8c42 : 0x0ea5e9);
          }
        }
      }

      this.launchEffects?.update(motion.heat, this.launchElapsed, ship.position, this.launchGroundY);

      const levCamT = motion.phase === 'levitate' ? u / LAUNCH_LEVITATION_END : 1;
      const climbT = motion.phase === 'climb' ? (u - LAUNCH_LEVITATION_END) / (1 - LAUNCH_LEVITATION_END) : 0;

      const levDist = 11 + levCamT * 4;
      const levHeight = 2.8 + levCamT * 3.5;
      const levTarget = new Vector3(
        ship.position.x + Math.sin(this.launchCamAngle + 0.85) * levDist,
        ship.position.y + levHeight,
        ship.position.z + Math.cos(this.launchCamAngle + 0.85) * levDist,
      );

      if (motion.phase === 'levitate' && levCamT < 0.35) {
        this.camera.position.lerpVectors(this.launchCamStart, levTarget, levCamT / 0.35);
      } else {
        const camDist = 12 + climbT * 18;
        const camHeight = 3.5 + climbT * 22;
        this.camera.position.set(
          ship.position.x + Math.sin(this.launchCamAngle + 0.75) * camDist,
          ship.position.y + camHeight,
          ship.position.z + Math.cos(this.launchCamAngle + 0.75) * camDist,
        );
      }

      this.camera.lookAt(ship.position.x, ship.position.y + 1.8 + climbT * 8, ship.position.z);
    } else {
      this.camera.position.y = this.launchShipBaseY + motion.yLift;
    }

    const phaseLabel = motion.phase;
    if (this.launchPhaseLabel() !== phaseLabel) {
      this.zone.run(() => this.launchPhaseLabel.set(phaseLabel));
      if (phaseLabel === 'climb') {
        this.radio.announce('Main thrusters — climbing to orbit.');
      }
    }

    const veilT = motion.phase === 'climb' ? (u - LAUNCH_LEVITATION_END) / (1 - LAUNCH_LEVITATION_END) : 0;
    this.zone.run(() => this.entryVeil.set(Math.max(0, (veilT - 0.5) * 2.4)));

    if (this.launchProgress >= 1 && !this.launchEmitted) {
      this.launchEmitted = true;
      this.clearLaunchEffects();
      this.zone.run(() => {
        this.entryVeil.set(0);
        this.launchPhaseLabel.set(null);
        this.launchComplete.emit();
      });
    }
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

    this.hemi = new HemisphereLight(0x93c5fd, 0xd4a574, 0.45);
    this.scene.add(this.hemi);
    this.ambient = new AmbientLight(0xfff7ed, 0.18);
    this.scene.add(this.ambient);

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
    this.fps = new FpsControls(
      this.camera,
      this.renderer.domElement,
      pointerLock,
      fpsGravityForPlanet(this.planet()),
    );
    this.fps.attach();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  private extractDepositSymbols(deposits: unknown[]): string[] {
    const symbols: string[] = [];
    for (const dep of deposits) {
      if (dep && typeof dep === 'object' && 'symbol' in dep) {
        const sym = (dep as { symbol?: unknown }).symbol;
        if (typeof sym === 'string' && sym) symbols.push(sym);
      }
    }
    return symbols;
  }

  private loadWorld(planet: PlanetView, market: MarketData | null): void {
    this.surfaceAudio.stop();
    this.audioStarted = false;
    this.lastAmbienceKey = '';
    this.clearWorld();
    this.fps?.setSurfaceGravity(fpsGravityForPlanet(planet));
    this.builtMarket = market;
    this.builtShipyard = this.shipyard();
    this.focusedStall.set(null);
    this.lastZoneKind = null;

    const gas = isGasGiantWaypoint(planet);
    this.zone.run(() => this.isGasGiant.set(gas));

    this.world = buildSurfaceWorld(
      planet,
      market,
      this.shipyard(),
      this.extractDepositSymbols(this.scanDeposits()),
    );
    this.scene.add(this.world.root);

    const profile = this.world.profile;
    this.activeProfile = profile;
    this.surfaceWeather.configure(profile.weatherPool, profile.hazardLevel);
    this.zone.run(() => this.hazardLevel.set(profile.hazardLevel));

    if (gas) {
      this.scene.background = new Color(profile.skyTint);
      this.scene.fog = new Fog(profile.fogColor, 15, 80);
      this.baseFogNear = 15;
      this.baseFogFar = 80;
    } else {
      this.scene.background = new Color(profile.skyTint);
      this.scene.fog = new Fog(profile.fogColor, 60, 220);
      this.baseFogNear = 60;
      this.baseFogFar = 220;
    }

    setTerrainSunDirection(
      this.world.terrainManager.material,
      this.sun.position.x,
      this.sun.position.y,
      this.sun.position.z,
    );

    this.camera.position.set(this.world.spawn.x, this.world.spawn.y, this.world.spawn.z);
    this.camera.rotation.set(0, this.world.spawnHeading, 0);
    this.world.terrainManager.update(this.world.spawn.x, this.world.spawn.z);

    const agent = this.agentName();
    if (this.world.tunnels) {
      this.world.tunnels.ensureBuilt();
      const stored = initMineProgress(planet.name, this.world.tunnels.getTotalOres(), agent);
      this.world.tunnels.applyBrokenKeys(stored.brokenKeys);
      const pct = mineProgressPercent(stored);
      this.zone.run(() => this.mineProgressPct.set(pct));
      this.progression.recordSurfaceMinePercent(planet.name, pct);
    } else {
      this.zone.run(() => this.mineProgressPct.set(null));
    }

    const ambience = resolveSurfaceAmbience(profile, this.surfaceWeather.event());
    this.lastAmbienceKey = `${ambience.kind}:${this.surfaceWeather.event() ?? 'calm'}`;

    this.collectNightEmitters();
    this.rebuildLandedShip(this.boardingShip());
  }

  private clearLandedShip(): void {
    this.clearLaunchEffects();
    if (this.landedShipGroup) {
      this.scene?.remove(this.landedShipGroup);
      disposeLandedShip(this.landedShipGroup);
      this.landedShipGroup = null;
    }
    this.builtBoardingKey = '';
  }

  private rebuildLandedShip(ship: ShipData | null): void {
    const world = this.world;
    if (!world) return;

    const key = ship ? `${ship.symbol}:${ship.registration.role}` : '';
    if (key === this.builtBoardingKey) return;
    this.builtBoardingKey = key;
    this.clearLandedShip();

    if (!ship) {
      this.zone.run(() => {
        this.landedShipLabel.set(null);
        this.nearLandedShip.set(false);
      });
      return;
    }

    const groundY = world.heightField.getHeight(world.spawn.x, world.spawn.z);
    const built = buildLandedShipAt(
      world.spawn,
      world.spawnHeading,
      groundY,
      ship.registration.role,
      ship.symbol,
    );
    this.landedShipGroup = built.group;
    this.landedShipPos.copy(built.position);
    this.scene.add(built.group);
    this.zone.run(() => this.landedShipLabel.set(ship.symbol));
  }

  private tryBoardLandedShip(): boolean {
    if (!this.landedShipGroup || !this.nearLandedShip() || this.launchActive()) return false;
    this.zone.run(() => this.exitSurface.emit());
    return true;
  }

  private updateLandedShipProximity(): void {
    if (!this.landedShipGroup || this.launchActive()) {
      this.zone.run(() => this.nearLandedShip.set(false));
      return;
    }
    const dx = this.camera.position.x - this.landedShipPos.x;
    const dz = this.camera.position.z - this.landedShipPos.z;
    const near = dx * dx + dz * dz <= 64;
    if (near !== this.nearLandedShip()) {
      this.zone.run(() => this.nearLandedShip.set(near));
    }
  }

  private clearWorld(): void {
    this.clearLandedShip();
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
    world.colliders.removeTag('market');
    built.colliders.forEach((c) => world.colliders.add(c, 'market'));
    this.focusedStall.set(null);
    this.collectNightEmitters();
  }

  private rebuildShipyard(shipyard: ShipyardData | null): void {
    const world = this.world;
    this.builtShipyard = shipyard;
    if (!world?.shipyardOrigin) return;

    const existing = world.root.getObjectByName('shipyard-structures');
    if (existing) {
      world.root.remove(existing);
      disposeObject3D(existing);
    }

    const built = buildShipyardStructuresAt(
      world.shipyardOrigin.x,
      world.shipyardOrigin.z,
      world.shipyardOrigin.baseY,
      shipyard,
    );
    world.root.add(built.group);
    world.colliders.removeTag('shipyard');
    built.colliders.forEach((c) => world.colliders.add(c, 'shipyard'));
    this.collectNightEmitters();
  }

  private rebuildContractCrates(beacons: SurfaceContractBeacon[]): void {
    const world = this.world;
    if (!world) return;

    const key = beacons.map((b) => `${b.contractId}:${b.kind}:${b.tradeSymbol ?? ''}`).join('|');
    if (key === this.builtBeaconKey) return;
    this.builtBeaconKey = key;

    const existing = world.root.getObjectByName('contract-crates');
    if (existing) {
      world.root.remove(existing);
      disposeObject3D(existing);
    }
    world.colliders.removeTag('contract');
    this.contractCrateAnchors = [];

    if (!beacons.length) return;

    const built = buildContractCrates(
      beacons,
      world.pois,
      (x, z) => world.heightField.getHeight(x, z),
    );
    world.root.add(built.group);
    built.colliders.forEach((c) => world.colliders.add(c, 'contract'));
    this.contractCrateAnchors = built.anchors;
  }

  private tryNearestContractCrate(): boolean {
    const cx = this.camera.position.x;
    const cz = this.camera.position.z;
    let best: ContractCrateAnchor | null = null;
    let bestDist = Infinity;
    for (const anchor of this.contractCrateAnchors) {
      const dx = anchor.position.x - cx;
      const dz = anchor.position.z - cz;
      const dist = dx * dx + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        best = anchor;
      }
    }
    if (!best || bestDist > 9) return false;
    this.zone.run(() => this.contractDeliver.emit(best!.beacon));
    return true;
  }

  private handleZoneInteract(kind: SurfaceZoneKind): void {
    switch (kind) {
      case 'market':
        return;
      case 'mine':
        if (this.tryMineBlock()) return;
        if (this.world?.cart?.tryPush(this.camera.position.x, this.camera.position.z)) return;
        this.zone.run(() => this.zoneInteract.emit(kind));
        break;
      case 'shipyard':
        this.zone.run(() => this.zoneInteract.emit(kind));
        break;
      case 'ruins':
        this.snackbar.show('Ancient resonance logged — codex updated.', 'success', 3500);
        this.zone.run(() => {
          this.ruinsScanned.emit();
          this.zoneInteract.emit(kind);
        });
        break;
      case 'depot':
        this.zone.run(() => this.zoneInteract.emit(kind));
        break;
      case 'cave':
        this.snackbar.show('Cave chamber mapped — deeper strata uncharted.', 'info', 3000);
        break;
      default: {
        const _exhaustive: never = kind;
        void _exhaustive;
      }
    }
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
    if (this.fps.isLocked()) {
      if (this.activeZone()?.kind === 'mine' && this.tryMineBlock()) return;
    }
    if (!this.fps.isLocked()) {
      this.fps.requestLock();
      this.tryStartAmbience();
    }
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
      }
      return;
    }

    if (event.code === 'KeyE') {
      if (this.tryBoardLandedShip()) {
        event.preventDefault();
        return;
      }
      if (this.tryNearestContractCrate()) {
        event.preventDefault();
        return;
      }
      const active = this.activeZone();
      if (!active) return;
      event.preventDefault();
      if (active.kind === 'market') {
        this.emitTrade('buy');
      } else {
        this.handleZoneInteract(active.kind);
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

  private getLookDirection(): Vector3 {
    this.camera.getWorldDirection(this.lookDir);
    return this.lookDir;
  }

  private tryMineBlock(): boolean {
    const world = this.world;
    if (!world?.tunnels) return false;

    const pick = world.tunnels.pickBlock(this.camera.position, this.getLookDirection());
    if (!pick) return false;

    const planetName = this.planet().name;
    const agent = this.agentName();
    if (pick.isOre && isOreAlreadyBroken(planetName, pick.key, agent)) {
      return false;
    }

    const result = world.tunnels.breakBlock(pick.x, pick.y, pick.z);
    if (!result) return false;

    if (result.wasOre) {
      const progress = recordOreBroken(
        planetName,
        result.key,
        world.tunnels.getTotalOres(),
        agent,
      );
      const pct = mineProgressPercent(progress);
      this.zone.run(() => {
        this.mineProgressPct.set(pct);
        this.oreBroken.emit({ blockKey: result.key });
      });
      this.progression.recordSurfaceOreBroken();
      this.progression.recordSurfaceMinePercent(planetName, pct);
      world.cart?.load();
    }

    return true;
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

  /** Cache the day/night-sensitive emitters so the loop avoids re-traversing. */
  private collectNightEmitters(): void {
    this.nightLights = [];
    this.nightGlows = [];
    const root = this.world?.root;
    if (!root) return;
    root.traverse((obj) => {
      const nl = obj.userData['nightLight'];
      if (typeof nl === 'number' && obj instanceof PointLight) {
        this.nightLights.push({ light: obj, base: nl });
      }
      const ng = obj.userData['nightGlow'];
      if (typeof ng === 'number' && obj instanceof Mesh) {
        const mat = obj.material;
        if (mat instanceof MeshStandardMaterial) {
          this.nightGlows.push({ mat, base: ng });
        }
      }
    });
  }

  private updateSurfaceWeatherFog(): void {
    if (!(this.scene.fog instanceof Fog)) return;
    const shrink = 1 - this.surfaceWeather.intensity * 0.45;
    this.scene.fog.near = this.baseFogNear * shrink;
    this.scene.fog.far = this.baseFogFar * shrink;
  }

  /**
   * Sweeps the sun across the sky over {@link DAY_LENGTH_S}: shadows rotate with
   * the light, sky/fog/ambient lerp through day -> dusk -> night, and tagged
   * building lights ramp on after dusk. Gas giants keep their static atmosphere.
   */
  private updateDayNight(elapsed: number): void {
    if (!this.world) return;

    if (this.isGasGiant()) {
      this.updateSurfaceWeatherFog();
      return;
    }

    const angle = (elapsed / DAY_LENGTH_S) * Math.PI * 2;
    const elevation = Math.sin(angle);
    this.sun.position.set(Math.cos(angle) * 80, elevation * 90, 30);

    const dayness = smoothstep(-0.08, 0.25, elevation); // 0 night -> 1 full day
    const night = 1 - dayness;
    this.world.tunnels?.setNightVeinBoost(elevation < 0.12);
    // Warm tint while the sun rides low near the horizon.
    const dusk = Math.max(0, 1 - Math.abs(elevation) / 0.22) * dayness;

    this.sun.intensity = 0.04 + dayness * 1.5;
    this.sun.color.copy(this.sunColorScratch.copy(SUN_NOON).lerp(SUN_DUSK, dusk));

    if (this.scene.background instanceof Color) {
      this.scene.background.copy(
        this.skyScratch.copy(SKY_NIGHT).lerp(SKY_DAY, dayness).lerp(SKY_DUSK, dusk * 0.6),
      );
    }
    if (this.scene.fog instanceof Fog) {
      const profile = this.activeProfile;
      const fogDay = profile ? new Color(profile.fogColor) : FOG_DAY;
      this.scene.fog.color.copy(
        this.fogScratch.copy(FOG_NIGHT).lerp(fogDay, dayness).lerp(FOG_DUSK, dusk * 0.6),
      );
      const weatherShrink = 1 - this.surfaceWeather.intensity * 0.45;
      this.scene.fog.near = this.baseFogNear * weatherShrink;
      this.scene.fog.far = (this.baseFogFar * (0.6 + dayness * 0.4)) * weatherShrink;
    }

    this.hemi.intensity = 0.12 + dayness * 0.45;
    this.ambient.intensity = 0.05 + dayness * 0.14;

    setTerrainSunDirection(
      this.world.terrainManager.material,
      this.sun.position.x,
      this.sun.position.y,
      this.sun.position.z,
    );

    for (const nl of this.nightLights) nl.light.intensity = nl.base * night;
    for (const ng of this.nightGlows) ng.mat.emissiveIntensity = ng.base * (0.4 + 0.9 * night);
  }

  private startRenderLoop(): void {
    const render = (): void => {
      if (this.disposed) return;
      this.animFrameId = requestAnimationFrame(render);
      const delta = Math.min(this.clock.getDelta(), 0.05);
      const elapsed = this.clock.elapsedTime;

      if (this.world) {
        updateTerrainMaterialTime(this.world.terrainManager.material, elapsed);
        this.surfaceWeather.update(performance.now());
        this.updateDayNight(elapsed);
        const evt = this.surfaceWeather.event();
        if (evt !== this.weatherEvent()) {
          this.zone.run(() => {
            if (evt && this.activeProfile) {
              this.progression.recordSurfaceWeather(evt);
            }
            this.syncAmbienceCrossfade();
          });
        }
      }

      if (this.entryRunning()) {
        this.updateEntry(delta);
        this.renderer.render(this.scene, this.camera);
        return;
      }

      if (this.launchActive()) {
        this.updateLaunch(delta);
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
        this.zone.run(() => this.jetpackFuel.set(this.fps.fuelRatio));

        if (this.world.cart) {
          this.world.cart.update(delta);
        }

        if (this.world.cart?.update(delta)) {
          this.zone.run(() => this.cartDelivered.emit());
        }

        const zone = getActiveZone(
          this.camera.position.x,
          this.camera.position.y - 1,
          this.camera.position.z,
          this.world.zones,
        );
        if (zone && zone.kind !== this.lastZoneKind) {
          this.lastZoneKind = zone.kind;
          this.progression.recordSurfaceZone(zone.kind);
        } else if (!zone) {
          this.lastZoneKind = null;
        }
        const poi = this.computePoiLabels(zone);
        const stall = this.computeFocusedStall(zone);
        this.zone.run(() => {
          this.activeZone.set(zone);
          this.pointerLocked.set(true);
          this.poiLabels.set(poi);
          this.focusedStall.set(stall);
          this.updateHudSignals(zone);
          this.updateLandedShipProximity();
        });
      } else {
        const poi = this.computePoiLabels(this.activeZone());
        this.zone.run(() => {
          this.pointerLocked.set(this.fps.isLocked());
          this.poiLabels.set(poi);
          this.updateHudSignals(this.activeZone());
          this.updateLandedShipProximity();
        });
      }

      this.renderer.render(this.scene, this.camera);
    };
    render();
  }
}
