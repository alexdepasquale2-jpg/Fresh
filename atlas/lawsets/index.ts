// Loader for the law sets in this directory (unit 06 adds the JSON files).
import type { AtlasLawsetsModule } from '@/contracts/units';
import { AtlasSchema, LawSetSchema } from '@/contracts/atlas';
import type { LawSet } from '@/contracts/atlas';

const files = import.meta.glob<{ default: unknown }>('./*.json', { eager: true });

export const factory = (): AtlasLawsetsModule => {
  const lawSets: LawSet[] = Object.keys(files)
    .sort()
    .map((k) => LawSetSchema.parse(files[k]!.default));
  const atlas = AtlasSchema.parse({ version: 1, lawSets });
  return { lawSets: () => lawSets, atlas: () => atlas };
};
