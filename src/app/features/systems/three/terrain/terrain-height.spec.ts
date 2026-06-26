import { buildSurfacePoiConfig } from '../surface-poi';
import { createTerrainHeightField } from './terrain-height';
import { PIT_RADIUS } from '../mine/mine-pit.builder';
import { PlanetView } from '../../../../models/system.model';

describe('TerrainHeightField spawn', () => {
  function planet(name: string): PlanetView {
    return {
      name,
      type: 'PLANET',
      system: 'TEST',
      position: { x: 0, y: 0 },
      traits: [{ symbol: 'MINERAL_DEPOSITS', name: 'Mineral Deposits' }],
    };
  }

  it('spawns on pit rim when mine POI exists', () => {
    const config = buildSurfacePoiConfig(planet('Rim-Spawn-I'));
    expect(config.hasMine).toBe(true);
    expect(config.poi.mine).not.toBeNull();

    const field = createTerrainHeightField(config);
    const spawn = field.getSpawn();
    const pit = field.getPitConfig()!;

    const dist = Math.hypot(spawn.x - pit.centerX, spawn.z - pit.centerZ);
    expect(dist).toBeGreaterThan(PIT_RADIUS * 0.85);
    expect(dist).toBeLessThan(PIT_RADIUS + 2);
    expect(spawn.x).not.toBe(0);
  });
});
