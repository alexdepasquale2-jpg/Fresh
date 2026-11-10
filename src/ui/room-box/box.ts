// The Box: 25 slots, and everything you can do with what is in them.
import type { ScreenFactory, AppContext } from '@/contracts/app';
import type { BoxEntry, UniverseStats, Lineage } from '@/contracts/game';
import type { UniverseSpec, UniverseTrait } from '@/contracts/universe';
import { RARITIES } from '@/contracts/universe';
import type { Thing, MergePreview } from '@/contracts/merge';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { el, button, narration, label, boxSlot, glyphChar, backChip, tag, stat, skyPieceTile, burst, flash, lightPips } from '@/ui/kit';
import { names, sync, saveMeta, touch, ago, EMPTY_STATS, loadCollection, saveCollection, lastStar, noteStar } from './store';
import { charOf, tierOf, RARITY_MARK, modChips, modList, bondParts, bondScore, bondWord, emblem } from './character';
import type { Char } from './character';
import { SETS, TEMPERS, claim, lawSets, noteHeld, recipesOf, rewardText } from './collection';
import type { Held } from './collection';
import './room-box.css';

const LAWS: Record<string, string> = {
  'ash-choir': 'Things here burn down to ash, and the ash does not lie still.',
  'cold-fire': 'Fire here gives no warmth. It spreads like frost and leaves things whole but changed.',
  'first-light': 'The plain laws: water falls, fire climbs, stone stays where it is put.',
  'glass-rain': 'The rain here falls as glass. It heaps up, and it cuts.',
  'pale-moss': 'A pale green thing grows over whatever is left alone long enough.',
  'salt-tide': 'The seas here are heavy with salt, and they come and go with their moons.',
  'slow-time': 'Everything here takes longer. A falling stone can be watched.',
  'tallow-bloom': 'Soft wax seeps out of the ground and blooms where it is warm.',
};
const lawLine = (spec: UniverseSpec) => LAWS[spec.laws.id] ?? `It keeps the laws called ${spec.laws.name}. Nothing here behaves quite as it does at home.`;
const ERAS = ['huts', 'fire', 'iron', 'lamps', 'bells', 'star-reaching', 'engines', 'far-speaking', 'leaving'];
const SORTS = ['slot', 'name', 'rarity', 'bond', 'souls', 'depth', 'tended', 'pinned'] as const;
type Sort = (typeof SORTS)[number];
type Pick = { slot: number } | { piece: (typeof SKY_PIECE_KINDS)[number] };
type Mode = 'view' | 'merge' | 'compare' | 'book' | 'goals';
const VIEW_KEY = 'sallow-box-view';
const SOURCE: Record<string, string> = { own: 'its own', inherited: 'inherited', mutation: 'new in it', recipe: 'from a recipe' };
const slug = (t: string) => t.toLowerCase().replace(/\s+/g, '-');

const chip = (text: string, on: boolean, id: string, fn: () => void) => {
  const b = el('button', { class: 'rb-chip', type: 'button', 'aria-pressed': String(on), 'data-id': id }, text);
  b.addEventListener('click', fn);
  return b;
};
const rarityBadge = (ch: Char) => el('span', { class: `rb-rarity rb-r${ch.tier}`, 'data-id': 'rarity', 'data-rarity': ch.rarity }, ch.rarity);
/** Emblem with the glyph over it. */
const crest = (spec: UniverseSpec, tier: number, big = false) =>
  el('span', { class: `rb-glyph rb-crest rb-r${tier}${big ? ' big' : ''}` }, emblem(spec, big ? 32 : 24), el('b', {}, glyphChar(spec.glyph)));

