import {
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
} from 'three';
import { hasTrait, PlanetView } from '../../../models/system.model';
import { isDockableWaypoint, resolveWaypointType } from '../planet-helpers';
import { planetWorldPosition3d, SystemLayout3d } from './system-scene.layout';

const TYPE_PALETTE: Record<string, number> = {
  PLANET: 0x2563eb,
  GAS_GIANT: 0x7c3aed,
  MOON: 0x64748b,
  ORBITAL_STATION: 0xf59e0b,
  JUMP_GATE: 0x06b6d4,
  ASTEROID: 0x78716c,
  ASTEROID_FIELD: 0x57534e,
  ASTEROID_BASE: 0x92400e,
  ENGINEERED_ASTEROID: 0x0d9488,
  NEBULA: 0xec4899,
  DEBRIS_FIELD: 0x52525b,
  GRAVITY_WELL: 0x6366f1,
  ARTIFICIAL_GRAVITY_WELL: 0x818cf8,
  ARTIFICAL_GRAVITY_WELL: 0x818cf8,
  FUEL_STATION: 0xea580c,
  ARTIFACT: 0x10b981,
};

const TYPE_MARKER_SIZE: Record<string, number> = {
  PLANET: 2.2,
  GAS_GIANT: 3.5,
  MOON: 1.4,
  ORBITAL_STATION: 1.8,
  JUMP_GATE: 2.8,
  ASTEROID: 1.2,
  ASTEROID_FIELD: 1,
  ASTEROID_BASE: 1.6,
  ENGINEERED_ASTEROID: 1.4,
  NEBULA: 2.4,
  DEBRIS_FIELD: 1.1,
  GRAVITY_WELL: 2,
  ARTIFICIAL_GRAVITY_WELL: 2,
  ARTIFICAL_GRAVITY_WELL: 2,
  FUEL_STATION: 1.5,
  ARTIFACT: 2,
};

/** Trait-driven accent colors for the narrative radar. */
export const MARKETPLACE_COLOR = 0xfbbf24;
export const SHIPYARD_COLOR = 0x06b6d4;
const ACCENT_FALLBACK_COLOR = 0x22d3ee;

/** Returns the trait accent color for a waypoint, or null when it has no notable trait. */
export function waypointTraitColor(planet: PlanetView): number | null {
  if (hasTrait(planet, 'MARKETPLACE')) return MARKETPLACE_COLOR;
  if (hasTrait(planet, 'SHIPYARD')) return SHIPYARD_COLOR;
  return null;
}

export type GodViewFilter = 'important' | 'all' | 'markets' | 'ships';

export interface GodMarkerContext {
  filter: GodViewFilter;
  focusPlanetName: string | null;
  selectedPlanetName: string | null;
  shipCounts: Map<string, number>;
}

export function isWaypointVisibleInFilter(
  planet: PlanetView,
  ctx: GodMarkerContext,
): boolean {
  switch (ctx.filter) {
    case 'all':
      return true;
    case 'markets':
      return hasTrait(planet, 'MARKETPLACE');
    case 'ships':
      return (ctx.shipCounts.get(planet.name) ?? 0) > 0;
    case 'important':
      return (
        planet.name === ctx.focusPlanetName ||
        planet.name === ctx.selectedPlanetName ||
        (ctx.shipCounts.get(planet.name) ?? 0) > 0 ||
        hasTrait(planet, 'MARKETPLACE') ||
        hasTrait(planet, 'SHIPYARD') ||
        resolveWaypointType(planet.type) === 'JUMP_GATE' ||
        isDockableWaypoint(planet)
      );
    default: {
      const _exhaustive: never = ctx.filter;
      void _exhaustive;
      return true;
    }
  }
}

function markerSize(planet: PlanetView): number {
  const resolved = resolveWaypointType(planet.type);
  return TYPE_MARKER_SIZE[resolved] ?? 1.6;
}

function markerColor(planet: PlanetView): number {
  const trait = waypointTraitColor(planet);
  if (trait !== null) return trait;
  const resolved = resolveWaypointType(planet.type);
  return TYPE_PALETTE[resolved] ?? 0x38bdf8;
}

function hasAccent(planet: PlanetView, ctx: GodMarkerContext): boolean {
  return (
    planet.name === ctx.focusPlanetName ||
    planet.name === ctx.selectedPlanetName ||
    (ctx.shipCounts.get(planet.name) ?? 0) > 0 ||
    hasTrait(planet, 'MARKETPLACE') ||
    hasTrait(planet, 'SHIPYARD')
  );
}

export function buildGodViewMarkers(
  planets: PlanetView[],
  layout: SystemLayout3d,
  ctx: GodMarkerContext,
): Group {
  const group = new Group();
  group.name = 'god-view-markers';

  for (const planet of planets) {
    const visible = isWaypointVisibleInFilter(planet, ctx);
    const pos = planetWorldPosition3d(planet, layout);
    const size = markerSize(planet);
    const color = markerColor(planet);
    const accent = hasAccent(planet, ctx);

    const markerGroup = new Group();
    markerGroup.name = `marker-${planet.name}`;
    markerGroup.position.set(pos.x, 0.15, pos.z);
    markerGroup.userData['planet'] = planet;
    markerGroup.userData['markerRoot'] = true;
    markerGroup.visible = visible;

    const disc = new Mesh(
      new CircleGeometry(size, 24),
      new MeshBasicMaterial({
        color: new Color(color),
        transparent: true,
        opacity: accent ? 0.95 : 0.72,
        depthWrite: false,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.userData['planet'] = planet;
    markerGroup.add(disc);

    if (accent) {
      const ring = new Mesh(
        new RingGeometry(size * 1.35, size * 1.65, 32),
        new MeshBasicMaterial({
          color: waypointTraitColor(planet) ?? ACCENT_FALLBACK_COLOR,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.userData['planet'] = planet;
      markerGroup.add(ring);
    }

    group.add(markerGroup);
  }

  return group;
}

export function updateGodMarkerHighlights(
  markersGroup: Group,
  hoveredName: string | null,
  ctx: GodMarkerContext,
): void {
  markersGroup.traverse((child) => {
    if (!child.userData['markerRoot']) return;
    const planet = child.userData['planet'] as PlanetView | undefined;
    if (!planet) return;

    child.visible = isWaypointVisibleInFilter(planet, ctx);
    const isHovered = planet.name === hoveredName;
    child.scale.setScalar(isHovered ? 1.35 : 1);
  });
}

export function updateGodMarkerFilter(
  markersGroup: Group,
  ctx: GodMarkerContext,
): void {
  markersGroup.traverse((child) => {
    if (!child.userData['markerRoot']) return;
    const planet = child.userData['planet'] as PlanetView | undefined;
    if (!planet) return;
    child.visible = isWaypointVisibleInFilter(planet, ctx);
  });
}

export function syncMarkerPositions(
  markersGroup: Group,
  positions: ReadonlyMap<string, Vector3>,
): void {
  markersGroup.traverse((child) => {
    if (!child.userData['markerRoot']) return;
    const planet = child.userData['planet'] as PlanetView | undefined;
    if (!planet) return;
    const pos = positions.get(planet.name);
    if (pos) {
      child.position.set(pos.x, 0.15, pos.z);
    }
  });
}
