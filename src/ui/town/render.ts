// The town renderer: a small 2D canvas, scaled up by whole pixels. Static tiles are pre-rendered in
// 16x16-tile chunks (ground and over layers); a frame draws at most a few chunks, the visible sprites
// y-sorted, weather, then the dark with holes cut for lamps and Mote. Nothing is allocated in draw().
import { T, TILE, GATES, PLACES, DISTRICTS, COLLECT, CELL, type Town, type Actor } from '@/game/town';
import { isSeen } from '@/game/town';
import { PAL, drawTile, drawOver, sheet, glow, KID_LOOK, CELL_W, CELL_H, MAP_COL } from './sprites';
import { createLife } from './life';

const CH = 16, CPX = CH * TILE;
export interface View {
  camX: number; camY: number;
  kidX: number; kidY: number; kidDir: number; kidFrame: number;
  moteX: number; moteY: number; moteLevel: number;
  t: number;
  /** Tile being walked to, or -1. */
  goX: number; goY: number;
  markX: number; markY: number;
  still: boolean;
  /** Riding the bike. */
  bike?: boolean;
}
export interface Renderer { resize(w: number, h: number): void; draw(v: View): void; readonly vw: number; readonly vh: number; readonly scale: number; dispose(): void }

interface Chunk { ground: HTMLCanvasElement; over: HTMLCanvasElement; key: number }

