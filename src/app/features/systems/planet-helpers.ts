import { PlanetView, MapLayout, canvasPosition, Position } from '../../models/system.model';
import { CargoItem, ShipCargo, ShipData, ShipNavRoute, ShipNavRouteWaypoint } from '../../models/ship.model';

const TYPE_IMAGES: Record<string, string[]> = {
  PLANET: ['PLANET.png'],
  GAS_GIANT: ['GAS_GIANT.png'],
  MOON: ['MOON.png'],
  ORBITAL_STATION: ['FUEL_STATION.png'],
  JUMP_GATE: ['jumpgate.png'],
  ASTEROID: ['asteroid1.png', 'asteroid2.png', 'asteroid3.png', 'asteroid4.png'],
  ASTEROID_FIELD: ['ASTEROID_FIELD.png', 'asteroid1.png', 'asteroid2.png', 'asteroid3.png', 'asteroid4.png'],
  ASTEROID_BASE: ['ASTEROID_BASE.png'],
  ENGINEERED_ASTEROID: ['ENGINEERED_ASTEROID.png'],
  NEBULA: ['GAS_GIANT.png'],
  DEBRIS_FIELD: ['asteroid1.png', 'asteroid2.png', 'asteroid3.png', 'asteroid4.png'],
  GRAVITY_WELL: ['GRAVITY_WELL.png', 'blackhole.png', 'whitehole.png'],
  ARTIFICIAL_GRAVITY_WELL: ['ARTIFICAL_GRAVITY_WELL.png'],
  ARTIFICAL_GRAVITY_WELL: ['ARTIFICAL_GRAVITY_WELL.png'],
  FUEL_STATION: ['FUEL_STATION.png'],
  ARTIFACT: ['PLANET.png'],
};

const TYPE_SIZE_FACTORS: Record<string, number> = {
  PLANET: 2,
  GAS_GIANT: 2.4,
  MOON: 1,
  ORBITAL_STATION: 0.95,
  JUMP_GATE: 1.3,
  ASTEROID: 1.2,
  ASTEROID_FIELD: 2.5,
  ASTEROID_BASE: 1.8,
  ENGINEERED_ASTEROID: 1.5,
  NEBULA: 2.2,
  DEBRIS_FIELD: 1.2,
  GRAVITY_WELL: 1.4,
  ARTIFICIAL_GRAVITY_WELL: 1.4,
  ARTIFICAL_GRAVITY_WELL: 1.4,
  FUEL_STATION: 0.9,
  ARTIFACT: 1.5,
};

const DEFAULT_IMAGES = ['PLANET.png'];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function resolveWaypointType(type: string): string {
  if (TYPE_IMAGES[type]) return type;

  const normalized = type.trim().toUpperCase();
  if (TYPE_IMAGES[normalized]) return normalized;

  if (normalized.includes('ENGINEERED') && normalized.includes('ASTEROID')) {
    return 'ENGINEERED_ASTEROID';
  }
  if (normalized.includes('ASTEROID') && normalized.includes('BASE')) {
    return 'ASTEROID_BASE';
  }
  if (normalized.includes('ASTEROID') && normalized.includes('FIELD')) {
    return 'ASTEROID_FIELD';
  }
  if (normalized.includes('ASTEROID')) {
    return 'ASTEROID';
  }
  if (normalized.includes('GRAVITY')) {
    return normalized.includes('ARTIFIC') ? 'ARTIFICIAL_GRAVITY_WELL' : 'GRAVITY_WELL';
  }
  if (normalized.includes('GAS')) {
    return 'GAS_GIANT';
  }
  if (normalized.includes('JUMP')) {
    return 'JUMP_GATE';
  }
  if (normalized.includes('FUEL') || normalized.includes('STATION')) {
    return normalized.includes('ORBITAL') ? 'ORBITAL_STATION' : 'FUEL_STATION';
  }
  if (normalized.includes('DEBRIS')) {
    return 'DEBRIS_FIELD';
  }
  if (normalized.includes('NEBULA')) {
    return 'NEBULA';
  }
  if (normalized.includes('MOON')) {
    return 'MOON';
  }

  return normalized;
}

