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
