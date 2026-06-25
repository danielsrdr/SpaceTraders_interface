import { inject, Injectable } from '@angular/core';
import { SPACETRADERS_CONFIG } from '../core/config/spacetraders.config';

@Injectable({ providedIn: 'root' })
export class RateLimiterService {
  private readonly config = inject(SPACETRADERS_CONFIG);
  private readonly queue: Array<{
    request: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = [];
  private isProcessing = false;
  private lastRequestTime = 0;
  private requestCount = 0;
  private readonly minInterval = 1000 / this.config.rateLimit.requestsPerSecond;

  async enqueue<T>(request: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        request: request as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const elapsed = Date.now() - this.lastRequestTime;
      if (elapsed < this.minInterval) {
        await this.sleep(this.minInterval - elapsed);
      }

      const item = this.queue.shift();
      if (!item) continue;

      this.lastRequestTime = Date.now();
      this.requestCount++;

      try {
        const result = await item.request();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
    }

    this.isProcessing = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      totalRequests: this.requestCount,
      requestsPerSecond: 1000 / this.minInterval,
    };
  }

  clearQueue(): void {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item?.reject(new Error('Queue cleared'));
    }
  }
}
