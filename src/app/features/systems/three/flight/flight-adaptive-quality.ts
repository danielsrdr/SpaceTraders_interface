export interface AdaptiveQualityState {
  frameMsEma: number;
  overBudgetMs: number;
  frameSampleCount: number;
}

export interface AdaptiveQualityConfig {
  budgetMs?: number;
  recoverMs?: number;
  sustainedOverMs?: number;
}

const DEFAULT_BUDGET_MS = 22;
const DEFAULT_RECOVER_MS = DEFAULT_BUDGET_MS * 0.6;
const DEFAULT_SUSTAINED_OVER_MS = 1000;

export function createAdaptiveQualityState(): AdaptiveQualityState {
  return { frameMsEma: 0, overBudgetMs: 0, frameSampleCount: 0 };
}

export function sampleFrameTimeEma(state: AdaptiveQualityState, ms: number): number {
  state.frameSampleCount++;
  state.frameMsEma = state.frameMsEma === 0 ? ms : state.frameMsEma * 0.9 + ms * 0.1;
  return state.frameMsEma;
}

export interface AdaptiveQualityDecision {
  highQuality: boolean;
  overBudgetMs: number;
}

/** Drops bloom when sustained over budget; recovers when headroom returns. */
export function decideAdaptiveQuality(
  state: AdaptiveQualityState,
  ms: number,
  highQuality: boolean,
  bloomManual: boolean,
  config: AdaptiveQualityConfig = {},
): AdaptiveQualityDecision {
  const budgetMs = config.budgetMs ?? DEFAULT_BUDGET_MS;
  const recoverMs = config.recoverMs ?? DEFAULT_RECOVER_MS;
  const sustainedOverMs = config.sustainedOverMs ?? DEFAULT_SUSTAINED_OVER_MS;

  if (state.frameMsEma > budgetMs) {
    state.overBudgetMs += ms;
  } else if (state.frameMsEma < recoverMs) {
    state.overBudgetMs = Math.max(0, state.overBudgetMs - ms * 2);
  }

  if (bloomManual) {
    return { highQuality, overBudgetMs: state.overBudgetMs };
  }

  const sustainedOver = state.overBudgetMs > sustainedOverMs;
  const sustainedHeadroom = state.frameMsEma < recoverMs && state.overBudgetMs === 0;

  if (sustainedOver && highQuality) {
    state.overBudgetMs = 0;
    return { highQuality: false, overBudgetMs: 0 };
  }
  if (sustainedHeadroom && !highQuality) {
    return { highQuality: true, overBudgetMs: state.overBudgetMs };
  }

  return { highQuality, overBudgetMs: state.overBudgetMs };
}