export function getPlanetImages(planet: PlanetView): string[] {
  const resolvedType = resolveWaypointType(planet.type);
  return TYPE_IMAGES[resolvedType] ?? DEFAULT_IMAGES;
}

export function getPlanetImage(planet: PlanetView): string {
  const images = getPlanetImages(planet);
  if (images.length === 1) return images[0];
  return images[hashString(planet.name) % images.length];
}

export function getPlanetDisplayScale(
  planet: PlanetView,
  imageWidth: number,
  imageHeight: number,
  coordScale: number,
): number {
  const resolvedType = resolveWaypointType(planet.type);
  const factor = TYPE_SIZE_FACTORS[resolvedType] ?? 1.5;
  const targetPx = Math.max(10, Math.min(80, coordScale * 2.5 * factor));
  return targetPx / Math.max(imageWidth, imageHeight, 1);
}

export function formatPlanetInfo(planet: PlanetView): string {
  const traits = planet.traits?.map((t) => t.name).join(', ') ?? 'None';
  const faction = planet.faction?.symbol ?? 'Unclaimed';
  const charted = planet.chart?.submittedBy ? `Yes (${planet.chart.submittedBy})` : 'No';
  const construction = planet.isUnderConstruction ? 'Under construction' : 'None';
  return `${planet.name}\nType: ${planet.type}\nFaction: ${faction}\nTraits: ${traits}\nCharted: ${charted}\nConstruction: ${construction}`;
}

export function formatTradeGoods(goods: Array<{ symbol: string; purchasePrice?: number; sellPrice?: number }>, label: string): string {
  if (!goods.length) return `${label}: none`;
  const lines = goods.map((g) => {
    const prices = [
      g.purchasePrice != null ? `buy ${g.purchasePrice}` : null,
      g.sellPrice != null ? `sell ${g.sellPrice}` : null,
    ].filter(Boolean).join(', ');
    return `  ${g.symbol}${prices ? ` (${prices})` : ''}`;
  });
  return `${label}:\n${lines.join('\n')}`;
}

export function getShipMarkerImage(ship: ShipData): string {
  if (ship.registration.role === 'SATELLITE') return 'SATELLITE.png';
  if (ship.nav.status === 'IN_ORBIT') return 'spaceshiporbits.png';
  return 'spaceship.png';
}

export function getShipDisplayScale(coordScale: number): number {
  const targetPx = Math.max(10, Math.min(24, coordScale * 1.1));
  return targetPx;
}

