import { z } from 'zod';
import type { Seed, SerialNumber } from './seed';
import { SeedSchema, SerialNumberSchema } from './seed';
import { MaterialSchema, ReactionSchema } from './atlas';
import type { Atlas } from './atlas';

/**
 * Everything a universe IS. Pure function of its seed (and the atlas).
 * Invariants:
 * - seed = core/serial.serialToSeed(serialNumber); same serial, same spec, every device.
 * - palette has exactly 16 "#rrggbb" entries; index 0 is the darkest.
 * - materialTable/reactionTable are copied from one atlas law set (laws.id).
 */
export const UniverseSpecSchema = z.object({
  seed: SeedSchema,
  serialNumber: SerialNumberSchema,
  /** Display serial, "No. 3F9A-77". */
  serial: z.string().regex(/^No\. [0-9A-F]{4}-[0-9A-F]{2}$/),
  name: z.string().min(1).max(32),
  /** Glyph index 0..63 drawn in the Box slot. */
  glyph: z.number().int().min(0).max(63),
  laws: z.object({ id: z.string(), name: z.string(), tags: z.array(z.string()) }),
  palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/)).length(16),
  materialTable: z.array(MaterialSchema),
  reactionTable: z.array(ReactionSchema),
  /** Pulse frequency, milli-Hz. */
  pulseMilliHz: z.number().int().min(100).max(4000),
});
export type UniverseSpec = z.infer<typeof UniverseSpecSchema>;

export interface UniverseGen {
  fromSerial(serialNumber: SerialNumber): UniverseSpec;
  fromSeed(seed: Seed, serialNumber: SerialNumber): UniverseSpec;
}
export type UniverseGenFactory = (deps: { atlas: Atlas; names: NameGen }) => UniverseGen;

/**
 * Name grammar. Pure functions of a seed. Voice: "Ossuary Minor",
 * "Pallid Choir", "Tallow", "Saltmere", "Age of Tides".
 */
export interface NameGen {
  universe(seed: Seed): string;
  system(seed: Seed): string;
  planet(seed: Seed): string;
  village(seed: Seed): string;
  age(seed: Seed): string;
}
export type NameGenFactory = () => NameGen;
