// Battles on the bedroom layer (game/battle). Pure and seeded: the same state and
// action always give the same next state. A ladder of rivals in four tiers, creature
// growth (levels, forms, learned skills), field weather, combos and chains, held relics.
import type { BattlesFactory, Fighter, Rival, BattleState, BattleAction, BattleLogLine, Element, Skill, Trait, Status, StatusKind, Hit, Relic, Weather, WeatherInfo, LevelInfo, Growth, BattleReward } from '@/contracts/battle';
import type { UniverseSpec } from '@/contracts/universe';
import type { UniverseStats } from '@/contracts/game';
import type { SerialNumber } from '@/contracts/seed';
import { SKY_PIECE_KINDS } from '@/contracts/sky';
import { child, rng, hashString } from '@/core/hash';

type M<T> = { -readonly [K in keyof T]: T[K] };
type F = M<Omit<Fighter, 'status' | 'spent'>> & { status: M<Status>; spent: string[] };
type Side = 'you' | 'them';

const ELEMENT_OF: Record<string, Element> = {
  'first-light': 'void', 'cold-fire': 'cold', 'slow-time': 'void', 'salt-tide': 'tide',
  'tallow-bloom': 'bloom', 'glass-rain': 'fire', 'ash-choir': 'fire', 'pale-moss': 'bloom',
};
// Each element beats the next: fire > bloom > stone > tide > cold > fire. Void is even with all.
const CYCLE: Element[] = ['fire', 'bloom', 'stone', 'tide', 'cold'];
const advantage = (a: Element, b: Element): number => {
  if (a === 'void' || b === 'void') return 1;
  const i = CYCLE.indexOf(a), j = CYCLE.indexOf(b);
  if ((i + 1) % 5 === j) return 1.5;
  if ((j + 1) % 5 === i) return 0.67;
  return 1;
};

/** A skill as data: what it does when cast. Strike, Fold, Shine, Alignment and each element's first skill have their own lines below. */
interface Def extends Skill {
  pow?: number; stat?: 'might' | 'depth' | 'radiance';
  burn?: number; chill?: number; expose?: number;
  ward?: number; regen?: number; shield?: number; heal?: number; cleanse?: boolean; strip?: boolean;
  gain?: number; drain?: number; quick?: boolean; pierce?: boolean; selfBurn?: number; hpCost?: number; leech?: number;
  fin?: StatusKind; finSelf?: boolean; line?: string;
}
const STRIKE: Def = { id: 'strike', name: 'Strike', cost: 0, kind: 'HARM', desc: 'A plain blow by Might. Gathers 1 extra Light. Shatters the chilled for half again.' };
const FOLD: Def = { id: 'fold', name: 'Fold', cost: 2, kind: 'HARM', desc: 'Strikes from inside, by Depth. Can crit; always crits the exposed.' };
const SHINE: Def = { id: 'shine', name: 'Shine', cost: 2, kind: 'MEND', desc: 'Heals by Radiance, wards for 2 turns, clears burn and chill.' };
const ALIGN: Def = { id: 'align', name: 'Alignment', cost: 5, kind: 'FINISHER', desc: 'Everything in one line: a huge blow that empties their Light.' };
const LEARN = [1, 2, 3, 5, 7, 10];
// Six skills an element, learned at levels 1, 2, 3, 5, 7 and 10.
const ELEMENT_SKILLS: Record<Element, Def[]> = {
  fire: [
    { id: 'kindle', name: 'Kindle', cost: 2, kind: 'BURN', desc: 'Burns for 3 turns. Shatters the chilled for half again.' },
    { id: 'cinder', name: 'Cinder', cost: 1, kind: 'BURN', pow: 0.5, burn: 2, gain: 1, desc: 'A small blow that burns for 2 turns and hands you 1 Light back.', line: '{me} flicks a cinder at {foe} for {n}. It catches.' },
    { id: 'flashover', name: 'Flashover', cost: 2, kind: 'TEMPO', pow: 0.8, quick: true, desc: 'Always moves first.', line: '{me} goes up all at once, before {foe} can move. {n}.' },
    { id: 'stoke', name: 'Stoke', cost: 0, kind: 'LIGHT', gain: 2, hpCost: 0.08, desc: 'Burn a little of yourself for 2 Light.', line: '{me} feeds itself to its own fire and gathers Light.' },
    { id: 'backdraft', name: 'Backdraft', cost: 3, kind: 'FINISHER', pow: 1, fin: 'burn', desc: 'Finisher: double on the burning, and puts the burn out.', line: '{me} pulls the air out of {foe} for {n}.' },
    { id: 'pyre', name: 'Pyre', cost: 4, kind: 'BURN', pow: 1.5, burn: 4, selfBurn: 2, desc: 'A great blow that burns for 4 turns. You burn for 2 as well.', line: '{me} makes a pyre of {foe} for {n}. Both of them burn.' },
  ],
  cold: [
    { id: 'rime', name: 'Rime', cost: 2, kind: 'CHILL', desc: 'Chills for 2 turns: slower and weaker. Quenches the burning for half again.' },
    { id: 'hoarfrost', name: 'Hoarfrost', cost: 1, kind: 'SHIELD', shield: 0.22, desc: 'A shell of ice that soaks harm worth a fifth of your life.', line: '{me} grows a shell of ice.' },
    { id: 'sleet', name: 'Sleet', cost: 2, kind: 'LIGHT', pow: 0.6, drain: 1, desc: 'A light blow that puts out 1 of their Light.', line: '{me} drives sleet into {foe} for {n}. A Light goes out.' },
    { id: 'hush', name: 'Hush', cost: 1, kind: 'CLEANSE', cleanse: true, ward: 2, gain: 1, desc: 'Clears everything on you, wards for 2 turns, +1 Light.', line: '{me} goes very quiet. Whatever was on it lets go.' },
    { id: 'shatter', name: 'Shatter', cost: 3, kind: 'FINISHER', pow: 1, fin: 'chill', desc: 'Finisher: double on the chilled, and ends the chill.', line: '{me} taps {foe} once for {n}.' },
    { id: 'winter', name: 'Long Winter', cost: 4, kind: 'CHILL', pow: 1.2, chill: 3, drain: 2, desc: 'A heavy blow, chills for 3 turns, puts out 2 of their Light.', line: '{me} brings the long winter down on {foe} for {n}.' },
  ],
  tide: [
    { id: 'undertow', name: 'Undertow', cost: 2, kind: 'HARM', desc: 'Hits hard and drinks a third back. Turns the burning to steam: exposed.' },
    { id: 'riptide', name: 'Riptide', cost: 2, kind: 'TEMPO', pow: 0.7, quick: true, expose: 1, desc: 'Always moves first. Leaves them exposed for the rest of the turn.', line: '{me} takes the legs from {foe} before it moves. {n}.' },
    { id: 'swell', name: 'Swell', cost: 2, kind: 'SHIELD', shield: 0.15, regen: 2, desc: 'A shield of water, and you mend for 2 turns.', line: '{me} rises behind a wall of water.' },
    { id: 'lowtide', name: 'Low Tide', cost: 1, kind: 'LIGHT', drain: 2, gain: 1, desc: 'Draws 2 Light out of them and keeps 1.', line: '{me} pulls the water back. The Light in {foe} goes with it.' },
    { id: 'wash', name: 'Wash', cost: 1, kind: 'CLEANSE', cleanse: true, heal: 1, desc: 'Clears everything on you and heals a little.', line: '{me} lets a wave go over it and comes up clean.' },
    { id: 'flood', name: 'Flood', cost: 4, kind: 'FINISHER', pow: 1.3, fin: 'expose', leech: 0.25, desc: 'Finisher: double on the exposed. Drinks a quarter back.', line: '{me} lets everything in on {foe} for {n}.' },
  ],
  stone: [
    { id: 'avalanche', name: 'Avalanche', cost: 2, kind: 'HARM', desc: 'The heaviest blow. Breaks straight through wards.' },
    { id: 'bulwark', name: 'Bulwark', cost: 1, kind: 'SHIELD', shield: 0.3, desc: 'A wall that soaks harm worth a third of your life.', line: '{me} stacks itself into a wall.' },
    { id: 'grit', name: 'Grit', cost: 2, kind: 'HARM', pow: 0.7, expose: 2, desc: 'A scouring blow. Leaves them exposed for 2 turns.', line: '{me} scours {foe} for {n}. It stands exposed.' },
    { id: 'quarry', name: 'Quarry', cost: 0, kind: 'LIGHT', gain: 2, ward: 1, desc: 'Dig in: 2 Light and a ward for the turn.', line: '{me} digs down into itself and finds Light.' },
    { id: 'tremor', name: 'Tremor', cost: 2, kind: 'TEMPO', pow: 0.6, quick: true, chill: 1, desc: 'Always moves first, and staggers them: chilled this turn.', line: '{me} shakes the ground under {foe} first. {n}.' },
    { id: 'landslide', name: 'Landslide', cost: 4, kind: 'FINISHER', pow: 1.3, fin: 'expose', pierce: true, desc: 'Finisher: double on the exposed, through any ward.', line: '{me} lets the whole hill go onto {foe}. {n}.' },
  ],
  bloom: [
    { id: 'overgrow', name: 'Overgrow', cost: 2, kind: 'MEND', desc: 'A light blow; you regrow for 3 turns. Feeds any fire already on them.' },
    { id: 'spore', name: 'Spore', cost: 1, kind: 'HARM', pow: 0.3, expose: 2, desc: 'A soft blow that leaves them exposed for 2 turns.', line: '{me} breathes spores into {foe} for {n}. It opens.' },
    { id: 'sap', name: 'Sap', cost: 2, kind: 'LIGHT', pow: 0.7, drain: 1, gain: 1, desc: 'Takes 1 Light from them and gives it to you.', line: '{me} puts a root in {foe} for {n} and drinks its Light.' },
    { id: 'canopy', name: 'Canopy', cost: 2, kind: 'CLEANSE', cleanse: true, shield: 0.15, desc: 'Clears everything on you and raises a shield of leaves.', line: '{me} closes its leaves over itself.' },
    { id: 'pollen', name: 'Pollen', cost: 0, kind: 'LIGHT', gain: 2, regen: 1, desc: '2 Light, and a turn of regrowth.', line: '{me} opens. The air fills with Light.' },
    { id: 'harvest', name: 'Harvest', cost: 3, kind: 'FINISHER', pow: 0.9, fin: 'regen', finSelf: true, leech: 0.5, desc: 'Finisher: double while you are regrowing (it ends). Heals half the harm.', line: '{me} gathers in what it grew from {foe}. {n}.' },
  ],
  void: [
    { id: 'unmake', name: 'Unmake', cost: 2, kind: 'HARM', desc: 'Leaves them exposed for 2 turns: every hit lands harder.' },
    { id: 'null', name: 'Null', cost: 1, kind: 'LIGHT', drain: 2, desc: 'Puts out 2 of their Light.', line: '{me} looks at {foe}. Two of its Lights were never lit.' },
    { id: 'gap', name: 'Gap', cost: 2, kind: 'TEMPO', pow: 1.2, stat: 'depth', quick: true, desc: 'Always moves first. Strikes by Depth.', line: '{me} is already behind {foe}. {n}.' },
    { id: 'veil', name: 'Veil', cost: 2, kind: 'SHIELD', shield: 0.2, ward: 1, desc: 'A shield of nothing, and a ward for the turn.', line: '{me} is less there than it was.' },
    { id: 'forget', name: 'Forget', cost: 1, kind: 'CLEANSE', cleanse: true, strip: true, desc: 'Clears everything on you, and their ward, shield and regrowth.', line: '{me} forgets what was done to it. {foe} forgets what it did.' },
    { id: 'collapse', name: 'Collapse', cost: 4, kind: 'FINISHER', pow: 1.1, fin: 'expose', desc: 'Finisher: double on the exposed.', line: '{me} closes around {foe}. {n}.' },
  ],
};
for (const list of Object.values(ELEMENT_SKILLS)) list.forEach((d, i) => { (d as { learnAt?: number }).learnAt = LEARN[i]; });
const DEFS: Record<string, Def> = Object.fromEntries([STRIKE, FOLD, SHINE, ALIGN, ...Object.values(ELEMENT_SKILLS).flat()].map((d) => [d.id, d]));
const FADE: Record<StatusKind, string> = { burn: 'the fire on {me} goes out', chill: '{me} thaws', ward: 'the ward on {me} fades', regen: '{me} stops regrowing', expose: '{me} closes up' };
const FIN_WORD: Record<StatusKind, string> = { burn: 'burning', chill: 'chilled', expose: 'exposed', regen: 'regrowing', ward: 'warded' };

