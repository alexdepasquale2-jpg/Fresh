// WebAudio synth (unit 25). No audio files. Everything is clocked by the universe
// pulse: each pulse cycle is 8 steps, and the score, the crossfades between screens and
// the pad's breathing all land on those steps. The synth itself is in engine.ts; this
// file owns the live AudioContext: autoplay policy, mute, page visibility.
import type { AudioFactory, AudioMix, AudioMood, ScreenId } from '@/contracts/platform';
import type { Pulse } from '@/contracts/time';
import { FX_ONE } from '@/core/fixed';
import { createEngine } from './engine';
import type { Engine } from './engine';

export { MODE_NAMES, modeOfSeed } from './engine';

const STEPS = 8;
/** Notes are scheduled this far ahead so a late frame does not clip an attack. */
const AHEAD = 0.03;
const SILENT = { peak: 0, rms: 0 } as const;

export const factory: AudioFactory = () => {
  let ac: AudioContext | null = null;
  let engine: Engine | null = null;
  let pulse: Pulse | null = null;
  let scene: ScreenId = 'bedroom';
  let mood: AudioMood | null = null;
  let mix: AudioMix = {};
  let muted = false;
  let mutedMs = 0;
  let lastStep = -1;
  let lastMilliHz = -1;
  let fallback = 0; // internal phase (0..1) when no pulse is set
  const onVisibility = () => {
    if (!ac) return;
    if (document.hidden) void ac.suspend().catch(() => undefined);
    else if (!muted) void ac.resume().catch(() => undefined);
  };

  return {
    unlock: async () => {
      const AC = typeof AudioContext !== 'undefined' ? AudioContext : undefined;
      if (!AC) return;
      try {
        if (!ac) {
          ac = new AC();
          engine = createEngine(ac);
          engine.setMix(mix, 0);
          engine.setMuted(muted, 0);
          if (mood) engine.setMood(mood);
          engine.setScene(scene, 0, true);
          document.addEventListener('visibilitychange', onVisibility);
        }
        if (!muted && !document.hidden) await ac.resume();
      } catch { /* no audio on this device: stay silent */ }
    },
    setPulse: (p) => void (pulse = p),
    setScene: (s) => {
      scene = s;
      if (ac && engine) engine.setScene(s, ac.currentTime + AHEAD);
    },
    update: (dtMs) => {
      if (!ac || !engine || ac.state !== 'running') return;
      if (muted) {
        // Once the fade is long over, stop the clock: a muted game costs nothing.
        mutedMs += dtMs;
        if (mutedMs > 600) void ac.suspend().catch(() => undefined);
        return;
      }
      let phase: number;
      const milliHz = pulse ? pulse.milliHz : 800;
      if (pulse) phase = pulse.phase() / FX_ONE;
      else {
        fallback = (fallback + (dtMs / 1000) * 0.8) % 1;
        phase = fallback;
      }
      // Without a mood the universe is still recognisable: its pulse rate picks its sound.
      if (!mood && milliHz !== lastMilliHz) {
        lastMilliHz = milliHz;
        engine.setMood({ seed: Math.imul(milliHz, 2654435761) >>> 0 });
      }
      const step = Math.floor(phase * STEPS) % STEPS;
      if (step !== lastStep) {
        lastStep = step;
        engine.step(step, ac.currentTime + AHEAD);
      }
    },
    setMuted: (m) => {
      muted = m;
      mutedMs = 0;
      if (!ac || !engine) return;
      engine.setMuted(m, ac.currentTime);
      if (!m && !document.hidden && ac.state === 'suspended') void ac.resume().catch(() => undefined);
    },
    sfx: (name, amount = 0.5) => {
      if (!ac || !engine || ac.state !== 'running' || muted) return;
      try { engine.sfx(name, amount, ac.currentTime + 0.005); } catch { /* a sound must never break the game */ }
    },
    setMood: (m) => {
      mood = m;
      engine?.setMood(m);
    },
    setMix: (m) => {
      mix = { ...mix, ...m };
      if (ac && engine) engine.setMix(m, ac.currentTime);
    },
    meter: () => (ac && engine && ac.state === 'running' ? engine.meter() : SILENT),
    sfxNames: () => SFX_NAMES,
    dispose: () => {
      document.removeEventListener('visibilitychange', onVisibility);
      engine?.stop();
      void ac?.close().catch(() => undefined);
      ac = null;
      engine = null;
    },
  };
};

export interface RenderReport { peak: number; rms: number; seconds: number; mode: string; names: readonly string[] }
/**
 * Render a scene offline and measure it: the structural check that the mix is neither
 * silent nor clipping. `sfx` names are fired one per half second on top of the score.
 */
export const renderScene = async (scene: ScreenId | readonly ScreenId[], seconds: number, mood: AudioMood = {}, sfx: readonly string[] = [], milliHz = 800): Promise<RenderReport> => {
  const rate = 44100;
  const oac = new OfflineAudioContext(2, Math.floor(rate * seconds), rate);
  const engine = createEngine(oac);
  engine.setMood(mood);
  // A list of scenes is a tour: the time is shared out evenly and each change crossfades on the beat.
  const tour = typeof scene === 'string' ? [scene] : scene;
  engine.setScene(tour[0] ?? 'bedroom', 0, true);
  const stepS = 1000 / milliHz / STEPS;
  let at = 0;
  for (let i = 0; 0.05 + i * stepS < seconds - 0.1; i++) {
    const t = 0.05 + i * stepS;
    const want = Math.min(tour.length - 1, Math.floor((t / seconds) * tour.length));
    if (want !== at) { at = want; engine.setScene(tour[at]!, t); }
    engine.step(i % STEPS, t);
  }
  sfx.forEach((n, i) => { if (0.3 + i * 0.5 < seconds - 0.1) engine.sfx(n, 0.7, 0.3 + i * 0.5); });
  const buf = await oac.startRendering();
  let peak = 0, sum = 0, count = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]!);
      if (a > peak) peak = a;
      sum += a * a;
    }
    count += d.length;
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, count)), seconds, mode: engine.identity().mode, names: engine.names() };
};

/** Every sfx name, without needing an AudioContext (kept in step with engine.ts by the demo and the README). */
export const SFX_NAMES: readonly string[] = [
  'back', 'bless', 'body', 'boss', 'burn', 'catch', 'chapter', 'chill', 'close', 'cold', 'comet-strike', 'confirm', 'crit', 'death', 'deny',
  'eclipse', 'energy', 'erase', 'expose', 'faint', 'festival', 'fire', 'flare', 'flee', 'fold', 'freeze', 'gain', 'gift', 'guard', 'hazard',
  'heal', 'heat', 'hit', 'land', 'launch', 'level', 'lightning', 'lose', 'low-light', 'merge', 'meteor', 'nav', 'open', 'orbit', 'panspermia',
  'pickup', 'place', 'preach', 'pull', 'push', 'quake', 'rain', 'regen', 'rest', 'sand', 'seed', 'shine', 'shower', 'smite', 'soul', 'sow',
  'star', 'status', 'step', 'step-grass', 'step-sand', 'step-snow', 'step-stone', 'step-water', 'step-wood', 'stone', 'strike', 'swap', 'take',
  'tap', 'thunder', 'toast', 'toggle', 'village', 'war', 'ward', 'water', 'whisper', 'win', 'wind', 'zoom', 'zoom-in', 'zoom-out', 'birth', 'slider',
  'door', 'coin', 'talk', 'bus', 'bike-bell', 'splash', 'skip', 'bite', 'shop-bell', 'gate', 'dog', 'cat', 'train', 'crossing', 'step-road',
];
