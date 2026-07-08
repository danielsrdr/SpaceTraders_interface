export class SpaceTradersApiError extends Error {
  readonly status?: number;
  readonly body?: unknown;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = 'SpaceTradersApiError';
    this.status = status;
    this.body = body;
  }
}

export function isSpaceTradersApiError(error: unknown): error is SpaceTradersApiError {
  return error instanceof SpaceTradersApiError;
}
