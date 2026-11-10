/**
 * Frame-time monitor with adaptive quality (unit 28).
 *
 * Quality 2 is full. In auto mode it drops one level when the average frame over
 * about 1.5 s is slow, and climbs back only after a longer run of fast frames. A
 * climb that is followed quickly by a drop doubles the wait before the next climb,
 * so a device that sits between two levels settles on the lower one instead of
 * flapping. `perfControl` lets the shell force a level and read the numbers.
 *
 * Inside there are four levels, not three: below Low sits Minimal, for weak devices.
 * The contract's Quality stays 0 | 1 | 2 (Minimal reports 0, like Low); what tells the
 * two apart is resolutionScale(), which is 0.5 at Minimal and 0.55 at Low. Renderers
 * treat a scale under 0.52 as "effects off". `perfControl.effects(level)` says what each
 * level turns off, for a settings page to show.
 */
import type { Perf, PerfFactory, Quality } from '@/contracts/platform';

export type PerfMode = 'auto' | 'minimal' | 'low' | 'medium' | 'high';
/** 0 Minimal, 1 Low, 2 Medium, 3 High. */
export type PerfLevel = 0 | 1 | 2 | 3;
export interface PerfStats { fps: number; avgMs: number; worstMs: number; quality: Quality; scale: number; level?: PerfLevel }
export interface PerfEffects { readonly level: PerfLevel; readonly name: string; readonly scale: number; readonly tickCap: number; readonly off: readonly string[] }

/** What each level costs the eye. Kept beside the numbers the renderers key off (0.9, 0.7 and 0.52 of resolutionScale). */
export const PERF_EFFECTS: readonly PerfEffects[] = [
  { level: 0, name: 'Minimal', scale: 0.5, tickCap: 2, off: ['half-resolution first person', 'bloom', 'terrain shadows', 'the far dark of the sky', 'smoke and drifting dust', 'belt grains', 'things beyond 100 paces', 'fine cloud detail', 'four of eight fold levels in the dive'] },
  { level: 1, name: 'Low', scale: 0.55, tickCap: 2, off: ['reduced-resolution first person', 'soft shadow detail', 'things beyond 130 paces', 'some cloud detail', 'three of eight fold levels in the dive'] },
  { level: 2, name: 'Medium', scale: 0.75, tickCap: 4, off: ['three-quarter-resolution first person', 'things beyond 170 paces', 'one cloud layer'] },
  { level: 3, name: 'High', scale: 1, tickCap: Infinity, off: [] },
];

/** Average frame time (ms) over DROP_WINDOW_MS above which quality drops. */
export const DROP_MS = 22;
/**
 * Average frame time (ms) under which a block counts as fast. Frames arrive on
 * vsync, so a healthy 60 Hz device reports 16.7 ms; the bar sits just above that.
 */
export const RECOVER_MS = 17.6;
export const DROP_WINDOW_MS = 1500;
export const RECOVER_BLOCK_MS = 1000;
export const RECOVER_HOLD_MS = 4000;
const RECOVER_HOLD_MAX_MS = 64000;
/** A drop this soon after a climb means the climb was a mistake. */
const RELAPSE_MS = 10000;
/** Frames this long are a tab switch or a screen change unless they keep coming. */
const HITCH_MS = 180;
const HITCH_RUN = 3;
/** Shader compiles and first paints are not a fair measure. */
const WARMUP_FRAMES = 30;
const SCALES: readonly [number, number, number, number] = [0.5, 0.55, 0.75, 1];
/** The render scale glides to its target at this rate so a change is not a pop. */
const SCALE_PER_MS = 0.25 / 400;
const SCALE_STEP = 0.05;
const TICK_CAP: readonly [number, number, number, number] = [2, 2, 4, Infinity];
const qualityOf = (l: PerfLevel): Quality => (l <= 1 ? 0 : ((l - 1) as Quality));
const HISTORY = 240;
const STORE_KEY = 'sallow-quality-mode';

const MODES: readonly PerfMode[] = ['auto', 'minimal', 'low', 'medium', 'high'];
const forced = (m: PerfMode): PerfLevel | null => (m === 'minimal' ? 0 : m === 'low' ? 1 : m === 'medium' ? 2 : m === 'high' ? 3 : null);

const loadMode = (): PerfMode => {
  try {
    const v = localStorage.getItem(STORE_KEY) as PerfMode | null;
    if (v && MODES.includes(v)) return v;
  } catch { /* storage blocked or absent */ }
  return 'auto';
};

let mode: PerfMode = loadMode();
const modeCbs = new Set<() => void>();
interface Live { stats(): PerfStats; history(out: Float32Array): number }
let live: Live | null = null;

