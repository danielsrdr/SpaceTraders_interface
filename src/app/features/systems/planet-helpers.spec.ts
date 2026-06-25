import { ShipNavRoute, ShipNavRouteWaypoint } from '../../models/ship.model';
import {
  formatRouteEta,
  getTransitProgress,
  resolveWaypointType,
  shipOrbitOffset,
} from './planet-helpers';

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
