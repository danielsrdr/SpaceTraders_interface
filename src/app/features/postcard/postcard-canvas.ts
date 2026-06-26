import { PlanetView, computeMapLayout, canvasPosition } from '../../models/system.model';
import { resolveWaypointType } from '../systems/planet-helpers';
import { factionColor } from '../../shared/faction-colors';
import { seededRandom } from '../../shared/seeded-random';

export interface PostcardOptions {
  systemSymbol: string;
  systemName: string;
  planets: PlanetView[];
  highlightWaypoint?: string | null;
  captain: { name: string; faction: string; credits?: number };
}

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 56;
const FONT = '"pixellari", "Courier New", monospace';

/** Stylized dot color per resolved waypoint type. */
const TYPE_COLORS: Record<string, string> = {
  PLANET: '#4ea1ff',
  GAS_GIANT: '#f4a261',
  MOON: '#cbd5e1',
  ORBITAL_STATION: '#a3e635',
  JUMP_GATE: '#c084fc',
  ASTEROID: '#9ca3af',
  ASTEROID_FIELD: '#9ca3af',
  ASTEROID_BASE: '#a8a29e',
  ENGINEERED_ASTEROID: '#fbbf24',
  NEBULA: '#f472b6',
  DEBRIS_FIELD: '#94a3b8',
  GRAVITY_WELL: '#818cf8',
  ARTIFICIAL_GRAVITY_WELL: '#818cf8',
  ARTIFICAL_GRAVITY_WELL: '#818cf8',
  FUEL_STATION: '#34d399',
};

function planetColor(type: string): string {
  return TYPE_COLORS[type] ?? '#9ca3af';
}

