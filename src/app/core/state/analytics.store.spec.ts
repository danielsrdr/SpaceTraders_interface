import {
  computeFuelBurned,
  computeFuelByShip,
  computeNetCredits,
  computeRevenueBuckets,
  computeRevenuePerHour,
  computeTopRoutes,
  StatEvent,
} from './analytics.store';

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

function event(partial: Omit<StatEvent, 't' | 'ship'> & { t?: number; ship?: string }): StatEvent {
  return {
    t: partial.t ?? NOW,
    ship: partial.ship ?? 'SHIP-1',
    kind: partial.kind,
    credits: partial.credits,
    fuel: partial.fuel,
    origin: partial.origin,
    destination: partial.destination,
    good: partial.good,
    units: partial.units,
  };
}

describe('computeRevenuePerHour', () => {
  it('returns gross positive credits divided by window hours', () => {
    const events: StatEvent[] = [
      event({ kind: 'sell', credits: 1200, t: NOW - 30 * 60_000 }),
      event({ kind: 'buy', credits: -200, t: NOW - 15 * 60_000 }),
    ];
    expect(computeRevenuePerHour(events, 1, NOW)).toBe(1200);
  });

  it('ignores events outside the window', () => {
    const events: StatEvent[] = [event({ kind: 'sell', credits: 5000, t: NOW - 3 * HOUR })];
    expect(computeRevenuePerHour(events, 1, NOW)).toBe(0);
  });
});

describe('computeNetCredits', () => {
  it('sums signed credit deltas in the window', () => {
    const events: StatEvent[] = [
      event({ kind: 'sell', credits: 1000 }),
      event({ kind: 'buy', credits: -300 }),
    ];
    expect(computeNetCredits(events, 24, NOW)).toBe(700);
  });
});

describe('computeRevenueBuckets', () => {
  it('places gross revenue into time buckets', () => {
    const events: StatEvent[] = [event({ kind: 'sell', credits: 500, t: NOW - 30 * 60_000 })];
    const buckets = computeRevenueBuckets(events, 1, 4, NOW);
    expect(buckets.length).toBe(4);
    expect(buckets.some((b) => b.gross === 500)).toBe(true);
  });
});

describe('computeFuelBurned', () => {
  it('sums navigate fuel in the window', () => {
    const events: StatEvent[] = [
      event({ kind: 'navigate', fuel: 12, t: NOW - 10 * 60_000 }),
      event({ kind: 'refuel', fuel: 50, t: NOW - 5 * 60_000 }),
    ];
    expect(computeFuelBurned(events, 1, NOW)).toBe(12);
  });
});

describe('computeFuelByShip', () => {
  it('ranks ships by fuel consumed', () => {
    const events: StatEvent[] = [
      event({ kind: 'navigate', ship: 'A', fuel: 5 }),
      event({ kind: 'navigate', ship: 'B', fuel: 20 }),
      event({ kind: 'navigate', ship: 'A', fuel: 3 }),
    ];
    const stats = computeFuelByShip(events, 24, NOW);
    expect(stats[0]?.ship).toBe('B');
    expect(stats[1]?.fuel).toBe(8);
  });
});

describe('computeTopRoutes', () => {
  it('counts origin-destination pairs by frequency', () => {
    const events: StatEvent[] = [
      event({ kind: 'navigate', origin: 'A', destination: 'B', fuel: 1 }),
      event({ kind: 'navigate', origin: 'A', destination: 'B', fuel: 2 }),
      event({ kind: 'navigate', origin: 'C', destination: 'D', fuel: 1 }),
    ];
    const routes = computeTopRoutes(events, 5, 24, NOW);
    expect(routes[0]?.key).toBe('A>B');
    expect(routes[0]?.count).toBe(2);
    expect(routes[0]?.fuel).toBe(3);
  });

  it('ignores navigate events without both endpoints', () => {
    const events: StatEvent[] = [event({ kind: 'navigate', destination: 'B', fuel: 1 })];
    expect(computeTopRoutes(events, 5, 24, NOW)).toEqual([]);
  });
});
