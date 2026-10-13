import { Vector3 } from 'three';
import { RENDER_KM_PER_UNIT, ORBIT_ALTITUDE_KM } from './physics-units';
import {
  renderRadius,
  shipMarkerRenderScale,
  shipOrbitRenderDistance,
  shipRenderScale,
} from './render-transform';

describe('render-transform', () => {
  it('maps sim km to render units via RENDER_KM_PER_UNIT', () => {
    expect(renderRadius(6_000, 'local')).toBeCloseTo(6_000 / RENDER_KM_PER_UNIT, 6);
    expect(renderRadius(1_500, 'local')).toBeCloseTo(1.25, 6);
  });

  it('places orbit rings at body radius plus altitude', () => {
    const orbitR = shipOrbitRenderDistance(6_000);
    expect(orbitR).toBeCloseTo((6_000 + ORBIT_ALTITUDE_KM) / RENDER_KM_PER_UNIT, 6);
  });

  it('scales markers with waypoint radius and bumps up the selected ship', () => {
    expect(shipMarkerRenderScale(5, false)).toBeCloseTo(0.225, 6);
    expect(shipMarkerRenderScale(5, true)).toBeCloseTo(0.225 * 1.25, 6);
  });

  it('clamps marker scale to the [0.1, 0.35] range', () => {
    expect(shipMarkerRenderScale(0, false)).toBe(0.1);
    expect(shipMarkerRenderScale(1000, false)).toBe(0.35);
  });

  it('clamps ship scale to a minimum screen pixel floor', () => {
    const far = shipRenderScale('EXPLORER', 0.08, 500, 800, 60);
    const near = shipRenderScale('EXPLORER', 0.08, 5, 800, 60);
    expect(far).toBeGreaterThan(near);
    expect(far).toBeGreaterThan(0.08);
  });
});
