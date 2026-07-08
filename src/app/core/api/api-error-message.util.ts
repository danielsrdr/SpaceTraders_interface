import { SpaceTradersApiError, isSpaceTradersApiError } from './spacetraders-api-error';

export function getApiErrorMessage(error: unknown): string {
  if (isSpaceTradersApiError(error)) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export function toSpaceTradersApiError(error: unknown): SpaceTradersApiError {
  if (isSpaceTradersApiError(error)) return error;
  if (error instanceof Error) {
    const status = (error as Error & { status?: number }).status;
    return new SpaceTradersApiError(error.message, status);
  }
  return new SpaceTradersApiError(getApiErrorMessage(error));
}
