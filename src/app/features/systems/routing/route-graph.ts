import { Position, PlanetView, hasTrait } from '../../../models/system.model';
import { ShipNavFlightMode } from '../../../models/ship.model';

/** A routable waypoint reduced to the data the planner needs. */
export interface RouteNode {
  name: string;
  position: Position;
  /** Whether the ship can refuel here (marketplace waypoints sell fuel). */
  canRefuel: boolean;
}

/** Per-flight-mode fuel and time characteristics (SpaceTraders model). */
interface FlightModeProfile {
  /** Fuel multiplier applied to rounded distance. */
  fuelPerDistance: number;
  /** Flat fuel cost regardless of distance (DRIFT). */
  flatFuel: number;
  /** Time multiplier applied to distance / engine speed. */
  timeMultiplier: number;
}

const FLIGHT_MODE_PROFILES: Record<ShipNavFlightMode, FlightModeProfile> = {
  DRIFT: { fuelPerDistance: 0, flatFuel: 1, timeMultiplier: 250 },
  STEALTH: { fuelPerDistance: 1, flatFuel: 0, timeMultiplier: 30 },
  CRUISE: { fuelPerDistance: 1, flatFuel: 0, timeMultiplier: 25 },
  BURN: { fuelPerDistance: 2, flatFuel: 0, timeMultiplier: 12.5 },
};

/** Default engine speed used for ETA estimates when the real value is unknown. */
export const DEFAULT_ENGINE_SPEED = 30;

export function distanceBetween(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Fuel units consumed for a single hop of `distance` in the given flight mode. */
export function fuelCost(distance: number, mode: ShipNavFlightMode): number {
  const profile = FLIGHT_MODE_PROFILES[mode];
  if (profile.flatFuel > 0) return profile.flatFuel;
  return Math.max(Math.round(distance) * profile.fuelPerDistance, 1);
}

/** Approximate travel time in seconds for a single hop. */
export function travelTime(
  distance: number,
  mode: ShipNavFlightMode,
  engineSpeed: number = DEFAULT_ENGINE_SPEED,
): number {
  const profile = FLIGHT_MODE_PROFILES[mode];
  return Math.round((distance * profile.timeMultiplier) / Math.max(engineSpeed, 1)) + 15;
}

/** Build route nodes from the system's waypoints. */
export function buildRouteNodes(planets: PlanetView[]): RouteNode[] {
  return planets.map((p) => ({
    name: p.name,
    position: p.position,
    canRefuel: hasTrait(p, 'MARKETPLACE'),
  }));
}
