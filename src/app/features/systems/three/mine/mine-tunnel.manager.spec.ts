import { createMineTunnelManager } from './mine-tunnel.manager';
import { Vector3 } from 'three';

describe('MineTunnelManager', () => {
  const pitConfig = { centerX: -15, centerZ: -12, seed: 42 };
  const tunnels = createMineTunnelManager(pitConfig, 42)!;

  beforeEach(() => {
    tunnels.ensureBuilt();
  });

  it('breakBlock removes solid collision', () => {
    const pick = tunnels.pickBlock(new Vector3(-15, 0, -12), new Vector3(0, 0, 1), 8);
    expect(pick).not.toBeNull();
    const { x, y, z } = pick!;
    expect(tunnels.isSolidBlock(x, y, z)).toBe(true);
    tunnels.breakBlock(x, y, z);
    expect(tunnels.isSolidBlock(x, y, z)).toBe(false);
  });

  it('tracks ore network progress', () => {
    const total = tunnels.getTotalOres();
    expect(total).toBeGreaterThan(0);

    const ore = tunnels.getOreNodes().find((n) => !n.broken);
    expect(ore).toBeDefined();
    const [x, y, z] = ore!.key.split(',').map(Number);
    const result = tunnels.breakBlock(x!, y!, z!);
    expect(result?.wasOre).toBe(true);
    expect(tunnels.getNetworkProgress()).toBeCloseTo(1 / total, 5);
  });
});
