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
import { LaunchAudioService } from '../../shared/services/launch-audio.service';
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
import {
  initCaveProgress,
  isCrystalAlreadyBroken,
  caveProgressPercent,
  recordCrystalBroken,
} from '../../core/state/cave-progress.store';
import { SurfaceDiscoveryStore, FOOTPRINT_CELL_SIZE } from '../../core/state/surface-discovery.store';
import { createPointerLockControls, FpsControls } from './three/fps-controls';
import { fpsGravityForPlanet } from './three/celestial-mass';
import { getActiveZone, SurfaceZone } from './three/surface-zones';
import { disposeObject3D } from './three/three-dispose.util';
import { buildMarketStructuresAt, isNearMarketClerk } from './three/zone-buildings.builder';
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
  disposeLandingPad,
  SURFACE_SHIP_SCALE,
} from './three/surface-landed-ship.builder';
import {
  attachLaunchExhaustEffects,
  type LaunchExhaustEffects,
} from './three/surface-launch-effects';
import { LaunchAnimation, type LaunchPhase } from './three/launch-animation';
import { ExoSuitHudComponent, type ExoPoiCompass } from './exo-suit-hud/exo-suit-hud.component';
import { SurfaceMarketDialogComponent } from './surface-market-dialog.component';
import { SurfacePostcardDialogComponent } from '../postcard/surface-postcard-dialog.component';
import type { SurfacePostcardOptions } from '../postcard/surface-postcard-canvas';

/** Seconds for one full surface day -> night -> day cycle. */
const DAY_LENGTH_S = 150;

