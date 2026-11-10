# Design

Source: the SALLOW gameplay GUI (five screens, 390x844 portrait, linked in a straight chain).

## Tokens

| Token | Value | Use |
|---|---|---|
| bg | #17140c | Page background, ink on primary buttons |
| panel / raised | #231f12 / #2e2a18 | Slots, selected slots |
| line / line-dim | #6f6535 / #3d3822 | Borders, empty slots |
| ink / ink-bright / ink-muted / ink-off | #e9dd9a / #f6f0c8 / #b3a868 / #8a7f4e | Text, headings, labels, disabled |
| gold | #c9bb62 | Land, mid-tone fills, primary buttons |
| glow | #bfeedd | Light, selection, anything the player's light touches |
| UI font | Pixelify Sans 400/600 | Labels, numbers, buttons |
| Voice font | IM Fell English, italic for narration | Names, chronicle, narration lines |

Tokens live in `src/ui/tokens.css` as CSS custom properties. Fonts are self-hosted in `public/fonts` (SIL OFL).

Rules:

- Square corners everywhere except the round HOLD button.
- Touch targets at least 44 px; primary buttons 52 to 60 px tall.
- Pixel art uses crisp edges; glows and orbits are smooth.
- Glow colour is reserved for Light, selection and anything the player's light touches.

## Screens

Bedroom -> The Box -> Dive -> Solar system -> Planet.

1. **Bedroom.** LIGHT pips (8) top left, BOX nn/25 top right, top-down pixel room with kid, PC and Mote, one narration line, OPEN THE BOX, hints. Tap the floor to walk; Mote follows.
2. **The Box.** ROOM back chip, title, count; Mote card (Mote never goes in the box); 5x5 slot grid with a glyph per universe; detail for the selected universe: name, serial like No. 3F9A-77, law tags, three stats (worlds tended, deepest fold, light from glow); ENTER and WORLDS n.
3. **Dive.** Full-bleed fractal of nested rings (each ring holds 1 centre child and 6 around it); SURFACE chip; LIGHT pips; FOLD counter with depth bar and best marker; narration line; RELIQUARIES (3); large round HOLD. Hold to fall, let go to hover, tap a flicker to throw a reliquary, let go near a star to stop.
4. **Solar system.** DIVE chip, system name, universe and fold; star with up to 4 orbits; selected planet card with placed pieces and one line about the surface; WATCH THE SURFACE; SKY PIECES tray of six tiles with counts (Comet, Moon, Belt, Sun, Rings, Dust). Drag a piece onto an orbit.
5. **Planet.** SKY chip, planet name, age and year; pixel surface map; THEIR SKY strip; three stats (souls, villages, glow to your light); THEIR CHRONICLE, newest first; pause, 1x, 3x; CHANGE THEIR SKY. **Watch only.**

The rule on screen 5, "You only watch here. To change them, change their sky", is the whole interaction model: the player never edits a surface directly. That keeps the sky-to-surface table small and legible.

| Screen | State it needs | Units that own it |
|---|---|---|
| Bedroom | Light (8 pips), Box count | render/room, ui/room-box, game/light |
| The Box | Collected universes, per-universe stats | game/box, gen/universe, gen/names, ui/room-box |
| Dive | Fold depth and best, Light, 3 reliquaries | game/dive, gen/fold, render/dive, ui/dive-hud |
| Solar system | Star, orbits, planets, piece inventory | game/sky, gen/system, render/system, ui/system-planet |
| Planet | Surface sim, civ, chronicle, clock | sim/sand, sim/civ, sim/chronicle, render/planet |

## Open decisions (placeholder answers in the contracts)

- **What a flicker is.** Assumed: a catchable universe; a reliquary throw puts its serial in an empty Box slot (`FlickerRef.serialNumber`, `Dive.throwAt`).
- **How Light works at the edges.** Assumed: drains per fold fallen, not per second; at zero the dive surfaces (`Light.drainFolds`). Income from planet glow.
- **Where sky pieces come from.** Undecided. `SkyGame.grant` exists so either dives or glow can award them; the stub starts with Comet 2, Moon 2, Belt 1, Rings 1, Sun 0, Dust 0, matching the mock.
- **Budgets.** 236x200 grid (twice the mock's 118x100), 20 ticks/s, 350 KB gzipped JS are starting numbers, not measured ones.