export const createRenderer = (canvas: HTMLCanvasElement, town: Town): Renderer => {
  const g = canvas.getContext('2d', { alpha: false })!;
  const light = document.createElement('canvas'), lg = light.getContext('2d')!;
  let map = town.map;
  const cw = Math.ceil(map.w / CH), life = createLife(town);
  const chunks = new Map<number, Chunk>();
  const lampGlow = glow(112, '#ffffff'), moteGlow = glow(96, '#ffffff'), warm = glow(64, PAL[7]), moteSprite = glow(18, PAL[10]);
  const kidSheet = sheet(KID_LOOK, true);
  const sheets = new Map<string, HTMLCanvasElement>();
  for (const a of town.actors) sheets.set(a.id, sheet(a.look, false));
  const spriteOf = new Map<string, NonNullable<(typeof COLLECT)[number]['sprite']>>();
  for (const k of COLLECT) if (k.sprite) spriteOf.set(k.id, k.sprite);
  const order: (Actor | null)[] = new Array<Actor | null>(town.actors.length + 1).fill(null);
  const RAIN = 70, rx = new Float32Array(RAIN), ry = new Float32Array(RAIN);
  let vw = 195, vh = 422, scale = 2, lastT = 0, qLook: Actor['look'] | null = null, qSheet: HTMLCanvasElement | null = null;
  for (let i = 0; i < RAIN; i++) { rx[i] = (i * 97) % 260; ry[i] = (i * 53) % 480; }

  const build = (cx: number, cy: number): Chunk => {
    const mk = (): HTMLCanvasElement => { const c = document.createElement('canvas'); c.width = CPX; c.height = CPX + 96; return c; };
    const ground = mk(), over = mk();
    ground.height = CPX;
    const a = ground.getContext('2d')!, b = over.getContext('2d')!;
    for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) drawTile(a, map, cx * CH + x, cy * CH + y, x * TILE, y * TILE);
    // The over layer has a 96px margin above and takes one extra row below and columns beside, so tall things cross chunk edges.
    for (let y = 0; y < CH + 6; y++) for (let x = -1; x <= CH; x++) drawOver(b, map, cx * CH + x, cy * CH + y, x * TILE, y * TILE + 96 - 0);
    const c: Chunk = { ground, over, key: cy * cw + cx };
    if (chunks.size > 20) { const first = chunks.keys().next().value; if (first !== undefined) chunks.delete(first); }
    chunks.set(c.key, c);
    return c;
  };
  const chunk = (cx: number, cy: number): Chunk => chunks.get(cy * cw + cx) ?? build(cx, cy);

  const resize = (w: number, h: number): void => {
    // Whole pixels, never beyond 4x: a wide window shows more of the world, not bigger squares.
    scale = Math.max(1, Math.min(4, Math.round(Math.min(w / 195, h / 211))));
    vw = Math.ceil(w / scale); vh = Math.ceil(h / scale);
    canvas.width = vw; canvas.height = vh; light.width = vw; light.height = vh;
    canvas.style.width = `${vw * scale}px`; canvas.style.height = `${vh * scale}px`;
    g.imageSmoothingEnabled = false;
  };

  const sprite = (img: HTMLCanvasElement, dir: number, frame: number, x: number, y: number): void => {
    g.drawImage(img, (dir * 2 + frame) * CELL_W, 0, CELL_W, CELL_H, x - 8, y - CELL_H + 3, CELL_W, CELL_H);
  };

  const draw = (v: View): void => {
    if (town.map !== map) { map = town.map; chunks.clear(); }
    const cx = Math.round(v.camX), cy = Math.round(v.camY), dt = v.t - lastT, indoors = town.inside() !== ''; lastT = v.t;
    const x0 = Math.floor(cx / CPX), y0 = Math.floor(cy / CPX), x1 = Math.floor((cx + vw - 1) / CPX), y1 = Math.floor((cy + vh - 1) / CPX);
    g.fillStyle = PAL[1]; g.fillRect(0, 0, vw, vh);
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) { if (i < 0 || j < 0 || i >= cw || j >= cw) continue; g.drawImage(chunk(i, j).ground, i * CPX - cx, j * CPX - cy); }
    const dark = town.dark(), weather = town.weather(), night = dark > 0.45;

    // Shut gates.
    if (!indoors) life.under(g, v, cx, cy, vw, vh);
    for (let k = 0; k < GATES.length; k++) {
      const gt = GATES[k]!;
      if (indoors || town.gateOpen(k) || gt.look === 'dog') continue;
      for (let j = 0; j < (gt.h ?? 1); j++) for (let i = 0; i < (gt.w ?? 1); i++) {
        const x = (gt.at[0] + i) * TILE - cx, y = (gt.at[1] + j) * TILE - cy;
        if (x < -16 || y < -16 || x > vw || y > vh) continue;
        if (gt.look === 'dark') { g.fillStyle = PAL[15]; g.fillRect(x, y, 16, 16); }
        else if (gt.look === 'brambles') { g.fillStyle = PAL[2]; g.fillRect(x, y + 3, 16, 12); g.fillStyle = PAL[3]; g.fillRect(x + 1, y + 2, 6, 5); g.fillRect(x + 8, y + 5, 7, 6); g.fillRect(x + 3, y + 9, 6, 5); g.fillStyle = PAL[1]; g.fillRect(x + 2, y + 6, 12, 1); g.fillRect(x + 5, y + 3, 1, 11); g.fillRect(x + 11, y + 4, 1, 10); g.fillStyle = PAL[12]; g.fillRect(x + 4, y + 5, 1, 1); g.fillRect(x + 10, y + 8, 1, 1); g.fillRect(x + 7, y + 12, 1, 1); g.fillRect(x + 13, y + 6, 1, 1); }
        else if (gt.look === 'chain') { g.fillStyle = PAL[1]; g.fillRect(x + 1, y + 2, 2, 13); g.fillRect(x + 13, y + 2, 2, 13); g.fillStyle = PAL[6]; for (let b = 2; b < 14; b += 3) g.fillRect(x + b, y + 7 + ((b >> 1) & 1), 2, 2); g.fillStyle = PAL[7]; g.fillRect(x + 7, y + 9, 3, 3); }
        else if (gt.look === 'rubble') { g.fillStyle = PAL[1]; g.fillRect(x + 1, y + 6, 14, 9); g.fillStyle = PAL[5]; g.fillRect(x + 2, y + 7, 6, 5); g.fillRect(x + 9, y + 9, 5, 5); g.fillStyle = PAL[6]; g.fillRect(x + 5, y + 4, 6, 5); g.fillStyle = PAL[8]; g.fillRect(x + 6, y + 4, 4, 1); }
        else if (gt.look === 'water') { g.fillStyle = PAL[13]; g.fillRect(x, y, 16, 16); g.fillStyle = PAL[14]; g.fillRect(x + 2 + (((v.t / 600) | 0) & 3), y + 5, 5, 1); g.fillRect(x + 8, y + 11, 4, 1); }
        else if (gt.look === 'bar') { g.fillStyle = PAL[12]; g.fillRect(x, y + 6, 16, 3); g.fillStyle = PAL[9]; g.fillRect(x + 4, y + 6, 4, 3); g.fillRect(x + 12, y + 6, 4, 3); }
        else { g.fillStyle = PAL[1]; g.fillRect(x, y + 3, 16, 2); g.fillRect(x, y + 11, 16, 2); for (let b = 1; b < 16; b += 4) g.fillRect(x + b, y + 1, 2, 14); g.fillStyle = PAL[7]; g.fillRect(x + 7, y + 6, 3, 3); }
      }
    }
    // Things lying on the ground.
    for (let k = 0; k < town.finds.length; k++) {
      const f = town.finds[k]!;
      if (f.taken || indoors) continue;
      const x = f.x * TILE - cx, y = f.y * TILE - cy;
      if (x < -16 || y < -16 || x > vw || y > vh) continue;
      const sp = spriteOf.get(f.kind), shape = sp?.shape ?? (f.kind === 'feather' ? 'feather' : 'dot');
      const c = sp ? sp.colour & 15 : f.kind === 'cap' ? 7 : f.kind === 'feather' ? 9 : f.kind === 'glass' ? 14 : 12;
      g.fillStyle = PAL[1]; g.fillRect(x + 5, y + 9, 6, 2);
      g.fillStyle = PAL[c]!;
      if (shape === 'feather') { g.fillRect(x + 6, y + 5, 2, 5); g.fillRect(x + 8, y + 4, 2, 4); }
      else if (shape === 'leaf') { g.fillRect(x + 5, y + 6, 6, 3); g.fillRect(x + 6, y + 5, 4, 5); g.fillStyle = PAL[1]; g.fillRect(x + 8, y + 5, 1, 5); }
      else if (shape === 'shard') { g.fillRect(x + 7, y + 3, 2, 7); g.fillRect(x + 6, y + 6, 4, 3); }
      else if (shape === 'ring') { g.fillRect(x + 5, y + 5, 6, 5); g.fillStyle = PAL[1]; g.fillRect(x + 7, y + 7, 2, 1); }
      else if (shape === 'page') { g.fillRect(x + 5, y + 4, 6, 7); g.fillStyle = PAL[1]; g.fillRect(x + 6, y + 6, 4, 1); g.fillRect(x + 6, y + 8, 3, 1); }
      else g.fillRect(x + 6, y + 6, 4, 3);
      if (((v.t / 400 + k) | 0) % 5 === 0 && !v.still) { g.fillStyle = PAL[9]; g.fillRect(x + 9, y + 4, 1, 3); g.fillRect(x + 8, y + 5, 3, 1); }
    }
    if (v.goX >= 0) { const x = v.goX * TILE - cx, y = v.goY * TILE - cy; g.fillStyle = PAL[10]; g.globalAlpha = 0.7; g.fillRect(x + 3, y + 7, 10, 1); g.fillRect(x + 3, y + 12, 10, 1); g.fillRect(x + 2, y + 8, 1, 4); g.fillRect(x + 13, y + 8, 1, 4); g.globalAlpha = 1; }

    // Sprites, sorted by their feet.
    let n = 0;
    for (let k = 0; k < town.actors.length; k++) {
      const a = town.actors[k]!;
      if (!a.here || a.x < cx - 16 || a.x > cx + vw + 16 || a.y < cy - 8 || a.y > cy + vh + 28) continue;
      let i = n++;
      while (i > 0 && order[i - 1] !== null && order[i - 1]!.y > a.y) { order[i] = order[i - 1]!; i--; }
      order[i] = a;
    }
    let kidDone = false;
    const step = ((v.t / 220) | 0) & 1;
    for (let k = 0; k <= n; k++) {
      const a = k < n ? order[k]! : null;
      if (!kidDone && (a === null || a.y > v.kidY)) {
        const kx = Math.round(v.kidX) - cx, ky = Math.round(v.kidY) - cy;
        if (v.bike) { const side = v.kidDir >= 2; g.fillStyle = PAL[0]; if (side) { g.fillRect(kx - 9, ky - 3, 6, 6); g.fillRect(kx + 3, ky - 3, 6, 6); g.fillRect(kx - 6, ky - 5, 12, 2); g.fillStyle = PAL[5]; g.fillRect(kx - 7, ky - 1, 2, 2); g.fillRect(kx + 5, ky - 1, 2, 2); } else { g.fillRect(kx - 2, ky - 4, 4, 8); g.fillRect(kx - 6, ky - 8, 12, 2); } }
        sprite(kidSheet, v.kidDir, v.bike ? 0 : v.kidFrame, kx, ky - (v.bike ? 3 : 0)); kidDone = true;
      }
      if (a) {
        let img = sheets.get(a.id)!;
        if (a.kind === 'quest') { if (a.look !== qLook) { qLook = a.look; qSheet = sheet(a.look, false); } img = qSheet ?? img; }
        sprite(img, a.dir, a.moving ? step : 0, Math.round(a.x) - cx, Math.round(a.y) - cy);
        if (a.alert && v.t - a.alert < 1600 && a.alert <= v.t) { const ax = Math.round(a.x) - cx, ay = Math.round(a.y) - cy - 30; g.fillStyle = PAL[0]; g.fillRect(ax - 3, ay - 1, 6, 12); g.fillStyle = PAL[12]; g.fillRect(ax - 1, ay, 2, 6); g.fillRect(ax - 1, ay + 8, 2, 2); }
      }
    }
    // Over layer: canopies, lamp heads, the mast. A wind leans them one pixel.
    const lean = weather === 'wind' && !v.still ? Math.round(Math.sin(v.t / 380)) : 0;
    for (let j = y0; j <= y1 + 1; j++) for (let i = x0; i <= x1; i++) { if (i < 0 || j < 0 || i >= cw || j >= cw) continue; g.drawImage(chunk(i, j).over, i * CPX - cx + lean, j * CPX - cy - 96); }

    if (!indoors) life.over(g, v, cx, cy, vw, vh);
    // Quest marker.
    if (v.markX >= 0 && !indoors) {
      const mx = v.markX * TILE + 8 - cx, my = v.markY * TILE - cy - 22;
      const inside = mx > 6 && mx < vw - 6 && my > 60 && my < vh - 70;
      const px = inside ? mx : Math.max(8, Math.min(vw - 8, mx)), py = inside ? my + (v.still ? 0 : Math.round(Math.sin(v.t / 260) * 2)) : Math.max(64, Math.min(vh - 74, my));
      g.fillStyle = PAL[0]; g.fillRect(px - 4, py - 1, 9, 3); g.fillRect(px - 1, py - 4, 3, 9); g.fillRect(px - 3, py - 3, 7, 7);
      g.fillStyle = PAL[7]; g.fillRect(px - 3, py, 7, 1); g.fillRect(px, py - 3, 1, 7); g.fillRect(px - 2, py - 2, 5, 5); g.fillStyle = PAL[9]; g.fillRect(px - 1, py - 1, 2, 2);
    }

    // Weather.
    if (weather === 'rain') {
      g.fillStyle = PAL[14]; g.globalAlpha = 0.5;
      for (let i = 0; i < RAIN; i++) { ry[i] = ry[i]! + dt * 0.32; rx[i] = rx[i]! - dt * 0.06; if (ry[i]! > vh) { ry[i] = ry[i]! - vh - 8; rx[i] = (rx[i]! + 131) % (vw + 40); } if (rx[i]! < -4) rx[i] = rx[i]! + vw + 40; g.fillRect(rx[i]! | 0, ry[i]! | 0, 1, 5); }
      g.globalAlpha = 1;
    } else if (weather === 'fog') {
      g.fillStyle = PAL[9]; g.globalAlpha = 0.2; g.fillRect(0, 0, vw, vh);
      g.globalAlpha = 0.1; for (let i = 0; i < 5; i++) { const y = ((i * 97 + v.t / 90) % (vh + 80)) - 40; g.fillRect(0, y | 0, vw, 26); }
      g.globalAlpha = 1;
    }
    if (weather === 'rain') { g.fillStyle = PAL[13]; g.globalAlpha = 0.14; g.fillRect(0, 0, vw, vh); g.globalAlpha = 1; }

    // The dark, with holes for every light.
    const mx = Math.round(v.moteX) - cx, my = Math.round(v.moteY) - cy;
    if (dark > 0.02) {
      lg.globalCompositeOperation = 'source-over';
      lg.clearRect(0, 0, vw, vh);
      lg.fillStyle = dark < 0.6 ? '#3a1c22' : '#0b0c18'; lg.globalAlpha = Math.min(0.8, dark * 0.8); lg.fillRect(0, 0, vw, vh);
      lg.globalAlpha = 1; lg.globalCompositeOperation = 'destination-out';
      const tx0 = Math.floor(cx / TILE) - 4, ty0 = Math.floor(cy / TILE) - 4, tx1 = tx0 + Math.ceil(vw / TILE) + 8, ty1 = ty0 + Math.ceil(vh / TILE) + 8;
      if (night) for (let k = 0; k < map.lamps.length; k++) { const l = map.lamps[k]!; if (l[0] < tx0 || l[0] > tx1 || l[1] < ty0 || l[1] > ty1) continue; lg.drawImage(lampGlow, l[0] * TILE + 8 - cx - 56, l[1] * TILE - 6 - cy - 56); }
      const ms = 0.45 + v.moteLevel * 0.75;
      lg.globalAlpha = 0.35 + v.moteLevel * 0.6; lg.drawImage(moteGlow, mx - 48 * ms, my - 48 * ms, 96 * ms, 96 * ms); lg.globalAlpha = 1;
      g.drawImage(light, 0, 0);
      if (dark > 0.12) {
        // Lit windows (they come on house by house as it darkens) and warm lamp heads, over the dark.
        const a0 = Math.max(0, tx0 + 3), b0 = Math.max(0, ty0 + 3), a1 = Math.min(map.w - 1, tx1 - 3), b1 = Math.min(map.h - 1, ty1 - 3);
        g.globalCompositeOperation = 'lighter';
        for (let ty = b0; ty <= b1; ty++) for (let tx = a0; tx <= a1; tx++) {
          const t = map.tiles[ty * map.w + tx]!;
          if (t === T.LAMP) { if (!night) continue; g.globalAlpha = 0.5; g.drawImage(warm, tx * TILE + 8 - cx - 32, ty * TILE - 10 - cy - 32); g.globalAlpha = 1; }
          else if (t === T.WINDOW && (map.noise[ty * map.w + tx]! & 3) !== 0 && dark > 0.15 + ((map.noise[ty * map.w + (tx & ~7)]! >> 2) & 15) * 0.035) { g.fillStyle = PAL[7]; g.globalAlpha = 0.8; g.fillRect(tx * TILE + 4 - cx, ty * TILE + 4 - cy, 8, 6); g.globalAlpha = 0.25; g.fillRect(tx * TILE + 2 - cx, ty * TILE + 14 - cy, 12, 8); g.globalAlpha = 1; }
        }
        life.glow(g, v, cx, cy, vw, vh, dark);
        g.globalCompositeOperation = 'source-over';
      }
    }
    // Mote.
    g.globalAlpha = 0.35 + v.moteLevel * 0.65; g.drawImage(moteSprite, mx - 9, my - 9); g.globalAlpha = 1;
    g.fillStyle = PAL[9]; g.fillRect(mx - 1, my - 1, 2, 2);
  };

  return { resize, draw, get vw() { return vw; }, get vh() { return vh; }, get scale() { return scale; }, dispose: () => { chunks.clear(); } };
};

