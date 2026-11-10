/**
 * Shell plugins. Any file in src/app/plugins/*.ts that exports `plugin` is loaded at
 * boot, so cross-cutting features (transitions, the guide, the away report, quality
 * controls) each live in their own file and never edit main.ts.
 */
import type { AppContext, ScreenId } from '@/contracts/app';

/** One page in the hub menu (the ≡ button in the top corner). */
export interface MenuEntry {
  readonly id: string;
  readonly label: string;
  /** One line under the label in the menu list. */
  readonly hint?: string;
  /** Lower comes first. Default 50. */
  readonly order?: number;
  /** Short text shown on the entry (and lights the menu button) while non-null, e.g. "2 new". */
  badge?(): string | null;
  /** Build the page into `into`. Return a cleanup to run when the page is left. `close` shuts the whole menu. */
  render(into: HTMLElement, close: () => void): void | (() => void);
}

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
  /** The hub menu. Add a page here instead of building a floating button. */
  readonly menu: { add(entry: MenuEntry): void; open(id?: string): void; close(): void; isOpen(): boolean };
  /** A short notice at the top of the screen for about four seconds. `sfx: ''` is silent. */
  toast(text: string, opts?: { title?: string; sfx?: string }): void;
  /** A small JSON value kept in localStorage under `sallow-<key>`. Survives reloads; never throws. */
  store<T>(key: string, init: T): { get(): T; set(v: T): void };
}
export type Plugin = (shell: Shell) => void;

// Each plugin is its own chunk, fetched in parallel at boot, so the entry bundle stays small.
const mods = import.meta.glob<{ plugin?: Plugin }>('./plugins/*.ts');
/** Load every plugin, in file-name order. One that fails to load is skipped, never fatal. */
export const loadPlugins = async (): Promise<Plugin[]> => {
  const keys = Object.keys(mods).sort();
  const loaded = await Promise.all(keys.map((k) => mods[k]!().catch((e: unknown) => { console.error('plugin failed to load', k, e); return null; })));
  return loaded.map((m) => m?.plugin).filter((p): p is Plugin => typeof p === 'function');
};
