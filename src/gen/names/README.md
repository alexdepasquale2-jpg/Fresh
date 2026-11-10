# Unit 02: src/gen/names

**Scope.** Grammar for universe, system, planet, village and age names in the voice of Ossuary Minor, Pallid Choir, Tallow, Saltmere, Age of Tides.

**Contract.** `src/contracts/universe.ts`: `NameGenFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/gen/names/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Each of the five methods is a pure function of its seed (golden values for 3 fixed seeds).
2. Names are 3 to 24 characters, letters, spaces, hyphens and apostrophes only.
3. Universe names are one or two words; age names start with "Age of".
4. Over 10,000 seeds, at least 2,000 distinct planet names and fewer than 1% exact repeats in a row.
5. No name contains a word from a blocklist of modern or comic words (included in the test).
6. The grammar is data (word lists and patterns in one file), not code branches.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
