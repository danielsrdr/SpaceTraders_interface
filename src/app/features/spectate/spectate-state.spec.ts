import type { PlanetView } from '../../models/system.model';
import type { ShipData } from '../../models/ship.model';
import {
  buildSnapshot,
  decodeSnapshot,
  encodeSnapshot,
  toPlanetViews,
  toShipData,
  type SnapshotInput,
} from './spectate-state';

function planet(name: string, x: number, y: number, orbits?: string): PlanetView {
  return {
    name,
    type: 'PLANET',
    system: 'X1-AA',
    position: { x, y },
    orbits,
    traits: [{ symbol: 'MARKETPLACE', name: 'Marketplace' }],
  };
}

function ship(symbol: string): ShipData {
  return {
    symbol,
    cargo: { capacity: 60, units: 12, inventory: [] },
    registration: { name: symbol, factionSymbol: 'COSMIC', role: 'COMMAND' },
    nav: {
      systemSymbol: 'X1-AA',
      waypointSymbol: 'X1-AA-A',
      status: 'IN_ORBIT',
      flightMode: 'CRUISE',
    },
    crew: { current: 1, capacity: 2, required: 1, morale: 100 },
    frame: {
      name: 'FRAME',
      description: '',
      fuelCapacity: 400,
      condition: 0.9,
      requirements: { power: 1, crew: 1 },
    },
    reactor: {
      name: 'REACTOR',
      description: '',
      condition: 1,
      powerOutput: 10,
      requirements: { crew: 1 },
    },
    fuel: { current: 320, capacity: 400, consumed: { amount: 0, timestamp: '' } },
  };
}

function sampleInput(): SnapshotInput {
  return {
    systemSymbol: 'X1-AA',
    systemName: 'Alpha',
    planets: [planet('X1-AA-A', 10, 20), planet('X1-AA-B', -5, 5, 'X1-AA-A')],
    ships: [ship('X1-AA-1')],
    captain: { name: 'CAPT', faction: 'COSMIC' },
  };
}

describe('spectate-state codec', () => {
  it('round-trips a snapshot, preserving planets, ships, and captain', async () => {
    const snapshot = buildSnapshot(sampleInput());
    const payload = await encodeSnapshot(snapshot);
    const decoded = await decodeSnapshot(payload);

    expect(decoded).not.toBeNull();
    expect(decoded!.systemSymbol).toBe('X1-AA');
    expect(decoded!.systemName).toBe('Alpha');
    expect(decoded!.captain).toEqual({ name: 'CAPT', faction: 'COSMIC' });
    expect(decoded!.planets.length).toBe(2);
    expect(decoded!.ships.length).toBe(1);
  });

  it('rehydrates render-ready PlanetView and ShipData', async () => {
    const snapshot = buildSnapshot(sampleInput());
    const decoded = await decodeSnapshot(await encodeSnapshot(snapshot));

    const planets = toPlanetViews(decoded!);
    expect(planets[0].position).toEqual({ x: 10, y: 20 });
    expect(planets[1].orbits).toBe('X1-AA-A');
    expect(planets[0].system).toBe('X1-AA');

    const ships = toShipData(decoded!);
    expect(ships[0].symbol).toBe('X1-AA-1');
    expect(ships[0].nav.systemSymbol).toBe('X1-AA');
    expect(ships[0].registration.role).toBe('COMMAND');
    expect(ships[0].fuel.capacity).toBe(400);
  });

  it('returns null for empty or malformed payloads', async () => {
    expect(await decodeSnapshot('')).toBeNull();
    expect(await decodeSnapshot('g!!!')).toBeNull();
    expect(await decodeSnapshot('x_unknown_codec')).toBeNull();
  });
});
