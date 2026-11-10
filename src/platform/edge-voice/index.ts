// STUB: replace with the real optional edge adapter (unit 27). See README.md. Off by default.
import type { EdgeVoiceFactory } from '@/contracts/platform';

export const factory: EdgeVoiceFactory = () => ({
  enabled: () => false,
  setEnabled: () => {},
  revoice: async (_k, _s, text) => text,
  revoiceSync: (_k, _s, text) => text,
});
