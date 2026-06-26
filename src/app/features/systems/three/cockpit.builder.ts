import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { disposeObject3D, disposeMaterial } from './three-dispose.util';

export interface CockpitGaugeFuel {
  current: number;
  capacity: number;
}

export interface CockpitGaugeCargo {
  units: number;
  capacity: number;
}

export interface CockpitBuildResult {
  /** Camera-local rig (parent this to the PerspectiveCamera). */
  group: Group;
  /** Canopy glass material — its `uTime` is advanced by the animated-material loop. */
  glassMaterial: ShaderMaterial;
  /** Repaint the diegetic dashboard gauges. */
  drawGauges: (fuel: CockpitGaugeFuel | null, cargo: CockpitGaugeCargo | null, label: string) => void;
  dispose: () => void;
}

const GAUGE_W = 1024;
const GAUGE_H = 256;

/** Draws the fuel/cargo HUD onto the dashboard canvas texture. */
function paintGauges(
  ctx: CanvasRenderingContext2D,
  fuel: CockpitGaugeFuel | null,
  cargo: CockpitGaugeCargo | null,
  label: string,
): void {
  ctx.clearRect(0, 0, GAUGE_W, GAUGE_H);

  // Panel backdrop + frame.
  ctx.fillStyle = 'rgba(4, 9, 18, 0.92)';
  ctx.fillRect(0, 0, GAUGE_W, GAUGE_H);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, GAUGE_W - 12, GAUGE_H - 12);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7dd3fc';
  ctx.font = '600 30px monospace';
  ctx.fillText((label || 'NO VESSEL').toUpperCase().slice(0, 28), GAUGE_W / 2, 38);

  const drawBar = (
    x: number,
    title: string,
    value: number,
    max: number,
    accent: string,
    warn: boolean,
  ): void => {
    const barW = GAUGE_W / 2 - 80;
    const barH = 40;
    const barX = x;
    const barY = 150;
    const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 24px monospace';
    ctx.fillText(title, barX, barY - 34);

    ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
    ctx.fillRect(barX, barY, barW, barH);

    ctx.fillStyle = warn ? '#f87171' : accent;
    ctx.fillRect(barX, barY, barW * frac, barH);

    // Tick marks.
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.6)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 10; i++) {
      const tx = barX + (barW * i) / 10;
      ctx.beginPath();
      ctx.moveTo(tx, barY);
      ctx.lineTo(tx, barY + barH);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.textAlign = 'right';
    ctx.fillStyle = warn ? '#fca5a5' : '#e2e8f0';
    ctx.font = '600 26px monospace';
    const text = max > 0 ? `${Math.round(value)} / ${Math.round(max)}` : '----';
    ctx.fillText(text, barX + barW, barY - 34);
  };

  const fuelWarn = !!fuel && fuel.capacity > 0 && fuel.current / fuel.capacity < 0.2;
  drawBar(48, 'FUEL', fuel?.current ?? 0, fuel?.capacity ?? 0, '#fbbf24', fuelWarn);
  drawBar(GAUGE_W / 2 + 32, 'CARGO', cargo?.units ?? 0, cargo?.capacity ?? 0, '#38bdf8', false);
}

function createGlassMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      // The system sun sits at the scene origin (systemCenter).
      uSunPos: { value: new Vector3(0, 0, 0) },
      uTint: { value: new Color(0x2a4a66) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunPos;
      uniform vec3 uTint;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 toSun = normalize(uSunPos - vWorldPos);

        // Mirror-reflection of the star toward the eye -> moving glare streak.
        vec3 R = reflect(-toSun, N);
        float glare = pow(max(dot(R, V), 0.0), 6.0);
        // Faint shimmer so the glare breathes instead of sitting static.
        glare *= 0.85 + 0.15 * sin(uTime * 1.7);

        // Grazing-angle rim so the canopy edges catch light.
        float fres = pow(1.0 - abs(dot(V, N)), 2.5);

        float alpha = clamp(fres * 0.06 + glare * 0.7, 0.0, 0.85);
        vec3 col = mix(uTint, vec3(1.0, 0.93, 0.78), glare);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    side: BackSide,
    depthWrite: false,
  });
}

/**
 * First-person cockpit rig rendered in camera-local space: a tilted dashboard
 * carrying the diegetic fuel/cargo gauges, canopy struts framing the view, and a
 * curved glass canopy with a fresnel rim + star-reflection streak. Parent the
 * returned group to the PerspectiveCamera (the camera must be added to the scene
 * for its children to render).
 */
export function buildCockpit(): CockpitBuildResult {
  const group = new Group();
  group.name = 'cockpit-rig';

  const hullMat = new MeshStandardMaterial({
    color: 0x0b1220,
    roughness: 0.55,
    metalness: 0.6,
    emissive: new Color(0x05202e),
    emissiveIntensity: 0.4,
  });

  // Dashboard wedge below the sightline.
  const dash = new Mesh(new BoxGeometry(3.4, 0.6, 1.3), hullMat);
  dash.position.set(0, -1.12, -1.05);
  dash.rotation.x = 0.42;
  group.add(dash);

  // Gauge screen.
  const canvas = document.createElement('canvas');
  canvas.width = GAUGE_W;
  canvas.height = GAUGE_H;
  const ctx = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  const screenMat = new MeshBasicMaterial({ map: texture, toneMapped: false, transparent: true });
  const screen = new Mesh(new PlaneGeometry(1.9, 0.475), screenMat);
  screen.position.set(0, -0.82, -1.18);
  screen.rotation.x = -0.62;
  group.add(screen);

  // Canopy struts.
  const strutMat = new MeshStandardMaterial({ color: 0x111a2b, roughness: 0.4, metalness: 0.75 });
  const topBar = new Mesh(new BoxGeometry(2.7, 0.14, 0.14), strutMat);
  topBar.position.set(0, 1.02, -1.7);
  group.add(topBar);

  for (const sx of [-1.32, 1.32]) {
    const pillar = new Mesh(new BoxGeometry(0.14, 2.3, 0.14), strutMat);
    pillar.position.set(sx, 0.0, -1.55);
    pillar.rotation.z = sx > 0 ? 0.18 : -0.18;
    group.add(pillar);
  }
  const centerPost = new Mesh(new BoxGeometry(0.09, 2.0, 0.09), strutMat);
  centerPost.position.set(0, 0.0, -1.78);
  group.add(centerPost);

  // Curved glass canopy. Centered slightly behind the eye so off-axis fragments
  // sit at grazing angles (a sphere centered on the camera would have a constant
  // view/normal angle and produce no fresnel variation).
  const glassMaterial = createGlassMaterial();
  const glass = new Mesh(new SphereGeometry(3.2, 40, 28), glassMaterial);
  glass.position.set(0, 0.25, 0.9);
  group.add(glass);

  const drawGauges = (
    fuel: CockpitGaugeFuel | null,
    cargo: CockpitGaugeCargo | null,
    label: string,
  ): void => {
    paintGauges(ctx, fuel, cargo, label);
    texture.needsUpdate = true;
  };
  drawGauges(null, null, '');

  const dispose = (): void => {
    disposeObject3D(group);
    disposeMaterial(glassMaterial);
    texture.dispose();
  };

  return { group, glassMaterial, drawGauges, dispose };
}
