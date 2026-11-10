// The moving world: everything that goes on whether or not you watch. A train on the Down Line, the 4 on the Row,
// birds that scatter, kids in the yard, washing, smoke, puddles after rain, lights on Mast Hill, something in the
// quarry. All of it is a function of the clock and fixed tables; nothing is allocated per frame.
import { T, TILE, type Town } from '@/game/town';
import { PAL } from './sprites';
import type { View } from './render';

type G = CanvasRenderingContext2D;
export interface Life {
  under(g: G, v: View, cx: number, cy: number, vw: number, vh: number): void;
  over(g: G, v: View, cx: number, cy: number, vw: number, vh: number): void;
  glow(g: G, v: View, cx: number, cy: number, vw: number, vh: number, dark: number): void;
}
// Birds: home tile x, y. Park, yard, Row, pier, churchyard.
const BIRDS = [66, 59, 71, 57, 83, 60, 58, 101, 62, 104, 80, 108, 124, 60, 131, 66, 140, 58, 86, 138, 96, 136, 20, 60, 26, 64, 118, 100, 141, 101, 34, 110];
// Kids at play: centre tile x, y, radius px, by day only.
const PLAY = [128, 63, 22, 138, 66, 14, 60, 99, 18, 88, 106, 16];
// Washing lines: tile x, y of the left post.
const WASH = [46, 48, 78, 48, 94, 48, 112, 105, 139, 105, 8, 100];

