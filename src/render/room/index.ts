// STUB: replace with the real bedroom renderer (unit 16). See README.md.
import type { RoomRendererFactory, GlCore } from '@/contracts/render';

export const factory: RoomRendererFactory = () => {
  let core: GlCore | null = null;
  const mote = { x: 195, y: 400 };
  return {
    init: (c) => void (core = c),
    draw: (v) => {
      mote.x = v.kid.x + 24;
      mote.y = v.kid.y - 24;
      core?.clear('#17140c');
    },
    dispose: () => void (core = null),
    mote: () => mote,
  };
};
