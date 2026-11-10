// A universe's character, read defensively: every field of it is optional and may be absent.
import type { AppContext } from '@/contracts/app';
import type { Lineage, UniverseStats } from '@/contracts/game';
import type { Rarity, UniverseModifiers, UniverseSpec, UniverseTrait } from '@/contracts/universe';
import { RARITIES } from '@/contracts/universe';
import { el } from '@/ui/kit';

export interface Char {
  readonly rarity: Rarity;
  /** 0 common .. 4 mythic. */
  readonly tier: number;
  readonly temperament: string;
  readonly traits: readonly UniverseTrait[];
  readonly mods: UniverseModifiers;
  readonly title: string;
  readonly lineage: Lineage | null;
}
const isRarity = (r: unknown): r is Rarity => typeof r === 'string' && (RARITIES as readonly string[]).includes(r);
export const tierOf = (r: unknown): number => (isRarity(r) ? RARITIES.indexOf(r) : 0);
export const RARITY_MARK = ['C', 'U', 'R', 'E', 'M'] as const;

/** The universe as it stands: its own character with whatever a merge gave it laid over. */
export const charOf = (c: AppContext, spec: UniverseSpec, stats?: UniverseStats | null): Char => {
  const l = stats?.lineage;
  const lineage = l && typeof l === 'object' && Array.isArray(l.parents) ? l : null;
  let rarity: Rarity = isRarity(spec.rarity) ? spec.rarity : 'common';
  let traits: readonly UniverseTrait[] = Array.isArray(spec.traits) ? spec.traits : [];
  let mods: UniverseModifiers = spec.modifiers ?? {};
  let title = lineage?.recipe?.name ?? '';
  try {
    const m = c.merger.character?.(spec, lineage);
    if (m) {
      if (isRarity(m.rarity)) rarity = m.rarity;
      if (Array.isArray(m.traits)) traits = m.traits;
      if (m.modifiers) mods = m.modifiers;
      if (m.title) title = m.title;
    }
  } catch { /* an older merger: the spec's own character stands */ }
  const given = lineage?.rarity;
  if (isRarity(given) && tierOf(given) > tierOf(rarity)) rarity = given;
  return { rarity, tier: tierOf(rarity), temperament: typeof spec.temperament === 'string' ? spec.temperament : '', traits, mods, title, lineage };
};

/* ---------- Modifiers in plain words. ---------- */
const MODS: Record<string, readonly [string, string, string]> = {
  starDensity: ['stars', 'more stars in each fold', 'fewer stars in each fold'],
  climateCalm: ['calm', 'calmer weather', 'wilder weather'],
  glow: ['glow', 'brighter worlds, more Light', 'dimmer worlds, less Light'],
  tide: ['tide', 'stronger tides', 'weaker tides'],
  growth: ['growth', 'living things grow faster', 'living things grow slower'],
  depth: ['depth', 'more folds before the floor', 'fewer folds before the floor'],
  luck: ['luck', 'kinder odds on finds and catches', 'harder odds on finds and catches'],
  might: ['might', 'stronger creatures in battle', 'weaker creatures in battle'],
  ward: ['ward', 'hardier creatures and villages', 'frailer creatures and villages'],
  tempo: ['tempo', 'a faster pulse and shorter years', 'a slower pulse and longer years'],
  faith: ['faith', 'its people believe more readily', 'its people are slower to believe'],
};
export interface ModLine { key: string; value: number; short: string; plain: string }
export const modList = (m: UniverseModifiers | undefined): ModLine[] => {
  const out: ModLine[] = [];
  if (!m || typeof m !== 'object') return out;
  for (const [key, v] of Object.entries(m)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v === 0) continue;
    const w = MODS[key] ?? [key, `more ${key}`, `less ${key}`];
    out.push({ key, value: v, short: `${v > 0 ? '+' : '−'}${Math.abs(v)}% ${w[0]}`, plain: v > 0 ? w[1] : w[2] });
  }
  return out;
};
export const modChips = (m: UniverseModifiers | undefined): HTMLElement =>
  el('div', { class: 'rb-mods' }, ...modList(m).map((x) => el('span', { class: x.value > 0 ? 'rb-mod up' : 'rb-mod down' }, x.short)));

