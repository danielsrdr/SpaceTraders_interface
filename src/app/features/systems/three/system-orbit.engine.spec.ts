import { Vector3 } from 'three';
import { PlanetView } from '../../../models/system.model';
import { computeSystemLayout3d } from './system-scene.layout';
import { SystemOrbitEngine } from './system-orbit.engine';
import {
  API_UNIT_KM,
  bodyPhysics,
  displayMeanMotion,
  meanMotion,
  starProfile,
  SYSTEM_KM_PER_RENDER_UNIT,
  UNIVERSE_TIME_SCALE,
  universeTimeSec,
} from './universe-physics';

function makePlanet(
  name: string,
  x: number,
  y: number,
  type = 'PLANET',
  orbits?: string,
): PlanetView {
  return { name, type, system: 'X1-TEST', position: { x, y }, orbits, traits: [] };
}

function buildEngine(planets: PlanetView[], systemType: string | null = null): SystemOrbitEngine {
  const engine = new SystemOrbitEngine();
  engine.build(planets, computeSystemLayout3d(planets), { systemType, timeSec: 0 });
  return engine;
}

describe('SystemOrbitEngine', () => {
  it('produces finite, deterministic positions for a given universe time', () => {
    const planets = [makePlanet('A', 40, 0), makePlanet('B', -30, 25)];
    const engine = buildEngine(planets);

    engine.tick(12.5);
    const a1 = engine.getWorldPosition('A', new Vector3()).clone();
    const b1 = engine.getWorldPosition('B', new Vector3()).clone();
    expect(Number.isFinite(a1.x) && Number.isFinite(a1.y) && Number.isFinite(a1.z)).toBe(true);

    const engine2 = buildEngine(planets);
    engine2.tick(7.5);
    engine2.tick(5);
    expect(engine2.getWorldPosition('A', new Vector3()).distanceTo(a1)).toBeCloseTo(0, 6);
    expect(engine2.getWorldPosition('B', new Vector3()).distanceTo(b1)).toBeCloseTo(0, 6);
  });

  it('places bodies at their API coordinates at the universe epoch (star at the origin)', () => {
    const planets = [makePlanet('A', 40, 10), makePlanet('B', -30, 25)];
    const engine = buildEngine(planets);
    const scale = API_UNIT_KM / SYSTEM_KM_PER_RENDER_UNIT;
    for (const p of planets) {
      const pos = engine.getWorldPosition(p.name, new Vector3());
      const expectedR = Math.hypot(p.position.x, p.position.y) * scale;
      // Inclination only foreshortens the planar distance slightly.
      expect(pos.length()).toBeGreaterThan(expectedR * 0.9);
      expect(pos.length()).toBeLessThan(expectedR * 1.05);
      expect(Math.atan2(pos.z, pos.x)).toBeCloseTo(Math.atan2(p.position.y, p.position.x), 3);
    }
  });

  it('uses the same render scale for every system (no per-system scale)', () => {
    const near = buildEngine([makePlanet('A', 20, 0)]);
    const far = buildEngine([makePlanet('A', 20, 0), makePlanet('Z', 500, 0)]);
    expect(far.getWorldPosition('A').distanceTo(near.getWorldPosition('A'))).toBeCloseTo(0, 6);
    expect(far.sceneExtent()).toBeGreaterThan(near.sceneExtent());
  });

  it('is reversible: ticking forward then back returns to the start', () => {
    const engine = buildEngine([makePlanet('A', 55, 10)]);
    const start = engine.getWorldPosition('A', new Vector3()).clone();
    engine.tick(3_000);
    const moved = engine.getWorldPosition('A', new Vector3()).clone();
    engine.tick(-3_000);
    const back = engine.getWorldPosition('A', new Vector3());
    expect(moved.distanceTo(start)).toBeGreaterThan(0.001);
    expect(back.distanceTo(start)).toBeCloseTo(0, 6);
  });

  it('keeps a child body parent-relative (a moon tracks its planet)', () => {
    const engine = buildEngine([makePlanet('P', 60, 0), makePlanet('M', 60.2, 0, 'MOON', 'P')]);
    const toParent: number[] = [];
    const toOrigin: number[] = [];
    const p = new Vector3();
    const m = new Vector3();
    for (let i = 0; i < 24; i++) {
      engine.tick(1);
      engine.getWorldPosition('P', p);
      engine.getWorldPosition('M', m);
      toParent.push(m.distanceTo(p));
      toOrigin.push(m.length());
    }
    const spread = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);
    expect(Math.max(...toParent)).toBeLessThan(Math.min(...toOrigin) * 0.2);
    expect(spread(toParent)).toBeLessThan(Math.max(...toParent));
  });

  it('reports a larger scene extent for a more spread-out system', () => {
    const small = buildEngine([makePlanet('A', 20, 0), makePlanet('B', -20, 0)]);
    const large = buildEngine([makePlanet('A', 400, 0), makePlanet('B', -400, 0)]);
    expect(large.sceneExtent()).toBeGreaterThan(small.sceneExtent());
  });

  it('returns the origin for an unknown body', () => {
    const engine = buildEngine([makePlanet('A', 10, 0)]);
    expect(engine.getWorldPosition('does-not-exist', new Vector3()).equals(new Vector3())).toBe(
      true,
    );
  });

  describe('Kepler on real μ', () => {
    it('obeys the third law: n ∝ a^(-3/2) for a fixed parent μ', () => {
      const mu = starProfile('ORANGE_STAR').mu;
      const ratio = meanMotion(mu, 1e8) / meanMotion(mu, 4e8);
      expect(ratio).toBeCloseTo(Math.pow(4, 1.5), 8);
    });

    it('orbits a heavier star faster at the same API distance', () => {
      const planets = [makePlanet('A', 40, 0)];
      const light = buildEngine(planets, 'RED_STAR');
      const heavy = buildEngine(planets, 'BLUE_STAR');
      expect(heavy.getOrbitalPeriodSec('A')).toBeLessThan(light.getOrbitalPeriodSec('A'));
    });

    it('periods follow T² ∝ a³ between two sun-orbiters', () => {
      const engine = buildEngine([makePlanet('A', 30, 0), makePlanet('B', 60, 0)]);
      const ratio = engine.getOrbitalPeriodSec('B') / engine.getOrbitalPeriodSec('A');
      // Eccentricity and inclination perturb the semi-major axes a little.
      expect(ratio).toBeGreaterThan(Math.pow(2, 1.5) * 0.7);
      expect(ratio).toBeLessThan(Math.pow(2, 1.5) * 1.4);
    });

    it('moons orbit on the parent planet’s μ, far faster than their planet orbits the star', () => {
      const engine = buildEngine([makePlanet('P', 50, 0), makePlanet('M', 50, 0.1, 'MOON', 'P')]);
      expect(engine.getOrbitalPeriodSec('M')).toBeLessThan(engine.getOrbitalPeriodSec('P'));
    });

    it('displayMeanMotion never exceeds the anti-aliasing cap', () => {
      const cap = (2 * Math.PI) / (24 * UNIVERSE_TIME_SCALE);
      expect(
        displayMeanMotion(bodyPhysics(makePlanet('J', 0, 0, 'GAS_GIANT')).mu, 100),
      ).toBeLessThanOrEqual(cap);
    });
  });

  describe('universal clock', () => {
    it('starts on the shared universe clock', () => {
      const planets = [makePlanet('A', 40, 0)];
      const engine = new SystemOrbitEngine();
      const before = universeTimeSec();
      engine.build(planets, computeSystemLayout3d(planets));
      const after = universeTimeSec();
      expect(engine.currentTime).toBeGreaterThanOrEqual(before);
      expect(engine.currentTime).toBeLessThanOrEqual(after);
    });

    it('treats the UI warp as a cumulative offset in universe seconds', () => {
      const engine = buildEngine([makePlanet('A', 40, 0)]);
      engine.tick(2);
      engine.tick(3);
      expect(engine.currentTime).toBeCloseTo(5 * UNIVERSE_TIME_SCALE, 6);
      engine.tick(0);
      expect(engine.currentTime).toBeCloseTo(5 * UNIVERSE_TIME_SCALE, 6);
    });

    it('seekTo takes absolute universe seconds and is order independent', () => {
      const planets = [makePlanet('A', 40, 5)];
      const a = buildEngine(planets);
      const b = buildEngine(planets);
      a.seekTo(1e6);
      b.tick(10);
      b.seekTo(1e6);
      expect(a.getWorldPosition('A').distanceTo(b.getWorldPosition('A'))).toBeCloseTo(0, 9);
    });
  });

  describe('rotation', () => {
    it('tidally locks moons: spin rate equals orbital mean motion', () => {
      const engine = buildEngine([makePlanet('P', 50, 0), makePlanet('M', 50, 0.1, 'MOON', 'P')]);
      expect(engine.isTidallyLocked('M')).toBe(true);
      expect(engine.isTidallyLocked('P')).toBe(false);
      const period = engine.getOrbitalPeriodSec('M');
      expect(engine.getSpinRatePerSec('M')).toBeCloseTo(
        ((2 * Math.PI) / period) * UNIVERSE_TIME_SCALE,
        9,
      );
    });

    it('spins a free planet on its own rotation period (sign = direction)', () => {
      const engine = buildEngine([makePlanet('P', 50, 0)]);
      const phys = bodyPhysics(makePlanet('P', 50, 0));
      const expected = (2 * Math.PI) / phys.rotationPeriodSec;
      expect(Math.sign(engine.getSpinRatePerSec('P'))).toBe(Math.sign(expected));
      expect(Math.abs(engine.getSpinRatePerSec('P'))).toBeLessThanOrEqual(
        Math.abs(expected) * UNIVERSE_TIME_SCALE + 1e-12,
      );
    });

    it('keeps the spin angle in [0, 2π)', () => {
      const engine = buildEngine([makePlanet('P', 50, 0)]);
      engine.tick(1234.5);
      const angle = engine.getSpinAngle('P');
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(Math.PI * 2);
    });
  });
});
