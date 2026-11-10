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
    dispose: () => {
      oscs.forEach((o) => o.stop());
      void ac?.close().catch(() => undefined);
      ac = null;
    },
  };
};