export const box: ScreenFactory = () => {
  let ctx: AppContext | null = null;
  let host: HTMLElement | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  return {
    id: 'box',
    mount: (root, c: AppContext) => {
      ctx = c;
      host = root;
      root.classList.add('rb-box');
      noteStar(c);
      const meta = sync(c, true).meta;
      const col = loadCollection();
      let mode: Mode = 'view';
      let picks: Pick[] = [];
      let confirming = false;
      let renaming = false;
      let other = -1;
      let note = '';
      let sort: Sort = 'slot';
      let filter = '';
      let rarityFilter = '';
      let traitFilter = '';
      let traitsOpen = false;
      let pinnedOnly = false;
      let reveal: { spec: UniverseSpec; ch: Char; says: string; fresh: UniverseTrait[]; recipe: string; recipeNew: boolean; lifted: boolean } | null = null;
      try {
        const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as { sort?: string };
        if (SORTS.includes(v.sort as Sort)) sort = v.sort as Sort;
      } catch { /* storage blocked */ }
      const scroller = el('div', { class: 'rb-scroll', 'data-id': 'box-scroll' });
      const later = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };

      const specOf = (e: BoxEntry) => c.universes.fromSerial(e.serialNumber);
      const isFav = (e: BoxEntry) => meta.fav.includes(e.serialNumber);
      const lastOf = (e: BoxEntry) => meta.last[String(e.serialNumber)] ?? 0;
      // What is held, read once per draw.
      let held: Held[] = [];
      let bySlot = new Map<number, Held>();
      const survey = () => {
        held = [];
        c.box.slots().forEach((e, slot) => {
          if (!e) return;
          const spec = specOf(e);
          held.push({ slot, e, spec, ch: charOf(c, spec, e.stats), bond: bondScore(c, e.stats) });
        });
        bySlot = new Map(held.map((h) => [h.slot, h]));
        noteHeld(col, held);
      };
      const slotOfSerial = (sn: number) => { try { return c.box.slotOf ? c.box.slotOf(sn) : c.box.slots().findIndex((e) => e?.serialNumber === sn); } catch { return -1; } };
      const thingOf = (p: Pick): Thing | null => {
        if ('piece' in p) return { kind: 'piece', piece: p.piece };
        const e = c.box.slots()[p.slot];
        return e ? { kind: 'universe', serialNumber: e.serialNumber } : null;
      };
      const pick = (p: Pick) => {
        const same = (q: Pick) => ('slot' in p && 'slot' in q && p.slot === q.slot);
        if (picks.some(same)) picks = picks.filter((q) => !same(q));
        else if ('piece' in p && picks.filter((q) => 'piece' in q && q.piece === p.piece).length >= c.sky.inventory()[p.piece]) picks = picks.filter((q) => !('piece' in q && q.piece === p.piece));
        else picks = [...picks, p].slice(-2);
        note = '';
        confirming = false;
        c.audio.sfx('tap', 0.4);
        render();
      };
      const statsOf = (p: Pick | undefined) => (p && 'slot' in p ? c.box.slots()[p.slot]?.stats : undefined);
      const previewOf = (a: Thing, b: Thing): MergePreview | null => { try { return c.merger.preview?.(a, b) ?? null; } catch { return null; } };
      const doMerge = () => {
        const [pa, pb] = picks as [Pick, Pick];
        const a = thingOf(pa), b = thingOf(pb);
        if (!a || !b) return;
        const res = c.merger.merge(a, b);
        const sa = statsOf(pa), sb = statsOf(pb);
        for (const p of picks) { if ('slot' in p) c.box.remove(p.slot); else c.sky.grant(p.piece, -1); }
        reveal = null;
        if (res.kind === 'piece') c.sky.grant(res.piece, res.count);
        else {
          const slot = c.box.add(res.spec.serialNumber);
          if (slot >= 0) {
            const made = c.merger.combineStats(sa ?? sb ?? EMPTY_STATS, sa ? sb : undefined);
            c.box.setStats(slot, made);
            // An older merger hands back no lineage inside the stats; the result may still carry one.
            if (!made.lineage && res.lineage) c.box.setLineage?.(slot, res.lineage);
            c.box.select(slot);
            touch(res.spec.serialNumber);
            const stats = c.box.slots()[slot]?.stats ?? made;
            const ch = charOf(c, res.spec, stats);
            const l: Lineage | null = ch.lineage;
            const recipeNew = !!l?.recipe && !col.found.includes(l.recipe.id);
            if (l?.recipe && recipeNew) col.found.push(l.recipe.id);
            col.made++;
            saveCollection(col);
            reveal = {
              spec: res.spec, ch, says: res.says,
              fresh: ch.traits.filter((t) => t.source && t.source !== 'own'),
              recipe: l?.recipe?.name ?? '', recipeNew,
              lifted: ch.tier > tierOf(res.spec.rarity),
            };
          }
          c.selection.universe = null; c.selection.star = null; c.selection.system = null;
        }
        if (!c.box.slots()[c.box.selected()]) c.box.select(Math.max(0, c.box.slots().findIndex(Boolean)));
        note = res.says;
        picks = [];
        confirming = false;
        // A new universe is shown at once, on its own card.
        if (res.kind === 'universe') mode = 'view';
        Object.assign(meta, sync(c, true).meta);
        c.audio.sfx('merge');
        if (reveal) {
          const r = reveal;
          later(420, () => c.audio.sfx(r.ch.tier >= 3 ? 'shine' : r.ch.tier >= 2 ? 'level' : 'gain'));
          if (r.recipeNew) later(900, () => c.audio.sfx('chapter'));
          else if (r.fresh.some((t) => t.source === 'mutation')) later(900, () => c.audio.sfx('whisper'));
        }
        c.persist();
        render();
        flash(root);
        burst(root, root.getBoundingClientRect().width / 2, 300, reveal && reveal.ch.tier >= 2 ? 28 : 18, true);
      };

      const statRows = (s: UniverseStats, e: BoxEntry): [string, string][] => [
        ['worlds tended', String(s.worldsTended)],
        ['deepest fold', String(s.deepestFold)],
        ['light from glow', String(s.lightFromGlow)],
        ['souls', String(s.souls ?? 0)],
        ['age', s.souls ? (ERAS[s.era ?? 0] ?? `era ${s.era}`) : 'none yet'],
        ['faith', !s.belief || s.belief === 'none' ? 'none' : s.belief],
        ['wonder', `${s.enlightenment ?? 0}`],
        ['thriving', `${s.prosperity ?? 0}`],
        ['in orbit', String(s.orbiters ?? 0)],
        ['battles', String(s.battles ?? 0)],
        ['battles won', String(s.battlesWon ?? 0)],
        ['pieces hung', String(s.piecesHung ?? 0)],
        ['floors reached', String(s.floorsReached ?? 0)],
        ['min watched', String(Math.floor((s.ticksTended ?? 0) / 1200))],
        ['bond', String(bondScore(c, s))],
        ['last tended', ago(lastOf(e))],
      ];
      const order = (slots: readonly (BoxEntry | null)[]): number[] => {
        const idx = slots.map((_, i) => i);
        if (sort === 'slot') return idx;
        const key = (e: BoxEntry, i: number): number | string => (
          sort === 'name' ? names.of(specOf(e)).toLowerCase()
            : sort === 'rarity' ? -(bySlot.get(i)?.ch.tier ?? 0)
              : sort === 'bond' ? -(bySlot.get(i)?.bond ?? 0)
                : sort === 'souls' ? -(e.stats.souls ?? 0) : sort === 'depth' ? -e.stats.deepestFold : sort === 'tended' ? -lastOf(e) : isFav(e) ? 0 : 1);
        return idx.sort((a, b) => {
          const ea = slots[a], eb = slots[b];
          if (!ea || !eb) return ea ? -1 : eb ? 1 : a - b;
          const ka = key(ea, a), kb = key(eb, b);
          return ka < kb ? -1 : ka > kb ? 1 : a - b;
        });
      };
      const matches = (h: Held) =>
        (!filter || h.spec.laws.tags.includes(filter)) && (!pinnedOnly || isFav(h.e))
        && (!rarityFilter || h.ch.rarity === rarityFilter) && (!traitFilter || h.ch.traits.some((t) => t.id === traitFilter));

      /* ---------- Pieces of the page ---------- */
      const traitRow = (t: UniverseTrait) => el('div', { class: 'rb-trait', 'data-id': `trait-${t.id}` },
        el('div', { class: 'rb-trait-head' }, el('b', {}, t.name), label([SOURCE[t.source ?? 'own'] ?? '', t.dominant ? 'dominant' : 'recessive'].filter(Boolean).join(' · '))),
        narration(t.says),
        modChips(t.mods),
        modList(t.mods).length ? label(modList(t.mods).map((m) => m.plain).join(' · ')) : null);

      const lightRow = () => {
        const v = c.light.view();
        const p = lightPips(v.pips);
        return el('div', { class: 'mote-card rb-mote' }, el('span', { class: 'mote-dot' }),
          el('div', { class: 'rb-col' }, el('div', { class: 'k-title small' }, 'Mote'), label('your light · never goes in the box')),
          el('div', { class: 'rb-col rb-light' }, p.el,
            typeof v.bank === 'number' ? el('span', { class: v.bank > 0 ? 'k-label rb-bank on' : 'k-label rb-bank', 'data-id': 'light-bank', title: 'Glow that came while Light was full. It pays back out when there is room.' }, `BANK ${(v.bank / 1000).toFixed(1)} pips`) : null));
      };

      const lineageCard = (h: Held): HTMLElement | null => {
        const l = h.ch.lineage;
        if (!l) return null;
        let lines: string[] = [];
        try { lines = c.merger.describeLineage?.(l) ?? []; } catch { lines = []; }
        if (!lines.length && l.says) lines = [l.says];
        const node = (p: Lineage['parents'][number], i: number) => {
          const at = slotOfSerial(p.serialNumber);
          let ps: UniverseSpec | null = null;
          try { ps = c.universes.fromSerial(p.serialNumber); } catch { ps = null; }
          const b = el('button', { class: at >= 0 ? 'rb-node here' : 'rb-node', type: 'button', 'data-id': `parent-${i}`, 'data-serial': p.serialNumber, disabled: at < 0 },
            ps ? crest(ps, tierOf(p.rarity)) : null,
            el('span', { class: 'rb-col' }, el('b', {}, p.name), label(`${p.rarity ?? 'common'} · ${p.laws}`), label(at >= 0 ? 'in the box · tap to see' : 'spent in the making')));
          if (at >= 0) b.addEventListener('click', () => { c.box.select(at); c.persist(); note = ''; c.audio.sfx('nav'); render(); });
          return b;
        };
        const second = l.piece
          ? el('div', { class: 'rb-node piece' }, el('span', { class: 'rb-glyph' }, '✶'), el('span', { class: 'rb-col' }, el('b', {}, `a ${l.piece}`), label('sky piece'), label('spent in the making')))
          : null;
        return el('div', { class: 'rb-block', 'data-id': 'lineage' },
          label(`LINEAGE · generation ${l.generation}${l.ancestors ? ` · ${l.ancestors} folded in` : ''}`),
          el('div', { class: 'rb-tree', 'data-id': 'family-tree' },
            el('div', { class: 'rb-parents' }, ...l.parents.slice(0, 2).map(node), second),
            el('i', { class: 'rb-join' }),
            el('div', { class: 'rb-node child' }, crest(h.spec, h.ch.tier), el('span', { class: 'rb-col' }, el('b', {}, names.of(h.spec)), label(h.ch.title ? `${h.ch.rarity} · ${h.ch.title}` : h.ch.rarity)))),
          l.recipe ? el('div', { class: 'rb-recipe-line', 'data-id': 'lineage-recipe' }, el('b', {}, l.recipe.name), narration(l.recipe.says)) : null,
          ...lines.filter((x) => !l.recipe || !x.startsWith(l.recipe.name)).map((x) => narration(x)),
          l.colours?.length ? el('div', { class: 'rb-swatches', 'aria-label': 'Colours kept from the parents' }, label('colours kept'), ...l.colours.filter((x) => /^#[0-9a-f]{6}$/i.test(x)).map((x) => el('i', { style: `background:${x}` }))) : null);
      };

      const bondCard = (h: Held): HTMLElement => {
        const parts = bondParts(c, h.e.stats);
        const word = bondWord(c, h.bond);
        const open = parts.filter((p) => p.have < p.max).sort((a, b) => (b.max - b.have) - (a.max - a.have));
        return el('div', { class: 'rb-block', 'data-id': 'bond' },
          el('div', { class: 'row' }, label('BOND'), el('b', { class: 'rb-bond-word', 'data-id': 'bond-score' }, `${word ? `${word} · ` : ''}${h.bond}/100`)),
          el('div', { class: 'rb-meter', role: 'meter', 'aria-label': 'Bond', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': h.bond }, el('i', { style: `width:${h.bond}%` })),
          parts.length ? el('div', { class: 'rb-parts' }, ...parts.map((p) => el('span', { class: p.have >= p.max ? 'full' : undefined }, el('b', {}, `${p.have}/${p.max}`), ` ${p.label}`))) : null,
          narration(open.length ? `What raises it: ${open.slice(0, 3).map((p) => p.hint).join('; ')}.` : 'There is nothing more it could ask of you.'));
      };

      const detailCard = (h: Held): HTMLElement => {
        const { spec, e: entry, ch } = h;
        const custom = names.of(spec) !== spec.name;
        const input = el('input', { class: 'rb-input', type: 'text', maxlength: 24, value: names.of(spec), 'data-id': 'rename-input', 'aria-label': 'Name' });
        const saveName = () => { names.set(spec.serialNumber, input.value === spec.name ? '' : input.value); renaming = false; note = ''; render(); };
        input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') saveName(); });
        const total = modList(ch.mods);
        return el('section', { class: `detail rb-detail rb-r${ch.tier}`, 'data-id': 'detail', 'data-rarity': ch.rarity },
          el('div', { class: 'rb-preview' },
            crest(spec, ch.tier, true),
            el('div', { class: 'rb-col' },
              el('div', { class: 'k-title', 'data-id': 'uni-name' }, `${isFav(entry) ? '★ ' : ''}${names.of(spec)}`),
              label(custom ? `${spec.serial} · once ${spec.name}` : spec.serial),
              el('div', { class: 'row start' }, rarityBadge(ch), ch.temperament ? el('span', { class: 'k-label', 'data-id': 'temperament' }, ch.temperament) : null, ch.title ? el('span', { class: 'k-label rb-title' }, ch.title) : null))),
          renaming ? el('div', { class: 'row nowrap rb-rename' }, input, button('Save', saveName, { id: 'rename-save' })) : null,
          el('div', { class: 'row start' }, ...spec.laws.tags.map(tag), label(spec.laws.name)),
          narration(lawLine(spec)),
          el('div', { class: 'row nowrap' },
            button('Enter', () => {
              touch(spec.serialNumber);
              c.selection.universe = spec;
              c.selection.star = null;
              c.selection.system = null;
              c.go('dive');
            }, { primary: true, id: 'enter' }),
            button(entry.stats.worldsTended > 0 ? `Worlds ${entry.stats.worldsTended}` : 'Worlds', () => {
              // Straight to the star last tended in this universe; its home system if there has been none.
              touch(spec.serialNumber);
              if (c.selection.universe?.serial !== spec.serial || !c.selection.star) {
                c.selection.star = lastStar.of(spec);
                c.selection.system = null;
                c.selection.planetIndex = 0;
              }
              c.selection.universe = spec;
              c.go('system');
            }, { id: 'worlds' }),
          ),
          el('div', { class: 'row nowrap rb-tools' },
            button(isFav(entry) ? '★ Pinned' : '☆ Pin', () => {
              meta.fav = isFav(entry) ? meta.fav.filter((s) => s !== entry.serialNumber) : [...meta.fav, entry.serialNumber];
              saveMeta(meta);
              render();
            }, { id: 'fav' }),
            button('Rename', () => { renaming = !renaming; render(); if (renaming) root.querySelector<HTMLInputElement>('[data-id="rename-input"]')?.focus(); }, { id: 'rename' }),
            button('Compare', () => setMode('compare'), { id: 'compare', disabled: c.box.count() < 2 }),
          ),
          spec.description || spec.origin || spec.motto ? el('div', { class: 'rb-block', 'data-id': 'character' },
            spec.description ? narration(spec.description) : null,
            spec.origin ? el('p', { class: 'rb-origin', 'data-id': 'origin' }, el('span', { class: 'k-label' }, 'ORIGIN '), spec.origin) : null,
            spec.motto ? el('p', { class: 'rb-motto', 'data-id': 'motto' }, `“${spec.motto}”`) : null) : null,
          ch.traits.length ? el('div', { class: 'rb-block', 'data-id': 'traits' },
            label(`TRAITS · ${ch.traits.length}`),
            ...ch.traits.map(traitRow),
            total.length ? el('div', { class: 'rb-total', 'data-id': 'modifiers' }, label('ALL TOLD'), modChips(ch.mods)) : null) : null,
          bondCard(h),
          lineageCard(h),
          el('div', { class: 'rb-block', 'data-id': 'stats' },
            label('ITS LIFE SO FAR'),
            el('div', { class: 'row' }, stat(entry.stats.worldsTended, 'worlds tended').el, stat(entry.stats.deepestFold, 'deepest fold').el, stat(entry.stats.lightFromGlow, 'light from glow').el),
            el('div', { class: 'rb-facts' }, ...statRows(entry.stats, entry).slice(3).filter(([k]) => k !== 'bond').map(([k, v]) => el('span', {}, el('b', {}, v), ` ${k}`)))),
        );
      };

      const mergeCard = (): HTMLElement[] => {
        const inv = c.sky.inventory();
        const a = picks[0] ? thingOf(picks[0]) : null, b = picks[1] ? thingOf(picks[1]) : null;
        const nameOf = (t: Thing | null) => (!t ? '…' : t.kind === 'piece' ? `a ${t.piece}` : names.of(c.universes.fromSerial(t.serialNumber)));
        const res = a && b ? c.merger.merge(a, b) : null;
        const pv = a && b && res?.kind === 'universe' ? previewOf(a, b) ?? res.preview ?? null : null;
        const sa = statsOf(picks[0]), sb = statsOf(picks[1]);
        const made = res?.kind === 'universe' ? c.merger.combineStats(sa ?? sb ?? EMPTY_STATS, sa ? sb : undefined) : null;
        const taken = res?.kind === 'universe' && c.box.slots().some((e) => e?.serialNumber === res.spec.serialNumber);
        const kid = res?.kind === 'universe' ? (made?.lineage ? charOf(c, res.spec, made) : charOf(c, res.spec, pv ? { ...EMPTY_STATS, lineage: pv.lineage } : null)) : null;
        const known = !!pv?.recipe && col.found.includes(pv.recipe.id);
        const both = a?.kind === 'universe' && b?.kind === 'universe';
        const lines = pv ? pv.lines.filter((x) => known || !pv.recipe || !x.startsWith(pv.recipe.name)) : [];
        return [
          label('SKY PIECES · tap to add to the merge'),
          el('div', { class: 'row tray' }, ...SKY_PIECE_KINDS.map((k) => {
            const t = skyPieceTile(k, inv[k]);
            if (picks.some((p) => 'piece' in p && p.piece === k)) t.classList.add('picked');
            if (inv[k] > 0) t.addEventListener('click', () => pick({ piece: k }));
            return t;
          })),
          el('section', { class: 'detail', 'data-id': 'merge-card' },
            label(res ? 'THIS PAIR WILL MAKE' : 'MERGE · STEP 1 OF 2'),
            el('div', { class: 'rb-pair' },
              el('span', { class: a ? 'rb-thing on' : 'rb-thing' }, nameOf(a)), el('span', { class: 'rb-plus' }, '+'), el('span', { class: b ? 'rb-thing on' : 'rb-thing' }, nameOf(b))),
            !res ? narration(note || 'Pick any two things: universes, sky pieces, or one of each. Merging always makes something new, and both are spent.') : null,
            res?.kind === 'universe' ? el('div', { class: 'rb-preview', 'data-id': 'merge-preview' },
              crest(res.spec, kid?.tier ?? 0, true),
              el('div', { class: 'rb-col' },
                el('div', { class: 'k-title small' }, res.spec.name),
                label(`${res.spec.serial} · ${res.spec.laws.name}`),
                el('div', { class: 'row start' }, kid ? rarityBadge(kid) : null, kid?.temperament ? label(kid.temperament) : null, ...res.spec.laws.tags.map(tag)))) : null,
            res?.kind === 'universe' ? narration(lawLine(res.spec)) : null,
            lines.length ? el('ul', { class: 'rb-lines', 'data-id': 'merge-lines' }, ...lines.map((x) => el('li', {}, x))) : null,
            pv && both ? el('div', { class: 'rb-recipe-line', 'data-id': 'merge-recipe' },
              pv.recipe
                ? (known ? el('b', {}, `RECIPE · ${pv.recipe.name}`) : el('b', {}, 'RECIPE · a named pairing waits in these two'))
                : el('span', { class: 'k-label' }, 'no named recipe in this pair'),
              pv.recipe ? label(known ? `gives ${pv.recipe.trait.name}` : 'It is written in the book when you merge.') : null) : null,
            pv && pv.chances.length ? el('div', { class: 'rb-block', 'data-id': 'merge-odds' },
              el('div', { class: 'row' }, label('HOW THE ODDS FELL'), both ? label(`unlikeness ${pv.difference}/100`) : null),
              el('div', { class: 'rb-odds' }, ...pv.chances.flatMap((ch) => [
                el('span', { class: 'rb-odd-l' }, ch.label),
                el('b', {}, `${Math.round(ch.permille / 10)}%`),
                el('span', { class: ch.happened ? 'rb-odd-r yes' : 'rb-odd-r' }, ch.happened ? '✓ came up' : '· did not'),
              ])),
              kid && res?.kind === 'universe' && kid.tier > 0 && tierOf(res.spec.rarity) >= kid.tier && !pv.chances.some((ch) => ch.happened && /^Rarity/.test(ch.label))
                ? el('span', { class: 'k-label', 'data-id': 'merge-born' }, `It is ${kid.rarity} by its own seed. A merge can lift a rarity, never lower it.`) : null,
              label(both ? 'Merging is seeded: the same two always make the same third. Unlike parents mutate more and lift rarity.' : 'Merging is seeded: the same two always make the same third.')) : null,
            kid && kid.traits.length ? el('div', { class: 'rb-block', 'data-id': 'merge-traits' },
              label('IT WILL CARRY'),
              ...kid.traits.map((t) => el('div', { class: 'rb-trait slim' }, el('div', { class: 'rb-trait-head' }, el('b', {}, t.source === 'recipe' && !known ? '? ? ?' : t.name), label(SOURCE[t.source ?? 'own'] ?? '')), t.source === 'recipe' && !known ? null : modChips(t.mods)))) : null,
            made ? label(`starts with · ${made.worldsTended} tended · fold ${made.deepestFold} · ${made.lightFromGlow} light · bond ${bondScore(c, made)}`) : null,
            res?.kind === 'piece' ? el('div', { class: 'rb-preview', 'data-id': 'merge-preview' }, el('span', { class: 'rb-glyph' }, '×2'), el('div', { class: 'rb-col' }, el('div', { class: 'k-title small' }, `Two ${res.piece}s`), narration(res.says))) : null,
            taken ? narration('You already hold what this would make. Nothing would come of it.') : null,
            confirming && res
              ? el('div', { class: 'rb-col', 'data-id': 'merge-confirm' },
                narration(`${nameOf(a)} and ${nameOf(b)} will be gone for good. This cannot be taken back.`),
                el('div', { class: 'row nowrap' },
                  button('Not yet', () => { confirming = false; render(); }, { id: 'cancel-merge' }),
                  button('Yes, merge', doMerge, { id: 'confirm-merge' })))
              : button(res ? 'Merge these' : 'Merge', () => { confirming = true; c.audio.sfx('confirm'); render(); }, { primary: true, id: 'do-merge', disabled: !res || taken }),
          ),
        ];
      };

      const bookPage = (): HTMLElement => {
        const all = recipesOf(c);
        const tags = held.map((h) => h.spec.laws.tags);
        const halves = (r: { tags: readonly [string, string] }) => {
          const ia = tags.findIndex((t) => t.includes(r.tags[0]));
          const ib = tags.findIndex((t, i) => t.includes(r.tags[1]) && i !== ia);
          const ib2 = tags.findIndex((t) => t.includes(r.tags[1]));
          const ia2 = tags.findIndex((t, i) => t.includes(r.tags[0]) && i !== ib2);
          return (ia >= 0 && ib >= 0) || (ib2 >= 0 && ia2 >= 0) ? 2 : ia >= 0 || ib2 >= 0 ? 1 : 0;
        };
        const found = all.filter((r) => col.found.includes(r.id)).length;
        return el('section', { class: 'detail', 'data-id': 'recipe-book' },
          el('div', { class: 'row' }, label(`THE RECIPE BOOK · ${found} of ${all.length}`), chip('DONE', false, 'book-done', () => setMode('book'))),
          narration(all.length ? 'Some pairs of laws make a thing with a name. Merge two universes whose laws carry the two marks, and the page fills in.' : 'The book is empty. Nothing here has a name yet.'),
          ...all.map((r) => {
            const got = col.found.includes(r.id);
            const n = halves(r);
            return el('div', { class: got ? 'rb-page got' : 'rb-page', 'data-id': `recipe-${r.id}`, 'data-found': got ? '1' : '0' },
              el('div', { class: 'rb-trait-head' }, el('b', {}, got ? r.name : '? ? ?'), label(got || n > 0 ? `${r.tags[0]} + ${r.tags[1]}` : `${r.tags[0]} + ?`)),
              got ? narration(r.says) : narration(n === 2 ? 'You hold both halves of this one.' : n === 1 ? 'You hold one half of this one.' : 'Neither half is in the box.'),
              got ? el('div', { class: 'rb-trait slim' }, el('div', { class: 'rb-trait-head' }, el('b', {}, r.trait.name), label('only this recipe gives it')), narration(r.trait.says), modChips(r.trait.mods))
                : label(`it would lean toward ${modList(r.trait.mods).map((m) => m.short.replace(/^[+−]\d+% /, '')).join(' and ') || 'something'}`));
          }));
      };

      const claimable = () => SETS.filter((x) => !col.paid.includes(x.id) && x.have(held, col) >= x.need(c));
      const goalsPage = (): HTMLElement => {
        const laws = lawSets(c);
        const tempers = [...new Set<string>([...TEMPERS, ...held.map((h) => h.ch.temperament).filter(Boolean)])];
        return el('section', { class: 'detail', 'data-id': 'goals-page' },
          el('div', { class: 'row' }, label('THE COLLECTION'), chip('DONE', false, 'goals-done', () => setMode('goals'))),
          note ? el('div', { class: 'rb-note', 'data-id': 'box-note' }, narration(note)) : null,
          el('div', { class: 'rb-block' },
            label('BY RARITY · held now / ever held'),
            el('div', { class: 'rb-count', 'data-id': 'rarity-counts' }, ...RARITIES.map((r, i) => {
              const n = held.filter((h) => h.ch.rarity === r).length;
              return el('span', { class: n ? `rb-rarity rb-r${i} on` : `rb-rarity rb-r${i}`, 'data-id': `count-${r}`, 'data-held': n, 'data-seen': col.seen[r] ?? 0 }, `${r} ${n}/${col.seen[r] ?? 0}`);
            }))),
          el('div', { class: 'rb-block' },
            label(`BY LAW · ${new Set(held.map((h) => h.spec.laws.id)).size} held · ${col.laws.length} ever of ${laws.length || '?'}`),
            el('div', { class: 'rb-count', 'data-id': 'law-counts' }, ...laws.map((l) => {
              const n = held.filter((h) => h.spec.laws.id === l.id).length;
              return el('span', { class: n ? 'rb-have on' : col.laws.includes(l.id) ? 'rb-have seen' : 'rb-have', 'data-id': `law-${l.id}` }, `${n ? '■' : col.laws.includes(l.id) ? '▣' : '□'} ${l.name}${n > 1 ? ` ×${n}` : ''}`);
            })),
            label('■ held · ▣ held once · □ never')),
          el('div', { class: 'rb-block' },
            label('BY TEMPERAMENT'),
            el('div', { class: 'rb-count', 'data-id': 'temper-counts' }, ...tempers.map((t) => {
              const n = held.filter((h) => h.ch.temperament === t).length;
              return el('span', { class: n ? 'rb-have on' : 'rb-have' }, `${n ? '■' : '□'} ${t}`);
            }))),
          label(`SETS · ${col.paid.length} of ${SETS.length} paid · each pays once`),
          claimable().length >= 2 ? button(`Claim all ${claimable().length}`, () => {
            // Each set goes through the same claim() the single buttons use; one that will not pay is skipped.
            const bankWas = c.light.view().bank ?? 0;
            const got = claimable().filter((x) => claim(c, x, held, col));
            if (!got.length) return;
            note = `${got.length} ${got.length === 1 ? 'set' : 'sets'} paid: ${got.map((x) => `${x.name} (${rewardText(x)})`).join(', ')}.${(c.light.view().bank ?? 0) > bankWas ? ' Mote was full, so half of what spilled over went to the bank.' : ''}`;
            c.audio.sfx('gain');
            later(300, () => c.audio.sfx('shine'));
            render();
            burst(root, root.getBoundingClientRect().width / 2, 240, 20, true);
          }, { primary: true, id: 'goals-claim-all' }) : null,
          ...SETS.map((s) => {
            const need = s.need(c), have = Math.min(need, s.have(held, col));
            const paid = col.paid.includes(s.id), ready = !paid && have >= need;
            return el('div', { class: paid ? 'rb-set paid' : ready ? 'rb-set ready' : 'rb-set', 'data-id': `set-${s.id}`, 'data-state': paid ? 'paid' : ready ? 'ready' : 'open' },
              el('div', { class: 'rb-trait-head' }, el('b', {}, s.name), label(`${have}/${need}`)),
              narration(s.says),
              el('div', { class: 'rb-meter' }, el('i', { style: `width:${Math.round((have / need) * 100)}%` })),
              el('div', { class: 'row' }, label(`pays ${rewardText(s)}`),
                paid ? el('span', { class: 'k-label rb-paid' }, '✓ PAID')
                  : ready ? button('Claim', () => {
                    const bankWas = c.light.view().bank ?? 0;
                    if (!claim(c, s, held, col)) return;
                    note = `${s.name}. ${rewardText(s)[0]!.toUpperCase()}${rewardText(s).slice(1)} for it.${(c.light.view().bank ?? 0) > bankWas ? ' Mote was full, so half of what spilled over went to the bank.' : ''}`;
                    c.audio.sfx('gain');
                    later(300, () => c.audio.sfx('shine'));
                    render();
                    burst(root, root.getBoundingClientRect().width / 2, 240, 14, true);
                  }, { id: `claim-${s.id}` })
                    : null));
          }));
      };

      const revealCard = (): HTMLElement | null => {
        const r = reveal;
        if (!r) return null;
        const done = () => { reveal = null; c.audio.sfx('close'); render(); };
        return el('div', { class: `rb-reveal rb-r${r.ch.tier}`, 'data-id': 'merge-reveal', role: 'dialog', 'aria-label': 'What the merge made' },
          el('div', { class: 'rb-reveal-in' },
            label('SOMETHING NEW IN THE BOX'),
            crest(r.spec, r.ch.tier, true),
            el('div', { class: 'k-title', 'data-id': 'reveal-name' }, r.spec.name),
            label(`${r.spec.serial} · ${r.spec.laws.name}`),
            el('div', { class: 'row start rb-reveal-rar' }, rarityBadge(r.ch), r.ch.temperament ? label(r.ch.temperament) : null, r.lifted ? label(`lifted above its own ${r.spec.rarity ?? 'common'}`) : null),
            r.recipe ? el('div', { class: 'rb-recipe-line', 'data-id': 'reveal-recipe' }, el('b', {}, r.recipe), label(r.recipeNew ? 'a new page in the recipe book' : 'a recipe you knew')) : null,
            r.fresh.length ? el('div', { class: 'rb-block', 'data-id': 'reveal-traits' }, label('GIVEN TO IT'),
              ...r.fresh.map((t) => el('div', { class: 'rb-trait slim' }, el('div', { class: 'rb-trait-head' }, el('b', {}, t.name), label(SOURCE[t.source ?? 'inherited'] ?? '')), narration(t.says), modChips(t.mods)))) : label('It carries nothing but what it is.'),
            narration(r.says),
            button('Keep it', done, { primary: true, id: 'reveal-done' })));
      };

      let setMode: (m: Mode) => void = () => {};
      const render = () => {
        survey();
        const slots = c.box.slots();
        const sel = c.box.selected();
        const cur = bySlot.get(sel) ?? null;
        const keepScroll = scroller.scrollTop;
        setMode = (m) => { const was = mode; mode = mode === m ? 'view' : m; picks = []; confirming = false; renaming = false; other = -1; note = ''; c.audio.sfx(mode === 'view' ? 'close' : 'open'); render(); if (was !== mode && (mode === 'book' || mode === 'goals' || was === 'book' || was === 'goals')) scroller.scrollTop = 0; };
        const tags = [...new Set(held.flatMap((h) => h.spec.laws.tags))].sort();
        if (filter && !tags.includes(filter)) filter = '';
        const traitsHeld = new Map<string, string>();
        for (const h of held) for (const t of h.ch.traits) traitsHeld.set(t.id, t.name);
        if (traitFilter && !traitsHeld.has(traitFilter)) traitFilter = '';
        if (rarityFilter && !held.some((h) => h.ch.rarity === rarityFilter)) rarityFilter = '';
        const shown = held.filter(matches).length;
        const filtering = !!(filter || pinnedOnly || rarityFilter || traitFilter);
        const ready = SETS.filter((s) => !col.paid.includes(s.id) && s.have(held, col) >= s.need(c)).length;
        const recipeTotal = recipesOf(c).length;
        const head = el('header', { class: 'row rb-head' }, backChip('ROOM', () => c.go('bedroom')),
          chip(mode === 'merge' ? 'MERGING' : 'MERGE', mode === 'merge', 'merge-mode', () => setMode('merge')),
          label(`${String(c.box.count()).padStart(2, '0')}/25`));
        const kids: (HTMLElement | null)[] = [];
        if (mode === 'book') kids.push(el('h1', { class: 'k-title' }, 'The Box'), bookPage());
        else if (mode === 'goals') kids.push(el('h1', { class: 'k-title' }, 'The Box'), goalsPage());
        else {
          kids.push(
            el('h1', { class: 'k-title' }, 'The Box'),
            lightRow(),
            el('div', { class: 'rb-collect', 'data-id': 'collection' },
              el('div', { class: 'rb-count' }, ...RARITIES.map((r, i) => {
                const n = held.filter((h) => h.ch.rarity === r).length;
                return el('span', { class: n ? `rb-rarity rb-r${i} on` : `rb-rarity rb-r${i}`, title: r }, `${RARITY_MARK[i]} ${r} ${n}`);
              })),
              el('div', { class: 'row nowrap' },
                chip(`GOALS ${col.paid.length}/${SETS.length}${ready ? ` · ${ready} READY` : ''}`, ready > 0, 'goals', () => setMode('goals')),
                chip(`RECIPES ${col.found.length}/${recipeTotal}`, false, 'recipe-book-open', () => setMode('book')))),
            el('div', { class: 'rb-bar', 'data-id': 'box-bar' },
              chip(`SORT · ${sort.toUpperCase()}`, sort !== 'slot', 'sort', () => {
                sort = SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length]!;
                try { localStorage.setItem(VIEW_KEY, JSON.stringify({ sort })); } catch { /* storage blocked */ }
                render();
              }),
              chip('★ PINNED', pinnedOnly, 'filter-pinned', () => { pinnedOnly = !pinnedOnly; render(); }),
              traitsHeld.size ? chip(traitFilter ? `TRAIT · ${traitsHeld.get(traitFilter) ?? ''}` : 'TRAIT ▾', traitsOpen || !!traitFilter, 'filter-traits', () => { traitsOpen = !traitsOpen; render(); }) : null,
              ...RARITIES.filter((r) => held.some((h) => h.ch.rarity === r)).map((r) => chip(r, rarityFilter === r, `filter-${r}`, () => { rarityFilter = rarityFilter === r ? '' : r; render(); })),
              ...tags.map((t) => chip(t, filter === t, `filter-${slug(t)}`, () => { filter = filter === t ? '' : t; render(); })),
            ),
            traitsOpen ? el('div', { class: 'rb-bar', 'data-id': 'trait-bar' },
              ...[...traitsHeld].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => chip(name, traitFilter === id, `filter-trait-${id}`, () => { traitFilter = traitFilter === id ? '' : id; render(); }))) : null,
            el('div', { class: 'grid5 rb-grid', 'data-id': 'box-grid' }, ...order(slots).map((i) => {
              const s = slots[i] ?? null;
              const h = bySlot.get(i);
              const picked = mode === 'merge' ? picks.some((p) => 'slot' in p && p.slot === i) : mode === 'compare' ? i === sel || i === other : i === sel;
              const b = boxSlot(s && h ? glyphChar(h.spec.glyph) : null, picked, () => {
                if (!s) return;
                if (mode === 'merge') pick({ slot: i });
                else if (mode === 'compare') { if (i !== sel) { other = other === i ? -1 : i; render(); } }
                else { c.box.select(i); c.persist(); renaming = false; note = ''; c.audio.sfx('tap', 0.3 + (h?.ch.tier ?? 0) * 0.15); render(); }
              });
              b.dataset.slot = String(i);
              if (s && h) {
                const word = bondWord(c, h.bond);
                b.setAttribute('aria-label', `${names.of(h.spec)}, ${h.ch.rarity}${word ? `, ${word}` : ''}`);
                b.classList.add(`rb-r${h.ch.tier}`);
                b.dataset.rarity = h.ch.rarity;
                b.dataset.bond = String(h.bond);
                b.dataset.serial = String(s.serialNumber);
                b.prepend(emblem(h.spec));
                b.append(el('span', { class: 'rb-rar' }, RARITY_MARK[h.ch.tier] ?? 'C'));
                if (h.bond > 0) b.append(el('i', { class: 'rb-bond', style: `width:${Math.max(8, h.bond)}%` }));
                if (h.ch.lineage) b.append(el('span', { class: 'rb-made', title: 'made by merging' }, '⋈'));
                if (isFav(s)) b.classList.add('rb-fav');
                if (!matches(h)) b.classList.add('rb-dim');
                if (mode === 'compare' && i === other) b.classList.add('rb-other');
              } else {
                // An empty slot is an invitation.
                b.disabled = false;
                b.setAttribute('aria-label', 'Empty slot');
                b.addEventListener('click', () => { note = 'An empty slot. Fall into a universe, find a flicker in the folds, and throw a reliquary at it. What you catch comes home to here.'; render(); });
              }
              return b;
            })),
            el('span', { class: 'k-label rb-legend' }, filtering ? (shown ? `${shown} shown · the rest are dimmed` : 'None match. The rest are dimmed.') : 'letter: rarity · bar: bond · ⋈ made'),
          );
          if (mode === 'merge') kids.push(...mergeCard());
          else if (mode === 'compare' && cur) {
            const spec = cur.spec, entry = cur.e;
            const oh = other >= 0 ? bySlot.get(other) ?? null : null;
            const ra = statRows(entry.stats, entry), rb = oh ? statRows(oh.e.stats, oh.e) : null;
            const sideHead = (h: Held | null) => el('div', { class: 'rb-col rb-side' },
              h ? crest(h.spec, h.ch.tier) : el('span', { class: 'rb-glyph' }, '?'),
              el('div', { class: 'k-title small' }, h ? names.of(h.spec) : 'Pick another'),
              label(h ? `${h.ch.rarity} · ${h.spec.laws.name}` : 'tap a slot above'));
            const num = (v: string) => (/^-?\d+$/.test(v) ? Number(v) : null);
            kids.push(el('section', { class: 'detail', 'data-id': 'compare-card' },
              el('div', { class: 'row' }, label('SIDE BY SIDE'), chip('DONE', false, 'compare-done', () => setMode('compare'))),
              el('div', { class: 'rb-vs' }, sideHead(cur), sideHead(oh)),
              rb ? el('div', { class: 'rb-table' }, ...ra.flatMap(([k, va], i) => {
                const vb = rb[i]![1];
                const na = num(va), nb = num(vb);
                return [
                  el('b', { class: na !== null && nb !== null && na > nb ? 'win' : undefined }, va),
                  el('span', {}, k),
                  el('b', { class: na !== null && nb !== null && nb > na ? 'win' : undefined }, vb),
                ];
              })) : narration('Choose a second universe from the grid to set beside this one.'),
              rb && oh ? narration(oh.spec.laws.id === spec.laws.id ? 'They keep the same laws. They would understand each other.' : `${spec.laws.name} beside ${oh.spec.laws.name}. They would not agree on how a stone falls.`) : null,
            ));
          } else if (cur) kids.push(note ? el('div', { class: 'rb-note', 'data-id': 'box-note' }, narration(note)) : null, detailCard(cur));
          else if (note) kids.push(el('div', { class: 'rb-note', 'data-id': 'box-note' }, narration(note)));
        }
        scroller.replaceChildren(...kids.filter((x): x is HTMLElement => !!x));
        const over = revealCard();
        root.replaceChildren(...[head, scroller, over].filter((x): x is HTMLElement => !!x));
        scroller.scrollTop = keepScroll;
      };
      render();
    },
    frame: () => ctx?.gl.clear('#17140c'),
    unmount: () => {
      for (const t of timers) clearTimeout(t);
      timers = [];
      host?.classList.remove('rb-box');
      host = null;
      ctx = null;
    },
  };
};
