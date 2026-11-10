// STUB: replace with the real dive state machine (unit 19). See README.md.
import type { DiveFactory, DiveView, DivePhase } from '@/contracts/game';
import { RELIQUARIES_PER_DIVE } from '@/contracts/game';
import type { UniverseSpec } from '@/contracts/universe';
import type { FoldAddress } from '@/contracts/seed';
import type { FoldNode, StarRef } from '@/contracts/fold';

export const factory: DiveFactory = ({ fold }) => {
  let phase: DivePhase = 'surfaced';
  let universe: UniverseSpec | null = null;
  let address: FoldAddress | null = null;
  let children: readonly FoldNode[] = [];
  let best = 0;
  let progress = 0;
  let reliquaries = RELIQUARIES_PER_DIVE;
  const nearStar = (): StarRef | null => children.find((c) => c.star)?.star ?? null;
  return {
    start: (u, b) => {
      universe = u;
      address = fold.root(u);
      children = fold.childrenOf(address);
      best = b;
      progress = 0;
      reliquaries = RELIQUARIES_PER_DIVE;
      phase = 'hovering';
    },
    hold: () => void (phase !== 'surfaced' && (phase = 'falling')),
    release: () => void (phase === 'falling' && (phase = nearStar() ? 'stopped' : 'hovering')),
    throwAt: () => ({ ok: false, reason: 'no-flicker' }),
    update: (ticks) => {
      if (phase !== 'falling' || !address) return;
      progress += ticks * 50;
      while (progress >= 1000) {
        progress -= 1000;
        address = (children[0] ?? fold.childrenOf(address)[0]!).address;
        children = fold.childrenOf(address);
        best = Math.max(best, address.depth);
      }
    },
    surface: () => void (phase = 'surfaced'),
    view: (): DiveView => ({
      phase,
      universe,
      address,
      depth: address?.depth ?? 0,
      best,
      progress,
      children,
      reliquaries,
      star: nearStar(),
      narration: 'The folds open under you.',
    }),
  };
};
