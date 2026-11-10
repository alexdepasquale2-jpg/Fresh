/**
 * While you were gone. When the player returns after an absence, the last world they
 * tended is carried on from where it was left, under the sky they left it, for the
 * (capped) time away, and what happened is read back to them over the bedroom.
 *
 * The surface sim is never persisted, so this is a replay under the same sky, not a
 * continuation of the villagers last seen. The copy says so.
 *
 * Everything here is best-effort: any failure falls through to the normal bedroom.
 */
import './away.css';
import type { Plugin, Shell } from '../plugins';
import { ERAS, YEAR_TICKS } from '@/contracts/sim';
import type { StarRef } from '@/contracts/fold';
import type { Seed } from '@/contracts/seed';
import { el, button } from '@/ui/kit';

const KEY_WORLD = 'sallow-away-world';
const KEY_SEEN = 'sallow-away-seen';
/** Shorter absences are not worth a report. */
const MIN_AWAY_MS = 2 * 60 * 1000;
/** Ticks asked of the Worker at a time. */
const CHUNK = 200;
/** Stop dreaming after this long and report what there is. */
const BUDGET_MS = 20_000;
/** Give up silently if the Worker says nothing for this long. */
const STALL_MS = 8_000;
/** The gift on top of what the dream itself earned is never more than this (1000 = one pip). */
const GIFT_CAP = 1500;
/** All the Light a dream may earn by itself (1000 = one pip). */
const DREAM_CAP = 2000;

interface Remembered {
  v: 1;
  serial: number;
  universe: string;
  star: StarRef;
  planetIndex: number;
  planet: string;
  souls: number;
  villages: number;
  era: number;
  prosperity: number;
  launches: number;
  atMs: number;
}

const read = <T>(key: string): T | null => {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : null;
  } catch { return null; }
};
const write = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage is optional */ }
};

const isU32 = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
const isSeed = (s: unknown): s is Seed => !!s && typeof s === 'object' && isU32((s as Seed).hi) && isU32((s as Seed).lo);
const valid = (r: Remembered | null): r is Remembered =>
  !!r && r.v === 1 && Number.isInteger(r.serial) && Number.isInteger(r.planetIndex) && r.planetIndex >= 0 && typeof r.planet === 'string' &&
  !!r.star && isSeed(r.star.seed) && !!r.star.address && isSeed(r.star.address.universe) && isSeed(r.star.address.pathHash) &&
  Number.isInteger(r.star.address.depth) && typeof r.star.kind === 'string' && typeof r.star.heat === 'number';

const SMALL = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const words = (n: number): string => {
  if (n < 20) return SMALL[n] ?? String(n);
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? `-${SMALL[n % 10]!}` : '');
  return String(n);
};
const count = (n: number, one: string, many = `${one}s`) => `${words(n)} ${n === 1 ? one : many}`;
const howLong = (ms: number): string => {
  const min = Math.floor(ms / 60000);
  if (min < 60) return count(Math.max(1, min), 'minute');
  const h = Math.floor(min / 60);
  if (h < 48) return count(h, 'hour');
  return count(Math.floor(h / 24), 'day');
};
const howManyYears = (ticks: number): string => {
  const halves = Math.floor((ticks * 2) / YEAR_TICKS);
  if (halves < 1) return 'a season';
  if (halves === 1) return 'half a year';
  const y = Math.floor(halves / 2);
  return halves % 2 ? `${words(y)} and a half years` : count(y, 'year');
};
const lightWords = (points: number): string => {
  const pips = Math.floor(points / 1000);
  const rest = points % 1000;
  if (pips === 0) return rest < 250 ? 'a little' : rest < 700 ? 'near half a pip' : 'near a whole pip';
  return rest < 250 ? count(pips, 'pip') : `${count(pips, 'pip')} and more`;
};

/** What kind of thing a chronicle line tells, read from its wording (entries carry no kind here). In order of weight. */
const KINDS: readonly (readonly [string, RegExp])[] = [
  ['launch', /did not come down|lamp into the sky|new star into your sky/],
  ['death', /went dark|No one answers|last fire of/],
  ['era', / learned | came into the age of /],
  ['faith', /turned to the|began to pray to/],
  ['knowing', /understood at last|looked up and knew/],
  ['found', /raised from the dust|lit its first lamp|made a home|became one|Now there is only/],
  ['ruin', /water rose over|was drowned|Frost took|killing cold|Fire ran through| burned\.|went hungry|ran empty/],
  ['sky', /stone fell from the sky|struck the world|ground split|world trembled|great storm|clouds broke|seas froze|Ice closed|Wildfire|waters rose everywhere|waters shrank|long dry/],
  ['strife', /came to blows|Blood between/],
  ['road', /walk the long road|find new ground|Families left|line of walkers/],
  ['small', /./],
];
const kindOf = (text: string): string => KINDS.find(([, re]) => re.test(text))?.[0] ?? 'small';

