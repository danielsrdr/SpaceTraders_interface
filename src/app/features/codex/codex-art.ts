import { factionColor } from '../../shared/faction-colors';
import { seededRandom } from '../../shared/seeded-random';
import { GoodCategory, goodCategory, goodColor } from '../systems/trade-good-visuals';

/** "#rrggbb" + alpha -> "rgba(r,g,b,a)". */
function withAlpha(hex: string, alpha: number): string {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexFromInt(value: number): string {
  return `#${(value >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points: number,
  color: string,
  rotation: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation - Math.PI / 2);
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Draws a seeded achievement medallion: a tiered, star-emblazoned badge. */
export function drawAchievementBadge(
  ctx: CanvasRenderingContext2D,
  options: { seed: string; color: string; tier: number; unlocked: boolean; size: number; time?: number },
): void {
  const { seed, tier, size, unlocked } = options;
  const time = options.time ?? 0;
  const color = unlocked ? options.color : '#475569';
  const rand = seededRandom(`ach:${seed}`);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.4;

  ctx.clearRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.12);
  glow.addColorStop(0, withAlpha(color, unlocked ? 0.5 : 0.18));
  glow.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.12, 0, Math.PI * 2);
  ctx.fill();

  const disc = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
  disc.addColorStop(0, withAlpha(color, unlocked ? 0.95 : 0.5));
  disc.addColorStop(1, withAlpha(color, unlocked ? 0.5 : 0.28));
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.02);
  ctx.strokeStyle = withAlpha('#ffffff', unlocked ? 0.8 : 0.3);
  ctx.stroke();

  if (unlocked) {
    const spokes = 10 + Math.floor(rand() * 6);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.0006);
    ctx.strokeStyle = withAlpha('#ffffff', 0.45);
    ctx.lineWidth = Math.max(1, size * 0.006);
    for (let i = 0; i < spokes; i++) {
      ctx.rotate((Math.PI * 2) / spokes);
      ctx.beginPath();
      ctx.moveTo(radius * 1.03, 0);
      ctx.lineTo(radius * 1.13, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  const starPoints = 5 + Math.floor(rand() * 2);
  const starColor = unlocked ? '#ffffff' : '#94a3b8';
  const starSpin = unlocked ? Math.sin(time * 0.001) * 0.12 : 0;
  drawStar(ctx, cx, cy, radius * 0.52, radius * 0.22, starPoints, starColor, starSpin);

  ctx.fillStyle = withAlpha('#ffffff', unlocked ? 0.92 : 0.4);
  const pipRadius = size * 0.022;
  const gap = pipRadius * 3;
  const startX = cx - (gap * (tier - 1)) / 2;
  const pipY = cy + radius * 0.62;
  for (let i = 0; i < tier; i++) {
    ctx.beginPath();
    ctx.arc(startX + i * gap, pipY, pipRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!unlocked) {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = Math.max(2, size * 0.018);
    const lw = size * 0.16;
    const lh = size * 0.12;
    ctx.strokeRect(cx - lw / 2, cy - lh * 0.1, lw, lh);
    ctx.beginPath();
    ctx.arc(cx, cy - lh * 0.1, lw * 0.32, Math.PI, 0);
    ctx.stroke();
  }
}

/**
 * Draws a seeded, rotationally-symmetric faction "sigil" — a generative emblem
 * unique to each faction symbol, themed with the faction's color. Deterministic
 * for a given symbol so the codex art is stable across sessions and machines.
 */
export function drawFactionSigil(
  ctx: CanvasRenderingContext2D,
  symbol: string,
  size: number,
  time = 0,
): void {
  const rand = seededRandom(`faction:${symbol}`);
  const color = factionColor(symbol);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;

  ctx.clearRect(0, 0, size, size);

  const glow = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
  glow.addColorStop(0, withAlpha(color, 0.85));
  glow.addColorStop(0.7, withAlpha(color, 0.22));
  glow.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  const folds = 3 + Math.floor(rand() * 5);
  const armPointCount = 4 + Math.floor(rand() * 4);
  const armPoints: Array<{ r: number; a: number }> = [];
  for (let i = 0; i < armPointCount; i++) {
    armPoints.push({
      r: radius * (0.22 + rand() * 0.72),
      a: -0.32 + (i / Math.max(1, armPointCount - 1)) * 0.64,
    });
  }

  const spin = time * 0.00025 * (rand() < 0.5 ? -1 : 1);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(1.5, size * 0.012);
  ctx.lineJoin = 'round';
  for (let f = 0; f < folds; f++) {
    ctx.save();
    ctx.rotate((Math.PI * 2 * f) / folds);
    ctx.beginPath();
    armPoints.forEach((point, index) => {
      const x = Math.cos(point.a) * point.r;
      const y = Math.sin(point.a) * point.r;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.022);
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.02, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function categorySilhouette(ctx: CanvasRenderingContext2D, category: GoodCategory, s: number): void {
  // All paths are drawn centered on (0, 0) within a roughly [-s, s] box.
  ctx.beginPath();
  switch (category) {
    case 'fuel': {
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.85, -s * 0.1, s * 0.6, s, 0, s);
      ctx.bezierCurveTo(-s * 0.6, s, -s * 0.85, -s * 0.1, 0, -s);
      break;
    }
    case 'minerals': {
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.9, -s * 0.2);
      ctx.lineTo(s * 0.55, s);
      ctx.lineTo(-s * 0.55, s);
      ctx.lineTo(-s * 0.9, -s * 0.2);
      ctx.closePath();
      break;
    }
    case 'chemicals': {
      ctx.moveTo(-s * 0.32, -s);
      ctx.lineTo(s * 0.32, -s);
      ctx.lineTo(s * 0.32, -s * 0.35);
      ctx.lineTo(s * 0.78, s * 0.85);
      ctx.lineTo(-s * 0.78, s * 0.85);
      ctx.lineTo(-s * 0.32, -s * 0.35);
      ctx.closePath();
      break;
    }
    case 'food': {
      ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
      break;
    }
    case 'tech': {
      const r = s * 0.78;
      ctx.rect(-r, -r, r * 2, r * 2);
      break;
    }
    case 'goods': {
      const r = s * 0.8;
      ctx.moveTo(-r, -r * 0.7);
      ctx.lineTo(r, -r * 0.7);
      ctx.lineTo(r, r * 0.7);
      ctx.lineTo(-r, r * 0.7);
      ctx.closePath();
      break;
    }
    default: {
      const _exhaustive: never = category;
      void _exhaustive;
      ctx.arc(0, 0, s * 0.8, 0, Math.PI * 2);
      break;
    }
  }
}

/**
 * Draws a seeded trade-good glyph: a category-shaped, faceted token tinted by
 * the good's category color, with per-symbol variation (rotation, facets).
 */
export function drawGoodGlyph(
  ctx: CanvasRenderingContext2D,
  symbol: string,
  size: number,
  time = 0,
): void {
  const rand = seededRandom(`good:${symbol}`);
  const category = goodCategory(symbol);
  const color = hexFromInt(goodColor(symbol));
  const cx = size / 2;
  const cy = size / 2;
  const s = size * 0.3;

  ctx.clearRect(0, 0, size, size);

  const bg = ctx.createRadialGradient(cx, cy, s * 0.2, cx, cy, size * 0.5);
  bg.addColorStop(0, withAlpha(color, 0.28));
  bg.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const wobble = Math.sin(time * 0.0012) * 0.06;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rand() - 0.5) * 0.5 + wobble);

  const fill = ctx.createLinearGradient(-s, -s, s, s);
  fill.addColorStop(0, withAlpha(color, 0.95));
  fill.addColorStop(1, withAlpha(color, 0.5));
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#0b1120';
  ctx.lineWidth = Math.max(1.5, size * 0.02);
  categorySilhouette(ctx, category, s);
  ctx.fill();
  ctx.stroke();

  // Seeded facet lines for a crystalline / paneled look.
  ctx.strokeStyle = withAlpha('#ffffff', 0.35);
  ctx.lineWidth = Math.max(1, size * 0.008);
  const facets = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < facets; i++) {
    ctx.beginPath();
    ctx.moveTo((rand() - 0.5) * s * 1.4, (rand() - 0.5) * s * 1.4);
    ctx.lineTo((rand() - 0.5) * s * 1.4, (rand() - 0.5) * s * 1.4);
    ctx.stroke();
  }

  // Highlight glint.
  ctx.fillStyle = withAlpha('#ffffff', 0.7);
  ctx.beginPath();
  ctx.arc(-s * 0.35, -s * 0.4, size * 0.025, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
