// Dive state machine (unit 19): the fall, what waits in the folds, the streak, and the reckoning at the end.
import type { DiveFactory, DiveView, DivePhase, CaptureResult, DiveEvent, DiveSummary } from '@/contracts/game';
import { RELIQUARIES_PER_DIVE } from '@/contracts/game';
import type { UniverseSpec } from '@/contracts/universe';
import type { FoldAddress } from '@/contracts/seed';
import type { FoldNode, FoldThingKind, Stratum, StarRef } from '@/contracts/fold';
import { child, rng } from '@/core/hash';

const FALL_PER_TICK = 45; // progress units (1000 per fold): ~1.1 s per fold
const AIM_UNTIL = 600; // steering closes this far through a fold
const STREAK_GRACE_TICKS = 10; // a slipped finger does not break a streak
const MAX_MULT = 5;
const MAX_RELIQUARIES = 5;
const MILESTONE_EVERY = 6;
const FOLLOW_START = 3; // folds behind when it wakes
const FOLLOW_LOST = 6; // this far behind, it gives up
const FOLLOW_CLOSE_TICKS = 28; // hovering lets it gain one fold per this many ticks
const CATCH_AT = 650; // throw accuracy needed to catch
const GRAZE_AT = 400; // below this the reliquary is lost

const LINES: Record<DivePhase, string[]> = {
  surfaced: ['The box is quiet.'],
  hovering: ['Hold to fall. Tap a ring to steer. Fall into a star to land.', 'Mote hangs in the dark, waiting.', 'Something flickers between the folds.'],
  falling: ['The folds open under you.', 'Deeper. The light thins.', 'Rings inside rings inside rings.'],
  stopped: ['A star. Mote settles beside it.'],
};

// Every universe ends somewhere: a floor, 24..36 folds down, fixed by its seed.
export const bottomDepthOf = (u: UniverseSpec): number => rng(child(u.seed, 'bottom')).range(24, 36);
export const multiplierOf = (streak: number): number => Math.min(MAX_MULT, 1 + Math.floor(streak / 4));
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
const isHazard = (k: FoldThingKind) => k === 'storm' || k === 'undertow' || k === 'follower';

