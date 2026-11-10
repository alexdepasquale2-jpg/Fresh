// Merging (game/merge). Any two things make a third, new thing. Pure and seeded.
//
// How a child universe is made (all of it a pure function of the two parents' serials):
//  1. LAWS. One parent is the stronger (the rarer has 3 chances in 5, equals toss a coin). The child
//     is chosen among 64 seeded candidate serials, and a candidate with the stronger parent's law set
//     is preferred, then the other parent's. The child is a real universe: its spec is its serial's.
//  2. PALETTE AND GLYPH. Among those candidates the one whose water colour is nearest the parents'
//     blend, and whose glyph shares a row with one parent and a column with the other, scores higher.
//     Two colours from each parent and the row/column pair are also kept in the lineage.
//  3. TRAITS. Each parent trait the child does not already have may pass down: dominant 1 in 2,
//     recessive 1 in 5, a trait both parents carry 9 in 10. At most two gifts.
//  4. RECIPES. A named pair of law tags (see ./inherit) gives a unique trait and a title.
//  5. MUTATION. 6% plus up to 20% more the more unlike the parents are: a trait neither had.
//  6. RARITY. Never below the child's own, never below the lesser parent's. Unlike parents may lift it
//     to the rarer parent's, and very unlike parents (70+) one step past that.
// What the child was GIVEN (3 to 6) is its Lineage, which rides in its Box stats.
import type { MergerFactory, Thing, MergeResult, MergePreview, MergedCharacter, MergeChance, MergeRecipe } from '@/contracts/merge';
import type { Lineage, LineageParent, UniverseStats } from '@/contracts/game';
import type { Rarity, UniverseModifiers, UniverseSpec, UniverseTrait } from '@/contracts/universe';
import type { SkyPieceKind } from '@/contracts/sky';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { serialToSeed } from '@/core/serial';
import { child, mix, rng, seedToU32 } from '@/core/hash';
import { MUTATIONS, RECIPES, SIGNS } from './inherit';

export { MUTATIONS, RECIPES, SIGNS } from './inherit';

// The law set each sky piece pulls a universe toward.
const SIGN: Record<SkyPieceKind, string> = {
  comet: 'cold-fire', moon: 'salt-tide', belt: 'ash-choir', sun: 'glass-rain', rings: 'slow-time', dust: 'pale-moss',
};
// Piece + piece. Same kinds climb to something greater; different kinds make the third they imply.
const FUSE: Record<string, [SkyPieceKind, string]> = {
  'comet+comet': ['belt', 'Two comets shatter into a belt.'],
  'moon+moon': ['rings', 'Two moons grind each other into rings.'],
  'belt+belt': ['moon', 'The belts gather into a moon.'],
  'sun+sun': ['dust', 'Two suns burn out into dust.'],
  'rings+rings': ['sun', 'The rings fall inward and catch light.'],
  'dust+dust': ['comet', 'The dust freezes into a comet.'],
  'comet+moon': ['rings', 'The comet breaks on the moon and rings it.'],
  'belt+comet': ['dust', 'Comet and belt grind to dust.'],
  'comet+sun': ['dust', 'The sun boils the comet to dust.'],
  'comet+rings': ['moon', 'The comet gathers the rings into a moon.'],
  'comet+dust': ['belt', 'Ice and dust clot into a belt.'],
  'belt+moon': ['rings', 'The moon pulls the belt into rings.'],
  'moon+sun': ['comet', 'A sunlit moon sheds a comet.'],
  'moon+rings': ['belt', 'Moon and rings scatter into a belt.'],
  'dust+moon': ['comet', 'Dust on a cold moon makes a comet.'],
  'belt+sun': ['rings', 'The sun melts the belt into rings.'],
  'belt+rings': ['sun', 'Belt and rings fall together and ignite.'],
  'belt+dust': ['moon', 'Belt and dust settle into a moon.'],
  'rings+sun': ['dust', 'The sun burns the rings to dust.'],
  'dust+sun': ['moon', 'Dust around a sun cools to a moon.'],
  'dust+rings': ['comet', 'Ring ice and dust make a comet.'],
};

const TIERS: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'mythic'];
const tierOf = (r: Rarity | undefined) => Math.max(0, TIERS.indexOf(r ?? 'common'));
const CANDIDATES = 64;
export const PASS_DOMINANT = 500, PASS_RECESSIVE = 200, PASS_SHARED = 900;

