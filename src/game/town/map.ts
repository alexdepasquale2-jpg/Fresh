// The neighbourhood, built once from a fixed seed. 160x160 tiles, twelve districts.
// Everything here is a pure function of SEED and the registered PLACES and GATES.
import { rng, makeSeed, child, type Rng } from '@/core/hash';
import { T, MAP_W as W, MAP_H as H, type Builder, type District, type PlaceDef, type GateDef } from './types';

export const SEED = makeSeed(0x5a110, 0x70c0de);

/** Districts by rectangle [x, y, w, h]; the first that holds a tile names it. */
export const DISTRICTS: District[] = [
  { id: 'rail', name: 'The Down Line', rect: [0, 78, 160, 9], says: 'Two rails and a hum in them.' },
  { id: 'hill', name: 'Mast Hill', rect: [0, 0, 50, 40], says: 'The mast ticks as it cools.' },
  { id: 'woods', name: 'Hollin Wood', rect: [50, 0, 60, 40], says: 'The trees stand closer than they did.' },
  { id: 'quarry', name: 'The Old Workings', rect: [110, 0, 50, 40], says: 'Nobody has cut stone here in sixty years.' },
  { id: 'church', name: 'St Orrin\'s Yard', rect: [0, 40, 40, 38], says: 'The stones lean toward each other.' },
  { id: 'row', name: 'Sallow Row', rect: [40, 40, 68, 38], says: 'Your street. Every curtain is a little open.' },
  { id: 'school', name: 'Hollin Primary', rect: [108, 40, 52, 38], says: 'The yard keeps the shape of every game.' },
  { id: 'lots', name: 'The Allotments', rect: [0, 87, 45, 39], says: 'Bean rows, sheds, a bath full of rain.' },
  { id: 'park', name: 'Penny Rec', rect: [45, 87, 59, 39], says: 'The pond is flat as a coin.' },
  { id: 'parade', name: 'The Parade', rect: [104, 87, 56, 39], says: 'Five shops and a bell over each door.' },
  { id: 'cut', name: 'The Cut', rect: [0, 126, 50, 34], says: 'The creek goes slow here, and green.' },
  { id: 'shore', name: 'Lowmere Edge', rect: [50, 126, 110, 34], says: 'The water was a valley once.' },
];

/** Gates: tiles that block until their condition holds. Add more with GATES.push(...). */
export const GATES: GateDef[] = [
  { id: 'mast', at: [25, 19], open: { has: 'mast-key' }, shut: 'A steel gate with a new padlock. The mast hums behind it.' },
  { id: 'quarry', at: [134, 39], w: 2, open: { flag: 'quarry-open' }, shut: 'Chained. DANGER DEEP WATER. The chain is older than the sign.' },
  { id: 'lots', at: [43, 100], open: { any: [{ phase: ['dawn', 'day'] }, { has: 'lots-key' }] }, shut: 'The allotment gate is locked for the night.' },
  { id: 'dog', at: [49, 129], h: 2, look: 'dog', open: { flag: 'dog-friend' }, shut: 'A big grey dog lies across the lane. It does not growl. It does not move either.' },
  { id: 'culvert', at: [46, 86], w: 2, look: 'dark', open: { has: 'torch' }, shut: 'The culvert goes under the line. You cannot see your own hand in there.' },
  { id: 'crossing', at: [104, 80], w: 3, look: 'bar', open: { phase: ['dawn', 'day', 'dusk'] }, shut: 'The barrier is down. Nothing comes. It stays down all night.' },
  { id: 'crossing2', at: [104, 85], w: 3, look: 'bar', open: { phase: ['dawn', 'day', 'dusk'] }, shut: 'The barrier is down. Nothing comes. It stays down all night.' },
  { id: 'church', at: [39, 59], open: { any: [{ phase: ['dawn', 'day', 'dusk'] }, { quest: ['m1', 'active'] }, { has: 'torch' }] }, shut: 'The lychgate is shut after dark. Something in you is glad of it.' },
];

