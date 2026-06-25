import { ShipNavFlightMode } from '../../../models/ship.model';
import { TravelPlanStep } from '../travel-plan';
import {
  DEFAULT_ENGINE_SPEED,
  RouteNode,
  distanceBetween,
  fuelCost,
  travelTime,
} from './route-graph';

export interface RouteHop {
  /** Waypoint we depart from. */
  from: string;
  /** Waypoint we arrive at. */
  to: string;
  distance: number;
  fuel: number;
  /** Estimated seconds for this hop. */
  time: number;
  /** Whether the ship should refuel on arrival (intermediate refuel stop). */
  refuelOnArrival: boolean;
}

export interface RoutePlan {
  reachable: boolean;
  hops: RouteHop[];
  totalDistance: number;
  totalFuel: number;
  totalTime: number;
}

export interface RouteRequest {
  nodes: RouteNode[];
  start: string;
  goal: string;
  /** Fuel tank capacity (max single-hop budget after refuelling). */
  tankCapacity: number;
  /** Fuel currently in the tank (budget for the first leg). */
  currentFuel: number;
  flightMode: ShipNavFlightMode;
  engineSpeed?: number;
}

const UNREACHABLE: RoutePlan = {
  reachable: false,
  hops: [],
  totalDistance: 0,
  totalFuel: 0,
  totalTime: 0,
};

/**
 * Fuel-aware shortest route via Dijkstra over waypoints.
 *
 * An edge a -> b is usable only when the hop fits the tank, and intermediate
 * stops must be refuel-capable (so the next leg always starts on a full tank).
 * The first leg is constrained by the ship's current fuel rather than capacity.
 * Edge weight is estimated travel time, so the route minimises ETA.
 */
export function planRoute(request: RouteRequest): RoutePlan {
  const { nodes, start, goal, tankCapacity, currentFuel, flightMode } = request;
  const engineSpeed = request.engineSpeed ?? DEFAULT_ENGINE_SPEED;

  const byName = new Map<string, RouteNode>(nodes.map((n) => [n.name, n]));
  const startNode = byName.get(start);
  const goalNode = byName.get(goal);
  if (!startNode || !goalNode) return UNREACHABLE;
  if (start === goal) {
    return { reachable: true, hops: [], totalDistance: 0, totalFuel: 0, totalTime: 0 };
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();
  dist.set(start, 0);

  while (true) {
    let current: string | null = null;
    let best = Infinity;
    for (const [name, d] of dist) {
      if (!visited.has(name) && d < best) {
        best = d;
        current = name;
      }
    }
    if (current === null) break;
    if (current === goal) break;
    visited.add(current);

    const fromNode = byName.get(current)!;
    const fuelBudget = current === start ? currentFuel : tankCapacity;

    for (const to of nodes) {
      if (to.name === current || visited.has(to.name)) continue;
      const d = distanceBetween(fromNode.position, to.position);
      const cost = fuelCost(d, flightMode);
      if (cost > tankCapacity || cost > fuelBudget) continue;
      // Intermediate hops must depart from a refuel-capable node.
      if (current !== start && !fromNode.canRefuel) continue;

      const t = travelTime(d, flightMode, engineSpeed);
      const candidate = best + t;
      if (candidate < (dist.get(to.name) ?? Infinity)) {
        dist.set(to.name, candidate);
        prev.set(to.name, current);
      }
    }
  }

  if (!prev.has(goal) && start !== goal) return UNREACHABLE;

  const path: string[] = [goal];
  let cursor = goal;
  while (prev.has(cursor)) {
    cursor = prev.get(cursor)!;
    path.unshift(cursor);
  }
  if (path[0] !== start) return UNREACHABLE;

  const hops: RouteHop[] = [];
  let totalDistance = 0;
  let totalFuel = 0;
  let totalTime = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = byName.get(path[i]!)!;
    const b = byName.get(path[i + 1]!)!;
    const d = distanceBetween(a.position, b.position);
    const fuel = fuelCost(d, flightMode);
    const time = travelTime(d, flightMode, engineSpeed);
    const isLast = i === path.length - 2;
    hops.push({
      from: a.name,
      to: b.name,
      distance: d,
      fuel,
      time,
      refuelOnArrival: !isLast && b.canRefuel,
    });
    totalDistance += d;
    totalFuel += fuel;
    totalTime += time;
  }

  return { reachable: true, hops, totalDistance, totalFuel, totalTime };
}

/**
 * Convert a multi-hop route into executable travel steps. Refuel stops are
 * expressed as dock steps so the auto-pilot's refuel handling can act on them;
 * the simple visit case just chains orbit -> navigate per hop.
 */
export function routeToTravelPlanSteps(
  plan: RoutePlan,
  flightMode: ShipNavFlightMode,
): TravelPlanStep[] {
  if (!plan.reachable || !plan.hops.length) return [];
  const steps: TravelPlanStep[] = [{ kind: 'setFlightMode', mode: flightMode }];
  for (const hop of plan.hops) {
    steps.push({ kind: 'orbit', waypointSymbol: hop.from });
    steps.push({ kind: 'navigate', waypointSymbol: hop.to });
    if (hop.refuelOnArrival) {
      steps.push({ kind: 'dock' });
    }
  }
  return steps;
}
