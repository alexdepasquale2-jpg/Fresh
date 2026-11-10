/**
 * Quality readout: a page in the hub menu with the frame rate, frame times, the
 * current quality and a manual Auto / Low / Medium / High switch.
 */
import './quality.css';
import { perfControl } from '@/platform/perf';
import type { PerfMode } from '@/platform/perf';
import type { Plugin } from '../plugins';

const REFRESH_MS = 250;
const BARS = 96;
/** Top of the sparkline, in ms. Anything slower is drawn full height. */
const SPARK_MAX_MS = 50;
const SLOW_MS = 22;
const MODES: readonly (readonly [PerfMode, string])[] = [['auto', 'Auto'], ['minimal', 'Min'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High']];
const NAMES = ['Low', 'Medium', 'High'] as const;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export const plugin: Plugin = (shell) => {
  let open = false;

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
  // The last thing that stumbled in a frame (written by main.ts), so it can be reported.
  const lastErr = el('div', 'q-line', '');
  const showErr = () => {
    let t = '';
    try { const r = JSON.parse(localStorage.getItem('sallow-last-error') ?? 'null') as { where: string; msg: string; at: number } | null; if (r) t = `Last stumble: ${r.where} · ${r.msg.slice(0, 160)} · ${new Date(r.at).toLocaleString()}`; } catch { /* nothing stored */ }
    lastErr.textContent = t;
    lastErr.hidden = !t;
  };
  panel.append(head, times, level, spark, seg, lastErr);

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
      const c = `${s.scale < 0.52 ? 'Minimal' : NAMES[s.quality]}${mode === 'auto' ? ' (auto)' : ''}  render ${Math.round(s.scale * 100)}%`;
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

  shell.menu.add({
    id: 'performance', label: 'Performance', hint: 'Frame rate and quality', order: 90,
    render: (into) => { into.append(panel); open = true; showErr(); refresh(); return () => { open = false; }; },
  });

  let acc = 0;
  shell.onFrame((dt) => {
    if (!open) return;
    acc += dt;
    if (acc < REFRESH_MS) return;
    acc = 0;
    refresh();
  });
};