const WEATHER: Record<Weather, WeatherInfo> = {
  heat: { id: 'heat', name: 'Heat', up: 'fire', down: 'cold', desc: 'The air shakes. Fire hits a third harder; cold a quarter softer.' },
  frost: { id: 'frost', name: 'Frost', up: 'cold', down: 'tide', desc: 'Everything is white. Cold hits a third harder; tide a quarter softer.' },
  tide: { id: 'tide', name: 'High water', up: 'tide', down: 'stone', desc: 'The floor is wet. Tide hits a third harder; stone a quarter softer.' },
  dust: { id: 'dust', name: 'Dust', up: 'stone', down: 'bloom', desc: 'Grit in the air. Stone hits a third harder; bloom a quarter softer.' },
  spring: { id: 'spring', name: 'Green rain', up: 'bloom', down: 'fire', desc: 'Warm rain. Bloom hits a third harder; fire a quarter softer.' },
  dark: { id: 'dark', name: 'Dark', up: 'void', down: null, desc: 'No light at all. Void hits a third harder.' },
};
const WEATHER_OF: Record<Element, Weather> = { fire: 'heat', cold: 'frost', tide: 'tide', stone: 'dust', bloom: 'spring', void: 'dark' };
const WEATHERS = Object.keys(WEATHER) as Weather[];

const RELICS: Relic[] = [
  { id: 'coal', name: 'Warm Coal', desc: 'Starts each fight with 1 more Light.' },
  { id: 'tooth', name: 'Milk Tooth', desc: 'A tenth more Might.' },
  { id: 'shell', name: 'Tide Shell', desc: 'Mends a little every turn.' },
  { id: 'button', name: 'Coat Button', desc: '4 more Guard.' },
  { id: 'feather', name: 'Grey Feather', desc: '4 more Speed.' },
  { id: 'key', name: 'Cellar Key', desc: 'Starts each fight behind a shield worth a fifth of its life.' },
  { id: 'marble', name: 'Glass Marble', desc: 'Hits a fifth harder on anything burning, chilled or exposed.' },
  { id: 'thread', name: 'Red Thread', desc: 'Chains count double.' },
  { id: 'moth', name: 'Pressed Moth', desc: 'Weather never blunts its blows.' },
  { id: 'wick', name: 'Lamp Wick', desc: 'Its burns and chills last a turn longer.' },
];
const MAX_LEVEL = 30;
const xpNeed = (l: number) => 10 + l * 8;
const levelOf = (xp0: number): LevelInfo => {
  let level = 1, xp = Math.max(0, Math.floor(xp0));
  while (level < MAX_LEVEL && xp >= xpNeed(level)) { xp -= xpNeed(level); level++; }
  return { level, into: level >= MAX_LEVEL ? 0 : xp, need: xpNeed(level) };
};
const xpForLevel = (l: number) => { let x = 0; for (let i = 1; i < l; i++) x += xpNeed(i); return x; };

