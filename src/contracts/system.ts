import { z } from 'zod';
import type { Seed } from './seed';
import { SeedSchema } from './seed';
import type { StarRef } from './fold';
import type { UniverseSpec, NameGen } from './universe';

export const GRID_W = 236;
export const GRID_H = 200;
export const CHUNK = 32;

export const StarStateSchema = z.enum(['steady', 'variable', 'flare', 'dying', 'remnant']);
/** What a star is doing, beyond its kind. Absent reads as 'steady'. */
export type StarState = z.infer<typeof StarStateSchema>;

/** A moon a world was born with. */
export const NaturalMoonSchema = z.object({
  /** 0..255 apparent size. */
  size: z.number().int().min(0).max(255),
  /** 0..5 which look (bone, ash, honey, ice, rust, jade). */
  look: z.number().int().min(0).max(5),
  /** Crossings of the sky per year; negative runs backwards. */
  turns: z.number().int().min(-12).max(12),
});
export type NaturalMoon = z.infer<typeof NaturalMoonSchema>;

/** The natural features of a system as one planet sees them. Every field optional; absent is none. */
export const NaturalSkySchema = z.object({
  moons: z.array(NaturalMoonSchema).max(3).optional(),
  rings: z.boolean().optional(),
  /** A natural asteroid belt runs next to this orbit. */
  belt: z.boolean().optional(),
  /** The system keeps a debris disc. */
  disc: z.boolean().optional(),
  /** A companion sun: 'close' rides beside the first, 'far' is a bright star of the night. */
  companion: z.enum(['close', 'far']).optional(),
  /** A long-period comet returns here. */
  comet: z.boolean().optional(),
  /** A captured rogue world crosses on a tilted orbit. */
  rogue: z.boolean().optional(),
  star: StarStateSchema.optional(),
});
export type NaturalSky = z.infer<typeof NaturalSkySchema>;

export const PlanetSpecSchema = z.object({
  seed: SeedSchema,
  name: z.string(),
  terrain: z.object({
    /** 0..255, share of the grid under water. */
    seaLevel: z.number().int().min(0).max(255),
    /** 0..255 */
    roughness: z.number().int().min(0).max(255),
    biome: z.enum(['ash', 'salt', 'moss', 'tallow', 'glass']),
    /** The shape of the land. Absent reads as 'continents'. */
    form: z.enum(['continents', 'archipelago', 'pangaea', 'canyon', 'crater', 'iceshell', 'highlands', 'ocean']).optional(),
    /** 0..255, 128 is ordinary. Low gravity lets the land stand tall and jagged; high gravity presses it flat. */
    gravity: z.number().int().min(0).max(255).optional(),
    /** One face always to the star: a baked side, a frozen side, a living band between. */
    locked: z.boolean().optional(),
    /** It sits where its star's warmth is kind. */
    habitable: z.boolean().optional(),
  }),
  /** What this world's sky holds by birth, before the player hangs anything. Pure function of the star. */
  sky: NaturalSkySchema.optional(),
});
/** A planet. Invariant: pure function of (system seed, orbit index). */
export type PlanetSpec = z.infer<typeof PlanetSpecSchema>;

/** An orbit around the star. Index 0 is innermost. Holds exactly one planet. */
export interface Orbit {
  readonly index: number;
  /** Ring radius in layout units 1..4. */
  readonly ring: number;
  /** Index into SystemSpec.planets. */
  readonly planet: number;
  /** Ticks per revolution at 1x. */
  readonly periodTicks: number;
  /** Locked in resonance with the next orbit inward: this world goes round [1] times while that one goes round [0]. */
  readonly resonance?: readonly [number, number];
  /** Inside the star's habitable zone. */
  readonly habitable?: boolean;
}

/** A second star. 'close' pairs circle each other inside the first orbit; 'far' ones ride beyond the last. */
export interface CompanionStar {
  readonly kind: StarRef['kind'];
  /** 0..255 */
  readonly heat: number;
  readonly close: boolean;
  readonly periodTicks: number;
}
/** A natural asteroid belt just outside orbit `after` (-1: inside the first orbit). */
export interface NaturalBelt {
  readonly after: number;
  /** 0..255 */
  readonly density: number;
}
/** A captured world on a tilted, stretched orbit. It holds no people and takes no pieces. */
export interface RogueWorld {
  readonly name: string;
  readonly biome: PlanetSpec['terrain']['biome'];
  /** Degrees its path leans, -70..70. */
  readonly tilt: number;
  /** 0..255 how stretched its path is. */
  readonly stretch: number;
  readonly periodTicks: number;
}
/** A comet on a long period. It is near the star for a short season of each return. */
export interface LongComet {
  readonly name: string;
  readonly periodTicks: number;
  /** Degrees of its path's long axis. */
  readonly axis: number;
  /** 0..255 where on its path it starts. */
  readonly phase: number;
}

/** Invariants: 1..4 orbits; planets.length === orbits.length; pure function of the StarRef. */
export interface SystemSpec {
  readonly seed: Seed;
  readonly name: string;
  readonly star: StarRef;
  readonly orbits: readonly Orbit[];
  readonly planets: readonly PlanetSpec[];
  /** Natural features. All optional, all pure functions of the StarRef; none adds an orbit the player can use. */
  readonly starState?: StarState;
  readonly companion?: CompanionStar;
  /** At most 2. */
  readonly belts?: readonly NaturalBelt[];
  /** A debris disc beyond the last orbit: density 0..255. */
  readonly disc?: { readonly density: number };
  readonly rogue?: RogueWorld;
  readonly comet?: LongComet;
}
export interface SystemGen {
  fromStar(star: StarRef, universe: UniverseSpec): SystemSpec;
}
export type SystemGenFactory = (deps: { names: NameGen }) => SystemGen;

export interface VillageSite {
  readonly x: number;
  readonly y: number;
}
/**
 * Initial surface. Invariant: cells.length === GRID_W * GRID_H, each a
 * material id from universe.materialTable; row-major, y = 0 at the top.
 */
export interface PlanetSurface {
  readonly cells: Uint8Array;
  readonly villageSites: readonly VillageSite[];
}
export interface PlanetGen {
  surface(planet: PlanetSpec, universe: UniverseSpec): PlanetSurface;
}
export type PlanetGenFactory = () => PlanetGen;
