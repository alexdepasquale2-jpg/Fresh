# Unit 13: src/render/dive

**Scope.** Nested-ring fractal, zoom that re-roots at every fold, vignette tied to Light, star and flicker markers.

**Contract.** `src/contracts/render.ts`: `DiveRendererFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/render/dive/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Draws 1 centre ring and 6 around it per fold, nested at least 3 levels deep.
2. Zoom is driven by DiveView.progress; at each fold boundary the view re-roots with no visible pop (frame-diff test in the demo).
3. Stars and flickers in DiveView.children get distinct markers; flickers use the glow token.
4. Vignette darkens as lightPips falls.
5. Brightness pulses with the shared pulse phase.
6. No allocation in draw(); holds 60 fps at 390x844 on a 4x-throttled profile (state numbers in PR).
7. Recovers after a simulated context loss.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
