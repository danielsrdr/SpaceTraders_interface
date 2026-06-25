import type { ShipData } from '../../models/ship.model';
import type { ShipModalTab } from './ship-hotspots';

export type ReadShipTab = 'reg' | 'nav' | 'crew' | 'frame' | 'react' | 'fuel' | 'cargo';

const READ_TABS: ReadonlySet<ReadShipTab> = new Set<ReadShipTab>([
  'reg',
  'nav',
  'crew',
  'frame',
  'react',
  'fuel',
  'cargo',
]);

export function isReadTab(tab: Exclude<ShipModalTab, null>): tab is ReadShipTab {
  return READ_TABS.has(tab as ReadShipTab);
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(options: readonly string[], seed: number): string {
  return options[seed % options.length];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function conditionWord(value: number): string {
  if (value >= 0.9) return 'pristine';
  if (value >= 0.7) return 'well-kept';
  if (value >= 0.45) return 'worn';
  if (value >= 0.2) return 'battered';
  return 'failing';
}

function fuelPercent(ship: ShipData): number {
  if (ship.fuel.capacity <= 0) return 100;
  return Math.round(clamp01(ship.fuel.current / ship.fuel.capacity) * 100);
}

function flavorReg(ship: ShipData, seed: number): string {
  const role = ship.registration.role.toLowerCase();
  const faction = ship.registration.factionSymbol;
  return pick(
    [
      `Registered to ${faction} as a ${role}; the transponder still pings clean.`,
      `Wears ${faction} markings, ${role} duty stamped across every plate.`,
      `Filed with ${faction} as a ${role} — papers in order, mostly.`,
    ],
    seed,
  );
}

function flavorNav(ship: ShipData, seed: number): string {
  const waypoint = ship.nav.waypointSymbol;
  const mode = String(ship.nav.flightMode).toLowerCase();
  switch (ship.nav.status) {
    case 'DOCKED':
      return pick(
        [
          `Berthed at ${waypoint}, umbilicals attached and engines cold.`,
          `Docked at ${waypoint}; deck crews work the gantry outside.`,
        ],
        seed,
      );
    case 'IN_ORBIT':
      return pick(
        [
          `Holding orbit over ${waypoint}, station-keeping thrusters ticking.`,
          `Parked in orbit at ${waypoint}, sensors sweeping the dark.`,
        ],
        seed,
      );
    case 'IN_TRANSIT': {
      const destination = ship.nav.route?.destination.symbol ?? 'open space';
      return `Underway to ${destination} on a ${mode} burn.`;
    }
    default:
      return `Navigation reads ${ship.nav.status} near ${waypoint}.`;
  }
}

function flavorCrew(ship: ShipData, seed: number): string {
  const { current, required, morale } = ship.crew;
  if (current < required) {
    return `Short-handed: ${current} aboard, ${required} needed — stations left unmanned.`;
  }
  if (morale >= 80) {
    return pick(
      [
        `${current} hands aboard, morale high — easy banter on the comms.`,
        `Crew of ${current} in good spirits; the galley smells of real coffee.`,
      ],
      seed,
    );
  }
  if (morale >= 50) return `${current} aboard, morale steady. Routine shifts, few complaints.`;
  if (morale >= 25) return `${current} aboard, morale low — grumbling drifts from the mess.`;
  return `${current} aboard, morale bottoming out. "Mutiny" is a word being whispered.`;
}

function flavorFrame(ship: ShipData, seed: number): string {
  const word = conditionWord(ship.frame.condition);
  const base = pick(
    [
      `The ${ship.frame.name} reads ${word} after its last tour.`,
      `Hull ${ship.frame.name}: ${word}, plating scarred by the void.`,
    ],
    seed,
  );
  if (ship.frame.condition < 0.4) {
    return `${base} Hairline fractures spider across the dorsal plating.`;
  }
  return base;
}

function flavorReact(ship: ShipData, seed: number): string {
  const word = conditionWord(ship.reactor.condition);
  const base = pick(
    [
      `${ship.reactor.name} holding ${word}, ${ship.reactor.powerOutput} power units on tap.`,
      `The ${ship.reactor.name} hums ${word} at ${ship.reactor.powerOutput} output.`,
    ],
    seed,
  );
  if (ship.reactor.condition < 0.4) {
    return `${base} Coolant warnings blink amber on the board.`;
  }
  return base;
}

function flavorFuel(ship: ShipData): string {
  if (ship.fuel.capacity <= 0) {
    return 'No fuel tanks — it runs on reactor draw and a solar trickle alone.';
  }
  const percent = fuelPercent(ship);
  if (percent >= 85) return `Tanks brimming at ${percent}% — good for a long haul.`;
  if (percent >= 50) return `Fuel at ${percent}%, plenty for local hops.`;
  if (percent >= 25) return `Fuel down to ${percent}% — plan a refuel soon.`;
  return `Fuel critical at ${percent}%. Drifting is one bad jump away.`;
}

function flavorCargo(ship: ShipData): string {
  const cargo = ship.cargo;
  if (!cargo) return 'Cargo manifest unavailable from here.';
  if (cargo.units === 0) return `Holds empty: ${cargo.capacity} units of space waiting to earn.`;
  const top = [...cargo.inventory].sort((a, b) => b.units - a.units)[0];
  const percent = cargo.capacity > 0 ? Math.round((cargo.units / cargo.capacity) * 100) : 0;
  const headline = top ? `, mostly ${top.symbol}` : '';
  return `Holds ${percent}% full${headline} (${cargo.units}/${cargo.capacity}).`;
}

export function buildPartFlavor(ship: ShipData, tab: Exclude<ShipModalTab, null>): string {
  const seed = hashSeed(`${ship.symbol}:${tab}`);
  switch (tab) {
    case 'reg':
      return flavorReg(ship, seed);
    case 'nav':
      return flavorNav(ship, seed);
    case 'crew':
      return flavorCrew(ship, seed);
    case 'frame':
      return flavorFrame(ship, seed);
    case 'react':
      return flavorReact(ship, seed);
    case 'fuel':
      return flavorFuel(ship);
    case 'cargo':
      return flavorCargo(ship);
    case 'maint':
    case 'upgrades':
    case 'refine':
      return '';
    default: {
      const _exhaustive: never = tab;
      void _exhaustive;
      return '';
    }
  }
}
