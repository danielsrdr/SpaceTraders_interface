import { inject, Injectable } from '@angular/core';
import { CacheService } from '../../services/cache.service';
import { SpaceTradersHttpTransportService } from './spacetraders-http-transport.service';
import type { ApiRequestOptions } from './api-request-options';

@Injectable({ providedIn: 'root' })
export class ApiRequestService {
  private readonly cache = inject(CacheService);
  private readonly transport = inject(SpaceTradersHttpTransportService);

  async request<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
    const { method = 'GET', body = null, cache: cacheConfig } = options;

    if (method === 'GET' && cacheConfig) {
      const cacheKey = this.cache.generateKey(
        cacheConfig.category,
        endpoint,
        JSON.stringify(body ?? ''),
      );
      const cached = this.cache.get<T>(cacheKey);
      if (cached) return cached;
    }

    const result = await this.transport.execute<T>(endpoint, options);

    if (method === 'GET' && cacheConfig) {
      const cacheKey = this.cache.generateKey(
        cacheConfig.category,
        endpoint,
        JSON.stringify(body ?? ''),
      );
      this.cache.set(cacheKey, result, cacheConfig.category);
    }

    return result;
  }

  invalidate(pattern: string): void {
    this.cache.invalidate(pattern);
  }

  clearCaches(): void {
    this.cache.clear();
    this.transport.clearQueue();
  }
}
