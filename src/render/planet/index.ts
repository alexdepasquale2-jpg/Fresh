// STUB: replace with the real planet renderer (unit 15). See README.md.
import type { PlanetRendererFactory, GlCore } from '@/contracts/render';

export const factory: PlanetRendererFactory = () => {
  let core: GlCore | null = null;
  let idx: WebGLTexture | null = null;
  let pal: WebGLTexture | null = null;
  let palKey = '';
  return {
    init: (c) => void (core = c),
    draw: (v) => {
      if (!core) return;
      core.clear('#17140c');
      const g = v.grid;
      if (!idx) idx = core.indexTexture(g.width, g.height);
      const key = v.universe.palette.join();
      if (key !== palKey) {
        pal = core.paletteTexture(v.universe.palette);
        palKey = key;
      }
      core.uploadIndices(idx, g.width, g.height, g.cells as Uint8Array);
      core.blit(idx, pal!, g.width, g.height, { x: 16, y: 96, w: core.width() - 32, h: 300 });
    },
    dispose: () => {
      idx = pal = null;
      palKey = '';
      core = null;
    },
  };
};
