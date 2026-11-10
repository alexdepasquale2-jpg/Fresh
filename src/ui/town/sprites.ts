// All pixel art of the town, drawn in code from the bedroom's 16 colours. No image files.
import { T, type Look } from '@/game/town';
import type { TownMap } from '@/game/town/map';

/** The bedroom palette (src/render/room). */
export const PAL = ['#17140c', '#231f12', '#2e2a18', '#3d3822', '#6f6535', '#8a7f4e', '#b3a868', '#c9bb62', '#e9dd9a', '#f6f0c8', '#bfeedd', '#5a4a2a', '#8c3b22', '#4f7f86', '#a2d8c4', '#000000'] as const;
type G = CanvasRenderingContext2D;
const r = (g: G, c: number, x: number, y: number, w: number, h: number): void => { g.fillStyle = PAL[c]!; g.fillRect(x, y, w, h); };

const GROUND = new Set<number>([T.GRASS, T.TALL, T.PATH, T.ROAD, T.PAVE, T.SAND, T.GRAVEL, T.YARD, T.FLOWER]);
const at = (m: TownMap, x: number, y: number): number => (x < 0 || y < 0 || x >= m.w || y >= m.h ? T.PINE : m.tiles[y * m.w + x]!);

const ground = (g: G, t: number, x: number, y: number, n: number): void => {
  switch (t) {
    case T.PATH: r(g, 6, x, y, 16, 16); r(g, 5, x + (n & 7) + 2, y + ((n >> 3) & 7) + 3, 2, 1); r(g, 8, x + ((n >> 2) & 7) + 5, y + (n & 7) + 6, 1, 1); r(g, 5, x + ((n >> 5) & 7) + 1, y + 12, 1, 1); break;
    case T.ROAD: r(g, 3, x, y, 16, 16); r(g, 2, x + (n & 7) + 3, y + ((n >> 3) & 7) + 2, 3, 1); r(g, 4, x + ((n >> 4) & 7) + 6, y + (n & 7) + 7, 1, 1); break;
    case T.PAVE: r(g, 5, x, y, 16, 16); r(g, 4, x, y + 15, 16, 1); r(g, 4, x + 15, y, 1, 16); r(g, 4, x + 7, y, 1, 8); r(g, 6, x + 1, y + 1, 5, 1); break;
    case T.SAND: r(g, 6, x, y, 16, 16); r(g, 8, x + (n & 7) + 2, y + ((n >> 3) & 7) + 2, 2, 1); r(g, 5, x + ((n >> 2) & 7) + 6, y + ((n >> 5) & 7) + 7, 1, 1); break;
    case T.GRAVEL: r(g, 5, x, y, 16, 16); r(g, 4, x + (n & 7) + 1, y + ((n >> 3) & 7) + 1, 2, 2); r(g, 6, x + ((n >> 2) & 7) + 7, y + ((n >> 4) & 7) + 6, 2, 1); r(g, 3, x + ((n >> 5) & 7) + 4, y + 12, 1, 1); break;
    case T.YARD: r(g, 3, x, y, 16, 16); r(g, 2, x + (n & 7) + 4, y + ((n >> 3) & 7) + 5, 2, 1); if ((n & 31) === 3) { g.fillStyle = PAL[6]!; g.fillRect(x + 3, y + 3, 10, 1); g.fillRect(x + 3, y + 12, 10, 1); g.fillRect(x + 3, y + 3, 1, 10); g.fillRect(x + 12, y + 3, 1, 10); } break;
    default:
      r(g, 4, x, y, 16, 16);
      r(g, 3, x + (n & 7) + 1, y + ((n >> 3) & 7) + 2, 1, 2); r(g, 5, x + ((n >> 2) & 7) + 6, y + ((n >> 5) & 7) + 5, 1, 2); r(g, 3, x + ((n >> 4) & 7) + 7, y + 12, 2, 1);
      if (t === T.TALL) { for (let k = 0; k < 5; k++) { const bx = x + ((n >> k) & 3) + k * 3, by = y + 3 + ((n >> (k + 1)) & 7); r(g, 3, bx, by, 1, 5); r(g, 5, bx + 1, by + 1, 1, 3); } }
      if (t === T.FLOWER) { const c = [9, 12, 14, 7][n & 3]!; r(g, c, x + 4, y + 5, 2, 2); r(g, c, x + 10, y + 9, 2, 2); r(g, 8, x + 7, y + 12, 1, 1); r(g, 3, x + 5, y + 7, 1, 2); r(g, 3, x + 11, y + 11, 1, 2); }
  }
};
/** The ground a solid thing stands on: what lies beside it. */
const under = (m: TownMap, tx: number, ty: number): number => {
  for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1]] as const) { const t = at(m, tx + dx, ty + dy); if (GROUND.has(t)) return t === T.TALL || t === T.FLOWER ? T.GRASS : t; }
  return T.GRASS;
};
const water = (g: G, x: number, y: number, n: number, deep: boolean): void => {
  r(g, 13, x, y, 16, 16);
  if (deep) { g.fillStyle = PAL[1]!; g.globalAlpha = 0.45; g.fillRect(x, y, 16, 16); g.globalAlpha = 1; }
  r(g, deep ? 13 : 14, x + (n & 7) + 1, y + ((n >> 3) & 7) + 2, 4, 1); r(g, deep ? 13 : 14, x + ((n >> 2) & 7) + 6, y + ((n >> 5) & 7) + 8, 3, 1);
};

