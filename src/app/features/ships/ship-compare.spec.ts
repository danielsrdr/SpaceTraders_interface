import type { ShipData } from '../../models/ship.model';
import { compareShips, overallWinner, type CompareRow } from './ship-compare';

function row(winner: CompareRow['winner']): CompareRow {
  return { label: 'metric', aValue: 0, bValue: 0, aDisplay: '', bDisplay: '', winner };
}

interface ShipSpec {
  symbol?: string;
  role?: string;
  cargo?: number;
  fuel?: number;
  condition?: number;
  power?: number;
  crew?: number;
}

function ship(spec: ShipSpec): ShipData {
  const symbol = spec.symbol ?? 'SHIP';
  return {
    symbol,
    cargo: { capacity: spec.cargo ?? 0, units: 0, inventory: [] },
    registration: { name: symbol, factionSymbol: 'COSMIC', role: spec.role ?? 'HAULER' },
    nav: { systemSymbol: 'X1-AA', waypointSymbol: 'X1-AA-A', status: 'DOCKED', flightMode: 'CRUISE' },
    crew: { current: 0, capacity: spec.crew ?? 0, required: 0, morale: 0 },
    frame: {
      name: '',
      description: '',
      fuelCapacity: 0,
      condition: spec.condition ?? 1,
      requirements: { power: 0, crew: 0 },
    },
    reactor: {
      name: '',
      description: '',
      condition: 1,
      powerOutput: spec.power ?? 0,
      requirements: { crew: 0 },
    },
    fuel: { current: 0, capacity: spec.fuel ?? 0, consumed: { amount: 0, timestamp: '' } },
  };
}

describe('overallWinner', () => {
  it('returns the side with more row wins', () => {
    expect(overallWinner([row('a'), row('a'), row('b')])).toBe('a');
    expect(overallWinner([row('b'), row('b'), row('a')])).toBe('b');
  });

  it('returns a tie on equal wins, all ties, or no rows', () => {
    expect(overallWinner([row('a'), row('b')])).toBe('tie');
    expect(overallWinner([row('tie'), row('tie')])).toBe('tie');
    expect(overallWinner([])).toBe('tie');
  });

  it('crowns the dominant ship through compareShips', () => {
    const strong = ship({ symbol: 'A', cargo: 100, fuel: 1000, condition: 1, power: 20, crew: 10 });
    const weak = ship({ symbol: 'B', cargo: 10, fuel: 100, condition: 0.5, power: 5, crew: 2 });
    expect(overallWinner(compareShips(strong, weak))).toBe('a');
    expect(overallWinner(compareShips(weak, strong))).toBe('b');
  });
});
