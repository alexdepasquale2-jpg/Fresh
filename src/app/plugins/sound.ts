/**
 * Sound: feeds the synth what the game is doing (so the score and the ambience follow
 * the universe, the weather, the colony and the fight), rings a few bells for things the
 * colony does on its own, and adds the Sound page to the hub: volumes, mute, a test row.
 *
 * Saved under `sallow-sound`. Nothing sounds before the first touch (the synth unlocks
 * on it) and a saved mute is applied before that.
 */
import './sound.css';
import type { Plugin } from '../plugins';
import type { AudioMood } from '@/contracts/platform';
import { seedToU32 } from '@/core/hash';
import { modeOfSeed, SFX_NAMES, renderScene } from '@/platform/audio';

interface Saved { master: number; music: number; effects: number; ambience: number; muted: boolean }
type Level = 'master' | 'music' | 'effects' | 'ambience';
const DEFAULTS: Saved = { master: 0.8, music: 0.7, effects: 0.8, ambience: 0.7, muted: false };
const MOOD_MS = 300;
/** Grid cells looked at when asking how much of a world is sea or flame. */
const SAMPLES = 320;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const SLIDERS: readonly (readonly [Level, string, string])[] = [
  ['master', 'Master', 'Everything.'],
  ['music', 'Music', 'The universe hums.'],
  ['effects', 'Effects', 'Taps, bells, blows.'],
  ['ambience', 'Ambience', 'Wind, rain, surf.'],
];
const TESTS: readonly (readonly [string, string])[] = [['tap', 'Tap'], ['place', 'Place'], ['star', 'Star'], ['village', 'Village'], ['war', 'Horn'], ['thunder', 'Thunder'], ['level', 'Level'], ['chapter', 'Chapter']];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const plugin: Plugin = (shell) => {
  const { ctx } = shell;
  const audio = ctx.audio;
  const store = shell.store<Saved>('sound', DEFAULTS);
  const read = (): Saved => {
    const s = store.get() as Partial<Saved> | null;
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : d);
    return { master: num(s?.master, DEFAULTS.master), music: num(s?.music, DEFAULTS.music), effects: num(s?.effects, DEFAULTS.effects), ambience: num(s?.ambience, DEFAULTS.ambience), muted: s?.muted === true };
  };
  let state = read();
  const apply = () => {
    try {
      audio.setMix?.({ master: state.master, music: state.music, effects: state.effects, ambience: state.ambience });
      audio.setMuted(state.muted);
    } catch { /* sound is never worth a crash */ }
  };
  apply();

  /* ---------- Mood: a few numbers about the game, a few times a second ---------- */
  const mood: Mutable<AudioMood> = {};
  let kinds: Uint8Array | null = null; // material id -> 1 liquid, 2 fire
  let kindsFor: unknown = null;
  // Last seen, for the colony's own sounds.
  let seenWorld: string | null = null;
  let villages = 0, souls = 0, launches = 0, lightning = 0, attackers = 0, wasLow = false, lastLife = 0, feast = false;
  let clockMs = 0;

  const readMood = () => {
    const screen = shell.current();
    const u = ctx.selection.universe;
    mood.seed = u ? seedToU32(u.seed) : undefined;
    const lv = ctx.light.view();
    mood.light = lv.low ? 0.25 : 1;
    if (lv.low && !wasLow) audio.sfx('low-light');
    wasLow = lv.low;
    mood.depth = mood.speed = mood.day = mood.wind = mood.rain = mood.sea = mood.fire = mood.cold = undefined;
    mood.era = mood.prosperity = mood.souls = mood.danger = mood.intensity = undefined;
    mood.body = mood.boss = undefined;

    if (screen === 'dive') {
      const v = ctx.dive.view();
      mood.depth = v.depth;
      mood.speed = v.phase === 'falling' ? 1 : 0;
    } else if (screen === 'planet') {
      const f = ctx.sim.latest();
      if (f) {
        const { env, civ, grid } = f;
        mood.day = env.day;
        mood.wind = Math.abs(env.wind) / 100;
        mood.rain = env.rain / 255;
        mood.era = civ.era;
        mood.prosperity = civ.prosperity / 100;
        mood.souls = civ.souls;
        mood.body = civ.avatar !== null;
        mood.danger = civ.avatar ? clamp01((100 - civ.avatar.hp) / 100 + civ.avatar.attackers * 0.25) : 0;
        if (u && kindsFor !== u) {
          kindsFor = u;
          kinds = new Uint8Array(256);
          for (const m of u.materialTable) kinds[m.id] = m.kind === 'liquid' ? 1 : m.kind === 'fire' ? 2 : 0;
        }
        if (kinds && grid.cells.length > 0) {
          let sea = 0, fire = 0, n = 0;
          const stride = Math.max(1, Math.floor(grid.cells.length / SAMPLES)) | 1;
          for (let i = stride >> 1; i < grid.cells.length; i += stride, n++) {
            const k = kinds[grid.cells[i]!]!;
            if (k === 1) sea++; else if (k === 2) fire++;
          }
          mood.sea = clamp01((sea / Math.max(1, n)) * 3);
          mood.fire = clamp01((fire / Math.max(1, n)) * 25);
        }
        let cold = 0, tn = 0;
        for (let i = 0; i < env.temp.length; i += 7, tn++) if (env.temp[i]! < 100) cold++;
        mood.cold = tn > 0 ? cold / tn : 0;

        // The colony makes its own noise. The first look at a world only takes stock.
        const world = `${u?.serialNumber ?? ''}:${ctx.selection.planetIndex}`;
        const att = civ.avatar?.attackers ?? 0;
        const glad = civ.prosperity >= 85 && civ.souls > 0;
        if (seenWorld === world) {
          if (civ.villages.length > villages) audio.sfx('village');
          if (civ.launches > launches) audio.sfx('launch');
          if (env.lightning < lightning && env.lightning < 6) audio.sfx('thunder', mood.rain);
          if (att > 0 && attackers === 0) audio.sfx('war');
          if (clockMs - lastLife > 5000 && civ.souls !== souls) {
            lastLife = clockMs;
            audio.sfx(civ.souls > souls ? 'birth' : 'death');
          }
          if (glad && !feast) audio.sfx('festival');
        }
        seenWorld = world;
        attackers = att;
        feast = glad;
        villages = civ.villages.length;
        souls = civ.souls;
        launches = civ.launches;
        lightning = env.lightning;
      }
    } else if (screen === 'battle') {
      const b = ctx.battle;
      if (b) {
        const hpOf = (side: typeof b.mine) => {
          let hp = 0, max = 0;
          for (const f of side) { hp += f.hp; max += f.maxHp; }
          return max > 0 ? hp / max : 1;
        };
        const me = b.mine[b.myActive];
        mood.intensity = b.outcome === 'ongoing' ? clamp01(0.25 + 0.45 * (1 - hpOf(b.theirs)) + 0.3 * (1 - hpOf(b.mine))) : 0.1;
        mood.danger = me && me.maxHp > 0 ? 1 - me.hp / me.maxHp : 0;
        mood.boss = b.rival.level >= 8;
      } else mood.intensity = 0.15;
    }
    if (screen !== 'planet') seenWorld = null;
    audio.setMood?.(mood);
  };

  /* ---------- The Sound page ---------- */
  let open = false;
  const panel = el('section', 'snd-panel');
  panel.setAttribute('aria-label', 'Sound');
  const mute = el('button', 'snd-mute');
  mute.type = 'button';
  mute.dataset.id = 'sound-mute';
  const says = el('p', 'snd-says');
  const rows: [Level, HTMLInputElement, HTMLElement][] = [];
  const paint = () => {
    mute.textContent = state.muted ? 'Sound is off' : 'Sound is on';
    mute.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
    mute.classList.toggle('off', state.muted);
    panel.classList.toggle('muted', state.muted);
    for (const [k, input, out] of rows) {
      const pct = Math.round(state[k] * 100);
      if (Number(input.value) !== pct) input.value = String(pct);
      input.style.setProperty('--fill', `${pct}%`);
      out.textContent = String(pct);
    }
    const u = ctx.selection.universe;
    says.textContent = state.muted
      ? 'Nothing here makes a sound now.'
      : u ? `${u.name} hums in ${modeOfSeed(seedToU32(u.seed))}.` : 'Every universe hums in its own mode.';
  };
  const commit = () => { store.set(state); apply(); paint(); };
  mute.addEventListener('click', () => {
    state = { ...state, muted: !state.muted };
    commit();
    // The hub keeps its presses to itself, so this may be the first gesture the synth hears of.
    void audio.unlock();
    if (!state.muted) window.setTimeout(() => audio.sfx('toggle', 1), 120);
  });
  panel.append(mute);
  for (const [k, label, hint] of SLIDERS) {
    const row = el('label', 'snd-row');
    const text = el('span', 'snd-label', label);
    text.append(el('small', '', hint));
    const input = el('input', 'snd-range');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '5';
    input.dataset.id = `sound-${k}`;
    input.setAttribute('aria-label', `${label} volume`);
    const out = el('output', 'snd-out');
    input.addEventListener('input', () => {
      state = { ...state, [k]: clamp01(Number(input.value) / 100) };
      commit();
      if (k === 'master' || k === 'effects') audio.sfx('slider', state[k]);
    });
    row.append(text, input, out);
    rows.push([k, input, out]);
    panel.append(row);
  }
  const meter = el('div', 'snd-meter');
  meter.setAttribute('aria-hidden', 'true');
  const bar = el('i', '');
  meter.append(bar);
  panel.append(meter, el('h3', 'snd-head', 'Test'));
  const tests = el('div', 'snd-tests');
  for (const [name, label] of TESTS) {
    const b = el('button', 'snd-test', label);
    b.type = 'button';
    b.dataset.id = `sound-test-${name}`;
    b.addEventListener('click', (e) => {
      // main.ts adds a tap to every button press; here the button is the sound.
      e.stopPropagation();
      void audio.unlock().then(() => audio.sfx(name, 0.7));
    });
    tests.append(b);
  }
  panel.append(tests, says);

  let shown = -1;
  const drawMeter = () => {
    const m = audio.meter?.();
    const w = m ? Math.round(clamp01(m.peak / 0.9) * 20) * 5 : 0;
    if (w === shown) return;
    shown = w;
    bar.style.width = `${w}%`;
  };

  shell.menu.add({
    id: 'sound', label: 'Sound', hint: 'Volumes and mute', order: 80,
    render: (into) => { state = read(); into.append(panel); open = true; paint(); return () => { open = false; }; },
  });

  let acc = MOOD_MS;
  shell.onFrame((dt) => {
    clockMs += dt;
    acc += dt;
    if (acc >= MOOD_MS) {
      acc = 0;
      try { readMood(); } catch { /* never throw into the frame loop */ }
    }
    if (open) { try { drawMeter(); } catch { /* same */ } }
  });

  // Test and console hook: offline renders show a scene is neither silent nor clipping.
  (window as unknown as { __sallowSound: unknown }).__sallowSound = { names: SFX_NAMES, render: renderScene, state: () => state };
};
