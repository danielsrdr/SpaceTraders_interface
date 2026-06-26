import { ShipNavRoute, ShipNavRouteWaypoint, ShipData } from '../../models/ship.model';
import {
  clearStableTransitProgress,
  evictStableTransitProgressOnRefresh,
  formatRouteEta,
  getStableTransitProgress,
  getTransitProgress,
  resolveWaypointType,
  shipOrbitOffset,
} from './planet-helpers';

function ship(symbol: string, route: ShipNavRoute | undefined, status: string): ShipData {
  return {
    symbol,
    registration: { name: symbol, factionSymbol: 'TEST', role: 'EXPLORER' },
    nav: {
      systemSymbol: 'X1-TEST',
      waypointSymbol: route?.destination.symbol ?? 'X1-TEST-A',
      route,
      status,
      flightMode: 'CRUISE',
    },
    fuel: { current: 100, capacity: 100 },
  } as ShipData;
}

function waypoint(symbol: string): ShipNavRouteWaypoint {
  return { symbol, type: 'PLANET', systemSymbol: 'X1-TEST', x: 0, y: 0 };
}

function route(departureMs: number, arrivalMs: number): ShipNavRoute {
  return {
    origin: waypoint('X1-TEST-A'),
    destination: waypoint('X1-TEST-B'),
    departureTime: new Date(departureMs).toISOString(),
    arrival: new Date(arrivalMs).toISOString(),
  };
}

describe('getTransitProgress', () => {
  it('returns 0 at departure and 1 at arrival', () => {
    const r = route(1000, 2000);
    expect(getTransitProgress(r, 1000)).toBe(0);
    expect(getTransitProgress(r, 2000)).toBe(1);
  });

  it('interpolates linearly in the middle of the leg', () => {
    const r = route(0, 1000);
    expect(getTransitProgress(r, 250)).toBeCloseTo(0.25, 10);
    expect(getTransitProgress(r, 500)).toBeCloseTo(0.5, 10);
  });

  it('clamps to [0, 1] outside the leg window', () => {
    const r = route(1000, 2000);
    expect(getTransitProgress(r, 0)).toBe(0);
    expect(getTransitProgress(r, 9999)).toBe(1);
  });

  it('returns 1 for a degenerate (non-advancing) route', () => {
    expect(getTransitProgress(route(2000, 2000), 2000)).toBe(1);
  });
});

describe('shipOrbitOffset', () => {
  it('places a lone ship at a fixed vertical offset', () => {
    expect(shipOrbitOffset(0, 1, 20)).toEqual({ x: 0, y: 12 });
  });

  it('spreads multiple ships evenly around the ring at the given radius', () => {
    const radius = 18;
    const total = 4;
    for (let i = 0; i < total; i++) {
      const { x, y } = shipOrbitOffset(i, total, radius);
      expect(Math.hypot(x, y)).toBeCloseTo(radius, 6);
    }
  });
});

describe('resolveWaypointType', () => {
  it('passes through known canonical types', () => {
    expect(resolveWaypointType('PLANET')).toBe('PLANET');
    expect(resolveWaypointType('GAS_GIANT')).toBe('GAS_GIANT');
  });

  it('normalizes casing and synonyms', () => {
    expect(resolveWaypointType('engineered asteroid')).toBe('ENGINEERED_ASTEROID');
    expect(resolveWaypointType('some asteroid field')).toBe('ASTEROID_FIELD');
    expect(resolveWaypointType('a jump point')).toBe('JUMP_GATE');
  });
});

describe('formatRouteEta', () => {
  it('renders an em dash when there is no route', () => {
    expect(formatRouteEta(undefined)).toBe('—');
  });

  it('formats seconds and minutes remaining', () => {
    const now = 0;
    expect(formatRouteEta(route(0, 30_000), now)).toBe('30s');
    expect(formatRouteEta(route(0, 90_000), now)).toBe('1m 30s');
  });

  it('reports arrival once the window has elapsed', () => {
    expect(formatRouteEta(route(0, 1000), 5000)).toBe('Arriving…');
  });
});

describe('getStableTransitProgress', () => {
  beforeEach(() => {
    clearStableTransitProgress();
  });

  it('never decreases when the same leg is polled with a later departure', () => {
    const earlyDep = route(0, 10_000);
    const s1 = ship('S1', earlyDep, 'IN_TRANSIT');
    expect(getStableTransitProgress(s1, 5000)).toBeCloseTo(0.5, 10);

    const lateDep = route(2500, 10_000);
    const s2 = ship('S1', lateDep, 'IN_TRANSIT');
    evictStableTransitProgressOnRefresh([s1], [s2]);
    expect(getStableTransitProgress(s2, 5000)).toBeCloseTo(0.5, 10);
  });

  it('advances normally when raw progress increases', () => {
    const r = route(0, 10_000);
    const s = ship('S1', r, 'IN_TRANSIT');
    expect(getStableTransitProgress(s, 3000)).toBeCloseTo(0.3, 10);
    expect(getStableTransitProgress(s, 6000)).toBeCloseTo(0.6, 10);
  });

  it('clears cache when the ship leaves transit', () => {
    const r = route(0, 10_000);
    const inTransit = ship('S1', r, 'IN_TRANSIT');
    getStableTransitProgress(inTransit, 5000);

    clearStableTransitProgress('S1');
    const docked = ship('S1', undefined, 'IN_ORBIT');
    expect(getStableTransitProgress(docked, 5000)).toBe(0);
  });

  it('resets when the transit leg changes', () => {
    const legA = route(0, 10_000);
    getStableTransitProgress(ship('S1', legA, 'IN_TRANSIT'), 5000);

    clearStableTransitProgress('S1');
    const legB: ShipNavRoute = {
      origin: waypoint('X1-TEST-C'),
      destination: waypoint('X1-TEST-D'),
      departureTime: new Date(0).toISOString(),
      arrival: new Date(10_000).toISOString(),
    };
    expect(getStableTransitProgress(ship('S1', legB, 'IN_TRANSIT'), 2500)).toBeCloseTo(0.25, 10);
  });
});
