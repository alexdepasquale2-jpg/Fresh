// The words for the wider world: relations, creeds, hardship, works and named figures.
// figName and creedName are identical copies of the ones in src/sim/civ/lore.ts (units may
// not import each other). Change both, or the village list and the chronicle disagree.
import type { Belief } from '@/contracts/sim';
import type { Seed } from '@/contracts/seed';
import { child, mix, seedToU32 } from '@/core/hash';

const NA = ['Or', 'Wen', 'Tam', 'Fen', 'Is', 'Mar', 'Hal', 'Sel', 'Bry', 'Cor', 'Ed', 'Lin', 'Oss', 'Ru', 'Thess', 'Ane', 'Dov', 'Kes', 'Mir', 'Yar'];
const NB = ['la', '', 'sin', 'na', 'ric', 'wen', 'low', 'a', 'en', 'ith', 'o', 'ra', 'el', 'is', '', 'an'];
const FA = ['Ash', 'Salt', 'Reed', 'Mere', 'Stone', 'Wick', 'Low', 'Marsh', 'Ember', 'Gull', 'Thorn', 'Tarn'];
const FB = ['low', 'mere', 'wick', 'by', 'ley', 'field', 'hallow', 'ward'];
export const figName = (seed: Seed, who: number): { first: string; house: string; full: string } => {
  const ord = who % 4096, house = Math.floor(who / 4096);
  const h = seedToU32(mix(child(seed, 'figure-name'), ord));
  const hf = seedToU32(mix(child(seed, 'figure-house'), house));
  const a = NA[h % NA.length]!;
  let b = NB[(h >>> 8) % NB.length]!;
  if (!b && a.length <= 2) b = 'a';
  const fa = FA[hf % FA.length]!;
  let fb = FB[(hf >>> 8) % FB.length]!;
  if (fa.toLowerCase() === fb) fb = 'ward';
  return { first: a + b, house: fa + fb, full: `${a + b} ${fa + fb}` };
};

const CA = ['Low', 'Quiet', 'Long', 'Bright', 'Patient', 'Hollow', 'Ninth', 'Unbroken', 'Pale', 'Kept', 'Hidden', 'Even'];
const CN: Record<Belief, string[]> = {
  none: ['Way'],
  sun: ['Noon', 'Dawn', 'Gold Eye', 'Day'],
  moon: ['Crescent', 'Night Eye', 'White Road', 'Tide-Lamp'],
  sea: ['Tide', 'Deep', 'Salt', 'Shore'],
  stone: ['Fall', 'Crater', 'Iron Rain', 'Stone'],
  fire: ['Ember', 'Hearth', 'Ash', 'Flame'],
  sky: ['Storm', 'Thunder', 'Wind', 'Cloud'],
};
export const creedName = (seed: Seed, id: number, belief: Belief): string => {
  const h = seedToU32(mix(child(seed, 'creed-name'), id));
  const n = CN[belief] ?? CN.none;
  return `the ${CA[h % CA.length]!} ${n[(h >>> 8) % n.length]!}`;
};

