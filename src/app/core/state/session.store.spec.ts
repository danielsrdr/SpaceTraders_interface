import { describe, expect, it, beforeEach, afterEach } from 'vitest';

const STORAGE_PREFIX = 'sk_session_';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const IGNORED_ROUTES = new Set(['/login', '/register', '/home']);

interface SessionSnapshot {
  route: string;
  queryParams?: Record<string, string>;
  timestamp: number;
}

function shouldPersist(route: string): boolean {
  return !IGNORED_ROUTES.has(route);
}

function isValidSnapshot(snap: SessionSnapshot | null, now = Date.now()): boolean {
  if (!snap?.route || !snap.timestamp) return false;
  return now - snap.timestamp < MAX_AGE_MS;
}

describe('SessionStore rules', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('persists snapshot to localStorage', () => {
    const snap: SessionSnapshot = {
      route: '/systems',
      queryParams: { name: 'X1-Y1' },
      timestamp: Date.now(),
    };
    localStorage.setItem(`${STORAGE_PREFIX}TESTAGENT`, JSON.stringify(snap));
    const loaded = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}TESTAGENT`)!) as SessionSnapshot;
    expect(loaded.route).toBe('/systems');
    expect(isValidSnapshot(loaded)).toBe(true);
  });

  it('ignores login and home routes', () => {
    expect(shouldPersist('/login')).toBe(false);
    expect(shouldPersist('/home')).toBe(false);
    expect(shouldPersist('/systems')).toBe(true);
  });

  it('rejects expired snapshots', () => {
    const snap: SessionSnapshot = {
      route: '/contracts',
      timestamp: Date.now() - MAX_AGE_MS - 1,
    };
    expect(isValidSnapshot(snap)).toBe(false);
  });
});
