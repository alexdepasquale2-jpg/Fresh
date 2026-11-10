# src/game/town: the neighbourhood

The world model of the town screen (`src/ui/town`) and the Street hub page (`src/app/plugins/town.ts`).
Pure logic over data tables, no DOM. One shared instance: `town()` from `index.ts`.

- `types.ts` every shared type (`Cond`, `Reward`, `NpcDef`, `QuestDef`, `ItemDef`, `PlaceDef`, `GateDef`, `TownState`, `Scene`, ...)
- `map.ts` the 160x160 map from a fixed seed: tiles, `DISTRICTS`, `GATES`, `PLACES`, reachability
- `npcs.ts` `NPCS`: roster, where each stands per phase, lines
- `quests.ts` `QUESTS`: quest data. The state machine is in `index.ts`
- `items.ts` `ITEMS`, `SHOPS`, `COLLECT` (collectibles scattered by seed)
- `encounters.ts` `ENCOUNTERS`: ladder rivals placed in the world (by index into `ctx.battles.rivals()`)
- `state.ts` the save (`localStorage['sallow-town']`, owned here), reducers, `migrate`, time and weather
- `index.ts` the factory: conditions, rewards, quests, actors, A*, scenes

Real game state reaches the town only as `Facts` (built in `src/ui/town/facts.ts` from `ctx`), and rewards
leave only through `TownDeps` (`grantSky`, `addGlow`, `addUniverse`).

## Adding content

Drop a file into `quests/`, `npcs/`, `items/`, `places/` or `encounters/`. `index.ts` loads every `*.ts`
there with `import.meta.glob(..., { eager: true })`; the file registers itself by pushing onto a table.
Nothing else needs editing. Ids must be unique. Tile coordinates are `[x, y]`, 0..159.

### A quest (`quests/kite.ts`)

```ts
import { QUESTS } from '../quests';
QUESTS.push({
  id: 'kite', name: 'The Kite', thread: 'side', giver: 'nell',
  needs: { quest: ['skim', 'done'] },                  // offered only once this holds
  offer: 'My kite came down on the hill. Fetch it?', accept: 'By the bench.',
  steps: [
    { hint: 'Look by the bench on Mast Hill.', on: { type: 'reach', at: [30, 25], r: 1, say: 'A kite, string cut clean.' }, give: { items: [['kite', 1]] } },
    { hint: 'Bring it to Nell.', on: { type: 'talk', npc: 'nell', say: 'Cut, not snapped. Hm.' }, give: { take: [['kite', 1]] } },
  ],
  reward: { coins: 5, sky: [['comet', 1]] }, end: 'Nell has her kite.',
});
```

Step triggers: `talk` (optional `need`, `wait` text, `choices`: a choice whose `set` includes `'pass'` advances),
`reach` (optional `need`, e.g. `{ phase: 'night' }`; add `actor` to show a creature there for follow quests),
`cond` (any `Cond`: `fact` reads the real game, e.g. `['deepest', '>=', 20]`, `['era', '>=', 3]`, `['count', '>=', 3]`, `['wins', '>=', 1]`),
`wait` (`days`). Rewards: `coins`, `items`, `take`, `sky`, `glow`, `universe` (a label; seeded), `flags`.

### An NPC (`npcs/mara.ts`)

```ts
import { NPCS } from '../npcs';
NPCS.push({
  id: 'mara', name: 'Mara Finch', kid: true, about: 'Counts the trains that do not come.',
  look: { hair: 0, top: 13, legs: 2 },                 // palette indices (see src/ui/town/sprites.ts PAL)
  at: { day: [126, 79], dusk: [126, 79] },             // missing phase = not about
  lines: [
    { text: 'None today. That makes none.' },
    { when: { phase: 'dusk' }, text: 'One is due. It is always due.' },
    { when: { fact: ['deepest', '>=', 10] }, text: 'You have been {deepest} folds down. Did you hear it there too?' },
    { text: 'Do you wait for it?', choices: [{ text: 'Yes.', say: 'Good.', set: ['mara-waits'] }, { text: 'No.', say: 'It notices.' }] },
    { when: { flag: 'mara-waits' }, text: 'You said you wait too. I kept you a place.' },
  ],
});
```

Heaviest matching `weight` wins; equal lines rotate. `once` says a line a single time. `shop: '<shop id>'` makes them a shopkeeper.

### An item, a shop line, a collectible (`items/kite.ts`)

```ts
import { ITEMS, SHOPS, COLLECT } from '../items';
ITEMS.push({ id: 'kite', name: 'Kite', desc: 'Paper and two sticks.', kind: 'thing' });
SHOPS.find((s) => s.id === 'sull')!.stock.push({ item: 'kite', price: 4, limit: 1 } as never); // or push a whole new ShopDef
COLLECT.push({ id: 'acorn', name: 'Acorns', one: 'an acorn', count: 8, item: 'feather', districts: ['woods'], reward: { coins: 8 }, says: 'Eight acorns.' });
```

`kind: 'food'` items can be eaten from the bag for `value` glow. A new collectible kind draws with the default glint.

### A place (`places/well.ts`)

```ts
import { PLACES, GATES } from '../map';
import { T } from '../types';
PLACES.push({ id: 'well', name: 'The dry well', at: [20, 30], hidden: true,
  build: (b) => { b.rect(19, 29, 3, 3, T.GRAVEL); b.set(20, 29, T.ROCK); } });
PLACES.push({ id: 'sign-well', name: 'Sign', at: [22, 31], sign: 'DRY SINCE 1931.' });
GATES.push({ id: 'well-gate', at: [20, 32], open: { has: 'torch' }, shut: 'Boarded over.' });
```

`stop: true` makes a bus stop (fast travel once found), `bench: true` a bench, `skim: true` a skimming spot
(water within 5 tiles of it starts the game). `build` runs after the base map, before reachability and scatter.

## Save

`localStorage['sallow-town']`, `TownState` v2 (`state.ts`): position, minutes, coins, bag, quests, flags (NPC memory),
talks, found, seen cells, places, districts, bought, run, fromTown, skim, stats, log. `migrate()` accepts any older shape.