/** Named places. Add more with PLACES.push(...); `build` may draw tiles. */
export const PLACES: PlaceDef[] = [
  { id: 'home', name: 'Your front door', at: [62, 56] },
  { id: 'stop-row', name: 'Sallow Row stop', at: [67, 61], stop: true },
  { id: 'stop-church', name: 'St Orrin\'s stop', at: [43, 61], stop: true },
  { id: 'stop-school', name: 'School stop', at: [109, 61], stop: true },
  { id: 'stop-parade', name: 'Parade stop', at: [126, 103], stop: true },
  { id: 'stop-mere', name: 'Lowmere terminus', at: [140, 131], stop: true },
  { id: 'pond', name: 'Penny Pond', at: [76, 113], skim: true },
  { id: 'pier', name: 'The Long Pier', at: [90, 150], skim: true },
  { id: 'bridge', name: 'The footbridge', at: [72, 82] },
  { id: 'mast', name: 'The mast', at: [25, 13] },
  { id: 'pit', name: 'The pit', at: [134, 22], hidden: true },
  { id: 'gap', name: 'The gap in the fence', at: [111, 23], hidden: true },
  { id: 'yew', name: 'The yew', at: [12, 50] },
  { id: 'culvert', name: 'Under the line', at: [46, 83], hidden: true },
  { id: 'back', name: 'Behind the shops', at: [155, 94], hidden: true },
  { id: 'pump', name: 'The pump house', at: [14, 140], hidden: true },
  { id: 'halt', name: 'Hollin Halt', at: [127, 78] },
  { id: 'spring', name: 'The spring', at: [43, 33], hidden: true },
  { id: 'bench-park', name: 'A bench', at: [70, 100], bench: true },
  { id: 'bench-pier', name: 'A bench', at: [84, 135], bench: true },
  { id: 'bench-yew', name: 'A bench', at: [14, 52], bench: true },
  { id: 'bench-hill', name: 'A bench', at: [30, 24], bench: true },
  { id: 'bench-row', name: 'A bench', at: [80, 61], bench: true },
  { id: 'sign-row', name: 'Sign', at: [100, 57], sign: 'SALLOW ROW. Hollin Wood north. The Parade and Lowmere south, over the line.' },
  { id: 'sign-wood', name: 'Sign', at: [74, 38], sign: 'HOLLIN WOOD. Keep to the path. The path does not keep to itself.' },
  { id: 'sign-quarry', name: 'Sign', at: [132, 41], sign: 'OLD WORKINGS. NO ENTRY. Below, in pencil: "it isn\'t deep. it\'s far."' },
  { id: 'sign-park', name: 'Sign', at: [74, 89], sign: 'PENNY REC. No ball games after dusk. No feeding what comes to the pond.' },
  { id: 'sign-mere', name: 'Sign', at: [88, 135], sign: 'LOWMERE RESERVOIR. Flooded 1931. Eleven houses, one chapel. On still days, look down.' },
  { id: 'sign-mast', name: 'Sign', at: [27, 20], sign: 'RELAY STATION 4. The licence plate has been unscrewed. Someone has scratched a small square where it was.' },
  { id: 'sign-lots', name: 'Sign', at: [41, 102], sign: 'ALLOTMENT SOCIETY. Gate locked at dusk. Plot 9 is not let and is not to be dug.' },
  { id: 'sign-halt', name: 'Sign', at: [121, 78], sign: 'HOLLIN HALT. Timetable: a blank sheet behind glass, very clean.' },
  { id: 'sign-cut', name: 'Sign', at: [40, 131], sign: 'THE CUT. Stepping stones. Count them going over. Count them coming back.' },
  { id: 'sign-school', name: 'Sign', at: [112, 57], sign: 'HOLLIN PRIMARY. "Lost: one lunch box, plain, heavy." The notice is years old. Someone renews the pin.' },
];

