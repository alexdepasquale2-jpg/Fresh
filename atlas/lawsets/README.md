# Unit 06: atlas/lawsets

**Scope.** At least 8 hand-written law sets such as Cold fire and Slow time (materials plus reactions), all passing validation.

**Contract.** `src/contracts/atlas.ts`: `AtlasLawsetsModule`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `atlas/lawsets/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. At least 8 JSON files, each passing LawSetSchema; ids are unique and match file names.
2. Every law set has material id 0 named "empty" and at least one solid, one powder and one liquid.
3. Every reaction names only materials that exist in its law set.
4. Each law set has 1 to 4 tags shown to the player and a distinct pulseMilliHz.
5. Includes "cold-fire" and "slow-time" plus six more, each with a one-line comment in this README on what makes it different.
6. At least half the law sets have reactions gated by a sky modifier (needs), so the sky matters.
7. The atlas factory loads every file and passes AtlasSchema.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
