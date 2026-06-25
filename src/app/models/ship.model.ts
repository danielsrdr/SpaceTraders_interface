export type ShipNavStatus = 'IN_TRANSIT' | 'IN_ORBIT' | 'DOCKED';
export type ShipNavFlightMode = 'DRIFT' | 'STEALTH' | 'CRUISE' | 'BURN';

export interface ShipNavRouteWaypoint {
  symbol: string;
  type: string;
  systemSymbol: string;
  x: number;
  y: number;
}

export interface ShipNavRoute {
  destination: ShipNavRouteWaypoint;
  origin: ShipNavRouteWaypoint;
  departureTime: string;
  arrival: string;
}

export interface ShipNav {
  systemSymbol: string;
  waypointSymbol: string;
  route?: ShipNavRoute;
  status: ShipNavStatus | string;
  flightMode: ShipNavFlightMode | string;
}

export interface ShipCooldown {
  shipSymbol: string;
  totalSeconds: number;
  remainingSeconds: number;
  expiration?: string;
}

export interface CargoItem {
  symbol: string;
  name?: string;
  description?: string;
  units: number;
}

export interface ShipCargo {
  capacity: number;
  units: number;
  inventory: CargoItem[];
}

export interface ExtractionYield {
  symbol: string;
  units: number;
}

export interface ExtractionResult {
  extraction: { shipSymbol: string; yield: ExtractionYield };
  cargo: ShipCargo;
}

export interface SiphonResult {
  siphon: { shipSymbol: string; yield: ExtractionYield };
  cargo: ShipCargo;
}

export interface MarketTransaction {
  waypointSymbol: string;
  shipSymbol: string;
  tradeSymbol: string;
  type: string;
  units: number;
  pricePerUnit: number;
  totalPrice: number;
  timestamp: string;
}

export interface ShipData {
  symbol: string;
  cargo?: ShipCargo;
  registration: {
    name: string;
    factionSymbol: string;
    role: string;
  };
  nav: ShipNav;
  crew: {
    current: number;
    capacity: number;
    required: number;
    morale: number;
  };
  frame: {
    name: string;
    description: string;
    fuelCapacity: number;
    condition: number;
    requirements: { power: number; crew: number };
  };
  reactor: {
    name: string;
    description: string;
    condition: number;
    powerOutput: number;
    requirements: { crew: number };
  };
  fuel: {
    current: number;
    capacity: number;
    consumed: { amount: number; timestamp: string };
  };
}
