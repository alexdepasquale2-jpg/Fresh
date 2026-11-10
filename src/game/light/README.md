# Unit 17: src/game/light

**Scope.** The 8-pip economy.

**Contract.** `src/contracts/game.ts`: `LightFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/game/light/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Starts full at 8 pips; never below 0 or above 8.
2. drainFolds drains a stated number of folds per pip and returns false at zero.
3. addGlow accumulates partial progress and adds a pip at 1,000.
4. low is true at 2 pips or fewer.
5. A dive of about 40 folds is reachable from full but not free (test with the stated rates).
6. snapshot/restore round-trips.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
