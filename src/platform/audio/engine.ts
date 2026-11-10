// The synth itself: graph, voices, the per-screen score, ambience beds and the sfx
// vocabulary. It runs on any BaseAudioContext and every sound takes an explicit start
// time, so the same code plays live (index.ts) and renders offline (renderScene).
// No audio files: oscillators and one generated noise buffer.
import type { AudioMix, AudioMood, ScreenId } from '@/contracts/platform';

interface Bus { readonly dry: GainNode; readonly wet: readonly GainNode[]; readonly cap: number }
interface Mood {
  seed: number; depth: number; speed: number; day: number; wind: number; rain: number; sea: number; fire: number; cold: number;
  era: number; prosperity: number; souls: number; body: boolean; danger: number; intensity: number; boss: boolean; light: number;
}

const WET = [0, 0.18, 0.45, 0.8];
/** Hard ceiling on sounding voices. Music may use the first 26, ambience 30, effects all. */
const MAX_VOICES = 40;
const MASTER = 1;
const BASE = { music: 0.9, effects: 1, ambience: 0.8 };
// Seven-note modes, semitones from the root.
const MODES: readonly (readonly number[])[] = [
  [0, 2, 3, 5, 7, 9, 10], // dorian
  [0, 2, 3, 5, 7, 8, 10], // aeolian
  [0, 2, 4, 6, 7, 9, 11], // lydian
  [0, 2, 4, 5, 7, 9, 10], // mixolydian
  [0, 1, 3, 5, 7, 8, 10], // phrygian
  [0, 2, 4, 5, 7, 9, 11], // ionian
  [0, 2, 3, 5, 7, 8, 11], // harmonic minor
  [0, 2, 3, 5, 7, 9, 11], // melodic minor
  [0, 1, 4, 5, 7, 8, 10], // phrygian dominant
];
export const MODE_NAMES = ['dorian', 'aeolian', 'lydian', 'mixolydian', 'phrygian', 'ionian', 'harmonic minor', 'melodic minor', 'phrygian dominant'] as const;
const PROGS: readonly (readonly number[])[] = [[0, 5, 3, 4], [0, 3, 4, 3], [0, 2, 3, 0], [0, 4, 5, 3], [0, 6, 5, 6], [0, 3, 0, 4], [0, 5, 1, 4]];
const ARP = [0, 2, 4, 7];
const draw = (s: number) => (Math.imul(s ^ (s >>> 15), 2246822519) + 0x632be5ab) >>> 0;
/** The mode a universe hums in (the first thing its seed decides). */
export const modeOfSeed = (seed: number): string => MODE_NAMES[(draw(((seed >>> 0) ^ 0x9e3779b9) >>> 0) >>> 9) % MODES.length]!;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export interface Engine {
  setScene(scene: ScreenId, t: number, immediate?: boolean): void;
  setMood(mood: AudioMood): void;
  setMix(mix: AudioMix, t: number): void;
  setMuted(muted: boolean, t: number): void;
  /** Play one of the 8 steps of a pulse cycle at time t. */
  step(step: number, t: number): void;
  sfx(name: string, amount: number, t: number): void;
  names(): readonly string[];
  meter(): { readonly peak: number; readonly rms: number };
  /** What this universe sounds like, for the demo and the Sound page. */
  identity(): { mode: string; root: number };
  voices(t: number): number;
  stop(): void;
}

