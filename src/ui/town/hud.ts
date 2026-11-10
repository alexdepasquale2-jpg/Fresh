// The town HUD: place, time, coins, the current errand, and four buttons. Nothing sits under the hub button (top right).
import { el } from '@/ui/kit';
import { clockText, type Town } from '@/game/town';

export interface Hud {
  /** Refresh text (call a few times a second, not every frame). */
  update(place: string): void;
  banner(title: string, sub: string): void;
  stick(on: boolean, ox: number, oy: number, kx: number, ky: number): void;
  setRun(on: boolean): void;
}

const WEATHER = { clear: '', rain: ' · RAIN', fog: ' · FOG', wind: ' · WIND' } as const;

export const createHud = (root: HTMLElement, town: Town, on: { run(): void; bag(): void; map(): void; home(): void }): Hud => {
  const place = el('b', { class: 'town-place', 'data-id': 'town-place' }, '');
  const time = el('span', { class: 'k-label', 'data-id': 'town-time' }, '');
  const coins = el('span', { class: 'k-label town-coins', 'data-id': 'town-coins' }, '');
  const hint = el('p', { class: 'town-hint', 'data-id': 'town-hint' }, '');
  const top = el('div', { class: 'town-top' }, el('div', { class: 'town-top-row' }, place, coins), time, hint);
  const btn = (label: string, id: string, fn: () => void): HTMLButtonElement => { const b = el('button', { class: 'k-btn town-btn', type: 'button', 'data-id': id }, label); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; };
  const run = btn('Run', 'town-run', on.run);
  const bar = el('div', { class: 'town-bar' }, run, btn('Bag', 'town-bag', on.bag), btn('Map', 'town-map-btn', on.map), btn('Home', 'town-home', on.home));
  const ban = el('div', { class: 'town-banner', hidden: true }, el('b', {}, ''), el('span', {}, ''));
  const base = el('i', { class: 'town-stick', hidden: true }), knob = el('i', { class: 'town-knob', hidden: true });
  root.append(top, ban, base, knob, bar);
  let banTimer = 0, lastHint = '', lastPlace = '', lastTime = '', lastCoins = -1;
  return {
    update: (p) => {
      const st = town.state, t = `${clockText(st.minutes)} · ${town.phase().toUpperCase()}${WEATHER[town.weather()]}`;
      if (p !== lastPlace) { lastPlace = p; place.textContent = p; }
      if (t !== lastTime) { lastTime = t; time.textContent = t; }
      if (st.coins !== lastCoins) { lastCoins = st.coins; coins.textContent = `${st.coins}c`; }
      const lead = town.lead(), h = lead ? lead.hint : '';
      if (h !== lastHint) { lastHint = h; hint.textContent = h; hint.hidden = !h; }
    },
    banner: (title, sub) => {
      ban.children[0]!.textContent = title; ban.children[1]!.textContent = sub; ban.hidden = false;
      ban.classList.remove('go'); void ban.offsetWidth; ban.classList.add('go');
      window.clearTimeout(banTimer); banTimer = window.setTimeout(() => { ban.hidden = true; }, 3200);
    },
    stick: (onNow, ox, oy, kx, ky) => {
      if (base.hidden === onNow) { base.hidden = !onNow; knob.hidden = !onNow; }
      if (onNow) { base.style.transform = `translate(${ox - 44}px, ${oy - 44}px)`; knob.style.transform = `translate(${kx - 16}px, ${ky - 16}px)`; }
    },
    setRun: (r) => { run.setAttribute('aria-pressed', String(r)); },
  };
};
