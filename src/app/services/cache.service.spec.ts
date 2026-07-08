import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SPACETRADERS_CONFIG, defaultSpaceTradersConfig } from '../core/config/spacetraders.config';
import { OnlineStatusService } from '../shared/services/online-status.service';
import { CacheService } from './cache.service';
import { PersistentCacheService } from './persistent-cache.service';

describe('CacheService', () => {
  let service: CacheService;
  let onlineStatus: OnlineStatusService;
  let persistent: {
    loadAll: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    persistent = {
      loadAll: vi.fn().mockResolvedValue([]),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        CacheService,
        OnlineStatusService,
        { provide: SPACETRADERS_CONFIG, useValue: defaultSpaceTradersConfig },
        { provide: PersistentCacheService, useValue: persistent },
      ],
    });

    service = TestBed.inject(CacheService);
    onlineStatus = TestBed.inject(OnlineStatusService);
  });

  it('generates stable keys from category and identifiers', () => {
    expect(service.generateKey('systems', 'X1', 'waypoints')).toBe('systems:X1:waypoints');
  });

  it('stores and retrieves fresh entries', () => {
    const key = service.generateKey('agent', '/my/agent');
    service.set(key, { credits: 100 }, 'agent');
    expect(service.get<{ credits: number }>(key)).toEqual({ credits: 100 });
    expect(service.getStats().hits).toBe(1);
    expect(persistent.put).toHaveBeenCalled();
  });

  it('returns null for missing keys and tracks misses', () => {
    expect(service.get('missing')).toBeNull();
    expect(service.getStats().misses).toBe(1);
  });

  it('expires stale entries when online', () => {
    vi.spyOn(onlineStatus, 'isOnline').mockReturnValue(true);
    const key = 'status:/';
    service.set(key, { status: 'OK' }, 'status', 1);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10);
    expect(service.get(key)).toBeNull();
    expect(persistent.delete).toHaveBeenCalledWith(key);
  });

  it('serves stale entries when offline', () => {
    vi.spyOn(onlineStatus, 'isOnline').mockReturnValue(false);
    const key = 'systems:X1';
    service.set(key, { symbol: 'X1' }, 'systems', 1);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
    expect(service.get<{ symbol: string }>(key)).toEqual({ symbol: 'X1' });
    expect(service.getStats().hits).toBe(1);
  });

  it('invalidates keys matching a pattern', () => {
    service.set('contracts:1', { id: '1' }, 'contracts');
    service.set('contracts:2', { id: '2' }, 'contracts');
    service.set('agent:me', { credits: 1 }, 'agent');
    service.invalidate('contracts');
    expect(service.get('contracts:1')).toBeNull();
    expect(service.get('contracts:2')).toBeNull();
    expect(service.get('agent:me')).toEqual({ credits: 1 });
  });

  it('clears memory and persistent storage', () => {
    service.set('systems:X1', { symbol: 'X1' }, 'systems');
    service.clear();
    expect(service.get('systems:X1')).toBeNull();
    expect(persistent.clear).toHaveBeenCalled();
  });

  it('removes expired entries during cleanup', () => {
    service.set('fresh', { ok: true }, 'default', 60_000);
    service.set('stale', { ok: false }, 'default', 1);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10);
    expect(service.cleanup()).toBe(1);
    expect(service.get('fresh')).toEqual({ ok: true });
    expect(service.get('stale')).toBeNull();
  });
});
