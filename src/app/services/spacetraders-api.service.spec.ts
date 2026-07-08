import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SPACETRADERS_CONFIG, SpaceTradersConfig, defaultSpaceTradersConfig } from '../core/config/spacetraders.config';
import { API_ENDPOINTS } from '../models/api-endpoints.data';
import { CacheService } from './cache.service';
import { RateLimiterService } from './rate-limiter.service';
import { SpaceTradersApiService } from './spacetraders-api.service';
import { TokenStorageService } from './token-storage.service';
import { AgentApiService } from '../core/api/agent-api.service';
import { ApiErrorHandlerService } from '../core/api/api-error-handler.service';
import { ApiRequestService } from '../core/api/api-request.service';
import { SpaceTradersHttpTransportService } from '../core/api/spacetraders-http-transport.service';

const testConfig: SpaceTradersConfig = {
  ...defaultSpaceTradersConfig,
  rateLimit: { requestsPerSecond: 100, burstLimit: 10 },
  retry: {
    ...defaultSpaceTradersConfig.retry,
    baseDelay: 5,
    maxDelay: 20,
  },
};

function createCacheMock() {
  const store = new Map<string, unknown>();
  return {
    generateKey: (category: string, ...identifiers: string[]) =>
      `${category}:${identifiers.join(':')}`,
    get: vi.fn(<T>(key: string): T | null => (store.has(key) ? (store.get(key) as T) : null)),
    set: vi.fn((key: string, data: unknown) => {
      store.set(key, data);
    }),
    invalidate: vi.fn(),
    clear: vi.fn(() => store.clear()),
    _store: store,
  };
}

