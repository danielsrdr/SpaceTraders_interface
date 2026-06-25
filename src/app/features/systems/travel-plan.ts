import { hasTrait, PlanetView } from '../../models/system.model';
import { ShipData, ShipNavFlightMode } from '../../models/ship.model';
import {
  formatRouteEta,
  isDockableWaypoint,
  shipAtWaypoint,
  shipDocked,
  shipInOrbit,
  shipInSystem,
  shipInTransit,
} from './planet-helpers';

export type TravelIntent = 'visit' | 'market';

export type TravelPlanStep =
  | { kind: 'setFlightMode'; mode: ShipNavFlightMode }
  | { kind: 'orbit'; waypointSymbol: string }
  | { kind: 'navigate'; waypointSymbol: string }
  | { kind: 'dock' }
  | { kind: 'surface' }
  | { kind: 'openMarket' };

export interface TravelBlocker {
  message: string;
  severity: 'error' | 'warning';
}

export function filterMarketWaypoints(planets: PlanetView[], query: string): PlanetView[] {
  const q = query.trim().toLowerCase();
  return planets.filter(
    (p) =>
      hasTrait(p, 'MARKETPLACE') &&
      (!q || p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q)),
  );
}

export function pickShipForTravel(
  target: PlanetView,
  selectedShip: ShipData | null,
  ships: ShipData[],
): ShipData | null {
  if (
    selectedShip &&
    shipInSystem(selectedShip, target.system) &&
    !shipInTransit(selectedShip)
  ) {
    return selectedShip;
  }
  const candidates = shipsAvailableForTravel(target, ships);
  if (candidates.length === 1) return candidates[0]!;
  return null;
}

export function shipsAvailableForTravel(target: PlanetView, ships: ShipData[]): ShipData[] {
  return ships.filter((s) => shipInSystem(s, target.system) && !shipInTransit(s));
}

export function findTravelBlockers(ship: ShipData, target: PlanetView): TravelBlocker[] {
  const blockers: TravelBlocker[] = [];

  if (shipInTransit(ship)) {
    blockers.push({
      message: `${ship.symbol} is in transit · ETA ${formatRouteEta(ship.nav.route)}`,
      severity: 'error',
    });
    return blockers;
  }

  if (!shipInSystem(ship, target.system)) {
    blockers.push({
      message: `${ship.symbol} is in ${ship.nav.systemSymbol}, not ${target.system}. Switch to that system first.`,
      severity: 'error',
    });
  }

  if (ship.fuel.current <= 0) {
    blockers.push({
      message: `${ship.symbol} has no fuel. Refuel at a marketplace while docked.`,
      severity: 'error',
    });
  }

  return blockers;
}

export function buildTravelPlan(
  target: PlanetView,
  ship: ShipData,
  intent: TravelIntent,
  preferredFlightMode: ShipNavFlightMode = 'CRUISE',
): TravelPlanStep[] {
  const steps: TravelPlanStep[] = [];
  const wantsMarket = intent === 'market' && hasTrait(target, 'MARKETPLACE');
  const dockable = isDockableWaypoint(target);

  if (shipInTransit(ship)) {
    return steps;
  }

  if (ship.nav.flightMode !== preferredFlightMode) {
    steps.push({ kind: 'setFlightMode', mode: preferredFlightMode });
  }

  let status = ship.nav.status;
  let waypoint = ship.nav.waypointSymbol;

  if (status === 'DOCKED' && waypoint !== target.name) {
    steps.push({ kind: 'orbit', waypointSymbol: waypoint });
    status = 'IN_ORBIT';
  }

  if (waypoint !== target.name && shipInSystem(ship, target.system)) {
    steps.push({ kind: 'navigate', waypointSymbol: target.name });
    status = 'IN_ORBIT';
    waypoint = target.name;
  }

  if (status === 'IN_ORBIT' && waypoint === target.name && dockable) {
    steps.push({ kind: 'dock' });
    status = 'DOCKED';
  }

  if (status === 'DOCKED' && waypoint === target.name && dockable && (intent === 'visit' || wantsMarket)) {
    steps.push({ kind: 'surface' });
  }

  if (wantsMarket && dockable) {
    steps.push({ kind: 'openMarket' });
  }

  return steps;
}

export function describeTravelPlan(steps: TravelPlanStep[], targetName: string): string[] {
  const lines: string[] = [];
  for (const step of steps) {
    switch (step.kind) {
      case 'setFlightMode':
        lines.push(`Set flight mode to ${step.mode} (recommended)`);
        break;
      case 'orbit':
        lines.push(`Leave dock at ${step.waypointSymbol}`);
        break;
      case 'navigate':
        lines.push(`Travel to ${step.waypointSymbol}`);
        break;
      case 'dock':
        lines.push(`Dock at ${targetName}`);
        break;
      case 'surface':
        lines.push(`Enter surface at ${targetName}`);
        break;
      case 'openMarket':
        lines.push('Open market');
        break;
      default: {
        const _exhaustive: never = step;
        void _exhaustive;
      }
    }
  }
  if (!lines.length) {
    lines.push('Already at destination — no travel needed.');
  }
  return lines;
}

export function hasTravelBlockers(blockers: TravelBlocker[]): boolean {
  return blockers.some((b) => b.severity === 'error');
}
