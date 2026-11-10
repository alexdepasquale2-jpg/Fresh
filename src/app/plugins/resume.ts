/**
 * Resume: a phone drops background tabs all the time. If the game is reopened within a
 * few minutes, go back to where the player was (the Box, a star's system, a world,
 * Outside) instead of the bedroom. A dive or a battle cannot be resumed mid-way, so
 * those return to the screen that leads to them, with a word from Mote.
 */
import type { ScreenId } from '@/contracts/app';
import type { StarRef } from '@/contracts/fold';
import type { Plugin } from '../plugins';

interface Where { screen: ScreenId; serial: number; star: StarRef | null; planetIndex: number; at: number }
const RESUME_WITHIN_MS = 20 * 60 * 1000;
/** Where to land for each screen left. */
const LAND: Partial<Record<ScreenId, ScreenId>> = { box: 'box', system: 'system', planet: 'planet', outside: 'outside', dive: 'box', battle: 'outside', mirror: 'box', town: 'town' };

export const plugin: Plugin = (shell) => {
  const { ctx } = shell;
  const store = shell.store<Where | null>('resume', null);
  const before = store.get();
  let booted = false;
  shell.onNavigate((_from, to) => {
    try {
      if (!booted) {
        booted = true;
        // Only when a save was loaded, only soon after, and never over the away report.
        if (to === 'bedroom' && shell.resumed && before && Date.now() - before.at < RESUME_WITHIN_MS && shell.resumed.awayMs < RESUME_WITHIN_MS) {
          const land = LAND[before.screen];
          const slot = ctx.box.slots().findIndex((s) => s?.serialNumber === before.serial);
          if (land && slot >= 0) {
            ctx.box.select(slot);
            const u = ctx.universes.fromSerial(before.serial);
            ctx.selection.universe = u;
            ctx.selection.star = before.star;
            ctx.selection.system = before.star ? ctx.systems.fromStar(before.star, u) : null;
            ctx.selection.planetIndex = before.planetIndex;
            window.setTimeout(() => {
              if (shell.current() !== 'bedroom' || document.querySelector('.away, .away-note')) return;
              ctx.go(land);
              if (before.screen === 'dive') shell.toast('We were falling. The fall does not keep. The box does.', { title: 'Mote', sfx: '' });
              else if (before.screen === 'battle') shell.toast('The fight did not keep. They are still out here.', { title: 'Mote', sfx: '' });
            }, 400);
          }
        }
        return;
      }
      const u = ctx.selection.universe;
      if (!u) { store.set(null); return; }
      store.set({ screen: to, serial: u.serialNumber, star: ctx.selection.star, planetIndex: ctx.selection.planetIndex, at: Date.now() });
    } catch { /* resuming is a kindness, never a failure */ }
  });
  // Keep the timestamp fresh while playing, so "soon after" is measured from when the tab was left.
  window.setInterval(() => { const w = store.get(); if (w && document.visibilityState === 'visible') store.set({ ...w, at: Date.now() }); }, 20000);
};
