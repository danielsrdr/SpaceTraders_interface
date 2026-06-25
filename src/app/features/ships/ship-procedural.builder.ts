import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { ShipHotspotName } from './ship-hotspots';

type RoleProfile = 'cargo' | 'fighter' | 'satellite' | 'survey' | 'industrial' | 'command';

const ROLE_COLORS: Record<string, number> = {
  FABRICATOR: 0xf97316,
  HARVESTER: 0x84cc16,
  HAULER: 0x6366f1,
  INTERCEPTOR: 0xef4444,
  EXCAVATOR: 0xa16207,
  TRANSPORT: 0x3b82f6,
  REPAIR: 0x14b8a6,
  SURVEYOR: 0x06b6d4,
  COMMAND: 0xeab308,
  CARRIER: 0x8b5cf6,
  PATROL: 0xf43f5e,
  SATELLITE: 0xcbd5e1,
  EXPLORER: 0x22d3ee,
  REFINERY: 0xd97706,
};

const ROLE_PROFILE: Record<string, RoleProfile> = {
  FABRICATOR: 'industrial',
  HARVESTER: 'industrial',
  HAULER: 'cargo',
  INTERCEPTOR: 'fighter',
  EXCAVATOR: 'industrial',
  TRANSPORT: 'cargo',
  REPAIR: 'command',
  COMMAND: 'command',
  CARRIER: 'cargo',
  PATROL: 'fighter',
  SATELLITE: 'satellite',
  EXPLORER: 'survey',
  REFINERY: 'industrial',
};

export interface ProceduralShipResult {
  root: Group;
  reactorMeshes: Mesh[];
  hullMeshes: Mesh[];
}

function hullMaterial(color: number, emissive = 0x000000, emissiveIntensity = 0): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    metalness: 0.62,
    roughness: 0.28,
    emissive: new Color(emissive),
    emissiveIntensity,
  });
}

function shade(color: number, factor: number): number {
  const c = new Color(color);
  c.multiplyScalar(factor);
  return c.getHex();
}

