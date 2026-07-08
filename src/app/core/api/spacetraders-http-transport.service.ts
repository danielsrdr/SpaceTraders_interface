import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SPACETRADERS_CONFIG } from '../config/spacetraders.config';
import { RateLimiterService } from '../../services/rate-limiter.service';
import { TokenStorageService } from '../../services/token-storage.service';
import { SpaceTradersApiError } from './spacetraders-api-error';
import { ApiErrorHandlerService } from './api-error-handler.service';
import type { ApiRequestOptions } from './api-request-options';

@Injectable({ providedIn: 'root' })
export class SpaceTradersHttpTransportService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(SPACETRADERS_CONFIG);
  private readonly rateLimiter = inject(RateLimiterService);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly errorHandler = inject(ApiErrorHandlerService);

  async execute<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
    const { method = 'GET', body = null, requiresAuth = true, bearerToken, suppressGlobalHandler } =
      options;

    const token = bearerToken ?? (requiresAuth ? this.tokenStorage.getToken() : null);
    if (requiresAuth && !token) {
      throw new SpaceTradersApiError('Authentication required. Please login first.');
    }

    return this.rateLimiter.enqueue(async () => {
      return this.withRetry(async () => {
        const headers: Record<string, string> = {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const needsBody = ['POST', 'PATCH', 'PUT'].includes(method);
        const url = `${this.config.host}${endpoint}`;

        try {
          const response = await firstValueFrom(
            this.http.request<T>(method, url, {
              headers,
              body: body ? body : needsBody ? {} : undefined,
              observe: 'body',
            }),
          );
          return response as T;
        } catch (error) {
          const apiError = this.normalizeError(error);
          this.errorHandler.handle(apiError, { suppressGlobalHandler });
          throw apiError;
        }
      });
    });
  }

  clearQueue(): void {
    this.rateLimiter.clearQueue();
  }

  private normalizeError(error: unknown): SpaceTradersApiError {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.error?.message ?? `HTTP ${error.status}`;
      return new SpaceTradersApiError(message, error.status, error.error);
    }
    if (error instanceof SpaceTradersApiError) return error;
    if (error instanceof Error) {
      const status = (error as Error & { status?: number }).status;
      return new SpaceTradersApiError(error.message, status);
    }
    return new SpaceTradersApiError('Unknown error');
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    const { maxRetries, baseDelay, maxDelay, retryableStatuses } = this.config.retry;
    let lastError: SpaceTradersApiError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof SpaceTradersApiError ? error : this.normalizeError(error);
        const status = lastError.status;
        const isRetryable = status && retryableStatuses.includes(status);
        if (!isRetryable || attempt === maxRetries) throw lastError;
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastError;
  }
}