export const createLife = (town: Town): Life => {
  const nb = BIRDS.length >> 1, fly = new Float32Array(nb);
  const m = town.outdoor;
  const vis = (x: number, y: number, vw: number, vh: number, pad: number): boolean => x > -pad && y > -pad && x < vw + pad && y < vh + pad;
  const under: Life['under'] = (g, v, cx, cy, vw, vh) => {
    // Puddles on road and pavement after rain; they hold a little sky.
    if (town.wet()) {
      const x0 = Math.max(0, Math.floor(cx / TILE)), y0 = Math.max(0, Math.floor(cy / TILE)), x1 = Math.min(m.w - 1, x0 + Math.ceil(vw / TILE) + 1), y1 = Math.min(m.h - 1, y0 + Math.ceil(vh / TILE) + 1);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const i = ty * m.w + tx, t = m.tiles[i]!;
        if ((t !== T.ROAD && t !== T.PAVE && t !== T.YARD && t !== T.PATH) || m.noise[i]! % 9 !== 0) continue;
        const x = tx * TILE - cx, y = ty * TILE - cy;
        g.fillStyle = PAL[13]; g.fillRect(x + 3, y + 6, 10, 5); g.fillRect(x + 5, y + 5, 7, 7);
        g.fillStyle = PAL[14]; g.fillRect(x + 5 + (((v.t / 500) | 0) + i) % 4, y + 7, 3, 1);
      }
    }
    // Washing: three things on a line, lifted by the wind.
    const wind = town.weather() === 'wind' ? 3 : 1;
    for (let k = 0; k < WASH.length; k += 2) {
      const x = WASH[k]! * TILE - cx, y = WASH[k + 1]! * TILE - cy;
      if (!vis(x, y, vw, vh, 60) || m.tiles[WASH[k + 1]! * m.w + WASH[k]!] === T.ROOF) continue;
      g.fillStyle = PAL[1]; g.fillRect(x, y - 8, 1, 14); g.fillRect(x + 40, y - 8, 1, 14); g.fillStyle = PAL[5]; g.fillRect(x, y - 8, 41, 1);
      for (let j = 0; j < 3; j++) { const sw = v.still ? 0 : Math.round(Math.sin(v.t / 300 + j + k) * wind); g.fillStyle = PAL[j === 0 ? 9 : j === 1 ? 13 : 12]; g.fillRect(x + 5 + j * 12 + sw, y - 7, 8, 7 + (j & 1) * 2); }
    }
    // Kids at play (day): two or three small figures chasing round a point.
    if (town.phase() === 'day' && town.weather() !== 'rain') for (let k = 0; k < PLAY.length; k += 3) {
      const px = PLAY[k]! * TILE - cx, py = PLAY[k + 1]! * TILE - cy, rad = PLAY[k + 2]!;
      if (!vis(px, py, vw, vh, 40)) continue;
      for (let j = 0; j < 3; j++) {
        const a = (v.still ? 0 : v.t / (700 + k * 40)) + j * 2.1, x = Math.round(px + Math.cos(a) * rad), y = Math.round(py + Math.sin(a * 1.3) * rad * 0.6), hop = v.still ? 0 : ((v.t / 160 + j) | 0) & 1;
        g.fillStyle = PAL[1]; g.fillRect(x - 3, y + 1, 6, 2);
        g.fillStyle = PAL[j === 0 ? 12 : j === 1 ? 13 : 7]; g.fillRect(x - 2, y - 7 - hop, 5, 5);
        g.fillStyle = PAL[8]; g.fillRect(x - 2, y - 11 - hop, 5, 4); g.fillStyle = PAL[j === 2 ? 11 : 1]; g.fillRect(x - 2, y - 12 - hop, 5, 2);
        g.fillStyle = PAL[2]; g.fillRect(x - 2, y - 2 - hop, 2, 3); g.fillRect(x + 1, y - 2 - hop, 2, 3);
      }
      if (k === 6) { const a = v.t / 500; g.fillStyle = PAL[12]; g.fillRect(Math.round(px + Math.cos(a) * 8), Math.round(py - 4 - Math.abs(Math.sin(a * 2)) * 6), 3, 3); }
    }
    // Birds on the ground: they peck until you come close, then go.
    for (let k = 0; k < nb; k++) {
      const wx = BIRDS[k * 2]! * TILE + 8, wy = BIRDS[k * 2 + 1]! * TILE + 8;
      if (fly[k]! > 0) { if (v.t - fly[k]! > 9000) fly[k] = 0; continue; }
      if (Math.abs(v.kidX - wx) < 30 && Math.abs(v.kidY - wy) < 30) { fly[k] = v.t; continue; }
      const x = wx - cx, y = wy - cy;
      if (!vis(x, y, vw, vh, 8)) continue;
      const peck = !v.still && ((v.t / 350 + k * 3) | 0) % 5 === 0 ? 1 : 0;
      g.fillStyle = PAL[1]; g.fillRect(x - 2, y - 3 + peck, 4, 3); g.fillStyle = PAL[5]; g.fillRect(x + (k & 1 ? 2 : -3), y - 4 + peck * 2, 2, 2);
    }
    // Traffic: the 4 along the Row, a van along the Parade. They pass now and then and do not stop for you.
    const p = town.phase();
    if (p !== 'night' && !v.still) {
      const tb = (v.t / 1000) % 75, tv = (v.t / 1000 + 31) % 96;
      if (tb < 14) { const x = Math.round(40 * TILE + (tb / 14) * 70 * TILE) - cx - 20, y = 59 * TILE - cy; if (vis(x, y, vw, vh, 60)) { g.fillStyle = PAL[0]; g.fillRect(x - 1, y - 9, 44, 21); g.fillStyle = PAL[12]; g.fillRect(x, y - 8, 42, 18); g.fillStyle = PAL[8]; g.fillRect(x + 3, y - 5, 30, 6); g.fillStyle = PAL[14]; g.fillRect(x + 35, y - 5, 5, 8); g.fillStyle = PAL[0]; g.fillRect(x + 5, y + 9, 7, 4); g.fillRect(x + 30, y + 9, 7, 4); g.fillStyle = PAL[9]; g.fillRect(x + 14, y - 5, 5, 4); } }
      if (tv < 9) { const x = Math.round(157 * TILE - (tv / 9) * 52 * TILE) - cx, y = 101 * TILE - cy; if (vis(x, y, vw, vh, 40)) { g.fillStyle = PAL[0]; g.fillRect(x - 1, y - 7, 28, 17); g.fillStyle = PAL[5]; g.fillRect(x, y - 6, 26, 14); g.fillStyle = PAL[14]; g.fillRect(x + 1, y - 4, 5, 6); g.fillStyle = PAL[0]; g.fillRect(x + 3, y + 7, 6, 4); g.fillRect(x + 18, y + 7, 6, 4); } }
    }
  };
  const over: Life['over'] = (g, v, cx, cy, vw, vh) => {
    // The train on the Down Line: an engine and five coaches, at its set times. The crossing shuts for it.
    const tx = town.train();
    if (tx > -1e5) {
      const y = 82 * TILE - cy - 14, dusk = town.dark() > 0.2;
      if (y > -40 && y < vh + 10) for (let c = 0; c < 6; c++) {
        const x = Math.round(tx - c * 50) - cx - 48;
        if (x < -52 || x > vw + 4) continue;
        g.fillStyle = PAL[0]; g.fillRect(x, y, 48, 30); g.fillStyle = PAL[c === 0 ? 1 : 3]; g.fillRect(x + 1, y + 1, 46, 26); g.fillStyle = PAL[c === 0 ? 12 : 4]; g.fillRect(x + 1, y + 20, 46, 3);
        if (c > 0) { g.fillStyle = PAL[dusk ? 7 : 13]; for (let w = 0; w < 4; w++) g.fillRect(x + 5 + w * 10, y + 6, 7, 8); } else { g.fillStyle = PAL[9]; g.fillRect(x + 42, y + 8, 4, 6); g.fillStyle = PAL[2]; g.fillRect(x + 8, y - 5, 8, 6); }
        g.fillStyle = PAL[0]; g.fillRect(x + 6, y + 27, 8, 4); g.fillRect(x + 34, y + 27, 8, 4);
      }
    }
    // Smoke from the chimneys in view, and birds that have gone up.
    const x0 = Math.max(0, Math.floor(cx / TILE)), y0 = Math.max(1, Math.floor(cy / TILE)), x1 = Math.min(m.w - 1, x0 + Math.ceil(vw / TILE) + 1), y1 = Math.min(m.h - 1, y0 + Math.ceil(vh / TILE) + 3);
    const lean = town.weather() === 'wind' ? 2.2 : 0.5;
    g.fillStyle = PAL[6];
    if (!v.still) for (let ty = y0; ty <= y1; ty++) for (let tx2 = x0; tx2 <= x1; tx2++) {
      const i = ty * m.w + tx2;
      if (m.tiles[i] !== T.ROOF || (m.noise[i]! & 7) !== 0 || m.tiles[i - m.w] === T.ROOF || (m.noise[i]! & 8) === 0) continue;
      for (let s = 0; s < 3; s++) { const ph = ((v.t / 1400 + s / 3 + i * 0.37) % 1), x = tx2 * TILE + 7 - cx + ph * 14 * lean, y = ty * TILE - 9 - cy - ph * 22; g.globalAlpha = 0.5 * (1 - ph); g.fillRect(x | 0, y | 0, 3 + ((ph * 4) | 0), 3 + ((ph * 3) | 0)); }
    }
    g.globalAlpha = 1;
    for (let k = 0; k < nb; k++) {
      if (fly[k]! <= 0) continue;
      const e = (v.t - fly[k]!) / 1000;
      if (e > 4) continue;
      const x = BIRDS[k * 2]! * TILE + 8 - cx + e * (k & 1 ? 46 : -40), y = BIRDS[k * 2 + 1]! * TILE + 8 - cy - e * 52 - 6, flap = ((v.t / 90) | 0) & 1;
      g.fillStyle = PAL[1]; g.fillRect(x | 0, y | 0, 3, 2); g.fillRect((x - 3) | 0, (y - 2 + flap * 3) | 0, 3, 1); g.fillRect((x + 3) | 0, (y - 2 + flap * 3) | 0, 3, 1);
    }
  };
  const glow: Life['glow'] = (g, v, cx, cy, vw, vh, dark) => {
    if (dark < 0.9) return;
    // Lights on Mast Hill: three, going round the top of the mast, the wrong way for aircraft.
    const mx = 26 * TILE - cx, my = 11 * TILE - cy - 70;
    if (vis(mx, my, vw, vh, 80)) for (let k = 0; k < 3; k++) { const a = (v.still ? 0 : v.t / 900) + k * 2.09; g.fillStyle = PAL[k === 0 ? 12 : 10]; g.globalAlpha = 0.9; g.fillRect(Math.round(mx + Math.cos(a) * 22), Math.round(my + Math.sin(a) * 7), 2, 2); g.globalAlpha = 0.25; g.fillRect(Math.round(mx + Math.cos(a) * 22) - 2, Math.round(my + Math.sin(a) * 7) - 2, 6, 6); }
    // Something moves in the quarry: two pale points that cross the workings and stop when you do.
    const moving = v.kidFrame !== 0 || v.still ? 1 : 0;
    const qa = (v.still ? 1 : v.t / 5000 * (moving ? 1 : 0.02)), qx = Math.round((134 + Math.sin(qa) * 9) * TILE) - cx, qy = Math.round((24 + Math.cos(qa * 0.7) * 6) * TILE) - cy;
    if (vis(qx, qy, vw, vh, 20)) { g.globalAlpha = 0.85; g.fillStyle = PAL[9]; g.fillRect(qx, qy, 2, 2); g.fillRect(qx + 6, qy, 2, 2); g.globalAlpha = 0.2; g.fillRect(qx - 3, qy - 2, 14, 6); }
    g.globalAlpha = 1;
  };
  return { under, over, glow };
};
