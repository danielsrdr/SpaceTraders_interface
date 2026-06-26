import { PlanetView } from '../../models/system.model';
import { ShipData, ShipNavRoute, ShipNavRouteWaypoint } from '../../models/ship.model';
import { shipsOnMap } from '../systems/planet-helpers';

/**
 * Self-contained, URL-serializable snapshot of a system + the owner's on-map
 * fleet. The deterministic `SystemOrbitEngine` reproduces identical orbital
 * motion from the planet data alone, so this is everything a spectator needs to
 * replay the scene read-only — no backend, no API token.
 *
 * Only the fields the flight-view renderer / orbit engine actually read are
 * serialized; the rest are rehydrated with inert defaults when decoding.
 */
export const SPECTATE_SCHEMA_VERSION = 1;

/** Conservative cap on the encoded payload length (URL fragment chars). */
export const SPECTATE_MAX_PAYLOAD = 28000;

export interface SpectatePlanet {
  name: string;
  type: string;
  x: number;
  y: number;
  orbits?: string;
  traits?: Array<{ symbol: string; name: string }>;
}

export interface SpectateRoute {
  originSymbol: string;
  originSystem: string;
  destSymbol: string;
  destSystem: string;
  departureTime: string;
  arrival: string;
}

export interface SpectateShip {
  symbol: string;
  name: string;
  role: string;
  faction: string;
  systemSymbol: string;
  waypointSymbol: string;
  status: string;
  flightMode: string;
  condition: number;
  fuelCurrent: number;
  fuelCapacity: number;
  cargoUnits: number;
  cargoCapacity: number;
  route?: SpectateRoute;
}

export interface SpectateSnapshot {
  v: number;
  systemSymbol: string;
  systemName: string;
  captain: { name: string; faction: string };
  planets: SpectatePlanet[];
  ships: SpectateShip[];
}

export interface SnapshotInput {
  systemSymbol: string;
  systemName: string;
  planets: PlanetView[];
  ships: ShipData[];
  captain: { name: string; faction: string };
}

export interface EncodeResult {
  payload: string;
  /** True when the fleet was dropped to keep the URL under the size cap. */
  droppedShips: boolean;
}

function toSpectatePlanet(p: PlanetView): SpectatePlanet {
  return {
    name: p.name,
    type: p.type,
    x: p.position.x,
    y: p.position.y,
    orbits: p.orbits,
    traits: p.traits?.map((t) => ({ symbol: t.symbol, name: t.name })),
  };
}

function toSpectateShip(s: ShipData): SpectateShip {
  return {
    symbol: s.symbol,
    name: s.registration.name,
    role: s.registration.role,
    faction: s.registration.factionSymbol,
    systemSymbol: s.nav.systemSymbol,
    waypointSymbol: s.nav.waypointSymbol,
    status: s.nav.status,
    flightMode: s.nav.flightMode,
    condition: s.frame?.condition ?? 1,
    fuelCurrent: s.fuel?.current ?? 0,
    fuelCapacity: s.fuel?.capacity ?? 0,
    cargoUnits: s.cargo?.units ?? 0,
    cargoCapacity: s.cargo?.capacity ?? 0,
    route: s.nav.route
      ? {
          originSymbol: s.nav.route.origin.symbol,
          originSystem: s.nav.route.origin.systemSymbol,
          destSymbol: s.nav.route.destination.symbol,
          destSystem: s.nav.route.destination.systemSymbol,
          departureTime: s.nav.route.departureTime,
          arrival: s.nav.route.arrival,
        }
      : undefined,
  };
}

export function buildSnapshot(input: SnapshotInput): SpectateSnapshot {
  const onMap = shipsOnMap(input.ships, input.systemSymbol);
  return {
    v: SPECTATE_SCHEMA_VERSION,
    systemSymbol: input.systemSymbol,
    systemName: input.systemName,
    captain: input.captain,
    planets: input.planets.map(toSpectatePlanet),
    ships: onMap.map(toSpectateShip),
  };
}

