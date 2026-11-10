// Planet generator (unit 05): a side-on slice of a world.
// The land's shape comes from terrain.form (continents, archipelago, pangaea, canyon,
// crater, ice shell, highlands, ocean), its relief from gravity and roughness, and its
// skin from the biome. Then: ridges, sea, beaches and cliffs, rivers, lakes in hollows,
// worm caves and caverns, ore, a tidally locked hot and cold face, and village sites
// scored for flat dry ground near water.
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
    const ICE = ENGINE.ice.id, SNOW = ENGINE.snow.id, ASH = ENGINE.ash.id, ORE = ENGINE.ore.id;
    const extra = universe.materialTable.filter((m) => m.id >= 6 && m.id < 250);
    const solidExtra = extra.find((m) => m.kind === 'solid');
    const liquidExtra = extra.find((m) => m.kind === 'liquid');
    const r = rng(child(planet.seed, 'terrain'));
    const t = planet.terrain;
    const form = t.form ?? 'continents';
    const gravity = t.gravity ?? 128;
    const rough = 1 + (t.roughness >> 5);
    // Low gravity lets relief stand 1.6x tall; high gravity presses it to 0.6x.
    const relief = 160 - Math.round((gravity * 100) / 255);
    const mid = Math.round(H * 0.56);
    const clampX = (x: number) => Math.max(0, Math.min(W - 1, x));

    // ---------- the shape of the land ----------
    const dev = new Int32Array(W);
    const add = (o: Int32Array, mul = 1) => { for (let x = 0; x < W; x++) dev[x] = dev[x]! + o[x]! * mul; };
    if (form === 'archipelago') {
      add(octave(r, W, 90, 12)); add(octave(r, W, 17, 14)); add(octave(r, W, 5, rough));
    } else if (form === 'ocean') {
      add(octave(r, W, 100, 20)); add(octave(r, W, 23, 9)); add(octave(r, W, 6, 1 + (rough >> 1)));
    } else if (form === 'pangaea') {
      // One great hump of land, the rest drowned.
      const c = r.range(Math.round(W * 0.35), Math.round(W * 0.65)), half = r.range(Math.round(W * 0.3), Math.round(W * 0.42));
      for (let x = 0; x < W; x++) {
        const d = Math.min(Math.abs(x - c), W - Math.abs(x - c)) / half;
        dev[x] = d < 1 ? -Math.round(24 * (1 - d * d * (3 - 2 * d))) + 6 : 10;
      }
      add(octave(r, W, 40, 6)); add(octave(r, W, 20, 3 + rough)); add(octave(r, W, 6, rough));
    } else if (form === 'canyon') {
      add(octave(r, W, 120, 8)); add(octave(r, W, 30, 4));
      // Mesa steps: the plateau stands in flat shelves.
      for (let x = 0; x < W; x++) dev[x] = Math.round(dev[x]! / 4) * 4 - 8;
      add(octave(r, W, 9, 1));
    } else if (form === 'crater') {
      add(octave(r, W, 90, 10)); add(octave(r, W, 30, 4)); add(octave(r, W, 6, rough));
    } else if (form === 'highlands') {
      add(octave(r, W, 60, 20)); add(octave(r, W, 18, 7 + rough * 2)); add(octave(r, W, 5, rough + 1));
      for (let x = 0; x < W; x++) dev[x] = dev[x]! - 6;
    } else if (form === 'iceshell') {
      // The rock floor lies deep; the sea above it wears a lid of ice.
      add(octave(r, W, 70, 24)); add(octave(r, W, 21, 9)); add(octave(r, W, 6, rough));
    } else {
      add(octave(r, W, 80, 18)); add(octave(r, W, 140, 10)); add(octave(r, W, 24, 4 + rough * 2)); add(octave(r, W, 6, rough));
    }
    const ground = new Int32Array(W);
    for (let x = 0; x < W; x++) ground[x] = mid + Math.round((dev[x]! * relief) / 100);

    // Ridges and mountains: sharp peaks, round domes, flat mesas, twins.
    const ridges = form === 'highlands' ? r.range(3, 6) : form === 'continents' ? r.int(4) : form === 'pangaea' ? r.range(1, 3) : form === 'ocean' || form === 'archipelago' ? r.int(3) : r.int(2);
    for (let k = 0; k < ridges; k++) {
      const px = r.range(16, W - 16), ph = Math.round((r.range(10, 22 + rough * 3) * relief) / 100), pw = r.range(7, 22), shape = r.int(4);
      for (let x = Math.max(0, px - pw); x < Math.min(W, px + pw); x++) {
        const d = Math.abs(x - px) / pw;
        const lift = shape === 0 ? 1 - d : shape === 1 ? 1 - d * d : shape === 2 ? Math.min(1, (1 - d) * 2.5) : Math.max(1 - Math.abs(d - 0.35) * 2.2, (1 - d) * 0.6);
        ground[x] = ground[x]! - Math.round(ph * Math.max(0, lift));
      }
    }
    // Craters: bowls with raised rims, the big ones with a central peak.
    const riverBeds: number[] = [];
    if (form === 'crater' || (t.biome === 'ash' && r.chance(1, 3))) {
      for (let k = form === 'crater' ? r.range(4, 9) : r.range(1, 2); k > 0; k--) {
        const cx = r.range(10, W - 10), rad = r.range(5, 22), depth = Math.round((rad * r.range(35, 60) * relief) / 10000), rim = 1 + (depth >> 2);
        for (let x = Math.max(0, cx - rad - 6); x < Math.min(W, cx + rad + 7); x++) {
          const d = Math.abs(x - cx);
          if (d <= rad) ground[x] = ground[x]! + Math.round(depth * (1 - (d * d) / (rad * rad))) - (rad > 14 && d < 3 ? 3 - d + (depth >> 2) : 0);
          else ground[x] = ground[x]! - Math.round(rim * (1 - (d - rad) / 6));
        }
      }
    }
    // Canyons: deep stepped cuts with a river along the floor.
    if (form === 'canyon' || (form === 'highlands' && r.chance(1, 2))) {
      for (let k = form === 'canyon' ? r.range(2, 5) : 1; k > 0; k--) {
        const cx = r.range(14, W - 14), depth = Math.round((r.range(16, 34) * relief) / 100), floor = r.range(2, 5), wall = floor + r.range(4, 10);
        for (let x = Math.max(0, cx - wall); x <= Math.min(W - 1, cx + wall); x++) {
          const d = Math.abs(x - cx);
          const cut = d <= floor ? depth : Math.round((depth * (wall - d)) / (wall - floor) / 5) * 5;
          ground[x] = ground[x]! + cut;
        }
        riverBeds.push(cx, floor);
      }
    }
    for (let x = 0; x < W; x++) ground[x] = Math.max(10, Math.min(H - 30, ground[x]!));

    // Sea level as a share of the land underwater: seaLevel 0..255 floods 15%..75% of columns.
    const sorted = Array.from(ground).sort((a, b) => b - a);
    const sea = sorted[Math.min(W - 1, Math.floor(((15 + (t.seaLevel * 60) / 255) / 100) * W))]! + 1;
    const peakLine = sea - 34;
    const cold = t.biome === 'salt' || t.seaLevel > 180 || form === 'iceshell';
    const dry = (t.biome === 'glass' || t.biome === 'ash') && t.seaLevel < 70;
    // Tidally locked: zone 0 is the baked face, 1 the living band, 2 the frozen face.
    const wob = octave(r, W, 30, 8);
    const zone = (x: number) => (!t.locked ? 1 : x + wob[x]! < W * 0.38 ? 0 : x + wob[x]! > W * 0.62 ? 2 : 1);
    const green = octave(r, W, 28, 10);
    const lid = octave(r, W, 12, 1);

    // ---------- fill ----------
    for (let x = 0; x < W; x++) {
      const gy = ground[x]!;
      const z = zone(x);
      const beach = gy >= sea - 3 && gy < sea + 2;
      const steep = Math.abs(gy - ground[clampX(x + 1)]!) >= 3 || Math.abs(gy - ground[clampX(x - 1)]!) >= 3;
      const soil = steep ? 1 : t.biome === 'glass' ? 2 : beach ? 5 : 3 + ((x * 7) % 3);
      const frozen = z === 2 || form === 'iceshell';
      const iceDeep = form === 'iceshell' ? 4 + lid[x]! : 2;
      let top: number;
      if (steep) top = STONE;
      else if (z === 0) top = t.biome === 'glass' && solidExtra ? solidExtra.id : r.chance(1, 2) ? ASH : SAND;
      else if (frozen || (cold && gy < peakLine) || gy < sea - 52) top = SNOW;
      else if (beach) top = SAND;
      else if (t.biome === 'moss') top = green[x]! > -8 ? MOSS : SAND;
      else if (t.biome === 'tallow') top = green[x]! > -3 ? MOSS : SAND;
      else if (t.biome === 'salt') top = green[x]! > 3 ? MOSS : green[x]! < -5 ? SNOW : SAND;
      else if (t.biome === 'glass') top = solidExtra ? solidExtra.id : SAND;
      else if (t.biome === 'ash') top = green[x]! > 7 && !dry ? MOSS : ASH;
      else top = SAND;
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        if (y >= gy + soil) cells[i] = STONE;
        else if (y >= gy) cells[i] = y === gy && gy < sea - 1 ? top : steep ? STONE : SAND;
        else if (y >= sea) cells[i] = frozen && y < sea + iceDeep ? ICE : WATER;
      }
      // Snow lying on the ice lid.
      if (frozen && gy > sea && sea > 1 && (form === 'iceshell' ? green[x]! > -6 : true)) cells[(sea - 1) * W + x] = SNOW;
    }

    // Rivers: a groove of water from high ground down to the sea.
    if (!dry && form !== 'iceshell' && form !== 'ocean') {
      for (let k = form === 'pangaea' || form === 'highlands' ? r.range(1, 3) : r.int(3); k > 0; k--) {
        let x = r.range(12, W - 12);
        if (ground[x]! >= sea - 6 || zone(x) !== 1) continue;
        // Head for whichever side falls away.
        const dir = ground[clampX(x + 8)]! > ground[clampX(x - 8)]! ? 1 : -1;
        let low = ground[x]!;
        for (let s = 0; s < 90 && x > 1 && x < W - 2; s++, x += dir) {
          const gy = ground[x]!;
          if (gy >= sea - 1 || gy < low - 3) break;
          low = Math.max(low, gy);
          cells[gy * W + x] = WATER;
          if (cells[(gy + 1) * W + x] !== STONE) cells[(gy + 1) * W + x] = SAND;
        }
      }
    }
    // Canyon rivers along each floor.
    for (let k = 0; k < riverBeds.length; k += 2) {
      const cx = riverBeds[k]!, fl = riverBeds[k + 1]!;
      if (dry && k > 0) continue;
      for (let x = Math.max(1, cx - fl); x <= Math.min(W - 2, cx + fl); x++) {
        const gy = ground[x]!;
        if (gy < sea && cells[(gy - 1) * W + x] === 0) cells[(gy - 1) * W + x] = WATER;
      }
    }
    // Lakes: water trapped between rims, in hollows above the sea.
    if (!dry || form === 'crater') {
      const SPAN = 16;
      const lakeLiquid = liquidExtra && t.biome === 'tallow' ? liquidExtra.id : WATER;
      for (let x = SPAN; x < W - SPAN; x++) {
        const gy = ground[x]!;
        if (gy >= sea - 2 || zone(x) === 0) continue;
        let l = H, rr = H;
        for (let d = 1; d <= SPAN; d++) { l = Math.min(l, ground[x - d]!); rr = Math.min(rr, ground[x + d]!); }
        const level = Math.max(l, rr) + 1;
        if (level >= gy || gy - level > (form === 'crater' ? 9 : 6)) continue;
        if (dry && (x * 2654435761 >>> 0) % 3 !== 0 && gy - level < 3) continue;
        for (let y = level; y < gy; y++) if (cells[y * W + x] === 0) cells[y * W + x] = zone(x) === 2 && y === level ? ICE : lakeLiquid;
      }
    }

    // ---------- under the ground ----------
    // Caves: worms of empty space through the stone, sometimes flooded, sometimes opening to the air.
    const worms = 2 + r.int(4) + (rough >> 2);
    for (let w = 0; w < worms; w++) {
      let x = r.range(10, W - 10);
      const mouth = (form === 'canyon' || form === 'highlands' || form === 'crater') && r.chance(1, 3);
      let y = mouth ? ground[x]! + 2 : r.range(Math.round(H * 0.72), H - 12);
      let dx = r.chance(1, 2) ? 1 : -1;
      const len = r.range(30, 100);
      const wet = !mouth && r.chance(1, 3);
      const fat = r.range(1, 3);
      for (let s = 0; s < len; s++) {
        const rad = fat + (s % 7 === 0 ? 1 : 0);
        for (let oy = -rad; oy <= rad; oy++) for (let ox = -rad; ox <= rad; ox++) {
          const px = x + ox, py = y + oy;
          if (px < 1 || px >= W - 1 || py < 1 || py >= H - 1 || ox * ox + oy * oy > rad * rad) continue;
          const roof = mouth && s < 8 ? 0 : 4;
          if (py > ground[px]! + roof && (ground[px]! < sea - 1 || py > ground[px]! + 5)) cells[py * W + px] = wet && oy > 0 ? WATER : 0;
        }
        x += dx;
        y += mouth && s < 14 ? 1 : r.range(-1, 1);
        if (r.chance(1, 12)) dx = -dx;
        y = Math.max(mouth ? 12 : Math.round(H * 0.68), Math.min(H - 4, y));
        x = Math.max(2, Math.min(W - 3, x));
      }
    }
    // Caverns: wide halls with teeth hanging from the roof and a pool or crystals on the floor.
    for (let c = r.int(3) + (form === 'iceshell' ? 0 : rough >> 3); c > 0; c--) {
      const cx = r.range(24, W - 24), cy = r.range(Math.round(H * 0.76), H - 16), rx = r.range(8, 18), ry = r.range(4, 7), pool = r.chance(1, 2);
      for (let ox = -rx; ox <= rx; ox++) {
        const px = cx + ox;
        const hh = Math.round(ry * Math.sqrt(Math.max(0, 1 - (ox * ox) / (rx * rx))));
        const tooth = (px * 7 + cx) % 5 === 0 ? 1 + ((px + cy) % 3) : 0;
        for (let oy = -hh + tooth; oy <= hh; oy++) {
          const py = cy + oy;
          if (py <= ground[px]! + 6 || py >= H - 2) continue;
          cells[py * W + px] = oy > hh - 2 ? (pool ? WATER : solidExtra && (px + py) % 3 === 0 ? solidExtra.id : 0) : 0;
        }
      }
    }
    // Ore veins in deep stone, and seams of the universe's own solid.
    for (let v = r.range(3, 8) + (gravity > 170 ? 3 : 0); v > 0; v--) {
      let x = r.range(4, W - 4), y = r.range(Math.round(H * 0.75), H - 3);
      const what = solidExtra && v % 4 === 0 ? solidExtra.id : ORE;
      for (let s = r.range(4, 14); s > 0; s--) {
        if (cells[y * W + x] === STONE) cells[y * W + x] = what;
        x = Math.max(0, Math.min(W - 1, x + r.range(-1, 1)));
        y = Math.max(0, Math.min(H - 1, y + r.range(-1, 1)));
      }
    }

    // ---------- village sites: flat, dry, near water, off the peaks ----------
    const liquid = (m: number) => m === WATER || (liquidExtra !== undefined && m === liquidExtra.id);
    const top = new Int32Array(W);
    const wetCol = new Uint8Array(W);
    for (let x = 0; x < W; x++) {
      let y = 1;
      while (y < H - 1 && cells[y * W + x] === 0) y++;
      top[x] = y;
      wetCol[x] = liquid(cells[y * W + x]!) ? 1 : 0;
    }
    const score = new Int32Array(W).fill(-999);
    for (let x = 8; x < W - 8; x++) {
      const y = top[x]!;
      const m = cells[y * W + x]!;
      if (wetCol[x] || y < 12 || y >= sea + (form === 'iceshell' ? 0 : -1) || zone(x) === 0) continue;
      let lo = y, hi = y, wet = 99;
      for (let d = -3; d <= 3; d++) { lo = Math.min(lo, top[x + d]!); hi = Math.max(hi, top[x + d]!); if (wetCol[x + d] && Math.abs(d) <= 2) wet = 0; }
      if (hi - lo > (gravity < 85 ? 5 : 4) || wet === 0) continue;
      for (let d = 3; d <= 36 && wet === 99; d++) if (wetCol[clampX(x - d)] || wetCol[clampX(x + d)]) wet = d;
      const above = sea - y;
      score[x] = 60 - (hi - lo) * 12 + (wet < 99 ? 26 - (wet >> 1) : 0) + (above >= 3 && above <= 22 ? 12 : 0)
        - (m === SNOW ? 10 : 0) - (m === ICE ? 14 : 0) - (zone(x) === 2 ? 12 : 0) - (y < peakLine ? 16 : 0) + (m === MOSS ? 8 : 0) + r.int(6);
    }
    const villageSites: { x: number; y: number }[] = [];
    const want = form === 'pangaea' ? 6 : 5;
    while (villageSites.length < want) {
      let bx = -1;
      for (let x = 8; x < W - 8; x++) {
        if (score[x]! <= 0 || (bx >= 0 && score[x]! <= score[bx]!)) continue;
        if (villageSites.every((v) => Math.abs(v.x - x) > 26)) bx = x;
      }
      if (bx < 0) break;
      villageSites.push({ x: bx, y: top[bx]! - 1 });
      score[bx] = -999;
    }
    if (villageSites.length === 0) {
      // Nowhere good: take the highest ground there is.
      let bx = 8;
      for (let x = 8; x < W - 8; x++) if (top[x]! < top[bx]! && top[x]! >= 12) bx = x;
      villageSites.push({ x: bx, y: top[bx]! - 1 });
    }
    return { cells, villageSites };
  },
});