/* ---------- The bond, taken apart by asking the Box (never by copying its sums). ---------- */
const ZERO: UniverseStats = { worldsTended: 0, deepestFold: 0, lightFromGlow: 0 };
const BOND_PARTS: readonly (readonly [string, string, readonly (keyof UniverseStats)[]])[] = [
  ['tending', 'change the sky of one of its worlds', ['worldsTended']],
  ['falling', 'fall deeper into it', ['deepestFold']],
  ['glow', 'gather Light from its worlds', ['lightFromGlow']],
  ['watching', 'stay and watch its worlds live', ['ticksTended']],
  ['battles', 'bring it to a battle', ['battles', 'battlesWon']],
  ['sky', 'hang sky pieces on its orbits', ['piecesHung']],
  ['floor', 'reach its floor', ['floorsReached']],
  ['wonder', 'let its people come to wonder', ['enlightenment']],
];
export interface BondPart { label: string; hint: string; have: number; max: number }
export const bondParts = (c: AppContext, stats: UniverseStats): BondPart[] => {
  const of = c.box.bondOf;
  if (!of) return [];
  const out: BondPart[] = [];
  try {
    for (const [label, hint, keys] of BOND_PARTS) {
      const only: Record<string, unknown> = { ...ZERO }, full: Record<string, unknown> = { ...ZERO };
      for (const k of keys) { only[k] = stats[k] ?? 0; full[k] = 1e9; }
      const max = of(full as unknown as UniverseStats);
      if (max > 0) out.push({ label, hint, have: Math.min(max, of(only as unknown as UniverseStats)), max });
    }
  } catch { return []; }
  return out;
};
export const bondScore = (c: AppContext, stats: UniverseStats): number => {
  try { return Math.max(0, Math.min(100, Math.round(c.box.bondOf?.(stats) ?? 0))); } catch { return 0; }
};
export const bondWord = (c: AppContext, bond: number): string => {
  try { return c.box.bondName?.(bond) ?? ''; } catch { return ''; }
};

