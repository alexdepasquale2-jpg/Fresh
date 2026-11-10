// The hub: the single menu button, the sheet plugin panels open in, toasts, and small
// persistent stores. Plugins reach it through Shell (see plugins.ts) and never build
// their own floating buttons, so nothing overlaps.
import './hub.css';
import type { MenuEntry, Shell } from './plugins';

const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export const createHub = (host: HTMLElement, sfx: (name: string) => void): Pick<Shell, 'menu' | 'toast' | 'store'> => {
  const entries: MenuEntry[] = [];
  const frame = mk('div', 'hub-frame');
  const btn = mk('button', 'hub-btn');
  btn.type = 'button';
  btn.dataset.id = 'hub';
  btn.setAttribute('aria-label', 'Menu');
  btn.append(mk('i', '', '≡'));
  const sheet = mk('section', 'hub-sheet');
  sheet.setAttribute('role', 'dialog');
  const head = mk('div', 'hub-head');
  const title = mk('h2', '', 'Menu');
  const back = mk('button', '', 'Back');
  back.type = 'button';
  back.dataset.id = 'hub-back';
  const shut = mk('button', '', 'Close');
  shut.type = 'button';
  shut.dataset.id = 'hub-close';
  head.append(back, title, shut);
  const body = mk('div', 'hub-body');
  sheet.append(head, body);
  const toasts = mk('div', 'hub-toasts');
  frame.append(toasts, sheet, btn);
  host.append(frame);
  // Presses on the hub are not for the screen underneath.
  for (const e of [btn, sheet]) e.addEventListener('pointerdown', (ev) => ev.stopPropagation());

  let isOpen = false;
  let cleanup: (() => void) | null = null;
  const leave = () => { try { cleanup?.(); } catch (e) { console.error(e); } cleanup = null; };
  const badgeOf = (e: MenuEntry) => { try { return e.badge?.() ?? null; } catch { return null; } };
  const list = () => {
    leave();
    title.textContent = 'Menu';
    back.hidden = true;
    body.replaceChildren(...[...entries].sort((a, b) => (a.order ?? 50) - (b.order ?? 50)).map((e) => {
      const b = mk('button', 'hub-item');
      b.type = 'button';
      b.dataset.id = `hub-${e.id}`;
      const text = mk('span', '', e.label);
      if (e.hint) text.append(mk('small', '', e.hint));
      b.append(text);
      const badge = badgeOf(e);
      if (badge) b.append(mk('b', '', badge));
      b.addEventListener('click', () => show(e.id));
      return b;
    }));
  };
  const close = () => { leave(); isOpen = false; frame.classList.remove('open'); };
  const show = (id?: string) => {
    isOpen = true;
    frame.classList.add('open');
    const e = id ? entries.find((x) => x.id === id) : undefined;
    if (!e) { list(); return; }
    leave();
    title.textContent = e.label;
    back.hidden = false;
    body.replaceChildren();
    try { cleanup = e.render(body, close) ?? null; } catch (err) { console.error('menu entry failed', err); body.textContent = 'This page could not open.'; }
  };
  btn.addEventListener('click', () => show());
  back.addEventListener('click', list);
  shut.addEventListener('click', close);
  // The button lights when any entry has something to say.
  window.setInterval(() => { if (!isOpen) btn.classList.toggle('has-badge', entries.some((e) => !!badgeOf(e))); }, 1500);

  return {
    menu: {
      add: (entry) => { if (!entries.some((e) => e.id === entry.id)) entries.push(entry); if (isOpen && back.hidden) list(); },
      open: (id) => show(id),
      close,
      isOpen: () => isOpen,
    },
    toast: (text, opts) => {
      const t = mk('div', 'hub-toast');
      if (opts?.title) t.append(mk('b', '', opts.title));
      t.append(text);
      toasts.append(t);
      while (toasts.childElementCount > 3) toasts.firstElementChild?.remove();
      if (opts?.sfx !== '') sfx(opts?.sfx ?? 'gain');
      window.setTimeout(() => t.remove(), 4300);
    },
    store: (key, init) => {
      const k = `sallow-${key}`;
      let v = init;
      try { const raw = localStorage.getItem(k); if (raw) v = JSON.parse(raw) as typeof init; } catch { /* storage blocked or corrupt: start fresh */ }
      return {
        get: () => v,
        set: (next) => { v = next; try { localStorage.setItem(k, JSON.stringify(next)); } catch { /* storage blocked */ } },
      };
    },
  };
};