export const createEngine = (ac: BaseAudioContext): Engine => {
  const gain = (v: number) => { const g = ac.createGain(); g.gain.value = v; return g; };
  const filter = (type: BiquadFilterType, hz: number, q = 0.7) => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q; return f; };

  /* ---------- Master chain: gain -> compressor -> soft clip -> meter -> out ---------- */
  const master = gain(MASTER);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 8;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;
  // Linear to 0.6, then a soft knee that tops out near 0.89: the output can never reach 1.
  const clip = ac.createWaveShaper();
  const curve = new Float32Array(1025);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / 512) - 1;
    const a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= 0.6 ? a : 0.6 + 0.35 * Math.tanh((a - 0.6) / 0.35));
  }
  clip.curve = curve;
  const analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  master.connect(comp);
  comp.connect(clip);
  clip.connect(analyser);
  analyser.connect(ac.destination);

  /* ---------- Room: two damped feedback delays, left and right ---------- */
  const room = gain(1);
  const roomOut = gain(0.7);
  roomOut.connect(master);
  [[0.29, 0.4, -0.6], [0.41, 0.36, 0.6]].forEach(([time, fb, pan]) => {
    const d = ac.createDelay(1);
    d.delayTime.value = time!;
    const damp = filter('lowpass', 2600);
    const back = gain(fb!);
    room.connect(d);
    d.connect(damp);
    damp.connect(back);
    back.connect(d);
    if (typeof ac.createStereoPanner === 'function') {
      const p = ac.createStereoPanner();
      p.pan.value = pan!;
      damp.connect(p);
      p.connect(roomOut);
    } else damp.connect(roomOut);
  });

  /* ---------- Buses: music (two crossfading slots), effects, ambience ---------- */
  const category = (level: number) => {
    const vol = gain(level);
    const wetVol = gain(level);
    vol.connect(master);
    wetVol.connect(room);
    return { vol, wetVol };
  };
  const bus = (dest: AudioNode, wetDest: AudioNode, cap: number, level = 1): Bus => {
    const dry = gain(level);
    dry.connect(dest);
    const wet = WET.map((w) => { const g = gain(w * level); g.connect(wetDest); return g; });
    return { dry, wet, cap };
  };
  const music = category(BASE.music);
  const effects = category(BASE.effects);
  const ambience = category(BASE.ambience);
  const musicTone = filter('lowpass', 6500, 0.5);
  musicTone.connect(music.vol);
  const slots: Bus[] = [bus(musicTone, music.wetVol, 26, 1), bus(musicTone, music.wetVol, 26, 0)];
  const fx = bus(effects.vol, effects.wetVol, MAX_VOICES);
  const amb = bus(ambience.vol, ambience.wetVol, 30);
  const fade = (b: Bus, to: number, t: number, tc: number) => {
    b.dry.gain.setTargetAtTime(to, t, tc);
    for (let i = 1; i < b.wet.length; i++) b.wet[i]!.gain.setTargetAtTime(WET[i]! * to, t, tc);
  };

  /* ---------- Noise ---------- */
  let lcg = 0x1234567;
  const rnd = (n: number) => {
    lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
    return (lcg >>> 8) % n;
  };
  const noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 2), ac.sampleRate);
  {
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (rnd(2001) - 1000) / 1000;
  }

  /* ---------- Voices. Bounded: a voice only starts if a slot is free at its start time. ---------- */
  const ends = new Float64Array(MAX_VOICES);
  const claim = (b: Bus, t: number, end: number): boolean => {
    for (let i = 0; i < b.cap; i++) if (ends[i]! <= t) { ends[i] = end; return true; }
    return false;
  };
  const env = (g: GainNode, t: number, vol: number, dur: number, attack: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  };
  const route = (g: AudioNode, b: Bus, wet: number, pan: number) => {
    let tail = g;
    if (pan !== 0 && typeof ac.createStereoPanner === 'function') {
      const p = ac.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      tail = p;
    }
    tail.connect(b.dry);
    if (wet > 0) tail.connect(b.wet[wet]!);
  };
  /** One enveloped oscillator. hz1 > 0 glides the pitch there over the note. */
  const tone = (b: Bus, t: number, hz: number, vol: number, dur: number, type: OscillatorType = 'sine', wet = 1, hz1 = 0, attack = 0.006, pan = 0) => {
    if (!(hz > 16) || hz > 16000 || !claim(b, t, t + dur)) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(hz, t);
    if (hz1 > 0) o.frequency.exponentialRampToValueAtTime(Math.max(20, hz1), t + dur);
    env(g, t, vol, dur, Math.min(attack, dur / 3));
    o.connect(g);
    route(g, b, wet, pan);
    o.start(t);
    o.stop(t + dur + 0.03);
  };
  /** Filtered noise, swept from f0 to f1. */
  const hiss = (b: Bus, t: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, wet = 1, q = 1.2, attack = 0.01) => {
    if (!claim(b, t, t + dur)) return;
    const s = ac.createBufferSource();
    const f = ac.createBiquadFilter();
    const g = ac.createGain();
    s.buffer = noise;
    s.loop = true;
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    env(g, t, vol, dur, Math.min(attack, dur / 3));
    s.connect(f);
    f.connect(g);
    route(g, b, wet, 0);
    s.start(t, rnd(1900) / 1000);
    s.stop(t + dur + 0.03);
  };
  const kick = (b: Bus, t: number, vol: number, hz = 120) => tone(b, t, hz, vol, 0.28, 'sine', 0, hz * 0.36, 0.004);
  const snare = (b: Bus, t: number, vol: number) => { hiss(b, t, 0.13, vol, 'bandpass', 1900, 1400, 1, 0.8, 0.004); tone(b, t, 190, vol * 0.6, 0.09, 'triangle', 0, 140, 0.004); };
  const hat = (b: Bus, t: number, vol: number) => hiss(b, t, 0.045, vol, 'highpass', 7000, 7000, 0, 0.7, 0.003);
  const bell = (b: Bus, t: number, hz: number, vol: number, dur: number, wet = 2, pan = 0) => {
    tone(b, t, hz, vol, dur, 'sine', wet, 0, 0.004, pan);
    tone(b, t, hz * 2.76, vol * 0.28, dur * 0.4, 'sine', wet, 0, 0.004, pan);
  };
  /** Soft felt key: a triangle with a sine an octave under it. */
  const key = (b: Bus, t: number, hz: number, vol: number, dur: number, wet = 2) => {
    tone(b, t, hz, vol, dur, 'triangle', wet, 0, 0.012);
    tone(b, t, hz / 2, vol * 0.5, dur * 1.2, 'sine', wet, 0, 0.02);
  };

  /* ---------- Per-universe identity ---------- */
  const mood: Mood = { seed: 0, depth: 0, speed: 0, day: 500, wind: 0, rain: 0, sea: 0, fire: 0, cold: 0, era: 0, prosperity: 0.5, souls: 0, body: false, danger: 0, intensity: 0.4, boss: false, light: 1 };
  let scale = MODES[0]!;
  let modeIx = 0;
  let rootSemis = 0;
  let rootHz = 55;
  let prog = PROGS[0]!;
  const motif = new Int8Array(8);
  let identitySeed = -1;
  const identify = (seed: number) => {
    seed >>>= 0;
    if (seed === identitySeed) return;
    identitySeed = seed;
    let s = (seed ^ 0x9e3779b9) >>> 0;
    const next = (n: number) => { s = draw(s); return (s >>> 9) % n; };
    modeIx = next(MODES.length);
    scale = MODES[modeIx]!;
    rootSemis = next(12);
    rootHz = 55 * 2 ** (rootSemis / 12);
    prog = PROGS[next(PROGS.length)]!;
    // The universe's motif: a short walk that leaves home and comes back.
    let d = 0;
    for (let i = 0; i < 8; i++) {
      motif[i] = d;
      d += [-2, -1, -1, 1, 1, 2, 3][next(7)]!;
      if (d > 6) d -= 4;
      if (d < -3) d += 4;
    }
    motif[0] = 0;
    motif[7] = next(2) ? 4 : 2;
  };
  identify(0);
  let inv = false;
  /** Scale degree to Hz. In the mirror every interval is turned upside down. */
  const note = (deg: number, oct: number): number => {
    const o = Math.floor(deg / 7);
    const semis = scale[deg - o * 7]! + 12 * o;
    return rootHz * 2 ** ((inv ? 12 - semis : semis) / 12 + oct);
  };

  /* ---------- Pad: four oscillators that never stop; chords glide, the filter breathes ---------- */
  const padFilter = filter('lowpass', 400, 1.4);
  const padGain = gain(0);
  padFilter.connect(padGain);
  padGain.connect(musicTone);
  const padSend = gain(0.5);
  padGain.connect(padSend);
  padSend.connect(music.wetVol);
  const running: (OscillatorNode | AudioBufferSourceNode)[] = [];
  const pad = [['sawtooth', -6, 0.3], ['sawtooth', 7, 0.3], ['triangle', 0, 0.5], ['sine', 0, 0.6]].map(([type, cents, level]) => {
    const o = ac.createOscillator();
    o.type = type as OscillatorType;
    o.detune.value = cents as number;
    o.frequency.value = rootHz * 2;
    const g = gain(level as number);
    o.connect(g);
    g.connect(padFilter);
    o.start();
    running.push(o);
    return o;
  });

  /* ---------- Ambience beds: looping noise and a few slow oscillators, levels ramped ---------- */
  const loop = (rate: number) => {
    const s = ac.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(0, rnd(1900) / 1000);
    running.push(s);
    return s;
  };
  const lfo = (hz: number, depth: number, into: AudioParam) => {
    const o = ac.createOscillator();
    o.frequency.value = hz;
    const g = gain(depth);
    o.connect(g);
    g.connect(into);
    o.start();
    running.push(o);
  };
  const bed = (src: AudioNode, wet: number) => {
    const level = gain(0);
    src.connect(level);
    level.connect(amb.dry);
    if (wet > 0) level.connect(amb.wet[wet]!);
    return level.gain;
  };
  const windBp = filter('bandpass', 450, 1.1);
  loop(0.7).connect(windBp);
  lfo(0.07, 180, windBp.frequency);
  const windLevel = bed(windBp, 1);
  const rainHp = filter('highpass', 1800, 0.5);
  const rainLp = filter('lowpass', 8000, 0.5);
  loop(1).connect(rainHp);
  rainHp.connect(rainLp);
  const rainLevel = bed(rainLp, 1);
  const surfLp = filter('lowpass', 650, 0.6);
  const surfAm = gain(0.55);
  loop(0.85).connect(surfLp);
  surfLp.connect(surfAm);
  lfo(0.09, 0.45, surfAm.gain);
  const surfLevel = bed(surfAm, 1);
  const bug = ac.createOscillator();
  bug.frequency.value = 4400;
  bug.start();
  running.push(bug);
  const chirp = gain(0.5);
  const swell = gain(0.5);
  bug.connect(chirp);
  chirp.connect(swell);
  lfo(19, 0.5, chirp.gain);
  lfo(0.6, 0.5, swell.gain);
  const bugLevel = bed(swell, 1);
  const fireBp = filter('bandpass', 480, 0.6);
  loop(0.5).connect(fireBp);
  const fireLevel = bed(fireBp, 0);

  /* ---------- Score state ---------- */
  let scene: ScreenId = 'bedroom';
  let prev: ScreenId = 'bedroom';
  let pending: ScreenId | null = null;
  let cur = 0;
  let fadeSteps = 0;
  let bar = 0;
  let chord = 0;
  let muted = false;
  const mix = { master: 1, music: 1, effects: 1, ambience: 1 };

  const light = () => 0.5 - 0.5 * Math.cos((mood.day / 1000) * Math.PI * 2); // 0 midnight, 1 noon
  const tension = () => clamp01((mood.depth / 40) * 0.6 + mood.speed * 0.45);

  // What each scene plays on each of the 8 steps of a pulse cycle.
  const bedroom = (b: Bus, s: number, t: number, glass: boolean) => {
    if (s === 0) tone(b, t, note(chord, 1), 0.085, 2.4, 'sine', 2, 0, 0.03);
    if ((s === 0 || s === 3 || s === 6) && bar % 4 < 3 && (s === 0 || rnd(3) > 0)) {
      const hz = note(chord + motif[(bar * 3 + s) & 7]!, 3);
      if (glass) bell(b, t, hz, 0.04, 1.8, 3); else key(b, t, hz, 0.045, 1.5, 2);
    }
    if (s === 4 && bar % 2 === 1) tone(b, t, note(chord + 4, 2), 0.035, 1.8, 'sine', 2, 0, 0.04);
  };
  const SCENES: Record<ScreenId, (b: Bus, s: number, t: number) => void> = {
    bedroom: (b, s, t) => bedroom(b, s, t, false),
    // The bedroom theme seen in glass: intervals inverted, the bar read backwards.
    mirror: (b, s, t) => { inv = true; bedroom(b, 7 - s, t, true); inv = false; },
    box: (b, s, t) => {
      if (s === 0) tone(b, t, note(chord, 1), 0.07, 1.3, 'sine', 1, 0, 0.02);
      if (s === 0 || s === 2 || s === 3 || s === 5 || s === 6) bell(b, t, note(chord + motif[(bar * 5 + s) & 7]!, 3), 0.042, 1.1, 2, (s - 3) / 8);
      if (s === 7 && bar % 4 === 3) { bell(b, t, note(chord + 4, 4), 0.025, 0.8, 3); bell(b, t + 0.07, note(chord + 7, 4), 0.025, 1, 3); }
    },
    dive: (b, s, t) => {
      const T = tension();
      if (s === 0 || (s === 4 && T > 0.25) || ((s === 2 || s === 6) && T > 0.8)) kick(b, t, 0.15 + 0.13 * T);
      if (s % 2 === 0) tone(b, t, note(chord + ARP[(s / 2 + bar) & 3]!, T > 0.6 ? 3 : 2), 0.05, 0.32, 'triangle', 2);
      else if (T > 0.5) tone(b, t, note(chord + ARP[(s + bar) & 3]! + 2, 3), 0.022, 0.16, 'sawtooth', 2);
      if (s % 2 === 1 && T > 0.3) hat(b, t, 0.025 + 0.04 * T);
      if ((s === 0 || s === 3 || s === 6) && T > 0.15) tone(b, t, note(chord, 1), 0.075, 0.26, 'triangle', 0);
      // The deeper you are, the more a wrong note leans on the chord.
      if (s === 0 && T > 0.6) tone(b, t, note(chord, 3) * 1.0595, 0.018 * T, 1.3, 'sine', 3, 0, 0.2);
      if (s === 6 && bar % 4 === 3 && T > 0.2) hiss(b, t, 0.5, 0.03 * T, 'bandpass', 500, 5000, 2, 1.5, 0.3);
    },
    system: (b, s, t) => {
      if (s === 0 && bar % 2 === 0) {
        tone(b, t, note(chord, 1), 0.085, 4.2, 'sine', 2, 0, 0.3);
        bell(b, t, note(chord + motif[(bar >> 1) & 7]!, 3), 0.038, 3.2, 3, bar % 4 === 0 ? -0.5 : 0.5);
      }
      if (s === 4 && bar % 4 === 2) tone(b, t, note(chord + 4, 2), 0.04, 3.2, 'triangle', 3, 0, 0.4);
      if ((s === 3 || s === 5) && rnd(3) === 0) tone(b, t, note(chord + 2 * rnd(4), 4), 0.018, 2.2, 'sine', 3, 0, 0.01, (rnd(17) - 8) / 9);
    },
    planet: (b, s, t) => {
      const L = light();
      const P = mood.prosperity;
      const E = mood.era;
      const alive = mood.souls > 0;
      const soft = 1 - 0.3 * mood.rain;
      if (s === 0 && bar % 2 === 0) tone(b, t, note(chord, 1), 0.07, 2.4, 'sine', 2, 0, 0.05);
      if (mood.body) {
        // In a body the world is close: a heart, and the tune an octave down.
        if (s < 2) kick(b, t, s === 0 ? 0.13 : 0.085, 70);
        if (s % 2 === 1 && mood.danger > 0.2) hat(b, t, 0.03 + 0.04 * mood.danger);
        if (s === 0 || s === 4) key(b, t, note(chord + motif[(bar * 2 + s) & 7]!, 2), 0.045, 1.4, 3);
        return;
      }
      if (!alive) {
        if (s === 5 && rnd(6) === 0) tone(b, t, note(chord + 4, 3), 0.02, 2.6, 'sine', 3, 0, 0.3);
        return;
      }
      const day = L > 0.3;
      if (E >= 1 && s === 0) kick(b, t, (0.05 + 0.06 * P) * (0.4 + 0.6 * L), 95);
      if (E >= 1 && s === 4 && P > 0.5 && day) kick(b, t, 0.05, 130);
      if (E >= 2 && (s === 2 || s === 6) && P > 0.6 && L > 0.5) hat(b, t, 0.022);
      const density = (0.2 + 0.5 * P) * (day ? 1 : 0.4);
      if (s !== 0 && rnd(100) >= density * 100) return;
      const poor = P < 0.3;
      const hz = note(chord + motif[(bar * 2 + s) & 7]!, poor ? 2 : 3);
      const v = 0.05 * soft * (poor ? 0.8 : 1);
      const wet = mood.rain > 0.4 ? 3 : 2;
      if (!day) tone(b, t, hz, v * 0.6, 2, 'sine', 3, 0, 0.05);
      else if (E <= 0) tone(b, t, hz, v, poor ? 1.6 : 0.9, 'sine', wet, 0, 0.05); // a voice, a reed
      else if (E === 1) tone(b, t, hz, v, poor ? 1 : 0.5, 'triangle', wet); // plucked gut
      else if (E === 2) { tone(b, t, hz, v, 0.6, 'triangle', wet); tone(b, t, hz * 3, v * 0.15, 0.2, 'sine', wet); } // struck iron
      else if (E === 3) bell(b, t, hz, v * 0.9, 1.2, wet);
      else if (E === 4) { bell(b, t, hz, v * 0.85, 1.6, wet); if (s === 0) bell(b, t, note(chord + 4, 2), v * 0.7, 2.4, 3); } // bell towers
      else { tone(b, t, hz, v * 0.5, 0.3, 'square', wet); tone(b, t + 0.01, hz * 2, v * 0.4, 0.9, 'sine', 3); } // star-reaching
    },
    outside: (b, s, t) => {
      if (s === 0) { tone(b, t, note(0, 0), 0.11, 2.2, 'triangle', 1, 0, 0.05); tone(b, t, note(0, 1) * 1.012, 0.035, 2.2, 'sine', 2, 0, 0.2); }
      if (s === 5 && rnd(3) === 0) tone(b, t, note(1, 2) * 1.06, 0.032, 1.9, 'sine', 3, 0, 0.1);
      if (s === 2 && bar % 4 === 1) bell(b, t, note(chord + motif[bar & 7]!, 3), 0.02, 2.6, 3, 0.4);
      if (s === 0 && bar % 8 === 4) hiss(b, t, 2.2, 0.018, 'bandpass', 300, 1400, 2, 2, 0.8);
    },
    battle: (b, s, t) => {
      const I = clamp01(mood.intensity);
      const boss = mood.boss;
      if (s === 0 || s === 4 || (s === 6 && I > 0.5) || (boss && s % 2 === 0)) kick(b, t, 0.2 + 0.08 * I, boss ? 100 : 120);
      if (s === 2 || s === 6) snare(b, t, 0.06 + 0.05 * I);
      if (s % 2 === 1) hat(b, t, 0.035 + 0.035 * I); else if (I > 0.7) hat(b, t, 0.02);
      if (s % 2 === 0 || I > 0.4) tone(b, t, note(chord, 1), 0.07, 0.15, 'triangle', 0);
      if (boss && s % 2 === 0) tone(b, t, note(chord, 0), 0.05, 0.2, 'sawtooth', 0);
      if (s === 2 || s === 6 || s === 7 || (I > 0.6 && s % 2 === 1)) tone(b, t, note(chord + motif[(bar * 3 + s) & 7]!, I > 0.8 ? 3 : 2), 0.04, 0.2, 'square', 1);
      if ((s === 1 || s === 5) && mood.danger > 0.6) tone(b, t, note(chord + 4, 4), 0.028, 0.08, 'sine', 2);
      if (boss && s === 0 && bar % 2 === 0) { tone(b, t, note(chord, 2), 0.04, 0.55, 'sawtooth', 2); tone(b, t, note(chord, 2) * 1.4142, 0.035, 0.55, 'sawtooth', 2); }
    },
  };

  const padShape = (t: number, s: number) => {
    let level = 0.045;
    let cut = 500;
    switch (scene) {
      case 'bedroom': level = 0.05; cut = 480; break;
      case 'mirror': level = 0.05; cut = 700; break;
      case 'box': level = 0.035; cut = 900; break;
      case 'dive': { const T = tension(); level = 0.045 + 0.035 * T; cut = 380 + 1700 * T; break; }
      case 'system': level = 0.065; cut = 1300; break;
      case 'planet': level = mood.body ? 0.035 : 0.042; cut = (mood.body ? 320 : 380) + 900 * light() * (0.5 + 0.5 * mood.prosperity); break;
      case 'outside': level = 0.05; cut = 340; break;
      case 'battle': level = 0.03; cut = 700 + 900 * clamp01(mood.intensity); break;
    }
    cut *= 0.6 + 0.4 * clamp01(mood.light);
    // The filter opens on the downbeat and closes through the cycle.
    padFilter.frequency.setTargetAtTime(cut * (1.35 - 0.07 * s), t, 0.12);
    padGain.gain.setTargetAtTime(level, t, 0.4);
  };
  const padChord = (t: number) => {
    inv = scene === 'mirror';
    pad[0]!.frequency.setTargetAtTime(note(chord, 1), t, 0.25);
    pad[1]!.frequency.setTargetAtTime(note(chord, 1), t, 0.25);
    pad[2]!.frequency.setTargetAtTime(note(chord + 2, 2), t, 0.25);
    pad[3]!.frequency.setTargetAtTime(note(chord + 4, 1), t, 0.25);
    inv = false;
  };
  const beds = (t: number) => {
    let wind = 0, rain = 0, surf = 0, bugs = 0, fire = 0;
    if (scene === 'planet') {
      const night = clamp01((0.35 - light()) / 0.35);
      wind = mood.wind;
      rain = mood.rain;
      surf = mood.sea * (0.4 + 0.6 * mood.wind);
      bugs = night * (1 - mood.rain) * (1 - mood.cold) * 0.8;
      fire = mood.fire;
    } else if (scene === 'outside') { wind = 0.3; bugs = 0.3; }
    else if (scene === 'dive') wind = mood.speed * 0.45;
    windBp.frequency.setTargetAtTime(350 + 600 * wind, t, 0.6);
    windLevel.setTargetAtTime(0.1 * clamp01(wind), t, 0.5);
    rainLevel.setTargetAtTime(0.085 * clamp01(rain), t, 0.5);
    surfLevel.setTargetAtTime(0.085 * clamp01(surf), t, 0.5);
    bugLevel.setTargetAtTime(0.012 * clamp01(bugs), t, 0.5);
    fireLevel.setTargetAtTime(0.05 * clamp01(fire), t, 0.5);
  };

  const swap = (t: number) => {
    if (!pending) return;
    prev = scene;
    scene = pending;
    pending = null;
    fade(slots[cur]!, 0, t, 0.3);
    cur ^= 1;
    fade(slots[cur]!, 1, t, 0.12);
    fadeSteps = 6;
    padChord(t);
  };

  /* ---------- Sound effects. T is the start time of the effect being built. ---------- */
  let T = 0;
  const sw = (f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine', wet = 1, delay = 0) => tone(fx, T + delay, f0, vol, dur, type, wet, f1 === f0 ? 0 : f1);
  const hs = (dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, wet = 1, delay = 0) => hiss(fx, T + delay, dur, vol, type, f0, f1, wet);
  const th = (vol: number, delay = 0, hz = 130) => kick(fx, T + delay, vol, hz);
  const bl = (deg: number, oct: number, vol: number, dur: number, delay = 0, wet = 2) => bell(fx, T + delay, note(deg, oct), vol, dur, wet);
  const arp = (degs: readonly number[], oct: number, gap: number, vol: number, dur = 0.5, type: OscillatorType = 'sine') => {
    for (let i = 0; i < degs.length; i++) tone(fx, T + i * gap, note(degs[i]!, oct), vol, dur, type, 3);
  };
  const footfall = (f: number, vol: number, type: BiquadFilterType = 'lowpass') => hs(0.07, vol, type, f + rnd(200), f * 0.5, 0);
  const SFX: Record<string, (a: number) => void> = {
    // --- Interface ---
    tap: (a) => sw(900, 700, 0.05, 0.03 + 0.04 * a, 'triangle', 0),
    confirm: () => { sw(note(0, 3), note(0, 3), 0.09, 0.05, 'triangle', 1); sw(note(4, 3), note(4, 3), 0.16, 0.05, 'triangle', 2, 0.07); },
    deny: () => { sw(180, 120, 0.16, 0.07, 'square', 0); sw(150, 100, 0.16, 0.05, 'square', 0, 0.09); },
    back: () => { sw(note(4, 3), note(4, 3), 0.08, 0.04, 'triangle', 1); sw(note(0, 3), note(0, 3), 0.14, 0.04, 'triangle', 1, 0.06); },
    nav: () => { sw(note(0, 3), note(2, 3), 0.12, 0.05, 'sine', 2); hs(0.18, 0.02, 'bandpass', 800, 3000); },
    open: () => { hs(0.22, 0.025, 'bandpass', 500, 2600, 1); sw(note(0, 2), note(4, 2), 0.2, 0.04, 'sine', 2); },
    close: () => { hs(0.2, 0.025, 'bandpass', 2600, 500, 1); sw(note(4, 2), note(0, 2), 0.2, 0.04, 'sine', 2); },
    toggle: (a) => sw(a >= 0.5 ? 620 : 880, a >= 0.5 ? 880 : 620, 0.07, 0.045, 'triangle', 0),
    slider: (a) => sw(300 + 900 * a, 300 + 900 * a, 0.035, 0.035, 'sine', 0),
    toast: () => { bl(4, 3, 0.035, 0.5); bl(7, 3, 0.03, 0.7, 0.09); },
    gain: () => { bl(2, 3, 0.03, 0.4); bl(4, 3, 0.03, 0.6, 0.07); },
    chapter: () => { arp([0, 2, 4, 7], 2, 0.11, 0.06, 1.2, 'triangle'); arp([4, 7, 9, 11, 14], 3, 0.11, 0.04, 1.6); bl(0, 2, 0.06, 3, 0.55, 3); th(0.16, 0.55, 90); },
    // --- Sky pieces and the system ---
    place: () => { sw(500, 900, 0.12, 0.06, 'sine', 2); sw(900, 1350, 0.25, 0.035, 'sine', 3, 0.1); },
    take: () => { sw(1100, 700, 0.1, 0.045, 'sine', 2); sw(700, 420, 0.18, 0.04, 'sine', 2, 0.08); },
    orbit: () => sw(220, 330, 0.4, 0.06, 'sine', 3),
    pull: () => sw(220, 330, 0.4, 0.06, 'sine', 3),
    push: () => sw(330, 200, 0.4, 0.06, 'sine', 3),
    flare: () => { hs(1.2, 0.14, 'bandpass', 200, 5000, 2); sw(80, 600, 1.0, 0.09, 'sawtooth', 2); },
    shower: () => { for (let i = 0; i < 5; i++) sw(1600 - i * 150, 200, 0.25, 0.04, 'sawtooth', 2, i * 0.09); },
    eclipse: () => { sw(note(0, 2), note(0, 0), 1.6, 0.09, 'sine', 3); hs(1.6, 0.04, 'lowpass', 600, 80, 2); },
    sow: () => arp([0, 2, 4, 7], 3, 0.1, 0.045, 0.7, 'triangle'),
    // --- The dive ---
    zoom: (a) => sw(300 + a * 500, 380 + a * 600, 0.08, 0.03, 'sine', 2),
    'zoom-in': (a) => { sw(260 + a * 500, 420 + a * 700, 0.1, 0.03, 'sine', 2); hs(0.1, 0.012, 'bandpass', 900, 2400, 1); },
    'zoom-out': (a) => { sw(420 + a * 700, 260 + a * 500, 0.1, 0.03, 'sine', 2); hs(0.1, 0.012, 'bandpass', 2400, 900, 1); },
    fold: (a) => { hs(0.35, 0.045, 'bandpass', 300, 2400, 2); sw(note(0, 2) * (1 + a), note(0, 1), 0.3, 0.055, 'sine', 2); },
    star: () => { bl(0, 3, 0.05, 1.6, 0, 3); bl(4, 3, 0.04, 1.8, 0.12, 3); hs(0.6, 0.02, 'highpass', 5000, 9000, 3); },
    land: () => { arp([0, 2, 4], 2, 0, 0.055, 1.6, 'triangle'); th(0.18); },
    'catch': () => { arp([0, 2, 4, 7, 9], 3, 0.06, 0.055, 0.6); hs(0.4, 0.025, 'highpass', 4000, 9000, 3); },
    pickup: () => { sw(note(4, 3), note(4, 3), 0.07, 0.045, 'triangle', 2); sw(note(7, 3), note(7, 3), 0.18, 0.045, 'triangle', 2, 0.06); },
    hazard: () => { sw(110, 104, 0.35, 0.09, 'sawtooth', 1); sw(155.6, 147, 0.35, 0.07, 'sawtooth', 1); hs(0.3, 0.03, 'lowpass', 900, 200, 1); },
    'low-light': () => { sw(note(0, 2), note(0, 2) * 0.94, 0.5, 0.06, 'sine', 3); sw(note(0, 2), note(0, 2) * 0.94, 0.5, 0.05, 'sine', 3, 0.6); },
    // --- God tools ---
    water: () => { sw(500 + rnd(500), 1200 + rnd(600), 0.09, 0.045, 'sine', 2); hs(0.12, 0.02, 'bandpass', 1500, 2500); },
    sand: () => hs(0.16, 0.05, 'highpass', 2500, 5000, 1),
    stone: () => { sw(140, 90, 0.08, 0.1, 'square', 0); hs(0.05, 0.07, 'lowpass', 1200, 400, 0); },
    seed: () => arp([rnd(5), 2 + rnd(5)], 3, 0.05, 0.04, 0.3),
    erase: () => sw(700, 150, 0.14, 0.045, 'triangle', 1),
    fire: () => { hs(0.3, 0.06, 'bandpass', 900, 300, 1); for (let i = 0; i < 3; i++) hs(0.02, 0.07, 'highpass', 3000, 6000, 0, rnd(25) / 100); },
    freeze: () => { arp([7, 9, 12], 4, 0.03, 0.035, 0.4); hs(0.25, 0.03, 'highpass', 7000, 9000, 3); },
    heat: () => hs(0.5, 0.05, 'lowpass', 200, 900, 1),
    cold: () => { hs(0.6, 0.035, 'highpass', 3000, 8000, 3); sw(1800, 900, 0.5, 0.02, 'sine', 3); },
    rain: () => hs(1.6, 0.06, 'highpass', 2000, 5000, 2),
    lightning: () => { hs(0.08, 0.22, 'highpass', 5000, 800, 1); hs(1.8, 0.16, 'lowpass', 400, 60, 2, 0.06); },
    thunder: (a) => { hs(2.4, 0.07 + 0.08 * a, 'lowpass', 300, 50, 3, 0.1); sw(70, 34, 1.6, 0.08 + 0.06 * a, 'sine', 1, 0.1); },
    wind: (a) => hs(1.8, 0.03 + 0.05 * a, 'bandpass', 300, 1100, 2),
    meteor: () => { sw(1400, 90, 0.5, 0.07, 'sawtooth', 1); hs(1.4, 0.22, 'lowpass', 900, 50, 2, 0.45); sw(110, 30, 0.9, 0.28, 'sine', 1, 0.45); },
    quake: () => { hs(1.6, 0.22, 'lowpass', 120, 50, 1); sw(60, 32, 1.4, 0.26, 'sine', 0); },
    bless: () => { arp([0, 4, 7, 9, 12, 16], 2, 0.08, 0.05, 1.6); arp([0, 7], 1, 0, 0.045, 2.0, 'triangle'); },
    smite: () => { sw(300, 40, 0.5, 0.22, 'sawtooth', 2); hs(0.6, 0.16, 'lowpass', 2000, 80, 2); },
    whisper: () => { hs(1.0, 0.045, 'bandpass', 1200, 2600, 3); sw(note(4, 3), note(5, 3), 0.9, 0.025, 'sine', 3); },
    merge: () => { sw(note(0, 1), note(0, 3), 0.7, 0.06, 'sine', 3); sw(note(2, 3), note(0, 3), 0.7, 0.05, 'sine', 3); hs(0.7, 0.04, 'bandpass', 300, 6000, 2); arp([0, 4, 7, 11], 3, 0.05, 0.055, 1.2, 'triangle'); th(0.2); },
    // --- The colony ---
    village: () => { th(0.14, 0, 100); arp([0, 4, 7], 2, 0.12, 0.05, 1.2, 'triangle'); bl(7, 3, 0.035, 1.6, 0.36, 3); },
    birth: () => { bl(7, 3, 0.03, 0.9, 0, 3); bl(9, 3, 0.025, 1.1, 0.1, 3); },
    death: () => { bl(0, 2, 0.06, 3.2, 0, 3); sw(note(0, 1), note(0, 1), 2.4, 0.04, 'sine', 3); },
    soul: () => sw(note(4, 3), note(7, 3), 0.5, 0.03, 'sine', 3),
    festival: () => { for (let i = 0; i < 6; i++) { th(0.1, i * 0.14, i % 2 ? 150 : 100); tone(fx, T + i * 0.14, note([0, 2, 4, 2, 4, 7][i]!, 3), 0.045, 0.22, 'triangle', 2); } hs(0.9, 0.02, 'highpass', 6000, 9000, 2); },
    war: () => { sw(note(0, 1), note(0, 1) * 1.02, 1.3, 0.09, 'sawtooth', 2); sw(note(4, 1), note(4, 1), 1.1, 0.06, 'sawtooth', 2, 0.25); hs(1.3, 0.025, 'lowpass', 700, 300, 2); },
    launch: () => { hs(2.2, 0.14, 'lowpass', 200, 2400, 2); sw(50, 220, 2.2, 0.1, 'sawtooth', 1); arp([0, 4, 7, 11], 3, 0.12, 0.035, 1, 'sine'); },
    // --- A body ---
    step: () => footfall(500, 0.035),
    'step-grass': () => { footfall(900, 0.03, 'bandpass'); hs(0.05, 0.012, 'highpass', 4000, 6000, 0, 0.02); },
    'step-sand': () => hs(0.11, 0.035, 'highpass', 2200, 3600, 0),
    'step-stone': () => { footfall(1400, 0.035); sw(240, 160, 0.03, 0.03, 'square', 0); },
    'step-snow': () => { hs(0.1, 0.035, 'bandpass', 1800, 900, 0); hs(0.04, 0.015, 'highpass', 6000, 7000, 0, 0.05); },
    'step-water': () => { sw(400 + rnd(200), 900, 0.07, 0.03, 'sine', 1); hs(0.1, 0.025, 'bandpass', 1200, 2400, 1); },
    'step-wood': () => { sw(190, 130, 0.05, 0.06, 'triangle', 0); footfall(700, 0.02); },
    body: () => { sw(note(0, 1), note(0, 2), 0.5, 0.08, 'triangle', 2); arp([0, 7, 11], 3, 0.1, 0.04, 0.8); },
    preach: () => { sw(note(0, 2), note(2, 2), 0.35, 0.045, 'triangle', 3); sw(note(2, 2), note(4, 2), 0.5, 0.045, 'triangle', 3, 0.3); hs(0.8, 0.02, 'bandpass', 900, 1800, 3); },
    gift: () => { arp([0, 2, 4, 7], 3, 0.07, 0.045, 0.9); th(0.08, 0, 160); },
    shine: () => { hs(0.9, 0.05, 'highpass', 3000, 9000, 3); arp([0, 4, 7, 11, 14], 3, 0.04, 0.035, 1.2); },
    rest: () => { sw(note(4, 2), note(0, 2), 0.9, 0.04, 'sine', 3); sw(note(7, 2), note(4, 2), 0.9, 0.03, 'sine', 3, 0.2); },
    // --- Battle ---
    strike: () => { th(0.28); hs(0.12, 0.1, 'lowpass', 2500, 300, 1); },
    hit: (a) => { th(0.16 + 0.14 * a, 0, 150); hs(0.08, 0.07, 'bandpass', 1800, 500, 0); },
    crit: () => { th(0.34); hs(0.3, 0.11, 'bandpass', 3000, 200, 1); sw(1200, 200, 0.3, 0.06, 'sawtooth', 2); },
    heal: () => arp([0, 2, 4, 5, 7], 3, 0.07, 0.045, 0.8),
    guard: () => { sw(320, 300, 0.12, 0.07, 'square', 1); sw(640, 610, 0.3, 0.04, 'triangle', 2, 0.02); hs(0.06, 0.05, 'highpass', 3000, 5000, 1); },
    status: () => { sw(520, 380, 0.14, 0.045, 'square', 1); sw(380, 520, 0.14, 0.045, 'square', 1, 0.14); },
    burn: () => { hs(0.4, 0.06, 'bandpass', 700, 2200, 1); sw(300, 520, 0.3, 0.03, 'sawtooth', 1); },
    chill: () => { arp([11, 9, 7], 4, 0.05, 0.03, 0.5); hs(0.35, 0.025, 'highpass', 7000, 9000, 3); },
    ward: () => { sw(note(0, 3), note(0, 3), 0.7, 0.04, 'sine', 3); sw(note(4, 3), note(4, 3), 0.7, 0.035, 'sine', 3, 0.02); },
    regen: () => arp([0, 4, 2, 7], 3, 0.09, 0.035, 0.6, 'triangle'),
    expose: () => { sw(900, 300, 0.25, 0.045, 'triangle', 2); hs(0.2, 0.03, 'bandpass', 3000, 800, 1); },
    energy: (a) => sw(note(Math.round(a * 7), 3), note(Math.round(a * 7), 3), 0.14, 0.04, 'triangle', 2),
    swap: () => { hs(0.25, 0.035, 'bandpass', 600, 3000, 1); sw(300, 600, 0.12, 0.04, 'sine', 2); sw(600, 300, 0.12, 0.04, 'sine', 2, 0.13); },
    flee: () => { for (let i = 0; i < 4; i++) footfall(700 + i * 150, 0.04 - i * 0.007); sw(700, 300, 0.4, 0.03, 'triangle', 2); },
    faint: () => { sw(note(4, 2), note(0, 1), 0.7, 0.07, 'triangle', 2); th(0.2, 0.6, 80); },
    level: () => { arp([0, 2, 4, 7, 9], 3, 0.07, 0.05, 0.5, 'triangle'); bl(14, 3, 0.04, 1.4, 0.4, 3); },
    boss: () => { sw(note(0, 0), note(0, 0), 1.6, 0.12, 'sawtooth', 2); sw(note(0, 0) * 1.4142, note(0, 0) * 1.4142, 1.6, 0.08, 'sawtooth', 2); th(0.3, 0, 90); hs(1.4, 0.05, 'lowpass', 300, 90, 2); },
    win: () => { arp([0, 2, 4, 7, 9, 11], 2, 0.09, 0.06, 0.9, 'triangle'); arp([4, 7, 9, 11], 3, 0.09, 0.04, 1.2); },
    lose: () => { sw(note(4, 2), note(0, 1), 0.9, 0.08, 'sawtooth', 2); sw(note(2, 2), note(0, 0), 1.2, 0.06, 'sine', 2, 0.1); },
  };
  SFX.panspermia = SFX.sow!;
  SFX['comet-strike'] = SFX.meteor!;
  const NAMES = Object.freeze(Object.keys(SFX).sort());
  const lastAt = new Map<string, number>();
  for (const n of NAMES) lastAt.set(n, -1);

  const level = { peak: 0, rms: 0 };
  const scope = new Float32Array(analyser.fftSize);

  return {
    setScene: (s, t, immediate) => {
      if (s === scene && !pending) return;
      pending = s === scene ? null : s;
      if (immediate) swap(t);
    },
    setMood: (m) => {
      mood.seed = (m.seed ?? 0) >>> 0;
      mood.depth = m.depth ?? 0;
      mood.speed = clamp01(m.speed ?? 0);
      mood.day = m.day ?? 500;
      mood.wind = clamp01(m.wind ?? 0);
      mood.rain = clamp01(m.rain ?? 0);
      mood.sea = clamp01(m.sea ?? 0);
      mood.fire = clamp01(m.fire ?? 0);
      mood.cold = clamp01(m.cold ?? 0);
      mood.era = Math.max(0, Math.min(5, Math.round(m.era ?? 0)));
      mood.prosperity = clamp01(m.prosperity ?? 0.5);
      mood.souls = m.souls ?? 0;
      mood.body = m.body ?? false;
      mood.danger = clamp01(m.danger ?? 0);
      mood.intensity = clamp01(m.intensity ?? 0.4);
      mood.boss = m.boss ?? false;
      mood.light = clamp01(m.light ?? 1);
      identify(mood.seed);
    },
    setMix: (m, t) => {
      if (m.master !== undefined) mix.master = clamp01(m.master);
      if (m.music !== undefined) mix.music = clamp01(m.music);
      if (m.effects !== undefined) mix.effects = clamp01(m.effects);
      if (m.ambience !== undefined) mix.ambience = clamp01(m.ambience);
      master.gain.setTargetAtTime(muted ? 0 : MASTER * mix.master, t, 0.012);
      for (const [c, v] of [[music, BASE.music * mix.music], [effects, BASE.effects * mix.effects], [ambience, BASE.ambience * mix.ambience]] as const) {
        c.vol.gain.setTargetAtTime(v, t, 0.03);
        c.wetVol.gain.setTargetAtTime(v, t, 0.03);
      }
    },
    setMuted: (m, t) => {
      muted = m;
      // Time constant 12 ms: under -30 dB inside 50 ms, with no click.
      master.gain.setTargetAtTime(m ? 0 : MASTER * mix.master, t, 0.012);
    },
    step: (s, t) => {
      if (pending && (s & 3) === 0) swap(t);
      if (s === 0) {
        bar++;
        // Battles change chord every cycle; everywhere else every other one.
        const c = prog[(scene === 'battle' ? bar : bar >> 1) % prog.length]!;
        if (c !== chord) { chord = c; padChord(t); }
      }
      if (fadeSteps > 0) {
        fadeSteps--;
        SCENES[prev](slots[cur ^ 1]!, s, t);
      }
      SCENES[scene](slots[cur]!, s, t);
      padShape(t, s);
      if ((s & 3) === 0) beds(t);
      // Flames spit now and then.
      if (scene === 'planet' && mood.fire > 0.05 && rnd(100) < mood.fire * 70) hiss(amb, t + rnd(100) / 1000, 0.025, 0.05 * mood.fire + 0.02, 'highpass', 2500 + rnd(2500), 6000, 0, 0.7, 0.003);
    },
    sfx: (name, amount, t) => {
      const recipe = SFX[name];
      const k = recipe ? name : 'tap';
      // The same effect retriggers at most every 70 ms, so painting does not turn into a roar.
      if (t - lastAt.get(k)! < 0.07) return;
      lastAt.set(k, t);
      T = t;
      if (recipe) recipe(clamp01(amount)); else SFX.tap!(0.15);
    },
    names: () => NAMES,
    meter: () => {
      analyser.getFloatTimeDomainData(scope);
      let peak = 0, sum = 0;
      for (let i = 0; i < scope.length; i++) {
        const v = scope[i]!;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
        sum += v * v;
      }
      level.peak = peak;
      level.rms = Math.sqrt(sum / scope.length);
      return level;
    },
    identity: () => ({ mode: MODE_NAMES[modeIx]!, root: rootSemis }),
    voices: (t) => { let n = 0; for (let i = 0; i < MAX_VOICES; i++) if (ends[i]! > t) n++; return n; },
    stop: () => { for (const n of running) { try { n.stop(); } catch { /* already stopped */ } } },
  };
};
