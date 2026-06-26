import { Vector3 } from 'three';
import { ShipData } from '../../../models/ship.model';
import { ShipDynamicsEngine } from './ship-dynamics.engine';

function makeTransitShip(): ShipData {
  return {
    symbol: 'TEST-1',
    registration: { name: 'Test', factionSymbol: 'A', role: 'EXPLORER' },
    nav: {
      systemSymbol: 'X1',
      waypointSymbol: 'B',
      status: 'IN_TRANSIT',
      flightMode: 'CRUISE',
      route: {
        origin: { symbol: 'A', type: 'PLANET', systemSymbol: 'X1', x: 0, y: 0 },
        destination: { symbol: 'B', type: 'PLANET', systemSymbol: 'X1', x: 10, y: 0 },
        departureTime: '2020-01-01T00:00:00Z',
        arrival: '2020-01-01T01:00:00Z',
      },
    },
    crew: { current: 1, capacity: 2, required: 1, morale: 100 },
    frame: {
      name: 'F',
      description: '',
      fuelCapacity: 100,
      condition: 100,
      requirements: { power: 1, crew: 1 },
    },
    reactor: {
      name: 'R',
      description: '',
      condition: 100,
      powerOutput: 10,
      requirements: { crew: 1 },
    },
    fuel: { current: 50, capacity: 100, consumed: { amount: 0, timestamp: '' } },
  };
}

describe('ShipDynamicsEngine', () => {
  it('samples transit endpoints at t=0 and t=1', () => {
    const engine = new ShipDynamicsEngine();
    const ship = makeTransitShip();
    const origin = new Vector3(0, 0, 0);
    const dest = new Vector3(100, 0, 0);

    const start = engine.sampleTransit(ship, origin, dest, 0);
    const end = engine.sampleTransit(ship, origin, dest, 1);

    expect(start.position.distanceTo(origin)).toBeLessThan(1);
    expect(end.position.distanceTo(dest)).toBeLessThan(1);
  });

  it('rebuilds transit path when orbital endpoints move', () => {
    const engine = new ShipDynamicsEngine();
    const ship = makeTransitShip();
    const origin = new Vector3(0, 0, 0);
    const destA = new Vector3(100, 0, 0);
    const destB = new Vector3(0, 0, 100);

    const endAtA = engine.sampleTransit(ship, origin, destA, 1);
    expect(endAtA.position.distanceTo(destA)).toBeLessThan(1);
    expect(endAtA.position.distanceTo(destB)).toBeGreaterThan(10);

    const endAtB = engine.sampleTransit(ship, origin, destB, 1);
    expect(endAtB.position.distanceTo(destB)).toBeLessThan(1);
    expect(endAtB.position.distanceTo(destA)).toBeGreaterThan(10);
  });

  it('produces circular IN_ORBIT motion over time', () => {
    const engine = new ShipDynamicsEngine();
    const parent = new Vector3(50, 0, 50);
    const p0 = engine.sampleOrbit('S', parent, 6_000, 3e-6, 0, 0, 1);
    const p1 = engine.sampleOrbit('S', parent, 6_000, 3e-6, 30, 0, 1);
    expect(p0.distanceTo(parent)).toBeCloseTo(p1.distanceTo(parent), 3);
    expect(p0.distanceTo(p1)).toBeGreaterThan(0.01);
  });

  it('distinguishes DOCKED from IN_ORBIT via resolvePose', () => {
    const engine = new ShipDynamicsEngine();
    const ship = makeTransitShip();
    ship.nav.status = 'DOCKED';
    ship.nav.route = undefined;
    const parent = new Vector3(0, 0, 0);

    const docked = engine.resolvePose(
      ship,
      null,
      null,
      parent,
      6_000,
      3e-6,
      0,
      0,
      0,
      1,
    );

    ship.nav.status = 'IN_ORBIT';
    const orbiting = engine.resolvePose(
      ship,
      null,
      null,
      parent,
      6_000,
      3e-6,
      15,
      0,
      0,
      1,
    );

    expect(docked.position.distanceTo(orbiting.position)).toBeGreaterThan(0.01);
  });
});
