/** Universe serials. "No. 3F9A-77" <-> 24-bit number <-> Seed. Pure. */
import type { Seed, SerialNumber } from '@/contracts/seed';
import { child, makeSeed } from './hash';

/** Root of every universe seed. Changing this changes every universe: never do it. */
export const ROOT_SEED: Seed = makeSeed(0x5a110f00, 0x0b0c5e5d);

export const serialToSeed = (n: SerialNumber): Seed => child(child(ROOT_SEED, 'universe'), n);

export const formatSerial = (n: SerialNumber): string => {
  const h = (n >>> 0).toString(16).toUpperCase().padStart(6, '0');
  return `No. ${h.slice(0, 4)}-${h.slice(4)}`;
};

/** Accepts "No. 3F9A-77", "3F9A-77" or "3f9a77". */
export const parseSerial = (s: string): SerialNumber | null => {
  const m = /^\s*(?:no\.?\s*)?([0-9a-f]{4})-?([0-9a-f]{2})\s*$/i.exec(s);
  if (!m) return null;
  return parseInt(`${m[1]}${m[2]}`, 16);
};
