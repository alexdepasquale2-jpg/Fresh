import { z } from 'zod';
import type { SkyRule, ModifierKey } from './atlas';
import { SkyPieceKindSchema } from './atlas';
import type { PlanetSpec, SystemSpec } from './system';

export { SkyPieceKindSchema };
export type SkyPieceKind = z.infer<typeof SkyPieceKindSchema>;
export const SKY_PIECE_KINDS: readonly SkyPieceKind[] = ['comet', 'moon', 'belt', 'sun', 'rings', 'dust'];

/**
 * The sky of one planet: the pieces placed on its orbit.
 * Invariants: at most 4 pieces; order is placement order; planetKey is the
 * planet seed as hex (core/hash seedToHex).
 */
/** Cosmic events thrown at a planet from the solar system; they land when it is next watched. */
export const CosmicEventSchema = z.enum(['flare', 'shower', 'eclipse', 'panspermia', 'comet-strike']);
export type CosmicEvent = z.infer<typeof CosmicEventSchema>;
export const SkyStateSchema = z.object({
  planetKey: z.string().regex(/^[0-9a-f]{16}$/),
  pieces: z.array(SkyPieceKindSchema).max(4),
  /** Orbit nudged by the player: negative is closer to the star (hotter), positive further (colder). -3..3. */
  drift: z.number().int().min(-3).max(3).optional(),
  /** Things its people have put into orbit: lanterns, then stations. 0..12. */
  built: z.number().int().min(0).max(12).optional(),
  /** Cosmic events waiting to land. */
  queued: z.array(CosmicEventSchema).max(8).optional(),
});
export type SkyState = z.infer<typeof SkyStateSchema>;

/** What the sky does to the surface. Each value is an integer in -100..100; 0 is neutral. */
export type SurfaceModifiers = Readonly<Record<ModifierKey, number>>;
export const NEUTRAL_MODIFIERS: SurfaceModifiers = Object.freeze({
  tide: 0, nightLight: 0, impacts: 0, seasons: 0, dimming: 0, warmth: 0, dust: 0,
});

/**
 * The sky-to-surface rule table. Pure.
 * Invariants: under 40 rules; effects() sums the effects of every matching
 * rule and clamps each key to -100..100; explain() returns the `says` of each
 * matching rule in table order.
 */
export interface SkyRules {
  readonly rules: readonly SkyRule[];
  effects(sky: SkyState, planet: PlanetSpec): SurfaceModifiers;
  explain(sky: SkyState, planet: PlanetSpec): readonly string[];
}
export type SkyRulesFactory = () => SkyRules;

export type PlaceResult = { ok: true; sky: SkyState } | { ok: false; reason: 'none-left' | 'sky-full' | 'bad-orbit' };

/** The player's sky pieces and every planet's sky. Mutable game state. */
export interface SkyGame {
  inventory(): Readonly<Record<SkyPieceKind, number>>;
  grant(kind: SkyPieceKind, n: number): void;
  place(kind: SkyPieceKind, system: SystemSpec, orbitIndex: number): PlaceResult;
  remove(planetKey: string, pieceIndex: number): void;
  /** Push a planet's orbit closer (-1) or further (+1). Clamped to -3..3. */
  nudge(planetKey: string, delta: number): SkyState;
  /** Throw a cosmic event at a planet. */
  queue(planetKey: string, event: CosmicEvent): SkyState;
  /** Its people launched n more things into orbit. */
  build(planetKey: string, n: number): SkyState;
  /** Take (and clear) the events waiting for a planet. */
  takeQueued(planetKey: string): CosmicEvent[];
  skyOf(planet: PlanetSpec): SkyState;
  snapshot(): { inventory: Record<SkyPieceKind, number>; skies: SkyState[] };
  restore(s: { inventory: Record<SkyPieceKind, number>; skies: SkyState[] }): void;
}
export type SkyGameFactory = () => SkyGame;