/** One tile into a chunk's ground layer. */
export const drawTile = (g: G, m: TownMap, tx: number, ty: number, x: number, y: number): void => {
  const t = at(m, tx, ty), n = m.noise[ty * m.w + tx] ?? 0;
  const up = at(m, tx, ty - 1), down = at(m, tx, ty + 1), left = at(m, tx - 1, ty), right = at(m, tx + 1, ty);
  switch (t) {
    case T.WATER: case T.DEEP: water(g, x, y, n, t === T.DEEP);
      if (up !== T.WATER && up !== T.DEEP && up !== T.REED && up !== T.STONE && up !== T.PLANK) { r(g, 3, x, y, 16, 2); r(g, 14, x, y + 2, 16, 1); } break;
    case T.REED: water(g, x, y, n, false); for (let k = 0; k < 4; k++) { const bx = x + 2 + k * 4 + ((n >> k) & 1); r(g, 4, bx, y + 3, 1, 11); r(g, 11, bx, y + 2 + (k & 1), 1, 3); } break;
    case T.STONE: water(g, x, y, n, false); r(g, 6, x + 3, y + 4, 10, 8); r(g, 8, x + 4, y + 4, 8, 2); r(g, 4, x + 3, y + 11, 10, 2); break;
    case T.TREE: case T.PINE: ground(g, under(m, tx, ty), x, y, n); r(g, 2, x + 3, y + 12, 10, 3); r(g, 11, x + 6, y + 6, 4, 8); r(g, 1, x + 6, y + 6, 1, 8); break;
    case T.BUSH: ground(g, T.GRASS, x, y, n); r(g, 2, x + 2, y + 6, 12, 9); r(g, 3, x + 1, y + 8, 14, 5); r(g, 3, x + 3, y + 4, 9, 4); r(g, 4, x + 4, y + 5, 3, 2); r(g, 4, x + 9, y + 8, 3, 2); if (n & 1) r(g, 12, x + 6, y + 9, 1, 1); break;
    case T.HEDGE: r(g, 2, x, y, 16, 16); r(g, 3, x, y, 16, 5); r(g, 4, x + (n & 7) + 2, y + 2, 2, 1); r(g, 4, x + ((n >> 3) & 7) + 6, y + 8, 2, 1); r(g, 1, x, y + 14, 16, 2); break;
    case T.FENCE: {
      ground(g, under(m, tx, ty), x, y, n);
      const h = left === T.FENCE || right === T.FENCE || left === T.GATE || right === T.GATE, v = up === T.FENCE || down === T.FENCE || up === T.GATE || down === T.GATE;
      if (h || !v) { r(g, 11, x, y + 6, 16, 2); r(g, 11, x, y + 10, 16, 1); r(g, 2, x + 2, y + 3, 2, 11); r(g, 2, x + 10, y + 3, 2, 11); r(g, 5, x + 2, y + 3, 2, 1); r(g, 5, x + 10, y + 3, 2, 1); }
      if (v) { r(g, 11, x + 7, y, 2, 16); r(g, 2, x + 6, y + 2, 4, 2); r(g, 2, x + 6, y + 10, 4, 2); }
      break;
    }
    case T.ROOF: case T.SHED: case T.CHURCH: {
      const c = t === T.ROOF ? 12 : t === T.SHED ? 11 : 2, d = t === T.ROOF ? 11 : t === T.SHED ? 2 : 1, hi = t === T.ROOF ? 7 : t === T.SHED ? 4 : 3;
      r(g, c, x, y, 16, 16); for (let j = 3; j < 16; j += 4) r(g, d, x, y + j, 16, 1);
      for (let j = 0; j < 4; j++) r(g, d, x + ((j & 1) ? 3 : 11), y + j * 4, 1, 3);
      if (up !== t) { r(g, hi, x, y, 16, 2); r(g, d, x, y + 2, 16, 1); }
      if (left !== t && left !== T.WALL && left !== T.WINDOW && left !== T.DOOR) r(g, d, x, y, 1, 16);
      if (right !== t && right !== T.WALL && right !== T.WINDOW && right !== T.DOOR) r(g, d, x + 15, y, 1, 16);
      if (down !== t) r(g, 1, x, y + 14, 16, 2);
      if (t === T.SHED && down !== t && up !== t) { r(g, 2, x + 5, y + 5, 6, 9); r(g, 5, x + 9, y + 9, 1, 1); }
      break;
    }
    case T.WALL: case T.WINDOW: case T.DOOR:
      r(g, 8, x, y, 16, 16); r(g, 6, x, y + 13, 16, 3); r(g, 9, x, y, 16, 1);
      if (left !== T.WALL && left !== T.WINDOW && left !== T.DOOR) r(g, 6, x, y, 1, 16);
      if (right !== T.WALL && right !== T.WINDOW && right !== T.DOOR) r(g, 6, x + 15, y, 1, 16);
      if (t === T.WINDOW) { r(g, 11, x + 3, y + 3, 10, 8); r(g, 13, x + 4, y + 4, 8, 6); r(g, 14, x + 4, y + 4, 3, 2); r(g, 11, x + 8, y + 4, 1, 6); r(g, 5, x + 2, y + 11, 12, 1); }
      if (t === T.DOOR) { r(g, 1, x + 3, y + 2, 10, 14); r(g, [12, 13, 11, 4][n & 3]!, x + 4, y + 3, 8, 13); r(g, 7, x + 10, y + 9, 1, 2); r(g, 1, x + 6, y + 5, 4, 3); }
      break;
    case T.SOIL: case T.CROP: r(g, 11, x, y, 16, 16); r(g, 2, x, y + 3, 16, 1); r(g, 2, x, y + 11, 16, 1); r(g, 4, x + (n & 7), y + 7, 3, 1);
      if (t === T.CROP) for (let k = 0; k < 3; k++) { const bx = x + 2 + k * 5; r(g, 4, bx, y + 2, 1, 8); r(g, 14, bx - 1, y + 3 + (k & 1), 3, 2); r(g, 5, bx, y + 7, 2, 1); } break;
    case T.RAIL: r(g, 5, x, y, 16, 16); r(g, 4, x + (n & 7), y + ((n >> 3) & 7) + 4, 2, 1); r(g, 11, x + 2, y, 3, 16); r(g, 11, x + 10, y, 3, 16);
      if ((ty & 1) === 1) { r(g, 1, x, y + 3, 16, 2); r(g, 6, x, y + 3, 16, 1); r(g, 1, x, y + 11, 16, 2); r(g, 6, x, y + 11, 16, 1); } break;
    case T.BALLAST: r(g, 3, x, y, 16, 16); r(g, 4, x, y + (up === T.RAIL ? 0 : 10), 16, 6); r(g, 2, x + (n & 7) + 3, y + 5, 2, 1); r(g, 5, x + ((n >> 3) & 7) + 4, y + (up === T.RAIL ? 2 : 12), 2, 1); break;
    case T.CROSSING: r(g, 3, x, y, 16, 16); r(g, 6, x, y + 3, 16, 1); r(g, 6, x, y + 11, 16, 1); r(g, 5, x + 6, y, 1, 16); break;
    case T.PLANK: r(g, 11, x, y, 16, 16); for (let j = 0; j < 16; j += 4) { r(g, 2, x, y + j + 3, 16, 1); r(g, 5, x, y + j, 16, 1); } r(g, 2, x, y, 1, 16); r(g, 2, x + 15, y, 1, 16); break;
    case T.ROCK: ground(g, under(m, tx, ty), x, y, n); r(g, 2, x + 2, y + 11, 13, 3); r(g, 5, x + 2, y + 5, 11, 8); r(g, 6, x + 4, y + 3, 7, 4); r(g, 8, x + 5, y + 4, 3, 1); r(g, 3, x + 9, y + 9, 4, 3); break;
    case T.GRAVE: ground(g, T.GRASS, x, y, n); r(g, 2, x + 3, y + 13, 11, 2); if (n & 1) { r(g, 5, x + 4, y + 3, 8, 11); r(g, 6, x + 5, y + 2, 6, 2); r(g, 3, x + 6, y + 6, 4, 1); r(g, 3, x + 6, y + 8, 3, 1); } else { r(g, 6, x + 6, y + 2, 4, 12); r(g, 6, x + 3, y + 5, 10, 3); r(g, 5, x + 9, y + 2, 1, 12); } break;
    case T.LAMP: ground(g, under(m, tx, ty), x, y, n); r(g, 2, x + 5, y + 13, 6, 2); r(g, 1, x + 7, y, 2, 14); r(g, 3, x + 6, y + 11, 4, 3); break;
    case T.BENCH: ground(g, under(m, tx, ty), x, y, n); r(g, 2, x + 1, y + 12, 14, 2); r(g, 11, x + 1, y + 5, 14, 3); r(g, 5, x + 1, y + 5, 14, 1); r(g, 11, x + 1, y + 9, 14, 2); r(g, 1, x + 2, y + 8, 1, 6); r(g, 1, x + 13, y + 8, 1, 6); break;
    case T.SIGN: ground(g, under(m, tx, ty), x, y, n); r(g, 11, x + 7, y + 8, 2, 7); r(g, 1, x + 2, y + 2, 12, 8); r(g, 8, x + 3, y + 3, 10, 6); r(g, 3, x + 4, y + 4, 7, 1); r(g, 3, x + 4, y + 6, 5, 1); break;
    case T.STOP: ground(g, under(m, tx, ty), x, y, n); r(g, 1, x + 7, y + 4, 2, 11); r(g, 12, x + 4, y, 8, 7); r(g, 9, x + 6, y + 2, 4, 3); r(g, 2, x + 5, y + 14, 6, 1); break;
    case T.GATE: ground(g, under(m, tx, ty), x, y, n); break;
    case T.CLIFF: r(g, 3, x, y, 16, 16); r(g, 5, x, y, 16, 3); r(g, 6, x + (n & 7), y, 5, 1); r(g, 2, x + 3, y + 5, 1, 9); r(g, 2, x + 10, y + 7, 1, 8); r(g, 1, x, y + 14, 16, 2); break;
    case T.MAST: r(g, 5, x, y, 16, 16); r(g, 1, x + 1, y, 2, 16); r(g, 1, x + 13, y, 2, 16); r(g, 12, x + 1, y + (n & 7) + 4, 14, 1); r(g, 1, x + 3, y + 2, 10, 1); r(g, 1, x + 7, y, 2, 16); break;
    case T.TUNNEL: r(g, 15, x, y, 16, 16); r(g, 0, x + 3, y, 10, 16); r(g, 1, x + 7, y + (n & 7) + 2, 2, 1); break;
    case T.PIT: r(g, 15, x, y, 16, 16); if ((n & 15) === 1) r(g, 7, x + 6, y + 7, 1, 1); if ((n & 15) === 2) r(g, 10, x + 10, y + 4, 1, 1); break;
    case T.STUMP: ground(g, T.GRASS, x, y, n); r(g, 2, x + 3, y + 11, 11, 3); r(g, 11, x + 4, y + 5, 8, 8); r(g, 6, x + 4, y + 4, 8, 4); r(g, 5, x + 6, y + 5, 4, 2); break;
    default: ground(g, t, x, y, n);
  }
};