describe('SpaceTradersApiService', () => {
  let service: SpaceTradersApiService;
  let httpMock: HttpTestingController;
  let cache: ReturnType<typeof createCacheMock>;
  let rateLimiter: RateLimiterService;
  let tokenStorage: TokenStorageService;
  let enqueueSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    cache = createCacheMock();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        SpaceTradersApiService,
        ApiRequestService,
        SpaceTradersHttpTransportService,
        ApiErrorHandlerService,
        AgentApiService,
        RateLimiterService,
        TokenStorageService,
        { provide: SPACETRADERS_CONFIG, useValue: testConfig },
        { provide: CacheService, useValue: cache },
      ],
    });

    service = TestBed.inject(SpaceTradersApiService);
    httpMock = TestBed.inject(HttpTestingController);
    rateLimiter = TestBed.inject(RateLimiterService);
    tokenStorage = TestBed.inject(TokenStorageService);
    enqueueSpy = vi.spyOn(rateLimiter, 'enqueue').mockImplementation((request) => request());
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('bypasses the rate limiter on cached GET responses', async () => {
    const payload = { status: 'OK', version: 'v2' };
    const cacheKey = cache.generateKey('status', '/', JSON.stringify(''));
    cache._store.set(cacheKey, payload);
    cache.get.mockReturnValue(payload);

    const result = await service.getStatus();

    expect(result).toEqual(payload);
    expect(enqueueSpy).not.toHaveBeenCalled();
    httpMock.expectNone(`${testConfig.host}/`);
  });

  it('omits Authorization when auth is not required', async () => {
    const resultPromise = service.getFactions();

    const req = httpMock.expectOne(`${testConfig.host}/factions?page=1&limit=20`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ data: [] });

    await expect(resultPromise).resolves.toEqual([]);
  });

  it('sends Authorization when a stored token is present', async () => {
    tokenStorage.setToken('player-token');

    const resultPromise = service.getAgent();

    const req = httpMock.expectOne(`${testConfig.host}/my/agent`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer player-token');
    req.flush({
      data: {
        symbol: 'PLAYER',
        credits: 1000,
        startingFaction: 'COSMIC',
        headquarters: 'X1-TEST',
        shipCount: 1,
      },
    });

    const agent = await resultPromise;
    expect(agent.name).toBe('PLAYER');
  });

  it('uses bearerToken with requiresAuth false for register', async () => {
    const resultPromise = service.register('PLAYER', 'COSMIC', 'account-token');

    const req = httpMock.expectOne(`${testConfig.host}/register`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer account-token');
    expect(req.request.body).toEqual({ symbol: 'PLAYER', faction: 'COSMIC' });
    req.flush({
      data: {
        agent: {
          symbol: 'PLAYER',
          credits: 175000,
          startingFaction: 'COSMIC',
          headquarters: 'X1-TEST',
          shipCount: 2,
        },
        token: 'new-agent-token',
      },
    });

    const agent = await resultPromise;
    expect(agent.name).toBe('PLAYER');
  });

  it('retries retryable HTTP statuses before succeeding', async () => {
    vi.useFakeTimers();
    enqueueSpy.mockRestore();
    tokenStorage.setToken('player-token');

    const resultPromise = service.getAgent();

    const first = httpMock.expectOne(`${testConfig.host}/my/agent`);
    first.flush(
      { error: { message: 'Slow down' } },
      { status: 429, statusText: 'Too Many Requests' },
    );

    await vi.advanceTimersByTimeAsync(testConfig.retry.baseDelay);

    const second = httpMock.expectOne(`${testConfig.host}/my/agent`);
    second.flush({
      data: {
        symbol: 'PLAYER',
        credits: 1000,
        startingFaction: 'COSMIC',
        headquarters: 'X1-TEST',
        shipCount: 1,
      },
    });

    const agent = await resultPromise;
    expect(agent.name).toBe('PLAYER');
    vi.useRealTimers();
  });

  it('retries server errors before succeeding', async () => {
    vi.useFakeTimers();
    enqueueSpy.mockRestore();
    tokenStorage.setToken('player-token');

    const resultPromise = service.getAgent();

    const first = httpMock.expectOne(`${testConfig.host}/my/agent`);
    first.flush('Server error', { status: 503, statusText: 'Service Unavailable' });

    await vi.advanceTimersByTimeAsync(testConfig.retry.baseDelay);

    const second = httpMock.expectOne(`${testConfig.host}/my/agent`);
    second.flush({
      data: {
        symbol: 'PLAYER',
        credits: 1000,
        startingFaction: 'COSMIC',
        headquarters: 'X1-TEST',
        shipCount: 1,
      },
    });

    await expect(resultPromise).resolves.toMatchObject({ name: 'PLAYER' });
    vi.useRealTimers();
  });

  it('callEndpoint returns status and data instead of throwing', async () => {
    tokenStorage.setToken('player-token');
    const endpoint = API_ENDPOINTS.find((e) => e.operationId === 'get-my-agent');
    expect(endpoint).toBeDefined();

    const resultPromise = service.callEndpoint(endpoint!);

    const req = httpMock.expectOne(`${testConfig.host}/my/agent`);
    req.flush(
      { error: { message: 'Agent not found' } },
      { status: 404, statusText: 'Not Found' },
    );

    const result = await resultPromise;
    expect(result.status).toBe(404);
    expect(result.data).toEqual({ error: 'Agent not found' });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('callEndpoint returns success payload without throwing', async () => {
    tokenStorage.setToken('player-token');
    const endpoint = API_ENDPOINTS.find((e) => e.operationId === 'get-status');
    expect(endpoint).toBeDefined();

    const resultPromise = service.callEndpoint(endpoint!);

    const req = httpMock.expectOne(`${testConfig.host}/`);
    req.flush({ status: 'OK', version: 'v2' });

    const result = await resultPromise;
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ status: 'OK', version: 'v2' });
  });

  it('throws when auth is required but no token is available', async () => {
    tokenStorage.clearToken();
    await expect(service.getAgent()).rejects.toThrow('Authentication required. Please login first.');
    httpMock.expectNone(`${testConfig.host}/my/agent`);
  });
});