function planetRadius(type: string): number {
  switch (type) {
    case 'GAS_GIANT':
      return 14;
    case 'PLANET':
      return 11;
    case 'JUMP_GATE':
      return 8;
    case 'MOON':
      return 6;
    case 'ORBITAL_STATION':
    case 'FUEL_STATION':
      return 6;
    default:
      return 7;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Render a stylized 2D "postcard" of a system to an offscreen canvas. Pure and
 * deterministic (starfield seeded by the system symbol) — no WebGL capture, so
 * it produces a consistent shareable image regardless of camera state.
 */
export function renderPostcard(opts: PostcardOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  drawBackground(ctx, opts.systemSymbol);
  drawSystem(ctx, opts);
  drawTextScrims(ctx);
  drawFrame(ctx);
  drawText(ctx, opts);
  return canvas;
}

function drawBackground(ctx: CanvasRenderingContext2D, seed: string): void {
  const base = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  base.addColorStop(0, '#05060f');
  base.addColorStop(0.5, '#0a0b1f');
  base.addColorStop(1, '#0b0118');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const rand = seededRandom(seed);

  // Soft nebula clouds.
  for (let i = 0; i < 4; i++) {
    const x = rand() * WIDTH;
    const y = rand() * HEIGHT;
    const radius = 140 + rand() * 240;
    const hue = 200 + rand() * 120;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `hsla(${hue}, 70%, 55%, 0.12)`);
    glow.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // Stars.
  for (let i = 0; i < 280; i++) {
    const x = rand() * WIDTH;
    const y = rand() * HEIGHT;
    const tier = rand();
    const radius = tier < 0.92 ? rand() * 1.2 + 0.2 : rand() * 1.8 + 1;
    ctx.globalAlpha = 0.3 + rand() * 0.7;
    ctx.fillStyle = tier < 0.85 ? '#ffffff' : tier < 0.93 ? '#bfdbfe' : '#fde68a';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSystem(ctx: CanvasRenderingContext2D, opts: PostcardOptions): void {
  const planets = opts.planets;
  if (!planets.length) return;

  const layout = computeMapLayout(planets, WIDTH, HEIGHT);
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;

  // Orbit rings (distance from the system center to each body).
  ctx.save();
  ctx.strokeStyle = 'rgba(120, 180, 255, 0.14)';
  ctx.lineWidth = 1.2;
  for (const planet of planets) {
    const pos = canvasPosition(planet.position, layout);
    const ringRadius = Math.hypot(pos.x - cx, pos.y - cy);
    if (ringRadius < 4) continue;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Central star.
  const sunReach = 64;
  const sunGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunReach);
  sunGlow.addColorStop(0, 'rgba(255, 241, 170, 0.95)');
  sunGlow.addColorStop(0.5, 'rgba(255, 176, 64, 0.4)');
  sunGlow.addColorStop(1, 'rgba(255, 140, 0, 0)');
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, sunReach, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff4c2';
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.fill();

  // Bodies.
  for (const planet of planets) {
    const pos = canvasPosition(planet.position, layout);
    const type = resolveWaypointType(planet.type);
    const color = planetColor(type);
    const radius = planetRadius(type);

    const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius * 3);
    glow.addColorStop(0, hexToRgba(color, 0.5));
    glow.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHighlight(ctx, opts, layout);
}

function drawHighlight(
  ctx: CanvasRenderingContext2D,
  opts: PostcardOptions,
  layout: ReturnType<typeof computeMapLayout>,
): void {
  if (!opts.highlightWaypoint) return;
  const planet = opts.planets.find((p) => p.name === opts.highlightWaypoint);
  if (!planet) return;

  const pos = canvasPosition(planet.position, layout);
  const radius = planetRadius(resolveWaypointType(planet.type));

  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius + 12, 0, Math.PI * 2);
  ctx.stroke();

  // Down-pointing marker above the body.
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y - radius - 16);
  ctx.lineTo(pos.x - 7, pos.y - radius - 30);
  ctx.lineTo(pos.x + 7, pos.y - radius - 30);
  ctx.closePath();
  ctx.fill();
}

function drawTextScrims(ctx: CanvasRenderingContext2D): void {
  const top = ctx.createLinearGradient(0, 0, 0, 190);
  top.addColorStop(0, 'rgba(3, 5, 12, 0.82)');
  top.addColorStop(1, 'rgba(3, 5, 12, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, WIDTH, 190);

  const bottom = ctx.createLinearGradient(0, HEIGHT - 210, 0, HEIGHT);
  bottom.addColorStop(0, 'rgba(3, 5, 12, 0)');
  bottom.addColorStop(1, 'rgba(3, 5, 12, 0.88)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, HEIGHT - 210, WIDTH, 210);
}

function drawFrame(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = 'rgba(120, 180, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(18.5, 18.5, WIDTH - 37, HEIGHT - 37);
  ctx.strokeStyle = 'rgba(120, 180, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(26.5, 26.5, WIDTH - 53, HEIGHT - 53);
}

function drawText(ctx: CanvasRenderingContext2D, opts: PostcardOptions): void {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Headline.
  ctx.font = `20px ${FONT}`;
  ctx.fillStyle = 'rgba(186, 230, 253, 0.9)';
  ctx.fillText('I WAS AT', MARGIN, MARGIN + 6);

  const headline = (opts.highlightWaypoint || opts.systemName || opts.systemSymbol || 'DEEP SPACE').toString();
  ctx.font = `64px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(56, 189, 248, 0.55)';
  ctx.shadowBlur = 18;
  ctx.fillText(headline, MARGIN, MARGIN + 70);
  ctx.shadowBlur = 0;

  ctx.font = `22px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText(`System ${opts.systemSymbol}`, MARGIN, MARGIN + 104);

  // Captain signature.
  const accent = factionColor(opts.captain.faction);
  const baseY = HEIGHT - 70;

  ctx.font = `18px ${FONT}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText('CAPTAIN', MARGIN, baseY - 34);

  const signature = `— ${opts.captain.name}`;
  ctx.font = `40px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(signature, MARGIN, baseY);
  const sigWidth = ctx.measureText(signature).width;

  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(MARGIN, baseY + 10);
  ctx.bezierCurveTo(
    MARGIN + sigWidth * 0.3,
    baseY + 22,
    MARGIN + sigWidth * 0.7,
    baseY - 4,
    MARGIN + sigWidth + 18,
    baseY + 12,
  );
  ctx.stroke();

  if (opts.captain.faction) {
    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = accent;
    ctx.fillText(opts.captain.faction.toUpperCase(), MARGIN, baseY + 38);
  }

  // Watermark + credits (bottom-right).
  ctx.textAlign = 'right';
  ctx.font = `20px ${FONT}`;
  ctx.fillStyle = 'rgba(186, 230, 253, 0.6)';
  ctx.fillText('skamkraft', WIDTH - MARGIN, HEIGHT - MARGIN);

  if (opts.captain.credits != null) {
    ctx.font = `18px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillText(`${opts.captain.credits.toLocaleString()} cr`, WIDTH - MARGIN, HEIGHT - MARGIN - 26);
  }
  ctx.textAlign = 'left';
}