/* ---------- The emblem: a universe's signature, drawn small in its own colours. ---------- */
const hash2 = (x: number, y: number, s: number) => { let h = Math.imul((x * 73856093) ^ (y * 19349663) ^ s, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
type Pat = (u: number, v: number, r: number, a: number, n: number, h: number) => number;
const PI = Math.PI;
// Each returns 0 nothing, 1 main, 2 second, 3 spark. u, v in -1..1 (turned), r radius, a angle, n repeats.
const PATTERNS: readonly Pat[] = [
  /* rings */ (_u, _v, r, _a, n) => (r < 0.14 ? 3 : Math.sin(r * PI * (n + 1.5)) > 0.25 ? 1 : r < 1 && Math.sin(r * PI * (n + 1.5)) < -0.8 ? 2 : 0),
  /* bars */ (u, v, _r, _a, n) => { const k = Math.floor((u + 1) * (n + 1.5)); return k % 2 ? 0 : Math.abs(v) < 0.12 ? 3 : k % 4 ? 2 : 1; },
  /* spiral */ (_u, _v, r, a, n) => (r < 0.12 ? 3 : r > 1 ? 0 : Math.sin(a + r * PI * (n + 1)) > 0.3 ? 1 : Math.sin(a + r * PI * (n + 1)) < -0.85 ? 2 : 0),
  /* lattice */ (u, v, _r, _a, n) => { const x = Math.abs(Math.sin(u * PI * (n + 1) / 2)) < 0.3, y = Math.abs(Math.sin(v * PI * (n + 1) / 2)) < 0.3; return x && y ? 3 : x ? 1 : y ? 2 : 0; },
  /* scatter */ (_u, _v, _r, _a, n, h) => (h % 100 < 8 + n * 4 ? 1 + ((h >>> 8) % 3) : 0),
  /* eye */ (u, v, r) => (r < 0.14 ? 3 : r < 0.36 ? 2 : u * u + v * v * 4.2 < 0.95 ? 1 : 0),
  /* veil */ (u, v, _r, _a, n) => (Math.sin(u * PI * (n + 1) + Math.sin(v * 3) * 1.4) > 0.45 ? (v > 0.55 ? 2 : 1) : v < -0.8 ? 3 : 0),
  /* tide */ (u, v, _r, _a, n) => (v > 0.55 + Math.sin(u * PI * n + 1) * 0.16 ? 2 : v > Math.sin(u * PI * n) * 0.22 ? 1 : v < -0.6 && v > -0.86 && Math.abs(u - 0.4) < 0.14 ? 3 : 0),
  /* thorn */ (_u, _v, r, a, n) => (r < 0.16 ? 3 : r < 0.3 ? 2 : r < 0.3 + 0.7 * Math.max(0, Math.cos(a * (n + 2))) ** 3 ? 1 : 0),
  /* weave */ (u, v, _r, _a, n) => { const k = n + 1, x = Math.floor((u + 1) * k), y = Math.floor((v + 1) * k), fx = (u + 1) * k - x, fy = (v + 1) * k - y; return (x + y) % 2 ? (Math.abs(fx - 0.5) < 0.3 ? 1 : 0) : Math.abs(fy - 0.5) < 0.3 ? 2 : 0; },
  /* stair */ (u, v, _r, _a, n) => { const k = n + 2, s = (Math.floor(((u + 1) * k) / 2) / k) * 2 - 1; return v > -s + 0.25 ? 1 : v > -s ? 3 : v > -s - 0.25 ? 2 : 0; },
  /* halo */ (_u, _v, r, _a, n) => (r < 0.2 ? 3 : r > 0.62 && r < 0.84 ? 1 : r > 0.38 && r < 0.38 + 0.05 * n ? 2 : 0),
  /* seam */ (u, v, _r, _a, n) => { const s = u + Math.sin(v * PI * n) * 0.14; return Math.abs(s) < 0.1 ? 3 : Math.abs(s) < 0.42 && Math.floor((v + 1) * 3 * n) % 2 ? 2 : s < 0 ? 1 : 0; },
  /* moth */ (u, v) => { const w = Math.abs(u) - 0.48; return Math.abs(u) < 0.09 && Math.abs(v) < 0.62 ? 3 : w * w + v * v < 0.035 ? 2 : w * w + v * v * 1.5 < 0.2 ? 1 : 0; },
  /* ember */ (_u, _v, r, a, n) => (r < 0.14 ? 3 : r < 0.32 ? 2 : r < 0.56 + 0.16 * Math.sin(a * (n + 2)) ? 1 : 0),
  /* well */ (u, v, _r, _a, n) => { const m = Math.max(Math.abs(u), Math.abs(v)); return m < 0.18 ? 3 : m > 1 ? 0 : Math.floor(m * (n + 2)) % 2 ? 1 : m > 0.8 ? 2 : 0; },
];
const hexRgb = (hex: string | undefined): [number, number, number] => {
  const n = typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0x6f6535;
  return [n >> 16, (n >> 8) & 255, n & 255];
};
/** A small square canvas with the universe's signature on it. Drawn once; nothing animates. */
export const emblem = (spec: UniverseSpec, size = 16): HTMLCanvasElement => {
  const cv = el('canvas', { class: 'rb-emblem', width: size, height: size, 'aria-hidden': 'true' });
  try {
    const g = cv.getContext('2d');
    if (!g) return cv;
    const sn = spec.serialNumber >>> 0;
    const sig = spec.signature;
    const pattern = sig && Number.isInteger(sig.pattern) ? sig.pattern & 15 : sn & 15;
    const acc = sig && Array.isArray(sig.accents) && sig.accents.length >= 3 ? sig.accents : [11, 13, 15];
    const turn = (sig?.turn ?? (sn >>> 4)) & 7;
    const n = Math.max(1, Math.min(4, sig?.repeat ?? 1 + ((sn >>> 7) & 3)));
    const cols = acc.map((i) => hexRgb(spec.palette[(i ?? 0) & 15]));
    const img = g.createImageData(size, size);
    const co = Math.cos((turn * PI) / 4), si = Math.sin((turn * PI) / 4);
    const f = PATTERNS[pattern]!;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const px = ((x + 0.5) / size) * 2 - 1, py = ((y + 0.5) / size) * 2 - 1;
      const u = px * co + py * si, v = py * co - px * si;
      const k = f(u, v, Math.hypot(u, v), Math.atan2(v, u), n, hash2(x, y, sn));
      if (!k) continue;
      const c = cols[k - 1]!, o = (y * size + x) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = k === 3 ? 255 : k === 1 ? 200 : 150;
    }
    g.putImageData(img, 0, 0);
  } catch { /* no canvas: the glyph stands alone */ }
  return cv;
};
