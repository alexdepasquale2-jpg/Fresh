// Bedroom renderer (unit 16): top-down pixel room, kid walks, Mote eases after, PC glows.
import type { RoomRendererFactory, GlCore } from '@/contracts/render';
import { fxSin } from '@/core/fixed';

const PAL = ['#17140c', '#231f12', '#2e2a18', '#3d3822', '#6f6535', '#8a7f4e', '#b3a868', '#c9bb62', '#e9dd9a', '#f6f0c8', '#bfeedd', '#5a4a2a', '#8c3b22', '#4f7f86', '#a2d8c4', '#000000'];
const BW = 60, BH = 84;
export const ROOM_RECT = (w: number) => ({ x: 15, y: 84, w: w - 30, h: 470 });

export const factory: RoomRendererFactory = () => {
  let core: GlCore | null = null;
  let idx: WebGLTexture | null = null;
  let pal: WebGLTexture | null = null;
  const buf = new Uint8Array(BW * BH);
  const base = new Uint8Array(BW * BH);
  const kid = { x: 30, y: 60 };
  const mote = { x: 36, y: 54 };
  const moteCss = { x: 0, y: 0 };
  let started = false;
  const rect = (x0: number, y0: number, w: number, h: number, c: number, b = base) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < BW && y < BH) b[y * BW + x] = c;
  };
  // Floor boards, walls, bed, desk with PC, rug, window, box.
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) base[y * BW + x] = (y % 6 === 0 || (x + (y / 6 | 0) * 9) % 17 === 0) ? 2 : 1;
  rect(0, 0, BW, 6, 3); rect(0, 0, 2, BH, 3); rect(BW - 2, 0, 2, BH, 3); rect(0, BH - 2, BW, 2, 3);
  rect(22, 1, 14, 4, 13); rect(23, 2, 12, 2, 14); // window
  rect(4, 8, 14, 22, 11); rect(5, 9, 12, 6, 8); rect(5, 16, 12, 13, 12); // bed
  rect(38, 7, 18, 9, 5); rect(43, 8, 8, 6, 4); // desk + PC
  rect(18, 40, 24, 16, 3); rect(20, 42, 20, 12, 2); // rug
  rect(46, 64, 8, 7, 7); rect(47, 65, 6, 5, 6); // the box
  return {
    init: (c) => {
      core = c;
      c.onRestore(() => (idx = pal = null));
    },
    draw: (v) => {
      if (!core || core.lost()) return;
      const R = ROOM_RECT(core.width());
      const s = R.w / BW;
      if (!started) { kid.x = (v.kid.x - R.x) / s; kid.y = (v.kid.y - R.y) / s; started = true; }
      if (v.target) {
        const tx = Math.max(3, Math.min(BW - 4, (v.target.x - R.x) / s)), ty = Math.max(8, Math.min(BH - 4, (v.target.y - R.y) / s));
        const dx = tx - kid.x, dy = ty - kid.y, d = Math.hypot(dx, dy);
        if (d > 0.4) { kid.x += (dx / d) * 0.4; kid.y += (dy / d) * 0.4; }
      }
      mote.x += (kid.x + 5 - mote.x) * 0.06;
      mote.y += (kid.y - 5 - mote.y) * 0.06;
      buf.set(base);
      const on = fxSin(v.pulse) > 0;
      rect(44, 9, 6, 4, on ? 10 : 14, buf); // PC screen pulses
      const kx = Math.round(kid.x), ky = Math.round(kid.y);
      rect(kx - 1, ky - 3, 3, 3, 8, buf); rect(kx - 1, ky, 3, 3, 12, buf); rect(kx - 1, ky + 3, 1, 1, 0, buf); rect(kx + 1, ky + 3, 1, 1, 0, buf);
      const mx = Math.round(mote.x), my = Math.round(mote.y);
      rect(mx - 1, my, 3, 1, 14, buf); rect(mx, my - 1, 1, 3, 14, buf); rect(mx, my, 1, 1, 9 + (v.lightPips > 2 ? 1 : 0), buf);
      moteCss.x = R.x + mx * s; moteCss.y = R.y + my * s;
      if (!idx) idx = core.indexTexture(BW, BH);
      if (!pal) pal = core.paletteTexture(PAL);
      core.clear(PAL[0]!);
      core.uploadIndices(idx, BW, BH, buf);
      core.blit(idx, pal, BW, BH, R);
    },
    dispose: () => void (core = null),
    mote: () => moteCss,
  };
};
