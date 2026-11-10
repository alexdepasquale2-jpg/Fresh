// Desktop mode: the same game laid out for a wide window, a mouse and a keyboard.
//
// On by default when the window is wide enough and the primary pointer is a mouse; the Controls page
// (hub id 'controls') switches Auto / Desktop / Phone at runtime. Everything visual hangs off root classes:
//   sallow-desktop            the wide layout is on (every rule in desktop.css sits under it)
//   sallow-theatre            the stage is a fixed window in the middle instead of the whole window
// and these CSS variables on <html>, set only while desktop mode is on:
//   --stage-w / --stage-h     the whole stage in CSS px (the <main class="screen"> box is exactly this)
//   --panel-w                 width of the side panel on two-pane screens
//   --play-w                  stage width minus the panel: the play surface of a two-pane screen
//   --ui-scale                the player's UI scale, 0.8 .. 1.4
// A screen that sizes its own canvas (the town) should fill its root: root.clientWidth x root.clientHeight.
import './desktop.css';
import type { Plugin, Shell } from '../plugins';
import type { ScreenId } from '@/contracts/app';
import type { InputAction, InputEvent, InputKeymap } from '@/contracts/platform';
import { foldFrame, childAt } from '@/core/fold-layout';
import { ACTIONS, keyName, clashes } from '@/platform/input';

/** Read by main.ts: the GL core multiplies its drawing-buffer size by this. Always 1 in the phone layout. */
export const stage = { glScale: 1 };

/** At High the drawing buffer never holds more than this many pixels (1920x1080); the perf unit's scale multiplies it down. */
const MAX_PIXELS = 1920 * 1080;
const MIN_W = 1100, MIN_H = 620;
type LayoutMode = 'auto' | 'desktop' | 'phone';
type Theatre = 0 | 720 | 900;
interface Controls { layout: LayoutMode; scale: number; theatre: Theatre; fullscreen: boolean; keys: InputKeymap | null; page: string }
const DEFAULTS: Controls = { layout: 'auto', scale: 100, theatre: 0, fullscreen: false, keys: null, page: '' };

/** What the planet screen hangs on its surface element (see src/ui/system-planet/README.md). */
interface SurfaceView { pick(clientX: number, clientY: number): { village: { name: string; souls: number } | null } | null }

const COMMON: readonly InputAction[] = ['confirm', 'back', 'menu', 'help', 'journal', 'codex', 'almanac', 'box', 'fullscreen'];
const PER_SCREEN: Record<ScreenId, { readonly keys: readonly InputAction[]; readonly mouse: readonly string[] }> = {
  bedroom: { keys: ['left', 'right', 'up', 'down'], mouse: ['Click the floor to walk there', 'Click a thing in the room to use it'] },
  box: { keys: ['left', 'right', 'up', 'down'], mouse: ['Click a universe to see it on the right', 'Wheel scrolls the grid and the card'] },
  dive: { keys: ['hold', 'left', 'right', 'up', 'down'], mouse: ['Move over a ring to aim at it, click to choose it', 'Hold the button to fall, let go to hover', 'Click a flicker to throw a reliquary'] },
  system: { keys: ['tabNext', 'tabPrev', 'left', 'right', 'up', 'down'], mouse: ['Drag a sky piece onto an orbit', 'Click an orbit to choose its world', 'Wheel zooms the orrery toward the cursor', 'Drag empty space, or right or middle drag, to pan; Fit puts it back'] },
  planet: { keys: ['left', 'right', 'up', 'down', 'zoomIn', 'zoomOut', 'tabNext', 'tabPrev', 'pause', 'slower', 'faster', 'speed0', 'speed1', 'speed3', 'tool1', 'eyes'], mouse: ['Wheel leans in on the spot under the cursor', 'Drag to pan while watching; right or middle drag pans with any tool in hand', 'Rest the cursor on a village to read its name and souls', 'Click to use the tool in hand, hold to keep using it', 'Double click to lean in two layers'] },
  outside: { keys: ['left', 'right', 'up', 'down'], mouse: ['Click a rival to fight them'] },
  battle: { keys: ['tool1', 'guard', 'fuse'], mouse: ['Click a move; hover a chip to read it'] },
  mirror: { keys: ['left', 'right', 'up', 'down'], mouse: ['Click the room to hear the rest'] },
  town: { keys: ['left', 'right', 'up', 'down', 'hold'], mouse: ['Click where the kid should walk'] },
};
/** Buttons that have a key: shown in their tooltip. */
const KEY_OF: Readonly<Record<string, InputAction>> = {
  hub: 'menu', 'zoom-in': 'zoomIn', 'zoom-out': 'zoomOut', hold: 'hold', eyes: 'eyes', guard: 'guard', fuse: 'fuse', 'speed-0': 'speed0', 'speed-1': 'speed1', 'speed-3': 'speed3', 'hub-close': 'back', 'open-box': 'confirm',
};
const HUB_KEYS: Readonly<Partial<Record<InputAction, string>>> = { journal: 'journal', codex: 'codex', almanac: 'almanac' };