const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] as const; };
const colourGap = (a: string, b: string, c: string) => {
  const x = rgb(a), y = rgb(b), z = rgb(c);
  return Math.abs((x[0] + y[0]) / 2 - z[0]) + Math.abs((x[1] + y[1]) / 2 - z[1]) + Math.abs((x[2] + y[2]) / 2 - z[2]);
};
const sumMods = (list: readonly UniverseModifiers[]): UniverseModifiers => {
  const out: Record<string, number> = {};
  for (const m of list) for (const [k, v] of Object.entries(m)) if (typeof v === 'number' && v !== 0) out[k] = (out[k] ?? 0) + v;
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k];
  return out;
};
const recipeFor = (a: readonly string[], b: readonly string[]): MergeRecipe | undefined =>
  RECIPES.find(({ tags: [x, y] }) => (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x)));
const list = (xs: readonly string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]!}`);
const parentOf = (s: UniverseSpec): LineageParent => ({ serialNumber: s.serialNumber, name: s.name, laws: s.laws.name, rarity: s.rarity ?? 'common' });

interface Made { result: Extract<MergeResult, { kind: 'universe' }>; preview: MergePreview }

export const factory: MergerFactory = ({ universes }) => {
  /** Among 24 seeded candidates, pick the first with a wanted law set that is not a parent. */
  const candidate = (seed: ReturnType<typeof serialToSeed>, wanted: string[], not: number[]) => {
    let fallback = -1;
    for (let k = 0; k < 24; k++) {
      const serial = seedToU32(child(seed, k)) & 0xffffff;
      if (not.includes(serial)) continue;
      if (fallback < 0) fallback = serial;
      if (wanted.includes(universes.fromSerial(serial).laws.id)) return serial;
    }
    return fallback;
  };

  const character = (spec: UniverseSpec, lineage?: Lineage | null): MergedCharacter => {
    const traits: UniverseTrait[] = (spec.traits ?? []).map((t) => ({ ...t, source: 'own' as const }));
    const add = (t: UniverseTrait | undefined) => { if (t && !traits.some((x) => x.id === t.id)) traits.push(t); };
    for (const t of lineage?.gifts ?? []) add({ ...t, source: t.source ?? 'inherited' });
    add(RECIPES.find((r) => r.id === lineage?.recipe?.id)?.trait);
    add(lineage?.mutation);
    // Temperament and rarity leanings are already in spec.modifiers; add only what was given.
    const given = traits.filter((t) => t.source !== 'own').map((t) => t.mods);
    return {
      rarity: TIERS[Math.max(tierOf(spec.rarity), tierOf(lineage?.rarity))]!,
      traits,
      modifiers: sumMods([spec.modifiers ?? sumMods(traits.filter((t) => t.source === 'own').map((t) => t.mods)), ...given]),
      title: lineage?.recipe?.name,
    };
  };

  const cache = new Map<string, Made>();
  const keep = (k: string, m: Made) => { if (cache.size > 96) cache.clear(); cache.set(k, m); return m; };

  const breed = (lo: number, hi: number): Made => {
    const hit = cache.get(`${lo}:${hi}`);
    if (hit) return hit;
    const pa = universes.fromSerial(lo), pb = universes.fromSerial(hi);
    const seed = mix(mix(child(serialToSeed(lo), 'merge'), hi), 0x6d657267);
    const r = rng(child(seed, 'rules'));
    const ta = tierOf(pa.rarity), tb = tierOf(pb.rarity);
    const idsA = (pa.traits ?? []).map((t) => t.id), idsB = (pb.traits ?? []).map((t) => t.id);
    const shared = idsA.filter((id) => idsB.includes(id));
    const difference = Math.min(100,
      (pa.laws.id !== pb.laws.id ? 35 : 0) + Math.min(30, Math.abs(ta - tb) * 10) + (shared.length ? 0 : 20) + (pa.temperament !== pb.temperament ? 10 : 0) + ((pa.glyph >> 3) !== (pb.glyph >> 3) ? 5 : 0));
    const recipe = recipeFor(pa.laws.tags, pb.laws.tags);

    // 1. Laws: which parent it takes after.
    const aStrong = ta === tb ? r.chance(1, 2) : r.chance(3, 5) === (ta > tb);
    const strong = aStrong ? pa : pb, weak = aStrong ? pb : pa;

    // 1 and 2. Choose the child among seeded candidates.
    let best: UniverseSpec | null = null, bestScore = -1e9;
    for (let k = 0; k < CANDIDATES; k++) {
      const serial = seedToU32(child(seed, k)) & 0xffffff;
      if (serial === lo || serial === hi) continue;
      const c = universes.fromSerial(serial);
      const own = (c.traits ?? []).map((t) => t.id);
      const score =
        (c.laws.id === strong.laws.id ? 100 : c.laws.id === weak.laws.id ? 60 : 0)
        + Math.max(0, 20 - colourGap(pa.palette[11]!, pb.palette[11]!, c.palette[11]!) / 6)
        + ((c.glyph >> 3) === (pa.glyph >> 3) ? 8 : 0) + ((c.glyph & 7) === (pb.glyph & 7) ? 8 : 0)
        + 10 * own.filter((id) => idsA.includes(id) || idsB.includes(id)).length
        + 6 * Math.min(tierOf(c.rarity), Math.max(ta, tb))
        + (c.temperament === strong.temperament ? 4 : 0)
        // A child never wears a parent's name.
        - (c.name === pa.name || c.name === pb.name ? 500 : 0);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    const spec = best ?? universes.fromSerial((lo ^ hi ^ 0x5a5a5a) & 0xffffff);
    const ownIds = (spec.traits ?? []).map((t) => t.id);

    // 3. Traits passed down.
    const chances: MergeChance[] = [];
    const gifts: UniverseTrait[] = [];
    const offered = [...(pa.traits ?? []).map((t) => [t, pa] as const), ...(pb.traits ?? []).filter((t) => !idsA.includes(t.id)).map((t) => [t, pb] as const)]
      .sort((x, y) => Number(y[0].dominant ?? false) - Number(x[0].dominant ?? false));
    for (const [t, from] of offered) {
      if (ownIds.includes(t.id)) continue;
      const permille = shared.includes(t.id) ? PASS_SHARED : t.dominant ? PASS_DOMINANT : PASS_RECESSIVE;
      const happened = r.int(1000) < permille && gifts.length < 2;
      chances.push({ label: `${t.name} passes down from ${shared.includes(t.id) ? 'both' : from.name}${t.dominant ? ' (dominant)' : ' (recessive)'}`, permille, happened });
      if (happened) gifts.push({ id: t.id, name: t.name, says: t.says, mods: { ...t.mods }, dominant: t.dominant, source: 'inherited' });
    }

    // 5. Mutation.
    const mutPermille = 60 + difference * 2;
    const mutated = r.int(1000) < mutPermille;
    const mutation = mutated ? r.pick(MUTATIONS) : undefined;
    chances.push({ label: 'A trait neither parent has', permille: mutPermille, happened: mutated });

    // 6. Rarity.
    const liftPermille = Math.min(600, difference * 4 + (recipe ? 150 : 0));
    const lifted = r.int(1000) < liftPermille;
    const floor = lifted ? Math.min(4, Math.max(ta, tb) + (difference >= 70 ? 1 : 0)) : Math.min(ta, tb);
    const tier = Math.max(tierOf(spec.rarity), floor);
    const rarity = TIERS[tier]!;
    chances.push({ label: difference >= 70 ? 'Rarity lifts one step past the rarer parent' : 'Rarity lifts to the rarer parent', permille: liftPermille, happened: lifted });
    chances.unshift({ label: `Takes after ${pa.name}`, permille: ta === tb ? 500 : ta > tb ? 600 : 400, happened: aStrong });

    const rc = rng(child(seed, 'colours'));
    const lineage: Lineage = {
      parents: [parentOf(pa), parentOf(pb)],
      generation: 1,
      ancestors: 2,
      ...(recipe ? { recipe: { id: recipe.id, name: recipe.name, says: recipe.says } } : {}),
      ...(gifts.length ? { gifts } : {}),
      ...(mutation ? { mutation } : {}),
      rarity,
      colours: [pa.palette[rc.pick([11, 12])]!, pa.palette[15]!, pb.palette[rc.pick([11, 12])]!, pb.palette[15]!],
      sigil: [pa.glyph >> 3, pb.glyph & 7],
      says: recipe ? `${recipe.name}. Made of ${pa.name} and ${pb.name}.` : `Made of ${pa.name} and ${pb.name}.`,
    };
    const takes = spec.laws.id === pa.laws.id && spec.laws.id === pb.laws.id ? 'both' : spec.laws.id === pa.laws.id ? pa.name : spec.laws.id === pb.laws.id ? pb.name : '';
    const lines = [
      takes === 'both' ? `Keeps the ${spec.laws.name} laws both of them had.` : takes ? `Takes the ${spec.laws.name} laws of ${takes}.` : `Neither's laws held. It came out ${spec.laws.name}.`,
      ...(recipe ? [`${recipe.name}: ${recipe.says}`] : []),
      ...(gifts.length ? [`Inherits ${list(gifts.map((g) => g.name))}.`] : []),
      ...(mutation ? [`Something new: ${mutation.name}. ${mutation.says}`] : []),
      tier > tierOf(spec.rarity) ? `It comes out ${rarity}, above its own ${spec.rarity ?? 'common'}.` : `It is ${rarity}.`,
    ];
    const says = [
      `${pa.name} and ${pb.name} fold into each other. ${spec.name} opens where they were.`,
      ...(recipe ? [`${recipe.name}. ${recipe.says}`] : []),
      ...(gifts.length ? [`It keeps ${list(gifts.map((g) => g.name.toLowerCase()))}.`] : []),
      ...(mutation ? [`Something new came through with it: ${mutation.name.toLowerCase()}.`] : []),
      ...(tier > tierOf(spec.rarity) ? [`It came out ${rarity}.`] : []),
    ].join(' ');
    const kid = character(spec, lineage);
    const preview: MergePreview = { spec, lineage, child: kid, ...(recipe ? { recipe } : {}), difference, chances, lines };
    return keep(`${lo}:${hi}`, { result: { kind: 'universe', spec, says, lineage, child: kid, preview }, preview });
  };

  const imbue = (serialNumber: number, piece: SkyPieceKind): Made => {
    const key = `${serialNumber}+${piece}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const parent = universes.fromSerial(serialNumber);
    const seed = child(child(serialToSeed(serialNumber), 'imbue'), piece);
    const spec = universes.fromSerial(candidate(seed, [SIGN[piece]], [serialNumber]));
    const r = rng(child(seed, 'rules'));
    const ownIds = (spec.traits ?? []).map((t) => t.id);
    const chances: MergeChance[] = [];
    const gifts: UniverseTrait[] = [SIGNS[piece]];
    for (const t of parent.traits ?? []) {
      if (ownIds.includes(t.id)) continue;
      const permille = t.dominant ? 600 : 300;
      const happened = r.int(1000) < permille && gifts.length < 2;
      chances.push({ label: `${t.name} survives the rebirth${t.dominant ? ' (dominant)' : ' (recessive)'}`, permille, happened });
      if (happened) gifts.push({ id: t.id, name: t.name, says: t.says, mods: { ...t.mods }, dominant: t.dominant, source: 'inherited' });
    }
    const rarity = TIERS[Math.max(tierOf(spec.rarity), tierOf(parent.rarity))]!;
    const lineage: Lineage = { parents: [parentOf(parent)], piece, generation: 1, ancestors: 1, gifts, rarity, colours: [parent.palette[11]!, parent.palette[15]!], sigil: [parent.glyph >> 3, spec.glyph & 7], says: `${parent.name}, reborn under a ${piece}.` };
    const lines = [`Reborn under the ${piece}: ${SIGNS[piece].name}.`, ...(gifts.length > 1 ? [`Keeps ${gifts[1]!.name} from ${parent.name}.`] : []), `It is ${rarity}.`];
    const kid = character(spec, lineage);
    const preview: MergePreview = { spec, lineage, child: kid, difference: 0, chances, lines };
    const says = `The ${piece} sinks into ${parent.name}. It is reborn as ${spec.name}.${gifts.length > 1 ? ` It keeps ${gifts[1]!.name.toLowerCase()}.` : ''}`;
    return keep(key, { result: { kind: 'universe', spec, says, lineage, child: kid, preview }, preview });
  };

  const make = (a: Thing, b: Thing): Made | null => {
    if (a.kind === 'piece' && b.kind === 'piece') return null;
    if (a.kind === 'universe' && b.kind === 'universe') {
      const [lo, hi] = [a.serialNumber, b.serialNumber].sort((p, q) => p - q) as [number, number];
      return breed(lo, hi);
    }
    const u = a.kind === 'universe' ? a : (b as Extract<Thing, { kind: 'universe' }>);
    const p = a.kind === 'piece' ? a : (b as Extract<Thing, { kind: 'piece' }>);
    return imbue(u.serialNumber, p.piece);
  };

  // The lineage of the last universe merge() made, so combineStats (which the Box calls straight
  // after, with the parents' stats) can hand it on inside the child's stats.
  let last: Lineage | null = null;

  const describeLineage = (l: Lineage): string[] => [
    l.piece ? `${l.parents[0]?.name ?? 'Something'}, reborn under a ${l.piece}.` : `Made of ${list(l.parents.map((p) => p.name))}.`,
    ...(l.recipe ? [`${l.recipe.name}. ${l.recipe.says}`] : []),
    ...(l.gifts?.length ? [`Inherited: ${list(l.gifts.map((g) => g.name))}.`] : []),
    ...(l.mutation ? [`New in it: ${l.mutation.name}. ${l.mutation.says}`] : []),
    l.generation > 1 ? `${l.generation} merges deep. ${l.ancestors ?? l.parents.length} universes went into it.` : 'First of its line.',
  ];

  return {
    merge: (a: Thing, b: Thing): MergeResult => {
      if (a.kind === 'piece' && b.kind === 'piece') {
        const [x, y] = [a.piece, b.piece].sort();
        const [piece, says] = FUSE[`${x}+${y}`] ?? [SKY_PIECE_KINDS.find((k) => k !== x && k !== y)!, 'They become something else.'];
        return { kind: 'piece', piece, count: 2, says };
      }
      const made = make(a, b)!;
      last = made.result.lineage ?? null;
      return made.result;
    },
    combineStats: (a, b) => {
      const stats: UniverseStats = {
        worldsTended: a.worldsTended + (b?.worldsTended ?? 0),
        deepestFold: Math.max(a.deepestFold, b?.deepestFold ?? 0),
        lightFromGlow: a.lightFromGlow + (b?.lightFromGlow ?? 0),
        souls: (a.souls ?? 0) + (b?.souls ?? 0),
        era: Math.max(a.era ?? 0, b?.era ?? 0),
        belief: a.belief ?? b?.belief ?? 'none',
        enlightenment: Math.max(a.enlightenment ?? 0, b?.enlightenment ?? 0),
        prosperity: Math.max(a.prosperity ?? 0, b?.prosperity ?? 0),
        orbiters: (a.orbiters ?? 0) + (b?.orbiters ?? 0),
        battles: (a.battles ?? 0) + (b?.battles ?? 0),
        battlesWon: (a.battlesWon ?? 0) + (b?.battlesWon ?? 0),
        piecesHung: (a.piecesHung ?? 0) + (b?.piecesHung ?? 0),
        floorsReached: (a.floorsReached ?? 0) + (b?.floorsReached ?? 0),
        ticksTended: (a.ticksTended ?? 0) + (b?.ticksTended ?? 0),
      };
      if (!last) return stats;
      // The parents' own lineages (if they were made too) deepen the child's.
      // (Stats arrive in the order they were picked, not the parents' order, so only order-free sums are used.)
      const la = a.lineage, lb = b?.lineage;
      // Two made universes pass on the lesser of the rarities they were given.
      const kept = la && lb ? Math.min(tierOf(la.rarity), tierOf(lb.rarity)) : 0;
      const lineage: Lineage = {
        ...last,
        generation: 1 + Math.max(la?.generation ?? 0, lb?.generation ?? 0),
        ancestors: (la?.ancestors ?? 1) + (b ? lb?.ancestors ?? 1 : 0),
        rarity: TIERS[Math.max(tierOf(last.rarity), kept)]!,
      };
      return { ...stats, lineage };
    },
    preview: (a, b) => make(a, b)?.preview ?? null,
    character,
    recipes: () => RECIPES,
    describeLineage,
  };
};
