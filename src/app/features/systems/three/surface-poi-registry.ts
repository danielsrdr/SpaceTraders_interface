import { PlanetView, hasTrait } from '../../../models/system.model';
import {
  isAsteroidWaypoint,
  isGasGiantWaypoint,
  resolveWaypointType,
} from '../planet-helpers';
import { planetSeedInt } from './planet-seed';
import type { SurfaceZoneKind } from './system-view-mode';

export interface SurfacePoiDefinition {
  kind: SurfaceZoneKind;
  label: string;
  /** Absolute world X/Z anchor (seeded per planet). */
  position: { x: number; z: number };
  priority: number;
}

interface PoiRule {
  kind: SurfaceZoneKind;
  label: string | ((planet: PlanetView) => string);
  priority: number;
  matches: (planet: PlanetView) => boolean;
  position: (seed: number) => { x: number; z: number };
}

const POI_RULES: PoiRule[] = [
  {
    kind: 'market',
    label: 'Market',
    priority: 80,
    matches: (p) => hasTrait(p, 'MARKETPLACE'),
    position: (seed) => ({
      x: 8 + (seed % 6),
      z: 8 + ((seed >> 3) % 6),
    }),
  },
  {
    kind: 'shipyard',
    label: 'Shipyard',
    priority: 75,
    matches: (p) => hasTrait(p, 'SHIPYARD'),
    position: (seed) => ({
      x: -6 - ((seed >> 2) % 6),
      z: 10 + ((seed >> 5) % 6),
    }),
  },
  {
    kind: 'mine',
    label: (p) => (isGasGiantWaypoint(p) ? 'Siphon' : 'Mine'),
    priority: 70,
    matches: (p) =>
      isAsteroidWaypoint(p) ||
      isGasGiantWaypoint(p) ||
      hasTrait(p, 'MINERAL_DEPOSITS') ||
      resolveWaypointType(p.type) === 'PLANET',
    position: (seed) => ({
      x: -12 - ((seed >> 6) % 8),
      z: -10 - ((seed >> 10) % 8),
    }),
  },
  {
    kind: 'ruins',
    label: 'Ruins',
    priority: 60,
    matches: (p) => {
      const type = resolveWaypointType(p.type);
      return type === 'ARTIFACT' || type === 'DEBRIS_FIELD';
    },
    position: (seed) => ({
      x: 12 + ((seed >> 8) % 6),
      z: -8 - ((seed >> 12) % 6),
    }),
  },
  {
    kind: 'depot',
    label: 'Fuel Depot',
    priority: 55,
    matches: (p) => {
      const type = resolveWaypointType(p.type);
      return type === 'FUEL_STATION' || type === 'ORBITAL_STATION';
    },
    position: (seed) => ({
      x: (seed >> 14) % 6,
      z: -14 - ((seed >> 16) % 6),
    }),
  },
  {
    kind: 'cave',
    label: 'Cave',
    priority: 45,
    matches: (p) => !isGasGiantWaypoint(p) && (planetSeedInt(p.name) >> 18) % 3 === 0,
    position: (seed) => ({
      x: 18 + ((seed >> 20) % 10),
      z: 14 + ((seed >> 24) % 10),
    }),
  },
];

/** Resolve which surface POIs to spawn for a waypoint from traits and type. */
export function resolveSurfacePois(planet: PlanetView): SurfacePoiDefinition[] {
  const seed = planetSeedInt(planet.name);
  const pois: SurfacePoiDefinition[] = [];

  for (const rule of POI_RULES) {
    if (!rule.matches(planet)) continue;
    const label = typeof rule.label === 'function' ? rule.label(planet) : rule.label;
    pois.push({
      kind: rule.kind,
      label,
      position: rule.position(seed),
      priority: rule.priority,
    });
  }

  return pois;
}
