# Unit 06: atlas/lawsets

**Scope.** At least 8 hand-written law sets such as Cold fire and Slow time (materials plus reactions), all passing validation.

**Contract.** `src/contracts/atlas.ts`: `AtlasLawsetsModule`. Export it as `factory` from `index.ts` (wired in `src/app/registry.ts`, which you must not edit).

**Must not touch.** Anything outside `atlas/lawsets/`. In particular: `src/contracts`, `src/core`, `src/render/gl`, `src/ui/kit`, `src/ui/tokens.css`, `src/app`, `package.json`, the lockfile, other units. No new dependencies. If the contract blocks you, write `CONTRACT_REQUEST.md` here and work around it.

**Current state.** A trivial deterministic stub that satisfies the contract so the app boots. Replace it.

## Acceptance criteria

1. At least 8 JSON files, each passing LawSetSchema; ids are unique and match file names.
2. Every law set has material id 0 named "empty" and at least one solid, one powder and one liquid.
3. Every reaction names only materials that exist in its law set.
4. Each law set has 1 to 4 tags shown to the player and a distinct pulseMilliHz.
5. Includes "cold-fire" and "slow-time" plus six more, each with a one-line comment in this README on what makes it different.
6. At least half the law sets have reactions gated by a sky modifier (needs), so the sky matters.
7. The atlas factory loads every file and passes AtlasSchema.

Plus: `npm run check` passes, and `demo.ts` shows the unit alone in `/dev` with a fixed seed.

## The law sets

The first eight: `first-light` (plain), `pale-moss`, `salt-tide`, `cold-fire`, `slow-time`, `glass-rain`, `ash-choir`, `tallow-bloom`.

Wave 2 added fourteen that use the optional primitives in `src/contracts/atlas.ts` (temperature, light, depth, direction, wind and cloud gates; heat and vapour; rising, night-flowing, wind-borne and thick materials). Every one keeps ids 0..5 as empty, stone, sand, water, moss, steam so planets generate the same way.

- `singing-glass`: hot shores glaze to glass; cold glass sings, and the song shatters it.
- `upward-rain`: at night the sea falls into the sky and pools under roofs; a moon pulls harder.
- `living-stone`: stone buds in daylight and climbs as spires; frost, wind and water grind them down.
- `rust-garden`: water draws iron from stone, iron rusts, and rust feeds a red-footed green.
- `brine-lattice`: warm seas skin over with salt bridges; rain, cold and tides break them.
- `grey-mycelium`: fungus wakes in ash in true dark, dies in the sun and leaves soil.
- `black-water`: oil seeps up through the sea bed, floats, smothers moss and burns hot.
- `remembering-ice`: ice scars the ground, and a scar calls the ice back even in mild air.
- `night-sand`: wind works sand into silt that stands by day and runs like water by night.
- `lamp-moss`: moss lights in true dark and breathes motes that seed; any moon puts the lamps out.
- `quick-metal`: cold nights sweat a heavy silver that runs under water and floats the sand.
- `wind-clay`: wind files stone to dust, dust sinks as mud and sets as clay, clay bakes to stone.
- `moon-coral`: coral climbs through mild water toward light, fed by tides; it dies in air.
- `under-fire`: deep stone melts and eats its way upward, building slow black cones that warm the sky.

What each sky modifier does to them (beside the climate every world shares):

- tide: upward-rain rises faster, brine bridges break, moon-coral climbs fast, lamp-moss and night-sand regrow green.
- nightLight: puts out lamp-moss, keeps grey-mycelium asleep, stills night-sand, lets living-stone bud at night, roots moss in glass shards.
- impacts: under-fire melts faster, rust-garden gains fresh iron, singing-glass fuses where the fire lands.
- seasons: wider summers and winters drive glass forming and breaking, salt bridges, remembered ice, coral die-back.
- dimming: a dimmed sun is no "day" and can be "dark": lamps and fungus spread, living-stone stops budding, glass stops forming.
- warmth: glass boils the sea, black-water ignites, quick-metal fumes, scars forget, coral bleaches.
- dust: wind-clay carves several times faster, night-sand turns to silt, rust and spores ride the wind.

Check them with `npm run atlas -- validate` and `npm run atlas -- stability [dir] [ticks] [id prefix] [--phases]`.
