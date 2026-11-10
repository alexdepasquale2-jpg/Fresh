// The stability survey (PC-only): runs a law set on a synthetic world through the real sand kernel.
// Kept apart from index.ts so the app bundle, which wires the tool factory, never pulls the kernel in twice.
import type { LawSet } from '@/contracts/atlas';
import type { SurfaceModifiers } from '@/contracts/sky';
import type { PlanetSpec } from '@/contracts/system';
import type { UniverseSpec } from '@/contracts/universe';
import { GRID_W as W, GRID_H as H, ENGINE } from '@/contracts/sim';
import { fxSin, FX_ONE } from '@/core/fixed';
import { factory as sand } from '@/sim/sand';
import { useSurvey } from './index';

const isin = (phase: number) => Math.trunc((fxSin(Math.trunc(((((phase % 1000) + 1000) % 1000) * FX_ONE) / 1000)) * 1000) / FX_ONE);

/** A fixed test world: rolling land, a sea, mossy tops, a stone crag, caves and ore, built from the law set's own base materials. */
export const testSurface = (law: LawSet): Uint8Array => {
  const id = (name: string, fallback: number) => law.materials.find((m) => m.name === name)?.id ?? fallback;
  const STONE = id('stone', 1), SAND = id('sand', 2), WATER = id('water', 3), MOSS = id('moss', 4);
  const cells = new Uint8Array(W * H);
  const sea = Math.trunc(H * 0.55);
  for (let x = 0; x < W; x++) {
    const g = Math.trunc(H * 0.53 + (isin(x * 4 + 120) * 30 + isin(x * 13 + 400) * 7 + isin(x * 41) * 2) / 1000);
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (y >= g + 4) cells[i] = STONE;
      else if (y >= g) cells[i] = y === g && g < sea - 1 ? (x % 3 === 0 ? SAND : MOSS) : SAND;
      else if (y >= sea) cells[i] = WATER;
    }
    if (x > 150 && x < 166) for (let y = g - (8 - Math.abs(x - 158)); y < g; y++) if (y > 0) cells[y * W + x] = STONE;
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (cells[i] !== STONE) continue;
      const cy = Math.trunc(H * 0.8 + isin(x * 9) / 90);
      if (y > g + 8 && Math.abs(y - cy) < 3 && x % 60 > 12) cells[i] = x % 60 > 40 && y > cy ? WATER : 0;
      else if (y > H * 0.86 && (x * 7 + y * 13) % 97 === 0) cells[i] = ENGINE.ore.id;
    }
  }
  return cells;
};

/** A plain sky, a warm moonlit tidal sky with falling rocks, and a cold dim dusty sky with hard seasons. */
export const TEST_SKIES: readonly SurfaceModifiers[] = [
  { tide: 0, nightLight: 0, impacts: 0, seasons: 0, dimming: 0, warmth: 0, dust: 0 },
  { tide: 40, nightLight: 40, impacts: 30, seasons: 0, dimming: 0, warmth: 25, dust: 0 },
  { tide: 0, nightLight: 0, impacts: 0, seasons: 40, dimming: 40, warmth: -20, dust: 60 },
];

export interface Survey {
  readonly ok: boolean;
  readonly reason: string;
  /** Cells that changed over the last 2,000 ticks, in parts per ten thousand of the grid. */
  readonly live: number;
  /** Share of the grid per material name at the end, in percent, largest first. */
  readonly mix: readonly (readonly [string, number])[];
  /** FNV hash of the final grid, for determinism checks. */
  readonly hash: number;
  /** The same shares at the end of each sky but the last, so a law set can be read sky by sky. */
  readonly phases: readonly (readonly (readonly [string, number])[])[];
}

/** Run a law set under the given skies in turn and report what is left. Deterministic. */
export const survey = (law: LawSet, ticks: number, skies: readonly SurfaceModifiers[] = TEST_SKIES): Survey => {
  const sim = sand();
  const start = testSurface(law);
  sim.init(
    { seed: { hi: 7, lo: 0x51ab + law.pulseMilliHz } } as unknown as PlanetSpec,
    { materialTable: law.materials, reactionTable: law.reactions } as unknown as UniverseSpec,
    { cells: start, villageSites: [] },
  );
  const names = new Map<number, string>(law.materials.map((m) => [m.id, m.name]));
  for (const [k, v] of Object.entries(ENGINE)) names.set(v.id, k);
  const cells = sim.grid().cells;
  const part = Math.max(1, Math.trunc(ticks / skies.length));
  const before = new Uint8Array(cells.length);
  const window = Math.min(2000, ticks);
  const total = cells.length;
  const mixNow = () => {
    const count = new Map<number, number>();
    for (let i = 0; i < total; i++) count.set(cells[i]!, (count.get(cells[i]!) ?? 0) + 1);
    return [...count.entries()].filter(([c]) => c !== 0).sort((a, b) => b[1] - a[1])
      .map(([c, n]) => [names.get(c) ?? `#${c}`, Math.round((n * 10000) / total) / 100] as const);
  };
  const phases: (readonly (readonly [string, number])[])[] = [];
  let done = 0;
  for (let s = 0; s < skies.length; s++) {
    const last = s === skies.length - 1;
    const n = last ? ticks - done : part;
    const head = Math.max(0, n - (last ? window : 0));
    sim.step(head, skies[s]!);
    if (last) { before.set(cells); sim.step(n - head, skies[s]!); } else phases.push(mixNow());
    done += n;
  }
  const count = new Map<number, number>();
  const kindOf = new Map<number, string>(law.materials.map((m) => [m.id, m.kind]));
  const matter = (c: number) => c !== 0 && c !== ENGINE.fire.id && kindOf.get(c) !== 'gas' && kindOf.get(c) !== 'fire';
  let changed = 0, hash = 2166136261, filled0 = 0, filled1 = 0, stone0 = 0, stone1 = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    count.set(c, (count.get(c) ?? 0) + 1);
    if (c !== before[i]) changed++;
    hash = Math.imul(hash ^ c, 16777619) >>> 0;
    if (matter(start[i]!)) filled0++;
    if (matter(c)) filled1++;
    if (start[i] === 1) stone0++;
    if (c === 1) stone1++;
  }
  const mix = mixNow();
  const live = Math.round((changed * 10000) / total);
  let reason = '';
  const fire = (count.get(ENGINE.fire.id) ?? 0) + law.materials.filter((m) => m.kind === 'fire').reduce((a, m) => a + (count.get(m.id) ?? 0), 0);
  if (changed < 12) reason = `dead: only ${changed} cells changed in the last ${window} ticks`;
  else if (fire * 100 > total * 3) reason = `burning: fire covers ${Math.round((fire * 100) / total)}%`;
  else if (filled1 * 100 > filled0 * 130) reason = `overgrown: matter grew ${Math.round((filled1 * 100) / filled0 - 100)}%`;
  else if (filled1 * 100 < filled0 * 70) reason = `hollowed: matter fell ${Math.round(100 - (filled1 * 100) / filled0)}%`;
  else if (stone1 * 100 < stone0 * 60) reason = `eaten: stone fell ${Math.round(100 - (stone1 * 100) / stone0)}%`;
  else {
    for (const m of law.materials) if (m.id >= 6 && (count.get(m.id) ?? 0) * 100 > total * 30) reason = `overrun: ${m.name} covers ${Math.round(((count.get(m.id) ?? 0) * 100) / total)}%`;
  }
  return { ok: reason === '', reason: reason || 'alive and bounded', live, mix, hash, phases };
};

useSurvey((law, ticks) => survey(law, ticks));
