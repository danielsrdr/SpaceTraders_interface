import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPACETRADERS_CONFIG, defaultSpaceTradersConfig } from '../core/config/spacetraders.config';
import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        RateLimiterService,
        { provide: SPACETRADERS_CONFIG, useValue: defaultSpaceTradersConfig },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('processes enqueued requests and returns their results', async () => {
    const service = TestBed.inject(RateLimiterService);
    const promise = service.enqueue(async () => 'ok');
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('ok');
  });

  it('enforces minimum interval between consecutive requests', async () => {
    const service = TestBed.inject(RateLimiterService);
    const order: number[] = [];

    const first = service.enqueue(async () => {
      order.push(1);
      return 1;
    });
    const second = service.enqueue(async () => {
      order.push(2);
      return 2;
    });

    await vi.runAllTimersAsync();
    await Promise.all([first, second]);

    expect(order).toEqual([1, 2]);
    expect(service.getStatus().totalRequests).toBe(2);
  });

  it('rejects pending queue items when cleared', async () => {
    vi.useRealTimers();
    const service = TestBed.inject(RateLimiterService);
    let releaseBlocker!: () => void;
    const blocker = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });

    const slow = service.enqueue(async () => {
      await blocker;
      return 'slow';
    });
    await Promise.resolve();

    const pending = service.enqueue(async () => 'pending');
    service.clearQueue();

    await expect(pending).rejects.toThrow('Queue cleared');
    releaseBlocker();
    await expect(slow).resolves.toBe('slow');
  });

  it('reports queue status', async () => {
    const service = TestBed.inject(RateLimiterService);
    expect(service.getStatus()).toMatchObject({
      queueLength: 0,
      isProcessing: false,
      totalRequests: 0,
      requestsPerSecond: defaultSpaceTradersConfig.rateLimit.requestsPerSecond,
    });
  });
});
