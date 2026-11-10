# Unit 03: src/gen/fold

**Scope.** childrenOf: which children hold stars or flickers, density by depth; depth 10,000 must cost the same as depth 1.

**Contract.** `src/contracts/fold.ts`: `FoldGenFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/gen/fold/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. childrenOf always returns 7 nodes with index 0..6 and child addresses built with mix(pathHash, i) and depth + 1.
2. Pure: the same address gives deep-equal children (golden test at depth 1 and depth 10,000).
3. No node holds both a star and a flicker; index 0 (centre) never holds a flicker.
4. Star density rises with depth then plateaus; measured over 10,000 random addresses per depth band.
5. A fall straight down the centre path reaches a star within 40 folds for at least 95% of 1,000 universes.
6. Time for 10,000 childrenOf calls at depth 10,000 is within 10% of the same at depth 1.
7. Flicker serialNumbers are 24-bit and deterministic in the address.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
