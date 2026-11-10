// Planet generator (unit 05): side-on slice of terrain, sea and moss.
import type { PlanetGenFactory } from '@/contracts/system';
import { GRID_W, GRID_H } from '@/contracts/system';
import { child, rng } from '@/core/hash';

export const factory: PlanetGenFactory = () => ({
  surface: (planet, universe) => {
    const W = GRID_W;
    const H = GRID_H;
    const cells = new Uint8Array(W * H);
    const id = (name: string, fallback: number) => universe.materialTable.find((m) => m.name === name)?.id ?? fallback;
    const STONE = id('stone', 1), SAND = id('sand', 2), WATER = id('water', 3), MOSS = id('moss', 4);
    const r = rng(child(planet.seed, 'terrain'));
    // 1D midpoint-ish heightfield from summed integer octaves.
    const rough = 4 + (planet.terrain.roughness >> 4);
    const knots: number[] = [];
    for (let i = 0; i <= 16; i++) knots.push(r.range(-rough * 3, rough * 3));
    const ground = new Int32Array(W);
    for (let x = 0; x < W; x++) {
      const t = (x * 16) / (W - 1);
      const i = Math.min(15, Math.floor(t));
      const f = t - i;
      const smooth = f * f * (3 - 2 * f);
      const h = knots[i]! + (knots[i + 1]! - knots[i]!) * smooth + r.range(-1, 1);
      ground[x] = Math.round(H * 0.58 + h);
    }
    // Larger y is lower. seaLevel 20..220 puts the sea between y=128 (low) and y=96 (high).
    const sea = Math.round(H * 0.66 - planet.terrain.seaLevel / 6);
    for (let x = 0; x < W; x++) {
      const gy = ground[x]!;
      for (let y = 0; y < H; y++) {
        const i = y * W + x;
        if (y >= gy + 6) cells[i] = STONE;
        else if (y >= gy) cells[i] = y === gy && gy < sea - 1 && planet.terrain.biome !== 'glass' && planet.terrain.biome !== 'ash' ? MOSS : SAND;
        else if (y >= sea) cells[i] = WATER;
      }
    }
    // Village sites: dry ground with empty space above.
    const villageSites: { x: number; y: number }[] = [];
    for (let k = 0; k < 40 && villageSites.length < 4; k++) {
      const x = r.range(8, W - 9);
      const y = ground[x]! - 1;
      if (y < sea - 1 && villageSites.every((v) => Math.abs(v.x - x) > 30)) villageSites.push({ x, y });
    }
    if (villageSites.length === 0) {
      // Always give them somewhere: the highest point.
      let bx = 8;
      for (let x = 8; x < W - 8; x++) if (ground[x]! < ground[bx]!) bx = x;
      villageSites.push({ x: bx, y: ground[bx]! - 1 });
    }
    return { cells, villageSites };
  },
});
