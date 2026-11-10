// STUB: replace with the real save system (unit 24). See README.md.
import { get, set, del } from 'idb-keyval';
import type { SaveStoreFactory, SaveState } from '@/contracts/platform';
import { SaveStateSchema } from '@/contracts/platform';
import { formatSerial, parseSerial } from '@/core/serial';

const KEY = 'sallow-save';
export const factory: SaveStoreFactory = () => {
  const migrate = (raw: unknown): SaveState | null => {
    const r = SaveStateSchema.safeParse(raw);
    return r.success ? r.data : null;
  };
  return {
    load: async () => migrate(await get(KEY).catch(() => null)),
    save: (s) => set(KEY, s).catch(() => undefined),
    clear: () => del(KEY).catch(() => undefined),
    migrate,
    exportCode: formatSerial,
    importCode: parseSerial,
  };
};