// Placeholders: %v village, %o other village, %w figure (full name), %f first name, %h house,
// %k creed, %j the older creed, %x a word for the detail, %n a count of souls.
type T = readonly string[];
/** Templates by kind; where a kind has several tellings, indexed by cause or detail. */
export const TELL: Record<string, T | Record<number, T>> = {
  pact: ['%v and %o agreed on weights and measures.', 'A trade road was marked between %v and %o.', '%v and %o swore to keep their markets open to each other.'],
  alliance: ['%v and %o swore to stand as one.', '%v and %o cut one seal for both their gates.', 'An oath was sworn between %v and %o: one war, one peace.'],
  wedding: ['A daughter of House %h of %v wed into the hall of %o.', 'House %h of %v and the rulers of %o were joined by marriage.', '%v sent a son of House %h to wed in %o.'],
  rivalry: ['%v and %o stopped trading words.', 'A bitterness grew between %v and %o.', '%v closed its road to %o.'],
  raid: {
    0: ['%v came for the grain of %o and was driven off.', 'Raiders from %v broke on the walls of %o.', '%o saw the raiders of %v coming and met them at the ford.'],
    1: ['Raiders from %v emptied the stores of %o.', '%v fell on %o by night and carried off its grain.', '%v took what it wanted from %o and left the doors open.'],
  },
  war: ['%v marched on %o.', 'War between %v and %o.', '%v took up iron against %o.'],
  peace: {
    0: ['%v and %o laid their spears down.', 'Peace between %v and %o.', 'The war of %v and %o ended with no one the victor.'],
    4: ['%v paid its last tribute to %o.', '%v owes %o nothing now.'],
  },
  tribute: ['%v bent the knee to %o and pays in grain.', '%v lost the war and sends tribute to %o.', 'The carts of %v go to %o now, full, and come back empty.'],
  razed: ['%v burned %o to the ground.', '%o was razed by %v. Its people scattered.', 'Nothing stands where %o stood. %v saw to it.'],
  absorbed: ['%o was taken into %v, hearth and name.', '%v swallowed %o whole.', 'The people of %o live under the roofs of %v now.'],
  creed: ['In %v a creed was named: %k. %w was its first voice.', '%w of %v gave the faith a name: %k.', 'In %v they began to call themselves %k, after the words of %w.'],
  schism: ['%v broke from %j and now keeps %k.', '%w split the faith of %v. Their creed is %k now.', 'The shrine of %v was divided. %w leads %k.'],
  heresy: ['In %v, %w began to preach against %k.', '%w stood in the shrine of %v and said the creed was wrong.', 'A heretic in %v: %w, who will not kneel to %k.'],
  exile: ['%w was driven out of %v with a few who believed.', '%v cast out the heretic %w.', '%w left %v by night, and some followed.'],
  holy: ['The ground at %v became holy to %k.', 'Pilgrims of %k now walk to %v.', '%v is where %k keeps its heart.'],
  sign: {
    1: ['%v rejoiced at %x.', 'In %v they sang to %x.', '%v lit every lamp for %x.'],
    2: ['%v hid from %x.', 'In %v they barred the doors against %x.', '%v fasted in fear of %x.'],
    3: ['In %v they measured %x and wrote it down.', '%v watched %x through glass, unafraid.'],
  },
  plague: {
    1: ['Sickness came to %v on the trade road from %o.', 'The traders of %o brought more than goods to %v.'],
    2: ['A sickness started in the crowded lanes of %v.', '%v fell sick, house by house.'],
    3: ['After the water, a fever came to %v.', 'The wells of %v turned, and then the fever came.'],
    4: ['The ones who fled %o carried a sickness into %v.', '%v opened its gates to %o, and to the fever.'],
  },
  plagueEnd: ['The sickness left %v. It took %n.', '%v counted its dead: %n. The fever was gone.', 'The doors of %v opened again. It had lost %n.'],
  refugees: ['%n from %o came to the gates of %v.', '%v took in %n who fled %o.', 'The road from %o brought %n to %v.'],
  resettled: ['Settlers went back to the ruins of %o. They call it %v.', '%v was raised on the cold stones of %o.', 'Smoke rises again where %o stood. The place is %v now.'],
  recovered: {
    1: ['%v rebuilt what burned.', 'New roofs in %v, on the black beams of the old.'],
    2: ['%v dried out and mended its walls.'],
    3: ['Children were born in %v again.', 'The lanes of %v were loud again.'],
    4: ['%v filled its stores again after the raid.'],
    5: ['%v ate well again.', 'The hungry year ended in %v.'],
    6: ['%v stood up straight again after its defeat.'],
  },
  song: {
    1: ['%v made a song of its victory.'],
    2: ['In %v they sing of the fever year.'],
    3: ['%v made a song for its great work.'],
    4: ['A lament was made in %v for the one who ruled it.'],
    5: ['%v sings for the ones who left the world.'],
    6: ['%v made a song of what it lived through.'],
    7: ['%v has a song now about the one who would not kneel.'],
  },
  wonder: ['%v finished the %x.', 'The %x of %v was done at last.', 'After long work the %x stands in %v.'],
  school: ['%v opened a school.', 'The children of %v are taught their letters now.', 'In %v one house was given over to teaching.'],
  invention: ['%w of %v devised %x.', 'In %v, %w made %x. Others will copy it.', 'The world first saw %x in %v. %w made it.'],
  ark: ['A ship left %v for good, carrying %n. %w spoke last.', '%v sent %n up past the sky. They will not return.', '%w led %n out of %v and out of the world.'],
  voyage: ['%w sailed from %v and found %o.', '%w of %v came back with word of %o.', 'A boat from %v, with %w at the oar, reached %o.'],
  crowned: {
    1: ['%v chose its first ruler: %w.', '%w was raised above the rest in %v.', '%v gave a seal and a high seat to %w.'],
    2: ['%w took the seat of House %h in %v.', 'In %v the seal passed to %w, of the same house.', '%w, heir of House %h, now rules %v.'],
    3: ['%w took the high seat of %v with the crowd behind.', 'A new house rules %v: %w.', '%v has a ruler again: %w, who was no one before.'],
  },
  fell: {
    1: ['%w, who ruled %v, died in bed.', '%w of %v died old, with the seal still in hand.', 'The long rule of %w over %v ended quietly.'],
    2: ['%w, ruler of %v, fell in the war.', '%w of %v did not come back from the field.'],
    3: ['The sickness took %w, who ruled %v.', '%w of %v died of the fever like anyone.'],
    4: ['%v rose and threw down %w.', '%w was pulled from the high seat of %v.'],
    5: ['%v put the heretic %w to death.', '%w was silenced at the shrine of %v.'],
  },
  festival: {
    1: ['%v kept the sowing feast.', 'In %v they blessed the seed and danced.'],
    2: ['%v burned the midsummer fires.', 'Midsummer in %v. No one slept.'],
    3: ['%v kept the harvest feast.', 'The harvest came in and %v drank to it.'],
    4: ['%v lit the midwinter lamps.', 'In the deep of winter %v sang the sun back.'],
  },
  convert: {
    1: ['%v took up %k, the creed of %o.', 'The traders of %o brought %k to %v.'],
    2: ['%v was made to kneel to %k.', 'The shrine of %v was given over to %k.'],
    5: ['%v turned to the %b and took the rite of %o: %k.', 'In %v they began to keep %k, as %o does.'],
  },
  found: {
    2: ['%w led the young of %o to new ground and called it %v.', 'The walkers from %o stopped where %w said. That place is %v.'],
    3: ['%w, cast out of %o, raised %v.', 'The exiles of %o built %v around %w.'],
  },
  split: ['%w led the young of %v out to find new ground.', 'A company left %v behind %w, to build somewhere else.'],
  tech: {
    6: ['%v built its first engine. The hills are louder now.', 'In %v the age of engines began.'],
    7: ['%v learned to send a voice further than a bell carries.', 'In %v they speak now to places they cannot see.'],
    8: ['%v has learned how to leave the world.', 'In %v they no longer ask if they can go, only when.'],
  },
  die: { 9: ['The last families of %v shut their doors and walked away.', '%v was left to the wind.'] },
};