export const factory: DiveFactory = ({ fold, light, box }) => {
  let phase: DivePhase = 'surfaced';
  let universe: UniverseSpec | null = null;
  let address: FoldAddress | null = null;
  let children: readonly FoldNode[] = [];
  let best = 0;
  let startBest = 0;
  let progress = 0;
  let reliquaries = RELIQUARIES_PER_DIVE;
  let aim = 0;
  let cameFrom = 0;
  let landed: StarRef | null = null;
  let bottomDepth = 0;
  let atBottom = false;
  // Regions.
  let strata: readonly Stratum[] = [];
  let stratum: Stratum | null = null;
  let crossed: string[] = [];
  // Risk and reward.
  let streak = 0;
  let bestStreak = 0;
  let idleTicks = 0;
  let haul = 0;
  let folds = 0;
  let milestone = 0;
  let follower = 0;
  let followTicks = 0;
  let followFolds = 0;
  let steerLocked = false;
  let surge = false;
  const got = { pieces: 0, wells: 0, echoes: 0, wrecks: 0, flickers: 0, hit: 0, dodged: 0 };
  let summary: DiveSummary | null = null;
  let events: DiveEvent[] = [];
  let taken: { has(key: number): boolean } | null = null;

  const nearStar = () => children.find((c) => c.star)?.star ?? null;
  const mult = () => multiplierOf(streak);
  const open = (a: FoldAddress): readonly FoldNode[] => {
    const cs = fold.childrenOf(a);
    const t = taken;
    if (!t) return cs;
    // Pieces and wrecks taken on an earlier dive are gone.
    return cs.some((c) => c.thing && t.has(c.thing.key)) ? cs.map((c) => (c.thing && t.has(c.thing.key) ? { index: c.index, address: c.address } : c)) : cs;
  };
  const stratumAt = (depth: number): Stratum | null => {
    for (const s of strata) if (depth < s.to) return s;
    return strata[strata.length - 1] ?? null;
  };
  const breakStreak = () => {
    if (streak >= 4) events.push({ type: 'streak-lost', streak });
    streak = 0;
  };
  const end = (reason: DiveSummary['reason']) => {
    if (summary || !address) return;
    // Part of the haul comes back up as Light.
    const lightBack = Math.min(3000, haul * 5);
    if (lightBack > 0) light.addGlow(lightBack);
    summary = {
      reason, depth: address.depth, best, newBest: address.depth > startBest, folds, strata: crossed.slice(),
      pieces: got.pieces, wells: got.wells, echoes: got.echoes, wrecks: got.wrecks, flickers: got.flickers,
      hazardsHit: got.hit, hazardsDodged: got.dodged, bestStreak, haul, lightBack,
    };
  };
  const surface = () => {
    if (address) box.recordDepth(box.selected(), address.depth);
    if (phase !== 'surfaced') end('surface');
    phase = 'surfaced';
  };
  /** What happens on falling into a child that holds something. */
  const meet = (node: FoldNode) => {
    const th = node.thing;
    if (!th) return;
    const m = mult();
    switch (th.kind) {
      case 'piece':
        got.pieces++; haul += 10 * m;
        events.push({ type: 'pickup', kind: th.kind, key: th.key, power: th.power, reward: 'piece' });
        break;
      case 'well':
        got.wells++; haul += 6 * m;
        light.addGlow(1500 + th.power * 4);
        // It will not cross the light.
        if (follower > 0) { follower = 0; events.push({ type: 'follower', state: 'lost' }); }
        events.push({ type: 'pickup', kind: th.kind, key: th.key, power: th.power, reward: 'light' });
        break;
      case 'echo':
        got.echoes++; haul += 8 * m;
        light.addGlow(200);
        events.push({ type: 'pickup', kind: th.kind, key: th.key, power: th.power, reward: 'voice' });
        break;
      case 'wreck': {
        got.wrecks++; haul += 12 * m;
        const reliquary = th.power < 128 && reliquaries < MAX_RELIQUARIES;
        if (reliquary) reliquaries++;
        events.push({ type: 'pickup', kind: th.kind, key: th.key, power: th.power, reward: reliquary ? 'reliquary' : 'piece' });
        break;
      }
      case 'storm':
        got.hit++;
        if (light.canSpend(1)) light.spend(1);
        breakStreak();
        events.push({ type: 'hazard', kind: th.kind });
        break;
      case 'undertow': {
        got.hit++;
        // It takes the steering for one fold and drags you through it, away from any star.
        let to = th.power % 7;
        for (let k = 0; k < 7 && children[to]?.star; k++) to = (to + 1) % 7;
        aim = to;
        steerLocked = true;
        surge = true;
        events.push({ type: 'hazard', kind: th.kind });
        break;
      }
      case 'follower':
        got.hit++;
        if (follower === 0) { follower = FOLLOW_START; followTicks = 0; followFolds = 0; }
        else follower = Math.max(1, follower - 1);
        events.push({ type: 'hazard', kind: th.kind });
        break;
    }
  };
  const caught = () => {
    if (light.canSpend(1)) light.spend(1);
    breakStreak();
    follower = 0;
    events.push({ type: 'follower', state: 'caught' });
  };

  return {
    start: (u, b) => {
      // Coming back to a dive that is resting at a star (the player looked at its system and returned):
      // the fall goes on from that fold. Depth, reliquaries and milestones are kept; the streak and the
      // haul (already paid out when the star was reached) begin again. A caller that wants the top of
      // the universe calls surface() first.
      if (phase === 'stopped' && !atBottom && address && universe && universe.serialNumber === u.serialNumber && summary?.reason === 'star') {
        best = Math.max(best, b);
        startBest = best;
        progress = 0;
        landed = null;
        // Do not sit aimed at the star just left: holding would fall straight back into it.
        if (children[aim]?.star) { aim = 0; for (let k = 0; k < 7 && children[aim]?.star; k++) aim = (aim + 1) % 7; }
        crossed = stratum ? [stratum.name] : [];
        streak = bestStreak = idleTicks = haul = folds = follower = followTicks = followFolds = 0;
        steerLocked = surge = false;
        got.pieces = got.wells = got.echoes = got.wrecks = got.flickers = got.hit = got.dodged = 0;
        summary = null;
        events = [];
        phase = 'hovering';
        return;
      }
      universe = u;
      address = fold.root(u);
      children = open(address);
      best = b;
      startBest = b;
      progress = 0;
      reliquaries = RELIQUARIES_PER_DIVE;
      aim = 0;
      cameFrom = 0;
      landed = null;
      bottomDepth = bottomDepthOf(u);
      atBottom = false;
      strata = fold.strata?.(u) ?? [];
      stratum = stratumAt(0);
      crossed = stratum ? [stratum.name] : [];
      streak = bestStreak = idleTicks = haul = folds = follower = followTicks = followFolds = 0;
      milestone = 0;
      steerLocked = surge = false;
      got.pieces = got.wells = got.echoes = got.wrecks = got.flickers = got.hit = got.dodged = 0;
      summary = null;
      events = [];
      phase = 'hovering';
    },
    hold: () => {
      if (atBottom) return; // nothing lies under the floor
      if (phase === 'hovering' || phase === 'stopped') { phase = 'falling'; landed = null; }
    },
    release: () => {
      if (phase !== 'falling') return;
      if (nearStar() && progress < 500) { phase = 'stopped'; end('star'); }
      else { phase = 'hovering'; idleTicks = 0; }
    },
    throwAt: (i, accuracy): CaptureResult => {
      if (reliquaries <= 0) return { ok: false, reason: 'no-reliquary' };
      const f = children[i]?.flicker;
      if (!f) return { ok: false, reason: 'no-flicker' };
      if (accuracy !== undefined && accuracy < CATCH_AT) {
        // A near throw slips the rim and comes back to the hand. A wild one is gone.
        if (accuracy >= GRAZE_AT) return { ok: false, reason: 'grazed' };
        reliquaries--;
        return { ok: false, reason: 'missed' };
      }
      reliquaries--;
      if (box.slots().some((s) => s?.serialNumber === f.serialNumber)) return { ok: false, reason: 'duplicate' };
      const slot = box.add(f.serialNumber);
      if (slot < 0) return { ok: false, reason: 'box-full' };
      children = children.map((c) => (c.index === i ? { index: c.index, address: c.address } : c));
      got.flickers++;
      haul += 25 * mult();
      return { ok: true, serialNumber: f.serialNumber, slot };
    },
    update: (ticks) => {
      if (!address) return;
      if (phase === 'hovering' || phase === 'stopped') {
        // Hovering in the dark lets Mote gather a little light back.
        light.addGlow(ticks * 2);
        if (phase === 'hovering') {
          idleTicks += ticks;
          if (streak > 0 && idleTicks > STREAK_GRACE_TICKS) breakStreak();
          // And lets whatever follows come closer.
          if (follower > 0) {
            followTicks += ticks;
            while (follower > 0 && followTicks >= FOLLOW_CLOSE_TICKS) {
              followTicks -= FOLLOW_CLOSE_TICKS;
              if (--follower <= 0) caught();
            }
          }
        }
        return;
      }
      if (phase !== 'falling') return;
      // With no Light left you still fall, only slower and through dimmer folds.
      const dim = light.view().pips === 0;
      let speed = FALL_PER_TICK * (100 + Math.min(streak, 12) * 3);
      if (stratum?.motion === 'pull') speed = (speed * 115) / 100;
      if (surge) speed = (speed * 160) / 100;
      if (dim) speed /= 2;
      progress += Math.round((ticks * speed) / 100);
      while (progress >= 1000) {
        progress -= 1000;
        const into = children[aim] ?? children[0]!;
        // Falling into a star lands on it.
        if (into.star) {
          progress = 0;
          phase = 'stopped';
          landed = into.star;
          end('star');
          return;
        }
        // Whatever hazards were in this fold and not fallen into were slipped.
        for (const c of children) {
          if (c.thing && isHazard(c.thing.kind) && c.index !== into.index) {
            got.dodged++;
            if (c.index === 0 || c.thing.kind === 'follower') events.push({ type: 'dodge', kind: c.thing.kind });
          }
        }
        const wasLocked = steerLocked;
        address = into.address;
        cameFrom = aim;
        children = open(address);
        best = Math.max(best, address.depth);
        light.drainFolds(1);
        folds++;
        streak++;
        if (streak > bestStreak) bestStreak = streak;
        if (streak % 4 === 0 && streak / 4 < MAX_MULT) events.push({ type: 'streak', multiplier: mult() });
        haul += mult();
        if (wasLocked) { steerLocked = false; surge = false; aim = 0; }
        meet(into);
        // Something that follows falls behind a fast fall, and gains on a dim one.
        if (follower > 0 && into.thing?.kind !== 'follower') {
          if (dim) { if (--follower <= 0) caught(); }
          else if (++followFolds >= 2) {
            followFolds = 0;
            if (++follower >= FOLLOW_LOST) { follower = 0; haul += 20 * mult(); events.push({ type: 'follower', state: 'lost' }); }
          }
        }
        const s = stratumAt(address.depth);
        if (s && s !== stratum) {
          stratum = s;
          crossed.push(s.name);
          haul += 15;
          events.push({ type: 'stratum', stratum: s });
        }
        // Depth milestones, once each per dive. New ground pays in sky.
        if (address.depth >= milestone + MILESTONE_EVERY && address.depth < bottomDepth) {
          milestone = address.depth - (address.depth % MILESTONE_EVERY);
          const reward = address.depth > startBest ? 'piece' : (milestone / MILESTONE_EVERY) % 2 === 0 && reliquaries < MAX_RELIQUARIES ? 'reliquary' : 'light';
          if (reward === 'reliquary') reliquaries++;
          if (reward === 'light') light.addGlow(400 + 200 * mult());
          haul += 10 * mult();
          events.push({ type: 'milestone', depth: milestone, key: address.pathHash.lo, reward });
        }
        // The last fold opens on a floor. The fall ends here, with no star.
        if (address.depth >= bottomDepth) {
          progress = 0;
          phase = 'stopped';
          atBottom = true;
          end('floor');
          return;
        }
      }
    },
    aim: (i) => { if (i >= 0 && i <= 6 && phase !== 'surfaced' && progress < AIM_UNTIL && !steerLocked) aim = i; },
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
        depth,
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
        stratum,
        strata,
        streak,
        multiplier: mult(),
        haul,
        follower,
        steerLocked,
        summary,
      };
    },
    takeEvents: () => {
      if (events.length === 0) return events;
      const out = events;
      events = [];
      return out;
    },
    bindTaken: (t) => { taken = t; },
  };
};
