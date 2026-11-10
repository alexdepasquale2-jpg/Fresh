// Items, shops and collectibles: data tables. Add more with ITEMS.push / SHOPS.push / COLLECT.push
// from a file in ./items/ (loaded by index.ts with import.meta.glob).
import type { CatchDef, ItemDef, ShopDef, CollectKind } from './types';

export const ITEMS: ItemDef[] = [
  { id: 'label', name: 'Parcel label', desc: 'Brown card on a string. No address. A mark like a mast with rings round it.', kind: 'thing' },
  { id: 'mast-key', name: 'Mast key', desc: 'A long key on a loop of flex. Warm, as if just used.', kind: 'key' },
  { id: 'lots-key', name: 'Allotment key', desc: 'Lets you through the allotment gate after dusk.', kind: 'key' },
  { id: 'torch', name: 'Torch', desc: 'A heavy rubber torch. Mote does not like it, but the culvert does.', kind: 'tool' },
  { id: 'bulb', name: 'Lamp bulb', desc: 'A fat glass bulb for a street lamp. It ticks when you tilt it.', kind: 'thing' },
  { id: 'milk', name: 'Pint of milk', desc: 'Cold. Silver top.', kind: 'food', value: 60 },
  { id: 'sausage', name: 'Sausage', desc: 'One, in paper. The paper is already see-through.', kind: 'food', value: 80 },
  { id: 'humbug', name: 'Humbug', desc: 'Striped. Lasts exactly one walk home.', kind: 'food', value: 120 },
  { id: 'cocoa', name: 'Flask of cocoa', desc: 'From the Lantern. Still hot somehow.', kind: 'food', value: 400 },
  { id: 'letter', name: 'Letter', desc: 'To be handed over, not posted through.', kind: 'thing' },
  { id: 'ball', name: 'Red ball', desc: 'Gone soft. Smells of the long grass.', kind: 'thing' },
  { id: 'bean', name: 'One bean', desc: 'Speckled like an egg. Heavier than a bean.', kind: 'thing' },
  { id: 'beans', name: 'Warm beans', desc: 'A pocketful from Plot 9. They do not cool.', kind: 'thing' },
  { id: 'bus-pass', name: 'Bus pass', desc: 'RIDE FREE. The photo is of a child who is nearly you.', kind: 'key' },
  { id: 'best-stone', name: 'Nell\'s best stone', desc: 'Flat as a held breath. Skims further.', kind: 'tool' },
  { id: 'coal-button', name: 'Coal button', desc: 'A coat button cut from coal. Ash was guarding it.', kind: 'trinket' },
  { id: 'cap-crown', name: 'Cap crown', desc: 'Dov bent five caps into a ring. It fits no head.', kind: 'trinket' },
  { id: 'tilly-ribbon', name: 'Tilly\'s ribbon', desc: 'She said to tie it to the Box. You have not, yet.', kind: 'trinket' },
  { id: 'evening-thread', name: 'A thread of evening', desc: 'It came off the tall thing\'s sleeve. It is always dusk along it.', kind: 'trinket' },
  { id: 'pit-tooth', name: 'Quarry tooth', desc: 'A cube of stone, edges too square. Hold it to your ear: a hum.', kind: 'trinket' },
  { id: 'chalk', name: 'Stub of chalk', desc: 'From under the line. It will only draw squares.', kind: 'trinket' },
  { id: 'plover-quill', name: 'Plover\'s quill', desc: 'Cut from a feather no bird in his book owns.', kind: 'trinket' },
  { id: 'pip-marble', name: 'Pip\'s marble', desc: 'A glass alley with a twist of white in it that turns when you are not looking.', kind: 'trinket' },
  { id: 'cap', name: 'Bottle cap', desc: 'Crimped tin. Each a different drink nobody sells now.', kind: 'find' },
  { id: 'feather', name: 'Feather', desc: 'Grey, barred. Plover would know.', kind: 'find' },
  { id: 'glass', name: 'Mere glass', desc: 'Window glass, worn soft by the reservoir. From the drowned houses.', kind: 'find' },
  { id: 'penny', name: 'Old penny', desc: 'Spent the moment you pick it up.', kind: 'find' },
];
export const item = (id: string): ItemDef => ITEMS.find((i) => i.id === id) ?? { id, name: id, desc: '', kind: 'thing' };