export const SIGN = ['', 'a new light in the night', 'a light gone from the night', 'stones gathering overhead', 'a veil across the sky', 'a harder sun', 'a higher tide', 'the sun going dark', 'a comet', 'a rain of stars', 'the stranger'];
export const WORKS = ['Great Granary', 'Sea Wall', 'High Shrine', 'Great Bell', 'Lighthouse', 'Star House', 'Sky Dock'];
export const INVENTIONS = ['the plough', 'the sail', 'writing', 'glass', 'the press', 'the engine', 'the far-voice', 'the sun-sail'];
export const LATE_TECH = ['engines', 'far-speaking', 'leaving'];

/** Why two villages fall out, as a clause (two tellings each). */
export const GRIEF: readonly (readonly string[])[] = [
  ['no one remembers how it began'],
  ['one had grain while the other buried its children', 'hunger looked over the wall at full stores'],
  ['each said the other prayed wrong', 'they kneel to different things'],
  ['one had grown rich in sight of the other', 'the poorer could count the richer one\'s lamps'],
  ['the land between them was too small for both', 'their fields had grown until they touched'],
  ['an old raid was never paid for', 'neither had forgotten the last blood'],
  ['they share a god and cannot forgive each other the rite', 'one god, two rites, and no patience'],
  ['a hard ruler wanted it', 'a hard hand on the seal needed an enemy'],
];
/** What a heretic says, as a clause. */
export const DOUBT = ['the creed had gone stale', 'the sun was veiled and the priests had no answer', 'they pray to a moon that is not there', 'the sea they pray to has left them', 'the stones have stopped falling',
  'the fire did not keep them warm', '', 'the god let them starve', 'the sky showed a sign the creed could not explain', 'prayer did not stop the sickness'];
export const TEMPER = ['They call %f mild.', 'They call %f hard.', 'They call %f devout.', '%f likes to build.'];
export const WHY_WORK = ['They mean never to starve again.', 'They mean to keep the sea out of their doors.', 'So that %k has a roof worthy of it.', 'To warn of raiders, fire and fever.',
  'To bring their traders home by night.', 'To look back at what looks at them.', 'They mean to leave.'];
export const WHY_INVENT = ['The field was there, and too hard for hands.', 'The fish had moved further out.', 'There was too much to remember.', 'The sand was good and the fires hot.',
  'One scribe could not copy fast enough.', 'The mine wanted more than arms.', 'The bell could only say one word.', 'Your light pushes, if the sail is thin enough.'];
export const QUIET = ['A quiet year in %v. The lamps were lit and put out.', 'Nothing was written in %v but the weights of grain.', 'A year of small things in %v: a roof mended, a child named.',
  'The year turned over in %v and no one marked it.', '%v slept through a mild year.', 'Smoke rose straight from the roofs of %v all year.', 'In %v they argued about a fence, and that was the year.'];
export const EMPTY = ['The world lay quiet. Wind, and the tide.', 'No one was there to write the year down.', 'Dust moved. Nothing else did.'];
