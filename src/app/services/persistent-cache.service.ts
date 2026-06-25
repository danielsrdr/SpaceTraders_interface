import { Injectable } from '@angular/core';

export interface PersistedEntry {
  key: string;
  data: unknown;
  timestamp: number;
  ttl: number;
  category: string;
}

const DB_NAME = 'skamkraft-cache';
const STORE_NAME = 'entries';
const DB_VERSION = 1;

/**
 * IndexedDB-backed L2 store for the in-memory cache. Used to persist explored
 * systems/markets/waypoints across reloads so they can be replayed offline.
 * All methods degrade to no-ops when IndexedDB is unavailable.
 */
@Injectable({ providedIn: 'root' })
export class PersistentCacheService {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private openDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  async loadAll(): Promise<PersistedEntry[]> {
    const db = await this.openDb();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve((request.result as PersistedEntry[]) ?? []);
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async put(entry: PersistedEntry): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry);
    } catch {
      // Ignore write failures (quota, etc.).
    }
  }

  async delete(key: string): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
    } catch {
      // Ignore.
    }
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
    } catch {
      // Ignore.
    }
  }
}