export function toPlanetViews(snapshot: SpectateSnapshot): PlanetView[] {
  return snapshot.planets.map((p) => ({
    name: p.name,
    type: p.type,
    system: snapshot.systemSymbol,
    position: { x: p.x, y: p.y },
    orbits: p.orbits,
    traits: p.traits,
  }));
}

function routeWaypoint(symbol: string, systemSymbol: string): ShipNavRouteWaypoint {
  return { symbol, type: '', systemSymbol, x: 0, y: 0 };
}

function rehydrateRoute(route: SpectateRoute): ShipNavRoute {
  return {
    origin: routeWaypoint(route.originSymbol, route.originSystem),
    destination: routeWaypoint(route.destSymbol, route.destSystem),
    departureTime: route.departureTime,
    arrival: route.arrival,
  };
}

function rehydrateShip(s: SpectateShip): ShipData {
  return {
    symbol: s.symbol,
    cargo: { capacity: s.cargoCapacity, units: s.cargoUnits, inventory: [] },
    registration: { name: s.name, factionSymbol: s.faction, role: s.role },
    nav: {
      systemSymbol: s.systemSymbol,
      waypointSymbol: s.waypointSymbol,
      route: s.route ? rehydrateRoute(s.route) : undefined,
      status: s.status,
      flightMode: s.flightMode,
    },
    crew: { current: 0, capacity: 0, required: 0, morale: 0 },
    frame: {
      name: '',
      description: '',
      fuelCapacity: s.fuelCapacity,
      condition: s.condition,
      requirements: { power: 0, crew: 0 },
    },
    reactor: {
      name: '',
      description: '',
      condition: 1,
      powerOutput: 0,
      requirements: { crew: 0 },
    },
    fuel: {
      current: s.fuelCurrent,
      capacity: s.fuelCapacity,
      consumed: { amount: 0, timestamp: '' },
    },
  };
}

export function toShipData(snapshot: SpectateSnapshot): ShipData[] {
  return snapshot.ships.map(rehydrateShip);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function gunzip(buffer: ArrayBuffer): Promise<string> {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/**
 * Encode to a URL-safe payload. Uses native gzip when available (prefix `g`),
 * falling back to raw UTF-8 (prefix `r`). No third-party dependency.
 */
export async function encodeSnapshot(snapshot: SpectateSnapshot): Promise<string> {
  const json = JSON.stringify(snapshot);
  if (typeof CompressionStream !== 'undefined') {
    try {
      return 'g' + bytesToBase64Url(await gzip(json));
    } catch {
      // Fall through to the uncompressed path.
    }
  }
  return 'r' + bytesToBase64Url(new TextEncoder().encode(json));
}

export async function decodeSnapshot(payload: string): Promise<SpectateSnapshot | null> {
  if (!payload) return null;
  try {
    const codec = payload[0];
    const buffer = base64UrlToArrayBuffer(payload.slice(1));
    let json: string;
    if (codec === 'g') {
      json = await gunzip(buffer);
    } else if (codec === 'r') {
      json = new TextDecoder().decode(buffer);
    } else {
      return null;
    }
    const parsed = JSON.parse(json) as SpectateSnapshot;
    if (!parsed || parsed.v !== SPECTATE_SCHEMA_VERSION || !Array.isArray(parsed.planets)) {
      return null;
    }
    if (!Array.isArray(parsed.ships)) parsed.ships = [];
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Encode with a size guard: if the payload exceeds the cap, drop the fleet and
 * re-encode (the system replay alone is still meaningful).
 */
export async function encodeSnapshotWithGuard(snapshot: SpectateSnapshot): Promise<EncodeResult> {
  const payload = await encodeSnapshot(snapshot);
  if (payload.length <= SPECTATE_MAX_PAYLOAD) {
    return { payload, droppedShips: false };
  }
  const trimmed = await encodeSnapshot({ ...snapshot, ships: [] });
  return { payload: trimmed, droppedShips: true };
}