interface Line { id: number; text: string; reason?: string; year: number; kind: string; more?: string }

/** One sentence for the n other things of a kind that the report does not print. */
const MORE: Readonly<Record<string, (n: number) => string>> = {
  launch: (n) => `${n === 1 ? 'One more lamp' : `${cap(words(n))} more lamps`} went up after it.`,
  death: (n) => `${n === 1 ? 'One more fire' : `${cap(words(n))} more fires`} went out the same way.`,
  era: (n) => `Before that they learned ${n === 1 ? 'one other thing' : `${words(n)} other things`}.`,
  faith: (n) => `Their faith turned ${n === 1 ? 'once more' : `${words(n)} more times`}.`,
  knowing: (n) => `${n === 1 ? 'One more village' : `${cap(words(n))} more villages`} came to know it too.`,
  found: (n) => `${n === 1 ? 'One more home was' : `${cap(words(n))} more homes were`} made after it.`,
  ruin: (n) => `${n === 1 ? 'One more ruin' : `${cap(words(n))} more ruins`} followed.`,
  sky: (n) => `The sky struck ${n === 1 ? 'once more' : `${words(n)} more times`}.`,
  strife: (n) => `They came to blows ${n === 1 ? 'once more' : `${words(n)} more times`}.`,
  road: (n) => `${n === 1 ? 'One more band' : `${cap(words(n))} more bands`} took the road.`,
  small: (n) => `${n === 1 ? 'One smaller thing was' : `${cap(words(n))} smaller things were`} written down besides.`,
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * As varied as the dream allows, in the order things happened. When the dream holds
 * more than one kind of thing, each kind gets one line and one sentence counting the
 * rest. A dream of a single kind may tell three of it.
 */
const choose = (all: readonly Line[], max = 8): Line[] => {
  const seen = new Set<string>();
  const byKind = new Map<string, Line[]>();
  for (const l of all) {
    // The very same sentence twice is one line; it still counts toward the rest.
    const list = byKind.get(l.kind) ?? [];
    if (!seen.has(l.text)) list.push({ ...l });
    else list.push({ ...l, text: '' });
    seen.add(l.text);
    byKind.set(l.kind, list);
  }
  const picked: Line[] = [];
  const perKind = byKind.size > 1 ? 1 : 3;
  for (const [kind] of KINDS) {
    const list = byKind.get(kind);
    if (!list?.length || picked.length >= max) continue;
    // Small talk is left out when the dream has weightier things to tell.
    if (kind === 'small' && byKind.size > 4) continue;
    const told = list.filter((l) => l.text);
    // The age they reached last tells the most; of everything else, the first.
    const take = kind === 'era' ? told.slice(-perKind) : told.slice(0, perKind);
    const rest = list.length - take.length;
    const last = take[take.length - 1];
    if (last && rest > 0) last.more = (MORE[kind] ?? MORE.small!)(rest);
    picked.push(...take);
  }
  return picked.sort((a, b) => a.id - b.id);
};

/** The one the chronicle names, as last seen in the dream. */
interface Named { name: string; calling: string; age: number; deeds: readonly string[]; metYou: boolean; alive: boolean }
/** Read from the Almanac plugin if it is there; the report is whole without it. */
const omenAt = (ms: number): { name: string; line: string } | null => {
  try {
    const a = (window as unknown as { __sallowAlmanac?: { omenOn(ms: number): { name: string; line: string } } }).__sallowAlmanac;
    const o = a?.omenOn(ms);
    return o && typeof o.name === 'string' ? o : null;
  } catch { return null; }
};

const lightPoints = (shell: Shell): number => {
  const v = shell.ctx.light.snapshot();
  return v.pips * 1000 + v.partial;
};

export const plugin: Plugin = (shell) => {
  const { ctx } = shell;
  const now = () => Date.now();
  const closeSim = () => { try { ctx.sim.close(); } catch { /* nothing to close */ } };

  // ---- Remember the world being tended -------------------------------------------------
  let pending: Remembered | null = null;
  let lastWrite = 0;
  const flush = () => {
    if (!pending) return;
    write(KEY_WORLD, pending);
    pending = null;
    lastWrite = now();
  };
  ctx.bus.on('sim:frame', () => {
    try {
      if (shell.current() !== 'planet') return;
      const f = ctx.sim.latest();
      const { universe: u, star, system } = ctx.selection;
      const p = system?.planets[ctx.selection.planetIndex];
      if (!f || !u || !star || !p) return;
      pending = {
        v: 1, serial: u.serialNumber, universe: u.name,
        star: { address: star.address, seed: star.seed, kind: star.kind, heat: star.heat },
        planetIndex: ctx.selection.planetIndex, planet: p.name,
        souls: f.civ.souls, villages: f.civ.villages.length, era: f.civ.era, prosperity: f.civ.prosperity, launches: f.civ.launches,
        atMs: now(),
      };
      if (now() - lastWrite > 1500) flush();
    } catch { /* never in the way */ }
  });

  // ---- Know how long they were really gone ---------------------------------------------
  const lastSeen = read<{ atMs: number }>(KEY_SEEN);
  const touch = () => write(KEY_SEEN, { atMs: now() });
  let beat = 0;
  let hiddenAt = 0;

  // ---- The dream -----------------------------------------------------------------------
  interface Dream {
    world: Remembered; awayMs: number; target: number; startedMs: number; lastFrameMs: number; tick: number;
    /** The world's own tick when the dream began (-1 until its first frame), and the chronicle lines already written by then. */
    base: number; old: Set<number>;
    lines: Map<number, Line>; named: Map<string, Named>; leftMs: number; lightBefore: number; off: () => void; note: HTMLElement; bar: HTMLElement;
    restore: () => void;
  }
  let dream: Dream | null = null;
  let report: HTMLElement | null = null;
  /** True while the open sim is the one this plugin opened (dream or report showing). */
  let simIsOurs = false;
  let lightSnap: { pips: number; partial: number } | null = null;

  /** Stop dreaming. With keepSim the world stays open and the selection stays on it. */
  const endDream = (keepSim: boolean) => {
    const d = dream;
    if (!d) return;
    dream = null;
    d.off();
    d.note.remove();
    if (!keepSim) {
      if (simIsOurs) closeSim();
      simIsOurs = false;
      d.restore();
    }
  };

  const begin = (awayMs: number) => {
    if (dream || report || awayMs < MIN_AWAY_MS || shell.current() !== 'bedroom') return;
    const world = read<Remembered>(KEY_WORLD);
    if (!valid(world)) return;
    const slot = ctx.box.slots().findIndex((s) => s?.serialNumber === world.serial);
    if (slot < 0) return;
    const target = ctx.clock.catchUp(awayMs);
    if (target <= 0) return;
    const u = ctx.universes.fromSerial(world.serial);
    const system = ctx.systems.fromStar(world.star, u);
    const planet = system.planets[world.planetIndex];
    if (!planet || planet.name !== world.planet) return;

    const sel = ctx.selection;
    const before = { universe: sel.universe, star: sel.star, system: sel.system, planetIndex: sel.planetIndex, slot: ctx.box.selected() };
    const restore = () => {
      sel.universe = before.universe; sel.star = before.star; sel.system = before.system; sel.planetIndex = before.planetIndex;
      if (ctx.box.slots()[before.slot]) ctx.box.select(before.slot);
    };
    sel.universe = u; sel.star = world.star; sel.system = system; sel.planetIndex = world.planetIndex;
    ctx.box.select(slot);

    const bar = el('i', {});
    const note = el('div', { class: 'away-note', role: 'status' }, el('span', {}, 'The box has been dreaming…'), el('b', {}, bar));
    shell.host.append(note);
    const d: Dream = {
      world, awayMs, target, startedMs: now(), lastFrameMs: now(), tick: 0, base: -1, old: new Set(), lines: new Map(), named: new Map(), leftMs: now() - awayMs, lightBefore: (lightSnap = ctx.light.snapshot(), lightPoints(shell)),
      off: () => {}, note, bar, restore,
    };
    dream = d;
    d.off = ctx.bus.on('sim:frame', () => {
      try { onDreamFrame(d); } catch { endDream(false); }
    });
    touch();
    simIsOurs = true;
    ctx.sim.open(u, planet);
  };

  const onDreamFrame = (d: Dream) => {
    if (dream !== d) return;
    const f = ctx.sim.latest();
    if (!f) return;
    d.lastFrameMs = now();
    // The box keeps its worlds now: the dream carries the world on from where it was left.
    if (d.base < 0) { d.base = f.tick; for (const e of f.chronicle) d.old.add(e.id); }
    d.tick = f.tick - d.base;
    const year = Math.floor(f.tick / YEAR_TICKS) + 1;
    for (const e of f.chronicle) {
      if (d.old.has(e.id)) continue;
      const known = d.lines.get(e.id);
      if (known) { if (e.reason && !known.reason) known.reason = e.reason; continue; }
      d.lines.set(e.id, { id: e.id, text: e.event, reason: e.reason, year, kind: kindOf(e.event) });
    }
    for (const p of d.named.values()) p.alive = false;
    const nb = f.civ.notable;
    if (nb) d.named.set(nb.name, { name: nb.name, calling: nb.calling, age: nb.age, deeds: nb.deeds, metYou: nb.metYou, alive: true });
    if (d.tick >= d.target || now() - d.startedMs > BUDGET_MS) { finish(d); return; }
    // One step may be in flight at a time. If the main loop got there first this one is
    // dropped, and the frame its step brings leads back here.
    ctx.sim.step(Math.min(CHUNK, d.target - d.tick));
  };

  const finish = (d: Dream) => {
    const f = ctx.sim.latest();
    if (!f) { endDream(false); return; }
    endDream(true);
    // The dream fed the light as any watched world does. Add a little for the hours the box
    // could not hold: five points a minute away, never more than the dream earned, capped.
    // The dream may not pour out more than DREAM_CAP, however long it ran.
    if (lightPoints(shell) - d.lightBefore > DREAM_CAP && lightSnap) {
      ctx.light.restore(lightSnap);
      ctx.light.addGlow(DREAM_CAP);
    }
    lightSnap = null;
    const earned = Math.max(0, lightPoints(shell) - d.lightBefore);
    const gift = Math.max(0, Math.min(GIFT_CAP, Math.floor(d.awayMs / 60000) * 5, earned));
    if (gift > 0) {
      ctx.light.addGlow(gift);
      ctx.bus.emit('light:changed', { pips: ctx.light.view().pips });
    }
    const gained = Math.max(0, lightPoints(shell) - d.lightBefore);
    ctx.persist();
    touch();
    show(d, f.civ, gained);
  };

  const show = (d: Dream, civ: { souls: number; villages: readonly unknown[]; era: number; prosperity: number; launches: number }, gained: number) => {
    const w = d.world;
    const lines = choose([...d.lines.values()].sort((a, b) => a.id - b.id));
    // A reason said once is enough.
    const said = new Set<string>();
    const why = (r: string | undefined) => {
      if (!r || said.has(r)) return null;
      said.add(r);
      return el('small', {}, r);
    };
    const fig = (value: string | number, name: string) => el('div', { class: 'away-fig' }, el('b', {}, String(value)), el('span', {}, name));
    const dismiss = () => { report?.remove(); report = null; };
    const later = () => {
      dismiss();
      if (simIsOurs && shell.current() === 'bedroom') { closeSim(); d.restore(); }
      simIsOurs = false;
    };
    const goToThem = () => {
      dismiss();
      // The planet screen keeps a world that is already open, so they arrive in the one
      // they have just read about.
      simIsOurs = false;
      ctx.go('planet');
    };
    const gift = gained > 0
      ? `Their lamps reached you across the dark. Your light grew by ${lightWords(gained)}.`
      : 'Their lamps reached you across the dark, though little of it came this far.';
    // The one they name: the last the dream saw, with what they did.
    const people = [...d.named.values()];
    const who = people[people.length - 1] ?? null;
    const deeds = who ? [...new Set(who.deeds)].slice(-3) : [];
    const named = who
      ? el('div', { class: 'away-named', 'data-id': 'away-named' },
        el('p', { class: 'away-kicker' }, who.alive ? 'The one they name' : 'The one they named'),
        el('p', { class: 'away-who' }, el('b', {}, who.name), `, ${who.calling}, ${who.alive ? `${count(who.age, 'year')} old` : `gone at ${words(who.age)}`}.`),
        deeds.length
          ? el('ul', {}, ...deeds.map((x) => el('li', {}, x)))
          : el('p', { class: 'away-then' }, 'Nothing they did was written down yet.'),
        people.length > 1 ? el('p', { class: 'away-then' }, `${people.length === 2 ? 'One other was' : `${cap(words(people.length - 1))} others were`} named before them.`) : null)
      : null;
    // The omen that hung over the days away, if the Almanac is keeping them.
    const left = omenAt(d.leftMs);
    const back = omenAt(now());
    const omen = left
      ? el('p', { class: 'away-omen', 'data-id': 'away-omen' },
        back && back.name !== left.name
          ? `You left under ${left.name}. You come back under ${back.name}. ${back.line}`
          : `The omen over the box while you were away was ${left.name}. ${left.line}`)
      : null;
    const then = `When you last looked there ${w.souls === 1 ? 'was' : 'were'} ${count(w.souls, 'soul')} in ${count(w.villages, 'village')}.`;
    report = el('section', { class: 'away', role: 'dialog', 'aria-label': 'While you were gone' },
      el('div', { class: 'away-page' },
        el('p', { class: 'away-kicker' }, 'The box kept dreaming'),
        el('h1', {}, 'While you were gone'),
        el('p', { class: 'away-when' }, `You were away ${howLong(d.awayMs)}.`),
        el('p', { class: 'away-where' }, el('b', {}, w.planet), ` · ${w.universe}`),
        el('p', { class: 'away-honest' },
          `The box does not hold a world still. It carried ${w.planet} on from where you left it, under the sky you gave it, for ${howManyYears(d.tick)} of its own. These are the souls you watched, and their children.`),
        el('ol', { class: 'away-lines' }, ...(lines.length
          ? lines.map((l) => el('li', { 'data-kind': l.kind }, el('span', {}, `Year ${words(l.year)}`), el('p', {}, l.text), why(l.reason), l.more ? el('em', {}, l.more) : null))
          : [el('li', {}, el('p', {}, 'Nothing was written down. The ground kept its own counsel.'))])),
        named,
        el('p', { class: 'away-kicker' }, 'As it stands now'),
        el('div', { class: 'away-figs' },
          fig(civ.souls, 'souls'), fig(civ.villages.length, 'villages'), fig(ERAS[civ.era] ?? 'huts', 'era'),
          fig(civ.prosperity, 'prosperity'), fig(civ.launches, 'in orbit')),
        el('p', { class: 'away-then' }, civ.villages.length === 0 ? `No lamp burns there now. ${then}` : then),
        el('p', { class: 'away-gift' }, gift),
        omen,
      ),
      el('div', { class: 'away-acts' },
        button('Go to them', goToThem, { primary: true, id: 'away-go' }),
        button('Later', later, { id: 'away-later' })),
    );
    shell.host.append(report);
  };

  // ---- Wiring --------------------------------------------------------------------------
  let booted = false;
  shell.onNavigate((from, to) => {
    try {
      if (from === 'planet') flush();
      if (!booted) {
        booted = true;
        if (to === 'bedroom' && shell.resumed) {
          const sinceSeen = lastSeen && typeof lastSeen.atMs === 'number' ? Math.max(0, now() - lastSeen.atMs) : Infinity;
          begin(Math.min(shell.resumed.awayMs, sinceSeen));
        }
        touch();
        return;
      }
      // They walked off mid-dream, or something else moved the screen: get out of the way.
      if (dream) {
        const d = dream;
        endDream(true);
        if (to !== 'planet') { closeSim(); d.restore(); }
        simIsOurs = false;
      }
      if (report) {
        report.remove();
        report = null;
        if (simIsOurs && to !== 'planet') closeSim();
        simIsOurs = false;
      }
    } catch { /* never in the way */ }
  });

  shell.onFrame((dt) => {
    try {
      beat += dt;
      if (beat > 10_000) { beat = 0; if (!document.hidden) touch(); }
      const d = dream;
      if (!d) return;
      if (now() - d.lastFrameMs > STALL_MS) { endDream(false); return; }
      d.bar.style.width = `${Math.min(100, Math.round((d.tick / d.target) * 100))}%`;
    } catch { /* never in the way */ }
  });

  // Left open in a pocket for hours: the same return, without a reload.
  document.addEventListener('visibilitychange', () => {
    try {
      if (document.hidden) { hiddenAt = now(); flush(); touch(); return; }
      const gone = hiddenAt ? now() - hiddenAt : 0;
      hiddenAt = 0;
      touch();
      if (booted && gone >= MIN_AWAY_MS) begin(gone);
    } catch { /* never in the way */ }
  });
};
