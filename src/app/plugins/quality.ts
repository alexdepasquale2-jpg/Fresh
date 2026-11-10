/**
 * Quality readout: a slim tab on the right edge opens a small panel with the frame
 * rate, frame times, the current quality and a manual Auto / Low / Medium / High
 * switch. Closed by default; remembers whether it was left open.
 */
import './quality.css';
import { perfControl } from '@/platform/perf';
import type { PerfMode } from '@/platform/perf';
import type { Plugin } from '../plugins';

const OPEN_KEY = 'sallow-quality-open';
const REFRESH_MS = 250;
const BARS = 96;
/** Top of the sparkline, in ms. Anything slower is drawn full height. */
const SPARK_MAX_MS = 50;
const SLOW_MS = 22;
const MODES: readonly (readonly [PerfMode, string])[] = [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High']];
const NAMES = ['Low', 'Medium', 'High'] as const;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export const plugin: Plugin = (shell) => {
  let open = false;
  try { open = localStorage.getItem(OPEN_KEY) === '1'; } catch { /* storage blocked */ }

  const frame = el('div', 'q-frame');
  const tab = el('button', 'q-tab');
  tab.type = 'button';
  tab.setAttribute('aria-label', 'Performance and quality');
  tab.append(el('span', 'q-tab-mark'));

  const panel = el('section', 'q-panel');
  panel.setAttribute('aria-label', 'Performance');
  const fps = el('span', 'q-fps', '--');
  const head = el('div', 'q-head');
  head.append(fps, el('span', 'q-unit', 'fps'));
  const times = el('div', 'q-line', '');
  const level = el('div', 'q-line', '');
  const spark = el('canvas', 'q-spark');
  spark.width = BARS * 2;
  spark.height = 28;
  const seg = el('div', 'q-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Quality');
  const buttons = MODES.map(([m, label]) => {
    const b = el('button', 'q-opt', label);
    b.type = 'button';
    b.addEventListener('click', () => {
      try { perfControl.setMode(m); } catch { /* never break the page */ }
      refresh();
    });
    seg.append(b);
    return [m, b] as const;
  });
  panel.append(head, times, level, spark, seg);
  frame.append(panel, tab);
  shell.host.append(frame);

  const g = spark.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const fast = css.getPropertyValue('--glow').trim();
  const slow = css.getPropertyValue('--gold').trim();
  const rule = css.getPropertyValue('--line-dim').trim();
  const hist = new Float32Array(BARS);

  const draw = () => {
    if (!g) return;
    const w = spark.width, h = spark.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = rule;
    g.fillRect(0, h - Math.round((16.7 / SPARK_MAX_MS) * h), w, 1);
    const n = perfControl.history(hist);
    for (let i = 0; i < n; i++) {
      const ms = hist[i]!;
      const bh = Math.max(1, Math.round((Math.min(ms, SPARK_MAX_MS) / SPARK_MAX_MS) * h));
      g.fillStyle = ms > SLOW_MS ? slow : fast;
      g.fillRect((BARS - n + i) * 2, h - bh, 2, bh);
    }
  };

  let lastText = '';
  const refresh = () => {
    try {
      const s = perfControl.stats();
      const mode = perfControl.mode();
      const a = `${Math.round(s.fps)}`;
      const b = `avg ${s.avgMs.toFixed(1)} ms  worst ${Math.round(s.worstMs)} ms`;
      const c = `${NAMES[s.quality]}${mode === 'auto' ? ' (auto)' : ''}  render ${Math.round(s.scale * 100)}%`;
      const key = `${a}|${b}|${c}|${mode}`;
      if (key !== lastText) {
        lastText = key;
        fps.textContent = a;
        times.textContent = b;
        level.textContent = c;
        for (const [m, btn] of buttons) {
          const on = m === mode;
          btn.classList.toggle('on', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
      }
      draw();
    } catch { /* a readout must never break the frame loop */ }
  };

  const show = (on: boolean) => {
    open = on;
    frame.classList.toggle('open', on);
    tab.setAttribute('aria-expanded', on ? 'true' : 'false');
    try { localStorage.setItem(OPEN_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
    if (on) refresh();
  };
  tab.addEventListener('click', () => show(!open));
  // Presses here are not for the screen underneath.
  frame.addEventListener('pointerdown', (e) => e.stopPropagation());

  let acc = 0;
  shell.onFrame((dt) => {
    if (!open) return;
    acc += dt;
    if (acc < REFRESH_MS) return;
    acc = 0;
    refresh();
  });
  show(open);
};
