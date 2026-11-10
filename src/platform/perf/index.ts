// STUB: replace with the real perf monitor (unit 28). See README.md.
import type { PerfFactory } from '@/contracts/platform';

export const factory: PerfFactory = () => {
  let avg = 16.7;
  return {
    sample: (ms) => void (avg = avg * 0.9 + ms * 0.1),
    quality: () => 2,
    resolutionScale: () => 1,
    tickBudget: (n) => n,
    averageFrameMs: () => avg,
    onChange: () => () => {},
  };
};
