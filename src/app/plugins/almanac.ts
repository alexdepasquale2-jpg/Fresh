/**
 * The Almanac: the game's daily rhythm. An omen for the calendar date (the same for
 * everyone on that date) with a real effect applied through the context, three daily
 * tasks and one weekly task read from real state, a streak that forgives one missed
 * day, a fortnight of history, the seasons of the real year, and now and then a visitor
 * with a choice to make.
 *
 * Dates and clocks are used here, in the shell, and nowhere a universe is made.
 *
 * Test-only overrides (localStorage, never written by the game):
 *   sallow-almanac-date    an ISO date (2026-03-01) used as "today".
 *   sallow-almanac-happen  trader | rival | loan | letter | any: the next happening
 *                          arrives now (still only in the bedroom or the Box, and
 *                          never over a battle, a dive or a card). Removed when used.
 *
 * Other plugins may read `window.__sallowAlmanac` ({ today(), omenOn(ms) }).
 */
import './almanac.css';
import { el, button } from '@/ui/kit';
import type { BoxEntry } from '@/contracts/game';
import type { SkyPieceKind } from '@/contracts/sky';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { ERAS } from '@/contracts/sim';
import type { Plugin } from '../plugins';

const DATE_KEY = 'sallow-almanac-date';
const HAPPEN_KEY = 'sallow-almanac-happen';
const CHECK_MS = 300;
const DAY_MS = 86_400_000;
/** The most an omen may hand out in one day (1000 = one pip), and the most pieces. */
const OMEN_GLOW_CAP = 5000;
const OMEN_PIECE_CAP = 8;
const FIRST_HAP_MS = 10 * 60_000;
const HAP_GAP_MS = 60 * 60_000;

