// Dive state machine (unit 19).
import type { DiveFactory, DiveView, DivePhase, CaptureResult } from '@/contracts/game';
import { RELIQUARIES_PER_DIVE } from '@/contracts/game';
import type { UniverseSpec } from '@/contracts/universe';
import type { FoldAddress } from '@/contracts/seed';
import type { FoldNode } from '@/contracts/fold';
import { child, rng } from '@/core/hash';

const FALL_PER_TICK = 45; // progress units (1000 per fold): ~1.1 s per fold
const LINES: Record<DivePhase, string[]> = {
  surfaced: ['The box is quiet.'],
  hovering: ['Hold to fall. Tap a ring to steer. Fall into a star to land.', 'Mote hangs in the dark, waiting.', 'Something flickers between the folds.'],
  falling: ['The folds open under you.', 'Deeper. The light thins.', 'Rings inside rings inside rings.'],
  stopped: ['A star. Mote settles beside it.'],
};

// Every universe ends somewhere: a floor, 24..36 folds down, fixed by its seed.
export const bottomDepthOf = (u: UniverseSpec): number => rng(child(u.seed, 'bottom')).range(24, 36);
const NEAR_BOTTOM = 6;
// Indexed by folds remaining (1..6).
const NEAR_LINES = [
  '',
  'Someone is down there.',
  'A light below. Square. Yellow. Not a star.',
  'The rings are narrowing toward a floor.',
  'A hum comes up through the dark.',
  'Something is below.',
  'The folds are fewer here.',
];
const BOTTOM_LINE = 'The folds end. There is a floor.';

export const factory: DiveFactory = ({ fold, light, box }) => {
  let phase: DivePhase = 'surfaced';
  let universe: UniverseSpec | null = null;
  let address: FoldAddress | null = null;
  let children: readonly FoldNode[] = [];
  let best = 0;
  let progress = 0;
  let reliquaries = RELIQUARIES_PER_DIVE;
  let aim = 0;
  let cameFrom = 0;
  let landed: import('@/contracts/fold').StarRef | null = null;
  let bottomDepth = 0;
  let atBottom = false;
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
      aim = 0;
      cameFrom = 0;
      landed = null;
      bottomDepth = bottomDepthOf(u);
      atBottom = false;
      phase = 'hovering';
    },
    hold: () => {
      if (atBottom) return; // nothing lies under the floor
      if (phase === 'hovering' || phase === 'stopped') { phase = 'falling'; landed = null; }
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
      if (!address) return;
      // Hovering in the dark lets Mote gather a little light back.
      if (phase === 'hovering' || phase === 'stopped') { light.addGlow(ticks * 2); return; }
      if (phase !== 'falling') return;
      // With no Light left you still fall, only slower and through dimmer folds.
      const dim = light.view().pips === 0;
      progress += ticks * (dim ? FALL_PER_TICK / 2 : FALL_PER_TICK);
      while (progress >= 1000) {
        progress -= 1000;
        const into = children[aim] ?? children[0]!;
        // Falling into a star lands on it.
        if (into.star) {
          progress = 0;
          phase = 'stopped';
          landed = into.star;
          return;
        }
        address = into.address;
        cameFrom = aim;
        children = fold.childrenOf(address);
        best = Math.max(best, address.depth);
        light.drainFolds(1);
        // The last fold opens on a floor. The fall ends here, with no star.
        if (address.depth >= bottomDepth) {
          progress = 0;
          phase = 'stopped';
          atBottom = true;
          return;
        }
      }
    },
    aim: (i) => { if (i >= 0 && i <= 6 && phase !== 'surfaced' && progress < 600) aim = i; },
    surface,
    view: (): DiveView => {
      const depth = address?.depth ?? 0;
      const toBottom = address ? Math.max(0, bottomDepth - depth) : 0;
      const near = !atBottom && address !== null && toBottom <= NEAR_BOTTOM && phase !== 'surfaced';
      const lines = phase === 'falling' && light.view().pips === 0 ? ['Mote is spent. The folds go dim, but you can still fall.', 'Darker here. Let go to rest and gather light.'] : LINES[phase];
      return {
        phase,
        universe,
        address,
        depth: address?.depth ?? 0,
        best,
        progress,
        children,
        reliquaries,
        star: atBottom ? null : landed ?? nearStar(),
        aim,
        cameFrom,
        narration: atBottom ? BOTTOM_LINE : near ? NEAR_LINES[toBottom]! : lines[depth % lines.length]!,
        toBottom,
        bottom: atBottom,
      };
    },
  };
};
