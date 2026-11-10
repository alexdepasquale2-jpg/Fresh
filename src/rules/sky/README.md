# Unit 07: src/rules/sky

**Scope.** The sky-to-surface table: each piece and pairwise combination to modifiers (tides, night light, impacts, seasons, dimming). Under 40 rules, each one a player could guess.

**Contract.** `src/contracts/sky.ts`: `SkyRulesFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/rules/sky/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Fewer than 40 rules, each passing SkyRuleSchema with a unique id.
2. Every single piece kind has at least one rule; at least 6 pairwise combinations have rules.
3. effects() sums matching rules and clamps each key to -100..100; an empty sky is neutral.
4. explain() returns the says of matching rules in table order.
5. Each says line is under 80 characters, plain words, present tense (checked by a regex test).
6. Pure and deterministic: golden test for 5 fixed skies.
7. Moon gives tide; Comet gives impacts; Sun gives warmth; Dust gives dimming; Rings give night light.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