const BASE_CAMERA_FOV = 70;

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
  imports: [SurfacePostcardDialogComponent, ExoSuitHudComponent, SurfaceMarketDialogComponent],
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
  readonly caveMapped = output<{ percent: number }>();
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
  readonly nearClerk = signal(false);
  readonly marketDialogOpen = signal(false);

  readonly mineProgressPct = signal<number | null>(null);
  readonly caveProgressPct = signal<number | null>(null);
  readonly caveInteriorActive = signal(false);
  readonly caveTransitionRunning = signal(false);
  readonly footprintCells = signal<readonly string[]>([]);
  readonly playerFootprintCell = signal<{ cx: number; cz: number } | null>(null);
  readonly weatherEvent = signal<SurfaceWeatherKind | null>(null);
  readonly hazardLevel = signal(0);
  readonly sensorQuality = signal(1);
  readonly weatherIntensity = signal(0);
  readonly poiCompass = signal<ExoPoiCompass | null>(null);
  readonly nearLandedShip = signal(false);
  readonly landedShipLabel = signal<string | null>(null);
  readonly launchPhaseLabel = signal<LaunchPhase | null>(null);
  readonly shipScreenLabel = signal<SurfacePoiLabel | null>(null);
  readonly boardingActive = signal(false);
  readonly jetpackFuel = signal(1);
  readonly surfacePostcardOptions = signal<SurfacePostcardOptions | null>(null);

  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;

  private readonly zone = inject(NgZone);
  private readonly surfaceWeather = inject(SurfaceWeatherService);
  private readonly surfaceAudio = inject(SurfaceAudioService);
  private readonly launchAudio = inject(LaunchAudioService);
  private readonly agentStore = inject(AgentStore);
  private readonly surfaceDiscovery = inject(SurfaceDiscoveryStore);
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
  private launchElapsed = 0;
  private launchEmitted = false;
  private readonly launch = new LaunchAnimation();
  private launchShakeSeed = 0;
  private boardingProgress = 0;
  private boardingCamStart = new Vector3();
  private boardingCamTarget = new Vector3();
  private boardingStarted = false;
  private entryProgress = 0;
  private entryDuration = 2;
  private entrySeed = 0;
  private builtMarket: MarketData | null = null;
  private builtShipyard: ShipyardData | null = null;
  private contractCrateAnchors: ContractCrateAnchor[] = [];
  private builtBeaconKey = '';
  private builtDepositKey = '';
  private landedShipGroup: Group | null = null;
  private landedShipPad: Group | null = null;
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
  private radioAnnouncedZones = new Set<string>();
  private lastFootprintSample = { x: 0, z: 0, t: 0 };
  private caveMappedEmitted = false;
  private caveTransitionProgress = 0;
  private caveTransitionDuration = 0.85;
  private caveTransitionMode: 'enter' | 'exit' | null = null;
  private surfaceReturnPos = { x: 0, y: 0, z: 0, heading: 0 };
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
    this.launchAudio.stop();
    this.surfaceWeather.reset();
    cancelAnimationFrame(this.animFrameId);
    this.fps?.detach();
    this.detachListeners();
    this.resizeObserver?.disconnect();
    this.clearWorld();
    this.renderer?.dispose();
  }

  requestPointerLock(): void {
    if (this.entryRunning() || this.caveTransitionRunning()) return;
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
      if (anchor.kind === 'market') continue;
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

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
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
    this.launch.reset();
    this.launchElapsed = 0;
    this.launchEmitted = false;
    this.launchShakeSeed = Math.random() * 1000;
    this.poiLabels.set([]);
    this.zone.run(() => {
      this.nearLandedShip.set(false);
      this.landedShipLabel.set(null);
      this.shipScreenLabel.set(null);
      this.launchPhaseLabel.set('preflight');
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

    const shipRole = (this.boardingShip()?.registration.role ?? this.landedShipGroup?.userData['shipRole']) as
      | string
      | undefined;

    if (this.landedShipGroup && this.scene) {
      this.clearLaunchEffects();
      this.launchEffects = attachLaunchExhaustEffects(
        this.scene,
        this.landedShipGroup,
        SURFACE_SHIP_SCALE,
        {
          shipRole,
          weather: this.surfaceWeather.event(),
        },
      );
    }

    this.launch.start({
      reducedMotion: this.prefersReducedMotion(),
      shipRole,
      stormActive: this.surfaceWeather.event() !== null,
    });

    this.radio.announce('Preflight check — systems online.');
    this.surfaceAudio.fadeOut(800);
    this.launchAudio.start();
    this.launchAudio.setPhase('preflight', 0);
  }

  private clearLaunchEffects(): void {
    this.launchEffects?.dispose();
    this.launchEffects = null;
    this.launchAudio.stop();
  }

  private applyLaunchCameraShake(amp: number): void {
    if (amp <= 0 || this.prefersReducedMotion()) return;
    const t = performance.now() * 0.05 + this.launchShakeSeed;
    this.camera.position.x += Math.sin(t * 1.7) * amp;
    this.camera.position.y += Math.cos(t * 2.3) * amp;
    this.camera.position.z += Math.sin(t * 1.1) * amp;
  }

  private updateLaunch(delta: number): void {
    this.launchElapsed += delta;
    const motion = this.launch.update(delta);
    const ship = this.landedShipGroup;
    const bob =
      motion.phase === 'levitate'
        ? Math.sin(this.launchElapsed * 5.5) * 0.18 * (1 - motion.climbProgress)
        : Math.sin(this.launchElapsed * 9) * 0.04 * (1 - motion.climbProgress);

    if (ship) {
      ship.position.y = this.launchShipBaseY + motion.yLift + bob;
      ship.rotation.x = motion.pitch;
      ship.rotation.z = motion.roll;

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

      const levCamT = motion.phase === 'levitate' || motion.phase === 'preflight' ? 0.65 : 1;
      const climbT = motion.climbProgress;

      const levDist = 11 + levCamT * 4;
      const levHeight = 2.8 + levCamT * 3.5;
      const levTarget = new Vector3(
        ship.position.x + Math.sin(this.launchCamAngle + 0.85) * levDist,
        ship.position.y + levHeight,
        ship.position.z + Math.cos(this.launchCamAngle + 0.85) * levDist,
      );

      if ((motion.phase === 'preflight' || motion.phase === 'levitate') && levCamT < 0.35) {
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

      this.applyLaunchCameraShake(motion.shakeAmp);
      this.camera.lookAt(ship.position.x, ship.position.y + 1.8 + climbT * 8, ship.position.z);
    } else {
      this.camera.position.y = this.launchShipBaseY + motion.yLift;
    }

    this.camera.fov = motion.fov;
    this.camera.updateProjectionMatrix();

    const audioPhase =
      motion.phase === 'pitch' ? 'pitch' : motion.phase === 'climb' ? 'climb' : motion.phase;
    this.launchAudio.setPhase(audioPhase, motion.heat);

    if (this.launchPhaseLabel() !== motion.phase) {
      this.zone.run(() => this.launchPhaseLabel.set(motion.phase));
      if (motion.phase === 'levitate') {
        this.radio.announce('Repulsors online — levitating.');
      } else if (motion.phase === 'pitch') {
        this.radio.announce('Main engines — ignition.');
      } else if (motion.phase === 'climb') {
        this.radio.announce('Main thrusters — climbing to orbit.');
      }
    }

    this.zone.run(() => this.entryVeil.set(motion.veil));

    if (motion.done && !this.launchEmitted) {
      this.launchEmitted = true;
      this.clearLaunchEffects();
      this.zone.run(() => {
        this.entryVeil.set(1);
        this.launchPhaseLabel.set(null);
        this.launchComplete.emit();
      });
    }
  }

  private beginBoardingSequence(): void {
    if (!this.landedShipGroup) return;
    this.boardingProgress = 0;
    this.boardingStarted = true;
    this.boardingCamStart.copy(this.camera.position);
    this.boardingCamTarget.set(
      this.landedShipPos.x,
      this.landedShipPos.y - 0.4,
      this.landedShipPos.z + 2.5,
    );
    if (this.fps.isLocked()) {
      document.exitPointerLock();
    }
    this.zone.run(() => this.boardingActive.set(true));
  }

  private updateBoarding(delta: number): void {
    this.boardingProgress = Math.min(1, this.boardingProgress + delta / 1.1);
    const eased = this.easeInOut(this.boardingProgress);
    this.camera.position.lerpVectors(this.boardingCamStart, this.boardingCamTarget, eased);
    if (this.landedShipGroup) {
      this.camera.lookAt(this.landedShipPos.x, this.landedShipPos.y + 1.2, this.landedShipPos.z);
    }
    if (this.boardingProgress >= 1) {
      this.boardingStarted = false;
      this.zone.run(() => this.boardingActive.set(false));
      this.zone.run(() => this.exitSurface.emit());
    }
  }

  private computeShipScreenLabel(): SurfacePoiLabel | null {
    const ship = this.landedShipGroup;
    if (!ship || this.launchActive() || this.boardingActive()) return null;
    const host = this.hostRef.nativeElement;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return null;

    const labelPos = new Vector3(ship.position.x, ship.position.y + 3.8, ship.position.z);
    this.projVec.copy(labelPos).project(this.camera);
    const onScreen =
      this.projVec.z < 1 &&
      this.projVec.x >= -1.1 &&
      this.projVec.x <= 1.1 &&
      this.projVec.y >= -1.1 &&
      this.projVec.y <= 1.1;
    if (!onScreen) return null;

    const dist = this.camera.position.distanceTo(labelPos);
    const symbol = this.landedShipLabel() ?? 'Ship';
    return {
      kind: 'shipyard',
      label: symbol,
      x: (this.projVec.x * 0.5 + 0.5) * w,
      y: (-this.projVec.y * 0.5 + 0.5) * h,
      opacity: Math.max(0.5, Math.min(1, 1.4 - dist / 120)),
      inRange: this.nearLandedShip(),
    };
  }

  private initScene(): void {
    const host = this.hostRef.nativeElement;

    this.scene = new Scene();
    this.scene.background = new Color(0xc7e4ff);
    this.scene.fog = new Fog(0xe8c896, 60, 220);

    this.camera = new PerspectiveCamera(BASE_CAMERA_FOV, 1, 0.1, 250);

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
    this.nearClerk.set(false);
    this.marketDialogOpen.set(false);
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

    if (this.world.caveTunnels) {
      this.world.caveTunnels.ensureBuilt();
      const caveStored = initCaveProgress(
        planet.name,
        this.world.caveTunnels.getTotalCrystals(),
        agent,
      );
      this.world.caveTunnels.applyBrokenKeys(caveStored.brokenKeys);
      const cavePct = caveProgressPercent(caveStored);
      this.zone.run(() => this.caveProgressPct.set(cavePct));
      this.progression.recordSurfaceCavePercent(planet.name, cavePct);
    } else {
      this.zone.run(() => this.caveProgressPct.set(null));
    }

    this.caveInteriorActive.set(false);
    this.caveMappedEmitted = false;
    this.radioAnnouncedZones.clear();
    this.setSurfaceVisible(true);
    const cells = this.surfaceDiscovery.getVisitedCellsForPlanet(planet.name);
    this.zone.run(() => {
      this.footprintCells.set(cells);
      this.playerFootprintCell.set(null);
    });

    const ambience = resolveSurfaceAmbience(profile, this.surfaceWeather.event());
    this.lastAmbienceKey = `${ambience.kind}:${this.surfaceWeather.event() ?? 'calm'}`;

    this.collectNightEmitters();
    this.rebuildLandedShip(this.boardingShip());
  }

  private clearLandedShip(): void {
    this.clearLaunchEffects();
    const world = this.world;
    if (world) {
      world.colliders.removeTag('landed-ship');
    }
    if (this.landedShipPad) {
      this.scene?.remove(this.landedShipPad);
      disposeLandingPad(this.landedShipPad);
      this.landedShipPad = null;
    }
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
    world.marketClerk = built.clerk;
    world.colliders.removeTag('market');
    built.colliders.forEach((c) => world.colliders.add(c, 'market'));
    this.nearClerk.set(false);
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
        this.openMarketDialog();
        break;
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
        if (this.caveInteriorActive()) {
          if (this.tryCaveBlock()) return;
          if (this.world?.caveTunnels?.isNearExit(
            this.camera.position.x,
            this.camera.position.y,
            this.camera.position.z,
          )) {
            this.beginCaveExit();
          }
        } else if (this.world?.caveTunnels) {
          this.beginCaveEnter();
        }
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
    if (this.entryRunning() || this.caveTransitionRunning()) return;
    if (this.fps.isLocked()) {
      if (this.activeZone()?.kind === 'mine' && this.tryMineBlock()) return;
      if (this.caveInteriorActive() && this.tryCaveBlock()) return;
    }
    if (!this.fps.isLocked()) {
      this.fps.requestLock();
      this.tryStartAmbience();
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.marketDialogOpen()) return;
    event.preventDefault();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      if (this.marketDialogOpen()) {
        this.closeMarketDialog();
        event.preventDefault();
        return;
      }
      if (this.fps.isLocked()) {
        document.exitPointerLock();
      }
      return;
    }

    if (event.code === 'KeyE') {
      if (this.caveTransitionRunning()) return;
      if (this.tryBoardLandedShip()) {
        event.preventDefault();
        return;
      }
      if (this.tryNearestContractCrate()) {
        event.preventDefault();
        return;
      }
      const active = this.activeZone();
      if (!active && !(this.caveInteriorActive() && this.world?.caveTunnels)) return;
      event.preventDefault();
      if (active?.kind === 'market') {
        if (this.nearClerk()) {
          this.openMarketDialog();
        }
      } else if (this.caveInteriorActive()) {
        if (this.tryCaveBlock()) return;
        if (
          this.world?.caveTunnels?.isNearExit(
            this.camera.position.x,
            this.camera.position.y,
            this.camera.position.z,
          )
        ) {
          this.beginCaveExit();
        }
      } else if (active) {
        this.handleZoneInteract(active.kind);
      }
      return;
    }

    if (event.code === 'KeyQ') {
      return;
    }
  };

  private openMarketDialog(): void {
    if (this.fps.isLocked()) {
      document.exitPointerLock();
    }
    this.zone.run(() => {
      this.zoneInteract.emit('market');
      this.marketDialogOpen.set(true);
    });
    this.radio.announce('Trading post clerk — ledger open.');
  }

  closeMarketDialog(): void {
    this.zone.run(() => this.marketDialogOpen.set(false));
  }

  onMarketTrade(event: { symbol: string; mode: 'buy' | 'sell'; units: number }): void {
    this.zone.run(() => this.marketTrade.emit(event));
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

  private tryCaveBlock(): boolean {
    const world = this.world;
    if (!world?.caveTunnels || !this.caveInteriorActive()) return false;

    const pick = world.caveTunnels.pickBlock(this.camera.position, this.getLookDirection());
    if (!pick) return false;

    const planetName = this.planet().name;
    const agent = this.agentName();
    if (pick.isCrystal && isCrystalAlreadyBroken(planetName, pick.key, agent)) {
      return false;
    }

    const result = world.caveTunnels.breakBlock(pick.x, pick.y, pick.z);
    if (!result) return false;

    if (result.wasCrystal) {
      const progress = recordCrystalBroken(
        planetName,
        result.key,
        world.caveTunnels.getTotalCrystals(),
        agent,
      );
      const pct = caveProgressPercent(progress);
      this.zone.run(() => this.caveProgressPct.set(pct));
      this.progression.recordSurfaceCavePercent(planetName, pct);
      this.checkCaveMapped(pct);
    }

    return true;
  }

  private checkCaveMapped(pct: number): void {
    if (pct < 80 || this.caveMappedEmitted) return;
    this.caveMappedEmitted = true;
    this.snackbar.show('Cave chamber mapped — codex updated.', 'success', 3500);
    this.zone.run(() => this.caveMapped.emit({ percent: pct }));
  }

  private setSurfaceVisible(visible: boolean): void {
    const world = this.world;
    if (!world) return;
    for (const child of world.root.children) {
      if (child.name === 'cave-tunnels') {
        child.visible = true;
        continue;
      }
      child.visible = visible;
    }
    if (this.landedShipGroup) {
      this.landedShipGroup.visible = visible;
    }
  }

  private beginCaveEnter(): void {
    const world = this.world;
    if (!world?.caveTunnels || !world.caveCollision) return;
    this.surfaceReturnPos = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
      heading: this.camera.rotation.y,
    };
    this.caveTransitionProgress = 0;
    this.zone.run(() => {
      this.caveTransitionRunning.set(true);
      this.entryVeil.set(1);
    });
    this.caveTransitionMode = 'enter';
  }

  private beginCaveExit(): void {
    this.caveTransitionProgress = 0;
    this.zone.run(() => {
      this.caveTransitionRunning.set(true);
      this.entryVeil.set(1);
    });
    this.caveTransitionMode = 'exit';
  }

  private updateCaveTransition(delta: number): void {
    this.caveTransitionProgress = Math.min(
      1,
      this.caveTransitionProgress + delta / this.caveTransitionDuration,
    );
    const mid = this.caveTransitionProgress >= 0.5;
    if (mid && this.caveTransitionProgress - delta / this.caveTransitionDuration < 0.5) {
      if (this.caveTransitionMode === 'enter') {
        this.finishCaveEnterMid();
      } else if (this.caveTransitionMode === 'exit') {
        this.finishCaveExitMid();
      }
    }
    const veil = this.caveTransitionProgress < 0.5
      ? 1 - this.caveTransitionProgress * 2
      : (this.caveTransitionProgress - 0.5) * 2;
    this.zone.run(() => this.entryVeil.set(1 - veil));

    if (this.caveTransitionProgress >= 1) {
      this.zone.run(() => {
        this.entryVeil.set(0);
        this.caveTransitionRunning.set(false);
      });
      this.caveTransitionMode = null;
    }
  }

  private finishCaveEnterMid(): void {
    const world = this.world;
    if (!world?.caveTunnels) return;
    this.setSurfaceVisible(false);
    const spawn = world.caveTunnels.getInteriorSpawn();
    this.camera.position.set(spawn.x, spawn.y, spawn.z);
    this.camera.rotation.set(0, spawn.heading, 0);
    this.zone.run(() => this.caveInteriorActive.set(true));
    this.radio.announce('Cave ingress — structural scan active.');
  }

  private finishCaveExitMid(): void {
    const world = this.world;
    if (!world) return;
    this.setSurfaceVisible(true);
    this.camera.position.set(
      this.surfaceReturnPos.x,
      this.surfaceReturnPos.y,
      this.surfaceReturnPos.z,
    );
    this.camera.rotation.set(0, this.surfaceReturnPos.heading, 0);
    this.zone.run(() => this.caveInteriorActive.set(false));
  }

  private sampleFootprint(): void {
    if (this.caveInteriorActive()) return;
    const planetName = this.planet().name;
    const px = this.camera.position.x;
    const pz = this.camera.position.z;
    const now = performance.now();
    const moved = Math.hypot(px - this.lastFootprintSample.x, pz - this.lastFootprintSample.z);
    if (moved < 4 && now - this.lastFootprintSample.t < 2000) return;
    this.lastFootprintSample = { x: px, z: pz, t: now };
    this.progression.recordFootprintCell(planetName, px, pz);
    const cx = Math.floor(px / FOOTPRINT_CELL_SIZE);
    const cz = Math.floor(pz / FOOTPRINT_CELL_SIZE);
    const cells = this.surfaceDiscovery.getVisitedCellsForPlanet(planetName);
    this.zone.run(() => {
      this.playerFootprintCell.set({ cx, cz });
      this.footprintCells.set(cells);
    });
  }

  private announceZoneRadio(kind: SurfaceZoneKind): void {
    if (kind !== 'ruins' && kind !== 'cave') return;
    const key = `${this.planet().name}:${kind}`;
    if (this.radioAnnouncedZones.has(key)) return;
    this.radioAnnouncedZones.add(key);
    this.radio.announceZoneProximity(kind, this.planet().name);
  }

  private updateNearClerk(zone: SurfaceZone | null): boolean {
    const world = this.world;
    if (!world?.marketClerk || zone?.kind !== 'market') return false;
    return isNearMarketClerk(
      this.camera.position.x,
      this.camera.position.z,
      world.marketClerk,
    );
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

      if (this.caveTransitionRunning()) {
        this.updateCaveTransition(delta);
        this.renderer.render(this.scene, this.camera);
        return;
      }

      if (this.launchActive()) {
        this.updateLaunch(delta);
      } else if (this.world && this.fps.isLocked() && !this.marketDialogOpen()) {
        const px = this.camera.position.x;
        const pz = this.camera.position.z;

        if (this.caveInteriorActive() && this.world.caveCollision) {
          this.world.caveTunnels?.ensureBuilt();
          this.fps.update(delta, () => false, {
            collision: this.world.caveCollision,
            useTerrainHeight: true,
          });
        } else {
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

          this.fps.update(delta, () => false, {
            collision: this.world.collision,
            useTerrainHeight: true,
          });
          this.sampleFootprint();
        }

        this.zone.run(() => this.jetpackFuel.set(this.fps.fuelRatio));

        if (!this.caveInteriorActive() && this.world.cart) {
          if (this.world.cart.update(delta)) {
            this.zone.run(() => this.cartDelivered.emit());
          }
        }

        if (this.world.fauna && !this.caveInteriorActive()) {
          this.world.fauna.update(delta);
        }

        const zone = this.caveInteriorActive()
          ? null
          : getActiveZone(
              this.camera.position.x,
              this.camera.position.y - 1,
              this.camera.position.z,
              this.world.zones,
            );
        if (zone && zone.kind !== this.lastZoneKind) {
          this.lastZoneKind = zone.kind;
          this.progression.recordSurfaceZone(zone.kind);
          this.announceZoneRadio(zone.kind);
        } else if (!zone) {
          this.lastZoneKind = null;
        }
        const poi = this.computePoiLabels(zone);
        const nearClerk = this.updateNearClerk(zone);
        this.zone.run(() => {
          this.activeZone.set(zone);
          this.pointerLocked.set(true);
          this.poiLabels.set(poi);
          this.nearClerk.set(nearClerk);
          this.shipScreenLabel.set(this.computeShipScreenLabel());
          this.updateHudSignals(zone);
          this.updateLandedShipProximity();
        });
      } else {
        const poi = this.computePoiLabels(this.activeZone());
        this.zone.run(() => {
          this.pointerLocked.set(this.fps.isLocked());
          this.poiLabels.set(poi);
          this.shipScreenLabel.set(this.computeShipScreenLabel());
          this.updateHudSignals(this.activeZone());
          this.updateLandedShipProximity();
        });
      }

      this.renderer.render(this.scene, this.camera);
    };
    render();
  }
}
