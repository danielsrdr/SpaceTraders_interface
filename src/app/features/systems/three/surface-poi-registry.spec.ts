import { PlanetView } from '../../../models/system.model';
import { resolveSurfacePois } from './surface-poi-registry';

function planet(type: string, traits: string[] = [], name = 'Test-Prime'): PlanetView {
  return {
    name,
    type,
    system: 'X1-TEST',
    position: { x: 0, y: 0 },
    traits: traits.map((symbol) => ({ symbol, name: symbol })),
  };
}

describe('resolveSurfacePois', () => {
  it('spawns market for MARKETPLACE trait', () => {
    const pois = resolveSurfacePois(planet('PLANET', ['MARKETPLACE']));
    expect(pois.some((p) => p.kind === 'market')).toBe(true);
  });

  it('spawns shipyard for SHIPYARD trait', () => {
    const pois = resolveSurfacePois(planet('PLANET', ['SHIPYARD']));
    expect(pois.some((p) => p.kind === 'shipyard')).toBe(true);
  });

  it('spawns mine for PLANET type', () => {
    const pois = resolveSurfacePois(planet('PLANET'));
    expect(pois.some((p) => p.kind === 'mine')).toBe(true);
  });

  it('labels gas giant mine as Siphon', () => {
    const pois = resolveSurfacePois(planet('GAS_GIANT'));
    const mine = pois.find((p) => p.kind === 'mine');
    expect(mine?.label).toBe('Siphon');
  });

  it('spawns ruins for ARTIFACT type', () => {
    const pois = resolveSurfacePois(planet('ARTIFACT'));
    expect(pois.some((p) => p.kind === 'ruins')).toBe(true);
  });

  it('spawns ruins for DEBRIS_FIELD type', () => {
    const pois = resolveSurfacePois(planet('DEBRIS_FIELD'));
    expect(pois.some((p) => p.kind === 'ruins')).toBe(true);
  });

  it('spawns depot for FUEL_STATION type', () => {
    const pois = resolveSurfacePois(planet('FUEL_STATION'));
    expect(pois.some((p) => p.kind === 'depot')).toBe(true);
  });

  it('spawns depot for ORBITAL_STATION type', () => {
    const pois = resolveSurfacePois(planet('ORBITAL_STATION'));
    expect(pois.some((p) => p.kind === 'depot')).toBe(true);
  });

  it('can spawn multiple POIs on a rich waypoint', () => {
    const pois = resolveSurfacePois(planet('PLANET', ['MARKETPLACE', 'SHIPYARD', 'MINERAL_DEPOSITS']));
    expect(pois.map((p) => p.kind)).toEqual(
      expect.arrayContaining(['market', 'shipyard', 'mine']),
    );
  });

  it('produces deterministic positions for the same planet name', () => {
    const a = resolveSurfacePois(planet('PLANET', ['MARKETPLACE'], 'Alpha-7'));
    const b = resolveSurfacePois(planet('PLANET', ['MARKETPLACE'], 'Alpha-7'));
    expect(a[0].position).toEqual(b[0].position);
  });
});
