import { ShipNavFlightMode } from '../../models/ship.model';

/** Run lifecycle for a ship's order queue. */
export type RunStatus = 'idle' | 'running' | 'paused' | 'error';

/**
 * A single automation order. Discriminated union — keep the runner's switch
 * exhaustive (workspace rule: `never` check in the default case).
 */
export type Order =
  | { kind: 'setFlightMode'; mode: ShipNavFlightMode }
  | { kind: 'orbit' }
  | { kind: 'dock' }
  | { kind: 'navigate'; waypointSymbol: string }
  | { kind: 'extractUntilFull' }
  | { kind: 'buyMax'; tradeSymbol: string }
  | { kind: 'sellAll'; keep?: string[] }
  | { kind: 'refuel' }
  /** Loop back to the first order (infinite loop until paused). */
  | { kind: 'repeat' };

/** Human-readable one-liner for an order (used in the logbook and UI). */
export function describeOrder(order: Order): string {
  switch (order.kind) {
    case 'setFlightMode':
      return `Set flight mode ${order.mode}`;
    case 'orbit':
      return 'Enter orbit';
    case 'dock':
      return 'Dock';
    case 'navigate':
      return `Navigate to ${order.waypointSymbol}`;
    case 'extractUntilFull':
      return 'Extract until cargo full';
    case 'buyMax':
      return `Buy max ${order.tradeSymbol}`;
    case 'sellAll':
      return order.keep?.length ? `Sell all (keep ${order.keep.join(', ')})` : 'Sell all cargo';
    case 'refuel':
      return 'Refuel';
    case 'repeat':
      return 'Repeat loop';
    default: {
      const _exhaustive: never = order;
      void _exhaustive;
      return 'Unknown order';
    }
  }
}

/**
 * Preset: mine at an asteroid, haul to a market, sell, refuel, and loop.
 */
export function miningLoopPreset(asteroidWaypoint: string, marketWaypoint: string): Order[] {
  return [
    { kind: 'setFlightMode', mode: 'CRUISE' },
    { kind: 'navigate', waypointSymbol: asteroidWaypoint },
    { kind: 'extractUntilFull' },
    { kind: 'navigate', waypointSymbol: marketWaypoint },
    { kind: 'dock' },
    { kind: 'sellAll' },
    { kind: 'refuel' },
    { kind: 'repeat' },
  ];
}

/**
 * Preset: buy a good at one market, sell it at another, refuel, and loop.
 */
export function tradeRunPreset(
  buyWaypoint: string,
  tradeSymbol: string,
  sellWaypoint: string,
): Order[] {
  return [
    { kind: 'setFlightMode', mode: 'CRUISE' },
    { kind: 'navigate', waypointSymbol: buyWaypoint },
    { kind: 'dock' },
    { kind: 'buyMax', tradeSymbol },
    { kind: 'navigate', waypointSymbol: sellWaypoint },
    { kind: 'dock' },
    { kind: 'sellAll', keep: [] },
    { kind: 'refuel' },
    { kind: 'repeat' },
  ];
}
