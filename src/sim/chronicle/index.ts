// Chronicle (unit 11). Events are written first; reasons come after, sifted from
// what the surface and sky did before, and told in the voice of the village's faith.
import type { ChronicleFactory, ChronicleEntry, CivEvent, SurfaceEvent, Belief } from '@/contracts/sim';
import { ERAS } from '@/contracts/sim';
import type { PlanetSpec } from '@/contracts/system';
import { child } from '@/core/hash';

type Kind = CivEvent['kind'] | SurfaceEvent['kind'];
type Entry = ChronicleEntry & { kind: Kind; belief?: Belief; tick: number };

const EVENT: Partial<Record<Kind, string[]>> = {
  found: ['%v was raised from the dust.', 'They built %v and lit its first lamp.', 'A handful of souls made a home and called it %v.'],
  grow: ['%v grew loud with children.', 'More lamps burned in %v.', '%v outgrew its walls.'],
  split: ['Some left %v to walk the long road.', '%v sent its young to find new ground.'],
  die: ['%v went dark.', 'No one answers in %v now.', 'The last fire of %v went out.'],
  flooded: ['The water rose over %v.', '%v was drowned.'],
  frozen: ['Frost took the edges of %v.', '%v huddled through a killing cold.'],
  burn: ['Fire ran through %v.', '%v burned.'],
  famine: ['%v went hungry.', 'The stores of %v ran empty.'],
  migrate: ['Families left %v for %o.', 'A line of walkers left %v, bound for %o.'],
  feud: ['%v and %o came to blows.', 'Blood between %v and %o.'],
  festival: ['%v sang all night.', 'A festival in %v, under the lit sky.'],
  convert: ['%v turned to the %b.', 'In %v they began to pray to the %b.'],
  tech: ['%v learned %t.', '%v came into the age of %t.'],
  launch: ['From %v a small light rose and did not come down.', '%v sent a lamp into the sky.'],
  light: ['%v sang toward the sky.'],
  struck: ['The stranger struck back at %v, and they ran.', 'Those of %v who raised their hands against the stranger fell.'],
  preached: ['The stranger spoke at %v, and some stayed to listen.', 'In %v they sat down around the stranger and heard it speak.'],
  gift: ['The stranger gave %v bread from its own body.', '%v ate from the hands of the stranger.'],
  merged: ['Two peoples became one and called themselves %v.', 'The walls came down between them. Now there is only %v.'],
  stranger: ['A stranger walked near %v. They kept their distance.', 'In %v they watched a shining stranger and did not know what to do.'],
  attack: ['A stranger came to %v and they met it with stones.', 'The people of %v drove at a shining stranger with spears.'],
  slain: ['%v killed the stranger who walked among them.', 'In %v they struck down the thing that came from the sky.'],
  worship: ['A stranger came to %v and they knelt.', '%v welcomed the one who made their sky.'],
  enlightened: ['%v understood at last what watches them.', 'The people of %v looked up and knew.'],
  blessed: ['A warmth settled on %v.', '%v woke to full stores and quiet hearts.'],
  smitten: ['Death fell on %v from nowhere.', 'Half of %v did not wake.'],
  omen: ['They saw an omen over %v.'],
  quake: ['The ground split and shook.', 'The world trembled.'],
  impact: ['A stone fell from the sky.', 'Something struck the world and the ground shook.'],
  storm: ['A great storm came.', 'The clouds broke open.'],
  freeze: ['The seas froze.', 'Ice closed over the water.'],
  thaw: ['The ice broke.', 'The thaw came.'],
  fire: ['Wildfire spread across the land.'],
  flood: ['The waters rose everywhere.'],
  drought: ['The waters shrank.', 'A long dry.'],
  bloom: ['The moss spread green.'],
  blight: ['The moss withered.'],
  lightning: ['Lightning struck the high ground.'],
};
// Which surface events can explain which hardships.
const FITS: Partial<Record<Kind, Kind[]>> = {
  famine: ['drought', 'blight', 'freeze', 'impact', 'storm'],
  die: ['drought', 'blight', 'freeze', 'impact', 'fire', 'flood', 'storm'],
  burn: ['fire', 'lightning', 'impact', 'drought'],
  flooded: ['flood', 'storm', 'thaw'],
  frozen: ['freeze', 'storm'],
  convert: ['impact', 'storm', 'lightning', 'freeze', 'flood', 'fire', 'bloom', 'thaw'],
};
const LOUD_SURFACE = new Set<Kind>(['quake', 'impact', 'storm', 'freeze', 'thaw', 'fire', 'flood', 'drought', 'bloom', 'blight']);
const TECH = ['huts', 'fire', 'iron', 'lamps', 'bells', 'star-reaching'];
const GOD: Record<Belief, string> = { none: 'nothing', sun: 'sun', moon: 'moon', sea: 'sea', stone: 'falling stones', fire: 'fire', sky: 'storm' };

