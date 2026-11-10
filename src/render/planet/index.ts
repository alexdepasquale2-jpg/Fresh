// Planet renderer (unit 15): palette-indexed surface, village bonfires on the pulse.
import type { PlanetRendererFactory, GlCore } from '@/contracts/render';
import { fxSin } from '@/core/fixed';

export const PLANET_RECT = { x: 8, y: 92, h: 236 };

export const factory: PlanetRendererFactory = () => {
  let core: GlCore | null = null;
  let idx: WebGLTexture | null = null;
  let pal: WebGLTexture | null = null;
  let palKey = '';
  let buf: Uint8Array | null = null;
  const reset = () => { idx = pal = null; palKey = ''; };
  return {
    init: (c) => {
      core = c;
      c.onRestore(reset);
    },
    draw: (v) => {
      if (!core || core.lost()) return;
      const g = v.grid;
      if (!buf || buf.length !== g.cells.length) buf = new Uint8Array(g.cells.length);
      buf.set(g.cells as Uint8Array);
      // The material table maps ids to palette colours via the universe; ids are small
      // and laid out so id == palette slot is close enough for a first pass.
      const mt = v.universe.materialTable;
      for (let i = 0; i < buf.length; i++) {
        const m = buf[i]!;
        buf[i] = m === 0 ? (i / g.width < g.height * 0.55 ? 1 : 0) : (mt[m]?.color ?? 4);
      }
      const flick = fxSin(v.pulse) > 0;
      for (const vil of v.civ.villages) {
        const size = vil.souls > 40 ? 2 : 1;
        for (let dy = -size; dy <= 0; dy++) for (let dx = -size; dx <= size; dx++) {
          const x = vil.x + dx, y = vil.y + dy;
          if (x >= 0 && y >= 0 && x < g.width && y < g.height) buf[y * g.width + x] = dy === -size && flick ? 13 : 10;
        }
      }
      if (!idx) idx = core.indexTexture(g.width, g.height);
      const key = v.universe.serial;
      if (key !== palKey || !pal) { pal = core.paletteTexture(v.universe.palette); palKey = key; }
      core.clear(v.universe.palette[0]!);
      core.uploadIndices(idx, g.width, g.height, buf);
      core.blit(idx, pal, g.width, g.height, { x: PLANET_RECT.x, y: PLANET_RECT.y, w: core.width() - PLANET_RECT.x * 2, h: PLANET_RECT.h });
    },
    dispose: () => { reset(); core = null; },
  };
};
