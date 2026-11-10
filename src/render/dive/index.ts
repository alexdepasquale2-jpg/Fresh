// STUB: replace with the real nested-ring fractal (unit 13). See README.md.
import type { DiveRendererFactory, GlCore } from '@/contracts/render';

export const factory: DiveRendererFactory = () => {
  let core: GlCore | null = null;
  return { init: (c) => void (core = c), draw: () => core?.clear('#17140c'), dispose: () => void (core = null) };
};
