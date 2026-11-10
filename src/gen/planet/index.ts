// Planet generator (unit 05): a side-on slice of a world.
// Layered heightfield (continents + hills + ridges), sea, islands, caves carved by
// random worms, ore veins, biome-specific surface (moss valleys, salt flats, ash dunes,
// glass plains, tallow pools), snow on high cold peaks, lakes in hollows, village sites.
import type { PlanetGenFactory } from '@/contracts/system';
import { GRID_W, GRID_H } from '@/contracts/system';
import { ENGINE } from '@/contracts/sim';
import { child, rng } from '@/core/hash';
import type { Rng } from '@/core/hash';

/** Smooth integer value noise along x: knots every `step` cells, smoothstep blend. */
const octave = (r: Rng, W: number, step: number, amp: number): Int32Array => {
  const n = Math.ceil(W / step) + 2;
  const k: number[] = [];
  for (let i = 0; i < n; i++) k.push(r.range(-amp, amp));
  const out = new Int32Array(W);
  for (let x = 0; x < W; x++) {
    const i = Math.floor(x / step);
    const f = (x % step) / step;
    const s = f * f * (3 - 2 * f);
    out[x] = Math.round(k[i]! + (k[i + 1]! - k[i]!) * s);
  }
  return out;
};

export const factory: PlanetGenFactory = () => ({
  surface: (planet, universe) => {
    const W = GRID_W;
    const H = GRID_H;
    const cells = new Uint8Array(W * H);
    const id = (name: string, fallback: number) => universe.materialTable.find((m) => m.name === name)?.id ?? fallback;
    const STONE = id('stone', 1), SAND = id('sand', 2), WATER = id('water', 3), MOSS = id('moss', 4);
    const extra = universe.materialTable.filter((m) => m.id >= 6);
    const r = rng(child(planet.seed, 'terrain'));
    const t = planet.terrain;
    const rough = 1 + (t.roughness >> 5);
    const cont = octave(r, W, 80, 18);
    const hills = octave(r, W, 24, 4 + rough * 2);
    const bumps = octave(r, W, 6, rough);
    const ground = new Int32Array(W);
    for (let x = 0; x < W; x++) ground[x] = Math.round(H * 0.56 + cont[x]! + hills[x]! + bumps[x]!);
    // Ridges: a few sharp peaks.
    for (let k = r.int(3); k > 0; k--) {
      const px = r.range(20, W - 20), ph = r.range(10, 24 + rough * 3), pw = r.range(8, 20);
      for (let x = Math.max(0, px - pw); x < Math.min(W, px + pw); x++) ground[x] = ground[x]! - Math.round((ph * (pw - Math.abs(x - px))) / pw);
    }
    // Sea level as a share of the land underwater: seaLevel 0..255 floods 15%..75% of columns.
    const sorted = Array.from(ground).sort((a, b) => b - a);
    const sea = sorted[Math.min(W - 1, Math.floor(((15 + (t.seaLevel * 60) / 255) / 100) * W))]! + 1;
    const peakLine = sea - 34;
    const cold = t.biome === 'salt' || t.seaLevel > 180;

    for (let x = 0; x < W; x++) {
      const gy = Math.max(8, ground[x]!);
      const soil = t.biome === 'glass' ? 2 : 3 + ((x * 7) % 3);
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        if (y >= gy + soil) cells[i] = STONE;
        else if (y >= gy) {
          if (y === gy && gy < sea - 1) {
            if (cold && gy < peakLine) cells[i] = ENGINE.snow.id;
            else if (t.biome === 'moss' || t.biome === 'tallow' || t.biome === 'salt') cells[i] = MOSS;
            else if (t.biome === 'glass' && extra[0]) cells[i] = extra[0].kind === 'solid' ? extra[0].id : SAND;
            else if (t.biome === 'ash') cells[i] = ENGINE.ash.id;
            else cells[i] = SAND;
          } else cells[i] = SAND;
        } else if (y >= sea) cells[i] = WATER;
      }
    }
    // Caves: worms of empty space through the stone, sometimes flooded.
    const worms = 2 + r.int(4);
    for (let w = 0; w < worms; w++) {
      let x = r.range(10, W - 10);
      let y = r.range(Math.round(H * 0.72), H - 12);
      let dx = r.chance(1, 2) ? 1 : -1;
      const len = r.range(30, 90);
      const wet = r.chance(1, 3);
      for (let s = 0; s < len; s++) {
        const rad = 2 + (s % 7 === 0 ? 1 : 0);
        for (let oy = -rad; oy <= rad; oy++) for (let ox = -rad; ox <= rad; ox++) {
          const px = x + ox, py = y + oy;
          if (px < 1 || px >= W - 1 || py < 1 || py >= H - 1 || ox * ox + oy * oy > rad * rad) continue;
          if (py > ground[px]! + 4) cells[py * W + px] = wet && oy > 0 ? WATER : 0;
        }
        x += dx;
        y += r.range(-1, 1);
        if (r.chance(1, 12)) dx = -dx;
        y = Math.max(Math.round(H * 0.68), Math.min(H - 4, y));
        x = Math.max(2, Math.min(W - 3, x));
      }
    }
    // Ore veins in deep stone.
    for (let v = r.range(3, 8); v > 0; v--) {
      let x = r.range(4, W - 4), y = r.range(Math.round(H * 0.75), H - 3);
      for (let s = r.range(4, 14); s > 0; s--) {
        if (cells[y * W + x] === STONE) cells[y * W + x] = ENGINE.ore.id;
        x = Math.max(0, Math.min(W - 1, x + r.range(-1, 1)));
        y = Math.max(0, Math.min(H - 1, y + r.range(-1, 1)));
      }
    }
    // Lakes in hollows above the sea, and tallow or other law liquids pooling.
    const liquidExtra = extra.find((m) => m.kind === 'liquid');
    for (let x = 3; x < W - 3; x++) {
      const gy = ground[x]!;
      if (gy >= sea - 2) continue;
      if (ground[x - 3]! < gy - 2 && ground[x + 3]! < gy - 2) {
        for (let y = gy - 2; y < gy; y++) if (cells[y * W + x] === 0) cells[y * W + x] = liquidExtra && t.biome === 'tallow' ? liquidExtra.id : WATER;
      }
    }
    // Village sites: dry, fairly flat land.
    const villageSites: { x: number; y: number }[] = [];
    for (let k = 0; k < 80 && villageSites.length < 5; k++) {
      const x = r.range(8, W - 9);
      const y = ground[x]! - 1;
      const flat = Math.abs(ground[x - 2]! - ground[x + 2]!) <= 2;
      if (flat && y < sea - 1 && villageSites.every((v) => Math.abs(v.x - x) > 28)) villageSites.push({ x, y });
    }
    if (villageSites.length === 0) {
      let bx = 8;
      for (let x = 8; x < W - 8; x++) if (ground[x]! < ground[bx]!) bx = x;
      villageSites.push({ x: bx, y: ground[bx]! - 1 });
    }
    return { cells, villageSites };
  },
});
