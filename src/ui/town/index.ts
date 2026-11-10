// The town screen (id `town`), thin: the world and its renderer are a separate chunk, fetched the first
// time the street is entered. Until it arrives there is one line of text.
import type { ScreenFactory, Screen, AppContext } from '@/contracts/app';
import { el } from '@/ui/kit';
import { loadTown } from './lazy';

export const factory = (): { town: ScreenFactory } => ({
  town: () => {
    let inner: Screen | null = null, alive = false, wait: HTMLElement | null = null;
    return {
      id: 'town',
      mount: (root: HTMLElement, ctx: AppContext) => {
        alive = true;
        wait = el('p', { class: 'k-narration', 'data-id': 'town-loading', style: 'margin:auto;text-align:center' }, 'The street…');
        root.append(wait);
        loadTown().then((m) => {
          if (!alive) return;
          wait?.remove(); wait = null;
          inner = m.createScreen(); inner.mount(root, ctx);
        }).catch(() => { if (wait) wait.textContent = 'The street will not come. Go back in and try the door again.'; });
      },
      frame: (dt: number) => { inner?.frame(dt); },
      unmount: () => { alive = false; inner?.unmount(); inner = null; wait = null; },
    };
  },
});
