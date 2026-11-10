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
export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'mythic'] as const;
export const RaritySchema = z.enum(RARITIES);
export type Rarity = z.infer<typeof RaritySchema>;

/**
 * Small numeric leanings a universe has, for any unit that wants to read them. All optional, all
 * integers, 0 = no leaning. Units are percent: +10 starDensity = about 10% more stars.
 * Nothing is obliged to honour them; a unit that does should treat a missing field as 0.
 */
export const UniverseModifiersSchema = z.object({
  /** More (or fewer) stars per fold. */
  starDensity: z.number().int().optional(),
  /** Calmer climate: fewer storms, slower swings. Negative is wilder. */
  climateCalm: z.number().int().optional(),
  /** Brighter planet glow, so more Light from tended worlds. */
  glow: z.number().int().optional(),
  /** Stronger tides and water. */
  tide: z.number().int().optional(),
  /** Faster growth of living things. */
  growth: z.number().int().optional(),
  /** Deeper bottom: more folds before the floor. */
  depth: z.number().int().optional(),
  /** Kinder odds on finds, flickers and catches. */
  luck: z.number().int().optional(),
  /** Strength its creatures bring to a battle. */
  might: z.number().int().optional(),
  /** Hardiness of its creatures and villages. */
  ward: z.number().int().optional(),
  /** Faster (or slower) pulse and years. */
  tempo: z.number().int().optional(),
  /** How readily its people come to believe. */
  faith: z.number().int().optional(),
});
export type UniverseModifiers = z.infer<typeof UniverseModifiersSchema>;

/** One trait of a universe: a name, a line in the game's voice, and what it does. */
export const UniverseTraitSchema = z.object({
  id: z.string(),
  name: z.string(),
  says: z.string(),
  mods: UniverseModifiersSchema,
  /** Dominant traits pass to a merged child more readily than recessive ones. Missing = recessive. */
  dominant: z.boolean().optional(),
  /** Where it came from when it is not the universe's own: a parent, a mutation, a named recipe. */
  source: z.enum(['own', 'inherited', 'mutation', 'recipe']).optional(),
});
export type UniverseTrait = z.infer<typeof UniverseTraitSchema>;

export const UNIVERSE_PATTERNS = ['rings', 'bars', 'spiral', 'lattice', 'scatter', 'eye', 'veil', 'tide', 'thorn', 'weave', 'stair', 'halo', 'seam', 'moth', 'ember', 'well'] as const;
/** How to draw a universe at a glance. Indices point into its own palette. */
export const UniverseSignatureSchema = z.object({
  /** 0..15, an index into UNIVERSE_PATTERNS. */
  pattern: z.number().int().min(0).max(15),
  patternName: z.string(),
  /** Three palette indices (0..15): main, second, spark. */
  accents: z.array(z.number().int().min(0).max(15)).length(3),
  /** 0..7 turns of 45 degrees, and 1..4 repeats, for whatever draws the pattern. */
  turn: z.number().int().min(0).max(7),
  repeat: z.number().int().min(1).max(4),
});
export type UniverseSignature = z.infer<typeof UniverseSignatureSchema>;

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
  /* ---- Character. All optional, all pure functions of the seed, added without changing anything above. ---- */
  /** common 60%, uncommon 25%, rare 10%, epic 4%, mythic 1%. */
  rarity: RaritySchema.optional(),
  /** One word for how it behaves: "placid", "watchful". */
  temperament: z.string().optional(),
  /** Two traits, or three for rare and above. */
  traits: z.array(UniverseTraitSchema).optional(),
  /** Sum of the traits' mods (plus a little from rarity and temperament). */
  modifiers: UniverseModifiersSchema.optional(),
  /** One line on where it came from. */
  origin: z.string().optional(),
  /** One paragraph in the game's voice. */
  description: z.string().optional(),
  motto: z.string().optional(),
  signature: UniverseSignatureSchema.optional(),
  /** 0..7: the phonetic family its names lean to (see NameGen.family). */
  nameFamily: z.number().int().min(0).max(7).optional(),
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
  /* ---- Optional, larger grammars. Outputs of the five methods above never change. ---- */
  /** Number of phonetic families (8). */
  families?(): number;
  /** The phonetic family (0..7) a universe seed leans to. */
  family?(universeSeed: Seed): number;
  /** A person's name. With a family, it sounds related to others of that family. */
  person?(seed: Seed, family?: number): string;
  /** A creed: "The Quiet Rule", "Keepers of the Low Lamp". */
  creed?(seed: Seed, family?: number): string;
  /** A wider universe name grammar than universe(). */
  universeWide?(seed: Seed): string;
  /** Wider grammars that sound alike inside one family. */
  systemIn?(seed: Seed, family: number): string;
  planetIn?(seed: Seed, family: number): string;
  villageIn?(seed: Seed, family: number): string;
  ageWide?(seed: Seed): string;
  /** `count` names for one system (or planet, or village), no two near-alike. */
  planetSet?(systemSeed: Seed, count: number, family?: number): string[];
  villageSet?(planetSeed: Seed, count: number, family?: number): string[];
  peopleSet?(villageSeed: Seed, count: number, family?: number): string[];
  /** True when two names are too alike to sit in one system (same opening, or one letter apart). */
  nearAlike?(a: string, b: string): boolean;
}
export type NameGenFactory = () => NameGen;
