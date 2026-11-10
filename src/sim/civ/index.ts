// STUB: replace with the real civilisation sim (unit 10). See README.md.
import type { CivFactory, Village, CivEvent } from '@/contracts/sim';

export const factory: CivFactory = () => {
  let villages: Village[] = [];
  let tick = 0;
  let founded = false;
  return {
    init: (_planet, surface) => {
      villages = surface.villageSites.slice(0, 1).map((s, id) => ({ id, x: s.x, y: s.y, souls: 10, name: 'Tallow' }));
      tick = 0;
      founded = false;
    },
    step: (ticks): CivEvent[] => {
      tick += ticks;
      if (founded || villages.length === 0) return [];
      founded = true;
      const v = villages[0]!;
      return [{ kind: 'found', tick, villageId: v.id, x: v.x, y: v.y }];
    },
    view: () => ({ villages, souls: villages.reduce((n, v) => n + v.souls, 0), glowPerMinute: villages.length }),
    snapshot: () => new TextEncoder().encode(JSON.stringify({ villages, tick, founded })),
    restore: (s) => {
      const o = JSON.parse(new TextDecoder().decode(s)) as { villages: Village[]; tick: number; founded: boolean };
      ({ villages, tick, founded } = o);
    },
  };
};
