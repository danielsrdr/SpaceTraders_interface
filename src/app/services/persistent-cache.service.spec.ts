import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PersistentCacheService } from './persistent-cache.service';

describe('PersistentCacheService', () => {
  const originalIndexedDb = globalThis.indexedDB;

  afterEach(() => {
    TestBed.resetTestingModule();
    if (originalIndexedDb === undefined) {
      // @ts-expect-error restore missing IndexedDB in jsdom
      delete globalThis.indexedDB;
    } else {
      globalThis.indexedDB = originalIndexedDb;
    }
    vi.restoreAllMocks();
  });

  it('returns an empty list when IndexedDB is unavailable', async () => {
    // @ts-expect-error simulate environments without IndexedDB
    delete globalThis.indexedDB;
    TestBed.configureTestingModule({ providers: [PersistentCacheService] });
    const service = TestBed.inject(PersistentCacheService);

    await expect(service.loadAll()).resolves.toEqual([]);
    await expect(
      service.put({ key: 'k', data: 1, timestamp: 0, ttl: 1, category: 'c' }),
    ).resolves.toBeUndefined();
    await expect(service.delete('k')).resolves.toBeUndefined();
    await expect(service.clear()).resolves.toBeUndefined();
  });

  it('persists entries through loadAll, put, delete, and clear', async () => {
    const records = new Map<string, unknown>();

    const fakeStore = {
      getAll: () => {
        const request = {
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
          result: [...records.values()],
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
      put: (entry: { key: string }) => {
        records.set(entry.key, entry);
      },
      delete: (key: string) => {
        records.delete(key);
      },
      clear: () => {
        records.clear();
      },
    };

    const fakeDb = {
      objectStoreNames: { contains: () => false },
      createObjectStore: () => fakeStore,
      transaction: () => ({
        objectStore: () => fakeStore,
      }),
    };

    globalThis.indexedDB = {
      open: () => {
        const request = {
          result: fakeDb,
          onupgradeneeded: null as (() => void) | null,
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
        };
        queueMicrotask(() => {
          request.onupgradeneeded?.({} as IDBVersionChangeEvent);
          request.onsuccess?.({} as Event);
        });
        return request as IDBOpenDBRequest;
      },
    } as IDBFactory;

    TestBed.configureTestingModule({ providers: [PersistentCacheService] });
    const service = TestBed.inject(PersistentCacheService);
    const entry = {
      key: 'systems:X1',
      data: { symbol: 'X1' },
      timestamp: 1,
      ttl: 1000,
      category: 'systems',
    };

    await service.put(entry);
    await expect(service.loadAll()).resolves.toEqual([entry]);

    await service.delete(entry.key);
    await expect(service.loadAll()).resolves.toEqual([]);

    await service.put(entry);
    await service.clear();
    await expect(service.loadAll()).resolves.toEqual([]);
  });
});
