import { describe, expect, it } from 'vitest';
import { factionThemeVars } from './faction-colors';

describe('factionThemeVars', () => {
  it('returns accent vars for known factions', () => {
    const vars = factionThemeVars('COSMIC');
    expect(vars['--color-accent']).toContain('69');
    expect(vars['--color-phosphor']).toBe('#4580ff');
  });

  it('falls back for unknown factions', () => {
    const vars = factionThemeVars('UNKNOWN_FACTION');
    expect(vars['--color-phosphor']).toBe('#9ca3af');
  });
});