const ELEMENT_TRAIT: Record<Element, Trait> = {
  fire: { id: 'smoulder', name: 'Smoulder', desc: 'Your burns last a turn longer.' },
  cold: { id: 'stillness', name: 'Stillness', desc: 'Your chills last a turn longer.' },
  tide: { id: 'ebb', name: 'Ebb', desc: 'Heals a little every turn.' },
  stone: { id: 'bedrock', name: 'Bedrock', desc: 'The first hit it takes is halved.' },
  bloom: { id: 'rooted', name: 'Rooted', desc: 'Heals a little every turn; regrowth lasts longer.' },
  void: { id: 'hollow', name: 'Hollow', desc: 'Its Strike ignores Guard.' },
};
const T = {
  thriving: { id: 'thriving', name: 'Thriving', desc: 'Its colony prospers: more life.' },
  awake: { id: 'awake', name: 'Awake', desc: 'Its people are enlightened: starts with 3 Light.' },
  reaching: { id: 'reaching', name: 'Reaching', desc: 'Its worlds are in orbit: faster, and Alignment costs 4.' },
  lamplit: { id: 'lamplit', name: 'Lamplit', desc: 'An age of lamps: heals a quarter more.' },
  legion: { id: 'legion', name: 'Legion', desc: 'A hundred souls: more Might.' },
  fused: { id: 'fused', name: 'Fused', desc: 'Two universes in one.' },
} satisfies Record<string, Trait>;
const lucky: Trait = { id: 'lucky', name: 'Lucky', desc: 'Its blows never land soft, and its Fold crits more often.' };
/** A universe's temperament gives its creature one passive and a manner. Ids start `t-`. */
const TEMPER: Record<string, { trait: Trait; enter: string; low: string; win: string }> = {
  placid: { trait: { id: 't-placid', name: 'Placid', desc: 'Burns bite it half as hard.' }, enter: '{me} settles where it is put.', low: '{me} does not seem to mind much.', win: '{me} sits down again.' },
  restless: { trait: { id: 't-restless', name: 'Restless', desc: '3 more Speed.' }, enter: '{me} will not keep still.', low: '{me} turns over and over.', win: '{me} is already looking for the next one.' },
  watchful: { trait: { id: 't-watchful', name: 'Watchful', desc: 'Guarding gathers 2 Light, not 1.' }, enter: '{me} counts them.', low: '{me} keeps counting.', win: '{me} watches them go.' },
  hungry: { trait: { id: 't-hungry', name: 'Hungry', desc: 'Its Strike drinks a fifth back.' }, enter: '{me} leans toward them.', low: '{me} is hungrier now.', win: '{me} is not full.' },
  shy: { trait: { id: 't-shy', name: 'Shy', desc: 'Starts behind a shield worth a tenth of its life.' }, enter: '{me} shows them less than it has.', low: '{me} dims and pulls in.', win: '{me} looks back at you, once.' },
  proud: { trait: { id: 't-proud', name: 'Proud', desc: 'Hits a tenth harder while above half its life.' }, enter: '{me} holds itself very straight.', low: '{me} will not look down.', win: '{me} expects to be remembered.' },
  mournful: { trait: { id: 't-mournful', name: 'Mournful', desc: 'Hits a sixth harder once one of its own has gone dark.' }, enter: '{me} hums something low.', low: '{me} hums lower.', win: '{me} keeps humming. It is not a glad tune.' },
  patient: { trait: { id: 't-patient', name: 'Patient', desc: 'Its guard soaks two thirds, not half.' }, enter: '{me} can wait longer than they can.', low: '{me} waits.', win: '{me} had all the time it needed.' },
  feral: { trait: { id: 't-feral', name: 'Feral', desc: 'Hits an eighth harder below half its life.' }, enter: '{me} bites at the edge of the lid.', low: '{me} shows what teeth it has.', win: '{me} does not let go at once.' },
  kind: { trait: { id: 't-kind', name: 'Kind', desc: 'Heals a fifth more.' }, enter: '{me} is gentle about it.', low: '{me} is still gentle. It costs more now.', win: '{me} gives something back.' },
  cold: { trait: { id: 't-cold', name: 'Cold', desc: '3 more Guard.' }, enter: '{me} does not warm to them.', low: 'Frost comes off {me} in a thin breath.', win: '{me} keeps its own counsel.' },
  dreaming: { trait: { id: 't-dreaming', name: 'Dreaming', desc: 'Its Fold crits more often.' }, enter: '{me} is asleep, mostly.', low: '{me} mutters in its sleep.', win: '{me} may only have dreamed it.' },
};
const RARITY_LIFT: Record<string, number> = { common: 0, uncommon: 3, rare: 6, epic: 10, mythic: 14 };
const pc = (n: number | undefined, cap = 25) => 1 + Math.max(-cap, Math.min(cap, n ?? 0)) / 100;
const DAILY: { name: string; where: string; taunt: string; beaten: string }[] = [
  { name: 'A kid off the morning train', where: 'by the ticket hall', taunt: 'I am only here today.', beaten: 'I have a train to catch anyway.' },
  { name: 'The milk-float boy', where: 'two streets over', taunt: 'I am early. So are you.', beaten: 'The bottles are all rattled now.' },
  { name: 'A girl with a borrowed box', where: 'on the church steps', taunt: 'It is not mine. Do not tell.', beaten: 'I have to give it back by dark.' },
  { name: 'Somebody under an umbrella', where: 'where the gutter runs', taunt: 'It only rains on me.', beaten: 'It has stopped. I should go.' },
  { name: 'The cousin who is visiting', where: 'in the front room', taunt: 'We do it differently at home.', beaten: 'We go back on Sunday.' },
  { name: 'A child nobody has seen before', where: 'at the edge of the lamplight', taunt: 'You will not see me tomorrow.', beaten: 'You will not see me tomorrow.' },
  { name: 'The knife-grinder’s girl', where: 'beside the cart', taunt: 'Mine are sharp today.', beaten: 'We move on in the morning.' },
];
const NO_STATUS: Status = { burn: 0, chill: 0, ward: 0, regen: 0, expose: 0 };
const KINDS = ['burn', 'chill', 'ward', 'regen', 'expose'] as const;

const EASE = [0.62, 1, 0.92, 1.28, 1.4, 0.8, 1.28, 0.82, 1.4, 0.84, 0.86, 0.86, 1.08, 1, 0.76, 0.6];
const TIERS = ['The street', 'The water', 'The dark houses', 'The lamp'];
type RivalSeed = Omit<Rival, 'id' | 'serials' | 'level'>;
const RIVALS: RivalSeed[] = [
  { name: 'The twins next door', where: 'over the garden fence', taunt: 'Ours are bigger.', again: 'We fed them since.', beaten: 'They were only little ones.', persona: 'bold', theme: 'bloom' },
  { name: 'A girl in the attic', where: 'up the folding ladder', taunt: 'I found mine in the walls.', again: 'There were more in the walls.', beaten: 'Put them back where they were.', persona: 'wary', theme: 'cold' },
  { name: 'The boy under the stairs', where: 'behind the coats', taunt: 'Mine bite.', again: 'I have not fed them since you came.', beaten: 'They never bit me.', persona: 'cruel', theme: 'fire' },
  { name: 'Wren of the weatherglass', where: 'on the roof, by the vane', taunt: 'I decide what the sky does.', again: 'It rained for you all week. That was me.', beaten: 'The glass has a crack in it now.', persona: 'sly', boss: 'weather', mechanic: 'Turns the weather every turn.' },
  { name: 'Someone in the garden shed', where: 'past the wet grass', taunt: 'Shut the door. They get out.', again: 'One got out. It came back bigger.', beaten: 'Leave the door. It does not matter now.', persona: 'sly', theme: 'bloom' },
  { name: 'A kid by the canal', where: 'down the towpath', taunt: 'Mine came out of the water.', again: 'The water gave me another.', beaten: 'It wants them back, you know.', persona: 'bold', theme: 'tide' },
  { name: 'The paper girl', where: 'at the end of her round', taunt: 'I see every house before it wakes.', again: 'Your light was on at four.', beaten: 'I will skip your door tomorrow.', persona: 'sly', theme: 'void' },
  { name: 'The child in the hall mirror', where: 'in the glass on the landing', taunt: 'Whatever you do, I did first.', again: 'You came back. So did I.', beaten: 'Do not look in here again.', persona: 'cruel', boss: 'mirror', mechanic: 'Gives you back your own last move. Repeat yourself and it comes back double.' },
  { name: 'The old man at the window', where: 'across the street', taunt: 'I had a box like yours once.', again: 'I remember more of it now.', beaten: 'Yes. That is how I lost mine.', persona: 'wary', theme: 'cold' },
  { name: 'The child in the cellar', where: 'down where it is cold', taunt: 'Mine are hungry.', again: 'They still are.', beaten: 'Now there is nothing down here but me.', persona: 'cruel', theme: 'void' },
  { name: 'The night-bus sisters', where: 'at the last stop', taunt: 'Last stop. Everyone off.', again: 'You missed your stop again.', beaten: 'We will walk home.', persona: 'bold', theme: 'tide' },
  { name: 'The seamstress', where: 'in the house with no door', taunt: 'I can make two of anything into one.', again: 'I unpicked them. I will sew them tighter.', beaten: 'The stitches are coming out.', persona: 'wary', boss: 'fuse', mechanic: 'Sews two of her own into one.' },
  { name: 'The choir on the hill', where: 'where the road stops', taunt: 'We only know one song.', again: 'We learned the second verse.', beaten: 'We have forgotten the words.', persona: 'wary', theme: 'bloom' },
  { name: "The lighthouse keeper's boy", where: 'a long way from any sea', taunt: 'I keep it lit so they can find you.', again: 'They found you. Did you notice?', beaten: 'It is dark now. Are you glad?', persona: 'sly', theme: 'fire' },
  { name: 'Whoever lives in the lamp', where: 'inside the streetlight', taunt: 'Whose box do you think you are in?', again: 'Look up.', beaten: 'The lamp is yours. Mind it.', persona: 'cruel', theme: 'void' },
  { name: 'The first owner of the Box', where: 'in your room, behind you', taunt: 'I left it on the shelf for you. I want it back.', again: 'It still smells of my hands.', beaten: 'Keep it, then. Leave it on a shelf, one day.', persona: 'cruel', boss: 'champion', mechanic: 'Fights in the dark with four, and wipes itself clean every third turn.' },
];

