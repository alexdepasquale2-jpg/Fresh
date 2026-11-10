// STUB: replace with the real atlas tooling (unit 08). See README.md. PC-only, never bundled.
import type { AtlasToolModule } from '@/contracts/units';
import { LawSetSchema } from '@/contracts/atlas';

export const factory = (): AtlasToolModule => ({
  validate: (raw) => {
    const r = LawSetSchema.safeParse(raw);
    return { ok: r.success, errors: r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  },
  stabilityTest: () => ({ ok: true, reason: 'stub: not tested' }),
  score: () => 0,
  emit: (lawSets) => JSON.stringify({ version: 1, lawSets }, null, 2),
});
