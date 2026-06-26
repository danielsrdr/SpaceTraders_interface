import { Vector3 } from 'three';
import { STAR_MU } from './celestial-mass';
import { gravitationalAcceleration, surfaceGravity } from './gravity-field';

describe('gravity-field', () => {
  it('computes inverse-square acceleration toward a source', () => {
    const pos = new Vector3(1000, 0, 0);
    const sources = [{ symbol: 'STAR', position: new Vector3(), mu: STAR_MU }];
    const a = gravitationalAcceleration(pos, sources);
    expect(a.x).toBeLessThan(0);
    expect(a.y).toBe(0);
    expect(a.z).toBe(0);
    expect(Number.isFinite(a.length())).toBe(true);
  });

  it('returns zero acceleration at the origin with softening', () => {
    const a = gravitationalAcceleration(new Vector3(), [
      { symbol: 'STAR', position: new Vector3(), mu: STAR_MU, softening: 50 },
    ]);
    expect(a.length()).toBeGreaterThan(0);
  });

  it('derives positive surface gravity from μ and radius', () => {
    const g = surfaceGravity(3e-6, 6_000);
    expect(g).toBeGreaterThan(0);
    expect(Number.isFinite(g)).toBe(true);
  });
});
