import { describe, expect, it } from 'vitest';
import { getApiErrorMessage, toSpaceTradersApiError } from './api-error-message.util';
import { SpaceTradersApiError } from './spacetraders-api-error';

describe('api-error-message.util', () => {
  it('extracts message from SpaceTradersApiError', () => {
    const err = new SpaceTradersApiError('Rate limited', 429);
    expect(getApiErrorMessage(err)).toBe('Rate limited');
  });

  it('wraps generic errors', () => {
    const wrapped = toSpaceTradersApiError(new Error('network'));
    expect(wrapped.message).toBe('network');
  });
});
