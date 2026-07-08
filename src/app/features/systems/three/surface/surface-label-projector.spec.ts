import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { projectPoiLabels } from './surface-label-projector';

describe('projectPoiLabels', () => {
  it('returns empty when no anchors or zero viewport', () => {
    const camera = new PerspectiveCamera();
    const scratch = new Vector3();
    expect(projectPoiLabels([], camera, 800, 600, null, scratch)).toEqual([]);
    expect(
      projectPoiLabels(
        [{ kind: 'mine', label: 'Mine', position: new Vector3(0, 0, -5) }],
        camera,
        0,
        0,
        null,
        scratch,
      ),
    ).toEqual([]);
  });

  it('skips market anchors and projects in-range POIs', () => {
    const camera = new PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(0, 2, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const scratch = new Vector3();
    const labels = projectPoiLabels(
      [
        { kind: 'market', label: 'Market', position: new Vector3(0, 0, -10) },
        { kind: 'mine', label: 'Ore Pit', position: new Vector3(0, 0, -8) },
      ],
      camera,
      800,
      600,
      'mine',
      scratch,
    );

    expect(labels).toHaveLength(1);
    expect(labels[0]?.kind).toBe('mine');
    expect(labels[0]?.inRange).toBe(true);
    expect(labels[0]?.x).toBeGreaterThan(0);
    expect(labels[0]?.y).toBeGreaterThan(0);
  });
});
