// The synth alone: pick a scene, push the mood around, play any effect. Fixed seed.
import type { Demo } from '@/contracts/units';
import type { ScreenId } from '@/contracts/platform';
import { factory, SFX_NAMES, modeOfSeed } from './index';

const SEED = 0x3f9a77;
const SCENES: readonly ScreenId[] = ['bedroom', 'box', 'dive', 'system', 'planet', 'outside', 'battle', 'mirror'];

export const demo: Demo = {
  title: 'Unit 25: src/platform/audio',
  mount: (root) => {
    const audio = factory();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:8px;font:12px var(--font-ui);color:var(--ink-muted);overflow:auto;height:100%';
    const row = (title: string) => {
      const h = document.createElement('div');
      h.textContent = title;
      const r = document.createElement('div');
      r.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';
      wrap.append(h, r);
      return r;
    };
    const button = (into: HTMLElement, label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'min-height:44px;padding:0 10px;background:var(--raised);color:var(--ink);border:1px solid var(--line);font:12px var(--font-ui)';
      b.addEventListener('click', () => void audio.unlock().then(fn));
      into.append(b);
    };
    let tense = 0;
    const scenes = row(`Scenes (seed ${SEED.toString(16)}, ${modeOfSeed(SEED)})`);
    for (const s of SCENES) button(scenes, s, () => audio.setScene(s));
    const moods = row('Mood');
    button(moods, 'calm', () => { tense = 0; });
    button(moods, 'tense', () => { tense = 1; });
    const fx = row(`Effects (${SFX_NAMES.length})`);
    for (const n of SFX_NAMES) button(fx, n, () => audio.sfx(n, 0.7));
    root.append(wrap);

    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      const dt = last ? now - last : 16;
      last = now;
      audio.setMood?.({ seed: SEED, depth: tense * 40, speed: tense, day: tense ? 0 : 500, rain: tense, wind: tense, sea: 0.5, fire: tense * 0.5, era: tense ? 4 : 1, prosperity: 0.7, souls: 20, intensity: tense, danger: tense, boss: tense > 0 });
      audio.update(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); audio.dispose(); wrap.remove(); };
  },
};
