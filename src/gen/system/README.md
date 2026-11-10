# Unit 04: src/gen/system

**Scope.** Star, 1 to 4 orbits and planets from a StarRef.

**Contract.** `src/contracts/system.ts`: `SystemGenFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/gen/system/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. fromStar returns 1 to 4 orbits and planets.length === orbits.length.
2. Pure in (star, universe): golden test on 3 fixed stars.
3. Orbit rings are strictly increasing; periodTicks increase outward (Kepler-like, integer math).
4. Every planet passes PlanetSpecSchema; names come from NameGen.
5. Star kind and heat shift the orbit count and planet biomes in a way a test can measure over 1,000 stars.
6. System name is from NameGen.system and differs from every planet name in the system.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.
