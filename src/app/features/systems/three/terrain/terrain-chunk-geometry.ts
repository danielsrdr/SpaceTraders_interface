/**
 * Pure (three.js-free) chunk geometry maths so the same code can run in a
 * WebWorker and as a main-thread fallback. It reproduces the vertex layout of
 * `PlaneGeometry(size, size, segments, segments)` after a -90deg X rotation and
 * a per-vertex height assignment, emitting transferable typed arrays.
 */

export type HeightSampler = (worldX: number, worldZ: number) => number;

/**
 * Build the local-space vertex positions for a chunk. Vertices are laid out
 * row-major (iy outer, ix inner) so they match `buildGridIndices`.
 */
export function buildChunkPositions(
  getHeight: HeightSampler,
  cx: number,
  cz: number,
  chunkSize: number,
  segments: number,
): Float32Array {
  const baseX = cx * chunkSize;
  const baseZ = cz * chunkSize;
  const half = chunkSize / 2;
  const seg = chunkSize / segments;
  const side = segments + 1;
  const positions = new Float32Array(side * side * 3);

  let p = 0;
  for (let iy = 0; iy < side; iy++) {
    const lz = iy * seg - half;
    const wz = baseZ + lz + half;
    for (let ix = 0; ix < side; ix++) {
      const lx = ix * seg - half;
      const wx = baseX + lx + half;
      positions[p++] = lx;
      positions[p++] = getHeight(wx, wz);
      positions[p++] = lz;
    }
  }
  return positions;
}

/** Triangle index buffer for a `segments x segments` grid (constant per chunk). */
export function buildGridIndices(segments: number): Uint32Array {
  const side = segments + 1;
  const indices = new Uint32Array(segments * segments * 6);
  let n = 0;
  for (let iy = 0; iy < segments; iy++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = ix + side * iy;
      const b = ix + side * (iy + 1);
      const c = ix + 1 + side * (iy + 1);
      const d = ix + 1 + side * iy;
      indices[n++] = a;
      indices[n++] = b;
      indices[n++] = d;
      indices[n++] = b;
      indices[n++] = c;
      indices[n++] = d;
    }
  }
  return indices;
}

/** Smooth per-vertex normals from positions + indices (computeVertexNormals). */
export function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);

  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i]! * 3;
    const ib = indices[i + 1]! * 3;
    const ic = indices[i + 2]! * 3;

    const ax = positions[ia]!;
    const ay = positions[ia + 1]!;
    const az = positions[ia + 2]!;
    const bx = positions[ib]!;
    const by = positions[ib + 1]!;
    const bz = positions[ib + 2]!;
    const cx = positions[ic]!;
    const cy = positions[ic + 1]!;
    const cz = positions[ic + 2]!;

    const e1x = bx - ax;
    const e1y = by - ay;
    const e1z = bz - az;
    const e2x = cx - ax;
    const e2y = cy - ay;
    const e2z = cz - az;

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    normals[ia] = (normals[ia] ?? 0) + nx;
    normals[ia + 1] = (normals[ia + 1] ?? 0) + ny;
    normals[ia + 2] = (normals[ia + 2] ?? 0) + nz;
    normals[ib] = (normals[ib] ?? 0) + nx;
    normals[ib + 1] = (normals[ib + 1] ?? 0) + ny;
    normals[ib + 2] = (normals[ib + 2] ?? 0) + nz;
    normals[ic] = (normals[ic] ?? 0) + nx;
    normals[ic + 1] = (normals[ic + 1] ?? 0) + ny;
    normals[ic + 2] = (normals[ic + 2] ?? 0) + nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i]!;
    const y = normals[i + 1]!;
    const z = normals[i + 2]!;
    const len = Math.hypot(x, y, z) || 1;
    normals[i] = x / len;
    normals[i + 1] = y / len;
    normals[i + 2] = z / len;
  }

  return normals;
}
