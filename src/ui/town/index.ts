// STUB: the open world outside the bedroom (screen id `town`). Replaced by the town unit.
import type { ScreenFactory } from '@/contracts/app';
import { el, backChip, narration } from '@/ui/kit';

export const factory = (): { town: ScreenFactory } => ({
  town: () => ({
    id: 'town',
    mount: (root, c) => { root.append(el('header', { class: 'row' }, backChip('HOME', () => c.go('bedroom'))), narration('The street is quiet.')); },
    frame: () => {},
    unmount: () => {},
  }),
});