const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const btn = (label: string, id: string, onClick: () => void, cls = ''): HTMLButtonElement => {
  const b = mk('button', `dt-btn ${cls}`.trim(), label);
  b.type = 'button';
  b.dataset.id = id;
  b.addEventListener('click', onClick);
  return b;
};
const visible = (e: Element | null): e is HTMLElement => e instanceof HTMLElement && !(e as HTMLButtonElement).disabled && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';

/* ---------- UI scale for type inside screens ----------
   Chrome that is positioned by this plugin (the menu sheet, notices, tooltips) is scaled with `zoom`. Screens are not:
   zoom would also scale the boxes their pointer maths measure. Their type is scaled instead, the way the Settings
   plugin scales text: one generated rule per px font-size in the loaded sheets, gated on a root class, multiplied by
   --dt-text (the UI scale; pinned to 1 inside anything already zoomed) and by Settings' own --sallow-text. */
let textSheet: HTMLStyleElement | null = null;
const TEXT_GATE = ':root.sallow-desktop.dt-text';
const buildTextScale = (): void => {
  if (textSheet) return;
  const lines: string[] = [];
  const split = (sel: string): string[] => {
    const out: string[] = [];
    let depth = 0, cur = '';
    for (const ch of sel) {
      if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const walk = (rules: CSSRuleList, wrap: (s: string) => string) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        const m = /^(-?[\d.]+)px$/.exec(rule.style.fontSize) ?? /(?:^|\s)([\d.]+)px(?=[\s/]|$)/.exec(rule.style.getPropertyValue('font'));
        const raw = m ? Number(m[1]) : 0;
        if (!(raw > 0)) continue;
        const px = Math.max(raw, 11);
        // Headlines grow less, as they do for Settings' text size: they are what would push a row out of its panel.
        const k = px >= 20 ? 0.5 : px >= 16 ? 0.8 : 1;
        const tk = px >= 20 ? 0.4 : px >= 16 ? 0.75 : 1;
        const sel = split(rule.selectorText).map((x) => (x.startsWith(':root') ? TEXT_GATE + x.slice(5) : x.startsWith('html') ? TEXT_GATE + x.slice(4) : `${TEXT_GATE} ${x}`)).join(', ');
        lines.push(wrap(`${sel} { font-size: max(10px, calc(${px}px * (1 + (var(--dt-text, 1) - 1) * ${k}) * (1 + (var(--sallow-text, 1) - 1) * ${tk}))); }`));
      } else if (rule instanceof CSSMediaRule) walk(rule.cssRules, (x) => wrap(`@media ${rule.conditionText} { ${x} }`));
      else if (rule instanceof CSSSupportsRule) walk(rule.cssRules, (x) => wrap(`@supports ${rule.conditionText} { ${x} }`));
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    // Settings' own generated sheets restate rules that are read here from their sources.
    if ((sheet.ownerNode as HTMLElement | null)?.dataset?.sallow) continue;
    try { walk(sheet.cssRules, (x) => x); } catch { /* a sheet from elsewhere: leave it */ }
  }
  textSheet = document.createElement('style');
  textSheet.dataset.sallow = 'dt-text';
  textSheet.textContent = lines.join('\n');
  document.head.append(textSheet);
};

