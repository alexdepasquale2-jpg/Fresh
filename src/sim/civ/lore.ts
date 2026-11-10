// Names for the wider world of sim/civ: figures, creeds, works, late eras.
// figName and creedName are copied, identically, in src/sim/chronicle/lore.ts (units may
// not import each other). Change both, or the village list and the chronicle disagree.
import type { Belief } from '@/contracts/sim';
import type { Seed } from '@/contracts/seed';
import { child, mix, seedToU32 } from '@/core/hash';

const NA = ['Or', 'Wen', 'Tam', 'Fen', 'Is', 'Mar', 'Hal', 'Sel', 'Bry', 'Cor', 'Ed', 'Lin', 'Oss', 'Ru', 'Thess', 'Ane', 'Dov', 'Kes', 'Mir', 'Yar'];
const NB = ['la', '', 'sin', 'na', 'ric', 'wen', 'low', 'a', 'en', 'ith', 'o', 'ra', 'el', 'is', '', 'an'];
const FA = ['Ash', 'Salt', 'Reed', 'Mere', 'Stone', 'Wick', 'Low', 'Marsh', 'Ember', 'Gull', 'Thorn', 'Tarn'];
const FB = ['low', 'mere', 'wick', 'by', 'ley', 'field', 'hallow', 'ward'];
/** who = ordinal + 4096 * house. An heir keeps the house and so the second name. */
export const figName = (seed: Seed, who: number): { first: string; house: string; full: string } => {
  const ord = who % 4096, house = Math.floor(who / 4096);
  const h = seedToU32(mix(child(seed, 'figure-name'), ord));
  const hf = seedToU32(mix(child(seed, 'figure-house'), house));
  const a = NA[h % NA.length]!;
  let b = NB[(h >>> 8) % NB.length]!;
  if (!b && a.length <= 2) b = 'a';
  const fa = FA[hf % FA.length]!;
  let fb = FB[(hf >>> 8) % FB.length]!;
  if (fa.toLowerCase() === fb) fb = 'ward';
  return { first: a + b, house: fa + fb, full: `${a + b} ${fa + fb}` };
};

const CA = ['Low', 'Quiet', 'Long', 'Bright', 'Patient', 'Hollow', 'Ninth', 'Unbroken', 'Pale', 'Kept', 'Hidden', 'Even'];
const CN: Record<Belief, string[]> = {
  none: ['Way'],
  sun: ['Noon', 'Dawn', 'Gold Eye', 'Day'],
  moon: ['Crescent', 'Night Eye', 'White Road', 'Tide-Lamp'],
  sea: ['Tide', 'Deep', 'Salt', 'Shore'],
  stone: ['Fall', 'Crater', 'Iron Rain', 'Stone'],
  fire: ['Ember', 'Hearth', 'Ash', 'Flame'],
  sky: ['Storm', 'Thunder', 'Wind', 'Cloud'],
};
export const creedName = (seed: Seed, id: number, belief: Belief): string => {
  const h = seedToU32(mix(child(seed, 'creed-name'), id));
  const n = CN[belief] ?? CN.none;
  return `the ${CA[h % CA.length]!} ${n[(h >>> 8) % n.length]!}`;
};

/** Great works, by bit index in a village's works mask. */
export const WORKS = ['Great Granary', 'Sea Wall', 'High Shrine', 'Great Bell', 'Lighthouse', 'Star House', 'Sky Dock'];
