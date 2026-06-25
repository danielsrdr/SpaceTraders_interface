import type { ShipData } from '../../models/ship.model';

export interface CompareRow {
  label: string;
  aValue: number;
  bValue: number;
  aDisplay: string;
  bDisplay: string;
  winner: 'a' | 'b' | 'tie';
}

export interface FleetRecommendation {
  extraction: { symbol: string; reason: string };
  contract: { symbol: string; reason: string };
}

const MINING_ROLES: ReadonlySet<string> = new Set([
  'EXCAVATOR',
  'HARVESTER',
  'SURVEYOR',
  'REFINERY',
]);

function cargoCapacity(ship: ShipData): number {
  return ship.cargo?.capacity ?? 0;
}

function makeRow(
  label: string,
  aValue: number,
  bValue: number,
  format: (value: number) => string = (value) => `${value}`,
): CompareRow {
  return {
    label,
    aValue,
    bValue,
    aDisplay: format(aValue),
    bDisplay: format(bValue),
    winner: aValue > bValue ? 'a' : bValue > aValue ? 'b' : 'tie',
  };
}

export function compareShips(a: ShipData, b: ShipData): CompareRow[] {
  const percent = (value: number): string => `${value}%`;
  return [
    makeRow('Cargo capacity', cargoCapacity(a), cargoCapacity(b)),
    makeRow('Fuel capacity', a.fuel.capacity, b.fuel.capacity),
    makeRow(
      'Condition',
      Math.round(a.frame.condition * 100),
      Math.round(b.frame.condition * 100),
      percent,
    ),
    makeRow('Reactor power', a.reactor.powerOutput, b.reactor.powerOutput),
    makeRow('Crew capacity', a.crew.capacity, b.crew.capacity),
  ];
}

function extractionScore(ship: ShipData): number {
  return (
    cargoCapacity(ship) + (MINING_ROLES.has(ship.registration.role) ? 50 : 0) + ship.frame.condition * 20
  );
}

function contractScore(ship: ShipData): number {
  return cargoCapacity(ship) * 0.6 + ship.fuel.capacity * 0.4 + ship.frame.condition * 30;
}

export function recommend(a: ShipData, b: ShipData): FleetRecommendation {
  const extractionPick = extractionScore(a) >= extractionScore(b) ? a : b;
  const contractPick = contractScore(a) >= contractScore(b) ? a : b;
  return {
    extraction: {
      symbol: extractionPick.symbol,
      reason: MINING_ROLES.has(extractionPick.registration.role)
        ? 'mining-class role with cargo room'
        : 'most cargo room to haul ore',
    },
    contract: {
      symbol: contractPick.symbol,
      reason: 'best blend of cargo, fuel range and condition',
    },
  };
}
