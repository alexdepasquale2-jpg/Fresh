import { z } from 'zod';
import type { Seed } from './seed';
import { SeedSchema } from './seed';
import type { StarRef } from './fold';
import type { UniverseSpec, NameGen } from './universe';

export const GRID_W = 236;
export const GRID_H = 200;
export const CHUNK = 32;

export const PlanetSpecSchema = z.object({
  seed: SeedSchema,
  name: z.string(),
  terrain: z.object({
    /** 0..255, share of the grid under water. */
    seaLevel: z.number().int().min(0).max(255),
    /** 0..255 */
    roughness: z.number().int().min(0).max(255),
    biome: z.enum(['ash', 'salt', 'moss', 'tallow', 'glass']),
  }),
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
}

/** Invariants: 1..4 orbits; planets.length === orbits.length; pure function of the StarRef. */
export interface SystemSpec {
  readonly seed: Seed;
  readonly name: string;
  readonly star: StarRef;
  readonly orbits: readonly Orbit[];
  readonly planets: readonly PlanetSpec[];
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
