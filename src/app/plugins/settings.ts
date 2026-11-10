// Settings: display and play options, save safety (export, import, backup, new game), keyboard and gamepad
// play, and screen-reader announcements. One hub page ("Settings"); everything else is invisible.
//
// Root classes other units may honour (set on <html>):
//   sallow-text-s / sallow-text-l   smaller / larger type (this plugin scales every px font-size itself)
//   sallow-contrast                 stronger ink and borders (tokens are remapped in settings.css)
//   sallow-reduce-motion            the player asked for stillness even if the OS did not. CSS animations and
//                                   transitions are already stilled globally by settings.css, and
//                                   matchMedia('(prefers-reduced-motion: reduce)').matches reads true while it is on.
// Also: window 'sallow:haptic' is not used; haptics are driven from here only.
import './settings.css';
import type { Plugin, Shell } from '../plugins';
import type { ScreenId } from '@/contracts/app';
import type { InputAction, InputBinding, SaveBundleInfo } from '@/contracts/platform';

interface Settings {
  text: 0 | 1 | 2;
  contrast: boolean;
  reduceMotion: boolean;
  confirmLight: boolean;
  /** -1 keeps whatever speed the world was left at. */
  speed: -1 | 0 | 1 | 3;
  haptics: boolean;
}
const DEFAULTS: Settings = { text: 1, contrast: false, reduceMotion: false, confirmLight: false, speed: -1, haptics: false };
const GUIDE_KEY = 'sallow-guide';
/** Device preferences: a new game does not forget them. */
const KEEP_ON_RESET = ['sallow-settings', 'sallow-quality-mode', 'sallow-sound', 'sallow-muted'];
const SCREEN_NAMES: Record<ScreenId, string> = { bedroom: 'The bedroom', box: 'The Box', dive: 'A dive', system: 'A star and its worlds', planet: 'A world', outside: 'Outside', battle: 'A battle', mirror: 'The mirror' };
const SPEED_LABEL: Record<number, string> = { 0: 'Pause', 1: '1x', 3: '3x' };

const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const btn = (label: string, id: string, onClick: () => void, cls = ''): HTMLButtonElement => {
  const b = mk('button', `set-btn ${cls}`.trim(), label);
  b.type = 'button';
  b.dataset.id = id;
  b.addEventListener('click', onClick);
  return b;
};
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const when = (ms: number | null): string => {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return 'never';
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
};
const size = (n: number | null): string => (n === null ? '?' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
const holds = (i: SaveBundleInfo): string =>
  `${i.universes} ${i.universes === 1 ? 'universe' : 'universes'} · ${i.lightPips ?? 0} Light · saved ${when(i.savedAtMs)} · ${i.keys} small ${i.keys === 1 ? 'record' : 'records'}`;

/* ---------- text size: every px font-size in the loaded sheets, scaled through one variable ---------- */
let scaleSheet: HTMLStyleElement | null = null;
const splitSelectors = (sel: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};
const GATE = ':root[class*="sallow-text-"]';
const buildScale = (): void => {
  if (scaleSheet) return;
  const lines: string[] = [];
  const walk = (rules: CSSRuleList, wrap: (s: string) => string) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        // A `font:` shorthand holding a var() has no readable longhands, so its text is read instead.
        const m = /^(-?[\d.]+)px$/.exec(rule.style.fontSize) ?? /(?:^|\s)([\d.]+)px(?=[\s/]|$)/.exec(rule.style.getPropertyValue('font'));
        if (!m) continue;
        const px = Number(m[1]);
        if (!(px > 0)) continue;
        // Headline sizes grow less: they are the ones that would push a row off a 390 px screen.
        const k = px >= 20 ? 0.4 : px >= 16 ? 0.75 : 1;
        const sel = splitSelectors(rule.selectorText).map((s) => (s.startsWith(':root') ? GATE + s.slice(5) : s.startsWith('html') ? GATE + s.slice(4) : `${GATE} ${s}`)).join(', ');
        lines.push(wrap(`${sel} { font-size: calc(${px}px * (1 + (var(--sallow-text, 1) - 1) * ${k})); }`));
      } else if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, (s) => wrap(`@media ${rule.conditionText} { ${s} }`));
      } else if (rule instanceof CSSSupportsRule) {
        walk(rule.cssRules, (s) => wrap(`@supports ${rule.conditionText} { ${s} }`));
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { walk(sheet.cssRules, (s) => s); } catch { /* a sheet from elsewhere: leave it */ }
  }
  scaleSheet = mk('style');
  scaleSheet.dataset.sallow = 'text-scale';
  scaleSheet.textContent = lines.join('\n');
  document.head.append(scaleSheet);
};