export const factory: BattlesFactory = ({ seed }) => {
  const rivals: Rival[] = RIVALS.map((r, id) => {
    const g = rng(child(seed, `rival-${id}`));
    const n = r.boss === 'champion' ? 4 : id < 2 ? 2 : 3;
    return { ...r, id, level: 1 + Math.floor(id * 0.6), tier: (id >> 2) + 1, tierName: TIERS[id >> 2]!, serials: Array.from({ length: n }, () => g.int(0x1000000)) };
  });
  const has = (f: Pick<Fighter, 'traits'>, id: string) => f.traits.some((t) => t.id === id);
  const holds = (f: Pick<Fighter, 'relic'>, id: string) => f.relic?.id === id;
  const costOf = (f: Pick<Fighter, 'traits'>, s: Skill) => (s.id === 'align' && has(f, 'reaching') ? 4 : s.cost);
  const skillsAt = (element: Element, level: number): Skill[] => [STRIKE, ...ELEMENT_SKILLS[element].filter((_, i) => level >= LEARN[i]!), FOLD, SHINE, ALIGN];

  const fighter = (spec: UniverseSpec, st: UniverseStats | undefined, slot: number): Fighter => {
    const souls = st?.souls ?? 0, era = st?.era ?? 0, enl = st?.enlightenment ?? 0, pros = st?.prosperity ?? 0, orb = st?.orbiters ?? 0;
    const element = ELEMENT_OF[spec.laws.id] ?? 'stone';
    const traits: Trait[] = [ELEMENT_TRAIT[element]];
    if (pros >= 60) traits.push(T.thriving);
    if (enl >= 100) traits.push(T.awake);
    if (orb >= 3) traits.push(T.reaching);
    if (era >= 3) traits.push(T.lamplit);
    if (souls >= 100) traits.push(T.legion);
    // The universe's own character: temperament gives a passive, modifiers lean the stats, rarity lifts them a little.
    const m = spec.modifiers ?? {};
    const rarity = spec.rarity;
    const temper = spec.temperament ? TEMPER[spec.temperament] : undefined;
    if (temper) traits.push(temper.trait);
    if ((m.luck ?? 0) >= 4) traits.push(lucky);
    const tr = (id: string) => traits.some((t) => t.id === id);
    const lift = 1 + (RARITY_LIFT[rarity ?? 'common'] ?? 0) / 100;
    const might = Math.round((8 + Math.floor(souls / 6) + era * 6 + (st?.worldsTended ?? 0)) * (tr('legion') ? 1.1 : 1) * pc(m.might) * lift);
    const depth = Math.round((4 + Math.floor((st?.deepestFold ?? 0) / 2)) * pc(m.depth));
    const radiance = Math.round((4 + Math.floor((st?.lightFromGlow ?? 0) / 40) + Math.floor(enl / 10) * 2) * pc((m.glow ?? 0) + Math.floor((m.faith ?? 0) / 2)));
    const maxHp = Math.round((30 + might * 2 + depth) * (tr('thriving') ? 1.15 : 1) * pc(Math.floor(((m.tide ?? 0) + (m.growth ?? 0)) / 2)));
    return {
      serialNumber: spec.serialNumber, name: spec.name, element, might, depth, radiance,
      guard: Math.max(0, Math.floor(pros / 8) + Math.round(Math.max(-12, Math.min(16, m.ward ?? 0)) / 4) + (tr('t-cold') ? 3 : 0)),
      speed: Math.max(1, 5 + orb * 2 + Math.floor(depth / 6) + (tr('reaching') ? 4 : 0) + Math.round(Math.max(-12, Math.min(12, m.tempo ?? 0)) / 4) + (tr('t-restless') ? 3 : 0)),
      maxHp, hp: maxHp, energy: tr('awake') ? 3 : 1, status: NO_STATUS,
      skills: skillsAt(element, 1), traits, guarding: false, spent: [], slot, fused: false,
      level: 1, form: 1, shield: tr('t-shy') ? Math.round(maxHp * 0.1) : 0,
      ...(rarity ? { rarity } : {}), ...(spec.temperament ? { temperament: spec.temperament } : {}),
    };
  };

  /** A base fighter after its growth. Each level adds a little flat and a little of itself. */
  const grow = (base: Fighter, growth: Growth): Fighter => {
    const { level } = levelOf(growth.xp);
    const relic = RELICS.find((r) => r.id === growth.relic);
    const bond = Math.max(0, Math.min(100, Math.floor(growth.bond ?? 0)));
    const near = 1 + bond * 0.0006; // a kin universe (100) is 6% more of everything
    const up = (v: number, flat: number) => Math.round((v + (level - 1) * flat) * (1 + 0.06 * (level - 1)) * near);
    const might = Math.round(up(base.might, 1.5) * (relic?.id === 'tooth' ? 1.1 : 1));
    const depth = up(base.depth, 0.7), radiance = up(base.radiance, 0.7);
    const maxHp = Math.round((base.maxHp + (level - 1) * 5) * (1 + 0.06 * (level - 1)) * near);
    return {
      ...base, ...(growth.bond !== undefined ? { bond } : {}), might, depth, radiance, maxHp, hp: maxHp, level, form: level >= 9 ? 3 : level >= 4 ? 2 : 1, ...(relic ? { relic } : {}),
      guard: base.guard + Math.floor(level / 4) + (relic?.id === 'button' ? 4 : 0),
      speed: base.speed + Math.floor(level / 3) + (relic?.id === 'feather' ? 4 : 0),
      energy: Math.min(6, base.energy + (relic?.id === 'coal' ? 1 : 0)),
      shield: Math.round(maxHp * ((relic?.id === 'key' ? 0.2 : 0) + (has(base, 't-shy') ? 0.1 : 0))),
      skills: skillsAt(base.element, level),
    };
  };

  const copy = (f: Fighter): F => ({ ...f, status: { ...f.status }, spent: [...f.spent], skills: f.skills, traits: f.traits });
  const alive = (fs: readonly Fighter[]) => fs.findIndex((f) => f.hp > 0);
  const spd = (f: Fighter) => f.speed - (f.status.chill > 0 ? 5 : 0);

  /** The rival decides its next move from what it can see. */
  type PlanIn = Pick<BattleState, 'rival' | 'mine' | 'theirs' | 'myActive' | 'theirActive' | 'turn' | 'last' | 'theirFused'>;
  const plan = (st: PlanIn): BattleState['intent'] => {
    const me = st.theirs[st.theirActive]!, foe = st.mine[st.myActive]!;
    const g = rng(child(child(seed, `plan-${st.rival.id}-${st.rival.rematch ?? 0}`), st.turn));
    const R = st.rival;
    const skill = (s: Skill, hint: string): BattleState['intent'] => ({ action: { type: 'skill', id: s.id }, label: `${s.name}${hint ? ` (${hint})` : ''}` });
    if (R.boss === 'fuse' && !st.theirFused && st.turn >= 1) {
      const t = st.theirs.findIndex((f, i) => i !== st.theirActive && f.hp > 0);
      if (t >= 0) return { action: { type: 'fuse', target: t }, label: `Sew ${me.name} to ${st.theirs[t]!.name}` };
    }
    const mirrored = R.boss === 'mirror' && st.last?.you ? DEFS[st.last.you] : undefined;
    if (mirrored) return skill(mirrored, 'your own move');
    if (me.energy >= costOf(me, ALIGN)) return skill(ALIGN, 'a huge blow');
    const afford = me.skills.filter((s) => s.id !== 'strike' && s.id !== 'align' && me.energy >= costOf(me, s)).map((s) => DEFS[s.id]!);
    const wary = R.persona === 'wary';
    if (me.hp < me.maxHp * (wary ? 0.5 : 0.35) && me.status.ward === 0 && (me.shield ?? 0) === 0) {
      const mend = afford.filter((k) => k.id === 'shine' || k.shield || k.heal);
      if (mend.length && g.chance(7, 10)) return skill(g.pick(mend), 'mend');
    }
    const better = st.theirs.findIndex((f, i) => i !== st.theirActive && f.hp > 0 && advantage(f.element, foe.element) > 1);
    if (advantage(me.element, foe.element) < 1 && better >= 0 && g.chance(2, 5)) return { action: { type: 'swap', target: better }, label: `Swap to ${st.theirs[better]!.name}` };
    if (foe.energy >= 4 && R.persona !== 'bold' && g.chance(wary ? 3 : 2, 5)) return { action: { type: 'guard' }, label: 'Guard' };
    const fin = afford.find((k) => k.fin && (k.finSelf ? me : foe).status[k.fin] > 0);
    if (fin) return skill(fin, 'finisher');
    const harm = afford.filter((k) => k.pow || ['kindle', 'rime', 'undertow', 'avalanche', 'overgrow', 'unmake', 'fold'].includes(k.id));
    if (harm.length && g.chance(R.persona === 'bold' ? 16 : 13, 20)) {
      const tricks = afford.filter((k) => k.drain || k.expose || k.chill || k.burn || k.kind === 'BURN' || k.kind === 'CHILL');
      const pick = R.persona === 'sly' && tricks.length ? g.pick(tricks)
        : R.persona === 'cruel' ? harm.reduce((a, b) => (costOf(me, b) > costOf(me, a) ? b : a))
          : me.depth > me.might && g.chance(1, 2) ? FOLD : g.pick(harm);
      return skill(pick, (pick.kind ?? 'harm').toLowerCase());
    }
    if (me.energy <= 1 && me.energy < 6) { const light = me.skills.map((s) => DEFS[s.id]!).find((k) => k.cost === 0 && k.gain); if (light && g.chance(1, 2)) return skill(light, 'gathers Light'); }
    return skill(STRIKE, '');
  };

  const act = (st0: BattleState, action: BattleAction): BattleState => {
    const mine = st0.mine.map(copy), theirs = st0.theirs.map(copy);
    let myActive = st0.myActive, theirActive = st0.theirActive, fusedUsed = st0.fusedUsed, theirFused = !!st0.theirFused;
    let outcome: BattleState['outcome'] = 'ongoing';
    let weather = st0.weather;
    const chain = { you: st0.chain?.you ?? 0, them: st0.chain?.them ?? 0 };
    const last = { you: st0.last?.you ?? '', them: st0.last?.them ?? '' };
    const tally = { dealt: st0.tally?.dealt ?? 0, taken: st0.tally?.taken ?? 0, combos: st0.tally?.combos ?? 0 };
    const log: BattleLogLine[] = [];
    const hits: Hit[] = [];
    const R = st0.rival;
    const g = rng(child(child(seed, `battle-${R.id}-${R.rematch ?? 0}`), st0.turn));
    const team = (side: Side) => (side === 'you' ? mine : theirs);
    const activeOf = (side: Side) => team(side)[side === 'you' ? myActive : theirActive]!;
    const other = (side: Side): Side => (side === 'you' ? 'them' : 'you');
    const world = (text: string) => log.push({ side: 'world', text });

    const hurt = (side: Side, a: F, d: F, base: number, o: { pierce?: boolean; noGuard?: boolean; crit?: boolean; tag?: string } = {}) => {
      const adv = advantage(a.element, d.element);
      let dmg = base * (side === 'them' ? boost : 1) * adv * ((has(a, 'lucky') ? 98 : 90) + g.int(has(a, 'lucky') ? 13 : 21)) / 100;
      if (has(a, 't-proud') && a.hp * 2 > a.maxHp) dmg *= 1.1;
      if (has(a, 't-feral') && a.hp * 2 < a.maxHp) dmg *= 1.125;
      if (has(a, 't-mournful') && team(side).some((f) => f.hp <= 0)) dmg *= 1.17;
      const w = weather ? WEATHER[weather] : undefined;
      if (w && a.element === w.up) dmg *= 1.33;
      if (w && a.element === w.down && !holds(a, 'moth')) dmg *= 0.75;
      dmg *= 1 + chain[side] * (holds(a, 'thread') ? 0.2 : 0.1);
      if (holds(a, 'marble') && (d.status.burn > 0 || d.status.chill > 0 || d.status.expose > 0)) dmg *= 1.2;
      if (a.status.chill > 0) dmg *= 0.75;
      if (d.status.expose > 0) dmg *= 1.4;
      if (d.status.ward > 0 && !o.pierce) dmg *= 0.5;
      if (d.guarding) dmg *= has(d, 't-patient') ? 0.34 : 0.5;
      if (has(d, 'bedrock') && !d.spent.includes('bedrock')) { dmg *= 0.5; d.spent.push('bedrock'); }
      if (!o.noGuard) dmg -= d.guard / 4;
      const n = Math.max(1, Math.round(dmg));
      const soak = Math.min(d.shield ?? 0, n);
      d.shield = (d.shield ?? 0) - soak;
      d.hp = Math.max(0, d.hp - (n - soak));
      if (side === 'you') tally.dealt += n; else tally.taken += n;
      hits.push({ to: other(side), amount: n, crit: !!o.crit, heal: false, tag: o.tag ?? (soak >= n ? 'SHIELDED' : ''), ...(adv > 1 ? { eff: 'strong' as const } : adv < 1 ? { eff: 'weak' as const } : {}) });
      // Once a fight, a creature that is badly hurt shows its temperament.
      const tm = d.temperament ? TEMPER[d.temperament] : undefined;
      if (tm && d.hp > 0 && d.hp < d.maxHp * 0.35 && !d.spent.includes('low')) { d.spent.push('low'); lows.push(tm.low.replace('{me}', d.name)); }
      return n;
    };
    let ticking = false, boost = 1;
    const lows: string[] = [];
    const heal = (side: Side, f: F, amount: number, tag = '') => {
      const n = Math.max(0, Math.min(f.maxHp - f.hp, Math.round(amount * (has(f, 'lamplit') ? 1.25 : 1) * (has(f, 't-kind') ? 1.2 : 1))));
      f.hp += n;
      if (n > 0) hits.push({ to: side, amount: n, crit: false, heal: true, tag, ...(ticking ? { tick: true } : {}) });
      return n;
    };
    const light = (f: F, n: number) => { f.energy = Math.max(0, Math.min(6, f.energy + n)); };
    const combo = (side: Side, text: string) => { if (side === 'you') tally.combos++; world(text); };

    const perform = (side: Side, a0: BattleAction) => {
      if (outcome !== 'ongoing') return;
      const say = (text: string) => log.push({ side, text });
      const us = team(side);
      let me = activeOf(side);
      if (me.hp <= 0) return;
      me.guarding = false;
      if (a0.type === 'guard') { me.guarding = true; light(me, has(me, 't-watchful') ? 2 : 1); chain[side] = 0; last[side] = ''; say(`${me.name} braces and gathers Light.`); return; }
      if (a0.type === 'swap') {
        const t = us[a0.target];
        if (!t || t.hp <= 0) return;
        if (side === 'you') myActive = a0.target; else theirActive = a0.target;
        chain[side] = 0; last[side] = '';
        say(`${t.name} steps forward.`);
        return;
      }
      if (a0.type === 'fuse') {
        const b = us[a0.target];
        const used = side === 'you' ? fusedUsed : theirFused || R.boss !== 'fuse';
        if (!b || b.hp <= 0 || b === me || used) return;
        const [w1, w2] = [me.name.split(' ')[0]!, b.name.split(' ').slice(-1)[0]!];
        const name = w1 === w2 ? `${w1} Twice` : `${w1} ${w2}`;
        const extra = b.skills.filter((s) => s.learnAt && !me.skills.some((x) => x.id === s.id)).slice(0, 2);
        const fusedF: F = {
          ...me, name, slot: -1, fused: true,
          might: Math.round((me.might + b.might) * 0.72), depth: Math.round((me.depth + b.depth) * 0.72), radiance: Math.round((me.radiance + b.radiance) * 0.72),
          guard: Math.max(me.guard, b.guard), speed: Math.max(me.speed, b.speed) + 1,
          maxHp: Math.round((me.maxHp + b.maxHp) * 0.82), hp: 0, energy: Math.min(6, me.energy + b.energy + 1),
          status: { ...NO_STATUS }, spent: [], shield: (me.shield ?? 0) + (b.shield ?? 0), level: Math.max(me.level ?? 1, b.level ?? 1), form: Math.max(me.form ?? 1, b.form ?? 1),
          skills: [me.skills[0]!, me.skills[1]!, ...extra, ...me.skills.slice(2)],
          traits: [...me.traits, ...b.traits.filter((t) => !me.traits.some((x) => x.id === t.id)), T.fused],
        };
        fusedF.hp = Math.min(fusedF.maxHp, me.hp + b.hp);
        const keep = us.filter((f) => f !== me && f !== b);
        us.length = 0;
        us.push(fusedF, ...keep);
        if (side === 'you') { myActive = 0; fusedUsed = true; } else { theirActive = 0; theirFused = true; }
        chain[side] = 0; last[side] = '';
        say(side === 'you' ? `${me.name} and ${b.name} fold into each other. ${name} opens its eyes.` : `${R.name} pulls a thread. ${me.name} and ${b.name} are one thing now: ${name}.`);
        hits.push({ to: side, amount: fusedF.hp, crit: true, heal: true, tag: 'FUSED' });
        return;
      }
      const mirror = side === 'them' && R.boss === 'mirror' && a0.id === st0.last?.you;
      const skill = me.skills.find((s) => s.id === a0.id) ?? (mirror ? DEFS[a0.id] : undefined) ?? STRIKE;
      const cost = mirror ? 0 : costOf(me, skill);
      const use = DEFS[me.energy >= cost ? skill.id : 'strike'] ?? STRIKE;
      me.energy -= me.energy >= cost ? cost : 0;
      const d = activeOf(other(side));
      const adv = advantage(me.element, d.element);
      const tail = adv > 1 ? ' It burns through.' : adv < 1 ? ' It barely lands.' : '';
      me = activeOf(side);
      const echo = mirror && action.type === 'skill' && action.id === a0.id;
      if (mirror) world(echo ? `You repeated yourself. The glass was ready: ${d.name} gets its own ${use.name} back, double.` : `The glass shows ${d.name} its own ${use.name}.`);
      boost = echo ? 2 : 1;
      // Chain: a different move from the one before hits harder, up to three in a row.
      if (last[side] && last[side] !== use.id) {
        chain[side] = Math.min(3, chain[side] + 1);
        combo(side, `Chain ${chain[side]}: ${me.name} did not repeat itself, so its blows land ${chain[side] * (holds(me, 'thread') ? 20 : 10)}% harder.`);
      } else if (last[side] === use.id && chain[side] > 0) { chain[side] = 0; world(`${me.name} repeats itself. The chain breaks.`); }
      last[side] = use.id;
      const longer = holds(me, 'wick') ? 1 : 0;
      switch (use.id) {
        case 'strike': {
          const sh = d.status.chill > 0;
          const n = hurt(side, me, d, me.might * (sh ? 1.5 : 1), { noGuard: has(me, 'hollow'), ...(sh ? { tag: 'SHATTER', crit: true } : {}) });
          light(me, 1);
          if (has(me, 't-hungry')) heal(side, me, n / 5);
          if (sh) { d.status.chill = 0; say(`${me.name} strikes ${d.name} for ${n}.`); combo(side, `Shatter: ${d.name} was chilled, and frozen things break when struck. Half again.`); }
          else say(`${me.name} strikes ${d.name} for ${n}.${tail}`);
          break;
        }
        case 'kindle': { const sh = d.status.chill > 0; const n = hurt(side, me, d, me.might * 0.9 * (sh ? 1.5 : 1), { tag: sh ? 'SHATTER' : 'BURN', crit: sh }); if (sh) d.status.chill = 0; d.status.burn = (has(me, 'smoulder') ? 4 : 3) + longer; say(sh ? `${me.name} sets the frost alight. ${d.name} shatters for ${n} and burns.` : `${me.name} kindles ${d.name} for ${n}. It burns.`); if (sh) combo(side, 'Shatter: fire on frost cracks it. Half again.'); break; }
        case 'rime': { const q = d.status.burn > 0; const n = hurt(side, me, d, me.might * 0.8 * (q ? 1.5 : 1), { tag: q ? 'QUENCH' : 'CHILL', crit: q }); if (q) d.status.burn = 0; d.status.chill = (has(me, 'stillness') ? 3 : 2) + longer; say(q ? `${me.name} quenches the fire in ${d.name} for ${n}. It goes still.` : `${me.name} rimes ${d.name} for ${n}. It slows.`); if (q) combo(side, 'Quench: cold on a burning thing cracks it. Half again.'); break; }
        case 'undertow': { const stm = d.status.burn > 0; const n = hurt(side, me, d, me.might * 1.1, { tag: stm ? 'STEAM' : '' }); heal(side, me, n / 3); if (stm) { d.status.burn = 0; d.status.expose = 2; } say(stm ? `${me.name} drags ${d.name} under for ${n}.` : `${me.name} drags ${d.name} under for ${n} and drinks.`); if (stm) combo(side, `Steam: water on a burning thing. The fire is out, and ${d.name} stands exposed.`); break; }
        case 'avalanche': { const broke = d.status.ward > 0, sh = d.status.chill > 0; const n = hurt(side, me, d, me.might * 1.3 * (sh ? 1.5 : 1), { pierce: true, tag: sh ? 'SHATTER' : broke ? 'BREAK' : '', crit: sh }); if (sh) d.status.chill = 0; say(`${me.name} comes down on ${d.name} for ${n}${broke ? ', straight through its ward' : ''}.${tail}`); if (sh) combo(side, `Shatter: ${d.name} was chilled, and frozen things break under weight. Half again.`); break; }
        case 'overgrow': { const wild = d.status.burn > 0; const n = hurt(side, me, d, me.might * 0.6, { tag: wild ? 'WILDFIRE' : '' }); me.status.regen = has(me, 'rooted') ? 4 : 3; if (wild) d.status.burn += 2; say(`${me.name} grows over ${d.name} for ${n} and takes root.`); if (wild) combo(side, `Wildfire: green things feed a fire. ${d.name} burns 2 turns longer.`); break; }
        case 'unmake': { const n = hurt(side, me, d, me.might, { tag: 'EXPOSE' }); d.status.expose = 2; say(`${me.name} unmakes part of ${d.name} for ${n}. It stands exposed.`); break; }
        case 'fold': { const open = d.status.expose > 0; const crit = open || g.int(100) < Math.round((me.depth * 100) / (me.depth + 30)) + (has(me, 't-dreaming') ? 15 : 0) + (has(me, 'lucky') ? 10 : 0); const n = hurt(side, me, d, me.depth * 1.5 * (crit ? 2 : 1), { crit, tag: crit ? 'CRIT' : '' }); say(crit ? `${me.name} folds and strikes from ${me.depth} layers down. ${n}!` : `${me.name} folds and strikes from inside for ${n}.`); if (open) combo(side, `Open wound: ${d.name} was exposed, so the fold could not miss. Double.`); break; }
        case 'shine': { const n = heal(side, me, me.radiance * 1.8 + 6, 'SHINE'); me.status.ward = 2; me.status.burn = 0; me.status.chill = 0; say(`${me.name} shines. Its worlds sing it whole (+${n}), and it is warded.`); break; }
        case 'align': { const n = hurt(side, me, d, (me.might + me.depth + me.radiance) * 0.85 + me.speed, { crit: true, tag: 'ALIGNMENT' }); d.energy = 0; say(`Every world in ${me.name} falls into one line. ${n}! ${d.name} loses its Light.`); break; }
        default: {
          const k = use;
          let n = 0;
          const on = k.fin ? (k.finSelf ? me : d) : undefined;
          const fin = !!(k.fin && on && on.status[k.fin] > 0);
          if (k.hpCost) me.hp = Math.max(1, me.hp - Math.round(me.maxHp * k.hpCost));
          if (k.pow) {
            n = hurt(side, me, d, me[k.stat ?? 'might'] * k.pow * (fin ? 2 : 1), { pierce: !!k.pierce, crit: fin, tag: fin ? 'FINISHER' : (k.kind === 'TEMPO' ? 'FIRST' : '') });
            if (k.leech) heal(side, me, n * k.leech);
          }
          if (fin && on && k.fin) on.status[k.fin] = 0;
          if (k.cleanse) { me.status.burn = 0; me.status.chill = 0; me.status.expose = 0; }
          if (k.strip) { d.status.ward = 0; d.status.regen = 0; d.shield = 0; }
          if (k.burn) d.status.burn = Math.max(d.status.burn, k.burn + (has(me, 'smoulder') ? 1 : 0) + longer);
          if (k.chill) d.status.chill = Math.max(d.status.chill, k.chill + (has(me, 'stillness') ? 1 : 0) + longer);
          if (k.expose) d.status.expose = Math.max(d.status.expose, k.expose);
          if (k.selfBurn) me.status.burn = Math.max(me.status.burn, k.selfBurn);
          if (k.ward) me.status.ward = Math.max(me.status.ward, k.ward);
          if (k.regen) me.status.regen = Math.max(me.status.regen, k.regen + (has(me, 'rooted') ? 1 : 0));
          if (k.shield) { const s = Math.round(me.maxHp * k.shield); me.shield = Math.max(me.shield ?? 0, s); hits.push({ to: side, amount: s, crit: false, heal: true, tag: 'SHIELD' }); }
          if (k.heal) heal(side, me, me.radiance * k.heal + 4, 'MEND');
          if (k.drain) light(d, -k.drain);
          if (k.gain) light(me, k.gain);
          say((k.line ?? `${me.name} uses ${k.name}.`).replace('{me}', me.name).replace('{foe}', d.name).replace('{n}', String(n)) + (k.pow ? tail : ''));
          if (fin && k.fin) combo(side, `Finisher: ${(k.finSelf ? me : d).name} was ${FIN_WORD[k.fin]}, so ${k.name} lands double.`);
          else if (k.fin) world(`${k.name} is a finisher. It wanted ${(k.finSelf ? me : d).name} ${FIN_WORD[k.fin]} first.`);
        }
      }
    };

    const settle = () => {
      if (outcome !== 'ongoing') return;
      const ko = (side: Side) => {
        const fs = team(side);
        const idx = side === 'you' ? myActive : theirActive;
        if (fs[idx]!.hp > 0) return;
        world(`${fs[idx]!.name} goes dark.`);
        const n = alive(fs);
        if (n < 0) { outcome = side === 'you' ? 'lost' : 'won'; return; }
        if (side === 'you') myActive = n; else theirActive = n;
        chain[side] = 0; last[side] = '';
        log.push({ side, text: `${fs[n]!.name} rises to fight.` });
      };
      ko('them');
      if (outcome === 'ongoing') ko('you');
    };

    // Guarding, swapping, fusing and tempo skills are quick; otherwise the faster acts first.
    const quick = (a: BattleAction) => a.type !== 'skill' || !!DEFS[a.id]?.quick;
    const theirA = st0.intent.action;
    const qy = quick(action), qt = quick(theirA);
    const first: Side = qy !== qt ? (qy ? 'you' : 'them') : spd(activeOf('you')) >= spd(activeOf('them')) ? 'you' : 'them';
    for (const side of [first, other(first)] as const) { perform(side, side === 'you' ? action : theirA); for (const l of lows.splice(0)) world(l); settle(); }
    // End of turn: burns bite, roots mend, statuses fade, Light gathers, the weather moves.
    if (outcome === 'ongoing') {
      ticking = true;
      const ticks: string[] = [];
      for (const side of ['you', 'them'] as const) {
        const f = activeOf(side);
        if (f.status.burn > 0) { const n = Math.max(1, Math.round((3 + f.maxHp * 0.05) * (has(f, 't-placid') ? 0.5 : 1))); f.hp = Math.max(0, f.hp - n); hits.push({ to: side, amount: n, crit: false, heal: false, tag: 'BURN', tick: true }); ticks.push(`${f.name} burns for ${n}`); }
        let mend = 0;
        if (f.hp > 0 && f.status.regen > 0) mend += heal(side, f, f.maxHp * 0.06 + f.radiance / 3, 'REGROW');
        if (f.hp > 0 && (has(f, 'ebb') || has(f, 'rooted'))) mend += heal(side, f, f.maxHp * 0.035, 'MEND');
        if (f.hp > 0 && holds(f, 'shell')) mend += heal(side, f, f.maxHp * 0.04, 'SHELL');
        if (mend > 0) ticks.push(`${f.name} mends ${mend}`);
        for (const k of KINDS) { if (f.hp > 0 && f.status[k] === 1) ticks.push(FADE[k].replace('{me}', f.name)); f.status[k] = Math.max(0, f.status[k] - 1); }
        light(f, 1);
      }
      ticking = false;
      if (ticks.length) world(`Turn's end: ${ticks.join(' · ')}.`);
      settle();
    }
    if (outcome === 'ongoing') {
      const turn = st0.turn + 1;
      if (R.boss === 'weather') {
        const next = g.pick(WEATHERS.filter((w) => w !== weather));
        weather = next;
        log.push({ side: 'them', text: `${R.name} turns the glass. ${WEATHER[next].name}: ${WEATHER[next].desc}` });
      } else if (R.boss === 'champion') {
        if (turn % 3 === 0) { const f = activeOf('them'); f.status.burn = 0; f.status.chill = 0; f.status.expose = 0; light(f, 2); log.push({ side: 'them', text: `${R.name} wipes ${f.name} clean with a thumb, and hands it Light.` }); }
      } else if (turn % 4 === 0) {
        const els = [...mine, ...theirs].filter((f) => f.hp > 0).map((f) => WEATHER_OF[f.element]);
        const next = g.pick(els);
        if (next !== weather) { weather = next; world(`The weather turns. ${WEATHER[next].name}: ${WEATHER[next].desc}`); }
      }
    }
    const done = outcome as BattleState['outcome'];
    if (done === 'won') {
      const tm = TEMPER[mine[myActive]?.temperament ?? ''];
      if (tm) world(tm.win.replace('{me}', mine[myActive]!.name));
      world(`${R.name}: "${R.beaten ?? '...'}" ${R.mode === 'practice' ? 'Only practice. Nothing changes hands.' : R.mode ? 'They step aside.' : 'Their box is open to you.'}`);
    }
    if (done === 'lost') world('Your box falls dark. Mote pulls you home.');
    const next = { rival: R, mine, theirs, myActive, theirActive, turn: st0.turn + 1, last, theirFused };
    return {
      ...next, log: [...st0.log, ...log].slice(-40), hits, intent: done === 'ongoing' ? plan(next) : st0.intent, fusedUsed, outcome: done,
      ...(weather ? { weather } : {}), chain, tally, first: spd(mine[myActive]!) >= spd(theirs[theirActive]!) ? 'you' : 'them',
    };
  };

  const can = (st: BattleState, a: BattleAction): boolean => {
    if (st.outcome !== 'ongoing') return false;
    const me = st.mine[st.myActive]!;
    if (a.type === 'guard') return true;
    if (a.type === 'swap') return a.target !== st.myActive && (st.mine[a.target]?.hp ?? 0) > 0;
    if (a.type === 'fuse') return !st.fusedUsed && a.target !== st.myActive && (st.mine[a.target]?.hp ?? 0) > 0;
    const s = me.skills.find((x) => x.id === a.id);
    return !!s && me.energy >= costOf(me, s);
  };

  // A rival's team leans to their theme: for each place, the first of a few seeded serials whose laws fit.
  const teams = new Map<string, Fighter[]>();
  const rivalTeam = (rival: Rival, specOf: (serial: SerialNumber) => UniverseSpec): Fighter[] => {
    const key = `${rival.id}:${rival.rematch ?? 0}:${rival.level}:${rival.mode ?? ''}:${EASE[rival.id] ?? 1}`;
    const hit = teams.get(key);
    if (hit) return hit;
    const l = rival.level + Math.min(6, rival.rematch ?? 0);
    const out = rival.serials.map((serial, i) => {
      let spec = specOf(serial);
      if (rival.theme && i < 2) {
        const pickG = rng(child(seed, `theme-${rival.id}-${i}`));
        for (let t = 0; t < 20 && (ELEMENT_OF[spec.laws.id] ?? 'stone') !== rival.theme; t++) spec = specOf(pickG.int(0x1000000));
        if ((ELEMENT_OF[spec.laws.id] ?? 'stone') !== rival.theme) spec = specOf(serial);
      }
      const g = rng(child(spec.seed, `rival-${rival.id}-${hashString(rival.name)}`));
      // Their worlds are tended about half as well as their creatures are trained: a box that only fights can keep up.
      const w = 1 + (l - 1) * 0.45, wi = Math.floor(w);
      const base = fighter(spec, {
        worldsTended: wi - 1, deepestFold: wi * 4 + g.int(4 + wi), lightFromGlow: Math.round(w * 40) + g.int(40), souls: Math.round(w * 8) + g.int(4 + wi),
        era: Math.min(4, Math.floor(w / 3)), enlightenment: Math.min(100, Math.round(w * 9) + (l >= 9 ? 30 : 0)), prosperity: Math.min(100, Math.round(w * 8)), orbiters: l > 6 ? Math.floor((l - 5) / 2) : 0,
      }, -1);
      // The first doors on the street are easy ones: a new box must be able to win there.
      const ease = (rival.rematch ?? 0) === 0 && (!rival.mode || rival.mode === 'practice') && rival.id < EASE.length ? EASE[rival.id]! : 1;
      if (ease !== 1) { const hp = Math.round(base.maxHp * ease); Object.assign(base, { might: Math.max(4, Math.round(base.might * ease)), maxHp: hp, hp }); }
      const relic = (rival.tier ?? 1) >= 2 && (i === 0 || rival.boss) ? RELICS[g.int(RELICS.length)]!.id : undefined;
      return grow(base, { xp: xpForLevel(Math.max(1, l + (rival.boss ? 1 : 0) - (i === 2 ? 1 : 0))), ...(relic ? { relic } : {}) });
    });
    teams.set(key, out);
    return out;
  };

  /** About what a move would do, before the dice. Used by threat() and the scripted players. */
  const est = (st: Pick<BattleState, 'weather'>, a: Fighter, d: Fighter, k: Def, free = false): number => {
    if (!free && a.energy < costOf(a, k)) k = STRIKE;
    const fin = !!(k.fin && (k.finSelf ? a : d).status[k.fin] > 0);
    const sh = d.status.chill > 0 ? 1.5 : 1;
    let base = 0, pierce = !!k.pierce;
    switch (k.id) {
      case 'strike': base = a.might * sh; break;
      case 'kindle': base = a.might * 0.9 * sh; break;
      case 'rime': base = a.might * 0.8 * (d.status.burn > 0 ? 1.5 : 1); break;
      case 'undertow': base = a.might * 1.1; break;
      case 'avalanche': base = a.might * 1.3 * sh; pierce = true; break;
      case 'overgrow': base = a.might * 0.6; break;
      case 'unmake': base = a.might; break;
      case 'fold': base = a.depth * 1.5 * (d.status.expose > 0 ? 2 : 1 + a.depth / (a.depth + 30)); break;
      case 'align': base = (a.might + a.depth + a.radiance) * 0.85 + a.speed; break;
      default: base = k.pow ? a[k.stat ?? 'might'] * k.pow * (fin ? 2 : 1) : 0;
    }
    if (base <= 0) return 0;
    let dmg = base * advantage(a.element, d.element);
    const w = st.weather ? WEATHER[st.weather] : undefined;
    if (w && a.element === w.up) dmg *= 1.33;
    if (w && a.element === w.down && !holds(a, 'moth')) dmg *= 0.75;
    if (a.status.chill > 0) dmg *= 0.75;
    if (d.status.expose > 0) dmg *= 1.4;
    if (d.status.ward > 0 && !pierce) dmg *= 0.5;
    if (has(d, 'bedrock') && !d.spent.includes('bedrock')) dmg *= 0.5;
    return Math.max(1, dmg - d.guard / 4);
  };
  const threat = (st: BattleState): number => {
    if (st.outcome !== 'ongoing') return 0;
    const a = st.intent.action;
    if (a.type !== 'skill') return 0;
    const me = st.mine[st.myActive]!, foe = st.theirs[st.theirActive]!;
    const k = DEFS[a.id] ?? STRIKE;
    const n = est(st, foe, me, k, st.rival.boss === 'mirror');
    if (n <= 0) return 0;
    return k.id === 'align' || n >= me.maxHp * 0.3 || (n >= me.hp + (me.shield ?? 0) && n >= me.maxHp * 0.15) ? 2 : 1;
  };
  /** Scripted players. Naive: the first move, always. Sensible: reads the intent, guards the big one, uses what hits hardest. Expert: chains, finishers, fusing. */
  const suggest = (st: BattleState, skill: 'naive' | 'sensible' | 'expert' = 'sensible'): BattleAction => {
    const me = st.mine[st.myActive]!, foe = st.theirs[st.theirActive]!;
    const strike: BattleAction = { type: 'skill', id: me.skills[0]?.id ?? 'strike' };
    if (skill === 'naive') return strike;
    const expert = skill === 'expert';
    const t = threat(st);
    const life = foe.hp + (foe.shield ?? 0);
    const mine = me.skills.map((s) => DEFS[s.id]!).filter((k) => k && me.energy >= costOf(me, k));
    const myFins = new Set(me.skills.map((s) => DEFS[s.id]?.fin).filter(Boolean));
    const youFirst = st.first !== 'them';
    const hurt = (me.maxHp - me.hp) / me.maxHp;
    let best: Def = STRIKE, bestV = -1, kill: Def | undefined;
    for (const k of mine) {
      const n = est(st, me, foe, k);
      if (n >= life * 1.12 && (!kill || costOf(me, k) < costOf(me, kill))) kill = k;
      let v = n;
      if (k.id === 'strike') v += me.might * 0.25; // the Light it gathers
      if ((k.id === 'kindle' || k.burn) && foe.status.burn === 0) v += 2 * (3 + foe.maxHp * 0.05);
      if ((k.id === 'rime' || k.chill) && foe.status.chill === 0) v += foe.might * 0.3;
      if ((k.id === 'unmake' || k.expose) && foe.status.expose === 0) v += me.might * (expert && myFins.has('expose') ? 0.9 : 0.4);
      if (k.id === 'undertow' || k.leech) v += n * 0.33 * Math.min(1, hurt * 3);
      if (k.id === 'overgrow') v += me.maxHp * 0.18 * Math.min(1, hurt * 3) * (me.status.regen > 0 ? 0.2 : 1);
      if (k.drain) v += Math.min(foe.energy, k.drain) * foe.might * 0.2;
      if (k.gain && !k.pow) v += me.energy <= 2 ? me.might * 0.5 : 0;
      if (k.shield && !k.pow) v += (me.shield ?? 0) > 0 ? 0 : me.maxHp * k.shield * (t >= 1 ? 0.9 : 0.4);
      if (k.id === 'shine') v = hurt > 0.5 && me.status.ward === 0 ? me.radiance * 1.8 + 6 + me.might * 0.6 : 0;
      if (k.id === 'align') v *= 0.9;
      if (k.cleanse && !k.pow) v += (me.status.burn > 0 ? me.maxHp * 0.1 : 0) + (me.status.expose > 0 ? me.maxHp * 0.1 : 0) + (me.status.chill > 0 ? me.might * 0.3 : 0);
      if (expert && st.last?.you && st.last.you !== k.id) v *= 1.1;
      if (expert && st.rival.boss === 'champion' && (st.turn + 1) % 3 === 0 && (k.kind === 'BURN' || k.kind === 'CHILL' || k.id === 'unmake')) v *= 0.7;
      if (expert && st.rival.boss === 'mirror') v -= est(st, foe, me, k, true) * 0.6; // it comes straight back
      v -= costOf(me, k) * me.might * 0.06;
      if (v > bestV) { bestV = v; best = k; }
    }
    // It can be finished now, before it lands its blow.
    if (kill && (youFirst || kill.quick || t < 2)) return { type: 'skill', id: kill.id };
    if (t === 2 && !me.guarding) return { type: 'guard' };
    if (t === 2 && me.guarding && st.intent.action.type === 'skill' && DEFS[st.intent.action.id]?.id === 'align') return { type: 'guard' };
    const adv = advantage(me.element, foe.element);
    const better = st.mine.findIndex((f, i) => i !== st.myActive && f.hp > f.maxHp * 0.5 && advantage(f.element, foe.element) > adv && advantage(foe.element, f.element) <= advantage(foe.element, me.element));
    if (adv < 1 && better >= 0 && foe.hp > foe.maxHp * 0.4) return { type: 'swap', target: better };
    if (expert && !st.fusedUsed && me.hp < me.maxHp * 0.45 && !me.fused) {
      const ally = st.mine.findIndex((f, i) => i !== st.myActive && f.hp > 0);
      if (ally >= 0 && st.mine.filter((f) => f.hp > 0).length >= 2 && (st.theirs.filter((f) => f.hp > 0).length <= 2 || st.rival.boss)) return { type: 'fuse', target: ally };
    }
    // Dying anyway and someone fresher is behind: let them take it.
    if (me.hp < me.maxHp * 0.2 && t >= 1 && !youFirst) { const fresh = st.mine.findIndex((f, i) => i !== st.myActive && f.hp > f.maxHp * 0.6); if (fresh >= 0 && expert) return { type: 'swap', target: fresh }; }
    return { type: 'skill', id: best.id };
  };
  const daily = (day: number, level0: number): Rival => {
    const g = rng(child(seed, `daily-${Math.floor(day)}`));
    const who = g.pick(DAILY);
    const level = Math.max(1, Math.min(12, Math.floor(level0)));
    return {
      ...who, again: who.taunt, id: 1000 + (Math.abs(Math.floor(day)) % 9000), level, tier: level >= 4 ? 2 : 1, tierName: 'Today only', mode: 'daily',
      persona: g.pick(['bold', 'wary', 'sly', 'cruel'] as const), theme: g.pick([...CYCLE, 'void'] as Element[]),
      serials: Array.from({ length: 3 }, () => g.int(0x1000000)),
    };
  };

  return {
    suggest, daily, threat,
    rivals: () => rivals,
    fighter,
    advantage,
    can,
    levelOf,
    grow,
    relics: () => RELICS,
    weatherInfo: (w) => WEATHER[w],
    skillsOf: (element) => ELEMENT_SKILLS[element],
    rematch: (rival, wins) => (wins > 0 ? { ...rival, rematch: wins, taunt: rival.again ?? rival.taunt } : rival),
    reward: (st, wins, owned): BattleReward => {
      const R = st.rival;
      const g = rng(child(seed, `reward-${R.id}-${wins}`));
      const xp = Math.round((16 + R.level * 8 + Math.min(6, wins) * 4) * (R.boss ? 1.5 : 1));
      if (R.mode === 'practice') return { glow: 0, xp: 0 };
      if (st.outcome !== 'won') return { glow: 0, xp: Math.ceil(xp / 2) };
      const pieceRoll = g.chance(1, 2), relicRoll = g.chance(1, wins === 0 ? 2 : 4);
      const left = RELICS.filter((r) => !owned.includes(r.id));
      const relic = left.length && (R.boss || (wins === 0 && R.id === 0) || relicRoll) ? left[g.int(left.length)]! : undefined;
      const big = !!R.boss || R.mode === 'daily';
      const piece = big || pieceRoll ? { kind: SKY_PIECE_KINDS[g.int(SKY_PIECE_KINDS.length)]!, n: big ? 2 : 1 } : undefined;
      return { glow: (600 + R.level * 300) * (big ? 2 : 1), xp, ...(piece ? { piece } : {}), ...(relic ? { relic } : {}) };
    },
    rivalTeam,
    start: (rival, mine, theirs) => {
      const base = { rival, mine, theirs, myActive: Math.max(0, alive(mine)), theirActive: 0, turn: 0, last: { you: '', them: '' }, theirFused: false };
      const g = rng(child(seed, `weather-${rival.id}-${rival.rematch ?? 0}`));
      const els = [...mine, ...theirs].map((f) => WEATHER_OF[f.element]);
      const weather: Weather = rival.boss === 'champion' ? 'dark' : els.length ? g.pick(els) : 'dark';
      const log: BattleLogLine[] = [{ side: 'them', text: `${rival.name}: "${rival.taunt}"` }, { side: 'world', text: `${WEATHER[weather].name}. ${WEATHER[weather].desc}` }];
      if (rival.mechanic) log.push({ side: 'world', text: `${rival.name}: ${rival.mechanic}` });
      const lead = mine[base.myActive], tm = TEMPER[lead?.temperament ?? ''];
      if (lead && tm) log.push({ side: 'you', text: tm.enter.replace('{me}', lead.name) });
      return {
        ...base, log, hits: [], intent: plan(base), fusedUsed: false, outcome: 'ongoing', weather,
        chain: { you: 0, them: 0 }, tally: { dealt: 0, taken: 0, combos: 0 },
        first: mine.length && theirs.length && spd(mine[base.myActive]!) >= spd(theirs[0]!) ? 'you' : 'them',
      };
    },
    act: (st, action) => (can(st, action) ? act(st, action) : st),
    refresh: (st, slot, fresh) => ({
      ...st,
      mine: st.mine.map((f) => {
        if (f.slot !== slot || f.fused) return f;
        const lost = f.maxHp - f.hp;
        return { ...fresh, hp: Math.max(1, Math.min(fresh.maxHp, fresh.maxHp - lost)), energy: f.energy, status: f.status, spent: f.spent, guarding: f.guarding, shield: f.shield ?? 0 };
      }),
    }),
    flee: (st) => ({ ...st, outcome: 'fled', log: [...st.log, { side: 'you' as const, text: 'You shut the box and run.' }] }),
  };
};
