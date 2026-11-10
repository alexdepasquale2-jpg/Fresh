// STUB: the room at the bottom of a universe ("Whose box are you in?"). See src/ui/mirror/README.md.
import type { ScreenFactory } from '@/contracts/app';
import { el, backChip, narration } from '@/ui/kit';

const mirror: ScreenFactory = () => ({
  id: 'mirror',
  mount: (root, c) => {
    root.append(el('header', { class: 'row' }, backChip('UP', () => c.go('dive'))), narration('There is a room down here.'));
  },
  frame: () => {},
  unmount: () => {},
});

export const factory = () => ({ mirror });