// How each faith explains a hardship.
const VOICE: Record<Belief, string> = {
  none: 'They say',
  sun: 'The sun-priests say',
  moon: 'The moon-keepers say',
  sea: 'The tide-callers say',
  stone: 'The stone-readers say',
  fire: 'The fire-tenders say',
  sky: 'The storm-watchers say',
};
const CAUSE: Partial<Record<Kind, string>> = {
  impact: 'the sky threw stones',
  quake: 'the ground split',
  storm: 'the storm was owed',
  freeze: 'the seas froze',
  flood: 'the waters rose',
  drought: 'the waters left',
  fire: 'the fires came',
  blight: 'the moss failed',
  bloom: 'the moss came green',
  lightning: 'lightning chose them',
  thaw: 'the ice broke',
};

export const factory: ChronicleFactory = ({ names }) => {
  let entries: Entry[] = [];
  let nextId = 1;
  let lastText = '';
  let recentSurface: { kind: Kind; tick: number; year: number }[] = [];
  let planet: PlanetSpec | null = null;
  const vname = (id: number) => (planet ? names.village(child(planet.seed, id + 1)) : `the village`);
  const pick = (opts: string[], salt: number) => {
    let t = opts[salt % opts.length]!;
    if (t === lastText && opts.length > 1) t = opts[(salt + 1) % opts.length]!;
    lastText = t;
    return t;
  };
  return {
    record: (events, year, p, surface = []) => {
      planet = p;
      for (const e of surface) {
        recentSurface.push({ kind: e.kind, tick: e.tick, year });
        if (LOUD_SURFACE.has(e.kind) && !entries.slice(-30).some((x) => x.kind === e.kind && year - x.year < 6)) {
          entries.push({ id: nextId++, year, kind: e.kind, tick: e.tick, event: pick(EVENT[e.kind] ?? ['Something happened.'], nextId) });
        }
      }
      recentSurface = recentSurface.filter((s) => year - s.year <= 3).slice(-24);
      for (const e of events) {
        // One line per village per kind per year is enough.
        if (entries.slice(-40).some((x) => x.kind === e.kind && x.year === year && x.event.includes(vname(e.villageId)))) continue;
        if ((e.kind === 'festival' || e.kind === 'convert' || e.kind === 'grow') && entries.slice(-40).some((x) => x.kind === e.kind && year - x.year < 2)) continue;
        const OMEN = ['Water poured from an empty sky near %v.', 'Sand fell like rain on %v.', 'A wall of stone rose near %v.', 'Green came up from dead ground by %v.', 'Fire fell from an open hand over %v.', 'The water froze at a touch near %v.', 'A star was thrown down at %v.', 'Clouds gathered from nothing over %v.', 'The ground heaved under %v.', 'Lightning was called down on %v.', 'The air burned around %v.', 'A cold came to %v from nowhere.', 'Part of the world was taken from %v.'];
        if (e.kind === 'omen') {
          const t = e.detail === 101 ? 'A light too bright to look at stood by %v.' : e.detail === 100 ? 'A voice spoke to %v from above.' : OMEN[e.detail ?? 0] ?? 'They saw an omen over %v.';
          entries.push({ id: nextId++, year, kind: e.kind, tick: e.tick, event: t.replace('%v', vname(e.villageId)), ...(e.belief ? { belief: e.belief } : {}) });
          continue;
        }
        const opts = e.kind === 'migrate' && e.detail === e.villageId ? ['%v climbed away from the water.', 'The people of %v moved to higher ground.'] : EVENT[e.kind] ?? ['%v endured.'];
        const text = pick(opts, nextId + e.tick)
          .replace('%v', vname(e.villageId))
          .replace('%o', vname(e.detail ?? 0))
          .replace('%b', GOD[e.belief ?? 'none'])
          .replace('%t', TECH[e.detail ?? 0] ?? ERAS[0]);
        entries.push({ id: nextId++, year, kind: e.kind, tick: e.tick, event: text, ...(e.belief ? { belief: e.belief } : {}) });
      }
      if (entries.length > 300) entries = entries.slice(-300);
    },
    explain: (sky, m, says) => {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]!;
        if (e.reason !== undefined) continue;
        const voice = VOICE[e.belief ?? 'none'];
        // Sift: the most recent loud surface event before this one is the cause they remember.
        const fits = FITS[e.kind];
        const prior = [...recentSurface].reverse().find((s) => s.tick <= e.tick && e.tick - s.tick < 3200 && CAUSE[s.kind] && (!fits || fits.includes(s.kind)));
        let reason: string | undefined;
        switch (e.kind) {
          case 'die': case 'famine': case 'burn': case 'flooded': case 'frozen':
            reason = prior ? `${voice} it began when ${CAUSE[prior.kind]}.` : m.impacts > 20 ? `${voice} the sky threw stones.` : m.tide > 30 ? `${voice} the sea came for them.` : m.warmth > 40 ? `${voice} the suns were cruel.` : m.dimming > 30 ? `${voice} the veil starved the fields.` : `${voice} the land was poor.`;
            break;
          case 'convert':
            reason = prior ? `After ${CAUSE[prior.kind]}, it seemed the only answer.` : says[0] ? `They watched the sky. ${says[0]}` : 'No one remembers why.';
            break;
          case 'feud': reason = 'Each said the other prayed wrong.'; break;
          case 'struck': reason = `${voice} it was never a thing to be fought.`; break;
          case 'preached': reason = 'Its voice was like their own, but older.'; break;
          case 'gift': reason = 'It grew fainter as they ate.'; break;
          case 'merged': reason = 'A hand they could not see pressed them together.'; break;
          case 'attack': case 'slain': reason = `${voice} it was a demon wearing light.`; break;
          case 'stranger': reason = 'Some wanted to kneel. Some wanted to run.'; break;
          case 'worship': case 'enlightened': reason = 'They had been watching your light for a long time.'; break;
          case 'blessed': reason = `${voice} the sky remembered them.`; break;
          case 'smitten': reason = `${voice} they had been judged.`; break;
          case 'omen': reason = e.event.includes('voice') ? 'They turned their faces to the storm.' : `${voice} something is watching.`; break;
          case 'migrate': reason = e.event.includes('higher') || e.event.includes('climbed') ? `${voice} the water was patient.` : 'They went where the stores were fuller.'; break;
          case 'tech': reason = e.event.includes('iron') ? 'The fallen stones were good metal.' : 'Many hands, long years.'; break;
          case 'launch': reason = 'They had been watching your light.'; break;
          case 'festival': reason = sky.pieces.includes('rings') ? 'The rings lit the dancing.' : sky.pieces.includes('moon') ? 'The moon was full.' : 'The year was kind.'; break;
          case 'found': case 'grow':
            reason = m.nightLight > 20 ? `${voice} the night was kind.` : sky.pieces.includes('moon') ? `${voice} the moon brought fish to the flats.` : says[0] ? `${voice}: ${says[0].toLowerCase()}` : `${voice} it was a quiet year.`;
            break;
          default:
            reason = says.length ? says[says.length - 1]! : '';
        }
        entries[i] = { ...e, reason };
      }
    },
    entries: (limit = 50) => entries.slice(-limit).reverse().map(({ kind: _k, belief: _b, tick: _t, ...e }) => e),
    snapshot: () => entries.map(({ kind: _k, belief: _b, tick: _t, ...e }) => e),
    restore: (list) => {
      entries = list.map((e) => ({ ...e, kind: 'light' as const, tick: 0 }));
      nextId = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    },
  };
};
