import {
  createSurfaceColliderRegistry,
  horizontalOverlap,
  type SurfaceCollider,
} from './surface-collider-registry';

function box(
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  baseY: number,
  topY: number,
): SurfaceCollider {
  return { kind: 'box', minX, maxX, minZ, maxZ, baseY, topY };
}

function cylinder(
  x: number,
  z: number,
  radius: number,
  baseY: number,
  topY: number,
): SurfaceCollider {
  return { kind: 'cylinder', x, z, radius, baseY, topY };
}

describe('horizontalOverlap', () => {
  it('detects a disc overlapping a box (including the radius margin)', () => {
    const b = box(-1, 1, -1, 1, 0, 2);
    expect(horizontalOverlap(b, 0, 0, 0.35)).toBe(true);
    // 0.3 outside the +X face, disc radius 0.35 -> just touches.
    expect(horizontalOverlap(b, 1.3, 0, 0.35)).toBe(true);
    // 0.5 outside the +X face, disc radius 0.35 -> clear.
    expect(horizontalOverlap(b, 1.5, 0, 0.35)).toBe(false);
  });

  it('detects a disc overlapping a cylinder by summed radii', () => {
    const c = cylinder(5, 5, 0.3, 0, 3);
    expect(horizontalOverlap(c, 5, 5, 0.35)).toBe(true);
    expect(horizontalOverlap(c, 5.6, 5, 0.35)).toBe(true); // dist 0.6 <= 0.65
    expect(horizontalOverlap(c, 5.7, 5, 0.35)).toBe(false); // dist 0.7 > 0.65
  });
});

describe('SurfaceColliderRegistry.queryNear', () => {
  it('returns only colliders in cells near the query point', () => {
    const registry = createSurfaceColliderRegistry();
    const near = box(-1, 1, -1, 1, 0, 2);
    const far = box(99, 101, 99, 101, 0, 2);
    registry.add(near);
    registry.add(far);

    const result = registry.queryNear(0, 0, 0.35);
    expect(result).toContain(near);
    expect(result).not.toContain(far);
  });

  it('does not return duplicates for a collider spanning several cells', () => {
    const registry = createSurfaceColliderRegistry();
    const wide = box(-20, 20, -1, 1, 0, 2);
    registry.add(wide);
    const result = registry.queryNear(0, 0, 5);
    expect(result.filter((c) => c === wide).length).toBe(1);
  });
});

describe('SurfaceColliderRegistry.removeTag', () => {
  it('removes only colliders added under the given tag', () => {
    const registry = createSurfaceColliderRegistry();
    const staticBox = box(-1, 1, -1, 1, 0, 2);
    const marketBox = box(-1, 1, -1, 1, 0, 2);
    registry.add(staticBox, 'static');
    registry.add(marketBox, 'market');

    registry.removeTag('market');

    const result = registry.queryNear(0, 0, 0.35);
    expect(result).toContain(staticBox);
    expect(result).not.toContain(marketBox);
  });

  it('is a no-op for an unknown tag', () => {
    const registry = createSurfaceColliderRegistry();
    registry.add(box(-1, 1, -1, 1, 0, 2));
    expect(() => registry.removeTag('nope')).not.toThrow();
    expect(registry.queryNear(0, 0, 0.35).length).toBe(1);
  });
});

describe('SurfaceColliderRegistry.blocksBody', () => {
  const registry = createSurfaceColliderRegistry();
  // A waist-high counter sitting on the ground at y in [0.35, 1.35].
  registry.add(box(-1.3, 1.3, -0.9, 0.9, 0.35, 1.35));

  it('blocks a standing capsule body that overlaps vertically', () => {
    // feet 0, body lower 0.4, head 1.7 -> overlaps the counter.
    expect(registry.blocksBody(0, 0, 0.35, 0.4, 1.7)).toBe(true);
  });

  it('does not block when the capsule body is entirely above the collider', () => {
    // Standing on top: body lower 1.4 is above the counter top 1.35.
    expect(registry.blocksBody(0, 0, 0.35, 1.4, 2.7)).toBe(false);
  });

  it('does not block when horizontally clear', () => {
    expect(registry.blocksBody(5, 5, 0.35, 0.4, 1.7)).toBe(false);
  });
});

describe('SurfaceColliderRegistry.maxSupportTop', () => {
  it('returns the highest reachable collider top under the footprint', () => {
    const registry = createSurfaceColliderRegistry();
    registry.add(box(-1, 1, -1, 1, 0, 0.3)); // low step
    registry.add(box(-1, 1, -1, 1, 0, 0.2)); // lower step

    // maxTopY = feet(0) + step(0.4) = 0.4 -> both reachable, pick 0.3.
    expect(registry.maxSupportTop(0, 0, 0.35, 0.4)).toBeCloseTo(0.3, 6);
  });

  it('ignores collider tops above the reach threshold', () => {
    const registry = createSurfaceColliderRegistry();
    registry.add(box(-1, 1, -1, 1, 0, 1.35)); // tall wall/counter
    expect(registry.maxSupportTop(0, 0, 0.35, 0.4)).toBe(-Infinity);
  });
});

describe('SurfaceColliderRegistry.minCeilingBase', () => {
  it('returns the lowest collider base above the head', () => {
    const registry = createSurfaceColliderRegistry();
    registry.add(box(-1, 1, -1, 1, 3, 4)); // overhang at base 3
    registry.add(box(-1, 1, -1, 1, 5, 6)); // higher overhang

    expect(registry.minCeilingBase(0, 0, 0.35, 1.7)).toBeCloseTo(3, 6);
  });

  it('returns +Infinity when nothing is overhead', () => {
    const registry = createSurfaceColliderRegistry();
    registry.add(box(-1, 1, -1, 1, 0, 1.35));
    expect(registry.minCeilingBase(0, 0, 0.35, 1.7)).toBe(Infinity);
  });
});
