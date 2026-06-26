import { Vector3 } from 'three';
import { PlanetView } from '../../../models/system.model';
import { computeSystemLayout3d } from './system-scene.layout';
import { SystemOrbitEngine, keplerMeanMotionForTest } from './system-orbit.engine';
import { STAR_MU } from './celestial-mass';

function makePlanet(
  name: string,
  x: number,
  y: number,
  type = 'PLANET',
  orbits?: string,
): PlanetView {
  return { name, type, system: 'X1-TEST', position: { x, y }, orbits, traits: [] };
}

function buildEngine(planets: PlanetView[]): SystemOrbitEngine {
  const engine = new SystemOrbitEngine();
  engine.build(planets, computeSystemLayout3d(planets));
  return engine;
}

describe('SystemOrbitEngine', () => {
  it('produces finite, deterministic positions for a given sim time', () => {
    const planets = [makePlanet('A', 40, 0), makePlanet('B', -30, 25)];
    const engine = buildEngine(planets);

    engine.tick(12.5);
    const a1 = engine.getWorldPosition('A', new Vector3()).clone();
    const b1 = engine.getWorldPosition('B', new Vector3()).clone();

    expect(Number.isFinite(a1.x) && Number.isFinite(a1.y) && Number.isFinite(a1.z)).toBe(true);

    // A second engine advanced to the same sim time must match exactly.
    const engine2 = buildEngine(planets);
    engine2.tick(7.5);
    engine2.tick(5);
    const a2 = engine2.getWorldPosition('A', new Vector3());
    const b2 = engine2.getWorldPosition('B', new Vector3());

    expect(a2.x).toBeCloseTo(a1.x, 10);
    expect(a2.y).toBeCloseTo(a1.y, 10);
    expect(a2.z).toBeCloseTo(a1.z, 10);
    expect(b2.distanceTo(b1)).toBeCloseTo(0, 10);
  });

  it('is reversible: ticking forward then back returns to the start', () => {
    const planets = [makePlanet('A', 55, 10)];
    const engine = buildEngine(planets);

    const start = engine.getWorldPosition('A', new Vector3()).clone();
    engine.tick(33);
    const moved = engine.getWorldPosition('A', new Vector3()).clone();
    engine.tick(-33);
    const back = engine.getWorldPosition('A', new Vector3());

    // The body actually moved...
    expect(moved.distanceTo(start)).toBeGreaterThan(0.01);
    // ...and unwound exactly back to the starting point.
    expect(back.distanceTo(start)).toBeCloseTo(0, 8);
  });

  it('keeps a child body parent-relative (a moon tracks its planet)', () => {
    const planet = makePlanet('P', 60, 0);
    const moon = makePlanet('M', 66, 0, 'MOON', 'P');
    const engine = buildEngine([planet, moon]);

    const toParent: number[] = [];
    const toOrigin: number[] = [];
    const p = new Vector3();
    const m = new Vector3();
    for (let i = 0; i < 24; i++) {
      engine.tick(5);
      engine.getWorldPosition('P', p);
      engine.getWorldPosition('M', m);
      toParent.push(m.distanceTo(p));
      toOrigin.push(m.length());
    }

    const spread = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);
    // The moon-to-planet distance barely changes (tight orbit), while the
    // moon-to-sun distance swings widely as the planet sweeps its own orbit.
    expect(spread(toParent)).toBeLessThan(spread(toOrigin));
  });

  it('reports a larger scene extent for a more spread-out system', () => {
    const small = buildEngine([makePlanet('A', 20, 0), makePlanet('B', -20, 0)]);
    const large = buildEngine([makePlanet('A', 400, 0), makePlanet('B', -400, 0)]);
    expect(large.sceneExtent()).toBeGreaterThan(small.sceneExtent());
  });

  it('returns the origin for an unknown body', () => {
    const engine = buildEngine([makePlanet('A', 10, 0)]);
    const pos = engine.getWorldPosition('does-not-exist', new Vector3());
    expect(pos.equals(new Vector3(0, 0, 0))).toBe(true);
  });

  it('obeys Kepler third law: n ∝ a^(-3/2) for a fixed parent μ', () => {
    const nNear = keplerMeanMotionForTest(10_000, STAR_MU);
    const nFar = keplerMeanMotionForTest(40_000, STAR_MU);
    const ratio = nNear / nFar;
    const expected = Math.pow(40_000 / 10_000, 1.5);
    expect(ratio).toBeCloseTo(expected, 4);
  });
});
