import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LogbookStore, logCategoryClass, LogCategory } from './logbook.store';
import { SpaceTradersApiService } from '../../services/spacetraders-api.service';

const AGENT = 'Logbook-Pilot';
const STORAGE_KEY = `st_logbook_${AGENT}`;

describe('logCategoryClass', () => {
  const cases: [LogCategory, string][] = [
    ['extract', 'text-cyan-300'],
    ['siphon', 'text-violet-300'],
    ['trade', 'text-amber-300'],
    ['refuel', 'text-sky-300'],
    ['contract', 'text-emerald-300'],
    ['navigate', 'text-slate-300'],
    ['surface', 'text-lime-300'],
  ];

  it.each(cases)('maps %s to %s', (category, expected) => {
    expect(logCategoryClass(category)).toBe(expected);
  });
});

describe('LogbookStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        LogbookStore,
        {
          provide: SpaceTradersApiService,
          useValue: {
            getStatus: vi.fn().mockResolvedValue({ resetDate: '2024-01-01T00:00:00.000Z' }),
          },
        },
      ],
    });
  });

  it('appends entries and persists them', async () => {
    const store = TestBed.inject(LogbookStore);
    await store.attach(AGENT);
    store.append({ category: 'trade', message: 'Sold 10 IRON' });

    expect(store.count()).toBe(1);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)[0]?.message).toBe('Sold 10 IRON');
  });

  it('caps entries at 200', async () => {
    const store = TestBed.inject(LogbookStore);
    await store.attach(AGENT);
    for (let i = 0; i < 205; i++) {
      store.append({ category: 'navigate', message: `Entry ${i}` });
    }
    expect(store.count()).toBe(200);
    expect(store.entries()[0]?.message).toBe('Entry 5');
  });

  it('recent returns the last n entries oldest-first', async () => {
    const store = TestBed.inject(LogbookStore);
    await store.attach(AGENT);
    store.append({ category: 'refuel', message: 'First' });
    store.append({ category: 'refuel', message: 'Second' });
    store.append({ category: 'refuel', message: 'Third' });
    expect(store.recent(2).map((e) => e.message)).toEqual(['Second', 'Third']);
  });

  it('clear removes persisted history', async () => {
    const store = TestBed.inject(LogbookStore);
    await store.attach(AGENT);
    store.append({ category: 'contract', message: 'Contract signed' });
    store.clear();
    expect(store.count()).toBe(0);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[]');
  });

  it('detach clears in-memory entries but keeps disk history', async () => {
    const store = TestBed.inject(LogbookStore);
    await store.attach(AGENT);
    store.append({ category: 'surface', message: 'Landed' });
    store.detach();
    expect(store.count()).toBe(0);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
  });
});
