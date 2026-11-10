// Chronicle (unit 11): the event is written first, the reason after (Caves of Qud style).
import type { ChronicleFactory, ChronicleEntry, CivEvent } from '@/contracts/sim';
import type { PlanetSpec } from '@/contracts/system';
import { child } from '@/core/hash';

const EVENT: Record<CivEvent['kind'], string[]> = {
  found: ['%v was raised from the dust.', 'They built %v and lit its first lamp.'],
  grow: ['%v grew loud with children.', 'More lamps burned in %v.'],
  split: ['Some left %v to walk the long road.', '%v sent its young to find new ground.'],
  die: ['%v went dark.', 'No one answers in %v now.'],
  migrate: ['%v moved under a new sky.'],
  light: ['%v sang toward the sky.'],
};

export const factory: ChronicleFactory = ({ names }) => {
  let entries: (ChronicleEntry & { kind: CivEvent['kind'] })[] = [];
  let nextId = 1;
  return {
    record: (events: readonly CivEvent[], year: number, planet: PlanetSpec) => {
      for (const e of events) {
        const v = names.village(child(planet.seed, e.villageId + 1));
        const opts = EVENT[e.kind];
        entries.push({ id: nextId, year, kind: e.kind, event: opts[(nextId + e.tick) % opts.length]!.replace('%v', v) });
        nextId++;
      }
      if (entries.length > 200) entries = entries.slice(-200);
    },
    explain: (sky, m, says) => {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]!;
        if (e.reason) continue;
        let reason: string;
        if (e.kind === 'die') reason = m.impacts > 20 ? 'They say the sky threw stones.' : m.tide > 30 ? 'They say the sea came for it.' : m.warmth > 40 ? 'They say the suns were cruel.' : m.dimming > 30 ? 'They say the veil starved the fields.' : 'They say the land was poor.';
        else if (e.kind === 'found' || e.kind === 'grow') reason = m.nightLight > 20 ? 'They say the night was kind to them.' : sky.pieces.includes('moon') ? 'They say the moon brought fish to the flats.' : says[0] ? `They say: ${says[0].toLowerCase()}` : 'They say it was a quiet year.';
        else reason = says.length ? `They blame the sky. ${says[says.length - 1]}` : 'No one knows why.';
        entries[i] = { ...e, reason };
      }
    },
    entries: (limit = 50) => entries.slice(-limit).reverse().map(({ kind: _k, ...e }) => e),
    snapshot: () => entries.map(({ kind: _k, ...e }) => e),
    restore: (list) => {
      entries = list.map((e) => ({ ...e, kind: 'light' as const }));
      nextId = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    },
  };
};
