// Bedroom renderer (unit 16): top-down pixel room, kid walks, Mote eases after, PC glows.
// Scene 0 is the kid's own bedroom: a window with a sky, a shelf of trophies, a poster, a bed to sleep in.
// Any other scene (the mirror) is the plain room.
import type { RoomRendererFactory, GlCore, RoomDecor, RoomRenderView } from '@/contracts/render';
import { fxSin } from '@/core/fixed';

const PAL = ['#17140c', '#231f12', '#2e2a18', '#3d3822', '#6f6535', '#8a7f4e', '#b3a868', '#c9bb62', '#e9dd9a', '#f6f0c8', '#bfeedd', '#5a4a2a', '#8c3b22', '#4f7f86', '#a2d8c4', '#000000'];
const BW = 60, BH = 84;
/** The bedroom is a little shorter so it fills its rect at a whole pixel scale. */
const HH = 78;
const PW = 8, PH = 10, PX = 5, PY = 2;
const WX = 22, WY = 2, WW = 16, WH = 9;
export const ROOM_RECT = (w: number) => ({ x: 15, y: 84, w: w - 30, h: 470 });

// Spots, in ROOM_SPOTS order: window, bed, pc, shelf, poster, box. Hit rect (x, y, w, h) and where to stand.
const HIT = [21, 0, 18, 13, 4, 15, 14, 24, 40, 13, 17, 12, 41, 1, 17, 10, 4, 0, 10, 13, 44, 58, 12, 10];
const STAND = [30, 17, 20, 29, 48, 27, 37, 18, 11, 42, 42, 64];
const SPOTS = 6;
const STARS = [1, 1, 5, 3, 10, 0, 12, 5, 14, 1, 3, 6, 6, 7, 11, 7, 15, 6];
const TROPHY_A = [13, 12, 4, 7, 6];
const TROPHY_B = [10, 14, 9, 8, 10];
const NO_DECOR: RoomDecor = { hour: 12, weather: 0, trophies: [0, 0, 0, 0, 0], poster: null, asleep: false, moteMood: 0, focus: -1 };