export const plugin: Plugin = (shell: Shell) => {
  const { ctx, host, layer } = shell;
  const store = shell.store<Settings>('settings', DEFAULTS);
  const st: Settings = { ...DEFAULTS, ...store.get() };
  const root = document.documentElement;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { st[k] = v; store.set({ ...st }); apply(); };

  const apply = () => {
    root.classList.toggle('sallow-text-s', st.text === 0);
    root.classList.toggle('sallow-text-l', st.text === 2);
    root.classList.toggle('sallow-contrast', st.contrast);
    root.classList.toggle('sallow-reduce-motion', st.reduceMotion);
    if (st.text !== 1) { try { buildScale(); } catch (e) { console.error(e); } }
  };

  // Units ask the browser whether motion should be reduced; while the setting is on, the answer is yes.
  try {
    const real = window.matchMedia?.bind(window);
    if (real) {
      window.matchMedia = (q: string): MediaQueryList => {
        const m = real(q);
        if (!/prefers-reduced-motion:\s*reduce/.test(q)) return m;
        return {
          get matches() { return st.reduceMotion || m.matches; },
          media: m.media,
          get onchange() { return m.onchange; },
          set onchange(v) { m.onchange = v; },
          addEventListener: m.addEventListener.bind(m),
          removeEventListener: m.removeEventListener.bind(m),
          addListener: m.addListener.bind(m),
          removeListener: m.removeListener.bind(m),
          dispatchEvent: m.dispatchEvent.bind(m),
        } as MediaQueryList;
      };
    }
  } catch { /* leave the browser's own answer */ }
  apply();

  /* ---------- screen reader: toasts and screen changes are spoken ---------- */
  const live = mk('div', 'set-live');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  live.dataset.id = 'live';
  host.append(live);
  const announce = (text: string) => { live.textContent = ''; window.setTimeout(() => { live.textContent = text; }, 30); };

  /* ---------- haptics ---------- */
  const buzz = (pattern: number | number[]) => {
    if (!st.haptics) return;
    try { navigator.vibrate?.(pattern); } catch { /* not here */ }
  };
  const toasts = host.querySelector('.hub-toasts');
  if (toasts) {
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of Array.from(m.addedNodes)) {
        if (n instanceof HTMLElement) { announce(n.textContent ?? ''); buzz(14); }
      }
    }).observe(toasts, { childList: true });
  }
  ctx.bus.on('box:changed', () => buzz([18, 40, 30]));
  let lastPips = ctx.light.view().pips;
  ctx.bus.on('light:changed', ({ pips }) => { if (pips < lastPips) buzz(10); else if (pips > lastPips) buzz([8, 30, 8]); lastPips = pips; });

  /* ---------- play: default speed, confirm before spending Light ---------- */
  const speedButton = (s: number): HTMLButtonElement | null => {
    const want = SPEED_LABEL[s];
    for (const b of Array.from(layer.querySelectorAll('button'))) if (b.textContent === want && b.hasAttribute('aria-pressed')) return b;
    return null;
  };
  const setSpeed = (s: 0 | 1 | 3) => {
    const b = speedButton(s);
    if (b) b.click(); else ctx.clock.setSpeed(s);
  };
  shell.onNavigate((_from, to) => {
    announce(SCREEN_NAMES[to]);
    if (to === 'planet' && st.speed !== -1 && ctx.clock.speed() !== st.speed) setSpeed(st.speed);
    buzz(6);
  });

  let armed = '';
  let armedAt = 0;
  document.addEventListener('click', (e) => {
    if (!st.confirmLight) return;
    const b = (e.target as Element | null)?.closest?.('.sky-add.make');
    if (!(b instanceof HTMLButtonElement) || b.disabled) return;
    const id = b.dataset.id ?? '';
    const now = performance.now();
    if (armed === id && now - armedAt < 6000) { armed = ''; return; }
    e.stopImmediatePropagation();
    e.preventDefault();
    armed = id;
    armedAt = now;
    b.classList.add('set-armed');
    window.setTimeout(() => b.classList.remove('set-armed'), 6000);
    shell.toast('That is made from one of your Light. Press it again to spend it.', { title: 'Spend Light?', sfx: 'tap' });
  }, true);

  /* ---------- keyboard and gamepad ---------- */
  const visible = (e: Element): e is HTMLElement => e instanceof HTMLElement && !(e as HTMLButtonElement).disabled && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const click = (sel: string, scope: ParentNode = host): boolean => {
    for (const e of Array.from(scope.querySelectorAll(sel))) if (visible(e)) { e.click(); return true; }
    return false;
  };
  const focusMove = (dx: number, dy: number) => {
    const scope: ParentNode = shell.menu.isOpen() ? host.querySelector('.hub-sheet') ?? host : host;
    const all = Array.from(scope.querySelectorAll('button, input, textarea, select')).filter(visible);
    if (!all.length) return;
    const cur = document.activeElement instanceof HTMLElement && all.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { all[0]!.focus(); return; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const e of all) {
      if (e === cur) continue;
      const r = e.getBoundingClientRect();
      const along = (r.left + r.width / 2 - ax) * dx + (r.top + r.height / 2 - ay) * dy;
      const across = Math.abs((r.left + r.width / 2 - ax) * dy) + Math.abs((r.top + r.height / 2 - ay) * dx);
      if (along < 4) continue;
      const score = along + across * 2.5;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); }
  };
  const steer = (dir: -1 | 1) => {
    const v = ctx.dive.view();
    const n = v.children.length;
    if (n < 2 || v.steerLocked) return;
    // 0 is the centre; 1..n-1 go round the ring.
    const ring = n - 1;
    const next = v.aim === 0 ? (dir > 0 ? 1 : ring) : ((v.aim - 1 + dir + ring) % ring) + 1;
    ctx.dive.aim(next);
  };
  let walkDir = 0;
  let walkAcc = 0;
  const avatar = () => (shell.current() === 'planet' ? ctx.sim.latest()?.civ.avatar ?? null : null);
  const diving = () => shell.current() === 'dive' && !shell.menu.isOpen() && ctx.dive.view().phase !== 'surfaced';
  let holding = false;
  const hold = (on: boolean) => {
    if (on === holding) return;
    holding = on;
    if (on) ctx.dive.hold(); else ctx.dive.release();
    layer.querySelector('[data-id=hold]')?.setAttribute('aria-pressed', String(on));
    if (on) buzz(8);
  };
  const onAction = (action: InputAction, phase: 'down' | 'up') => {
    if (phase === 'up') {
      if (action === 'hold') hold(false);
      if (action === 'left' || action === 'right') walkDir = 0;
      return;
    }
    const open = shell.menu.isOpen();
    switch (action) {
      case 'menu': if (open) shell.menu.close(); else shell.menu.open(); return;
      case 'back':
        if (open) { if (!click('[data-id=hub-back]')) click('[data-id=hub-close]'); return; }
        click('.k-back', layer);
        return;
      case 'hold':
        if (diving()) hold(true); else if (!open) click('.k-btn--primary', layer);
        return;
      case 'confirm':
        if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body && visible(document.activeElement)) document.activeElement.click();
        else if (!open) click('.k-btn--primary', layer);
        return;
      case 'left': case 'right': {
        const dir = action === 'left' ? -1 : 1;
        if (diving()) { steer(dir); return; }
        if (!open && avatar()) { walkDir = dir; walkAcc = 999; return; }
        focusMove(dir, 0);
        return;
      }
      case 'up': case 'down':
        if (diving()) { if (!ctx.dive.view().steerLocked) ctx.dive.aim(0); return; }
        focusMove(0, action === 'up' ? -1 : 1);
        return;
      case 'pause': if (!open) setSpeed(ctx.clock.speed() === 0 ? 1 : 0); return;
      case 'slower': if (!open) setSpeed(ctx.clock.speed() === 3 ? 1 : 0); return;
      case 'faster': if (!open) setSpeed(ctx.clock.speed() === 0 ? 1 : 3); return;
      default: {
        if (open) return;
        const i = Number(action.slice(4)) - 1;
        const tools = Array.from(layer.querySelectorAll('[data-id^="tool-"], [data-id^="skill-"], [data-id^="sky-add-"]')).filter(visible);
        tools[i]?.click();
      }
    }
  };
  ctx.input.on((e) => {
    if (e.type !== 'key') return;
    try { onAction(e.action, e.phase); } catch (err) { console.error(err); }
  });
  shell.onFrame((dt) => {
    try {
      if (holding && !diving()) hold(false);
      if (walkDir === 0) return;
      walkAcc += dt;
      if (walkAcc < 140) return;
      walkAcc = 0;
      const av = avatar();
      if (av) ctx.sim.walk(av.x + walkDir * 5); else walkDir = 0;
    } catch { /* never into the frame loop */ }
  });

  /* ---------- the page ---------- */
  const render = (into: HTMLElement): (() => void) => {
    const page = mk('div', 'set-page');
    const timers: number[] = [];
    const section = (title: string, id: string) => {
      const s = mk('section', 'set-sec');
      s.dataset.id = `set-${id}`;
      s.append(mk('h3', '', title));
      page.append(s);
      return s;
    };
    const row = (label: string, note: string, control: HTMLElement) => {
      const r = mk('div', 'set-row');
      const t = mk('div', 'set-text');
      t.append(mk('b', '', label));
      if (note) t.append(mk('small', '', note));
      r.append(t, control);
      return r;
    };
    const toggle = (id: string, get: () => boolean, put: (v: boolean) => void) => {
      const b = btn('', id, () => { put(!get()); paint(); }, 'set-toggle');
      const paint = () => { const on = get(); b.textContent = on ? 'On' : 'Off'; b.setAttribute('aria-pressed', String(on)); };
      b.setAttribute('role', 'switch');
      paint();
      return b;
    };
    const choice = <T extends number>(id: string, opts: readonly (readonly [T, string])[], get: () => T, put: (v: T) => void) => {
      const g = mk('div', 'set-choice');
      g.setAttribute('role', 'group');
      const paint = () => g.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i]![0] === get())));
      for (const [v, label] of opts) g.append(btn(label, `${id}-${v}`, () => { put(v); paint(); }));
      paint();
      return g;
    };

    // Display
    const disp = section('Display', 'display');
    disp.append(
      row('Text size', 'How large the words are everywhere.', choice('set-text', [[0, 'Small'], [1, 'Normal'], [2, 'Large']] as const, () => st.text, (v) => set('text', v))),
      row('High contrast', 'Brighter ink, harder edges.', toggle('set-contrast', () => st.contrast, (v) => set('contrast', v))),
      row('Reduce motion', 'Stills the drifting, sliding and flashing.', toggle('set-motion', () => st.reduceMotion, (v) => set('reduceMotion', v))),
    );
    // The tutorial keeps its state in the 'sallow-guide' store; only its `hints` flag is ours to flip.
    const guideState = (): Record<string, unknown> => { try { return (JSON.parse(localStorage.getItem(GUIDE_KEY) ?? 'null') as Record<string, unknown> | null) ?? {}; } catch { return {}; } };
    const hintsOn = () => guideState().hints !== false;
    disp.append(row('Show hints', 'Mote tells you things as you come to them. Changing this reloads the game.', toggle('set-hints', hintsOn, (v) => {
      const next = { ...guideState(), hints: v };
      ctx.persist();
      void sleep(500).then(() => {
        try { localStorage.setItem(GUIDE_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
        location.reload();
      });
    })));

    // Play
    const play = section('Play', 'play');
    play.append(
      row('Ask before spending Light', 'Making a sky piece from Light needs a second press.', toggle('set-confirm', () => st.confirmLight, (v) => set('confirmLight', v))),
      row('World speed', 'The speed a world runs at when you arrive.', choice('set-speed', [[-1, 'As left'], [0, 'Pause'], [1, '1x'], [3, '3x']] as const, () => st.speed, (v) => set('speed', v))),
      row('Haptics', typeof navigator.vibrate === 'function' ? 'A small buzz on catches, Light and notices.' : 'This device cannot buzz.', toggle('set-haptics', () => st.haptics, (v) => { set('haptics', v); if (v) buzz([12, 40, 12]); })),
    );

    // Save
    const save = section('Save', 'save');
    const status = mk('p', 'set-note');
    status.dataset.id = 'set-save-status';
    const usage = mk('p', 'set-note dim');
    usage.dataset.id = 'set-save-usage';
    const say = mk('p', 'set-say');
    say.dataset.id = 'set-save-say';
    say.setAttribute('role', 'status');
    const tell = (text: string, bad = false) => { say.textContent = text; say.classList.toggle('bad', bad); if (text) announce(text); };
    const refresh = () => {
      const s = ctx.save.status?.();
      const where = s?.backend === 'localstorage' ? 'kept in this browser’s small storage' : s?.backend === 'memory' ? 'not kept: this browser refuses storage' : 'kept in this browser';
      status.textContent = s ? `Last saved ${when(s.lastSavedAtMs)}, ${where}.${s.lastError ? ` ${s.lastError}` : ''}` : 'Saved as you play.';
      void ctx.save.usage?.().then((u) => {
        usage.textContent = `The save is ${size(u.saveBytes)}; journals and names ${size(u.localBytes)}.${u.usedBytes !== null && u.quotaBytes ? ` This site uses ${size(u.usedBytes)} of ${size(u.quotaBytes)}.` : ''}`;
      }).catch(() => undefined);
    };
    refresh();
    timers.push(window.setInterval(refresh, 5000));
    const settle = async () => { ctx.persist(); await sleep(550); };

    const code = mk('textarea', 'set-code');
    code.dataset.id = 'set-code';
    code.rows = 4;
    code.spellcheck = false;
    code.setAttribute('aria-label', 'Save code');
    code.placeholder = 'A save code appears here, or paste one to bring a game back.';
    for (const ev of ['pointerdown', 'keydown', 'keyup'] as const) code.addEventListener(ev, (e) => e.stopPropagation());
    const file = mk('input');
    file.type = 'file';
    file.accept = '.txt,.sallow,text/plain';
    file.hidden = true;
    file.dataset.id = 'set-file';
    const preview = mk('div', 'set-preview');
    preview.dataset.id = 'set-preview';
    preview.hidden = true;
    const reloadSoon = (text: string) => { tell(text); ctx.audio.sfx('merge'); window.setTimeout(() => location.reload(), 700); };

    const exportNow = async (): Promise<string | null> => {
      if (!ctx.save.exportAll) { tell('This build cannot export.', true); return null; }
      await settle();
      try { return await ctx.save.exportAll(); } catch { tell('The export could not be made.', true); return null; }
    };
    const readCode = async () => {
      preview.hidden = true;
      const text = code.value.trim();
      if (!text) { tell('Paste a code or choose a file first.', true); return; }
      const r = await ctx.save.inspect?.(text);
      if (!r) { tell('This build cannot import.', true); return; }
      if (!r.ok) { tell(r.error, true); ctx.audio.sfx('deny'); return; }
      tell('');
      preview.replaceChildren(
        mk('b', '', 'This code holds'),
        mk('p', '', holds(r.info)),
        mk('p', 'dim', `Made ${when(r.info.exportedAtMs)}. Bringing it in replaces everything here. What is here now is kept as the backup.`),
        btn('Replace my game with this', 'set-import-go', () => void (async () => {
          await settle();
          const res = await ctx.save.stageImport?.(text);
          if (!res || !res.ok) { tell(res ? res.error : 'This build cannot import.', true); return; }
          reloadSoon('It is coming back. One moment.');
        })(), 'gold'),
        btn('Leave it', 'set-import-no', () => { preview.hidden = true; }),
      );
      preview.hidden = false;
      preview.scrollIntoView({ block: 'nearest' });
    };
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (!f) return;
      if (f.size > 4_000_000) { tell('That file is too large to be a SALLOW save.', true); return; }
      void f.text().then((t) => { code.value = t.trim(); file.value = ''; return readCode(); }).catch(() => tell('That file could not be read.', true));
    });

    const backupBox = mk('div', 'set-backup');
    backupBox.dataset.id = 'set-backup';
    const paintBackup = () => {
      const b = ctx.save.backup?.() ?? null;
      backupBox.replaceChildren(mk('b', '', 'Backup'));
      if (!b) { backupBox.append(mk('p', 'dim', 'None yet. One is kept by itself before any import or new game.')); return; }
      backupBox.append(mk('p', '', holds(b)), mk('p', 'dim', `Kept ${when(b.exportedAtMs)}.`));
      let sure = false;
      const go = btn('Bring the backup back', 'set-restore', () => {
        if (!sure) { sure = true; go.textContent = 'Press again to swap it in'; go.classList.add('gold'); return; }
        void (async () => {
          await settle();
          const r = await ctx.save.stageRestore?.();
          if (!r || !r.ok) { tell(r ? r.error : 'This build cannot restore.', true); return; }
          reloadSoon('The backup is coming back. One moment.');
        })();
      });
      backupBox.append(go);
    };
    paintBackup();

    const fresh = mk('div', 'set-danger');
    fresh.dataset.id = 'set-new';
    const paintFresh = (step: 0 | 1 | 2) => {
      fresh.replaceChildren();
      if (step === 0) { fresh.append(btn('Start a new game', 'set-new-0', () => paintFresh(1))); return; }
      fresh.append(mk('p', '', step === 1 ? 'A new game empties the Box and forgets the journal, the codex and every name you gave. A backup is kept first.' : 'Last chance. The Box goes dark and you begin again.'));
      fresh.append(
        step === 1 ? btn('I am sure', 'set-new-1', () => paintFresh(2)) : btn('Erase and begin again', 'set-new-2', () => void (async () => {
          await settle();
          const ok = await ctx.save.stageReset?.(KEEP_ON_RESET);
          if (!ok) { tell(ctx.save.status?.().lastError ?? 'It could not be done, so nothing was changed.', true); paintFresh(0); return; }
          reloadSoon('The Box goes dark.');
        })(), 'gold'),
        btn('Keep my game', 'set-new-no', () => paintFresh(0)),
      );
    };
    paintFresh(0);

    const grid = mk('div', 'set-grid');
    grid.append(
      btn('Save now', 'set-save-now', () => void settle().then(() => { refresh(); tell('Saved.'); })),
      btn('Make a code', 'set-export', () => void exportNow().then((c) => { if (c) { code.value = c; preview.hidden = true; tell(`A code of ${c.length} characters. Keep it somewhere safe.`); } })),
      btn('Copy code', 'set-copy', () => {
        if (!code.value) { tell('Make a code first.', true); return; }
        const done = () => tell('Copied.');
        const old = () => { code.select(); try { document.execCommand('copy'); done(); } catch { tell('Select the code and copy it by hand.', true); } };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code.value).then(done, old); else old();
      }),
      btn('Save to a file', 'set-download', () => void exportNow().then((c) => {
        if (!c) return;
        code.value = c;
        const url = URL.createObjectURL(new Blob([c], { type: 'text/plain' }));
        const a = mk('a');
        a.href = url;
        a.download = `sallow-save-${new Date().toISOString().slice(0, 10)}.txt`;
        a.dataset.id = 'set-download-link';
        page.append(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
        tell('The file holds the same code.');
      })),
      btn('Read pasted code', 'set-import', () => void readCode()),
      btn('Open a file', 'set-open', () => file.click()),
    );
    save.append(status, usage, grid, code, file, say, preview, backupBox, fresh);

    // Controls
    const keys = section('Keyboard and gamepad', 'keys');
    const binds: readonly InputBinding[] = ctx.input.bindings?.() ?? [];
    if (!binds.length) keys.append(mk('p', 'set-note dim', 'Touch only on this build.'));
    const table = mk('dl', 'set-keys');
    for (const b of binds) {
      const dt = mk('dt', '', b.pad ? `${b.keys} · pad ${b.pad}` : b.keys);
      table.append(dt, mk('dd', '', b.does));
    }
    keys.append(table);

    // About
    const about = section('About', 'about');
    let built = '';
    try { const d = new Date(document.lastModified); if (Number.isFinite(d.getTime())) built = when(d.getTime()); } catch { built = ''; }
    about.append(
      mk('p', 'set-voice', 'SALLOW. A box of pocket universes on a kid’s computer, and a small light to see them by.'),
      mk('p', 'set-note', 'Open the Box and pick a universe. Fall through its folds; hold to fall, let go to hover, steer into a ring, stop at a star. On a world you never touch the ground: you hang moons, rings and comets in its sky, then watch what the people below make of them. Their glow comes back to you as Light.'),
      mk('p', 'set-note dim', `${import.meta.env.DEV ? 'Development build' : 'Release build'}${built ? ` of ${built}` : ''}. Save format 1.`),
      mk('p', 'set-note dim', 'Made by hand and by Mote. No universe was harmed that did not have it coming.'),
    );

    into.append(page);
    return () => { for (const t of timers) window.clearInterval(t); page.remove(); };
  };

  shell.menu.add({ id: 'settings', label: 'Settings', hint: 'Text, motion, saves, controls', order: 85, render });
};
