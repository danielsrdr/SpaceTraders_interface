import {
  EARTH_GRAVITY_MS2,
  SOLAR_MU_KM3_S2,
  bodyPhysics,
  displayMeanMotion,
  equilibriumTemperatureK,
  fitStarRadiusKm,
  orbitalPeriodSec,
  renderBodyRadius,
  starProfile,
  universeTimeSec,
  UNIVERSE_TIME_SCALE,
  AU_KM,
} from './universe-physics';

function body(name: string, type: string, traits: string[] = []) {
  return { name, type, traits: traits.map((symbol) => ({ symbol, name: symbol })) };
}

describe('universe-physics', () => {
  it('gives an Earth-class planet an Earth-like surface gravity', () => {
    const g = bodyPhysics(body('X1-TEST-A1', 'PLANET')).surfaceGravityMs2;
    expect(g).toBeGreaterThan(EARTH_GRAVITY_MS2 * 0.4);
    expect(g).toBeLessThan(EARTH_GRAVITY_MS2 * 1.8);
  });

  it('orders gravity by gravity traits at identical size', () => {
    const weak = bodyPhysics(body('X1-TEST-B1', 'PLANET', ['WEAK_GRAVITY'])).surfaceGravityMs2;
    const base = bodyPhysics(body('X1-TEST-B1', 'PLANET')).surfaceGravityMs2;
    const crushing = bodyPhysics(
      body('X1-TEST-B1', 'PLANET', ['CRUSHING_GRAVITY']),
    ).surfaceGravityMs2;
    expect(weak).toBeLessThan(base);
    expect(crushing).toBeGreaterThan(base);
  });

  it('is deterministic per symbol', () => {
    expect(bodyPhysics(body('X1-TEST-C1', 'MOON'))).toEqual(
      bodyPhysics(body('X1-TEST-C1', 'MOON')),
    );
  });

  it('reproduces a 1-year orbit at 1 AU around a solar mass', () => {
    const years = orbitalPeriodSec(SOLAR_MU_KM3_S2, AU_KM) / (365.25 * 86400);
    expect(years).toBeCloseTo(1, 2);
  });

  it('caps display mean motion for very tight orbits', () => {
    const n = displayMeanMotion(4e5, 7_000);
    expect((2 * Math.PI) / (n * UNIVERSE_TIME_SCALE)).toBeGreaterThanOrEqual(23.9);
  });

  it('keeps Earth near 255 K equilibrium at 1 AU from the Sun', () => {
    expect(equilibriumTemperatureK(1, AU_KM, 0.3)).toBeGreaterThan(250);
    expect(equilibriumTemperatureK(1, AU_KM, 0.3)).toBeLessThan(260);
  });

  it('maps every system type to a star and never engulfs planets', () => {
    const hyper = starProfile('HYPERGIANT');
    expect(fitStarRadiusKm(hyper, 1e8)).toBeLessThanOrEqual(4e7);
    expect(starProfile('BLACK_HOLE').radiusKm).toBeGreaterThan(20);
    expect(starProfile('unknown').starClass).toBe('ORANGE_STAR');
  });

  it('keeps render sizes monotonic', () => {
    expect(renderBodyRadius(70_000)).toBeGreaterThan(renderBodyRadius(6_000));
    expect(renderBodyRadius(6_000)).toBeGreaterThan(renderBodyRadius(1_500));
  });

  it('advances the universal clock at the universal time scale', () => {
    expect(universeTimeSec(2000) - universeTimeSec(1000)).toBeCloseTo(UNIVERSE_TIME_SCALE);
  });
});
