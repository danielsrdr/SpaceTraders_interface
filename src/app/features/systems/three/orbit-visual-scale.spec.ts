import { STAR_MU } from './celestial-mass';
import {
  REF_HELIO_ORBIT_KM,
  REF_HELIO_PERIOD_SEC,
} from './physics-units';
import { displayMeanMotion, orbitPeriodSec } from './orbit-visual-scale';

describe('orbit-visual-scale', () => {
  it('calibrates heliocentric reference orbit to REF_HELIO_PERIOD_SEC', () => {
    const period = orbitPeriodSec(REF_HELIO_ORBIT_KM, STAR_MU);
    expect(period).toBeCloseTo(REF_HELIO_PERIOD_SEC, 0);
  });

  it('keeps Kepler ratio: inner sun orbit faster than outer', () => {
    const nInner = displayMeanMotion(80_000, STAR_MU);
    const nOuter = displayMeanMotion(400_000, STAR_MU);
    expect(nInner).toBeGreaterThan(nOuter);
    expect(nInner / nOuter).toBeCloseTo(Math.pow(400_000 / 80_000, 1.5), 3);
  });

  it('ensures heliocentric motion is visible within a few minutes', () => {
    const periodInner = orbitPeriodSec(100_000, STAR_MU);
    const periodOuter = orbitPeriodSec(2_000_000, STAR_MU);
    expect(periodInner).toBeLessThan(600);
    expect(periodOuter).toBeLessThan(60 * 60 * 8);
    expect(periodOuter).toBeGreaterThan(periodInner);
  });
});