function addHotspotMesh(
  parent: Object3D,
  name: ShipHotspotName,
  geometry: BoxGeometry | CylinderGeometry | ConeGeometry | SphereGeometry | TorusGeometry,
  material: MeshStandardMaterial,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function addDetail(
  parent: Object3D,
  geometry: BoxGeometry | CylinderGeometry | ConeGeometry | SphereGeometry | TorusGeometry,
  material: MeshStandardMaterial,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

function addSolarPanel(
  root: Group,
  accent: number,
  x: number,
  y: number,
  z: number,
  rotY: number,
): void {
  const panelMat = hullMaterial(shade(accent, 0.85), 0x1e3a8a, 0.08);
  const frameMat = hullMaterial(0x64748b);
  const panel = addDetail(root, new BoxGeometry(3.2, 0.06, 1.35), panelMat, [x, y, z], [0, rotY, 0]);
  addDetail(root, new BoxGeometry(3.25, 0.08, 1.4), frameMat, [x, y - 0.02, z], [0, rotY, 0]);
  for (let i = -1; i <= 1; i++) {
    addDetail(
      root,
      new BoxGeometry(0.04, 0.07, 1.2),
      hullMaterial(0x0f172a, 0x000000, 0),
      [x + Math.cos(rotY) * i * 0.9, y + 0.01, z + Math.sin(rotY) * i * 0.9],
      [0, rotY, 0],
    );
  }
  void panel;
}

function buildCargoVariant(root: Group, accent: number, hull: MeshStandardMaterial): Mesh[] {
  const reactors: Mesh[] = [];
  const dark = hullMaterial(shade(accent, 0.55));
  const trim = hullMaterial(shade(accent, 1.15));

  addHotspotMesh(root, 'hotspot-frame', new BoxGeometry(2.1, 0.75, 3.6), hull, [0, 0, 0.2]);
  addHotspotMesh(
    root,
    'hotspot-frame',
    new ConeGeometry(0.85, 1.6, 10),
    trim,
    [0, 0.05, -2.35],
    [Math.PI / 2, 0, 0],
  );
  addHotspotMesh(root, 'hotspot-cargo', new BoxGeometry(2.5, 1.15, 2.0), dark, [0, -0.12, 0.85]);
  addHotspotMesh(root, 'hotspot-crew', new BoxGeometry(0.95, 0.55, 0.85), hullMaterial(0x1e293b), [0, 0.62, -1.05]);
  addDetail(root, new SphereGeometry(0.35, 14, 14), hullMaterial(0x38bdf8, 0x0ea5e9, 0.25), [0, 0.72, -1.05]);
  addHotspotMesh(root, 'hotspot-reg', new BoxGeometry(0.42, 0.14, 0.28), hullMaterial(0xfbbf24, 0xfbbf24, 0.45), [0, 0.38, -0.75]);
  addHotspotMesh(root, 'hotspot-nav', new CylinderGeometry(0.06, 0.04, 1.5, 8), hullMaterial(0x60a5fa), [0, 1.05, -1.35], [0.28, 0, 0]);
  addHotspotMesh(root, 'hotspot-fuel', new CylinderGeometry(0.32, 0.38, 2.1, 12), hullMaterial(0x475569), [-1.25, -0.02, 0]);
  addHotspotMesh(root, 'hotspot-fuel', new CylinderGeometry(0.32, 0.38, 2.1, 12), hullMaterial(0x475569), [1.25, -0.02, 0]);
  addDetail(root, new BoxGeometry(3.4, 0.05, 0.55), trim, [0, 0.05, 0.35]);
  addDetail(root, new BoxGeometry(0.12, 0.35, 1.8), dark, [-1.15, -0.05, 0.35]);
  addDetail(root, new BoxGeometry(0.12, 0.35, 1.8), dark, [1.15, -0.05, 0.35]);

  for (const x of [-0.55, 0.55]) {
    reactors.push(
      addHotspotMesh(
        root,
        'hotspot-reactor',
        new CylinderGeometry(0.28, 0.38, 1.0, 10),
        hullMaterial(0x334155),
        [x, -0.08, 2.15],
        [Math.PI / 2, 0, 0],
      ),
    );
    reactors.push(
      addHotspotMesh(
        root,
        'hotspot-reactor',
        new ConeGeometry(0.22, 0.85, 10),
        hullMaterial(0x38bdf8, 0x0ea5e9, 0.95),
        [x, -0.08, 2.75],
        [Math.PI / 2, 0, 0],
      ),
    );
    addDetail(
      root,
      new TorusGeometry(0.18, 0.04, 8, 16),
      hullMaterial(0x7dd3fc, 0x38bdf8, 0.6),
      [x, -0.08, 2.5],
      [Math.PI / 2, 0, 0],
    );
  }

  return reactors;
}

function buildFighterVariant(root: Group, accent: number, hull: MeshStandardMaterial): Mesh[] {
  const reactors: Mesh[] = [];
  const trim = hullMaterial(shade(accent, 1.2));

  addHotspotMesh(root, 'hotspot-frame', new BoxGeometry(0.95, 0.42, 4.2), hull, [0, 0, 0.1]);
  addHotspotMesh(
    root,
    'hotspot-frame',
    new ConeGeometry(0.55, 1.4, 10),
    trim,
    [0, 0.02, -2.55],
    [Math.PI / 2, 0, 0],
  );
  addHotspotMesh(root, 'hotspot-crew', new SphereGeometry(0.42, 14, 14), hullMaterial(0x0f172a), [0, 0.12, -1.55]);
  addDetail(root, new BoxGeometry(0.7, 0.08, 0.35), hullMaterial(0x38bdf8, 0x0ea5e9, 0.3), [0, 0.18, -1.55]);
  addHotspotMesh(root, 'hotspot-reg', new BoxGeometry(0.3, 0.1, 0.22), hullMaterial(0xfbbf24, 0xfbbf24, 0.5), [0, 0.02, -1.25]);
  addHotspotMesh(root, 'hotspot-nav', new BoxGeometry(0.12, 0.75, 0.12), hullMaterial(0x60a5fa), [0, 0.48, -1.85]);
  addHotspotMesh(root, 'hotspot-cargo', new BoxGeometry(0.75, 0.28, 1.0), hullMaterial(shade(accent, 0.7)), [0, -0.04, 0.35]);
  addHotspotMesh(root, 'hotspot-fuel', new CylinderGeometry(0.16, 0.2, 1.4, 10), hullMaterial(0x64748b), [-0.48, -0.08, 0.15]);
  addHotspotMesh(root, 'hotspot-fuel', new CylinderGeometry(0.16, 0.2, 1.4, 10), hullMaterial(0x64748b), [0.48, -0.08, 0.15]);
  addHotspotMesh(root, 'hotspot-frame', new BoxGeometry(2.6, 0.06, 1.1), trim, [0, 0.02, 0.15]);
  addHotspotMesh(root, 'hotspot-frame', new BoxGeometry(0.75, 0.05, 1.5), trim, [-0.95, 0.04, 0.15], [0, 0, 0.5]);
  addHotspotMesh(root, 'hotspot-frame', new BoxGeometry(0.75, 0.05, 1.5), trim, [0.95, 0.04, 0.15], [0, 0, -0.5]);

  reactors.push(
    addHotspotMesh(
      root,
      'hotspot-reactor',
      new ConeGeometry(0.28, 1.5, 10),
      hullMaterial(0xf97316, 0xea580c, 1),
      [0, 0, 2.45],
      [Math.PI / 2, 0, 0],
    ),
  );
  addDetail(
    root,
    new TorusGeometry(0.2, 0.035, 8, 16),
    hullMaterial(0xfdba74, 0xea580c, 0.8),
    [0, 0, 2.15],
    [Math.PI / 2, 0, 0],
  );

  return reactors;
}

function buildSatelliteVariant(root: Group, accent: number, hull: MeshStandardMaterial): Mesh[] {
  const reactors: Mesh[] = [];
  const busMat = hullMaterial(shade(accent, 0.75));
  const foilMat = hullMaterial(0xd4af37, 0x92400e, 0.06);

  addHotspotMesh(root, 'hotspot-frame', new BoxGeometry(1.1, 1.0, 1.1), busMat, [0, 0, 0]);
  addDetail(root, new BoxGeometry(1.15, 0.08, 1.15), hullMaterial(0x64748b), [0, 0.52, 0]);
  addDetail(root, new BoxGeometry(1.15, 0.08, 1.15), hullMaterial(0x64748b), [0, -0.52, 0]);

  addSolarPanel(root, accent, 0, 0, -2.0, 0);
  addSolarPanel(root, accent, 0, 0, 2.0, Math.PI);
  addDetail(root, new BoxGeometry(0.08, 1.0, 0.08), hullMaterial(0x475569), [0, 0, -0.95]);
  addDetail(root, new BoxGeometry(0.08, 1.0, 0.08), hullMaterial(0x475569), [0, 0, 0.95]);

  addHotspotMesh(
    root,
    'hotspot-nav',
    new CylinderGeometry(0.55, 0.55, 0.12, 20),
    hullMaterial(0xe2e8f0),
    [0, 0.62, 0],
  );
  addHotspotMesh(
    root,
    'hotspot-nav',
    new ConeGeometry(0.38, 0.45, 16),
    hullMaterial(0xf8fafc),
    [0, 0.95, 0],
  );
  addDetail(root, new CylinderGeometry(0.04, 0.04, 1.2, 8), hullMaterial(0x60a5fa), [0.45, 0.75, 0], [0.15, 0, 0.35]);
  addDetail(root, new CylinderGeometry(0.03, 0.02, 0.9, 8), hullMaterial(0x60a5fa), [-0.4, 0.7, 0.15], [0.1, 0, -0.25]);

  addHotspotMesh(root, 'hotspot-reg', new BoxGeometry(0.35, 0.1, 0.25), hullMaterial(0xfbbf24, 0xfbbf24, 0.5), [0.35, 0.15, -0.35]);
  addHotspotMesh(root, 'hotspot-crew', new BoxGeometry(0.45, 0.35, 0.45), hullMaterial(0x1e293b), [0, 0.08, -0.2]);
  addHotspotMesh(root, 'hotspot-cargo', new BoxGeometry(0.55, 0.45, 0.55), foilMat, [-0.35, -0.05, 0.2]);
  addHotspotMesh(root, 'hotspot-fuel', new BoxGeometry(0.35, 0.55, 0.35), hullMaterial(0x57534e), [0.42, -0.12, 0.15]);

  reactors.push(
    addHotspotMesh(
      root,
      'hotspot-reactor',
      new CylinderGeometry(0.14, 0.1, 0.35, 10),
      hullMaterial(0x1e293b),
      [0, -0.05, 0.72],
    ),
  );
  reactors.push(
    addHotspotMesh(
      root,
      'hotspot-reactor',
      new ConeGeometry(0.12, 0.55, 10),
      hullMaterial(0x38bdf8, 0x0ea5e9, 1),
      [0, -0.05, 1.05],
      [Math.PI / 2, 0, 0],
    ),
  );
  reactors.push(
    addHotspotMesh(
      root,
      'hotspot-reactor',
      new ConeGeometry(0.08, 0.35, 8),
      hullMaterial(0x7dd3fc, 0x0ea5e9, 0.85),
      [-0.18, -0.05, 0.95],
      [Math.PI / 2, 0, 0.35],
    ),
  );
  reactors.push(
    addHotspotMesh(
      root,
      'hotspot-reactor',
      new ConeGeometry(0.08, 0.35, 8),
      hullMaterial(0x7dd3fc, 0x0ea5e9, 0.85),
      [0.18, -0.05, 0.95],
      [Math.PI / 2, 0, -0.35],
    ),
  );

  root.scale.set(1.15, 1.15, 1.15);
  return reactors;
}

function buildIndustrialVariant(root: Group, accent: number, hull: MeshStandardMaterial): Mesh[] {
  const reactors: Mesh[] = [];

  addHotspotMesh(root, 'hotspot-frame', new BoxGeometry(1.85, 0.92, 3.35), hull, [0, 0, 0]);
  addHotspotMesh(root, 'hotspot-cargo', new BoxGeometry(1.45, 1.05, 1.45), hullMaterial(shade(accent, 0.65), 0x451a03, 0.12), [0, -0.08, 0.82]);
  addHotspotMesh(root, 'hotspot-crew', new BoxGeometry(0.92, 0.62, 0.82), hullMaterial(0x334155), [0, 0.52, -0.92]);
  addHotspotMesh(root, 'hotspot-reg', new BoxGeometry(0.42, 0.14, 0.28), hullMaterial(0xfbbf24, 0xfbbf24, 0.4), [0, 0.32, -0.68]);
  addHotspotMesh(root, 'hotspot-nav', new BoxGeometry(0.18, 0.9, 0.18), hullMaterial(0x60a5fa), [0.68, 0.85, -0.45]);
  addHotspotMesh(root, 'hotspot-fuel', new CylinderGeometry(0.36, 0.42, 1.85, 12), hullMaterial(0x57534e), [-1.1, 0, -0.08]);
  addHotspotMesh(root, 'hotspot-fuel', new CylinderGeometry(0.36, 0.42, 1.85, 12), hullMaterial(0x57534e), [1.1, 0, -0.08]);
  addDetail(root, new BoxGeometry(0.72, 0.72, 0.72), hullMaterial(shade(accent, 0.85)), [-1.22, 0.12, 0.45]);
  addDetail(root, new BoxGeometry(0.72, 0.72, 0.72), hullMaterial(shade(accent, 0.85)), [1.22, 0.12, 0.45]);

  for (const x of [-0.48, 0.48]) {
    reactors.push(
      addHotspotMesh(
        root,
        'hotspot-reactor',
        new ConeGeometry(0.42, 1.05, 10),
        hullMaterial(0xfbbf24, 0xd97706, 0.95),
        [x, -0.04, 1.95],
        [Math.PI / 2, 0, 0],
      ),
    );
  }

  return reactors;
}

/**
 * Capital corvette: a long octagonal hull with a pointed bow, a raised command
 * bridge with a lit window strip, twin outrigger engine nacelles, and a central
 * main thruster. Forward is -Z (bow), aft is +Z (exhaust). Every hotspot name is
 * represented so the 3D ship inspector keeps working.
 */
function buildCruiserVariant(root: Group, accent: number, hull: MeshStandardMaterial): Mesh[] {
  const reactors: Mesh[] = [];
  const panel = hullMaterial(shade(accent, 0.72));
  const trim = hullMaterial(shade(accent, 1.25), accent, 0.28);
  const glow = hullMaterial(0x67e8f9, 0x22d3ee, 1.5);
  const windowMat = hullMaterial(0x0ea5e9, 0x38bdf8, 1.1);

  // Central hull: bow cone + faceted main body + tapered stern (flattened).
  const body = new Group();
  addHotspotMesh(body, 'hotspot-frame', new ConeGeometry(0.6, 2.0, 8), trim, [0, 0, -2.4], [-Math.PI / 2, 0, 0]);
  addHotspotMesh(body, 'hotspot-frame', new CylinderGeometry(0.6, 0.74, 2.8, 8), hull, [0, 0, -0.4], [Math.PI / 2, 0, 0]);
  addHotspotMesh(body, 'hotspot-frame', new CylinderGeometry(0.74, 0.55, 1.4, 8), panel, [0, 0, 1.55], [Math.PI / 2, 0, 0]);
  body.scale.set(1.12, 0.72, 1.0);
  root.add(body);

  // Stepped command bridge + lit cockpit window strip.
  addHotspotMesh(root, 'hotspot-crew', new BoxGeometry(0.82, 0.44, 1.35), panel, [0, 0.52, -0.7]);
  addDetail(root, new BoxGeometry(0.6, 0.3, 0.7), trim, [0, 0.85, -0.85]);
  addDetail(root, new BoxGeometry(0.64, 0.1, 0.18), windowMat, [0, 0.62, -1.34]);

  // Antenna mast + sensor blister + registration plate.
  addHotspotMesh(root, 'hotspot-nav', new CylinderGeometry(0.025, 0.025, 0.95, 6), hullMaterial(0x93c5fd), [0, 1.1, -0.55]);
  addDetail(root, new SphereGeometry(0.07, 10, 10), hullMaterial(0x93c5fd, 0x60a5fa, 0.9), [0, 1.55, -0.55]);
  addHotspotMesh(root, 'hotspot-reg', new BoxGeometry(0.4, 0.05, 0.6), hullMaterial(0xfbbf24, 0xfbbf24, 0.5), [0.46, 0.2, 0.2]);

  // Ventral cargo/sensor block.
  addHotspotMesh(root, 'hotspot-cargo', new BoxGeometry(0.9, 0.45, 1.9), panel, [0, -0.44, 0.2]);

  // Twin engine nacelles on outrigger pylons.
  for (const side of [-1, 1]) {
    addDetail(root, new BoxGeometry(1.0, 0.12, 0.5), trim, [side * 0.82, -0.1, 1.35], [0, 0, side * 0.12]);
    addHotspotMesh(root, 'hotspot-fuel', new CylinderGeometry(0.27, 0.31, 2.3, 12), panel, [side * 1.4, -0.12, 1.05], [Math.PI / 2, 0, 0]);
    addDetail(root, new ConeGeometry(0.27, 0.65, 14), trim, [side * 1.4, -0.12, -0.35], [-Math.PI / 2, 0, 0]);
    reactors.push(
      addHotspotMesh(root, 'hotspot-reactor', new ConeGeometry(0.27, 0.95, 14), glow, [side * 1.4, -0.12, 2.45], [Math.PI / 2, 0, 0]),
    );
    addDetail(root, new TorusGeometry(0.25, 0.045, 10, 20), hullMaterial(0xa5f3fc, 0x22d3ee, 0.9), [side * 1.4, -0.12, 2.05], [Math.PI / 2, 0, 0]);
  }

  // Central main thruster.
  reactors.push(
    addHotspotMesh(root, 'hotspot-reactor', new ConeGeometry(0.42, 1.05, 16), glow, [0, -0.05, 2.55], [Math.PI / 2, 0, 0]),
  );
  addDetail(root, new TorusGeometry(0.36, 0.05, 12, 24), hullMaterial(0xa5f3fc, 0x22d3ee, 0.9), [0, -0.05, 2.15], [Math.PI / 2, 0, 0]);

  return reactors;
}

export function buildProceduralShip(role: string): ProceduralShipResult {
  const profile = ROLE_PROFILE[role] ?? 'cargo';
  const accent = ROLE_COLORS[role] ?? 0x6366f1;
  const root = new Group();
  root.name = `ship-${role}`;

  // Faint accent self-illumination so the hull keeps its colour and never
  // reads as a flat black silhouette when it drifts away from the sun.
  const hull = hullMaterial(accent, accent, 0.22);

  let reactorMeshes: Mesh[] = [];
  switch (profile) {
    case 'cargo':
      reactorMeshes = buildCargoVariant(root, accent, hull);
      break;
    case 'fighter':
      reactorMeshes = buildFighterVariant(root, accent, hull);
      break;
    case 'satellite':
      reactorMeshes = buildSatelliteVariant(root, accent, hull);
      break;
    case 'survey':
      reactorMeshes = buildCruiserVariant(root, accent, hull);
      break;
    case 'industrial':
      reactorMeshes = buildIndustrialVariant(root, accent, hull);
      break;
    case 'command':
      reactorMeshes = buildCruiserVariant(root, accent, hull);
      break;
    default: {
      const _exhaustive: never = profile;
      reactorMeshes = buildCargoVariant(root, accent, hull);
      void _exhaustive;
      break;
    }
  }

  const hullMeshes: Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof Mesh && (child.name === 'hotspot-frame' || child.name === 'hotspot-cargo')) {
      hullMeshes.push(child);
    }
  });

  root.rotation.y = Math.PI * 0.12;
  return { root, reactorMeshes, hullMeshes };
}

export function disposeShip(root: Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}