export const SHOPS: ShopDef[] = [
  { id: 'dray', name: 'Dray\'s Corner', open: ['dawn', 'day', 'dusk'], stock: [{ item: 'milk', price: 3 }, { item: 'humbug', price: 1 }] },
  { id: 'brisk', name: 'Brisk & Daughter', open: ['dawn', 'day'], stock: [{ item: 'sausage', price: 2 }] },
  { id: 'sull', name: 'Sull & Son', open: ['day'], stock: [{ item: 'torch', price: 12, limit: 1 }, { item: 'bulb', price: 5, limit: 1 }, { item: 'lots-key', price: 9, limit: 1 }, { item: 'rod', price: 6, limit: 1 }] },
  { id: 'lantern', name: 'The Lantern Café', open: ['day', 'dusk', 'night'], stock: [{ item: 'cocoa', price: 2 }] },
];

/** Things scattered over the map, placed by seed. `count` of each; found ones are remembered by id `<kind>-<n>`. */
export const COLLECT: CollectKind[] = [
  { id: 'cap', name: 'Bottle caps', one: 'a bottle cap', count: 16, item: 'cap', districts: ['row', 'school', 'parade', 'park', 'rail'], reward: { coins: 15 }, says: 'Sixteen caps. Sixteen drinks nobody remembers. They ring like a till.' },
  { id: 'feather', name: 'Feathers', one: 'a feather', count: 14, item: 'feather', districts: ['woods', 'hill', 'lots', 'church', 'cut'], reward: { sky: [['comet', 2]] }, says: 'Fourteen feathers. Laid in a row they make one wing, too long for any bird.' },
  { id: 'glass', name: 'Mere glass', one: 'a piece of mere glass', count: 12, item: 'glass', districts: ['shore', 'cut', 'quarry'], reward: { glow: 2000 }, says: 'Twelve pieces. Held together they are one window. Something on the far side wipes it with a sleeve.' },
  { id: 'penny', name: 'Old pennies', one: 'an old penny', count: 14, item: 'penny', reward: { coins: 10 }, says: 'Fourteen pennies, all the same year. The year is next year.' },
];

ITEMS.push(
  { id: 'rod', name: 'Line and float', desc: 'A hand line on a wooden frame. Tap water to fish with it.', kind: 'tool' },
  { id: 'bike', name: 'The bike', desc: 'A heavy black bike, one size too big. The bell works. Use the Bike button out of doors.', kind: 'tool' },
  { id: 'conker', name: 'Conker', desc: 'A sixer, at least. Won in the yard.', kind: 'trinket' },
  { id: 'photo', name: 'Photograph', desc: 'Mote held still for it. It is brighter in the picture than it was.', kind: 'trinket' },
);
/** What comes out of the water. Add more with CATCHES.push(...); each also needs no item entry (one is made). */
export const CATCHES: CatchDef[] = [
  { id: 'fish-roach', name: 'Roach', desc: 'Silver, red-finned. It looks at you sideways.', weight: 30, coins: 1 },
  { id: 'fish-perch', name: 'Perch', desc: 'Striped like a humbug. Spines up.', weight: 22, coins: 2 },
  { id: 'fish-stickle', name: 'Stickleback', desc: 'Three spines. Smaller than the hook.', weight: 24, where: 'creek', coins: 1 },
  { id: 'fish-eel', name: 'Eel', desc: 'It ties itself in a knot you have seen on a parcel.', weight: 10, night: true, coins: 3 },
  { id: 'fish-pike', name: 'Lowmere pike', desc: 'Long as your arm. Old. It let you.', weight: 5, where: 'mere', coins: 5 },
  { id: 'fish-boot', name: 'Left boot', desc: 'A child\'s. Laced, and the lace tied in a bow.', weight: 12 },
  { id: 'fish-tile', name: 'Roof slate', desc: 'From a roof under the water. A house number is chalked on it.', weight: 8, where: 'mere' },
  { id: 'fish-key', name: 'Wet key', desc: 'Fits nothing on this side of the water.', weight: 5, where: 'mere' },
  { id: 'fish-blind', name: 'Pale fish', desc: 'No eyes. A small square mark where each should be.', weight: 4, night: true, coins: 4 },
  { id: 'fish-coin', name: 'Pond penny', desc: 'Thrown in for a wish. You have taken somebody\'s wish.', weight: 10, where: 'pond', coins: 2 },
];
