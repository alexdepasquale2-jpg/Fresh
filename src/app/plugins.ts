/**
 * Shell plugins. Any file in src/app/plugins/*.ts that exports `plugin` is loaded at
 * boot, so cross-cutting features (transitions, the guide, the away report, quality
 * controls) each live in their own file and never edit main.ts.
 */
import type { AppContext, ScreenId } from '@/contracts/app';

export interface Shell {
  readonly ctx: AppContext;
  /** #app: holds the GL canvas and the screen layer. Overlays can be appended here. */
  readonly host: HTMLElement;
  /** The <main class="screen"> DOM layer of the current screen. */
  readonly layer: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  /** The screen showing now (null before the first navigation). */
  current(): ScreenId | null;
  /** True when a save was loaded at boot, with how long the player was away. */
  readonly resumed: { awayMs: number } | null;
  /** Called every frame after the screen's own frame. */
  onFrame(cb: (dtMs: number) => void): void;
  /** Called after every navigation. */
  onNavigate(cb: (from: ScreenId | null, to: ScreenId) => void): void;
  /**
   * Take over how screens change. `swap` does the real unmount/mount and must be
   * called exactly once (synchronously or later). Only one plugin may set this.
   */
  setTransition(fn: (from: ScreenId | null, to: ScreenId, swap: () => void) => void): void;
}
export type Plugin = (shell: Shell) => void;

const mods = import.meta.glob<{ plugin?: Plugin }>('./plugins/*.ts', { eager: true });
export const plugins: Plugin[] = Object.keys(mods).sort().map((k) => mods[k]!.plugin).filter((p): p is Plugin => typeof p === 'function');
