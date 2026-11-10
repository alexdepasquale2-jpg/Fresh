import type { DiveView } from './game';
import type { SystemSpec } from './system';
import type { SkyState, SkyPieceKind } from './sky';
import type { GridView, CivView, SurfaceEnv } from './sim';
import type { UniverseSpec } from './universe';
import type { Fx } from '@/core/fixed';

/**
 * The shared WebGL2 core (src/render/gl). Renderers draw through it.
 * Invariants: width/height are logical CSS px of the canvas; pixelScale is an
 * integer >= 1 capped by DPR; resources registered with onRestore are rebuilt
 * after context loss.
 */
export interface GlCore {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  width(): number;
  height(): number;
  pixelScale(): number;
  program(vertexSrc: string, fragmentSrc: string): WebGLProgram;
  /** Draw a fullscreen quad with the given program (attribute a_pos, -1..1). */
  quad(program: WebGLProgram): void;
  /** Create an R8 texture of palette indices. */
  indexTexture(w: number, h: number): WebGLTexture;
  uploadIndices(tex: WebGLTexture, w: number, h: number, data: Uint8Array, rows?: { y: number; h: number }): void;
  /** 16x1 RGBA palette texture from "#rrggbb" strings. */
  paletteTexture(palette: readonly string[]): WebGLTexture;
  /** Pixel-perfect blit of an index texture through a palette into dest rect (CSS px). */
  blit(index: WebGLTexture, palette: WebGLTexture, srcW: number, srcH: number, dest: { x: number; y: number; w: number; h: number }): void;
  clear(hex: string): void;
  onRestore(cb: () => void): () => void;
  lost(): boolean;
}

/** Common renderer lifecycle. draw() must allocate nothing in the hot path. */
export interface Renderer<V> {
  init(core: GlCore): void;
  draw(view: V, dtMs: number): void;
  dispose(): void;
}

export interface DiveRenderView {
  readonly dive: DiveView;
  readonly pulse: Fx;
  /** 0..8, drives the vignette. */
  readonly lightPips: number;
}
export type DiveRenderer = Renderer<DiveRenderView>;

export interface SystemRenderView {
  readonly universe: UniverseSpec;
  readonly system: SystemSpec;
  readonly skies: readonly SkyState[];
  readonly selectedOrbit: number;
  readonly drag: { kind: SkyPieceKind; x: number; y: number; overOrbit: number } | null;
  readonly tick: number;
  readonly pulse: Fx;
  /** 0..1 how far the worlds' orbits have been pulled into one line by what they have built. */
  readonly align?: number;
  /** 0..1 star flare flash, decaying. */
  readonly flare?: number;
  /** Ripple at a touched point, 0..1 age. */
  readonly touch?: { x: number; y: number; age: number } | null;
}
export interface SystemRenderer extends Renderer<SystemRenderView> {
  /** Orbit index under a CSS px point, or -1. */
  orbitAt(x: number, y: number): number;
}

export interface PlanetRenderView {
  readonly universe: UniverseSpec;
  readonly grid: GridView;
  readonly civ: CivView;
  readonly env: SurfaceEnv;
  readonly sky: SkyState;
  readonly modifiers: import('./sky').SurfaceModifiers;
  readonly pulse: Fx;
  /** Camera: centre in grid cells and zoom (1 shows the whole world). Above ~1.5 the renderer draws sub-cell detail. */
  readonly view?: {
    cx: number; cy: number; zoom: number;
    /** First person: stand at column x, depth z (0 is the slice itself), looking along yaw (0 = +x) and pitch. */
    fp?: { x: number; z: number; yaw: number; pitch: number; bob?: number } | null;
  };
  /** 0.5..1 resolution multiplier for the expensive first-person pass (from Perf.resolutionScale()). */
  readonly quality?: number;
  /** CSS px rect to draw the surface into. */
  readonly rect: { x: number; y: number; w: number; h: number };
}
export type PlanetRenderer = Renderer<PlanetRenderView>;

export interface RoomRenderView {
  readonly kid: { x: number; y: number };
  readonly target: { x: number; y: number } | null;
  readonly pulse: Fx;
  readonly lightPips: number;
}
export interface RoomRenderer extends Renderer<RoomRenderView> {
  /** Where Mote is now (eased), CSS px. */
  mote(): { x: number; y: number };
}

export type DiveRendererFactory = () => DiveRenderer;
export type SystemRendererFactory = () => SystemRenderer;
export type PlanetRendererFactory = () => PlanetRenderer;
export type RoomRendererFactory = () => RoomRenderer;