/** What stands above a tile and hides whoever walks behind it: canopies, lamp heads, the mast. Drawn into the over layer. */
export const drawOver = (g: G, m: TownMap, tx: number, ty: number, x: number, y: number): void => {
  const t = at(m, tx, ty), n = m.noise[ty * m.w + tx] ?? 0;
  if (t === T.TREE) {
    const o = (n & 3) - 1;
    r(g, 1, x - 3 + o, y - 9, 22, 17); r(g, 2, x - 4 + o, y - 6, 24, 11); r(g, 2, x - 1 + o, y - 12, 18, 5);
    r(g, 3, x - 2 + o, y - 10, 18, 12); r(g, 3, x + 1 + o, y - 13, 12, 4);
    r(g, 4, x + o, y - 9, 6, 3); r(g, 4, x + 7 + o, y - 11, 5, 2); r(g, 4, x + 9 + o, y - 5, 5, 2); r(g, 5, x + 1 + o, y - 8, 3, 1); r(g, 2, x + 3 + o, y - 2, 5, 2); r(g, 2, x + 12 + o, y - 8, 3, 2);
  } else if (t === T.PINE) {
    for (let k = 0; k < 4; k++) { const w = 6 + k * 4; r(g, 1, x + 8 - w / 2 - 1, y - 14 + k * 5, w + 2, 6); r(g, 2, x + 8 - w / 2, y - 14 + k * 5, w, 5); r(g, 3, x + 8 - w / 2 + 1, y - 14 + k * 5, 2 + k, 2); }
    r(g, 13, x + 7, y - 15, 2, 2);
  } else if (t === T.LAMP) {
    r(g, 1, x + 7, y - 12, 2, 12); r(g, 1, x + 4, y - 14, 8, 2); r(g, 8, x + 5, y - 12, 6, 4); r(g, 9, x + 6, y - 11, 4, 2); r(g, 1, x + 4, y - 8, 8, 1);
  } else if (t === T.MAST && at(m, tx, ty - 1) !== T.MAST) {
    for (let j = 0; j < 72; j += 8) { const w = 14 + j / 6; r(g, 1, x + 8 - w / 2, y - 80 + j, 2, 8); r(g, 1, x + 6 + w / 2, y - 80 + j, 2, 8); r(g, j % 16 ? 1 : 12, x + 8 - w / 2, y - 80 + j, w, 1); }
    r(g, 12, x + 7, y - 86, 2, 6); r(g, 6, x + 1, y - 60, 7, 5); r(g, 8, x + 2, y - 59, 4, 2);
  } else if (t === T.CHURCH && at(m, tx, ty - 1) !== T.CHURCH && at(m, tx - 1, ty) === T.CHURCH && at(m, tx + 1, ty) === T.CHURCH && (tx & 3) === 2) {
    r(g, 1, x + 1, y - 22, 14, 24); r(g, 3, x + 2, y - 20, 12, 22); r(g, 2, x + 4, y - 28, 8, 8); r(g, 8, x + 6, y - 14, 4, 4); r(g, 1, x + 8, y - 13, 1, 2); r(g, 7, x + 7, y - 33, 2, 6); r(g, 7, x + 5, y - 31, 6, 1);
  } else if (t === T.ROOF && at(m, tx, ty - 1) !== T.ROOF && (m.noise[ty * m.w + tx]! & 7) === 0) {
    r(g, 11, x + 5, y - 6, 6, 8); r(g, 1, x + 4, y - 7, 8, 2); r(g, 2, x + 5, y - 2, 6, 1);
  }
};

