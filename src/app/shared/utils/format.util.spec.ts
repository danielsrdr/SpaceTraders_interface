import { describe, expect, it } from 'vitest';
import { formatCompact, formatCompactNum, formatCredits } from './format.util';

describe('format.util', () => {
  it('formatCredits rounds and signs', () => {
    expect(formatCredits(0)).toBe('0c');
    expect(formatCredits(1234.6)).toBe(`${(1235).toLocaleString()}c`);
    expect(formatCredits(-1234.4)).toBe(`-${(1234).toLocaleString()}c`);
  });

  it('formatCompact rounds with grouping', () => {
    expect(formatCompact(1234.5)).toBe(Math.round(1234.5).toLocaleString());
  });

  it('formatCompactNum abbreviates k/M', () => {
    expect(formatCompactNum(999)).toBe('999');
    expect(formatCompactNum(1500)).toBe('1.5k');
    expect(formatCompactNum(12_000)).toBe('12k');
    expect(formatCompactNum(2_500_000)).toBe('2.5M');
    expect(formatCompactNum(25_000_000)).toBe('25M');
  });
});
