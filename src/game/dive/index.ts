// Dive state machine (unit 19).
import type { DiveFactory, DiveView, DivePhase, CaptureResult } from '@/contracts/game';
import { RELIQUARIES_PER_DIVE } from '@/contracts/game';
import type { UniverseSpec } from '@/contracts/universe';
import type { FoldAddress } from '@/contracts/seed';
import type { FoldNode } from '@/contracts/fold';

const FALL_PER_TICK = 45; // progress units (1000 per fold): ~1.1 s per fold
const LINES: Record<DivePhase, string[]> = {
  surfaced: ['The box is quiet.'],
  hovering: ['Mote hangs in the dark, waiting.', 'Something flickers between the folds.', 'Let go and the folds hold still.'],
  falling: ['The folds open under you.', 'Deeper. The light thins.', 'Rings inside rings inside rings.'],
  stopped: ['A star. Mote settles beside it.'],
};

export const factory: DiveFactory = ({ fold, light, box }) => {
  let phase: DivePhase = 'surfaced';
  let universe: UniverseSpec | null = null;
  let address: FoldAddress | null = null;
  let children: readonly FoldNode[] = [];
  let best = 0;
  let progress = 0;
  let reliquaries = RELIQUARIES_PER_DIVE;
  const nearStar = () => children.find((c) => c.star)?.star ?? null;
  const surface = () => {
    if (address) box.recordDepth(box.selected(), address.depth);
    phase = 'surfaced';
  };
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
    hold: () => {
      if (phase === 'hovering' || phase === 'stopped') phase = 'falling';
    },
    release: () => {
      if (phase === 'falling') phase = nearStar() && progress < 500 ? 'stopped' : 'hovering';
    },
    throwAt: (i): CaptureResult => {
      if (reliquaries <= 0) return { ok: false, reason: 'no-reliquary' };
      const f = children[i]?.flicker;
      if (!f) return { ok: false, reason: 'no-flicker' };
      reliquaries--;
      if (box.slots().some((s) => s?.serialNumber === f.serialNumber)) return { ok: false, reason: 'duplicate' };
      const slot = box.add(f.serialNumber);
      if (slot < 0) return { ok: false, reason: 'box-full' };
      children = children.map((c) => (c.index === i ? { index: c.index, address: c.address } : c));
      return { ok: true, serialNumber: f.serialNumber, slot };
    },
    update: (ticks) => {
      if (phase !== 'falling' || !address) return;
      progress += ticks * FALL_PER_TICK;
      while (progress >= 1000) {
        progress -= 1000;
        address = children[0]!.address;
        children = fold.childrenOf(address);
        best = Math.max(best, address.depth);
        if (!light.drainFolds(1)) {
          surface();
          return;
        }
      }
    },
    surface,
    view: (): DiveView => {
      const lines = LINES[phase];
      return {
        phase,
        universe,
        address,
        depth: address?.depth ?? 0,
        best,
        progress,
        children,
        reliquaries,
        star: nearStar(),
        narration: lines[(address?.depth ?? 0) % lines.length]!,
      };
    },
  };
};
