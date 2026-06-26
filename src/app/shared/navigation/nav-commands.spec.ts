import { describe, expect, it } from 'vitest';

function searchCommands(
  items: { id: string; label: string; keywords: string[] }[],
  query: string,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.map((i) => i.id);
  return items
    .filter((item) => {
      const haystack = [item.label, ...item.keywords].join(' ').toLowerCase();
      return haystack.includes(q);
    })
    .map((i) => i.id);
}

describe('nav command search', () => {
  const items = [
    { id: 'home', label: 'Home', keywords: ['start', 'welcome'] },
    { id: 'systems', label: 'Systems', keywords: ['map', 'flight'] },
    { id: 'contracts', label: 'Contracts', keywords: ['missions'] },
  ];

  it('returns all when query empty', () => {
    expect(searchCommands(items, '')).toEqual(['home', 'systems', 'contracts']);
  });

  it('filters by label and keywords', () => {
    expect(searchCommands(items, 'mission')).toEqual(['contracts']);
    expect(searchCommands(items, 'map')).toEqual(['systems']);
  });
});
