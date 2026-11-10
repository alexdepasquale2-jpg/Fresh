// STUB: replace with the real chronicle (unit 11). See README.md.
import type { ChronicleFactory, ChronicleEntry } from '@/contracts/sim';

export const factory: ChronicleFactory = () => {
  let entries: ChronicleEntry[] = [];
  let nextId = 1;
  return {
    record: (events, year) => {
      for (const e of events) entries.push({ id: nextId++, year, event: `A village ${e.kind === 'found' ? 'was founded' : e.kind}.` });
    },
    explain: (_sky, _mods, says) => {
      entries = entries.map((e) => (e.reason ? e : { ...e, reason: says[0] ?? 'The sky was quiet.' }));
    },
    entries: (limit = 50) => [...entries].reverse().slice(0, limit),
    snapshot: () => entries.map((e) => ({ ...e })),
    restore: (list) => {
      entries = list.map((e) => ({ ...e }));
      nextId = entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
    },
  };
};
