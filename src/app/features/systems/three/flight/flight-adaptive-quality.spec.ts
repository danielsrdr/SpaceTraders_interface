import { describe, expect, it } from 'vitest';
import {
  createAdaptiveQualityState,
  decideAdaptiveQuality,
  sampleFrameTimeEma,
} from './flight-adaptive-quality';

describe('flight-adaptive-quality', () => {
  it('computes EMA of frame times', () => {
    const state = createAdaptiveQualityState();
    sampleFrameTimeEma(state, 30);
    expect(state.frameMsEma).toBe(30);
    sampleFrameTimeEma(state, 10);
    expect(state.frameMsEma).toBeCloseTo(28, 5);
  });

  it('drops quality when sustained over budget', () => {
    const state = createAdaptiveQualityState();
    state.frameMsEma = 30;
    const decision = decideAdaptiveQuality(state, 1100, true, false);
    expect(decision.highQuality).toBe(false);
    expect(state.overBudgetMs).toBe(0);
  });

  it('keeps manual bloom override', () => {
    const state = createAdaptiveQualityState();
    state.frameMsEma = 40;
    const decision = decideAdaptiveQuality(state, 2000, true, true);
    expect(decision.highQuality).toBe(true);
  });
});