// ---- dates ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const override = (): string | null => {
  try {
    const o = localStorage.getItem(DATE_KEY);
    return o && /^\d{4}-\d{2}-\d{2}$/.test(o) ? o : null;
  } catch { return null; }
};
const todayIso = (): string => override() ?? isoOf(new Date());
const dayNum = (iso: string): number => Math.floor(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY_MS);
const isoFromNum = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso: string): string => {
  const d = new Date(dayNum(iso) * DAY_MS);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
/** A small integer hash: the Almanac's only dice, thrown from the date. */
const h32 = (a: number, b = 0): number => {
  let x = (a ^ Math.imul((b + 0x9e3779b9) | 0, 0x85ebca6b)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; x = Math.imul(x, 0x846ca68b); x ^= x >>> 16;
  return x >>> 0;
};

// ---- omens ---------------------------------------------------------------------------
type Fx =
  | { t: 'free'; kind: SkyPieceKind }
  | { t: 'watch'; every: number; mode: 'flat' | 'souls' | 'villages' }
  | { t: 'dive'; give: 'piece' | 'toll' }
  | { t: 'record' } | { t: 'win'; give: 'sun' | 'pip' } | { t: 'tasks' } | { t: 'wake' } | { t: 'hang' }
  | { t: 'found' } | { t: 'door' } | { t: 'body' } | { t: 'outside' } | { t: 'rest' };
interface Omen { id: string; name: string; line: string; does: string; fx: Fx }
const free = (kind: SkyPieceKind, id: string, name: string, line: string): Omen => ({
  id, name, line, fx: { t: 'free', kind },
  does: `Each time you run out of ${kind === 'rings' || kind === 'dust' ? kind : `${kind}s`} today, one more is there for nothing (${OMEN_PIECE_CAP} at most).`,
});
const OMENS: readonly Omen[] = [
  free('comet', 'comet-fair', 'The Comet Fair', 'Something long and cold went past the window in the night. It left its children.'),
  free('moon', 'spare-moon', 'Spare Moon', 'There is a moon in your pocket. You do not remember putting it there.'),
  free('belt', 'loose-gravel', 'Loose Gravel', 'The floor of the box is gritty today. It crunches when you lean in.'),
  free('sun', 'second-sun', 'Second Sun', 'The lamp on your desk is warm, and it is not switched on.'),
  free('rings', 'ring-day', 'Ring Day', 'Every cup in the house left a circle on the table.'),
  free('dust', 'dust-day', 'Dust Day', 'The light through the curtain is thick enough to hold.'),
  { id: 'tallow', name: 'Tallow Day', line: 'Their lamps burn slow and fat today. More of it reaches you.', does: 'While you watch a living world, 80 extra light arrives every half minute.', fx: { t: 'watch', every: 30, mode: 'flat' } },
  { id: 'crowded', name: 'The Crowded Hour', line: 'They are all awake at once. You can feel it through the glass.', does: 'While you watch a world, every minute pays one extra light for each soul on it (300 at most).', fx: { t: 'watch', every: 60, mode: 'souls' } },
  { id: 'long-look', name: 'The Long Look', line: 'Today they look up for longer than they need to.', does: 'While you watch a world, each of its villages sends 30 extra light every 45 seconds.', fx: { t: 'watch', every: 45, mode: 'villages' } },
  { id: 'deep-pockets', name: 'Deep Pockets', line: 'The folds are careless today. Things fall out of them.', does: 'Every dive you come back from leaves a piece of sky in your hand.', fx: { t: 'dive', give: 'piece' } },
  { id: 'toll', name: 'Toll Returned', line: 'Whatever takes your Light on the way down is not hungry today.', does: 'After each dive, 40 light comes back for every fold you fell (600 at most).', fx: { t: 'dive', give: 'toll' } },
  { id: 'new-floor', name: 'New Floor', line: 'The bottom is further off than it was. Mote thinks that is good news.', does: 'Each dive that takes you deeper into a universe than you have ever been pays 250 light.', fx: { t: 'record' } },
  { id: 'spoils', name: 'Spoils', line: 'The other kids left their windows open.', does: 'Every battle you win today pays a sun.', fx: { t: 'win', give: 'sun' } },
  { id: 'loud-day', name: 'The Loud Day', line: 'Someone outside is shouting your name. Not kindly.', does: 'Every battle you win today pays a whole pip of Light.', fx: { t: 'win', give: 'pip' } },
  { id: 'double-marks', name: 'Double Marks', line: 'Mote counted twice today, and liked the second number better.', does: "Today's tasks pay half as much light again.", fx: { t: 'tasks' } },
  { id: 'first-light', name: 'First Light', line: 'It was already bright when you sat down.', does: 'A pip of Light was waiting when the day began.', fx: { t: 'wake' } },
  { id: 'hanging-day', name: 'Hanging Day', line: 'The sky wants things in it. It pays to be filled.', does: 'Every piece you hang in a sky today gives back 150 light.', fx: { t: 'hang' } },
  { id: 'founders', name: "Founders' Day", line: 'Somewhere a family is packing. They are not afraid.', does: 'Each new village you see founded today sends 200 light.', fx: { t: 'found' } },
  { id: 'open-door', name: 'Open Door', line: 'Every lid in the box is a little ajar.', does: 'The first time you enter each universe today, 150 light.', fx: { t: 'door' } },
  { id: 'body-remembers', name: 'The Body Remembers', line: 'Your hands are cold this morning. They have been somewhere.', does: 'Each body you take today gives 300 light (three at most).', fx: { t: 'body' } },
  { id: 'step-outside', name: 'Step Outside', line: 'There is weather. It has been asking after you.', does: 'Each time you go outside today you find a comet on the step (three at most).', fx: { t: 'outside' } },
  { id: 'motes-rest', name: "Mote's Rest", line: 'Mote is not doing anything today. It is doing it very brightly.', does: 'Every two minutes you play, 60 light, wherever you are.', fx: { t: 'rest' } },
];
const omenIndex = (n: number): number => {
  const i = h32(n, 77) % OMENS.length;
  return i === h32(n - 1, 77) % OMENS.length ? (i + 1) % OMENS.length : i;
};
const omenOfDay = (n: number): Omen => OMENS[omenIndex(n)]!;

// ---- seasons and the days that come once a year ----------------------------------------
const SEASONS = [
  { id: 'winter', name: 'Winter', line: 'The window is cold. The box is not.' },
  { id: 'spring', name: 'Spring', line: 'Something outside is growing without being asked.' },
  { id: 'summer', name: 'Summer', line: 'The evenings go on. The box hums in the heat.' },
  { id: 'autumn', name: 'Autumn', line: 'The light comes in low and yellow, the colour of the box.' },
] as const;
const seasonOf = (iso: string) => SEASONS[Math.floor((Number(iso.slice(5, 7)) % 12) / 3)]!;
interface Feast { name: string; line: string; glow: number; pieces: readonly (readonly [SkyPieceKind, number])[] }
const FEASTS: Readonly<Record<string, Feast>> = {
  '01-01': { name: 'First Morning', line: 'The year is new. Nobody down there knows. Tell them with a sun.', glow: 2000, pieces: [['sun', 1]] },
  '02-29': { name: 'The Day That Is Not There', line: 'This day is not on most calendars. The box kept it for you.', glow: 2900, pieces: [['rings', 2], ['dust', 2]] },
  '06-21': { name: 'The Long Day', line: 'The light will not go. Mote is full of it and cannot sit still.', glow: 3000, pieces: [['sun', 2]] },
  '10-31': { name: 'Thin Night', line: 'Tonight the lid does not quite close. Something left these on it.', glow: 1000, pieces: [['comet', 2], ['dust', 2], ['moon', 1]] },
  '12-21': { name: 'The Long Night', line: 'The dark came early and stayed. Their lamps look closer than usual.', glow: 2000, pieces: [['moon', 2], ['comet', 1]] },
};

// ---- what is counted -------------------------------------------------------------------
const CKEYS = ['folds', 'dives', 'watch', 'hung', 'taken', 'nudged', 'wins', 'fights', 'villages', 'glow', 'bodies', 'outside', 'entered', 'caught', 'days'] as const;
type CKey = (typeof CKEYS)[number];
type Counters = Record<CKey, number>;
const zero = (): Counters => ({ folds: 0, dives: 0, watch: 0, hung: 0, taken: 0, nudged: 0, wins: 0, fights: 0, villages: 0, glow: 0, bodies: 0, outside: 0, entered: 0, caught: 0, days: 0 });

/** What a task may ask about before it is offered. */
interface Able { box: number; maxDepth: number; tended: number; bestSouls: number; pieces: number; maxPieces: number; beaten: number; pips: number }
interface Task {
  id: string; text: string; hint: string; group: string;
  /** A counter since the day (or week) began, or a best-of-the-day. */
  key: CKey | 'peakDeep' | 'peakSouls';
  goal: number; glow: number; piece?: SkyPieceKind;
  can(a: Able): boolean;
}
const DAILY: readonly Task[] = [
  { id: 'fall', group: 'dive', key: 'folds', goal: 8, glow: 500, text: 'Fall eight folds', hint: 'Enter a universe and hold HOLD.', can: (a) => a.box > 0 },
  { id: 'deep', group: 'dive', key: 'peakDeep', goal: 6, glow: 600, text: 'Reach fold six in one fall', hint: 'Fill your Light first. It drains by the fold.', can: (a) => a.box > 0 },
  { id: 'dives', group: 'dive', key: 'dives', goal: 2, glow: 500, piece: 'comet', text: 'Come back from two dives', hint: 'Fall, then surface or stop at a star. Twice.', can: (a) => a.box > 0 },
  { id: 'enter', group: 'box', key: 'entered', goal: 2, glow: 400, text: 'Enter a universe twice', hint: 'In the Box, choose a slot and press ENTER.', can: (a) => a.box > 0 },
  { id: 'catch', group: 'box', key: 'caught', goal: 1, glow: 800, piece: 'rings', text: 'Bring a new universe home', hint: 'Catch a flicker as you fall, or win one outside.', can: (a) => a.box < 25 && a.maxDepth >= 5 },
  { id: 'watch', group: 'surface', key: 'watch', goal: 120, glow: 600, text: 'Watch a living world for two minutes', hint: 'Stop at a star and watch a surface with souls on it.', can: (a) => a.tended > 0 },
  { id: 'glow', group: 'surface', key: 'glow', goal: 300, glow: 500, piece: 'moon', text: 'Let worlds feed you 300 light', hint: 'Souls glow. Keep watching a living world.', can: (a) => a.bestSouls > 0 },
  { id: 'souls', group: 'surface', key: 'peakSouls', goal: 60, glow: 700, text: 'See sixty souls on one world', hint: 'Mild seasons, water and food, and time.', can: (a) => a.bestSouls >= 25 },
  { id: 'village', group: 'surface', key: 'villages', goal: 1, glow: 700, piece: 'dust', text: 'See a village founded', hint: 'A crowded village sends its young to find new ground.', can: (a) => a.bestSouls >= 40 },
  { id: 'body', group: 'surface', key: 'bodies', goal: 1, glow: 500, text: 'Take a body', hint: 'On a surface, choose the Body tool and tap the ground.', can: (a) => a.tended > 0 },
  { id: 'hang', group: 'sky', key: 'hung', goal: 2, glow: 500, text: 'Hang two pieces of sky', hint: 'At a star or on a surface, add pieces to a sky.', can: (a) => a.tended > 0 && (a.pieces >= 2 || a.pips >= 3) },
  { id: 'take', group: 'sky', key: 'taken', goal: 1, glow: 300, piece: 'belt', text: 'Take a piece down from a sky', hint: 'On a surface, press a hung piece to take it back.', can: (a) => a.maxPieces >= 1 },
  { id: 'nudge', group: 'sky', key: 'nudged', goal: 1, glow: 400, text: 'Move a world on its orbit', hint: 'At a star, use PULL or PUSH on an orbit.', can: (a) => a.tended > 0 },
  { id: 'outside', group: 'outside', key: 'outside', goal: 1, glow: 300, text: 'Go outside', hint: 'In the bedroom, press GO OUTSIDE.', can: (a) => a.box >= 1 },
  { id: 'fight', group: 'outside', key: 'fights', goal: 1, glow: 600, text: 'Stand against another box', hint: 'Outside, choose a kid.', can: (a) => a.box >= 3 && a.maxDepth > 0 },
  { id: 'win', group: 'outside', key: 'wins', goal: 1, glow: 900, piece: 'sun', text: 'Win a battle', hint: 'Watch what they mean to do next.', can: (a) => a.beaten > 0 },
];
const WEEKLY: readonly Task[] = [
  { id: 'w-days', group: 'w', key: 'days', goal: 4, glow: 3000, piece: 'sun', text: 'Open the box on four days this week', hint: 'Come back tomorrow.', can: () => true },
  { id: 'w-folds', group: 'w', key: 'folds', goal: 60, glow: 3000, piece: 'rings', text: 'Fall sixty folds this week', hint: 'Many small falls count as well as one long one.', can: (a) => a.box > 0 },
  { id: 'w-watch', group: 'w', key: 'watch', goal: 900, glow: 3000, piece: 'moon', text: 'Watch living worlds for fifteen minutes this week', hint: 'They do better when someone is looking.', can: (a) => a.tended > 0 },
  { id: 'w-hung', group: 'w', key: 'hung', goal: 10, glow: 2500, piece: 'belt', text: 'Hang ten pieces of sky this week', hint: 'Any sky, any world.', can: (a) => a.tended > 0 },
  { id: 'w-wins', group: 'w', key: 'wins', goal: 3, glow: 4000, piece: 'sun', text: 'Win three battles this week', hint: 'Outside. Bring your three strongest.', can: (a) => a.beaten > 0 },
];
const taskById = (id: string): Task | undefined => DAILY.find((t) => t.id === id) ?? WEEKLY.find((t) => t.id === id);

// ---- saved state -----------------------------------------------------------------------
interface Did { n: number; glow: number; pieces: Partial<Record<SkyPieceKind, number>> }
interface DayRec {
  iso: string; omen: string; tasks: string[]; base: Counters; peakDeep: number; peakSouls: number;
  claimed: string[]; streakClaimed: boolean; forgiven: boolean; did: Did; flags: string[];
}
type HapKind = 'trader' | 'rival' | 'loan' | 'letter';
interface Hap {
  id: number; kind: HapKind; iso: string; title: string; text: string;
  give?: SkyPieceKind; get?: SkyPieceKind[]; serial?: number; name?: string;
  /** What was chosen and what came of it; absent while it waits. */
  done?: string;
}
interface Hist { t: number; o: string; h: number; s: number }
interface Saved {
  v: 1; c: Counters; day: DayRec | null;
  week: { id: number; task: string; base: Counters; claimed: boolean } | null;
  streak: number; best: number; last: string; graceDay: number;
  hist: Record<string, Hist>; feasts: string[];
  playMs: number; nextHapMs: number; hapN: number; haps: Hap[];
  loans: { serial: number; name: string; due: number; thanked: boolean }[];
  pledge: { hap: number; base: number; due: number; stake: boolean; who: string } | null;
}
const blank = (): Saved => ({
  v: 1, c: zero(), day: null, week: null, streak: 0, best: 0, last: '', graceDay: -99, hist: {}, feasts: [],
  playMs: 0, nextHapMs: FIRST_HAP_MS, hapN: 0, haps: [], loans: [], pledge: null,
});
const clean = (raw: unknown): Saved => {
  const s = blank();
  if (!raw || typeof raw !== 'object' || (raw as Saved).v !== 1) return s;
  const r = raw as Saved;
  try {
    for (const k of CKEYS) if (typeof r.c?.[k] === 'number') s.c[k] = r.c[k];
    const fill = (b: Counters | undefined): Counters => { const o = zero(); for (const k of CKEYS) if (typeof b?.[k] === 'number') o[k] = b[k]; return o; };
    if (r.day && typeof r.day.iso === 'string' && Array.isArray(r.day.tasks)) {
      s.day = { ...r.day, base: fill(r.day.base), claimed: [...(r.day.claimed ?? [])], flags: [...(r.day.flags ?? [])], did: { n: r.day.did?.n ?? 0, glow: r.day.did?.glow ?? 0, pieces: { ...(r.day.did?.pieces ?? {}) } } };
    }
    if (r.week && typeof r.week.id === 'number') s.week = { ...r.week, base: fill(r.week.base) };
    if (typeof r.streak === 'number') s.streak = r.streak;
    if (typeof r.best === 'number') s.best = r.best;
    if (typeof r.last === 'string') s.last = r.last;
    if (typeof r.graceDay === 'number') s.graceDay = r.graceDay;
    if (r.hist && typeof r.hist === 'object') s.hist = { ...r.hist };
    if (Array.isArray(r.feasts)) s.feasts = r.feasts.filter((x) => typeof x === 'string');
    if (typeof r.playMs === 'number') s.playMs = r.playMs;
    if (typeof r.nextHapMs === 'number') s.nextHapMs = r.nextHapMs;
    if (typeof r.hapN === 'number') s.hapN = r.hapN;
    if (Array.isArray(r.haps)) s.haps = r.haps.filter((h) => h && typeof h.id === 'number' && typeof h.text === 'string');
    if (Array.isArray(r.loans)) s.loans = r.loans.filter((l) => l && typeof l.serial === 'number');
    if (r.pledge && typeof r.pledge.hap === 'number') s.pledge = r.pledge;
  } catch { return blank(); }
  return s;
};

const SMALL = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const num = (n: number) => SMALL[n] ?? String(n);
const pieceWord = (k: SkyPieceKind, n: number) => (k === 'rings' ? (n === 1 ? 'a set of rings' : `${num(n)} sets of rings`) : k === 'dust' ? (n === 1 ? 'a pinch of dust' : `${num(n)} pinches of dust`) : n === 1 ? `a ${k}` : `${num(n)} ${k}s`);
const lightWord = (glow: number) => (glow % 1000 === 0 ? (glow === 1000 ? 'a pip of Light' : `${num(glow / 1000)} pips of Light`) : `${glow} light`);
const streakGlow = (n: number) => Math.min(Math.max(n, 1), 7) * 200;

export const plugin: Plugin = (shell) => {
  const { ctx } = shell;
  const store = shell.store<Saved>('almanac', blank());
  const st = clean(store.get());
  let dirty = false;
  const save = () => { dirty = false; store.set(st); };
  const sfx = (name: string) => { try { ctx.audio.sfx(name); } catch { /* sound is optional */ } };

  (window as unknown as { __sallowAlmanac: unknown }).__sallowAlmanac = Object.freeze({
    today: todayIso,
    omenOn: (ms: number) => { const o = omenOfDay(dayNum(override() ?? isoOf(new Date(ms)))); return { id: o.id, name: o.name, line: o.line, does: o.does }; },
  });

  // ---- one notice at a time ------------------------------------------------------------
  const queue: { text: string; title: string; sfx: string }[] = [];
  let lastToast = 0;
  const say = (title: string, text: string, sound = 'toast') => { if (queue.length < 6) queue.push({ title, text, sfx: sound }); };
  const cardUp = (): boolean => {
    if (document.querySelector('.guide .guide-card.on')) return true;
    const c = document.querySelector<HTMLElement>('[data-id=campaign-card]');
    if (c && !c.hidden) return true;
    return !!document.querySelector('.away, .away-note');
  };
  const pump = () => {
    if (!queue.length || Date.now() - lastToast < 4700 || cardUp() || shell.menu.isOpen() || document.querySelector('.hub-toast')) return;
    const t = queue.shift()!;
    lastToast = Date.now();
    shell.toast(t.text, { title: t.title, sfx: t.sfx });
  };

  // ---- giving --------------------------------------------------------------------------
  const lit = () => ctx.bus.emit('light:changed', { pips: ctx.light.view().pips });
  const give = (glow: number, pieces: readonly (readonly [SkyPieceKind, number])[] = []) => {
    if (glow > 0) { ctx.light.addGlow(Math.round(glow)); lit(); }
    for (const [k, n] of pieces) ctx.sky.grant(k, n);
    ctx.persist();
  };
  const omen = (): Omen => OMENS.find((o) => o.id === st.day?.omen) ?? omenOfDay(dayNum(todayIso()));
  /** Hand out what the omen promised, inside the day's caps. Returns what was really given. */
  const omenGive = (glow: number, kind?: SkyPieceKind): boolean => {
    const d = st.day;
    if (!d) return false;
    const g = Math.max(0, Math.min(Math.round(glow), OMEN_GLOW_CAP - d.did.glow));
    const had = Object.values(d.did.pieces).reduce((a, b) => a + (b ?? 0), 0);
    const p = kind && had < OMEN_PIECE_CAP ? kind : undefined;
    if (g <= 0 && !p) return false;
    d.did.n++;
    d.did.glow += g;
    if (p) d.did.pieces[p] = (d.did.pieces[p] ?? 0) + 1;
    give(g, p ? [[p, 1]] : []);
    dirty = true;
    return true;
  };
  const flagOnce = (f: string): boolean => {
    const d = st.day;
    if (!d || d.flags.includes(f)) return false;
    d.flags.push(f);
    dirty = true;
    return true;
  };
  const flagCount = (prefix: string) => st.day?.flags.filter((f) => f.startsWith(prefix)).length ?? 0;

  // ---- reading the game ----------------------------------------------------------------
  const entries = () => ctx.box.slots().filter((e): e is BoxEntry => !!e);
  const able = (): Able => {
    let maxDepth = 0, tended = 0, bestSouls = 0;
    for (const e of entries()) {
      maxDepth = Math.max(maxDepth, e.stats.deepestFold);
      tended += e.stats.worldsTended;
      bestSouls = Math.max(bestSouls, e.stats.souls ?? 0);
    }
    const inv = ctx.sky.inventory();
    let pieces = 0;
    for (const k of SKY_PIECE_KINDS) pieces += inv[k];
    let maxPieces = 0;
    for (const s of ctx.sky.snapshot().skies) maxPieces = Math.max(maxPieces, s.pieces.length);
    return { box: ctx.box.count(), maxDepth, tended, bestSouls, pieces, maxPieces, beaten: ctx.rivalsBeaten.size, pips: ctx.light.view().pips };
  };
  const progress = (t: Task, base: Counters): number => {
    const d = st.day;
    const raw = t.key === 'peakDeep' ? d?.peakDeep ?? 0 : t.key === 'peakSouls' ? d?.peakSouls ?? 0 : st.c[t.key] - base[t.key];
    return Math.max(0, Math.min(t.goal, Math.floor(raw)));
  };
  const bump = (k: CKey, n = 1) => { if (n > 0) { st.c[k] += n; dirty = true; } };

  // ---- the day turns -------------------------------------------------------------------
  const noteHist = () => {
    const d = st.day;
    if (!d) return;
    const prev = st.hist[d.iso];
    st.hist[d.iso] = { t: d.claimed.length, o: d.omen, h: prev?.h ?? 0, s: st.streak };
  };
  const pickTasks = (n: number): string[] => {
    const a = able();
    const pool = DAILY.filter((t) => t.can(a)).map((t, i) => ({ t, r: h32(n, 300 + i + h32(t.id.length, t.goal)) })).sort((x, y) => x.r - y.r);
    const out: Task[] = [];
    // One from each kind of play first, so a day is never three errands of one sort.
    for (const p of pool) if (out.length < 3 && !out.some((o) => o.group === p.t.group)) out.push(p.t);
    for (const p of pool) if (out.length < 3 && !out.includes(p.t)) out.push(p.t);
    return out.map((t) => t.id);
  };
  const newDay = (iso: string) => {
    const n = dayNum(iso);
    noteHist();
    const gap = st.last ? n - dayNum(st.last) : 99;
    let forgiven = false;
    if (gap === 1) st.streak++;
    else if (gap === 2 && n - st.graceDay > 7 && st.streak > 0) { st.streak++; st.graceDay = n; forgiven = true; }
    else if (gap > 0) st.streak = 1;
    // gap <= 0: the clock went backwards. Nothing is lost and nothing is gained.
    st.best = Math.max(st.best, st.streak);
    st.last = iso;
    st.c.days++;
    const o = omenOfDay(n);
    st.day = { iso, omen: o.id, tasks: pickTasks(n), base: { ...st.c }, peakDeep: 0, peakSouls: 0, claimed: [], streakClaimed: false, forgiven, did: { n: 0, glow: 0, pieces: {} }, flags: [] };
    // The day itself counts toward a week of days.
    st.day.base.days = st.c.days - 1;
    const week = Math.floor((n + 3) / 7);
    if (!st.week || st.week.id !== week) {
      const a = able();
      const pool = WEEKLY.filter((t) => t.can(a));
      const t = pool[h32(week, 9) % pool.length] ?? WEEKLY[0]!;
      st.week = { id: week, task: t.id, base: { ...st.c, days: st.c.days - 1 }, claimed: false };
    }
    for (const k of Object.keys(st.hist)) if (n - dayNum(k) > 40) delete st.hist[k];
    st.haps = st.haps.filter((h) => !h.done || n - dayNum(h.iso) <= 3).slice(-12);
    noteHist();
    say("Today's omen", `${o.name}. ${o.line}`, 'chapter');
    if (forgiven) say('The streak', 'You missed a day. Mote kept your place.');
    if (o.fx.t === 'wake' && omenGive(1000)) say(o.name, 'A pip of Light was waiting for you.', 'gain');
    save();
  };

  // ---- watching what the player does ---------------------------------------------------
  let prevDepth = ctx.dive.view().depth;
  let diveFolds = 0;
  let prevBattle = ctx.battle;
  let prevOutcome = ctx.battle?.outcome ?? null;
  let prevVillages = -1;
  let prevTick = -1;
  let prevAvatar = false;
  let prevBox = ctx.box.count();
  let glowSeen = -1;
  let recordAtStart = -1;
  const records = () => { let n = 0; for (const e of entries()) n += e.stats.deepestFold; return n; };
  let watchAcc = 0;
  let restAcc = 0;
  let omenWatchAcc = 0;
  const skySig = () => {
    let pieces = 0;
    let drift = '';
    for (const s of ctx.sky.snapshot().skies) { pieces += s.pieces.length; if (s.drift) drift += `${s.planetKey}:${s.drift},`; }
    return { pieces, drift };
  };
  let sky = skySig();

  ctx.bus.on('sky:changed', () => {
    try {
      const now = skySig();
      const o = omen();
      if (now.pieces > sky.pieces) {
        bump('hung', now.pieces - sky.pieces);
        if (o.fx.t === 'hang') omenGive(150 * (now.pieces - sky.pieces));
      } else if (now.pieces < sky.pieces) bump('taken', sky.pieces - now.pieces);
      if (now.drift !== sky.drift) bump('nudged');
      sky = now;
      // Run out under a free-kind omen and another is already in your hand, before the
      // screen redraws its buttons.
      if (o.fx.t === 'free' && ctx.sky.inventory()[o.fx.kind] <= 0 && omenGive(0, o.fx.kind) && flagOnce('free-said')) {
        say(o.name, `You ran out of ${o.fx.kind === 'rings' || o.fx.kind === 'dust' ? o.fx.kind : `${o.fx.kind}s`}. There was one more.`, 'gain');
      }
    } catch { /* never in the way */ }
  });

  shell.onNavigate((from, to) => {
    try {
      const o = omen();
      if (to === 'dive') {
        bump('entered');
        prevDepth = ctx.dive.view().depth;
        diveFolds = 0;
        recordAtStart = records();
        const serial = ctx.selection.universe?.serialNumber;
        if (o.fx.t === 'door' && serial !== undefined && flagOnce(`door-${serial}`) && omenGive(150)) say(o.name, 'The lid was ajar. 150 light came out with you.', 'gain');
      }
      if (from === 'dive' && diveFolds > 0) {
        bump('dives');
        if (o.fx.t === 'record' && recordAtStart >= 0 && records() > recordAtStart && omenGive(250)) say(o.name, 'Deeper than you have ever been. 250 light.', 'gain');
        if (o.fx.t === 'dive') {
          if (o.fx.give === 'toll') {
            const back = Math.min(600, diveFolds * 40);
            if (omenGive(back)) say(o.name, `The folds gave back ${back} light.`, 'gain');
          } else {
            const k = SKY_PIECE_KINDS[h32(st.c.dives, dayNum(todayIso())) % SKY_PIECE_KINDS.length]!;
            if (omenGive(0, k)) say(o.name, `You came up holding ${pieceWord(k, 1)}.`, 'pickup');
          }
        }
        diveFolds = 0;
      }
      if (to === 'outside') {
        bump('outside');
        if (o.fx.t === 'outside' && flagCount('out-') < 3 && flagOnce(`out-${flagCount('out-')}`) && omenGive(0, 'comet')) say(o.name, 'There was a comet on the step.', 'pickup');
      }
      if (to === 'planet') { prevVillages = -1; prevTick = -1; }
    } catch { /* never in the way */ }
  });

  const observe = (dtMs: number) => {
    const iso = todayIso();
    if (!st.day || st.day.iso !== iso) newDay(iso);
    const d = st.day!;
    const o = omen();
    const screen = shell.current();

    if (screen === 'dive') {
      const depth = ctx.dive.view().depth;
      if (depth > prevDepth) { bump('folds', depth - prevDepth); diveFolds += depth - prevDepth; }
      prevDepth = depth;
      if (depth > d.peakDeep) { d.peakDeep = depth; dirty = true; }
    }

    let total = 0;
    for (const e of entries()) total += e.stats.lightFromGlow;
    if (glowSeen >= 0 && total > glowSeen) bump('glow', total - glowSeen);
    glowSeen = total;

    const count = ctx.box.count();
    if (count > prevBox) bump('caught', count - prevBox);
    prevBox = count;

    const b = ctx.battle;
    if (b && b !== prevBattle && (!prevBattle || prevBattle.rival.id !== b.rival.id || prevOutcome !== 'ongoing') && b.outcome === 'ongoing') bump('fights');
    if (b && b.outcome === 'won' && prevOutcome === 'ongoing') {
      bump('wins');
      if (o.fx.t === 'win') {
        if (o.fx.give === 'sun' ? omenGive(0, 'sun') : omenGive(1000)) say(o.name, o.fx.give === 'sun' ? 'They left a sun behind when they ran.' : 'A pip of Light, for being loud back.', 'gain');
      }
    }
    prevBattle = b;
    prevOutcome = b?.outcome ?? null;

    const f = screen === 'planet' ? ctx.sim.latest() : null;
    if (f) {
      const v = f.civ.villages.length;
      if (prevVillages >= 1 && v > prevVillages && f.tick >= prevTick) {
        bump('villages', v - prevVillages);
        if (o.fx.t === 'found' && omenGive(200 * (v - prevVillages))) say(o.name, 'A new village. Its first lamp reached you: 200 light.', 'gain');
      }
      prevVillages = v;
      prevTick = f.tick;
      if (f.civ.souls > d.peakSouls) { d.peakSouls = f.civ.souls; dirty = true; }
      const av = !!f.civ.avatar;
      if (av && !prevAvatar) {
        bump('bodies');
        if (o.fx.t === 'body' && flagCount('body-') < 3 && flagOnce(`body-${flagCount('body-')}`) && omenGive(300)) say(o.name, 'The body remembered you. 300 light.', 'gain');
      }
      prevAvatar = av;
      if (f.civ.souls > 0) {
        watchAcc += dtMs;
        if (watchAcc >= 1000) { const s = Math.floor(watchAcc / 1000); watchAcc -= s * 1000; bump('watch', s); }
        if (o.fx.t === 'watch') {
          omenWatchAcc += dtMs;
          if (omenWatchAcc >= o.fx.every * 1000) {
            omenWatchAcc = 0;
            const g = o.fx.mode === 'flat' ? 80 : o.fx.mode === 'souls' ? Math.min(300, f.civ.souls) : Math.min(300, 30 * v);
            if (omenGive(g) && flagOnce('watch-said')) say(o.name, `Their lamps reached further today: ${g} extra light, and more while you watch.`, 'gain');
          }
        }
      }
    } else prevAvatar = false;

    if (o.fx.t === 'rest') {
      restAcc += dtMs;
      if (restAcc >= 120_000) { restAcc = 0; if (omenGive(60) && flagOnce('rest-said')) say(o.name, 'Mote did nothing, brightly. 60 light.', 'gain'); }
    }

    // A challenge taken up is settled by what really happens outside.
    const p = st.pledge;
    if (p) {
      const hap = st.haps.find((h) => h.id === p.hap);
      if (st.c.wins > p.base) {
        const glow = p.stake ? 3000 : 800;
        give(glow, p.stake ? [['sun', 1]] : []);
        if (hap) hap.done = `You took it up${p.stake ? ' and staked a pip' : ''}. You won. ${p.who} paid: ${lightWord(glow)}${p.stake ? ' and a sun' : ''}.`;
        say('The challenge', `${p.who} heard you won. ${lightWord(glow)}${p.stake ? ' and a sun' : ''}.`, 'win');
        st.pledge = null;
        save();
      } else if (dayNum(iso) > p.due) {
        if (hap) hap.done = `You took it up${p.stake ? ' and staked a pip' : ''}, and did not win in time. ${p.who} stopped waiting.`;
        say('The challenge', `${p.who} stopped waiting for you.`, 'deny');
        st.pledge = null;
        save();
      }
    }
    // A universe on loan that you went inside: the lender is glad of it.
    for (const l of st.loans) {
      if (l.thanked || dayNum(iso) > l.due) continue;
      const e = entries().find((x) => x.serialNumber === l.serial);
      if (e && (e.stats.deepestFold >= 3 || e.stats.worldsTended > 0)) {
        l.thanked = true;
        give(1000);
        say('On loan', `Whoever lent you ${l.name} knows you went inside. A pip of Light came under the door.`, 'gain');
        save();
      }
    }
  };

  // ---- happenings ----------------------------------------------------------------------
  const forced = (): string | null => { try { return localStorage.getItem(HAPPEN_KEY); } catch { return null; } };
  const openHaps = () => st.haps.filter((h) => !h.done);
  const makeHap = (want: string | null): Hap | null => {
    const n = dayNum(todayIso());
    const id = ++st.hapN;
    const r = (salt: number) => h32(n * 131 + id, salt);
    const inv = ctx.sky.inventory();
    const all = entries();
    const kinds: HapKind[] = ['trader'];
    if (!st.pledge && ctx.battles.rivals().length) kinds.push('rival');
    if (ctx.box.count() < 25) kinds.push('loan');
    const tended = all.filter((e) => (e.stats.souls ?? 0) > 0 || e.stats.worldsTended > 0);
    if (tended.length) kinds.push('letter');
    const kind = (kinds as string[]).includes(want ?? '') ? (want as HapKind) : kinds[r(1) % kinds.length]!;
    const base = { id, kind, iso: todayIso() };
    if (kind === 'trader') {
      const rich = SKY_PIECE_KINDS.filter((k) => inv[k] >= 2);
      const give1 = rich.length ? rich[r(2) % rich.length]! : undefined;
      const others = SKY_PIECE_KINDS.filter((k) => k !== give1);
      const a = others[r(3) % others.length]!;
      const b = others[r(4) % others.length]!;
      return give1
        ? { ...base, title: 'A trader at the window', give: give1, get: [a, b], text: `Someone small is at the window with a case. "Two of your ${give1 === 'rings' || give1 === 'dust' ? give1 : `${give1}s`}," it says, "for ${pieceWord(a, 1)} and ${pieceWord(b, 1)}. I do not come twice."` }
        : { ...base, title: 'A trader at the window', get: [a, b, others[r(5) % others.length]!], text: `Someone small is at the window with a case. It looks at your empty hands, then at Mote. "A pip of that," it says, "for three pieces of sky. I do not come twice."` };
    }
    if (kind === 'rival') {
      const rivals = ctx.battles.rivals();
      const rv = rivals[r(6) % rivals.length]!;
      return { ...base, title: `A note from ${rv.name}`, name: rv.name, text: `A folded note, pushed under the door. "${rv.name}, ${rv.where}. Your box is soft. Win a battle, any battle, before tomorrow is over, or do not come outside again."` };
    }
    if (kind === 'loan') {
      let serial = r(7) & 0xffffff;
      for (let i = 0; i < 8 && all.some((e) => e.serialNumber === serial); i++) serial = (serial + 0x1f3d5) & 0xffffff;
      const u = ctx.universes.fromSerial(serial);
      return { ...base, title: 'A universe on the sill', serial, name: u.name, text: `There is a universe on your windowsill that is not yours. ${u.name}, ${u.serial}. A note under it: "Mind it for a day. Go in if you like. I will know."` };
    }
    const e = tended[r(8) % tended.length]!;
    const u = ctx.universes.fromSerial(e.serialNumber);
    const s = e.stats;
    const souls = s.souls ?? 0;
    const lines = [
      souls > 0 ? `We are ${souls} now.` : 'There are none of us left to count.',
      `We have ${ERAS[s.era ?? 0] ?? 'huts'}.`,
      s.belief && s.belief !== 'none' ? `We say the sky is ${s.belief}.` : 'We have not yet decided what the sky is.',
      (s.orbiters ?? 0) > 0 ? `${s.orbiters} of our lamps hang where you can see them.` : null,
      (s.prosperity ?? 0) > 0 ? `We count our plenty at ${s.prosperity}.` : null,
      `You have looked on ${s.worldsTended === 1 ? 'one world' : `${s.worldsTended} worlds`} of ours and fallen ${s.deepestFold} folds into us.`,
      'Look again.',
    ].filter((x): x is string => !!x);
    const others = SKY_PIECE_KINDS;
    return { ...base, title: `A letter from ${u.name}`, serial: e.serialNumber, name: u.name, get: [others[r(9) % others.length]!, others[r(10) % others.length]!], text: `It is very small and written on something like bark. "${lines.join(' ')}"` };
  };
  const tryHappen = () => {
    const screen = shell.current();
    if (screen !== 'bedroom' && screen !== 'box') return;
    if (ctx.battle?.outcome === 'ongoing' || cardUp() || shell.menu.isOpen() || queue.length) return;
    const want = forced();
    if (!want && (st.playMs < st.nextHapMs || openHaps().length >= 2)) return;
    const hap = makeHap(want);
    if (!hap) return;
    if (want) { try { localStorage.removeItem(HAPPEN_KEY); } catch { /* nothing to clear */ } }
    st.haps.push(hap);
    st.nextHapMs = st.playMs + HAP_GAP_MS + (h32(st.hapN, 5) % (30 * 60_000));
    save();
    say(hap.title, 'Something is waiting for you in the Almanac.', hap.kind === 'letter' ? 'whisper' : 'open');
    rerender?.();
  };
  const settle = (h: Hap, outcome: string, sound: string) => {
    h.done = outcome;
    const d = st.day;
    if (d) { const x = st.hist[d.iso]; if (x) x.h++; }
    sfx(sound);
    save();
    rerender?.();
  };
  const choices = (h: Hap): HTMLElement[] => {
    const inv = ctx.sky.inventory();
    const got = (h.get ?? []).map((k) => pieceWord(k, 1)).join(' and ');
    const grant = () => give(0, (h.get ?? []).map((k) => [k, 1] as const));
    const b = (label: string, id: string, fn: () => void, disabled = false) => button(label, () => { try { fn(); } catch { /* a choice must never break the page */ } }, { id: `hap-${h.id}-${id}`, disabled });
    if (h.kind === 'trader') {
      const g = h.give;
      if (g) {
        return [
          b('Trade', 'yes', () => {
            if (ctx.sky.inventory()[g] < 2) { sfx('deny'); return; }
            ctx.sky.grant(g, -2); grant();
            settle(h, `You traded two of your ${g === 'rings' || g === 'dust' ? g : `${g}s`} for ${got}. The case shut with no sound.`, 'swap');
          }, inv[g] < 2),
          b('Haggle', 'haggle', () => {
            if (ctx.sky.inventory()[g] < 1) { sfx('deny'); return; }
            if (h32(h.id, dayNum(h.iso)) % 2 === 0) { ctx.sky.grant(g, -1); grant(); settle(h, `You haggled. It took one ${g === 'rings' ? 'set of rings' : g === 'dust' ? 'pinch of dust' : g} for ${got}, and looked at you for a long time.`, 'confirm'); }
            else settle(h, 'You haggled. The trader shut the case and was not there.', 'deny');
          }, inv[g] < 1),
          b('Not today', 'no', () => settle(h, 'You sent the trader away. The window is only a window.', 'back')),
        ];
      }
      return [
        b('Pay a pip', 'yes', () => {
          if (!ctx.light.spend(1)) { sfx('deny'); return; }
          lit(); grant();
          settle(h, `You paid a pip of Light for ${(h.get ?? []).map((k) => pieceWord(k, 1)).join(', ')}. Mote sulked.`, 'swap');
        }, !ctx.light.canSpend(1)),
        b('Not today', 'no', () => settle(h, 'You sent the trader away. The window is only a window.', 'back')),
      ];
    }
    if (h.kind === 'rival') {
      const who = h.name ?? 'They';
      const take = (stake: boolean) => {
        if (stake && !ctx.light.spend(1)) { sfx('deny'); return; }
        if (stake) { lit(); ctx.persist(); }
        st.pledge = { hap: h.id, base: st.c.wins, due: dayNum(todayIso()) + 1, stake, who };
        h.done = `You took it up${stake ? ' and staked a pip of Light' : ''}. Win a battle before tomorrow ends.`;
        sfx('boss'); save(); rerender?.();
      };
      return [
        b('Stake a pip', 'stake', () => take(true), !ctx.light.canSpend(1)),
        b('Take it up', 'yes', () => take(false)),
        b('Ignore it', 'no', () => settle(h, `You put the note in the bin. ${who} will say you were afraid.`, 'back')),
      ];
    }
    if (h.kind === 'loan') {
      const serial = h.serial ?? 0;
      return [
        b('Take it in', 'yes', () => {
          const slot = ctx.box.add(serial);
          if (slot < 0) { settle(h, 'The box had no room. It was gone from the sill by evening.', 'deny'); return; }
          prevBox = ctx.box.count();
          st.loans.push({ serial, name: h.name ?? 'It', due: dayNum(todayIso()) + 1, thanked: false });
          ctx.bus.emit('box:changed', { count: ctx.box.count() });
          ctx.persist();
          settle(h, `You took ${h.name} in. It is in the Box, on loan until tomorrow night.`, 'catch');
        }, ctx.box.count() >= 25),
        b('Leave it', 'no', () => { give(0, [['comet', 1]]); settle(h, 'You left it on the sill. It was gone by evening. There was a comet where it had stood.', 'back'); }),
      ];
    }
    return [
      b('Answer with Light', 'yes', () => {
        if (!ctx.light.spend(1)) { sfx('deny'); return; }
        lit(); grant();
        settle(h, `You sent a pip of Light down to ${h.name}. They sent back what they had: ${got}.`, 'gift');
      }, !ctx.light.canSpend(1)),
      b('Keep it', 'keep', () => { give(200); settle(h, 'You kept the letter. It is warm to hold: 200 light.', 'confirm'); }),
      b('Burn it', 'no', () => { give(0, [['dust', 1]]); settle(h, 'You burned the letter. The ash made a pinch of good dust.', 'fire'); }),
    ];
  };

  // ---- claims --------------------------------------------------------------------------
  const taskGlow = (t: Task) => Math.round(t.glow * (omen().fx.t === 'tasks' && t.group !== 'w' ? 1.5 : 1));
  const rewardWords = (glow: number, piece?: SkyPieceKind) => `${lightWord(glow)}${piece ? ` and ${pieceWord(piece, 1)}` : ''}`;
  const claimTask = (t: Task) => {
    const d = st.day;
    if (!d || d.claimed.includes(t.id) || progress(t, d.base) < t.goal) return;
    d.claimed.push(t.id);
    const g = taskGlow(t);
    if (g > t.glow) { d.did.n++; d.did.glow += g - t.glow; }
    give(g, t.piece ? [[t.piece, 1]] : []);
    noteHist(); sfx('gain'); save(); rerender?.();
  };
  const claimWeek = () => {
    const w = st.week;
    const t = w ? taskById(w.task) : undefined;
    if (!w || !t || w.claimed || progress(t, w.base) < t.goal) return;
    w.claimed = true;
    give(t.glow, t.piece ? [[t.piece, 2]] : []);
    sfx('chapter'); save(); rerender?.();
  };
  const streakPieces = (n: number): readonly (readonly [SkyPieceKind, number])[] => (n > 0 && n % 7 === 0 ? [['sun', 1], ['rings', 1]] : []);
  const claimStreak = () => {
    const d = st.day;
    if (!d || d.streakClaimed) return;
    d.streakClaimed = true;
    give(streakGlow(st.streak), streakPieces(st.streak));
    sfx('gain'); save(); rerender?.();
  };
  const feastToday = (): { key: string; f: Feast } | null => {
    const iso = st.day?.iso ?? todayIso();
    const f = FEASTS[iso.slice(5)];
    return f ? { key: iso, f } : null;
  };
  const claimFeast = () => {
    const x = feastToday();
    if (!x || st.feasts.includes(x.key)) return;
    st.feasts.push(x.key);
    st.feasts = st.feasts.slice(-12);
    give(x.f.glow, x.f.pieces);
    sfx('festival'); save(); rerender?.();
  };
  const claimAll = () => {
    const d = st.day;
    if (d) for (const id of [...d.tasks]) { const t = taskById(id); if (t) claimTask(t); }
    claimWeek();
    if (d && !d.streakClaimed) claimStreak();
    claimFeast();
  };
  const unclaimed = (): number => {
    const d = st.day;
    if (!d) return 0;
    let n = d.streakClaimed ? 0 : 1;
    for (const id of d.tasks) { const t = taskById(id); if (t && !d.claimed.includes(id) && progress(t, d.base) >= t.goal) n++; }
    const w = st.week;
    const wt = w ? taskById(w.task) : undefined;
    if (w && wt && !w.claimed && progress(wt, w.base) >= wt.goal) n++;
    const x = feastToday();
    if (x && !st.feasts.includes(x.key)) n++;
    return n + openHaps().length;
  };

  // ---- the page ------------------------------------------------------------------------
  let rerender: (() => void) | null = null;
  const didWords = (d: DayRec): string => {
    const parts: string[] = [];
    if (d.did.glow > 0) parts.push(`${d.did.glow} light`);
    for (const k of SKY_PIECE_KINDS) { const n = d.did.pieces[k] ?? 0; if (n > 0) parts.push(pieceWord(k, n)); }
    if (!parts.length) return 'So far today: nothing yet. It is waiting on you.';
    return `So far today: ${parts.join(', ')}, over ${d.did.n === 1 ? 'one time' : `${d.did.n} times`}.`;
  };
  const taskRow = (t: Task, base: Counters, claimed: boolean, glow: number, pieceN: number, onClaim: () => void, id: string) => {
    const have = progress(t, base);
    const done = have >= t.goal;
    const shown = t.key === 'watch' ? `${Math.floor(have / 60)}:${pad(have % 60)} / ${Math.floor(t.goal / 60)}:00` : `${have} / ${t.goal}`;
    const bar = el('i', {});
    bar.style.width = `${Math.round((have / t.goal) * 100)}%`;
    return el('li', { class: `alm-task${done ? ' done' : ''}${claimed ? ' claimed' : ''}`, 'data-id': `alm-task-${id}` },
      el('div', { class: 'alm-task-what' },
        el('p', { class: 'alm-task-line' }, el('span', {}, t.text), el('b', {}, claimed ? 'paid' : shown)),
        el('div', { class: 'alm-bar' }, bar),
        el('small', {}, claimed ? `Mote paid ${rewardWords(glow, undefined)}${t.piece ? ` and ${pieceWord(t.piece, pieceN)}` : ''}.` : done ? `Done. ${rewardWords(glow)}${t.piece ? ` and ${pieceWord(t.piece, pieceN)}` : ''} is yours.` : `${t.hint} Pays ${lightWord(glow)}${t.piece ? ` and ${pieceWord(t.piece, pieceN)}` : ''}.`)),
      done && !claimed ? button('Claim', onClaim, { id: `alm-claim-${id}` }) : null);
  };
  const renderPage = (into: HTMLElement) => {
    const d = st.day;
    if (!d) { into.replaceChildren(el('p', { class: 'alm-voice' }, 'The Almanac has no page for today yet.')); return; }
    const n = dayNum(d.iso);
    const o = omen();
    const season = seasonOf(d.iso);
    const kids: (HTMLElement | null)[] = [];
    kids.push(el('header', { class: 'alm-head' },
      el('span', { class: 'k-label' }, `${season.name}${override() ? ' · test date' : ''}`),
      el('h3', { 'data-id': 'alm-date' }, longDate(d.iso)),
      el('p', { class: 'alm-voice' }, season.line)));
    // Everything that is waiting, in one press.
    if (unclaimed() > 1) kids.push(button(`Claim all ${unclaimed()}`, claimAll, { id: 'alm-claim-all', primary: true }));

    const feast = feastToday();
    if (feast) {
      const took = st.feasts.includes(feast.key);
      kids.push(el('section', { class: 'alm-card alm-feast', 'data-id': 'alm-feast' },
        el('span', { class: 'k-label' }, 'Once a year'),
        el('h4', {}, feast.f.name),
        el('p', { class: 'alm-voice' }, feast.f.line),
        took ? el('small', {}, `You took ${lightWord(feast.f.glow)} and ${feast.f.pieces.map(([k, c]) => pieceWord(k, c)).join(', ')}. It will be a year before this day comes again.`)
          : button(`Take ${lightWord(feast.f.glow)} and ${feast.f.pieces.map(([k, c]) => pieceWord(k, c)).join(', ')}`, claimFeast, { id: 'alm-feast-claim' })));
    }

    kids.push(el('section', { class: 'alm-card alm-omen', 'data-id': 'alm-omen', 'data-omen': o.id },
      el('span', { class: 'k-label' }, "Today's omen"),
      el('h4', {}, o.name),
      el('p', { class: 'alm-voice' }, o.line),
      el('p', { class: 'alm-does' }, o.does),
      el('small', { 'data-id': 'alm-did' }, didWords(d))));

    const pips = el('div', { class: 'alm-pips' });
    const inWeek = ((st.streak - 1) % 7) + 1;
    for (let i = 1; i <= 7; i++) pips.append(el('i', { class: i <= inWeek ? 'on' : '' }));
    const sp = streakPieces(st.streak);
    const sWords = `${lightWord(streakGlow(st.streak))}${sp.length ? `, ${sp.map(([k, c]) => pieceWord(k, c)).join(' and ')}` : ''}`;
    kids.push(el('section', { class: 'alm-card alm-streak', 'data-id': 'alm-streak', 'data-streak': st.streak },
      el('div', { class: 'alm-row' },
        el('div', { class: 'alm-grow' },
          el('span', { class: 'k-label' }, 'Days kept'),
          el('h4', {}, st.streak === 1 ? 'Day one' : `Day ${num(st.streak)}`)),
        d.streakClaimed ? null : button('Claim', claimStreak, { id: 'alm-streak-claim' })),
      pips,
      el('small', {}, `${d.streakClaimed ? `Today paid ${sWords}.` : `Today pays ${sWords}.`} ${d.forgiven ? 'You missed a day. Mote kept your place. It will not do that twice in a week.' : st.streak >= 7 ? 'It grows no further than seven days, but every seventh day brings a sun and rings.' : 'Each day in a row pays more, up to the seventh.'}${st.best > st.streak ? ` Your longest was ${num(st.best)}.` : ''}`)));

    const list = el('ul', { class: 'alm-tasks' });
    for (const id of d.tasks) {
      const t = taskById(id);
      if (t) list.append(taskRow(t, d.base, d.claimed.includes(id), taskGlow(t), 1, () => claimTask(t), id));
    }
    kids.push(el('section', { class: 'alm-card', 'data-id': 'alm-daily' }, el('span', { class: 'k-label' }, `Today · ${d.claimed.length} of ${d.tasks.length} paid`), list));

    const w = st.week;
    const wt = w ? taskById(w.task) : undefined;
    if (w && wt) {
      const left = 7 - ((n + 3) % 7);
      kids.push(el('section', { class: 'alm-card', 'data-id': 'alm-weekly' },
        el('span', { class: 'k-label' }, `This week · ${left === 1 ? 'last day' : `${num(left)} days left`}`),
        el('ul', { class: 'alm-tasks' }, taskRow(wt, w.base, w.claimed, wt.glow, 2, claimWeek, 'week'))));
    }

    const haps = [...st.haps].reverse();
    const hapKids: HTMLElement[] = haps.slice(0, 6).map((h) => el('li', { class: h.done ? 'alm-hap' : 'alm-hap open', 'data-id': `alm-hap-${h.id}`, 'data-kind': h.kind },
      el('p', { class: 'alm-hap-title' }, el('span', {}, h.title), el('b', {}, h.iso === d.iso ? 'today' : longDate(h.iso).split(' ').slice(1).join(' '))),
      el('p', { class: 'alm-voice' }, h.text),
      h.done ? el('small', {}, h.done) : el('div', { class: 'alm-choices' }, ...choices(h))));
    const loans = st.loans.filter((l) => entries().some((e) => e.serialNumber === l.serial)).slice(-3).map((l) => el('li', { class: 'alm-hap' },
      el('p', { class: 'alm-hap-title' }, el('span', {}, l.name), el('b', {}, 'on loan')),
      el('small', {}, n <= l.due
        ? `In your Box until ${n === l.due ? 'tonight' : 'tomorrow night'}.${l.thanked ? ' The lender knows you went inside, and was glad.' : ' Go inside before then and the lender will know.'}`
        : 'Nobody came back for it. It stays in your Box, and still says on loan on the lid.')));
    kids.push(el('section', { class: 'alm-card', 'data-id': 'alm-haps' },
      el('span', { class: 'k-label' }, 'Happenings'),
      hapKids.length || loans.length ? el('ul', { class: 'alm-haps' }, ...hapKids, ...loans) : el('p', { class: 'alm-voice' }, 'Nobody has come to the window. Somebody will. Stay a while in the bedroom or the Box.')));

    const strip = el('div', { class: 'alm-strip', 'data-id': 'alm-strip' });
    for (let i = 13; i >= 0; i--) {
      const iso = isoFromNum(n - i);
      const h = st.hist[iso];
      const marks = el('span', { class: 'alm-marks' });
      for (let k = 0; k < 3; k++) marks.append(el('i', { class: h && k < h.t ? 'on' : '' }));
      const name = OMENS.find((x) => x.id === h?.o)?.name;
      strip.append(el('div', { class: `alm-cell${h ? ' played' : ''}${i === 0 ? ' today' : ''}${h && h.h > 0 ? ' visited' : ''}`, title: h ? `${longDate(iso)}: ${name ?? 'a day'}, ${h.t} of 3 tasks` : `${longDate(iso)}: the box stayed shut`, 'data-iso': iso, 'data-tasks': h?.t ?? -1 },
        el('b', {}, String(Number(iso.slice(8)))), marks, el('em', {}, h ? (h.h > 0 ? '✶' : '·') : '')));
    }
    const played = Object.keys(st.hist).filter((k) => n - dayNum(k) < 14 && n - dayNum(k) >= 0).length;
    kids.push(el('section', { class: 'alm-card', 'data-id': 'alm-cal' },
      el('span', { class: 'k-label' }, 'The last fourteen days'),
      strip,
      el('small', {}, `You opened the box on ${played === 1 ? 'one day' : `${num(played)} days`} of these. Lit squares are days you came. The three marks are tasks paid. A star is a visitor answered.`)));

    const page = el('div', { class: `alm alm--${season.id}`, 'data-id': 'almanac-page' }, ...kids.filter((k): k is HTMLElement => !!k));
    const top = into.scrollTop;
    into.replaceChildren(page);
    into.scrollTop = top;
  };
  const signature = (): string => {
    const d = st.day;
    if (!d) return '';
    const w = st.week;
    const wt = w ? taskById(w.task) : undefined;
    const inv = ctx.sky.inventory();
    return [d.iso, d.did.n, d.did.glow, d.claimed.length, d.streakClaimed, st.streak, st.haps.length, openHaps().length, st.loans.map((l) => l.thanked).join(''),
      ...d.tasks.map((id) => { const t = taskById(id); return t ? progress(t, d.base) : 0; }), w && wt ? progress(wt, w.base) : 0, w?.claimed,
      SKY_PIECE_KINDS.map((k) => inv[k]).join(','), ctx.light.view().pips].join('|');
  };

  shell.menu.add({
    id: 'almanac',
    label: 'Almanac',
    hint: "Today's omen, tasks and visitors",
    order: 15,
    badge: () => { const n = unclaimed(); return n > 0 ? `${n} waiting` : null; },
    render: (into) => {
      let sig = '';
      const draw = () => { try { sig = signature(); renderPage(into); } catch (e) { console.error(e); } };
      rerender = draw;
      draw();
      const timer = window.setInterval(() => { try { if (signature() !== sig) draw(); } catch { /* never in the way */ } }, 1000);
      return () => { window.clearInterval(timer); rerender = null; };
    },
  });

  // ---- the clock of the plugin ---------------------------------------------------------
  let acc = 0;
  let saveAcc = 0;
  let hapAcc = 0;
  shell.onFrame((dt) => {
    try {
      const step = Math.min(dt, 1000);
      if (!document.hidden) st.playMs += step;
      acc += step;
      if (acc < CHECK_MS) return;
      const took = acc;
      acc = 0;
      observe(took);
      pump();
      hapAcc += took;
      if (hapAcc > 2000) { hapAcc = 0; tryHappen(); }
      saveAcc += took;
      if (saveAcc > 5000 || (dirty && saveAcc > 1500)) { saveAcc = 0; save(); }
    } catch (e) { console.error('almanac', e); }
  });
  const flush = () => { try { save(); } catch { /* storage is optional */ } };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
};
