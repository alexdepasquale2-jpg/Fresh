// The one place the town's heavy modules are asked for. Everything here is loaded on demand, once:
// the world model (src/game/town), the screen, the binding to the real game, and the map painter.
import type { Screen } from '@/contracts/app';
import type { AppContext } from '@/contracts/app';
import type { Town } from '@/game/town';

export interface TownMods {
  game: typeof import('@/game/town');
  town: Town;
  createScreen: () => Screen;
  bindTown: (c: AppContext) => void;
  paintMap: (canvas: HTMLCanvasElement, town: Town, k?: number, all?: boolean) => void;
}
let p: Promise<TownMods> | null = null, got: TownMods | null = null;
const subs: ((m: TownMods) => void)[] = [];
/** Load the town (once). */
export const loadTown = (): Promise<TownMods> => p ?? (p = Promise.all([import('@/game/town'), import('./screen'), import('./facts'), import('./render')]).then(([game, screen, facts, render]) => {
  got = { game, town: game.town(), createScreen: screen.createScreen, bindTown: facts.bindTown, paintMap: render.paintMap };
  for (const cb of subs.splice(0)) { try { cb(got); } catch { /* a listener must not stop the load */ } }
  return got;
}));
/** The loaded town, or null when nobody has gone out yet. */
export const loaded = (): TownMods | null => got;
/** Run once the town exists (now, if it already does). */
export const whenLoaded = (cb: (m: TownMods) => void): void => { if (got) cb(got); else subs.push(cb); };