/** The map sheet: one pixel per tile times `k`, fogged where unexplored. Not called per frame. */
export const paintMap = (canvas: HTMLCanvasElement, town: Town, k = 2, all = false): void => {
  const m = town.outdoor, st = town.state;
  canvas.width = m.w * k; canvas.height = m.h * k;
  const g = canvas.getContext('2d')!;
  g.fillStyle = PAL[1]; g.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (!all && !isSeen(st, x, y)) { if (((x + y) & 3) === 0 && (x % CELL === 0 || y % CELL === 0)) { g.fillStyle = PAL[2]; g.fillRect(x * k, y * k, k, k); } continue; }
    g.fillStyle = PAL[MAP_COL[m.tiles[y * m.w + x]!]!]!; g.fillRect(x * k, y * k, k, k);
  }
  g.font = '600 9px ui-monospace, monospace'; g.textAlign = 'center';
  for (const d of DISTRICTS) {
    if (!st.districts.includes(d.id) && !all) continue;
    const x = (d.rect[0] + d.rect[2] / 2) * k, y = (d.rect[1] + d.rect[3] / 2) * k + (d.id === 'rail' ? 2 : 0);
    g.fillStyle = PAL[0]; g.fillText(d.name.toUpperCase(), x + 1, y + 1); g.fillStyle = PAL[9]; g.fillText(d.name.toUpperCase(), x, y);
  }
  for (const p of PLACES) {
    if (!st.places.includes(p.id) || p.sign || p.bench || (p.at[0] === 0 && p.at[1] === 0)) continue;
    g.fillStyle = PAL[0]; g.fillRect(p.at[0] * k - 2, p.at[1] * k - 2, 5, 5); g.fillStyle = PAL[p.stop ? 12 : p.hidden ? 14 : 7]; g.fillRect(p.at[0] * k - 1, p.at[1] * k - 1, 3, 3);
  }
  // Every open errand gets a small gold mark; the one being followed gets the cross.
  for (const q of town.quests()) { if (q.st.done) continue; const s = q.def.steps[q.st.stage]; const at = s?.mark ?? (s?.on.type === 'reach' && !s.on.inside ? s.on.at : null); if (at) { g.fillStyle = PAL[0]; g.fillRect(at[0] * k - 2, at[1] * k - 2, 5, 5); g.fillStyle = PAL[7]; g.fillRect(at[0] * k - 1, at[1] * k - 1, 3, 3); } }
  const lead = town.lead();
  if (lead?.at) { const x = lead.at[0] * k, y = lead.at[1] * k; g.fillStyle = PAL[0]; g.fillRect(x - 4, y - 4, 9, 9); g.fillStyle = PAL[7]; g.fillRect(x - 3, y - 1, 7, 3); g.fillRect(x - 1, y - 3, 3, 7); }
  const kx = Math.floor((st.inside ? st.bx ?? st.x : st.x) / TILE) * k, ky = Math.floor((st.inside ? st.by ?? st.y : st.y) / TILE) * k;
  g.fillStyle = PAL[0]; g.fillRect(kx - 3, ky - 3, 7, 7); g.fillStyle = PAL[10]; g.fillRect(kx - 2, ky - 2, 5, 5);
};
