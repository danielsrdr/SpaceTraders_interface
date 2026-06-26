import { PlanetView, hasTrait } from '../../models/system.model';
import { buildSurfaceTraitProfile, type SurfaceTraitProfile } from '../systems/three/surface-trait-profile';
import { factionColor } from '../../shared/faction-colors';

export interface SurfacePostcardOptions {
  planet: PlanetView;
  profile: SurfaceTraitProfile;
  minePercent?: number;
  captain: { name: string; faction: string; credits?: number };
}

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 56;
const FONT = '"pixellari", "Courier New", monospace';

function colorHex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function dominantBiome(profile: SurfaceTraitProfile): string {
  const bias = profile.biomeBias;
  const entries: Array<[string, number]> = [
    ['jungle', bias.jungle ?? 0],
    ['industrial', bias.industrial ?? 0],
    ['desert', bias.desert ?? 0],
    ['rocky', bias.rocky ?? 0],
    ['sand', bias.sand ?? 0],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? 'rocky';
}

function traitChips(planet: PlanetView): string[] {
  const chips = (planet.traits ?? []).map((t) => t.symbol);
  if (chips.length) return chips.slice(0, 4);
  return [planet.type];
}

/** Stylized surface logbook stamp (2D canvas, no WebGL capture). */
export function renderSurfacePostcard(options: SurfacePostcardOptions): HTMLCanvasElement {
  const { planet, profile, minePercent, captain } = options;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const biome = dominantBiome(profile);
  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  grad.addColorStop(0, colorHex(profile.skyTint));
  grad.addColorStop(0.55, colorHex(profile.fogColor));
  grad.addColorStop(1, colorHex(profile.sandColor));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, HEIGHT * 0.62, WIDTH, HEIGHT * 0.38);

  ctx.font = `bold 42px ${FONT}`;
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'left';
  ctx.fillText('I WALKED', MARGIN, MARGIN + 40);
  ctx.font = `bold 56px ${FONT}`;
  ctx.fillStyle = '#fef3c7';
  ctx.fillText(planet.name.toUpperCase(), MARGIN, MARGIN + 110);

  ctx.font = `24px ${FONT}`;
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`Biome: ${biome}`, MARGIN, MARGIN + 160);
  ctx.fillText(`System ${planet.system}`, MARGIN, MARGIN + 195);

  const chips = traitChips(planet);
  let chipX = MARGIN;
  const chipY = MARGIN + 230;
  ctx.font = `18px ${FONT}`;
  for (const chip of chips) {
    const w = ctx.measureText(chip).width + 24;
    ctx.fillStyle = hasTrait(planet, chip) ? 'rgba(6,182,212,0.35)' : 'rgba(148,163,184,0.25)';
    ctx.fillRect(chipX, chipY, w, 32);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeRect(chipX, chipY, w, 32);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(chip, chipX + 12, chipY + 22);
    chipX += w + 10;
  }

  if (minePercent != null && minePercent > 0) {
    ctx.font = `22px ${FONT}`;
    ctx.fillStyle = '#67e8f9';
    ctx.fillText(`Network excavated: ${minePercent}%`, MARGIN, HEIGHT - MARGIN - 80);
  }

  ctx.font = `italic 28px ${FONT}`;
  ctx.fillStyle = factionColor(captain.faction);
  ctx.textAlign = 'right';
  ctx.fillText(`— ${captain.name}`, WIDTH - MARGIN, HEIGHT - MARGIN - 40);

  ctx.font = `20px ${FONT}`;
  ctx.fillStyle = 'rgba(248,250,252,0.45)';
  if (captain.credits != null) {
    ctx.fillText(`${captain.credits.toLocaleString()} cr`, WIDTH - MARGIN, HEIGHT - MARGIN);
  }

  ctx.strokeStyle = 'rgba(251,191,36,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, WIDTH - 48, HEIGHT - 48);

  return canvas;
}

/** Convenience wrapper when profile is not precomputed. */
export function renderSurfacePostcardForPlanet(
  planet: PlanetView,
  captain: SurfacePostcardOptions['captain'],
  minePercent?: number,
): HTMLCanvasElement {
  return renderSurfacePostcard({
    planet,
    profile: buildSurfaceTraitProfile(planet),
    minePercent,
    captain,
  });
}
