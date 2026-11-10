# Unit 28: src/platform/perf

**Scope.** Frame-time monitor, resolution scaling, sim tick shedding.

**Contract.** `src/contracts/platform.ts`: `PerfFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/platform/perf/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. averageFrameMs tracks a rolling window.
2. quality drops after sustained frames over 20 ms and recovers after sustained frames under 14 ms, with hysteresis.
3. resolutionScale follows quality within 0.5..1.
4. tickBudget sheds sim ticks at low quality but never below 1 when ticks are wanted.
5. onChange fires once per quality change.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