/** Colour of a tile on the map sheet. */
export const MAP_COL = new Uint8Array(64).fill(4);
for (const [t, c] of [[T.PATH, 6], [T.ROAD, 2], [T.PAVE, 5], [T.WATER, 13], [T.DEEP, 13], [T.SAND, 8], [T.TREE, 3], [T.PINE, 2], [T.BUSH, 3], [T.FENCE, 11], [T.WALL, 12], [T.ROOF, 12], [T.DOOR, 12], [T.WINDOW, 12], [T.SOIL, 11], [T.CROP, 11], [T.RAIL, 1], [T.BALLAST, 1], [T.PLANK, 6], [T.ROCK, 5], [T.GRAVEL, 5], [T.GRAVE, 6], [T.YARD, 3], [T.CLIFF, 3], [T.REED, 13], [T.STONE, 6], [T.MAST, 12], [T.SHED, 11], [T.TUNNEL, 0], [T.HEDGE, 2], [T.CROSSING, 2], [T.PIT, 0], [T.CHURCH, 1], [T.TALL, 4]] as const) MAP_COL[t] = c;

/* ---- Characters: 8 cells (down, up, left, right x 2 frames), each 16x24, feet on the bottom row. ---- */
export const CELL_W = 16, CELL_H = 24;
const cache = new Map<string, HTMLCanvasElement>();
const person = (g: G, ox: number, L: Look, dir: number, f: number, kid: boolean): void => {
  const skin = L.skin ?? 8, tall = L.tall && !kid, top = tall ? 5 : 8, body = tall ? 9 : 7;
  g.fillStyle = PAL[0]!; g.globalAlpha = 0.35; g.fillRect(ox + 3, 21, 10, 3); g.globalAlpha = 1;
  const ly = top + 7 + body - 1, ll = 24 - ly - 1;
  r(g, L.legs, ox + 5, ly, 2, ll - (f ? 1 : 0)); r(g, L.legs, ox + 9, ly, 2, ll - (f ? 0 : 1)); r(g, 1, ox + 5, ly + ll - (f ? 1 : 0) - 1, 2, 1); r(g, 1, ox + 9, ly + ll - (f ? 0 : 1) - 1, 2, 1);
  r(g, 1, ox + 3, top + 6, 10, body); r(g, L.top, ox + 4, top + 7, 8, body - 2);
  if (dir >= 2) { r(g, L.top, ox + (dir === 2 ? 5 : 9), top + 8 + f, 2, body - 4); r(g, skin, ox + (dir === 2 ? 5 : 9), top + 4 + body + f, 2, 1); }
  else { r(g, L.top, ox + 3, top + 7 + f, 1, body - 4); r(g, L.top, ox + 12, top + 8 - f, 1, body - 4); r(g, skin, ox + 3, top + 3 + body + f, 1, 1); r(g, skin, ox + 12, top + 4 + body - f, 1, 1); }
  r(g, 1, ox + 3, top - 1, 10, 8); r(g, skin, ox + 4, top, 8, 6);
  if (dir === 1) r(g, L.hair, ox + 4, top, 8, 5);
  else { r(g, L.hair, ox + 4, top, 8, 2); if (dir === 0) { r(g, L.hair, ox + 4, top + 2, 1, 2); r(g, L.hair, ox + 11, top + 2, 1, 2); r(g, 0, ox + 6, top + 3, 1, 2); r(g, 0, ox + 9, top + 3, 1, 2); } else { r(g, L.hair, ox + (dir === 2 ? 8 : 4), top + 2, 4, 3); r(g, 0, ox + (dir === 2 ? 5 : 10), top + 3, 1, 2); } }
  if (L.hat !== undefined) { r(g, 1, ox + 2, top - 1, 12, 2); r(g, L.hat, ox + 3, top - 3, 10, 3); r(g, L.hat, ox + 2, top, 12, 1); }
};
const beast = (g: G, ox: number, L: Look, dir: number, f: number): void => {
  const dog = L.kind === 'dog', c = L.hair, w = dog ? 12 : 9, y = dog ? 13 : 16, flip = dir === 2;
  g.fillStyle = PAL[0]!; g.globalAlpha = 0.35; g.fillRect(ox + 2, 21, 12, 3); g.globalAlpha = 1;
  const bx = ox + (16 - w) / 2;
  r(g, 1, bx - 1, y - 1, w + 2, (dog ? 7 : 5) + 2); r(g, c, bx, y, w, dog ? 7 : 5);
  r(g, c, bx + 1, y + (dog ? 7 : 5), 2, 3 - f); r(g, c, bx + w - 3, y + (dog ? 7 : 5), 2, 2 + f);
  const hx = flip ? bx - 2 : bx + w - 4;
  r(g, 1, hx - 1, y - 5, 8, 7); r(g, c, hx, y - 4, 6, 5); r(g, c, hx, y - 6, 2, 2); r(g, c, hx + 4, y - 6, 2, 2);
  r(g, dog ? 0 : 7, hx + (flip ? 1 : 3), y - 2, 1, 1); r(g, dog ? 0 : 7, hx + (flip ? 3 : 5) - 1, y - 2, 1, 1);
  r(g, c, flip ? bx + w : bx - 2, y - (dog ? 0 : 3) + f, 2, dog ? 2 : 5);
};
const shade = (g: G, ox: number, f: number): void => {
  g.fillStyle = PAL[15]!; g.globalAlpha = 0.85;
  g.fillRect(ox + 6, 0, 4, 4); g.fillRect(ox + 5, 4, 6, 14); g.fillRect(ox + 4, 8, 1, 10 + f); g.fillRect(ox + 11, 8, 1, 11 - f); g.fillRect(ox + 6, 18, 1, 6); g.fillRect(ox + 9, 18, 1, 6 - f);
  g.globalAlpha = 1; r(g, 9, ox + 7, 1, 1, 1); r(g, 9, ox + 9, 1, 1, 1);
};
export const sheet = (L: Look, kid = false): HTMLCanvasElement => {
  const key = `${L.kind ?? 'p'}:${L.hair}:${L.top}:${L.legs}:${L.skin ?? 8}:${L.hat ?? -1}:${L.tall ? 1 : 0}:${kid ? 1 : 0}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = CELL_W * 8; c.height = CELL_H;
  const g = c.getContext('2d')!;
  for (let d = 0; d < 4; d++) for (let f = 0; f < 2; f++) {
    const ox = (d * 2 + f) * CELL_W;
    if (L.kind === 'dog' || L.kind === 'cat') beast(g, ox, L, d, f); else if (L.kind === 'shade') shade(g, ox, f); else person(g, ox, L, d, f, kid);
  }
  cache.set(key, c);
  return c;
};
export const KID_LOOK: Look = { hair: 11, top: 10, legs: 1 };

/** A soft round light, for lamps and Mote. */
export const glow = (size: number, colour: string): HTMLCanvasElement => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, colour); gr.addColorStop(0.35, colour + 'aa'); gr.addColorStop(1, colour + '00');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
};
