export interface Position {
  x: number;
  y: number;
}

export interface WaypointTrait {
  symbol: string;
  name: string;
  description?: string;
}

export interface WaypointData {
  symbol: string;
  type: string;
  systemSymbol: string;
  x: number;
  y: number;
  orbitals?: string[];
  orbits?: string;
  faction?: { symbol: string; name?: string };
  traits?: WaypointTrait[];
  modifiers?: Array<{ symbol: string; name?: string }>;
  chart?: { waypointSymbol?: string; submittedBy?: string; submittedAt?: string };
  isUnderConstruction?: boolean;
}

export interface SystemFaction {
  symbol: string;
  name?: string;
}

export interface SystemData {
  symbol: string;
  sectorSymbol: string;
  constellation?: string;
  name?: string;
  type: string;
  x: number;
  y: number;
  factions: SystemFaction[];
  waypoints?: WaypointData[];
}

export interface TradeGood {
  symbol: string;
  name?: string;
  tradeVolume?: number;
  supply?: string;
  purchasePrice?: number;
  sellPrice?: number;
}

export type TradeGoodType = 'EXPORT' | 'IMPORT' | 'EXCHANGE';
export type SupplyLevel = 'SCARCE' | 'LIMITED' | 'MODERATE' | 'HIGH' | 'ABUNDANT';
export type ActivityLevel = 'WEAK' | 'GROWING' | 'STRONG' | 'RESTRICTED';

export interface MarketTradeGood {
  symbol: string;
  type: TradeGoodType;
  tradeVolume: number;
  supply: SupplyLevel | string;
  activity?: ActivityLevel | string;
  purchasePrice: number;
  sellPrice: number;
}

export interface MarketData {
  symbol: string;
  exports: TradeGood[];
  imports: TradeGood[];
  exchange: TradeGood[];
  transactions?: unknown[];
  tradeGoods?: MarketTradeGood[];
}

export interface ShipyardData {
  symbol: string;
  shipTypes: Array<{ type: string }>;
  transactions?: unknown[];
  ships?: Array<{ type: string; name: string; purchasePrice: number }>;
  modificationsFee: number;
}

export interface JumpGateData {
  symbol: string;
  connections: string[];
}

export interface ConstructionMaterial {
  tradeSymbol: string;
  required: number;
  fulfilled: number;
}

export interface ConstructionData {
  symbol: string;
  materials: ConstructionMaterial[];
  isComplete: boolean;
}

export interface ScannedWaypoint {
  symbol: string;
  type: string;
  systemSymbol: string;
  x: number;
  y: number;
  traits?: WaypointTrait[];
}

export interface PlanetView {
  name: string;
  type: string;
  system: string;
  position: Position;
  orbits?: string;
  traits: WaypointData['traits'];
  faction?: WaypointData['faction'];
  isUnderConstruction?: boolean;
  chart?: WaypointData['chart'];
  modifiers?: WaypointData['modifiers'];
}

export function hasTrait(planet: PlanetView, traitSymbol: string): boolean {
  return planet.traits?.some((t) => t.symbol === traitSymbol) ?? false;
}

export interface MapLayout {
  coordScale: number;
  centerX: number;
  centerY: number;
  canvasWidth: number;
  canvasHeight: number;
}

export function mapWaypoint(waypoint: WaypointData): PlanetView {
  return {
    name: waypoint.symbol,
    type: waypoint.type,
    system: waypoint.systemSymbol,
    position: { x: waypoint.x, y: waypoint.y },
    orbits: waypoint.orbits,
    traits: waypoint.traits,
    faction: waypoint.faction,
    isUnderConstruction: waypoint.isUnderConstruction,
    chart: waypoint.chart,
    modifiers: waypoint.modifiers,
  };
}

export function computeMapLayout(
  planets: PlanetView[],
  canvasWidth: number,
  canvasHeight: number,
): MapLayout {
  if (!planets.length) {
    return { coordScale: 4, centerX: 0, centerY: 0, canvasWidth, canvasHeight };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const planet of planets) {
    minX = Math.min(minX, planet.position.x);
    maxX = Math.max(maxX, planet.position.x);
    minY = Math.min(minY, planet.position.y);
    maxY = Math.max(maxY, planet.position.y);
  }

  const rangeX = Math.max(maxX - minX, 10);
  const rangeY = Math.max(maxY - minY, 10);
  const padding = 80;

  const coordScale = Math.min(
    (canvasWidth - padding * 2) / rangeX,
    (canvasHeight - padding * 2) / rangeY,
  );

  return {
    coordScale,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    canvasWidth,
    canvasHeight,
  };
}

export function canvasPosition(position: Position, layout: MapLayout): Position {
  return {
    x: (position.x - layout.centerX) * layout.coordScale + layout.canvasWidth / 2,
    y: (position.y - layout.centerY) * layout.coordScale + layout.canvasHeight / 2,
  };
}
