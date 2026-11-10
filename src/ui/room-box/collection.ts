// Collecting: what is held now, what has ever been held, and the sets that pay once.
import type { AppContext } from '@/contracts/app';
import type { BoxEntry } from '@/contracts/game';
import type { UniverseSpec } from '@/contracts/universe';
import type { SkyPieceKind } from '@/contracts/sky';
import type { MergeRecipe } from '@/contracts/merge';
import type { Char } from './character';
import { saveCollection } from './store';
import { lightWords, aPiece } from '@/ui/kit';
import type { Collection } from './store';

export interface Held { readonly slot: number; readonly e: BoxEntry; readonly spec: UniverseSpec; readonly ch: Char; readonly bond: number }

/** The temperaments a universe may have, for the checklist. One not listed here is simply added when met. */
export const TEMPERS = ['placid', 'restless', 'watchful', 'hungry', 'shy', 'proud', 'mournful', 'patient', 'feral', 'kind', 'cold', 'dreaming'] as const;

export const lawSets = (c: AppContext): { id: string; name: string }[] => {
  try {
    return (c.atlas.lawSets ?? []).map((l) => ({ id: String(l.id), name: String(l.name ?? l.id) }));
  } catch { return []; }
};
export const recipesOf = (c: AppContext): readonly MergeRecipe[] => {
  try { return c.merger.recipes?.() ?? []; } catch { return []; }
};

/** Count what is in the Box into the collection. Returns true when something was new. */
export const noteHeld = (col: Collection, held: readonly Held[]): boolean => {
  let changed = false;
  for (const h of held) {
    if (!col.laws.includes(h.spec.laws.id)) { col.laws.push(h.spec.laws.id); changed = true; }
    if (col.serials.includes(h.spec.serialNumber)) continue;
    col.serials.push(h.spec.serialNumber);
    col.seen[h.ch.rarity] = (col.seen[h.ch.rarity] ?? 0) + 1;
    changed = true;
  }
  if (changed) saveCollection(col);
  return changed;
};

export interface SetDef {
  readonly id: string;
  readonly name: string;
  readonly says: string;
  readonly need: (c: AppContext) => number;
  readonly have: (held: readonly Held[], col: Collection) => number;
  /** Glow points (1000 = one pip). */
  readonly glow?: number;
  readonly piece?: SkyPieceKind;
}
const distinct = <T>(xs: readonly T[]) => new Set(xs).size;
export const SETS: readonly SetDef[] = [
  { id: 'three-rarities', name: 'Three depths', says: 'Hold universes of three different rarities at once.', need: () => 3, have: (h) => distinct(h.map((x) => x.ch.rarity)), glow: 400 },
  { id: 'four-laws', name: 'Four kinds of law', says: 'Hold four different law sets at once.', need: () => 4, have: (h) => distinct(h.map((x) => x.spec.laws.id)), piece: 'moon' },
  { id: 'made', name: 'Made, not found', says: 'Hold a universe you made by merging.', need: () => 1, have: (h) => h.filter((x) => x.ch.lineage).length, piece: 'dust' },
  { id: 'kept', name: 'Kept', says: 'Let one of them come to know your hand: a bond of 30.', need: () => 30, have: (h) => h.reduce((m, x) => Math.max(m, x.bond), 0), glow: 600 },
  { id: 'six-tempers', name: 'A mixed company', says: 'Hold six different temperaments at once.', need: () => 6, have: (h) => distinct(h.map((x) => x.ch.temperament).filter(Boolean)), piece: 'comet' },
  { id: 'rare-shelf', name: 'A rare shelf', says: 'Hold three that are rare or better.', need: () => 3, have: (h) => h.filter((x) => x.ch.tier >= 2).length, piece: 'belt', glow: 300 },
  { id: 'three-pages', name: 'Three pages', says: 'Find three named recipes by merging.', need: () => 3, have: (_h, col) => col.found.length, piece: 'rings' },
  { id: 'every-law', name: 'Every law', says: 'Hold every law set at once.', need: (c) => Math.max(1, lawSets(c).length), have: (h) => distinct(h.map((x) => x.spec.laws.id)), piece: 'sun', glow: 1000 },
  { id: 'every-mood', name: 'Every mood', says: 'Hold one of each temperament at once.', need: () => TEMPERS.length, have: (h) => distinct(h.map((x) => x.ch.temperament).filter(Boolean)), piece: 'sun', glow: 2000 },
];
export const rewardText = (s: SetDef): string =>
  [s.glow ? lightWords(s.glow) : '', s.piece ? aPiece(s.piece) : ''].filter(Boolean).join(' and ');

/** Pay a finished set, once. Returns false if it was already paid or is not finished. */
export const claim = (c: AppContext, s: SetDef, held: readonly Held[], col: Collection): boolean => {
  if (col.paid.includes(s.id) || s.have(held, col) < s.need(c)) return false;
  col.paid.push(s.id);
  saveCollection(col);
  if (s.glow) { c.light.addGlow(s.glow); c.bus.emit('light:changed', { pips: c.light.view().pips }); }
  if (s.piece) c.sky.grant(s.piece, 1);
  c.persist();
  return true;
};
