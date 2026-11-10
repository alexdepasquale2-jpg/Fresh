// WebAudio synth (unit 25). No audio files. Everything is clocked by the universe
// pulse: each pulse cycle is 8 steps; scenes choose which steps sound. The drone is
// tuned from the pulse rate and its filter breathes with the pulse phase.
import type { AudioFactory, ScreenId } from '@/contracts/platform';
import type { Pulse } from '@/contracts/time';
import { FX_ONE } from '@/core/fixed';

const STEPS = 8;
const SCALE = [0, 3, 5, 7, 10]; // minor pentatonic
const LEVEL = 0.5;

export const factory: AudioFactory = () => {
  let ac: AudioContext | null = null;
  let master: GainNode | null = null;
  let send: GainNode | null = null;
  let droneFilter: BiquadFilterNode | null = null;
  let droneGain: GainNode | null = null;
  let oscs: OscillatorNode[] = [];
  let noise: AudioBuffer | null = null;
  let pulse: Pulse | null = null;
  let scene: ScreenId = 'bedroom';
  let muted = false;
  let lastStep = -1;
  let bar = 0;
  let fallback = 0; // internal phase (0..1) when no pulse is set
  let rootHz = 110;
  let lastMilliHz = -1;
  let seed = 0x1234567;
  const rnd = (n: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  const note = (degree: number, octave: number) => rootHz * 2 ** (octave + SCALE[((degree % 5) + 5) % 5]! / 12 + Math.floor(degree / 5));

  const out = (node: AudioNode, wet: number) => {
    node.connect(master!);
    if (wet > 0) {
      const g = ac!.createGain();
      g.gain.value = wet;
      node.connect(g);
      g.connect(send!);
    }
  };
  const pluck = (hz: number, vol: number, dur: number, type: OscillatorType = 'triangle', wet = 0.5) => {
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    out(g, wet);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const thump = (vol: number) => {
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g);
    out(g, 0.1);
    o.start(t);
    o.stop(t + 0.3);
  };
  const hat = (vol: number) => {
    if (!ac || !noise) return;
    const t = ac.currentTime;
    const s = ac.createBufferSource();
    const f = ac.createBiquadFilter();
    const g = ac.createGain();
    s.buffer = noise;
    f.type = 'highpass';
    f.frequency.value = 6000;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f);
    f.connect(g);
    out(g, 0.15);
    s.start(t, rnd(100) / 250, 0.06);
  };

  const sweep = (f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine', wet = 0.3, delay = 0) => {
    if (!ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    out(g, wet);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  /** Filtered noise: rain, fire, rumble, whoosh, crackle. */
  const hiss = (dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, wet = 0.2, delay = 0) => {
    if (!ac || !noise) return;
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource();
    const f = ac.createBiquadFilter();
    const g = ac.createGain();
    src.buffer = noise;
    src.loop = true;
    f.type = type;
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    out(g, wet);
    src.start(t, rnd(100) / 250);
    src.stop(t + dur + 0.05);
  };
  const arp = (degrees: number[], octave: number, gap: number, vol: number, dur = 0.5, type: OscillatorType = 'sine') =>
    degrees.forEach((d, i) => sweep(note(d, octave), note(d, octave), dur, vol, type, 0.7, i * gap));

  // Sound effects. Each is a little recipe; a is 0..1.
  const SFX: Record<string, (a: number) => void> = {
    tap: () => sweep(900, 700, 0.05, 0.05, 'triangle', 0.1),
    nav: () => { sweep(note(0, 3), note(2, 3), 0.12, 0.05, 'sine', 0.6); hiss(0.18, 0.02, 'bandpass', 800, 3000); },
    deny: () => sweep(180, 120, 0.18, 0.08, 'square', 0.1),
    fold: (a) => { hiss(0.35, 0.05, 'bandpass', 300, 2400, 0.4); sweep(note(0, 2) * (1 + a), note(0, 1), 0.3, 0.06, 'sine', 0.5); },
    'catch': () => { arp([0, 2, 4, 7, 9], 3, 0.06, 0.07, 0.6); hiss(0.4, 0.03, 'highpass', 4000, 9000, 0.6); },
    land: () => { arp([0, 2, 4], 2, 0.0, 0.07, 1.6, 'triangle'); thump(0.2); },
    place: () => { sweep(500, 900, 0.12, 0.07, 'sine', 0.6); sweep(900, 1350, 0.25, 0.04, 'sine', 0.8, 0.1); },
    strike: () => { thump(0.35); hiss(0.12, 0.12, 'lowpass', 2500, 300, 0.1); },
    crit: () => { thump(0.45); hiss(0.3, 0.14, 'bandpass', 3000, 200, 0.3); sweep(1200, 200, 0.3, 0.07, 'sawtooth', 0.4); },
    heal: () => arp([0, 2, 4, 5, 7], 3, 0.07, 0.05, 0.8),
    win: () => { arp([0, 2, 4, 7, 9, 12], 2, 0.09, 0.08, 0.9, 'triangle'); arp([4, 7, 9, 12], 3, 0.09, 0.05, 1.2); },
    lose: () => { sweep(note(4, 2), note(0, 1), 0.9, 0.09, 'sawtooth', 0.5); sweep(note(2, 2), note(0, 0), 1.2, 0.07, 'sine', 0.5, 0.1); },
    merge: () => { sweep(note(0, 1), note(0, 3), 0.7, 0.07, 'sine', 0.7); sweep(note(2, 3), note(0, 3), 0.7, 0.06, 'sine', 0.7); hiss(0.7, 0.05, 'bandpass', 300, 6000, 0.6); arp([0, 4, 7, 12], 3, 0.05, 0.08, 1.2, 'triangle'); thump(0.25); },
    step: () => hiss(0.07, 0.035, 'lowpass', 500 + rnd(300), 200, 0),
    zoom: (a) => sweep(300 + a * 500, 380 + a * 600, 0.08, 0.03, 'sine', 0.4),
    water: () => { sweep(500 + rnd(500), 1200 + rnd(600), 0.09, 0.05, 'sine', 0.5); hiss(0.12, 0.02, 'bandpass', 1500, 2500); },
    sand: () => hiss(0.16, 0.06, 'highpass', 2500, 5000, 0.1),
    stone: () => { sweep(140, 90, 0.08, 0.14, 'square', 0.1); hiss(0.05, 0.08, 'lowpass', 1200, 400, 0); },
    seed: () => arp([rnd(5), 2 + rnd(5)], 3, 0.05, 0.04, 0.3),
    erase: () => sweep(700, 150, 0.14, 0.05, 'triangle', 0.3),
    fire: () => { hiss(0.3, 0.07, 'bandpass', 900, 300, 0.2); for (let i = 0; i < 3; i++) hiss(0.02, 0.09, 'highpass', 3000, 6000, 0, rnd(25) / 100); },
    freeze: () => { arp([7, 9, 12], 4, 0.03, 0.04, 0.4); hiss(0.25, 0.03, 'highpass', 7000, 9000, 0.6); },
    heat: () => hiss(0.5, 0.05, 'lowpass', 200, 900, 0.3),
    cold: () => { hiss(0.6, 0.04, 'highpass', 3000, 8000, 0.6); sweep(1800, 900, 0.5, 0.02, 'sine', 0.8); },
    rain: () => hiss(1.6, 0.07, 'highpass', 2000, 5000, 0.4),
    lightning: () => { hiss(0.08, 0.3, 'highpass', 5000, 800, 0.2); hiss(1.8, 0.2, 'lowpass', 400, 60, 0.5, 0.06); },
    meteor: () => { sweep(1400, 90, 0.5, 0.08, 'sawtooth', 0.3); hiss(1.4, 0.3, 'lowpass', 900, 50, 0.4, 0.45); sweep(110, 30, 0.9, 0.4, 'sine', 0.2, 0.45); },
    quake: () => { hiss(1.6, 0.3, 'lowpass', 120, 50, 0.3); sweep(60, 32, 1.4, 0.35, 'sine', 0.1); },
    bless: () => { arp([0, 4, 7, 9, 12, 16], 2, 0.08, 0.06, 1.6); arp([0, 7], 1, 0, 0.05, 2.0, 'triangle'); },
    smite: () => { sweep(300, 40, 0.5, 0.3, 'sawtooth', 0.4); hiss(0.6, 0.2, 'lowpass', 2000, 80, 0.4); },
    sow: () => arp([0, 2, 4, 7], 3, 0.1, 0.05, 0.7, 'triangle'),
    whisper: () => { hiss(1.0, 0.05, 'bandpass', 1200, 2600, 0.9); sweep(note(4, 3), note(5, 3), 0.9, 0.025, 'sine', 0.9); },
    body: () => { sweep(note(0, 1), note(0, 2), 0.5, 0.09, 'triangle', 0.6); arp([0, 7, 12], 3, 0.1, 0.05, 0.8); },
    flare: () => { hiss(1.2, 0.2, 'bandpass', 200, 5000, 0.5); sweep(80, 600, 1.0, 0.12, 'sawtooth', 0.4); },
    shower: () => { for (let i = 0; i < 5; i++) sweep(1600 - i * 150, 200, 0.25, 0.05, 'sawtooth', 0.4, i * 0.09); },
    eclipse: () => { sweep(note(0, 2), note(0, 0), 1.6, 0.1, 'sine', 0.8); hiss(1.6, 0.04, 'lowpass', 600, 80, 0.6); },
    orbit: () => sweep(220, 330, 0.4, 0.07, 'sine', 0.7),
  };
  SFX.panspermia = SFX.sow!;
  SFX['comet-strike'] = SFX.meteor!;
  SFX.pull = SFX.orbit!;
  SFX.push = () => sweep(330, 200, 0.4, 0.07, 'sine', 0.7);
  let lastSfx = '';
  let lastSfxAt = 0;

  // What each scene plays on each of the 8 steps of a pulse cycle.
  const onStep = (step: number) => {
    if (step === 0) bar++;
    const d = (bar * 2 + step) % 7; // slow walking melody degree
    switch (scene) {
      case 'bedroom':
        if (step === 0) pluck(note(0, 1), 0.10, 1.6, 'sine');
        else if (step === 4 && rnd(2) === 0) pluck(note(2 + rnd(3), 2), 0.05, 1.2, 'sine');
        break;
      case 'box':
        if (step === 0 || step === 3 || step === 6) pluck(note(d, 3), 0.07, 0.9, 'sine', 0.7);
        break;
      case 'dive':
        if (step === 0 || step === 4) thump(0.22);
        if (step % 2 === 0) pluck(note(step / 2 + (bar % 4), 2), 0.06, 0.35, 'triangle', 0.6);
        break;
      case 'system':
        if (step === 0) pluck(note(0, 2), 0.09, 2.2, 'sine', 0.8);
        else if (step === 2 || step === 5) pluck(note(d + 2, 3), 0.04, 1.4, 'sine', 0.8);
        break;
      case 'planet':
        if (step === 0) thump(0.12);
        if (step === 0 || rnd(5) < 2) pluck(note(d + rnd(3), 2), 0.06, 0.7, 'triangle', 0.5);
        break;
      case 'outside':
        if (step === 0) pluck(note(0, 0), 0.14, 1.8, 'sawtooth', 0.3);
        else if (step === 5 && rnd(3) === 0) pluck(note(1, 2) * 1.06, 0.04, 1.5, 'sine', 0.9);
        break;
      case 'battle':
        if (step === 0 || step === 4) thump(0.3);
        if (step % 2 === 1) hat(0.08);
        if (step === 2 || step === 6 || step === 7) pluck(note(d, 2), 0.07, 0.25, 'square', 0.3);
        break;
    }
  };

  const tune = (milliHz: number) => {
    if (milliHz === lastMilliHz || !ac) return;
    lastMilliHz = milliHz;
    rootHz = 55 * 2 ** ((Math.round(milliHz / 100) % 12) / 12);
    oscs.forEach((o, i) => o.frequency.setTargetAtTime(rootHz * (i === 2 ? 1.5 : 1), ac!.currentTime, 0.4));
  };

  return {
    unlock: async () => {
      const AC = typeof AudioContext !== 'undefined' ? AudioContext : undefined;
      if (!AC) return;
      if (!ac) {
        ac = new AC();
        master = ac.createGain();
        master.gain.value = muted ? 0 : LEVEL;
        master.connect(ac.destination);
        // A feedback delay stands in for a room.
        send = ac.createGain();
        const delay = ac.createDelay(1);
        const fb = ac.createGain();
        const damp = ac.createBiquadFilter();
        delay.delayTime.value = 0.31;
        fb.gain.value = 0.42;
        damp.type = 'lowpass';
        damp.frequency.value = 2200;
        send.connect(delay);
        delay.connect(damp);
        damp.connect(fb);
        fb.connect(delay);
        damp.connect(master);
        // Drone: two detuned saws and a fifth through a low-pass that breathes with the pulse.
        droneFilter = ac.createBiquadFilter();
        droneFilter.type = 'lowpass';
        droneFilter.frequency.value = 300;
        droneFilter.Q.value = 2;
        droneGain = ac.createGain();
        droneGain.gain.value = 0.05;
        droneFilter.connect(droneGain);
        droneGain.connect(master);
        oscs = [-5, 5, 0].map((cents, i) => {
          const o = ac!.createOscillator();
          o.type = i === 2 ? 'sine' : 'sawtooth';
          o.frequency.value = rootHz * (i === 2 ? 1.5 : 1);
          o.detune.value = cents;
          o.connect(droneFilter!);
          o.start();
          return o;
        });
        noise = ac.createBuffer(1, ac.sampleRate / 2, ac.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (rnd(2000) - 1000) / 1000;
        document.addEventListener('visibilitychange', () => void (document.hidden ? ac?.suspend() : ac?.resume()));
        lastMilliHz = -1;
      }
      await ac.resume().catch(() => undefined);
    },
    setPulse: (p) => void (pulse = p),
    setScene: (s) => void (scene = s),
    update: (dtMs) => {
      if (!ac || ac.state !== 'running') return;
      let phase: number;
      if (pulse) {
        tune(pulse.milliHz);
        phase = pulse.phase() / FX_ONE;
      } else {
        tune(800);
        fallback = (fallback + (dtMs / 1000) * 0.8) % 1;
        phase = fallback;
      }
      droneFilter!.frequency.setTargetAtTime(220 + 380 * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2)), ac.currentTime, 0.05);
      droneGain!.gain.setTargetAtTime(scene === 'battle' ? 0.03 : scene === 'dive' ? 0.07 : 0.05, ac.currentTime, 0.3);
      const step = Math.floor(phase * STEPS) % STEPS;
      if (step !== lastStep) {
        lastStep = step;
        onStep(step);
      }
    },
    setMuted: (m) => {
      muted = m;
      if (ac && master) master.gain.setTargetAtTime(m ? 0 : LEVEL, ac.currentTime, 0.03);
    },
    sfx: (name, amount = 0.5) => {
      if (!ac || ac.state !== 'running' || muted) return;
      // The same effect retriggers at most every 70 ms, so painting does not turn into a roar.
      const now = ac.currentTime;
      if (name === lastSfx && now - lastSfxAt < 0.07) return;
      lastSfx = name;
      lastSfxAt = now;
      (SFX[name] ?? SFX.tap!)(Math.max(0, Math.min(1, amount)));
    },
    dispose: () => {
      oscs.forEach((o) => o.stop());
      void ac?.close().catch(() => undefined);
      ac = null;
    },
  };
};
