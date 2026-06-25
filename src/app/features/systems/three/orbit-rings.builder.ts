import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Material,
  Vector3,
} from 'three';
import { PlanetView } from '../../../models/system.model';
import { planetWorldPosition3d, SystemLayout3d } from './system-scene.layout';
import {
  isWaypointVisibleInFilter,
  waypointTraitColor,
  type GodMarkerContext,
  type GodViewFilter,
} from './god-view-markers.builder';

const BAND_TOLERANCE = 10;
const RING_COLOR = 0x38bdf8;
const TICK_COLOR = 0x64748b;

function bucketOrbitRadii(radii: number[]): number[] {
  const sorted = [...radii].sort((a, b) => a - b);
  const bands: number[] = [];

  for (const radius of sorted) {
    const existing = bands.find((b) => Math.abs(b - radius) <= BAND_TOLERANCE);
    if (existing !== undefined) {
      const index = bands.indexOf(existing);
      bands[index] = (existing + radius) / 2;
    } else {
      bands.push(radius);
    }
  }

  return bands;
}

function buildOrbitBand(radius: number): Line {
  const segments = 128;
  const positions: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(angle) * radius, 0.04, Math.sin(angle) * radius);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

  return new Line(
    geometry,
    new LineBasicMaterial({
      color: RING_COLOR,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    }),
  );
}

function buildRadialTick(
  planet: PlanetView,
  layout: SystemLayout3d,
): Line {
  const trait = waypointTraitColor(planet);
  const color = trait ?? TICK_COLOR;
  const opacity = trait !== null ? 0.55 : 0.35;
  const pos = planetWorldPosition3d(planet, layout);
  const dist = Math.hypot(pos.x, pos.z);
  if (dist < 1) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0.06, 0, 0, 0.06, 0], 3));
    return new Line(
      geometry,
      new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
    );
  }

  const endX = (pos.x / dist) * dist;
  const endZ = (pos.z / dist) * dist;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([0, 0.06, 0, endX, 0.06, endZ], 3),
  );

  const line = new Line(
    geometry,
    new LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  );
  line.userData['planet'] = planet;
  return line;
}

export function buildOrbitRings(
  planets: PlanetView[],
  layout: SystemLayout3d,
  filter: GodViewFilter = 'important',
  ctx?: Partial<GodMarkerContext>,
): Group {
  const group = new Group();
  group.name = 'orbit-rings';

  const radii = planets.map((planet) => {
    const pos = planetWorldPosition3d(planet, layout);
    return Math.max(8, Math.hypot(pos.x, pos.z));
  });

  const bands = bucketOrbitRadii(radii);
  for (const radius of bands) {
    group.add(buildOrbitBand(radius));
  }

  const markerCtx: GodMarkerContext = {
    filter,
    focusPlanetName: ctx?.focusPlanetName ?? null,
    selectedPlanetName: ctx?.selectedPlanetName ?? null,
    shipCounts: ctx?.shipCounts ?? new Map(),
  };

  for (const planet of planets) {
    if (!isWaypointVisibleInFilter(planet, markerCtx)) continue;
    group.add(buildRadialTick(planet, layout));
  }

  return group;
}

export function updateOrbitTicks(
  group: Group,
  planets: PlanetView[],
  layout: SystemLayout3d,
  ctx: GodMarkerContext,
): void {
  const tickChildren = group.children.filter((c) => c.userData['planet']);
  for (const child of tickChildren) {
    group.remove(child);
    child.traverse((obj) => {
      if ('geometry' in obj && obj.geometry) {
        (obj.geometry as BufferGeometry).dispose();
      }
      if ('material' in obj && obj.material) {
        const mat = obj.material as Material | Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  }

  for (const planet of planets) {
    if (!isWaypointVisibleInFilter(planet, ctx)) continue;
    group.add(buildRadialTick(planet, layout));
  }
}

export function syncOrbitTickPositions(
  group: Group,
  positions: ReadonlyMap<string, Vector3>,
): void {
  for (const child of group.children) {
    const planet = child.userData['planet'] as PlanetView | undefined;
    if (!planet || !(child instanceof Line)) continue;

    const pos = positions.get(planet.name);
    if (!pos) continue;

    const dist = Math.hypot(pos.x, pos.z);
    const geometry = child.geometry as BufferGeometry;
    const attr = geometry.getAttribute('position') as Float32BufferAttribute;
    if (dist < 1) {
      attr.setXYZ(0, 0, 0.06, 0);
      attr.setXYZ(1, 0, 0.06, 0);
    } else {
      attr.setXYZ(0, 0, 0.06, 0);
      attr.setXYZ(1, pos.x, 0.06, pos.z);
    }
    attr.needsUpdate = true;
  }
}
