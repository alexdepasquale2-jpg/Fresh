// STUB: replace with the real solar-system renderer (unit 14). See README.md.
import type { SystemRendererFactory, GlCore } from '@/contracts/render';

export const factory: SystemRendererFactory = () => {
  let core: GlCore | null = null;
  return { init: (c) => void (core = c), draw: () => core?.clear('#17140c'), dispose: () => void (core = null), orbitAt: () => -1 };
};
