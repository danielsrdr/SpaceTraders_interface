import { describe, expect, it } from 'vitest';
import { tierFromPoints, TIER_THRESHOLDS } from './mission-director.models';

describe('MissionDirector models', () => {
  it('computes tier from points', () => {
    expect(tierFromPoints(0)).toBe('unknown');
    expect(tierFromPoints(TIER_THRESHOLDS.contact)).toBe('contact');
    expect(tierFromPoints(TIER_THRESHOLDS.trusted)).toBe('trusted');
    expect(tierFromPoints(TIER_THRESHOLDS.inner_circle)).toBe('inner_circle');
  });
});