export const factory: RoomRendererFactory = () => {
  let core: GlCore | null = null;
  let idx: WebGLTexture | null = null;
  let idx0: WebGLTexture | null = null;
  let pal: WebGLTexture | null = null;
  let posterIdx: WebGLTexture | null = null;
  let posterPal: WebGLTexture | null = null;
  let posterSeed = -1;
  let posterPalette: readonly string[] | null = null;
  const buf = new Uint8Array(BW * BH);
  const base = new Uint8Array(BW * BH);
  const buf0 = new Uint8Array(BW * HH);
  const base0 = new Uint8Array(BW * HH);
  const posterBuf = new Uint8Array(PW * PH);
  const kid = { x: 30, y: 60 };
  const mote = { x: 36, y: 54 };
  const moteCss = { x: 0, y: 0 };
  const kidCss = { x: 0, y: 0 };
  const standCss = { x: 0, y: 0 };
  const posterRect = { x: 0, y: 0, w: 0, h: 0 };
  // The bedroom's true rect on screen (blit centres a whole-pixel scale inside ROOM_RECT).
  const map = { x: 15, y: 84, s: 6 };
  let started = false;
  let scene = 0;
  let t = 0;
  let nearSpot = -1;
  let bh = BH;
  const rect = (x0: number, y0: number, w: number, h: number, c: number, b = base) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < BW && y < bh) b[y * BW + x] = c;
  };
  // The plain room: floor boards, walls, bed, desk with PC, rug, window, box.
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) base[y * BW + x] = (y % 6 === 0 || (x + (y / 6 | 0) * 9) % 17 === 0) ? 2 : 1;
  rect(0, 0, BW, 6, 3); rect(0, 0, 2, BH, 3); rect(BW - 2, 0, 2, BH, 3); rect(0, BH - 2, BW, 2, 3);
  rect(22, 1, 14, 4, 13); rect(23, 2, 12, 2, 14); // window
  rect(4, 8, 14, 22, 11); rect(5, 9, 12, 6, 8); rect(5, 16, 12, 13, 12); // bed
  rect(38, 7, 18, 9, 5); rect(43, 8, 8, 6, 4); // desk + PC
  rect(18, 40, 24, 16, 3); rect(20, 42, 20, 12, 2); // rug
  rect(46, 64, 8, 7, 7); rect(47, 65, 6, 5, 6); // the box

  // The bedroom.
  bh = HH;
  for (let y = 0; y < HH; y++) for (let x = 0; x < BW; x++) base0[y * BW + x] = (y % 6 === 1 || (x + (y / 6 | 0) * 9) % 17 === 0) ? 2 : 1;
  rect(0, 0, BW, 13, 3, base0); rect(0, 13, BW, 1, 4, base0); // back wall and skirting
  rect(0, 0, 2, HH, 3, base0); rect(BW - 2, 0, 2, HH, 3, base0); rect(0, HH - 2, BW, 2, 3, base0);
  rect(WX - 1, WY - 1, WW + 2, WH + 2, 5, base0); rect(WX - 2, WY + WH + 1, WW + 4, 1, 6, base0); // window frame and sill
  rect(PX - 1, PY - 1, PW + 2, PH + 2, 11, base0); rect(PX, PY, PW, PH, 5, base0); rect(PX + 2, PY + 3, 4, 1, 4, base0); rect(PX + 2, PY + 5, 3, 1, 4, base0); // bare poster
  rect(42, 9, 15, 1, 11, base0); rect(43, 10, 1, 2, 11, base0); rect(55, 10, 1, 2, 11, base0); // shelf
  rect(4, 16, 14, 23, 11, base0); rect(5, 17, 12, 6, 8, base0); rect(5, 24, 12, 14, 12, base0); rect(5, 24, 12, 1, 6, base0); // bed
  rect(40, 15, 17, 9, 5, base0); rect(40, 23, 17, 1, 11, base0); rect(45, 14, 8, 6, 4, base0); rect(48, 20, 2, 1, 3, base0); rect(45, 21, 8, 1, 3, base0); // desk, PC, keys
  rect(47, 26, 4, 3, 11, base0); rect(47, 26, 4, 1, 4, base0); // chair
  rect(18, 40, 24, 16, 3, base0); rect(20, 42, 20, 12, 2, base0); rect(22, 44, 16, 8, 3, base0); // rug
  rect(46, 60, 8, 7, 7, base0); rect(47, 61, 6, 5, 6, base0); rect(49, 63, 2, 1, 9, base0); // the box
  rect(5, 64, 4, 4, 12, base0); rect(6, 61, 2, 3, 13, base0); rect(4, 62, 2, 1, 13, base0); rect(8, 60, 2, 1, 14, base0); // a plant
  bh = BH;

  const hash = (a: number, b: number) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return h >>> 0; };
  const paintPoster = (seed: number) => {
    // A mirrored mark on a dark ground, in the universe's own colours.
    const ground = 1 + (hash(seed, 1) % 3);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const mx = x < PW / 2 ? x : PW - 1 - x;
      const h = hash(seed, y * 4 + mx + 7);
      const ring = Math.abs(mx - 3) + Math.abs(y - 4);
      let c = ground;
      if (ring <= 1) c = 12 + (hash(seed, 2) % 4);
      else if (ring === 3) c = 6 + (hash(seed, 3) % 5);
      else if (h % 5 === 0) c = 4 + (h >>> 8) % 11;
      if (y === 0 || y === PH - 1) c = ground + 1;
      posterBuf[y * PW + x] = c;
    }
  };
  const sky = (d: RoomDecor) => {
    const h = d.hour;
    const night = h < 5 || h >= 21;
    const edge = !night && (h < 7 || h >= 18.5);
    const wet = d.weather >= 2;
    for (let y = 0; y < WH; y++) {
      const c = night ? 0 : edge ? (y < 3 ? 13 : y < 6 ? 12 : 7) : wet ? (y < 6 ? 4 : 5) : (y < 5 ? 13 : 14);
      rect(WX, WY + y, WW, 1, c, buf0);
    }
    if (night && !wet) for (let i = 0; i < STARS.length; i += 2) if (((t / 700 | 0) + i) % 7 !== 0) rect(WX + STARS[i]!, WY + STARS[i + 1]!, 1, 1, i % 6 === 0 ? 9 : 6, buf0);
    // Sun by day, moon by night, on the same slow arc.
    const day = h >= 5 && h < 18.5;
    const a = day ? (h - 5) / 13.5 : ((h + 24 - 18.5) % 24) / 10.5;
    if (!wet && a >= 0 && a <= 1 && (day || night)) {
      const sx = WX + Math.round(a * (WW - 2)), sy = WY + 6 - Math.round(Math.sin(a * Math.PI) * 6);
      rect(sx, sy, 2, 2, 9, buf0);
      if (!day) rect(sx + 1, sy, 1, 1, 0, buf0);
    }
    if (d.weather >= 1) {
      const cc = night ? 3 : wet ? 6 : 9;
      for (let i = 0; i < 2 + d.weather; i++) {
        const cx = Math.floor(((t / (900 + i * 260) + i * 9) % (WW + 8)) - 6), cy = (i * 3) % 6;
        for (let x = 0; x < 6; x++) { const px = cx + x; if (px >= 0 && px < WW) { rect(WX + px, WY + cy + 1, 1, 1, cc, buf0); if (x > 0 && x < 5) rect(WX + px, WY + cy, 1, 1, cc, buf0); } }
      }
    }
    if (wet) { const k = t / 90 | 0; for (let i = 0; i < 9; i++) rect(WX + (i * 7 + (k >> 2)) % WW, WY + (i * 4 + k) % WH, 1, 1, night ? 13 : 10, buf0); }
    rect(WX + 7, WY, 2, WH, 5, buf0); rect(WX, WY + 4, WW, 1, 5, buf0); // glazing bars
  };
  const trophies = (d: RoomDecor) => {
    for (let i = 0; i < 5; i++) {
      const lv = Math.max(0, Math.min(3, d.trophies[i] ?? 0)), x = 43 + i * 3, a = TROPHY_A[i]!, b = TROPHY_B[i]!;
      if (lv === 0) { rect(x, 8, 1, 1, 2, buf0); continue; }
      if (i === 0) { rect(x, 8, 2, 1, a, buf0); for (let k = 0; k < lv; k++) rect(x + (k & 1), 7 - k, 1, 1, k === lv - 1 ? b : a, buf0); } // a fold, climbing
      else if (i === 1) { rect(x, 8, 2, 1, a, buf0); rect(x, 8 - lv, 1, lv, 13, buf0); rect(x + 1, 8 - lv, 1, 1, b, buf0); } // a pot that grows
      else if (i === 2) { rect(x, 8, 2, 1, a, buf0); rect(x, 7, 1, 1, a, buf0); rect(x, 7 - lv, 2, lv, b, buf0); } // a cup
      else if (i === 3) { for (let k = 0; k <= lv; k++) rect(x, 8 - k, 2, 1, k & 1 ? b : a, buf0); } // small boxes, stacked
      else { rect(x, 9 - lv, 1, lv, a, buf0); rect(x, 8 - lv, 1, 1, ((t / 260 | 0) & 1) ? b : 9, buf0); } // a candle
    }
  };
  const corners = (i: number) => {
    const x = HIT[i * 4]!, y = HIT[i * 4 + 1]!, w = HIT[i * 4 + 2]!, h = HIT[i * 4 + 3]!;
    const c = ((t / 350 | 0) & 1) ? 10 : 14;
    rect(x, y, 2, 1, c, buf0); rect(x, y, 1, 2, c, buf0); rect(x + w - 2, y, 2, 1, c, buf0); rect(x + w - 1, y, 1, 2, c, buf0);
    rect(x, y + h - 1, 2, 1, c, buf0); rect(x, y + h - 2, 1, 2, c, buf0); rect(x + w - 2, y + h - 1, 2, 1, c, buf0); rect(x + w - 1, y + h - 2, 1, 2, c, buf0);
  };
  const bedroom = (c: GlCore, v: RoomRenderView, dtMs: number) => {
    const d = v.decor ?? NO_DECOR;
    // A rect from the view (the desktop's play area) or the phone's fixed spot.
    const R = v.rect ?? ROOM_RECT(c.width());
    const ps = c.pixelScale();
    const s = Math.max(1, Math.floor(Math.min((R.w * ps) / BW, (R.h * ps) / HH))) / ps;
    map.s = s; map.x = R.x + (R.w - BW * s) / 2; map.y = R.y + (R.h - HH * s) / 2;
    const dt = Math.min(dtMs, 100);
    t += dt;
    if (!started || scene !== 0) { kid.x = (v.kid.x - map.x) / s; kid.y = Math.max(16, Math.min(HH - 5, (v.kid.y - map.y) / s)); mote.x = kid.x + 6; mote.y = kid.y - 6; started = true; scene = 0; }
    const step = dt * 0.024;
    let moving = 0;
    if (v.target && !d.asleep) {
      const tx = Math.max(4, Math.min(BW - 5, (v.target.x - map.x) / s)), ty = Math.max(16, Math.min(HH - 5, (v.target.y - map.y) / s));
      const dx = tx - kid.x, dy = ty - kid.y, dist = Math.hypot(dx, dy);
      if (dist > step) { kid.x += (dx / dist) * step; kid.y += (dy / dist) * step; moving = 1; } else { kid.x = tx; kid.y = ty; }
    }
    nearSpot = -1;
    for (let i = 0; i < SPOTS; i++) if (Math.abs(kid.x - STAND[i * 2]!) < 1.6 && Math.abs(kid.y - STAND[i * 2 + 1]!) < 1.6) nearSpot = i;
    // Mote: follows and bobs, circles when it has something to say, waits over the box when the box has news.
    const bob = Math.sin(t / 420) * 1.2;
    let gx = kid.x + 5, gy = kid.y - 5 + bob, ease = 0.06;
    if (d.asleep) { gx = 20; gy = 17 + bob * 0.5; }
    else if (d.moteMood === 1) { gx = kid.x + Math.cos(t / 260) * 6; gy = kid.y - 2 + Math.sin(t / 260) * 4; ease = 0.2; }
    else if (d.moteMood === 2) { gx = 50; gy = 55 + bob; }
    const k = Math.min(1, (ease * dt) / 16);
    mote.x += (gx - mote.x) * k; mote.y += (gy - mote.y) * k;

    bh = HH;
    buf0.set(base0);
    sky(d);
    trophies(d);
    const on = fxSin(v.pulse) > 0;
    rect(46, 15, 6, 4, on ? 10 : 14, buf0); rect(47, 16, 3, 1, on ? 14 : 13, buf0); // PC screen pulses
    if (d.focus >= 0 && d.focus < SPOTS) corners(d.focus);
    const kx = Math.round(kid.x), ky = Math.round(kid.y);
    if (d.asleep) { rect(9, 19, 3, 3, 6, buf0); rect(9, 19, 3, 1, 11, buf0); rect(8, 26, 6, 9, ((t / 1400 | 0) & 1) ? 11 : 6, buf0); rect(9, 27, 4, 7, 12, buf0); }
    else {
      const walk = moving ? (t / 140 | 0) & 1 : 0;
      rect(kx - 1, ky - 3, 3, 3, 8, buf0); rect(kx - 1, ky - 3, 3, 1, 11, buf0); rect(kx - 1, ky, 3, 3, 12, buf0);
      rect(kx - 1, ky + 3 - walk, 1, 1, 0, buf0); rect(kx + 1, ky + 2 + walk, 1, 1, 0, buf0);
    }
    const mx = Math.round(mote.x), my = Math.round(mote.y);
    const low = v.lightPips <= 2, out = v.lightPips <= 0;
    const flick = low && ((t / 180 | 0) % 5 === 0);
    if (!out && !flick && !d.asleep) { rect(mx - 1, my, 3, 1, low ? 13 : 14, buf0); rect(mx, my - 1, 1, 3, low ? 13 : 14, buf0); }
    if (!low && !d.asleep && on) { rect(mx - 2, my, 1, 1, 13, buf0); rect(mx + 2, my, 1, 1, 13, buf0); rect(mx, my - 2, 1, 1, 13, buf0); rect(mx, my + 2, 1, 1, 13, buf0); }
    rect(mx, my, 1, 1, out || d.asleep ? 13 : low ? 14 : 10, buf0);
    bh = BH;
    moteCss.x = map.x + (mx + 0.5) * s; moteCss.y = map.y + (my + 0.5) * s;
    kidCss.x = map.x + (kx + 0.5) * s; kidCss.y = map.y + ky * s;

    if (!idx0) idx0 = c.indexTexture(BW, HH);
    if (!pal) pal = c.paletteTexture(PAL);
    c.clear(PAL[0]!);
    c.uploadIndices(idx0, BW, HH, buf0);
    c.blit(idx0, pal, BW, HH, R);
    if (d.poster) {
      // Only when the poster changes: a new pattern and that universe's palette.
      if (!posterIdx || !posterPal || d.poster.seed !== posterSeed || d.poster.palette !== posterPalette) {
        if (posterPal) c.gl.deleteTexture(posterPal);
        posterPal = c.paletteTexture(d.poster.palette);
        if (!posterIdx) posterIdx = c.indexTexture(PW, PH);
        paintPoster(d.poster.seed);
        c.uploadIndices(posterIdx, PW, PH, posterBuf);
        posterSeed = d.poster.seed; posterPalette = d.poster.palette;
      }
      posterRect.x = map.x + PX * s; posterRect.y = map.y + PY * s; posterRect.w = PW * s; posterRect.h = PH * s;
      c.blit(posterIdx, posterPal, PW, PH, posterRect);
    }
  };
  return {
    init: (c) => {
      core = c;
      c.onRestore(() => { idx = idx0 = pal = posterIdx = posterPal = null; });
    },
    draw: (v, dt) => {
      if (!core || core.lost()) return;
      if ((v.scene ?? 0) === 0) { bedroom(core, v, dt); return; }
      const R = v.rect ?? ROOM_RECT(core.width());
      // Given a rect, the room sits where blit will put it: a whole-pixel scale, centred. Without one, the phone's old mapping.
      let s = R.w / BW, ox = R.x, oy = R.y;
      if (v.rect) {
        const ps = core.pixelScale();
        s = Math.max(1, Math.floor(Math.min((R.w * ps) / BW, (R.h * ps) / BH))) / ps;
        ox = R.x + (R.w - BW * s) / 2; oy = R.y + (R.h - BH * s) / 2;
      }
      if (!started || (v.scene ?? 0) !== scene) { kid.x = (v.kid.x - ox) / s; kid.y = (v.kid.y - oy) / s; mote.x = kid.x + 6; mote.y = kid.y - 6; started = true; scene = v.scene ?? 0; }
      if (v.target) {
        const tx = Math.max(3, Math.min(BW - 4, (v.target.x - ox) / s)), ty = Math.max(8, Math.min(BH - 4, (v.target.y - oy) / s));
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
      moteCss.x = ox + mx * s; moteCss.y = oy + my * s;
      kidCss.x = ox + kx * s; kidCss.y = oy + ky * s;
      nearSpot = -1;
      if (!idx) idx = core.indexTexture(BW, BH);
      if (!pal) pal = core.paletteTexture(PAL);
      core.clear(PAL[0]!);
      core.uploadIndices(idx, BW, BH, buf);
      core.blit(idx, pal, BW, BH, R);
    },
    dispose: () => void (core = null),
    mote: () => moteCss,
    kid: () => kidCss,
    spotAt: (x, y) => {
      const cx = (x - map.x) / map.s, cy = (y - map.y) / map.s;
      for (let i = 0; i < SPOTS; i++) { const hx = HIT[i * 4]!, hy = HIT[i * 4 + 1]!; if (cx >= hx && cy >= hy && cx < hx + HIT[i * 4 + 2]! && cy < hy + HIT[i * 4 + 3]!) return i; }
      return -1;
    },
    standAt: (i) => {
      standCss.x = map.x + (STAND[i * 2] ?? 30) * map.s; standCss.y = map.y + (STAND[i * 2 + 1] ?? 40) * map.s;
      return standCss;
    },
    near: () => nearSpot,
  };
};