/** Outside control of the monitor: force a level, read the numbers. */
export const perfControl = {
  mode: (): PerfMode => mode,
  setMode(m: PerfMode): void {
    if (!MODES.includes(m) || m === mode) return;
    mode = m;
    try { localStorage.setItem(STORE_KEY, m); } catch { /* storage blocked or absent */ }
    for (const cb of [...modeCbs]) cb();
  },
  stats: (): PerfStats => live?.stats() ?? { fps: 60, avgMs: 16.7, worstMs: 16.7, quality: 2, scale: 1, level: 3 },
  /** What a level (default: all four, lowest first) turns off. */
  effects: (): readonly PerfEffects[] => PERF_EFFECTS,
  /** Copies the newest frame times (ms, oldest first) into `out`; returns how many. */
  history: (out: Float32Array): number => live?.history(out) ?? 0,
};

export const factory: PerfFactory = () => {
  const ring = new Float32Array(HISTORY);
  let head = 0, count = 0, sum = 0;
  let level: PerfLevel = forced(mode) ?? 3;
  let scale: number = SCALES[level];
  let seen = 0, hitches = 0;
  let dropT = 0, dropN = 0;
  let blockT = 0, blockN = 0, fastMs = 0;
  let hold = RECOVER_HOLD_MS, sinceClimb = Infinity;
  const cbs = new Set<(q: Quality) => void>();

  const resetWindows = () => { dropT = dropN = blockT = blockN = fastMs = 0; };
  const set = (l: PerfLevel) => {
    if (l === level) return;
    const was = qualityOf(level), q = qualityOf(l);
    level = l;
    resetWindows();
    // Low to Minimal is the same Quality: listeners hear only real changes of it.
    if (q !== was) for (const cb of [...cbs]) { try { cb(q); } catch { /* a listener must not break the frame */ } }
  };
  const onMode = () => {
    const f = forced(mode);
    resetWindows();
    hold = RECOVER_HOLD_MS;
    sinceClimb = Infinity;
    if (f !== null) { set(f); scale = SCALES[f]; }
  };
  modeCbs.add(onMode);

  const adapt = (ms: number) => {
    sinceClimb += ms;
    dropT += ms; dropN++;
    if (dropT >= DROP_WINDOW_MS) {
      const slow = dropT / dropN > DROP_MS;
      dropT = dropN = 0;
      if (slow && level > 0) {
        if (sinceClimb < RELAPSE_MS) hold = Math.min(RECOVER_HOLD_MAX_MS, hold * 2);
        set((level - 1) as PerfLevel);
        return;
      }
    }
    blockT += ms; blockN++;
    if (blockT >= RECOVER_BLOCK_MS) {
      fastMs = blockT / blockN < RECOVER_MS ? fastMs + blockT : 0;
      blockT = blockN = 0;
      if (fastMs >= hold && level < 3) {
        set((level + 1) as PerfLevel);
        sinceClimb = 0;
      }
    }
  };

  const perf: Perf = {
    sample(frameMs) {
      if (!(frameMs > 0) || !Number.isFinite(frameMs)) return;
      if (seen < WARMUP_FRAMES) { seen++; return; }
      let ms = frameMs;
      if (ms > HITCH_MS) {
        // One or two long frames are a hitch; a run of them is how it really runs.
        if (++hitches < HITCH_RUN) return;
        ms = Math.min(ms, 250);
      } else hitches = 0;
      if (count === HISTORY) sum -= ring[head]!; else count++;
      ring[head] = ms;
      sum += ms;
      head = (head + 1) % HISTORY;
      if (forced(mode) === null) adapt(ms);
      const target = SCALES[level];
      if (scale !== target) {
        const d = ms * SCALE_PER_MS;
        scale = scale < target ? Math.min(target, scale + d) : Math.max(target, scale - d);
      }
    },
    quality: () => qualityOf(level),
    // Stepped so a glide re-sizes render targets a handful of times, not every frame.
    resolutionScale: () => {
      const target = SCALES[level];
      const s = scale === target ? target : Math.round(scale / SCALE_STEP) * SCALE_STEP;
      return Math.max(0.5, Math.min(1, s));
    },
    tickBudget: (wanted) => (wanted > 0 ? Math.max(1, Math.min(Math.floor(wanted), TICK_CAP[level])) : 0),
    averageFrameMs: () => (count ? sum / count : 16.7),
    onChange: (cb) => { cbs.add(cb); return () => void cbs.delete(cb); },
  };

  live = {
    stats() {
      let worst = 0;
      for (let i = 0; i < count; i++) if (ring[i]! > worst) worst = ring[i]!;
      const avg = perf.averageFrameMs();
      return { fps: 1000 / avg, avgMs: avg, worstMs: count ? worst : avg, quality: qualityOf(level), scale: perf.resolutionScale(), level };
    },
    history(out) {
      const n = Math.min(count, out.length);
      for (let i = 0; i < n; i++) out[i] = ring[(head - n + i + HISTORY * 2) % HISTORY]!;
      return n;
    },
  };
  return perf;
};
