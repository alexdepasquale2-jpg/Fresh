import { z } from 'zod';

/**
 * The curated rule atlas: hand-written law sets that give universes their
 * physics. Emergence comes from these tables, never from runtime AI.
 * Invariants: every atlas file under /atlas validates against these schemas;
 * material ids are unique within a law set and id 0 is always "empty".
 */

export const MaterialKindSchema = z.enum(['empty', 'solid', 'powder', 'liquid', 'gas', 'fire', 'life']);
export type MaterialKind = z.infer<typeof MaterialKindSchema>;

export const MaterialSchema = z.object({
  /** 0..255; 0 is reserved for empty. */
  id: z.number().int().min(0).max(255),
  name: z.string().min(1).max(24),
  kind: MaterialKindSchema,
  /** Palette index 0..15 into UniverseSpec.palette. */
  color: z.number().int().min(0).max(15),
  /** Heavier sinks through lighter liquids/gases. 0..255. */
  density: z.number().int().min(0).max(255),
  /** Optional: a powder or liquid that falls upward. */
  rises: z.boolean().optional(),
  /** Optional: a powder that flows like a liquid by night or by day. */
  flows: z.enum(['night', 'day']).optional(),
  /** Optional 1..100: how readily the wind carries it sideways. */
  drift: z.number().int().min(1).max(100).optional(),
  /** Optional 2..16: a thick liquid spreads sideways only one tick in this many. */
  viscosity: z.number().int().min(2).max(16).optional(),
});
export type Material = z.infer<typeof MaterialSchema>;

/** Integer probability num/den evaluated with core/hash only. */
export const ChanceSchema = z.tuple([z.number().int().min(0), z.number().int().min(1)]);

/** Surface modifier keys a reaction may require. See contracts/sky.ts. */
export const ModifierKeySchema = z.enum(['tide', 'nightLight', 'impacts', 'seasons', 'dimming', 'warmth', 'dust']);
export type ModifierKey = z.infer<typeof ModifierKeySchema>;

const RangeSchema = (lo: number, hi: number) =>
  z.object({ min: z.number().int().min(lo).max(hi).optional(), max: z.number().int().min(lo).max(hi).optional() });

export const ReactionSchema = z.object({
  /** Material name of the cell. */
  a: z.string(),
  /** Material name of a 4-neighbour, or "*" for any. */
  b: z.string(),
  becomesA: z.string(),
  /** A material name, or "*" to leave the neighbour as it is (useful when b is "*"). */
  becomesB: z.string(),
  /** Per-tick chance when a meets b. */
  chance: ChanceSchema,
  /** Only fires while modifier[key] >= min (or <= max). */
  needs: z
    .object({ key: ModifierKeySchema, min: z.number().int().optional(), max: z.number().int().optional() })
    .optional(),
  /** Optional gates below; a reaction with none of them behaves exactly as before. */
  /** Only where the coarse temperature is in range (0..255; 128 mild, <100 freezing, >200 burning). */
  temp: RangeSchema(0, 255).optional(),
  /** day: under a strong sun. night: sun down. lit: sun or a bright night sky. dark: neither. */
  light: z.enum(['day', 'night', 'lit', 'dark']).optional(),
  /** Only at this depth, as a percent of the grid height from the top (0 sky .. 100 bedrock). */
  depth: RangeSchema(0, 100).optional(),
  /** Where b must sit: above a, below a, or beside it. */
  dir: z.enum(['up', 'down', 'side']).optional(),
  /** Only while the wind strength (0..100) is in range. */
  wind: RangeSchema(0, 100).optional(),
  /** Only while the cloud over this column (0..255) is in range. */
  humid: RangeSchema(0, 255).optional(),
  /** Heat given to (or taken from) the air each time it fires. */
  heat: z.number().int().min(-60).max(60).optional(),
  /** Moisture given to (or taken from) the cloud above each time it fires. */
  vapour: z.number().int().min(-40).max(40).optional(),
});
export type Reaction = z.infer<typeof ReactionSchema>;

export const LawSetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Display name, e.g. "Cold fire". */
  name: z.string().min(1).max(32),
  /** Law tags shown on the Box detail, e.g. ["COLD FIRE", "SLOW TIME"]. 1..4. */
  tags: z.array(z.string().min(1).max(16)).min(1).max(4),
  /** Pulse frequency in milli-Hz (e.g. 800 = 0.8 Hz). */
  pulseMilliHz: z.number().int().min(100).max(4000),
  /** Optional hue hint for the palette, 0..359. */
  hue: z.number().int().min(0).max(359).optional(),
  materials: z.array(MaterialSchema).min(2).max(32),
  reactions: z.array(ReactionSchema).max(64),
});
export type LawSet = z.infer<typeof LawSetSchema>;

export const SkyPieceKindSchema = z.enum(['comet', 'moon', 'belt', 'sun', 'rings', 'dust']);

/** Partial modifier deltas, each clamped by the consumer to -100..100. */
export const ModifierDeltaSchema = z.partialRecord(ModifierKeySchema, z.number().int().min(-100).max(100));

/**
 * One sky-to-surface rule. `when` lists 1 or 2 piece kinds that must all be
 * present in the planet's sky. `says` is the plain sentence a player could
 * have guessed ("A moon pulls the seas into tides").
 */
export const SkyRuleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  when: z.array(SkyPieceKindSchema).min(1).max(2),
  effects: ModifierDeltaSchema,
  says: z.string().min(1).max(80),
});
export type SkyRule = z.infer<typeof SkyRuleSchema>;

export const AtlasSchema = z.object({
  version: z.literal(1),
  lawSets: z.array(LawSetSchema).min(1),
});
export type Atlas = z.infer<typeof AtlasSchema>;
