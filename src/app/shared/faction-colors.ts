const FACTION_COLORS: Record<string, string> = {
  COSMIC: '#4580ff',
  VOID: '#8b5cf6',
  GALACTIC: '#22d3ee',
  QUANTUM: '#a855f7',
  DOMINION: '#ef4444',
  ASTRO: '#f59e0b',
  CORSAIRS: '#dc2626',
  OBSIDIAN: '#64748b',
  AEGIS: '#38bdf8',
  UNITED: '#3b82f6',
  SOLITARY: '#94a3b8',
  COBALT: '#2563eb',
  OMEGA: '#e11d48',
  ECHO: '#14b8a6',
  LORDS: '#eab308',
  CULT: '#d946ef',
  ANCIENTS: '#10b981',
  SHADOW: '#475569',
  ETHEREAL: '#c084fc',
};

const FALLBACK_COLOR = '#9ca3af';

export function factionColor(symbol: string | null | undefined): string {
  if (!symbol) return FALLBACK_COLOR;
  return FACTION_COLORS[symbol.toUpperCase()] ?? FALLBACK_COLOR;
}

export interface FactionThemeVars {
  '--color-accent': string;
  '--color-phosphor': string;
  '--color-phosphor-dim': string;
}

/** Derive global CSS variables from a faction accent hex. */
export function factionThemeVars(symbol: string | null | undefined): FactionThemeVars {
  const accent = factionColor(symbol);
  return {
    '--color-accent': accent.includes('rgba') ? accent : hexToRgba(accent, 0.84),
    '--color-phosphor': accent,
    '--color-phosphor-dim': hexToRgba(accent, 0.65),
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
