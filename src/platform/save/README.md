# Unit 24: src/platform/save

**Scope.** IndexedDB save and load, migrations, share-code import and export.

**Contract.** `src/contracts/platform.ts`: `SaveStoreFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/platform/save/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** Real. IndexedDB first (keys `sallow-save`, `sallow-save.prev`, written in one transaction), localStorage when IndexedDB is shut (`sallow-save`, `.new`, `.prev`: new is written and read back before it replaces old), memory last. `load()` takes the newest readable copy. `save()` refuses a snapshot that fails the schema, coalesces bursts, and is frozen once an import or reset is staged.
Whole-game codes (`bundle.ts`): `SALLOW1Z.<deflate, base64url>.<checksum>` holding the main save plus every localStorage key that starts with `sallow` (not `sallow-save*`). `stageImport` / `stageReset` / `stageRestore` keep one backup (`sallow-save.backup`), write `sallow-save.pending`, and the caller reloads; the factory applies the pending change at boot before any other unit reads its keys.

## Acceptance criteria

1. save then load returns an equal SaveState (fake IndexedDB in tests).
2. migrate accepts every past version and returns the current one; garbage returns null.
3. exportCode gives "No. 3F9A-77"; importCode accepts that, "3F9A-77" and "3f9a77".
4. A corrupt store loads as null without throwing.
5. Saves are debounced and never block a frame.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
