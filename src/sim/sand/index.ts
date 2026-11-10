// STUB: replace with the real falling-sand kernel (unit 09). See README.md.
import type { SurfaceSimFactory, GridView } from '@/contracts/sim';
import { GRID_W, GRID_H, CHUNK } from '@/contracts/sim';

export const factory: SurfaceSimFactory = () => {
  const cells = new Uint8Array(GRID_W * GRID_H);
  const chunksX = Math.ceil(GRID_W / CHUNK);
  const chunksY = Math.ceil(GRID_H / CHUNK);
  const dirty = new Uint8Array(chunksX * chunksY);
  let tick = 0;
  const view: GridView = { width: GRID_W, height: GRID_H, cells, chunksX, chunksY, dirty, clearDirty: () => dirty.fill(0) };
  return {
    init: (_p, _u, surface) => {
      cells.set(surface.cells);
      dirty.fill(1);
      tick = 0;
    },
    step: (ticks) => {
      tick += ticks;
    },
    grid: () => view,
    tick: () => tick,
    snapshot: () => {
      const out = new Uint8Array(4 + cells.length);
      new DataView(out.buffer).setUint32(0, tick);
      out.set(cells, 4);
      return out;
    },
    restore: (s) => {
      tick = new DataView(s.buffer, s.byteOffset).getUint32(0);
      cells.set(s.subarray(4));
      dirty.fill(1);
    },
  };
};
