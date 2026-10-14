import { ORBIT_ALTITUDE_KM, RENDER_KM_PER_UNIT } from './physics-units';
import {
  renderDistance,
  renderRadius,
  shipMarkerRenderScale,
  shipOrbitRenderDistance,
  shipRenderScale,
} from './render-transform';
import { renderBodyRadius, renderSystemDistance } from './universe-physics';

describe('render-transform', () => {
  it('maps body radii through the universal size map', () => {
    expect(renderRadius(6_000)).toBeCloseTo(renderBodyRadius(6_000), 9);
    expect(renderRadius(60_000)).toBeGreaterThan(renderRadius(6_000));
  });

  it('maps system distances linearly and local offsets via RENDER_KM_PER_UNIT', () => {
    expect(renderDistance(1e8, 'system')).toBeCloseTo(renderSystemDistance(1e8), 9);
    expect(renderDistance(1_200, 'local')).toBeCloseTo(1_200 / RENDER_KM_PER_UNIT, 9);
  });

  it('places orbit rings just above the rendered body surface', () => {
    const orbitR = shipOrbitRenderDistance(6_000);
    expect(orbitR).toBeGreaterThan(renderRadius(6_000));
    expect(orbitR).toBeGreaterThanOrEqual(
      renderRadius(6_000) + ORBIT_ALTITUDE_KM / RENDER_KM_PER_UNIT - 1e-9,
    );
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
