# Units

28 independent units. Each owns exactly one directory, implements one contract, and builds against the stubs of every other unit. The registry that wires them is `src/app/registry.ts`.

| # | Directory | Contract | Scope | Test file |
|---|---|---|---|---|
| 01 | `src/gen/universe` | `src/contracts/universe.ts` (`UniverseGenFactory`) | UniverseSpec from a seed: law set from the atlas, palette, glyph, serial. | `src/gen/universe/index.test.ts` |
| 02 | `src/gen/names` | `src/contracts/universe.ts` (`NameGenFactory`) | Grammar for universe, system, planet, village and age names in the voice of Ossuary Minor, Pallid Choir, Tallow, Saltmere, Age of Tides. | `src/gen/names/index.test.ts` |
| 03 | `src/gen/fold` | `src/contracts/fold.ts` (`FoldGenFactory`) | childrenOf: which children hold stars or flickers, density by depth; depth 10,000 must cost the same as depth 1. | `src/gen/fold/index.test.ts` |
| 04 | `src/gen/system` | `src/contracts/system.ts` (`SystemGenFactory`) | Star, 1 to 4 orbits and planets from a StarRef. | `src/gen/system/index.test.ts` |
| 05 | `src/gen/planet` | `src/contracts/system.ts` (`PlanetGenFactory`) | Continents, seas, biomes and starting village sites on the grid. | `src/gen/planet/index.test.ts` |
| 06 | `atlas/lawsets` | `src/contracts/atlas.ts` (`AtlasLawsetsModule`) | At least 8 hand-written law sets such as Cold fire and Slow time (materials plus reactions), all passing validation. | `atlas/lawsets/index.test.ts` |
| 07 | `src/rules/sky` | `src/contracts/sky.ts` (`SkyRulesFactory`) | The sky-to-surface table: each piece and pairwise combination to modifiers (tides, night light, impacts, seasons, dimming). Under 40 rules, each one a player could guess. | `src/rules/sky/index.test.ts` |
| 08 | `tools/atlas` | `src/contracts/units.ts` (`AtlasToolModule`) | Node CLI for the PC only: validate, stability-test (reject dead or exploding worlds after N ticks), score, emit; a plug-in point for Lenia or ALife search results. | `tools/atlas/index.test.ts` |
| 09 | `src/sim/sand` | `src/contracts/sim.ts` (`SurfaceSimFactory`) | Chunked falling-sand kernel in the Worker, driven by the material and reaction tables, stepping dirty chunks only. | `src/sim/sand/index.test.ts` |
| 10 | `src/sim/civ` | `src/contracts/sim.ts` (`CivFactory`) | Villages found, grow, split and die on the grid; souls; glow output. | `src/sim/civ/index.test.ts` |
| 11 | `src/sim/chronicle` | `src/contracts/sim.ts` (`ChronicleFactory`) | Event-first log, reasons back-filled from sky state and earlier events, grammar text. | `src/sim/chronicle/index.test.ts` |
| 12 | `src/sim/timebase` | `src/contracts/time.ts` (`TimebaseFactory`) | Clock and the Kuramoto Pulse. | `src/sim/timebase/index.test.ts` |
| 13 | `src/render/dive` | `src/contracts/render.ts` (`DiveRendererFactory`) | Nested-ring fractal, zoom that re-roots at every fold, vignette tied to Light, star and flicker markers. | `src/render/dive/index.test.ts` |
| 14 | `src/render/system` | `src/contracts/render.ts` (`SystemRendererFactory`) | Star, orbits, planets, placed pieces, drag ghost, drop highlight. | `src/render/system/index.test.ts` |
| 15 | `src/render/planet` | `src/contracts/render.ts` (`PlanetRendererFactory`) | Palette-indexed surface from the sim grid, bonfires, dirty-chunk texture upload. | `src/render/planet/index.test.ts` |
| 16 | `src/render/room` | `src/contracts/render.ts` (`RoomRendererFactory`) | Bedroom tiles, kid sprite, Mote following with easing, PC glow. | `src/render/room/index.test.ts` |
| 17 | `src/game/light` | `src/contracts/game.ts` (`LightFactory`) | The 8-pip economy. | `src/game/light/index.test.ts` |
| 18 | `src/game/box` | `src/contracts/game.ts` (`BoxFactory`) | 25 slots, selection, stats. | `src/game/box/index.test.ts` |
| 19 | `src/game/dive` | `src/contracts/game.ts` (`DiveFactory`) | Hold, hover and stop state machine; fold counter and best; reliquary throws; capture into the Box. | `src/game/dive/index.test.ts` |
| 20 | `src/game/sky` | `src/contracts/sky.ts` (`SkyGameFactory`) | Piece inventory, placement validation, SkyState updates. | `src/game/sky/index.test.ts` |
| 21 | `src/ui/room-box` | `src/contracts/app.ts` (`ScreenFactory (bedroom, box)`) | Bedroom and Box screens. | `src/ui/room-box/index.test.ts` |
| 22 | `src/ui/dive-hud` | `src/contracts/app.ts` (`ScreenFactory (dive)`) | Dive HUD. | `src/ui/dive-hud/index.test.ts` |
| 23 | `src/ui/system-planet` | `src/contracts/app.ts` (`ScreenFactory (system, planet)`) | Solar system and Planet screens. | `src/ui/system-planet/index.test.ts` |
| 24 | `src/platform/save` | `src/contracts/platform.ts` (`SaveStoreFactory`) | IndexedDB save and load, migrations, share-code import and export. | `src/platform/save/index.test.ts` |
| 25 | `src/platform/audio` | `src/contracts/platform.ts` (`AudioFactory`) | WebAudio synth voices locked to the Pulse; no audio files; unlock on first gesture. | `src/platform/audio/index.test.ts` |
| 26 | `src/platform/input` | `src/contracts/platform.ts` (`InputFactory`) | Pointer gestures behind the Input contract. | `src/platform/input/index.test.ts` |
| 27 | `src/platform/edge-voice` | `src/contracts/platform.ts` (`EdgeVoiceFactory`) | Optional adapter, cache by seed, grammar fallback; off by default. | `src/platform/edge-voice/index.test.ts` |
| 28 | `src/platform/perf` | `src/contracts/platform.ts` (`PerfFactory`) | Frame-time monitor, resolution scaling, sim tick shedding. | `src/platform/perf/index.test.ts` |

Merge order for integration: gen (1 to 5), rules and atlas (6 to 8), sim (9 to 12), game (17 to 20), platform (24 to 28), render (13 to 16), ui (21 to 23).
