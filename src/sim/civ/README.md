# Unit 10: src/sim/civ

**Scope.** Villages found, grow, split and die on the grid; souls; glow output.

**Contract.** `src/contracts/sim.ts`: `CivFactory`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `src/sim/civ/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. Villages found on dry land next to water, never in mid-air or underwater.
2. Villages grow with nearby resources, split when large, and die when flooded or buried.
3. Every change emits exactly one CivEvent with tick and position.
4. glowPerMinute rises with souls and night light; a dead world gives zero.
5. Deterministic: golden test of events and view after 2,000 ticks.
6. Reads the grid only; never writes cells.
7. snapshot/restore round-trips.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.

## The body (`body.ts`)

A life in a body: per-village standing (-100..100: hunted, shunned, tolerated, welcome, followed) with what each village remembers, twenty contextual deeds (`BodyDeed`), needs (hunger, weariness, wounds, fever, cold and storm; none of them hurt in the first 1,200 ticks of a life), followers, roles, a creed about the body (creed ids from 1024: `1024 + 16 * n + deed`, named in `lore.ts`), rulers who court or hunt it, and an ending told by how it lived. Every roll is the unit's stateless dice. What outlives a body is `W.body` (in the snapshot, optional: an older snapshot wakes with no memory of bodies); the avatar itself is not in the snapshot, as before. Events are CivEvent kind `'body'` with `detail` = a code from `B` in `body.ts`; `src/sim/chronicle/body.ts` keeps the same numbers.

## Snapshots (format 2)

The snapshot is JSON with `v: 2` and, beside the villages, people and wider world: the rng stream where it stood (`rng.ts` is the core sfc32 with readable state), the ground as last scanned, surface events not yet weighed, events not yet handed out, the living body with its whole life (needs, role, followers, carried goods, log, cooldowns), who is striking and kneeling, and which columns were wet. A restored civ continues exactly; the body survives leaving a world and a reload. A snapshot without `v` restores as it always did: no body, the stream begun again from the planet seed.

`init(planet, surface, universe?)`: with the universe the civ knows every falling liquid of the law set, not only water. It does not found on liquid, people do not walk into it, and a village with liquid at its doors or under its floor is wet: it climbs to dry ground within 30 columns or is flooded, as before.