export function shipOrbitOffset(index: number, total: number, radius = 18): { x: number; y: number } {
  if (total <= 1) return { x: 0, y: radius * 0.6 };
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function shipsInSystem(ships: ShipData[], systemSymbol: string): ShipData[] {
  return ships.filter((ship) => ship.nav.systemSymbol === systemSymbol);
}

export function shipsOnMap(ships: ShipData[], systemSymbol: string): ShipData[] {
  return ships.filter(
    (ship) => shipInSystem(ship, systemSymbol) || (shipInTransit(ship) && transitInSystem(ship, systemSymbol)),
  );
}

export function findPlanetForShip(planets: PlanetView[], ship: ShipData): PlanetView | undefined {
  return planets.find((planet) => planet.name === ship.nav.waypointSymbol);
}

export function shipCanvasPosition(
  ship: ShipData,
  planets: PlanetView[],
  layout: MapLayout,
  index: number,
  totalAtWaypoint: number,
): { x: number; y: number } | null {
  if (shipInTransit(ship)) {
    return transitCanvasPosition(ship, layout);
  }

  const planet = findPlanetForShip(planets, ship);
  if (!planet) return null;

  const base = canvasPosition(planet.position, layout);
  const offset = shipOrbitOffset(index, totalAtWaypoint);
  return { x: base.x + offset.x, y: base.y + offset.y };
}

export function shipInSystem(ship: ShipData, systemSymbol: string): boolean {
  return ship.nav.systemSymbol === systemSymbol;
}

export function shipInTransit(ship: ShipData): boolean {
  return ship.nav.status === 'IN_TRANSIT';
}

export function getTransitProgress(route: ShipNavRoute, now = Date.now()): number {
  const dep = new Date(route.departureTime).getTime();
  const arr = new Date(route.arrival).getTime();
  if (!Number.isFinite(dep) || !Number.isFinite(arr) || arr <= dep) return 1;
  return Math.min(1, Math.max(0, (now - dep) / (arr - dep)));
}

/** Client-side anchor for 3D transit motion (decoupled from shifting API timestamps). */
interface VisualTransitAnchor {
  /** Wall-clock ms when visual progress was 0 for this leg. */
  startedAt: number;
  durationMs: number;
  maxT: number;
}

const visualTransitByLeg = new Map<string, VisualTransitAnchor>();

function routeDurationMs(route: ShipNavRoute): number {
  const dep = new Date(route.departureTime).getTime();
  const arr = new Date(route.arrival).getTime();
  if (!Number.isFinite(dep) || !Number.isFinite(arr) || arr <= dep) return 60_000;
  return arr - dep;
}

/** Cache key for an in-transit leg, or null when the ship is not travelling. */
export function transitLegKey(ship: ShipData): string | null {
  const route = ship.nav.route;
  if (!route || !shipInTransit(ship)) return null;
  return `${ship.symbol}:${route.origin.symbol}>${route.destination.symbol}`;
}

/** Drop cached visual progress for one ship (or the entire fleet). */
export function clearStableTransitProgress(shipSymbol?: string): void {
  if (!shipSymbol) {
    visualTransitByLeg.clear();
    return;
  }
  const prefix = `${shipSymbol}:`;
  for (const key of visualTransitByLeg.keys()) {
    if (key.startsWith(prefix)) visualTransitByLeg.delete(key);
  }
}

/** Create or extend the wall-clock anchor for a ship's current transit leg. */
function anchorTransitLeg(ship: ShipData, now = Date.now()): VisualTransitAnchor | null {
  const route = ship.nav.route;
  const key = transitLegKey(ship);
  if (!route || !key) return null;

  const apiDuration = routeDurationMs(route);
  let anchor = visualTransitByLeg.get(key);
  if (!anchor) {
    const initialT = getTransitProgress(route, now);
    anchor = {
      startedAt: now - initialT * apiDuration,
      durationMs: apiDuration,
      maxT: initialT,
    };
    visualTransitByLeg.set(key, anchor);
    return anchor;
  }

  const elapsed = now - anchor.startedAt;
  // Extend duration when the API pushes arrival later; never shrink below elapsed time.
  anchor.durationMs = Math.max(anchor.durationMs, apiDuration, elapsed + 500);
  return anchor;
}

/**
 * Monotonic transit progress for 3D rendering. Driven by a client wall-clock anchor
 * seeded from the API on first sight of a leg, so poll refreshes that shift
 * route timestamps cannot roll the ship backward on the arc.
 */
export function getStableTransitProgress(ship: ShipData, now = Date.now()): number {
  if (!shipInTransit(ship) || !ship.nav.route) return 0;
  const anchor = anchorTransitLeg(ship, now);
  if (!anchor) return 0;
  const raw = Math.min(1, (now - anchor.startedAt) / anchor.durationMs);
  anchor.maxT = Math.max(anchor.maxT, raw);
  return anchor.maxT;
}

/** Evict or extend visual-progress anchors after a fleet refresh. */
export function evictStableTransitProgressOnRefresh(prev: ShipData[], next: ShipData[]): void {
  const nextSymbols = new Set(next.map((s) => s.symbol));
  for (const before of prev) {
    if (!nextSymbols.has(before.symbol)) {
      clearStableTransitProgress(before.symbol);
    }
  }

  for (const ship of next) {
    const before = prev.find((s) => s.symbol === ship.symbol);
    const afterKey = transitLegKey(ship);
    const beforeKey = before ? transitLegKey(before) : null;

    if (!afterKey) {
      if (beforeKey) clearStableTransitProgress(ship.symbol);
      continue;
    }

    if (beforeKey !== afterKey) {
      clearStableTransitProgress(ship.symbol);
    }
    anchorTransitLeg(ship);
  }
}

export function routeWaypointCanvasPosition(
  waypoint: ShipNavRouteWaypoint,
  layout: MapLayout,
): Position {
  return canvasPosition({ x: waypoint.x, y: waypoint.y }, layout);
}

export function transitCanvasPosition(
  ship: ShipData,
  layout: MapLayout,
): Position | null {
  const route = ship.nav.route;
  if (!route || !shipInTransit(ship)) return null;

  const progress = getTransitProgress(route);
  const origin = routeWaypointCanvasPosition(route.origin, layout);
  const dest = routeWaypointCanvasPosition(route.destination, layout);

  return {
    x: origin.x + (dest.x - origin.x) * progress,
    y: origin.y + (dest.y - origin.y) * progress,
  };
}

export function transitInSystem(ship: ShipData, systemSymbol: string): boolean {
  if (!shipInTransit(ship) || !ship.nav.route) return false;
  const { origin, destination } = ship.nav.route;
  return origin.systemSymbol === systemSymbol || destination.systemSymbol === systemSymbol;
}

export function formatRouteEta(route: ShipNavRoute | undefined, now = Date.now()): string {
  if (!route) return '—';
  const arr = new Date(route.arrival).getTime();
  const remaining = Math.max(0, arr - now);
  if (remaining <= 0) return 'Arriving…';
  const secs = Math.ceil(remaining / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function formatTransitInfo(ship: ShipData): string {
  const route = ship.nav.route;
  if (!route || !shipInTransit(ship)) return '';
  const progress = Math.round(getTransitProgress(route) * 100);
  return `Transit: ${route.origin.symbol} → ${route.destination.symbol}\nETA: ${formatRouteEta(route)} (${progress}%)`;
}

export function formatShipInfo(ship: ShipData): string {
  const cargo = ship.cargo
    ? `Cargo: ${ship.cargo.units}/${ship.cargo.capacity}`
    : 'Cargo: unknown';
  const transit = formatTransitInfo(ship);
  const lines = [
    `${ship.symbol}`,
    `Status: ${ship.nav.status}`,
    `At: ${ship.nav.waypointSymbol}`,
    `Mode: ${ship.nav.flightMode}`,
    `Fuel: ${ship.fuel.current}/${ship.fuel.capacity}`,
    cargo,
  ];
  if (transit) lines.push(transit);
  return lines.join('\n');
}

export function formatCargo(cargo: ShipCargo | null): string {
  if (!cargo) return 'No cargo data';
  if (!cargo.inventory.length) return `Empty (${cargo.units}/${cargo.capacity})`;
  const lines = cargo.inventory.map((item) => `  ${item.symbol}: ${item.units}`);
  return `${cargo.units}/${cargo.capacity}\n${lines.join('\n')}`;
}

const ASTEROID_TYPES = new Set([
  'ASTEROID',
  'ASTEROID_FIELD',
  'ASTEROID_BASE',
  'ENGINEERED_ASTEROID',
  'DEBRIS_FIELD',
]);

export function isAsteroidWaypoint(planet: PlanetView): boolean {
  return ASTEROID_TYPES.has(resolveWaypointType(planet.type));
}

export function isGasGiantWaypoint(planet: PlanetView): boolean {
  return resolveWaypointType(planet.type) === 'GAS_GIANT';
}

export function isDockableWaypoint(planet: PlanetView): boolean {
  return (
    (planet.traits?.some((t) => t.symbol === 'DOCK') ?? false) ||
    resolveWaypointType(planet.type) === 'ORBITAL_STATION' ||
    (planet.traits?.some((t) => t.symbol === 'MARKETPLACE' || t.symbol === 'SHIPYARD') ?? false)
  );
}

export function shipAtWaypoint(ship: ShipData, waypointSymbol: string): boolean {
  return ship.nav.waypointSymbol === waypointSymbol;
}

export function shipInOrbit(ship: ShipData): boolean {
  return ship.nav.status === 'IN_ORBIT';
}

export function shipDocked(ship: ShipData): boolean {
  return ship.nav.status === 'DOCKED';
}

export type PlanetClickAction =
  | { kind: 'surface'; ship: ShipData }
  | { kind: 'dock'; ship: ShipData }
  | { kind: 'navigate'; ship: ShipData }
  | { kind: 'orbit'; ship: ShipData }
  | { kind: 'panel'; reason: string }
  | { kind: 'blocked'; reason: string };

function pickShipForPlanetAction(
  planet: PlanetView,
  selectedShip: ShipData | null,
  ships: ShipData[],
): ShipData | null {
  if (
    selectedShip &&
    shipInSystem(selectedShip, planet.system) &&
    !shipInTransit(selectedShip)
  ) {
    return selectedShip;
  }
  const candidates = ships.filter(
    (s) => shipInSystem(s, planet.system) && !shipInTransit(s),
  );
  if (candidates.length === 1) return candidates[0]!;
  return null;
}

export function resolvePlanetClickAction(
  planet: PlanetView,
  selectedShip: ShipData | null,
  ships: ShipData[],
): PlanetClickAction {
  if (selectedShip && shipInTransit(selectedShip)) {
    return {
      kind: 'blocked',
      reason: `${selectedShip.symbol} is in transit · ETA ${formatRouteEta(selectedShip.nav.route)}`,
    };
  }

  const ship = pickShipForPlanetAction(planet, selectedShip, ships);

  if (!ship) {
    const inSystem = ships.filter((s) => shipInSystem(s, planet.system));
    if (!inSystem.length) {
      return {
        kind: 'panel',
        reason: 'No ships in this system. Move a ship here first.',
      };
    }
    if (inSystem.every(shipInTransit)) {
      return { kind: 'blocked', reason: 'All ships in this system are in transit.' };
    }
    return { kind: 'panel', reason: 'Select a ship from the list, then click a waypoint.' };
  }

  if (shipDocked(ship) && shipAtWaypoint(ship, planet.name)) {
    return { kind: 'surface', ship };
  }

  if (shipInTransit(ship)) {
    return {
      kind: 'blocked',
      reason: `${ship.symbol} is in transit · ETA ${formatRouteEta(ship.nav.route)}`,
    };
  }

  if (shipInOrbit(ship) && shipAtWaypoint(ship, planet.name) && isDockableWaypoint(planet)) {
    return { kind: 'dock', ship };
  }

  if (
    shipInOrbit(ship) &&
    !shipAtWaypoint(ship, planet.name) &&
    shipInSystem(ship, planet.system)
  ) {
    return { kind: 'navigate', ship };
  }

  if (shipDocked(ship) && !shipAtWaypoint(ship, planet.name)) {
    return { kind: 'orbit', ship };
  }

  if (shipInOrbit(ship) && shipAtWaypoint(ship, planet.name) && !isDockableWaypoint(planet)) {
    return { kind: 'panel', reason: `${planet.name} cannot be docked at.` };
  }

  return { kind: 'panel', reason: 'No action available for this waypoint.' };
}

export function planetClickActionLabel(action: PlanetClickAction): string {
  switch (action.kind) {
    case 'surface':
      return 'Enter surface';
    case 'dock':
      return 'Dock';
    case 'navigate':
      return 'Navigate';
    case 'orbit':
      return 'Enter orbit';
    case 'panel':
    case 'blocked':
      return '';
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function shipStatusClass(status: string): string {
  switch (status) {
    case 'DOCKED':
      return 'sk-status-docked';
    case 'IN_ORBIT':
      return 'sk-status-orbit';
    case 'IN_TRANSIT':
      return 'sk-status-transit';
    default:
      return 'sk-status-unknown';
  }
}

export function shipFlightModeClass(mode: string): string {
  switch (mode) {
    case 'DRIFT':
      return 'sk-mode-drift';
    case 'STEALTH':
      return 'sk-mode-stealth';
    case 'CRUISE':
      return 'sk-mode-cruise';
    case 'BURN':
      return 'sk-mode-burn';
    default:
      return 'sk-mode-unknown';
  }
}

export function flightModeDescription(mode: string): string {
  switch (mode) {
    case 'DRIFT':
      return 'DRIFT — minimal fuel use, slowest travel.';
    case 'STEALTH':
      return 'STEALTH — reduced signature, lower fuel burn.';
    case 'CRUISE':
      return 'CRUISE — balanced speed and fuel consumption.';
    case 'BURN':
      return 'BURN — fastest travel, highest fuel use.';
    default:
      return '';
  }
}