export const plugin: Plugin = (shell: Shell) => {
  const { ctx, host, layer, canvas } = shell;
  const root = document.documentElement;
  const store = shell.store<Controls>('controls', DEFAULTS);
  const st: Controls = { ...DEFAULTS, ...store.get() };
  const save = () => store.set({ ...st });
  const input = ctx.input;
  try { if (st.keys) input.setKeymap?.(st.keys); } catch { /* a bad stored map: defaults stay */ }
  const keysOf = (a: InputAction): readonly string[] => input.keymap?.()[a] ?? [];
  const keyText = (a: InputAction): string => keysOf(a).map(keyName).join(' or ');

  /* ---------- the stage ---------- */
  let on = false;
  let stageW = 0, stageH = 0;
  const fine = (): boolean => { try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch { return false; } };
  const wants = (): boolean => {
    const w = window.innerWidth, h = window.innerHeight;
    if (st.layout === 'phone') return false;
    if (st.layout === 'desktop') return w >= 900 && h >= 560;
    return w >= MIN_W && h >= MIN_H && fine();
  };
  let cl = -1, ct = -1, cw = -1, ch = -1;
  const placeCanvas = () => {
    if (!on) return;
    // The canvas is the whole stage on every screen: the room, the orrery and the surface are each drawn into the rect of their own element.
    const l = 0, t = 0, w = stageW, h = stageH;
    if (l === cl && t === ct && w === cw && h === ch) return;
    cl = l; ct = t; cw = w; ch = h;
    const s = canvas.style;
    s.left = `${l}px`; s.top = `${t}px`; s.right = 'auto'; s.bottom = 'auto'; s.width = `${w}px`; s.height = `${h}px`;
    scaleGl();
  };
  const scaleGl = () => {
    if (!on) { stage.glScale = 1; return; }
    const ps = Math.max(1, Math.floor(Math.min(window.devicePixelRatio || 1, 2)));
    const px = Math.max(1, cw * ch * ps * ps);
    let q = 1;
    try { q = ctx.perf.resolutionScale(); } catch { q = 1; }
    stage.glScale = Math.round(Math.min(1, Math.sqrt(MAX_PIXELS / px)) * q * 100) / 100;
  };
  const apply = () => {
    const want = wants();
    root.classList.toggle('sallow-desktop', want);
    root.classList.toggle('sallow-theatre', want && st.theatre !== 0);
    if (want) {
      root.style.setProperty('--theatre-h', `${st.theatre || 720}px`);
      const r = host.getBoundingClientRect();
      stageW = Math.round(r.width); stageH = Math.round(r.height);
      const k = st.scale / 100;
      const panel = Math.round(Math.max(340, Math.min(480, stageW * 0.3)) * Math.min(1.25, Math.max(0.9, k)));
      root.style.setProperty('--stage-w', `${stageW}px`);
      root.style.setProperty('--stage-h', `${stageH}px`);
      root.style.setProperty('--panel-w', `${panel}px`);
      root.style.setProperty('--play-w', `${stageW - panel}px`);
      root.style.setProperty('--ui-scale', String(k));
      root.style.setProperty('--dt-text', String(k));
      root.classList.toggle('dt-text', k !== 1);
      if (k !== 1) { try { buildTextScale(); } catch (e) { console.error(e); } }
    } else if (on) {
      for (const v of ['--stage-w', '--stage-h', '--panel-w', '--play-w', '--ui-scale', '--dt-text', '--theatre-h']) root.style.removeProperty(v);
      root.classList.remove('dt-text');
      for (const p of ['left', 'top', 'right', 'bottom', 'width', 'height']) canvas.style.removeProperty(p);
      cl = ct = cw = ch = -1;
      hideTip();
    }
    const changed = want !== on;
    on = want;
    if (on) { cl = -1; placeCanvas(); } else stage.glScale = 1;
    if (changed) window.dispatchEvent(new CustomEvent('sallow:layout', { detail: { desktop: on } }));
  };
  window.addEventListener('resize', apply);
  document.addEventListener('fullscreenchange', () => { apply(); paintPage?.(); });
  try { ctx.perf.onChange(() => scaleGl()); } catch { /* no perf here */ }
  shell.onNavigate(() => { if (on) { placeCanvas(); closeHelp(); hideTip(); } });
  let sinceCheck = 0;
  shell.onFrame((dt) => {
    try {
      panFrame(dt);
      sinceCheck += dt;
      if (sinceCheck < 250) return;
      sinceCheck = 0;
      if (on) { placeCanvas(); scaleGl(); }
      padCheck();
    } catch { /* never into the frame loop */ }
  });

  /* ---------- fullscreen ---------- */
  const isFull = () => !!document.fullscreenElement;
  const setFull = (v: boolean) => {
    st.fullscreen = v; save();
    try { if (v && !isFull()) void root.requestFullscreen?.().catch(() => undefined); else if (!v && isFull()) void document.exitFullscreen?.().catch(() => undefined); } catch { /* not allowed here */ }
  };
  // A stored wish for fullscreen can only be granted from a gesture.
  if (st.fullscreen) window.addEventListener('pointerdown', () => { if (st.fullscreen && wants() && !isFull()) setFull(true); }, { once: true });

  /* ---------- the hub as a dialog with a left nav ---------- */
  const sheet = host.querySelector<HTMLElement>('.hub-sheet');
  const hubBody = host.querySelector<HTMLElement>('.hub-body');
  const hubTitle = host.querySelector<HTMLElement>('.hub-head h2');
  const frame = host.querySelector<HTMLElement>('.hub-frame');
  const nav = mk('nav', 'dt-nav');
  nav.setAttribute('aria-label', 'Menu pages');
  let entries: { id: string; label: string; hint: string; badge: string }[] = [];
  const readList = (): boolean => {
    if (!hubBody) return false;
    const items = Array.from(hubBody.querySelectorAll<HTMLElement>(':scope > .hub-item[data-id^="hub-"]'));
    if (!items.length) return false;
    entries = items.map((b) => ({ id: (b.dataset.id ?? '').slice(4), label: b.querySelector('span')?.firstChild?.textContent ?? '', hint: b.querySelector('small')?.textContent ?? '', badge: b.querySelector(':scope > b')?.textContent ?? '' }));
    return true;
  };
  let navSig = '';
  const paintNav = (force = false) => {
    const cur = hubTitle?.textContent ?? '';
    const sig = entries.map((e) => `${e.id}|${e.label}|${e.badge}`).join(';');
    if (!force && sig === navSig) {
      // Same pages: only the mark moves, so a button under the cursor is never replaced mid-click.
      Array.from(nav.children).forEach((b, i) => b.setAttribute('aria-current', String(entries[i]?.label === cur)));
      return;
    }
    navSig = sig;
    nav.replaceChildren(...entries.map((e) => {
      const b = mk('button', 'dt-nav-item');
      b.type = 'button';
      b.dataset.id = `dt-nav-${e.id}`;
      b.append(mk('span', '', e.label));
      if (e.badge) b.append(mk('b', '', e.badge));
      const k = (Object.keys(HUB_KEYS) as InputAction[]).find((a) => HUB_KEYS[a] === e.id);
      b.dataset.tip = `${e.hint}${k && keyText(k) ? ` (${keyText(k)})` : ''}`;
      b.setAttribute('aria-current', String(e.label === cur));
      b.addEventListener('click', () => { st.page = e.id; save(); shell.menu.open(e.id); });
      return b;
    }));
  };
  if (sheet && hubBody && hubTitle && frame) {
    sheet.insertBefore(nav, hubBody);
    let busy = false;
    // Only the page being swapped and the title changing matter; what a page does inside itself is its own business.
    const mo = new MutationObserver(() => {
      if (busy) return;
      busy = true;
      try {
        // The plain list is the phone's menu. On a desktop the nav is always there, so the list gives way to a page.
        if (readList() && on && shell.menu.isOpen()) {
          const want = entries.find((e) => e.id === st.page) ?? entries[0];
          if (want) shell.menu.open(want.id);
        }
        paintNav();
      } catch (e) { console.error(e); }
      queueMicrotask(() => { busy = false; });
    });
    mo.observe(hubBody, { childList: true });
    mo.observe(hubTitle, { childList: true, characterData: true, subtree: true });
    // Clicking the dimmed stage beside the dialog closes it.
    frame.addEventListener('pointerdown', (e) => { if (on && e.target === frame && shell.menu.isOpen()) shell.menu.close(); });
    // Learn the pages once, unseen, so a page opened by a key already has its nav.
    window.setTimeout(() => {
      try { if (!shell.menu.isOpen()) { busy = true; shell.menu.open(); readList(); shell.menu.close(); paintNav(); queueMicrotask(() => { busy = false; }); } } catch { busy = false; }
    }, 0);
  }

  /* ---------- tooltips ---------- */
  const tip = mk('div', 'dt-tip');
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  host.append(tip);
  let tipTimer = 0;
  let tipFor: Element | null = null;
  function hideTip() { window.clearTimeout(tipTimer); tip.hidden = true; tipFor = null; delete tip.dataset.id; }
  const tipText = (e: HTMLElement): string => {
    const id = e.dataset.id ?? '';
    const a = KEY_OF[id];
    const said = e.dataset.tip ?? e.getAttribute('aria-label') ?? '';
    const key = a ? keyText(a) : '';
    // A terse control says what it is; a control with a key says the key.
    if (said && said !== e.textContent) return key ? `${said} (${key})` : said;
    return key ? `Key: ${key}` : '';
  };
  host.addEventListener('mouseover', (ev) => {
    if (!on) return;
    const e = (ev.target as Element | null)?.closest?.('button, [data-tip], .tip');
    if (e === tipFor) return;
    hideTip();
    if (!(e instanceof HTMLElement)) return;
    const text = tipText(e);
    if (!text) return;
    tipFor = e;
    tipTimer = window.setTimeout(() => {
      if (!e.isConnected) return;
      tip.textContent = text;
      tip.hidden = false;
      const r = e.getBoundingClientRect(), hr = host.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
      const x = Math.max(6, Math.min(hr.width - tw - 6, r.left - hr.left + r.width / 2 - tw / 2));
      const below = r.bottom - hr.top + 8;
      tip.style.left = `${Math.round(x)}px`;
      tip.style.top = `${Math.round(below + th > hr.height - 4 ? r.top - hr.top - th - 8 : below)}px`;
    }, 420);
  });
  host.addEventListener('mouseleave', hideTip);
  window.addEventListener('pointerdown', hideTip, true);
  window.addEventListener('wheel', hideTip, { capture: true, passive: true });

  /* ---------- mouse: aim by hovering, name an orbit, pan with the other buttons ---------- */
  host.addEventListener('pointermove', (ev) => {
    if (!on || ev.pointerType !== 'mouse' || shell.menu.isOpen()) return;
    try {
      const scr = shell.current();
      const t = ev.target as Element | null;
      if (scr === 'dive' && ev.buttons === 0 && t?.closest?.('[data-id=fold-field]')) {
        const v = ctx.dive.view();
        if (v.phase === 'surfaced' || v.steerLocked || v.children.length < 2) return;
        const r = canvas.getBoundingClientRect();
        const i = childAt(foldFrame(ctx.gl.width(), ctx.gl.height(), v.progress, v.aim), ev.clientX - r.left, ev.clientY - r.top);
        if (i >= 0 && i !== v.aim) ctx.dive.aim(i);
      } else if (scr === 'system') {
        const field = t?.closest?.('[data-id=orbits]');
        if (!(field instanceof HTMLElement)) return;
        const r = canvas.getBoundingClientRect();
        const o = ev.target === field ? ctx.renderers.system.orbitAt(ev.clientX - r.left, ev.clientY - r.top) : -1;
        field.classList.toggle('dt-over-orbit', o >= 0);
        if (o >= 0) field.dataset.tip = `Orbit ${o + 1}`; else delete field.dataset.tip;
      } else if (scr === 'planet') {
        // The village under the cursor, by name: the surface element answers through its read-only sallowView.
        const slot = ev.target instanceof HTMLElement && ev.target.dataset.id === 'surface' ? ev.target : null;
        const hit = slot && ev.buttons === 0 ? (slot as HTMLElement & { sallowView?: SurfaceView }).sallowView?.pick(ev.clientX, ev.clientY)?.village ?? null : null;
        if (hit && slot) {
          const text = `${hit.name} · ${hit.souls} ${hit.souls === 1 ? 'soul' : 'souls'}`;
          window.clearTimeout(tipTimer);
          if (tip.textContent !== text || tip.hidden) { tip.textContent = text; tip.hidden = false; }
          tip.dataset.id = 'dt-village-tip';
          tipFor = slot;
          const hr = host.getBoundingClientRect(), k = st.scale / 100;
          tip.style.left = `${Math.round(Math.max(6, Math.min(hr.width - tip.offsetWidth * k - 6, ev.clientX - hr.left + 14)) / k)}px`;
          tip.style.top = `${Math.round(Math.max(6, ev.clientY - hr.top - tip.offsetHeight * k - 12) / k)}px`;
        } else if (tip.dataset.id === 'dt-village-tip') hideTip();
      }
    } catch { /* a hover must never break anything */ }
  });
  // Right or middle drag on a world pans it whatever is in hand (the planet screen does that itself); here only the cursor and the village note.
  const surfaceOf = (t: EventTarget | null): HTMLElement | null => (t as Element | null)?.closest?.<HTMLElement>('[data-id=surface]') ?? null;
  const watching = (slot: HTMLElement): boolean => { const chip = slot.querySelector<HTMLElement>('[data-id=tool-chip]'); return !chip || chip.hidden; };
  host.addEventListener('pointerdown', (ev) => {
    if (!on || ev.pointerType !== 'mouse' || ev.button === 0) return;
    const slot = surfaceOf(ev.target);
    if (!slot || ev.target !== slot) return;
    slot.classList.add('dt-grabbing');
    window.addEventListener('pointerup', () => slot.classList.remove('dt-grabbing'), { once: true });
  }, true);
  host.addEventListener('contextmenu', (ev) => { if (on && surfaceOf(ev.target)) ev.preventDefault(); });
  host.addEventListener('auxclick', (ev) => { if (on && surfaceOf(ev.target)) ev.preventDefault(); });

  /* ---------- keyboard: panning a world with the steering keys ---------- */
  const PAN_ID = 9731;
  const held = { left: false, right: false, up: false, down: false };
  let panSlot: HTMLElement | null = null;
  let panX = 0, panY = 0;
  const safeCapture = new WeakSet<HTMLElement>();
  /** A pointer made of keys. `pan` presses the middle button, which the surface always reads as a pan, tool in hand or not. */
  const pe = (type: string, x: number, y: number, pan = false) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: PAN_ID, pointerType: 'mouse', button: pan ? 1 : 0, buttons: type === 'pointerup' ? 0 : pan ? 4 : 1, clientX: x, clientY: y });
  /** A tool in hand, used on the middle of the view: what Enter does on a world. */
  const useCentre = (slot: HTMLElement) => {
    makeSafe(slot);
    const r = slot.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    slot.dispatchEvent(pe('pointerdown', x, y));
    slot.dispatchEvent(pe('pointerup', x, y));
  };
  const makeSafe = (slot: HTMLElement) => {
    if (!safeCapture.has(slot)) {
      // The surface captures the pointer that presses it; a pointer made of keys cannot be captured, and need not be.
      const real = slot.setPointerCapture.bind(slot), has = slot.hasPointerCapture.bind(slot), rel = slot.releasePointerCapture.bind(slot);
      slot.setPointerCapture = (id: number) => { if (id !== PAN_ID) real(id); };
      slot.hasPointerCapture = (id: number) => id !== PAN_ID && has(id);
      slot.releasePointerCapture = (id: number) => { if (id !== PAN_ID) rel(id); };
      safeCapture.add(slot);
    }
  };
  const panStart = (): boolean => {
    const slot = layer.querySelector<HTMLElement>('[data-id=surface]');
    if (!slot) return false;
    makeSafe(slot);
    const r = slot.getBoundingClientRect();
    panSlot = slot; panX = r.left + r.width / 2; panY = r.top + r.height / 2;
    slot.dispatchEvent(pe('pointerdown', panX, panY, true));
    return true;
  };
  const panEnd = () => {
    const slot = panSlot;
    if (!slot) return;
    panSlot = null;
    if (slot.isConnected) {
      slot.dispatchEvent(pe('pointerup', panX, panY, true));
    }
  };
  function panFrame(dt: number) {
    if (!panSlot) return;
    const dx = (held.left ? 1 : 0) - (held.right ? 1 : 0), dy = (held.up ? 1 : 0) - (held.down ? 1 : 0);
    if ((!dx && !dy) || !panSlot.isConnected || shell.current() !== 'planet' || shell.menu.isOpen()) { panEnd(); return; }
    const step = Math.min(40, dt * 0.55);
    panX += dx * step; panY += dy * step;
    panSlot.dispatchEvent(pe('pointermove', panX, panY, true));
  }
  const DIRS: readonly InputAction[] = ['left', 'right', 'up', 'down'];
  const panning = (): boolean => shell.current() === 'planet' && !shell.menu.isOpen() && !helpOpen() && !ctx.sim.latest()?.civ.avatar;

  /* ---------- actions ---------- */
  const click = (sel: string, scope: ParentNode = layer): boolean => {
    for (const e of Array.from(scope.querySelectorAll(sel))) if (visible(e)) { e.click(); return true; }
    return false;
  };
  const cycleTab = (dir: 1 | -1): boolean => {
    const tabs = Array.from(layer.querySelectorAll<HTMLElement>('.sp-tabs .sp-tab')).filter(visible);
    if (tabs.length < 2) return false;
    const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    tabs[(Math.max(0, i) + dir + tabs.length) % tabs.length]!.click();
    return true;
  };
  const speed = (s: 0 | 1 | 3) => { if (!click(`[data-id=speed-${s}]`)) ctx.clock.setSpeed(s); };
  const openPage = (id: string) => {
    if (shell.menu.isOpen() && entries.find((e) => e.id === id)?.label === hubTitle?.textContent) { shell.menu.close(); return; }
    st.page = id; save();
    shell.menu.open(id);
  };
  /** True when the event was dealt with here and nobody else should hear it. */
  const gate = (e: InputEvent): boolean => {
    if (e.type !== 'key') return false;
    const { action, phase } = e;
    const dir = DIRS.includes(action);
    if (phase === 'up') {
      if (dir && held[action as 'left']) { held[action as 'left'] = false; return true; }
      return false;
    }
    if (rebinding) return true;
    if (helpOpen()) { if (action === 'back' || action === 'help' || action === 'confirm' || action === 'menu') closeHelp(); return true; }
    const open = shell.menu.isOpen();
    switch (action) {
      case 'help': openHelp(); return true;
      case 'fullscreen': setFull(!isFull()); return true;
      case 'journal': case 'codex': case 'almanac': openPage(HUB_KEYS[action]!); return true;
      case 'tabNext': case 'tabPrev': return !open && cycleTab(action === 'tabNext' ? 1 : -1);
      default: break;
    }
    if (open) return false;
    if (dir && panning()) {
      if (!panSlot && !panStart()) return false;
      held[action as 'left'] = true;
      return true;
    }
    if ((action === 'confirm' || action === 'hold') && shell.current() === 'planet') {
      const slot = layer.querySelector<HTMLElement>('[data-id=surface]');
      if (slot && !watching(slot)) { useCentre(slot); return true; }
    }
    if (action.startsWith('tool') && shell.current() === 'planet') {
      // On a world the number keys belong to the page that is open: its tools, its sky pieces, or the body's deeds.
      const tab = layer.querySelector<HTMLElement>('.sp-tabs .sp-tab[aria-selected="true"]')?.dataset.id?.slice(4);
      const page = tab ? layer.querySelector(`[data-id="page-${tab}"]`) : null;
      const list = page ? Array.from(page.querySelectorAll('[data-id^="tool-"], [data-id^="sky-add-"], [data-id^="act-"]')).filter(visible) : [];
      if (!list.length) return false;
      list[Number(action.slice(4)) - 1]?.click();
      return true;
    }
    switch (action) {
      case 'box': if (shell.current() !== 'box' && shell.current() !== 'battle') ctx.go('box'); return true;
      case 'zoomIn': click('[data-id=zoom-in]'); return true;
      case 'zoomOut': click('[data-id=zoom-out]'); return true;
      case 'speed0': speed(0); return true;
      case 'speed1': speed(1); return true;
      case 'speed3': speed(3); return true;
      case 'eyes': if (shell.current() === 'planet') click('[data-id=eyes]'); return true;
      case 'guard': if (shell.current() === 'battle') click('[data-id=guard]'); return true;
      case 'fuse': if (shell.current() === 'battle') click('[data-id=fuse]'); return true;
      default: return false;
    }
  };
  input.intercept?.(gate);

  /* ---------- the controls overlay (?) ---------- */
  const help = mk('section', 'dt-help');
  help.dataset.id = 'dt-help';
  help.setAttribute('role', 'dialog');
  help.setAttribute('aria-label', 'Controls for this screen');
  help.hidden = true;
  host.append(help);
  help.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === help) closeHelp(); });
  function helpOpen(): boolean { return !help.hidden; }
  function closeHelp() { help.hidden = true; }
  const SCREEN_NAMES: Record<ScreenId, string> = { bedroom: 'The bedroom', box: 'The Box', dive: 'A dive', system: 'A star and its worlds', planet: 'A world', outside: 'Outside', battle: 'A battle', mirror: 'The mirror', town: 'The street' };
  const helpRow = (keys: string, does: string) => { const r = mk('div', 'dt-help-row'); r.append(mk('kbd', '', keys || 'unbound'), mk('span', '', does)); return r; };
  function openHelp() {
    const scr = shell.current() ?? 'bedroom';
    const per = PER_SCREEN[scr];
    const does = (a: InputAction) => ACTIONS.find((x) => x.action === a)?.does ?? a;
    const card = mk('div', 'dt-help-card');
    const cols = mk('div', 'dt-help-cols');
    const col = (title: string, rows: HTMLElement[]) => { const c = mk('div', 'dt-help-col'); c.append(mk('h3', '', title), ...rows); cols.append(c); };
    col('Here', per.keys.map((a) => (a === 'tool1' ? helpRow('1 to 9', scr === 'battle' ? 'Use a move' : 'The open page: pick a tool, hang a sky piece, do a deed') : helpRow(keyText(a), does(a)))));
    col('Mouse', per.mouse.map((m) => { const r = mk('div', 'dt-help-row'); r.append(mk('span', '', m)); return r; }));
    col('Everywhere', COMMON.map((a) => helpRow(keyText(a), does(a))));
    card.append(mk('h2', '', `Controls · ${SCREEN_NAMES[scr]}`), cols, mk('p', 'dt-help-foot', `Change any key in Menu, Controls. ${keyText('help') || '?'} or ${keyText('back') || 'Esc'} closes this.`));
    help.replaceChildren(card);
    help.hidden = false;
  }

  /* ---------- gamepad legend ---------- */
  const pad = mk('div', 'dt-pad');
  pad.dataset.id = 'dt-pad';
  pad.hidden = true;
  for (const [g, t] of [['A', 'confirm · fall'], ['B', 'back'], ['LB RB', 'pages'], ['LT RT', 'zoom'], ['Start', 'menu']] as const) { const s = mk('span'); s.append(mk('kbd', '', g), t); pad.append(s); }
  host.append(pad);
  function padCheck() {
    let any = false;
    try { any = [...(navigator.getGamepads?.() ?? [])].some((g) => g?.connected); } catch { any = false; }
    if (pad.hidden === any) pad.hidden = !any;
  }

  /* ---------- the Controls page ---------- */
  let rebinding = false;
  let paintPage: (() => void) | null = null;
  const render = (into: HTMLElement): (() => void) => {
    const page = mk('div', 'dt-page');
    let stopCapture: (() => void) | null = null;
    const section = (title: string, id: string) => { const s = mk('section', 'dt-sec'); s.dataset.id = id; s.append(mk('h3', '', title)); return s; };
    const row = (label: string, note: string, control: HTMLElement) => {
      const r = mk('div', 'dt-row'), t = mk('div', 'dt-text');
      t.append(mk('b', '', label));
      if (note) t.append(mk('small', '', note));
      r.append(t, control);
      return r;
    };
    const choice = <T extends string | number>(id: string, opts: readonly (readonly [T, string])[], get: () => T, put: (v: T) => void) => {
      const g = mk('div', 'dt-choice');
      g.setAttribute('role', 'group');
      for (const [v, label] of opts) { const b = btn(label, `${id}-${v}`, () => put(v)); b.setAttribute('aria-pressed', String(v === get())); g.append(b); }
      return g;
    };
    const paint = () => {
      stopCapture?.();
      const top = into.scrollTop;
      page.replaceChildren();

      const disp = section('Display', 'dt-display');
      const fits = wants();
      disp.append(
        row('Layout', st.layout === 'desktop' && !fits ? 'This window is too small for the wide layout.' : st.layout === 'auto' ? `Auto picks the wide layout for a big window and a mouse. Now: ${on ? 'desktop' : 'phone'}.` : 'Wide for a desktop, or the tall phone column.',
          choice<LayoutMode>('dt-layout', [['auto', 'Auto'], ['desktop', 'Desktop'], ['phone', 'Phone']], () => st.layout, (v) => { st.layout = v; save(); apply(); paint(); })),
        row('UI scale', `Side panels, the menu, notices and the type on every screen. ${st.scale}%.`,
          choice<number>('dt-scale', [[80, '80'], [90, '90'], [100, '100'], [110, '110'], [120, '120'], [140, '140']], () => st.scale, (v) => { st.scale = v; save(); apply(); paint(); })),
        row('Window', 'Fill the window, or keep a fixed stage in the middle of it.',
          choice<Theatre>('dt-theatre', [[0, 'Fill'], [720, '1280×720'], [900, '1600×900']], () => st.theatre, (v) => { st.theatre = v; save(); apply(); paint(); })),
        row('Fullscreen', `${keyText('fullscreen') || 'No key'} switches it too.`, (() => { const b = btn(isFull() ? 'On' : 'Off', 'dt-fullscreen', () => setFull(!isFull())); b.setAttribute('aria-pressed', String(isFull())); return b; })()),
      );

      const keys = section('Keyboard', 'dt-keys');
      const say = mk('p', 'dt-say');
      say.dataset.id = 'dt-say';
      say.setAttribute('role', 'status');
      const cur = (): Record<string, readonly string[]> => ({ ...(input.keymap?.() ?? {}) });
      const commit = (m: Record<string, readonly string[]>) => { st.keys = m as InputKeymap; save(); input.setKeymap?.(st.keys); paintNav(true); };
      let armed: { action: InputAction; code: string } | null = null;
      const listen = (action: InputAction, slot: number, b: HTMLButtonElement) => {
        stopCapture?.();
        rebinding = true;
        b.textContent = 'Press a key';
        b.classList.add('listening');
        say.textContent = 'Press the key to use. Esc leaves it as it was.';
        const onKey = (ev: KeyboardEvent) => {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(ev.code)) return;
          if (ev.code === 'Escape') { paint(); return; }
          const code = ev.shiftKey ? `Shift+${ev.code}` : ev.code;
          const m = cur();
          const owner = ACTIONS.find((a) => a.action !== action && (m[a.action] ?? []).includes(code) && clashes(action, a.action));
          if (owner && !(armed && armed.action === action && armed.code === code)) {
            armed = { action, code };
            say.textContent = `${keyName(code)} already means “${owner.does}”. Press it again to take it from there.`;
            say.classList.add('bad');
            return;
          }
          if (owner) m[owner.action] = (m[owner.action] ?? []).filter((c) => c !== code);
          const mine = [...(m[action] ?? [])].filter((c) => c !== code);
          mine[Math.min(slot, mine.length)] = code;
          m[action] = mine;
          commit(m);
          paint();
          const s = page.querySelector<HTMLElement>('[data-id=dt-say]');
          if (s) s.textContent = `${keyName(code)} now means “${ACTIONS.find((a) => a.action === action)?.does ?? action}”.`;
        };
        window.addEventListener('keydown', onKey, true);
        stopCapture = () => { window.removeEventListener('keydown', onKey, true); rebinding = false; stopCapture = null; };
      };
      const table = mk('div', 'dt-keytable');
      for (const a of ACTIONS) {
        const r = mk('div', 'dt-keyrow');
        r.dataset.id = `dt-key-${a.action}`;
        r.append(mk('span', 'dt-does', a.where ? `${a.does} (${a.where})` : a.does));
        const codes = keysOf(a.action);
        const cell = mk('div', 'dt-keys');
        codes.forEach((code, i) => { const b = btn(keyName(code), `dt-bind-${a.action}-${i}`, () => listen(a.action, i, b), 'dt-key'); b.dataset.tip = 'Click, then press the new key'; cell.append(b); });
        if (codes.length < 2) { const b = btn('+', `dt-bind-${a.action}-${codes.length}`, () => listen(a.action, codes.length, b), 'dt-key add'); b.setAttribute('aria-label', 'Add a key'); cell.append(b); }
        if (codes.length) { const x = btn('×', `dt-unbind-${a.action}`, () => { const m = cur(); m[a.action] = (m[a.action] ?? []).slice(0, -1); commit(m); paint(); }, 'dt-key add'); x.setAttribute('aria-label', 'Remove the last key'); cell.append(x); }
        if (a.pad) cell.append(mk('small', 'dt-padkey', `pad ${a.pad}`));
        r.append(cell);
        table.append(r);
      }
      keys.append(
        mk('p', 'dt-note', `Click a key to change it. ${keyText('help') || '?'} shows the keys that matter on the screen you are on. Keys never fire while you type in a box.`),
        say, table,
        btn('Put every key back', 'dt-reset', () => { st.keys = null; save(); input.setKeymap?.(null); paintNav(true); paint(); const s = page.querySelector<HTMLElement>('[data-id=dt-say]'); if (s) s.textContent = 'Every key is as it began.'; }),
      );

      const mouse = section('Mouse and gamepad', 'dt-mouse');
      mouse.append(
        mk('p', 'dt-note', 'Mouse: wheel leans in on a world where the cursor is; drag pans while watching, and right or middle drag pans with any tool in hand; rest the cursor on a village to read its name; on the orrery the wheel zooms and a drag pans; click uses the tool in hand and holding repeats; double click leans in; drag sky pieces onto orbits; move over a ring in a dive to aim at it.'),
        mk('p', 'dt-note', 'Gamepad: sticks or D-pad steer, pan and walk. A confirms and falls, B goes back, X presses the button in focus, Y pauses, LB and RB turn pages, LT and RT zoom, Start opens the menu, Select shows the controls.'),
      );
      page.append(disp, keys, mouse);
      into.scrollTop = top;
    };
    paintPage = paint;
    paint();
    into.append(page);
    return () => { stopCapture?.(); paintPage = null; page.remove(); };
  };
  shell.menu.add({ id: 'controls', label: 'Controls', hint: 'Keys, mouse, gamepad, display', order: 82, render });

  apply();
  // Fonts and the first screen settle after boot; measure again once they have.
  window.setTimeout(apply, 300);
};
