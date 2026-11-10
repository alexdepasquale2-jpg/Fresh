# Unit 01: src/gen/universe

**Scope.** UniverseSpec from a seed: law set from the atlas, palette, glyph, serial.

**Contract.** `src/contracts/universe.ts`: `UniverseGenFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/gen/universe/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. fromSerial(n) returns a spec that passes UniverseSpecSchema for 1,000 serials.
2. Same serial gives a byte-identical spec (JSON) across two calls and two generator instances (golden value test).
3. serial is formatSerial(serialNumber) and seed is serialToSeed(serialNumber).
4. The law set is chosen from atlas.lawSets only; materialTable and reactionTable are copies of that law set.
5. palette has 16 distinct #rrggbb colours, index 0 darkest, and respects the law set hue when given.
6. Over 1,000 serials every law set in the atlas is chosen at least once and glyphs cover at least 48 of 64 values.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
