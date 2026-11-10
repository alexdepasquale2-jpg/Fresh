// Atlas tooling (unit 08). PC-only. Validates law sets; the stability survey lives in survey.ts and
// registers itself here when loaded (the CLI loads it), so nothing heavy rides along into the app.
import type { AtlasToolModule } from '@/contracts/units';
import { LawSetSchema } from '@/contracts/atlas';
import type { LawSet } from '@/contracts/atlas';
import { ENGINE } from '@/contracts/sim';

type Runner = (law: LawSet, ticks: number) => { ok: boolean; reason: string; live: number; mix: readonly (readonly [string, number])[] };
let runner: Runner | null = null;
/** Plug-in point: survey.ts (or an external search harness) installs the function that runs a law set. */
export const useSurvey = (f: Runner): void => { runner = f; };

/** Semantic checks zod cannot express. */
const lint = (law: LawSet): string[] => {
  const errors: string[] = [];
  const names = new Set(law.materials.map((m) => m.name));
  const ids = new Set<number>();
  for (const m of law.materials) {
    if (ids.has(m.id)) errors.push(`materials: duplicate id ${m.id}`);
    ids.add(m.id);
    if (m.id >= 250) errors.push(`materials: id ${m.id} is reserved for the engine`);
    if (m.flows && m.kind !== 'powder') errors.push(`materials: ${m.name} flows but is not a powder`);
    if (m.viscosity && m.kind !== 'liquid') errors.push(`materials: ${m.name} is thick but is not a liquid`);
  }
  if (law.materials[0]?.id !== 0 || law.materials[0]?.name !== 'empty') errors.push('materials: id 0 must be "empty"');
  for (const k of ['solid', 'powder', 'liquid'] as const) if (!law.materials.some((m) => m.kind === k)) errors.push(`materials: no ${k}`);
  for (const e of Object.keys(ENGINE)) names.add(e);
  law.reactions.forEach((r, i) => {
    for (const n of [r.a, r.becomesA, r.becomesB]) if (!names.has(n) && !(n === '*' && n === r.becomesB)) errors.push(`reactions.${i}: unknown material "${n}"`);
    if (r.b !== '*' && !names.has(r.b)) errors.push(`reactions.${i}: unknown material "${r.b}"`);
    if (r.chance[0] > r.chance[1]) errors.push(`reactions.${i}: chance above 1`);
    for (const g of [r.temp, r.depth, r.wind, r.humid]) if (g && g.min !== undefined && g.max !== undefined && g.min > g.max) errors.push(`reactions.${i}: empty range`);
  });
  return errors;
};

export const factory = (): AtlasToolModule => ({
  validate: (raw) => {
    const r = LawSetSchema.safeParse(raw);
    if (!r.success) return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
    const errors = lint(r.data);
    return { ok: errors.length === 0, errors };
  },
  stabilityTest: (lawSet, ticks) => {
    if (!runner) return { ok: true, reason: 'not run: load tools/atlas/survey first' };
    const s = runner(lawSet, ticks);
    return { ok: s.ok, reason: s.reason };
  },
  // Variety score: more kinds of matter still present and more motion read as a richer world.
  score: (lawSet) => {
    if (!runner) return 0;
    const s = runner(lawSet, 6000);
    return s.ok ? Math.min(100, s.mix.filter(([, p]) => p >= 0.1).length * 8 + Math.min(40, Math.trunc(s.live / 5))) : 0;
  },
  emit: (lawSets) => JSON.stringify({ version: 1, lawSets }, null, 2),
});