export interface TownMap {
  readonly w: number; readonly h: number;
  readonly tiles: Uint8Array;
  /** District index per tile. */
  readonly district: Uint8Array;
  /** Gate index + 1 per tile, 0 for none. */
  readonly gate: Uint8Array;
  /** 1 where the kid can stand (gates counted open). */
  readonly reach: Uint8Array;
  /** Per-tile variation byte, for drawing. */
  readonly noise: Uint8Array;
  readonly lamps: readonly (readonly [number, number])[];
  readonly doors: readonly { x: number; y: number; label: string }[];
}

const SOLID = new Uint8Array(64);
for (const t of [T.WATER, T.DEEP, T.TREE, T.BUSH, T.FENCE, T.WALL, T.ROOF, T.DOOR, T.RAIL, T.BALLAST, T.ROCK, T.GRAVE, T.LAMP, T.BENCH, T.SIGN, T.STOP, T.WINDOW, T.CLIFF, T.MAST, T.SHED, T.HEDGE, T.PIT, T.PINE, T.STUMP, T.CHURCH]) SOLID[t] = 1;
export const solidTile = (t: number): boolean => SOLID[t] === 1;

let built: TownMap | null = null;
export const townMap = (): TownMap => built ?? (built = build());

const build = (): TownMap => {
  const tiles = new Uint8Array(W * H), district = new Uint8Array(W * H), gate = new Uint8Array(W * H), noise = new Uint8Array(W * H);
  const lamps: [number, number][] = [];
  const doors: { x: number; y: number; label: string }[] = [];
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const set = (x: number, y: number, t: number) => { if (inb(x, y)) tiles[y * W + x] = t; };
  const get = (x: number, y: number) => (inb(x, y) ? tiles[y * W + x]! : T.TREE);
  const rect = (x: number, y: number, w: number, h: number, t: number) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, t); };
  const ring = (x: number, y: number, w: number, h: number, t: number) => { for (let i = x; i < x + w; i++) { set(i, y, t); set(i, y + h - 1, t); } for (let j = y; j < y + h; j++) { set(x, j, t); set(x + w - 1, j, t); } };
  const house = (x: number, y: number, w: number, h: number, door: number, kind: number = T.ROOF) => {
    rect(x, y, w, h - 1, kind);
    for (let i = 0; i < w; i++) set(x + i, y + h - 1, i === door ? T.DOOR : (i % 2 === 1 && i !== door ? T.WINDOW : T.WALL));
    if (get(x + door, y + h) !== T.PAVE && get(x + door, y + h) !== T.ROAD) set(x + door, y + h, T.PATH);
  };
  const B: Builder = { set, get, rect, house, ring };
  const lamp = (x: number, y: number) => { set(x, y, T.LAMP); lamps.push([x, y]); };
  const scatter = (r: Rng, x: number, y: number, w: number, h: number, t: number, per1000: number, on: number = T.GRASS) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (get(i, j) === on && r.int(1000) < per1000) set(i, j, t);
  };
  const path = (pts: readonly (readonly [number, number])[], t: number = T.PATH, wide = 1) => {
    for (let k = 0; k + 1 < pts.length; k++) {
      let [x, y] = pts[k]!; const [bx, by] = pts[k + 1]!;
      for (;;) {
        rect(x, y, wide, wide, t);
        if (x === bx && y === by) break;
        if (x !== bx) x += Math.sign(bx - x); else y += Math.sign(by - y);
      }
    }
  };
  const R = (label: string) => rng(child(SEED, label));

  // Per-tile noise and districts.
  const nr = R('noise');
  for (let i = 0; i < W * H; i++) noise[i] = nr.int(256);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let d = 5;
    for (let k = 0; k < DISTRICTS.length; k++) { const q = DISTRICTS[k]!.rect; if (x >= q[0] && y >= q[1] && x < q[0] + q[2] && y < q[1] + q[3]) { d = k; break; } }
    district[y * W + x] = d;
  }
  // Edge of the world: a wall of pines.
  ring(0, 0, W, H, T.PINE); ring(1, 1, W - 2, H - 2, T.PINE);

  /* ---- Ground cover by district ---- */
  scatter(R('g1'), 2, 2, W - 4, H - 4, T.TALL, 90);
  scatter(R('g2'), 2, 2, W - 4, H - 4, T.FLOWER, 14);
  // Hollin Wood: thick.
  { const r = R('woods'); for (let y = 2; y < 40; y++) for (let x = 50; x < 110; x++) { const k = r.int(100); set(x, y, k < 46 ? (k % 3 === 0 ? T.PINE : T.TREE) : k < 54 ? T.BUSH : k < 60 ? T.TALL : k < 62 ? T.STUMP : T.GRASS); } }
  // Mast Hill: open, a few rocks and pines, a ring of cliff round the top.
  { const r = R('hill'); scatter(r, 2, 2, 48, 38, T.PINE, 60); scatter(r, 2, 2, 48, 38, T.ROCK, 25); scatter(r, 2, 2, 48, 38, T.TALL, 160);
    for (let x = 12; x < 40; x++) { if (x !== 25 && x !== 26) set(x, 24, T.CLIFF); set(x, 5, T.CLIFF); } for (let y = 5; y < 25; y++) { set(12, y, T.CLIFF); set(39, y, T.CLIFF); }
    rect(13, 6, 26, 18, T.GRASS); scatter(r, 13, 6, 26, 18, T.TALL, 200);
    ring(20, 8, 12, 12, T.FENCE); rect(21, 9, 10, 10, T.GRAVEL); rect(25, 11, 2, 3, T.MAST); house(28, 15, 3, 3, 1, T.SHED);
    set(25, 19, T.GATE); set(26, 19, T.FENCE); }
  // The Old Workings.
  { const r = R('quarry'); rect(112, 2, 46, 37, T.GRAVEL); scatter(r, 112, 2, 46, 37, T.ROCK, 70, T.GRAVEL); scatter(r, 112, 2, 46, 37, T.TALL, 40, T.GRAVEL);
    ring(111, 2, 47, 38, T.FENCE);
    for (let y = 12; y < 28; y++) for (let x = 124; x < 146; x++) { const dx = (x - 134.5) / 11, dy = (y - 19.5) / 8, q = dx * dx + dy * dy; if (q < 1) set(x, y, q < 0.34 ? T.PIT : T.CLIFF); }
    rect(132, 27, 5, 2, T.GRAVEL); rect(133, 24, 3, 3, T.GRAVEL); rect(133, 21, 3, 3, T.GRAVEL);
    house(116, 30, 5, 4, 2, T.SHED); rect(134, 29, 2, 10, T.GRAVEL);
    set(134, 39, T.GATE); set(135, 39, T.GATE);
    set(111, 23, T.GRAVEL); set(112, 23, T.GRAVEL); set(113, 23, T.GRAVEL); set(110, 24, T.BUSH); set(110, 23, T.TALL); set(110, 22, T.BUSH); set(109, 23, T.GRASS); }
  // St Orrin's Yard.
  { const r = R('church'); ring(2, 42, 38, 36, T.HEDGE); rect(3, 43, 36, 34, T.GRASS); scatter(r, 3, 43, 36, 34, T.TALL, 220);
    for (let y = 46; y < 75; y += 3) for (let x = 5; x < 37; x += 2) if (r.int(100) < 46 && !(y > 55 && y < 63)) set(x, y, T.GRAVE);
    rect(18, 44, 10, 9, T.CHURCH); for (let i = 0; i < 10; i++) set(18 + i, 53, i === 4 || i === 5 ? T.DOOR : i % 2 ? T.WINDOW : T.WALL);
    rect(22, 54, 2, 5, T.PATH); set(12, 49, T.TREE); set(11, 49, T.TREE); set(12, 48, T.TREE); set(30, 70, T.TREE); set(6, 72, T.TREE);
    path([[3, 59], [39, 59]]); path([[22, 59], [22, 74]]); path([[8, 59], [8, 46]]); set(39, 59, T.GATE);
    lamp(24, 60); lamp(36, 58); }
  /* ---- Sallow Row ---- */
  { const r = R('row'); rect(40, 58, 68, 3, T.ROAD); rect(40, 57, 68, 1, T.PAVE); rect(40, 61, 68, 1, T.PAVE);
    const names = ['No. 2', 'No. 4', 'Your house', 'No. 8', 'No. 10', 'No. 12', 'No. 14'];
    [44, 52, 60, 76, 84, 92].forEach((x, i) => { house(x, 50, 6, 6, 2); rect(x, 56, 6, 1, T.GRASS); set(x + 2, 56, T.PATH); if (i !== 2) set(x + 4, 56, r.int(2) ? T.FLOWER : T.BUSH); set(x - 1, 55, T.HEDGE); set(x - 1, 56, T.HEDGE); doors.push({ x: x + 2, y: 55, label: names[i >= 3 ? i + 1 : i]! }); });
    house(66, 51, 5, 5, 2); rect(66, 56, 5, 1, T.GRASS); set(68, 56, T.PATH); doors.push({ x: 68, y: 55, label: 'No. 8' });
    [44, 52, 60, 68, 76, 84, 92].forEach((x, i) => { house(x, 63, 6, 6, 3); doors.push({ x: x + 3, y: 68, label: `No. ${2 * i + 1}` }); set(x + 6, 64, T.HEDGE); set(x + 6, 66, r.int(2) ? T.BUSH : T.HEDGE); });
    rect(43, 70, 59, 1, T.PATH); path([[43, 70], [43, 62]]); rect(74, 62, 2, 8, T.PATH); path([[101, 70], [101, 62]]);
    rect(42, 72, 58, 5, T.GRASS); scatter(r, 42, 72, 58, 5, T.TREE, 80); scatter(r, 42, 72, 58, 5, T.BUSH, 60);
    rect(41, 42, 66, 7, T.GRASS); scatter(r, 41, 42, 66, 7, T.TREE, 150); scatter(r, 41, 42, 66, 7, T.BUSH, 80);
    for (let x = 46; x < 106; x += 9) { lamp(x, 57); if (x + 4 < 106) lamp(x + 4, 61); } }
  // Lanes north: to the wood, to the hill, to the quarry.
  path([[72, 57], [72, 40], [72, 30], [64, 30], [64, 22], [52, 22], [50, 22], [44, 22], [40, 22]], T.PATH, 2);
  path([[40, 22], [40, 26], [25, 26], [25, 20]]); rect(25, 24, 2, 1, T.PATH); path([[25, 20], [25, 19]]); set(25, 19, T.GATE);
  path([[73, 30], [86, 30], [86, 18], [98, 18], [98, 24], [109, 24]]);
  path([[86, 18], [86, 8], [60, 8], [60, 14]]); rect(58, 13, 5, 4, T.GRASS); set(60, 14, T.STUMP);
  rect(104, 40, 3, 18, T.ROAD); path([[107, 40], [134, 40]], T.PATH, 1); rect(107, 40, 28, 1, T.PATH); rect(107, 41, 29, 1, T.PATH);
  path([[105, 40], [105, 36], [100, 36], [100, 30], [98, 30], [98, 24]]);
  // Spring and creek: down from the hill, under the line, through the Cut.
  { const cx = (y: number) => 41 + ((y >> 3) & 1);
    for (let y = 34; y < 78; y++) { set(cx(y), y, T.WATER); if (y % 5 === 0) set(cx(y) + 1, y, T.REED); }
    rect(40, 32, 3, 2, T.WATER); set(39, 32, T.ROCK); set(43, 32, T.ROCK);
    rect(41, 57, 2, 5, T.PLANK); }
  /* ---- Hollin Primary ---- */
  { const r = R('school'); rect(110, 43, 48, 35, T.GRASS); ring(110, 43, 48, 35, T.FENCE);
    rect(118, 45, 24, 8, T.ROOF); for (let i = 0; i < 24; i++) set(118 + i, 53, i === 11 || i === 12 ? T.DOOR : i % 3 === 1 ? T.WINDOW : T.WALL);
    doors.push({ x: 129, y: 53, label: 'Hollin Primary' });
    rect(113, 54, 42, 20, T.YARD); house(146, 46, 6, 5, 2, T.SHED);
    scatter(r, 111, 44, 46, 33, T.TREE, 30); rect(110, 58, 1, 3, T.YARD); rect(107, 58, 3, 3, T.ROAD);
    set(150, 60, T.BENCH); set(118, 70, T.BENCH); lamp(112, 62); lamp(152, 72); }
  /* ---- The Down Line ---- */
  { rect(0, 80, W, 1, T.BALLAST); rect(0, 85, W, 1, T.BALLAST); rect(0, 81, W, 4, T.RAIL);
    rect(72, 79, 2, 8, T.PLANK); rect(104, 80, 3, 6, T.CROSSING); for (let i = 0; i < 3; i++) { set(104 + i, 80, T.GATE); set(104 + i, 85, T.GATE); }
    rect(46, 80, 2, 6, T.TUNNEL); set(46, 86, T.GATE); set(47, 86, T.GATE);
    rect(42, 77, 4, 1, T.WATER); set(45, 78, T.WATER); set(45, 79, T.WATER); rect(46, 76, 2, 4, T.PATH); path([[72, 70], [72, 79]], T.PATH, 2);
    rect(47, 71, 1, 5, T.PATH);
    rect(118, 78, 18, 2, T.PAVE); house(137, 75, 4, 4, 1, T.SHED); doors.push({ x: 138, y: 78, label: 'Signal box' }); lamp(119, 78); lamp(134, 78);
    path([[107, 79], [118, 79]]); rect(104, 61, 3, 19, T.ROAD); rect(104, 86, 3, 46, T.ROAD); }
  /* ---- The Allotments ---- */
  { const r = R('lots'); ring(2, 88, 42, 37, T.HEDGE); rect(3, 89, 40, 35, T.GRASS);
    for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) { const x = 5 + px * 9, y = 91 + py * 8;
      if (px === 2 && py === 2) { rect(x, y, 7, 5, T.TALL); continue; }
      for (let j = 0; j < 5; j++) for (let i = 0; i < 7; i++) set(x + i, y + j, j % 2 === 0 ? (r.int(100) < 62 ? T.CROP : T.SOIL) : T.SOIL);
      if (r.int(3) > 0) { set(x + 6, y, T.SHED); } }
    path([[3, 100], [43, 100]]); rect(3, 96, 40, 1, T.PATH); rect(3, 104, 40, 1, T.PATH); rect(3, 112, 40, 1, T.PATH); rect(3, 120, 40, 1, T.PATH); rect(12, 89, 1, 35, T.PATH); rect(30, 89, 1, 35, T.PATH);
    set(43, 100, T.GATE); }
  // Creek south of the line.
  { for (let y = 86; y < 137; y++) { set(46, y, T.WATER); set(47, y, T.WATER); if (y % 4 === 1) set(48, y, T.REED); if (y % 6 === 2) set(45, y, T.REED); }
    set(46, 86, T.GATE); set(47, 86, T.GATE); rect(44, 100, 6, 1, T.PLANK); rect(44, 86, 1, 14, T.PATH); set(45, 86, T.PATH); rect(44, 101, 2, 1, T.HEDGE); }
  /* ---- Penny Rec ---- */
  { const r = R('park'); rect(49, 87, 55, 39, T.GRASS); scatter(r, 49, 87, 55, 39, T.TREE, 55); scatter(r, 49, 87, 55, 39, T.FLOWER, 50); scatter(r, 49, 87, 55, 39, T.TALL, 60); scatter(r, 49, 87, 55, 39, T.BUSH, 18);
    for (let y = 99; y < 114; y++) for (let x = 66; x < 87; x++) { const dx = (x - 76) / 9.5, dy = (y - 106) / 6.2, q = dx * dx + dy * dy; if (q < 1) set(x, y, q < 0.45 ? T.DEEP : T.WATER); else if (q < 1.35) set(x, y, r.int(4) === 0 ? T.REED : T.GRASS); }
    path([[72, 87], [72, 96], [62, 96], [62, 116], [76, 116], [76, 125]]); path([[72, 96], [90, 96], [90, 116], [76, 116]]); path([[50, 100], [62, 100]]); path([[90, 100], [103, 100]]); path([[76, 113], [76, 116]]);
    rect(76, 113, 1, 3, T.PLANK); set(76, 112, T.PLANK);
    set(70, 95, T.BENCH); set(84, 95, T.BENCH); set(91, 108, T.BENCH); set(61, 108, T.BENCH); lamp(73, 97); lamp(89, 97); lamp(63, 115); lamp(89, 115); lamp(76, 124);
    rect(94, 90, 6, 5, T.YARD); set(95, 91, T.STUMP); set(98, 93, T.STUMP); }
  /* ---- The Parade ---- */
  { const r = R('parade'); rect(107, 100, 50, 3, T.ROAD); rect(107, 99, 50, 1, T.PAVE); rect(107, 103, 50, 1, T.PAVE);
    const shops = ['Dray\'s Corner', 'Post Office', 'Brisk & Daughter', 'Sull & Son', 'The Lantern Café'];
    shops.forEach((n, i) => { const x = 112 + i * 8; house(x, 92, 7, 7, 3); doors.push({ x: x + 3, y: 98, label: n }); });
    rect(152, 92, 2, 7, T.FENCE); rect(154, 91, 3, 8, T.GRAVEL); set(154, 99, T.PAVE); set(155, 99, T.PAVE); set(156, 92, T.SHED); set(154, 91, T.BUSH);
    [110, 119, 128, 137, 146].forEach((x, i) => { house(x, 106, 6, 6, 2); doors.push({ x: x + 2, y: 111, label: `Parade Cottages ${i + 1}` }); });
    rect(108, 113, 48, 12, T.GRASS); scatter(r, 108, 113, 48, 12, T.TREE, 90); scatter(r, 108, 113, 48, 12, T.TALL, 150);
    for (let x = 110; x < 156; x += 8) { lamp(x, 99); lamp(x + 4, 103); } rect(107, 87, 3, 12, T.GRASS); scatter(r, 107, 87, 50, 5, T.TREE, 200); }
  /* ---- Lowmere Edge ---- */
  { const r = R('shore'); rect(50, 132, 108, 3, T.ROAD); rect(50, 131, 108, 1, T.PAVE);
    for (let x = 50; x < 158; x++) { const e = 138 + ((noise[x]! >> 6) & 1); for (let y = 135; y < 158; y++) set(x, y, y < e ? T.SAND : y < e + 3 ? T.WATER : T.DEEP); }
    rect(90, 135, 2, 16, T.PLANK); rect(88, 149, 6, 2, T.PLANK);
    scatter(r, 50, 135, 108, 3, T.ROCK, 30, T.SAND); scatter(r, 50, 138, 108, 3, T.REED, 60, T.WATER);
    house(144, 126, 5, 5, 2, T.SHED); doors.push({ x: 146, y: 130, label: 'Warden\'s hut' }); rect(150, 135, 8, 23, T.CLIFF); rect(152, 132, 6, 3, T.PAVE);
    set(84, 135, T.BENCH); set(110, 135, T.BENCH); for (let x = 56; x < 156; x += 10) lamp(x, 131);
    rect(50, 126, 54, 5, T.GRASS); scatter(r, 50, 126, 54, 5, T.TREE, 120); rect(76, 125, 1, 7, T.PATH); rect(107, 126, 37, 5, T.GRASS); scatter(r, 107, 126, 37, 5, T.TALL, 200); }
  /* ---- The Cut ---- */
  { const r = R('cut'); rect(2, 126, 47, 32, T.GRASS); scatter(r, 2, 126, 47, 32, T.TALL, 300); scatter(r, 2, 126, 47, 32, T.TREE, 70); scatter(r, 2, 126, 47, 32, T.REED, 50);
    let y = 134;
    for (let x = 47; x >= 2; x--) { if (x % 6 === 0) y += r.int(3) - 0; if (y > 150) y = 150; rect(x, y, 1, 3, T.WATER); set(x, y - 1, r.int(3) ? T.REED : T.TALL); set(x, y + 3, r.int(3) ? T.REED : T.TALL); if (x === 36 || x === 20) { set(x, y, T.STONE); set(x, y + 1, T.STONE); set(x, y + 2, T.STONE); path([[x, y - 1], [x, y - 4]]); path([[x, y + 3], [x, y + 6]]); } }
    rect(2, 152, 47, 6, T.DEEP); rect(2, 151, 47, 1, T.WATER);
    rect(49, 126, 1, 32, T.HEDGE); rect(48, 129, 2, 2, T.PATH); rect(48, 128, 1, 1, T.HEDGE); rect(48, 131, 1, 1, T.HEDGE);
    path([[45, 130], [40, 130], [40, 127], [24, 127], [24, 131]]); rect(46, 129, 2, 2, T.PLANK);
    path([[36, 142], [14, 142]]); house(12, 137, 5, 4, 2, T.SHED); doors.push({ x: 14, y: 140, label: 'Pump house' }); set(14, 141, T.PATH); }

  // Registered places: benches, signs, stops, and anything they build themselves.
  for (const p of PLACES) {
    if (p.stop) set(p.at[0], p.at[1], T.STOP);
    if (p.sign) set(p.at[0], p.at[1], T.SIGN);
    if (p.bench) set(p.at[0], p.at[1], T.BENCH);
    p.build?.(B);
  }
  GATES.forEach((g, i) => { for (let j = 0; j < (g.h ?? 1); j++) for (let k = 0; k < (g.w ?? 1); k++) { set(g.at[0] + k, g.at[1] + j, T.GATE); gate[(g.at[1] + j) * W + g.at[0] + k] = i + 1; } });
  // Lamps list is rebuilt from tiles so extension lamps count.
  lamps.length = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tiles[y * W + x] === T.LAMP) lamps.push([x, y]);

  // Everything the kid could ever stand on, flooding from the front door with gates open.
  const reach = new Uint8Array(W * H), q = new Int32Array(W * H);
  let qh = 0, qt = 0;
  q[qt++] = 57 * W + 62; reach[57 * W + 62] = 1;
  while (qh < qt) {
    const c = q[qh++]!, x = c % W, y = (c / W) | 0;
    for (let d = 0; d < 4; d++) { const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0); if (!inb(nx, ny)) continue; const n = ny * W + nx; if (reach[n] || SOLID[tiles[n]!]) continue; reach[n] = 1; q[qt++] = n; }
  }
  return { w: W, h: H, tiles, district, gate, reach, noise, lamps, doors };
};

/** A reachable, plain tile near (x, y): the nearest by rings. Used for seeded scatter and safe spawns. */
export const nearestOpen = (m: TownMap, x: number, y: number): readonly [number, number] => {
  for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const i = (y + dy) * W + x + dx;
    if (x + dx > 1 && y + dy > 1 && x + dx < W - 2 && y + dy < H - 2 && m.reach[i] && m.tiles[i] !== T.GATE) return [x + dx, y + dy];
  }
  return [62, 57];
};
