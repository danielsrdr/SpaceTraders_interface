/// <reference lib="webworker" />
import { createTerrainHeightField, TerrainHeightField } from './terrain-height';
import { buildChunkPositions, buildGridIndices, computeNormals } from './terrain-chunk-geometry';
import type { SurfacePoiConfig } from '../surface-poi';

interface InitMessage {
  type: 'init';
  config: SurfacePoiConfig;
  chunkSize: number;
  segments: number;
}

interface ChunkMessage {
  type: 'chunk';
  id: number;
  cx: number;
  cz: number;
}

type IncomingMessage = InitMessage | ChunkMessage;

let heightField: TerrainHeightField | null = null;
let chunkSize = 16;
let segments = 32;
let indices: Uint32Array = buildGridIndices(segments);

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'init': {
      heightField = createTerrainHeightField(msg.config);
      chunkSize = msg.chunkSize;
      segments = msg.segments;
      indices = buildGridIndices(segments);
      return;
    }

    case 'chunk': {
      if (!heightField) return;
      const field = heightField;
      const positions = buildChunkPositions(
        (x, z) => field.getHeight(x, z),
        msg.cx,
        msg.cz,
        chunkSize,
        segments,
      );
      const normals = computeNormals(positions, indices);
      ctx.postMessage(
        { type: 'chunk', id: msg.id, cx: msg.cx, cz: msg.cz, positions, normals },
        [positions.buffer, normals.buffer],
      );
      return;
    }

    default: {
      const _exhaustive: never = msg;
      void _exhaustive;
    }
  }
};
