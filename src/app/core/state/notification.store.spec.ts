import { describe, expect, it } from 'vitest';

const MAX_ENTRIES = 100;

function trimEntries<T>(list: T[]): T[] {
  return list.length > MAX_ENTRIES ? list.slice(list.length - MAX_ENTRIES) : list;
}

describe('NotificationStore trim logic', () => {
  it('caps list at 100 entries', () => {
    const list = Array.from({ length: 105 }, (_, i) => i);
    expect(trimEntries(list)).toHaveLength(100);
    expect(trimEntries(list)[0]).toBe(5);
  });

  it('tracks unread until marked read', () => {
    const entries = [{ read: false }, { read: false }];
    expect(entries.filter((e) => !e.read).length).toBe(2);
    const read = entries.map((e) => ({ ...e, read: true }));
    expect(read.filter((e) => !e.read).length).toBe(0);
  });
});
