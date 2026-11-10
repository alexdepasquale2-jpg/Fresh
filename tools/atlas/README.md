# Unit 08: tools/atlas

**Scope.** Node CLI for the PC only: validate, stability-test (reject dead or exploding worlds after N ticks), score, emit; a plug-in point for Lenia or ALife search results.

**Contract.** `src/contracts/units.ts`: `AtlasToolModule`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `tools/atlas/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. npm run atlas -- validate exits 0 on the shipped law sets and 1 on a broken fixture.
2. stabilityTest runs a law set on a test grid for N ticks with the real reaction rules and rejects dead (no change) or exploding (one material over 90%) worlds.
3. score returns a deterministic integer from activity, diversity and sky sensitivity.
4. emit writes a single validated atlas JSON with stable key order.
5. A documented plug-in interface accepts external search results (e.g. Lenia or ALife) as candidate law sets.
6. Nothing in tools/ is imported by the app bundle (checked by a test on the build graph or imports).

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.

## State (wave 2)

- `npm run atlas -- validate [dir]`: zod schema plus lint (unique ids, reserved engine ids, id 0 empty, a solid, a powder and a liquid, known material names, sane ranges, id matches file name, distinct pulse).
- `npm run atlas -- stability [dir] [ticks] [id prefix] [--phases]`: runs each law set through the real sand kernel on a fixed test world under three skies in turn (plain; warm, moonlit, tidal, with falling rock; cold, dim, dusty, hard seasons). Fails a law set that is dead (under 12 cells changed in the last 2,000 ticks), burning (fire over 3%), overgrown or hollowed (matter up or down 30%), eaten (stone down 40%) or overrun (one law material over 30% of the grid). Prints live share, material mix and a grid hash per law set.
- `survey.ts` holds the runner and registers it through `useSurvey` in `index.ts`; that hook is also the plug-in point for an external search harness. `index.ts` itself imports no kernel, so the app bundle that wires the factory stays lean.
