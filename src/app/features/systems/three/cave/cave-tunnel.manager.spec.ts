import { Vector3 } from 'three';
import { createCaveTunnelManager } from './cave-tunnel.manager';

describe('CaveTunnelManager', () => {
  const tunnels = createCaveTunnelManager(20, -30, 12, 42)!;

  beforeEach(() => {
    tunnels.ensureBuilt();
  });

  it('breakBlock removes solid collision', () => {
    const spawn = tunnels.getInteriorSpawn();
    const pick = tunnels.pickBlock(
      new Vector3(spawn.x, spawn.y, spawn.z),
      new Vector3(0, 0, -1),
      8,
    );
    expect(pick).not.toBeNull();
    const { x, y, z } = pick!;
    expect(tunnels.isSolidBlock(x, y, z)).toBe(true);
    tunnels.breakBlock(x, y, z);
    expect(tunnels.isSolidBlock(x, y, z)).toBe(false);
  });

  it('tracks crystal network progress', () => {
    const total = tunnels.getTotalCrystals();
    expect(total).toBeGreaterThan(0);

    const crystal = tunnels.getCrystalNodes().find((n) => !n.broken);
    expect(crystal).toBeDefined();
    const [x, y, z] = crystal!.key.split(',').map(Number);
    const result = tunnels.breakBlock(x!, y!, z!);
    expect(result?.wasCrystal).toBe(true);
    expect(tunnels.getNetworkProgress()).toBeCloseTo(1 / total, 5);
  });
});
