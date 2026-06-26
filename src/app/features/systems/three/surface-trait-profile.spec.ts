import { buildSurfaceTraitProfile } from './surface-trait-profile';
import { PlanetView } from '../../../models/system.model';

describe('buildSurfaceTraitProfile', () => {
  function planet(traits: string[]): PlanetView {
    return {
      name: 'Test-IV',
      type: 'PLANET',
      system: 'TEST',
      position: { x: 0, y: 0 },
      traits: traits.map((symbol) => ({ symbol, name: symbol })),
    };
  }

  it('biases jungle when JUNGLE trait is present', () => {
    const profile = buildSurfaceTraitProfile(planet(['JUNGLE']));
    expect(profile.biomeBias.jungle).toBeGreaterThan(0.3);
    expect(profile.weatherPool).toContain('sand-storm');
  });

  it('adds aurora weather for FROZEN trait', () => {
    const profile = buildSurfaceTraitProfile(planet(['FROZEN']));
    expect(profile.weatherPool).toContain('aurora');
  });

  it('adds acid rain and hazard for HAZARDOUS trait', () => {
    const profile = buildSurfaceTraitProfile(planet(['HAZARDOUS']));
    expect(profile.weatherPool).toContain('acid-rain');
    expect(profile.hazardLevel).toBeGreaterThan(0.5);
  });

  it('combines JUNGLE and HAZARDOUS traits', () => {
    const profile = buildSurfaceTraitProfile(planet(['JUNGLE', 'HAZARDOUS']));
    expect(profile.biomeBias.jungle).toBeGreaterThan(0);
    expect(profile.weatherPool).toContain('acid-rain');
  });
});
