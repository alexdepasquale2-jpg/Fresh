// Items, shop stock, two new shops and two collectible sets for the story quests in ../quests/.
import { ITEMS, SHOPS, COLLECT } from '../items';

ITEMS.push(
  /* things the shops sell that open a gate or a quest */
  { id: 'jam-jar', name: 'Jam jar', desc: 'Washed, with a lid. Things keep in it that should not keep.', kind: 'tool' },
  { id: 'twine', name: 'Ball of twine', desc: 'Tarred garden twine. It has a smell like a shed in August.', kind: 'thing' },
  { id: 'oil-can', name: 'Oil can', desc: 'A thumb-pump can. One drop stops a thing complaining for a year.', kind: 'tool' },
  { id: 'shears', name: 'Hedge shears', desc: 'Long handles. They cut brambles, and the path behind them stays cut.', kind: 'tool' },
  { id: 'chalks', name: 'Box of chalks', desc: 'School chalk, twelve sticks. Eleven are white.', kind: 'thing' },
  { id: 'candle', name: 'Church candle', desc: 'A stub, thumb-thick. It burns down but not shorter.', kind: 'thing' },
  { id: 'bread', name: 'Heel of bread', desc: 'Yesterday\'s. The sign at the pond says not to.', kind: 'food', value: 90 },
  { id: 'chips', name: 'The usual', desc: 'Hot chips in paper, from the Lantern. Not on the menu.', kind: 'food', value: 300 },
  { id: 'tonic', name: 'Hollin Tonic', desc: 'A bottle with a crimped cap. The label lists what it cures. One of the words is your street.', kind: 'thing' },
  /* quest things */
  { id: 'lunch-box', name: 'Plain lunch box', desc: 'Tin, no name, no dent. Empty, and heavy with it.', kind: 'thing' },
  { id: 'register', name: 'Class 4 register', desc: 'Thirty-one names. Beside eleven of them, a small pencilled square.', kind: 'thing' },
  { id: 'gold-top', name: 'Gold top', desc: 'A pint for a doorstep. It must be down before the sun is.', kind: 'thing' },
  { id: 'elver', name: 'Glass eel', desc: 'In a jam jar. You can read the lid through it.', kind: 'thing' },
  { id: 'hum-jar', name: 'Jar of hum', desc: 'Nothing in it. Hold it to your ear and the mast is in there, small.', kind: 'trinket' },
  { id: 'chapel-key', name: 'Chapel key', desc: 'Green from the water. The bow is a small square with a dot.', kind: 'key' },
  { id: 'dog-lead', name: 'A dog lead', desc: 'Leather, worn pale at the hand end. The clip is fastened on nothing.', kind: 'thing' },
  { id: 'wagon-label', name: 'Wagon label', desc: 'RETURNED TO SENDER. The sender\'s side is a mast with rings round it.', kind: 'thing' },
  { id: 'hoard', name: 'Jackdaw\'s hoard', desc: 'A milk-bottle top, a hair slide, a house key, a baby tooth. All from the Row.', kind: 'thing' },
  /* rewards and keepsakes */
  { id: 'honey', name: 'Jar of honey', desc: 'Mrs Ruddock\'s. It tastes of beans and, faintly, of static.', kind: 'food', value: 600 },
  { id: 'whistle', name: 'Guard\'s whistle', desc: 'Brass. Blow it and somewhere a door you cannot see slams.', kind: 'trinket' },
  { id: 'ticket', name: 'Platform ticket', desc: 'HOLLIN HALT. NOT VALID FOR TRAVEL. Clipped, by somebody.', kind: 'trinket' },
  { id: 'chalk-twelve', name: 'The twelfth chalk', desc: 'The one that is not white. It is not any colour you could ask for in a shop.', kind: 'trinket' },
  { id: 'bell-end', name: 'Sally end', desc: 'A hand of red wool from the old bell rope. It still swings a little.', kind: 'trinket' },
  { id: 'tally-stick', name: 'Tally stick', desc: 'Notched for every ton cut. The notches go round the end and carry on.', kind: 'trinket' },
  { id: 'winding-pin', name: 'Winding pin', desc: 'From the drum in the winding house. The cable is still paying out without it.', kind: 'trinket' },
  { id: 'lune-slipper', name: 'One slipper', desc: 'Lune\'s. She gave it to you asleep and has not asked for it awake.', kind: 'trinket' },
  { id: 'rain-coin', name: 'Puddle penny', desc: 'Rook fished it from a puddle that was deeper than the road.', kind: 'trinket' },
  { id: 'cock-feather', name: 'Tin feather', desc: 'Off the weathercock of St Orrin\'s. It turns in your pocket.', kind: 'trinket' },
  { id: 'corin-note', name: 'Corin\'s note', desc: '"it was nice to hold one again. yours is kind. it asked after you."', kind: 'trinket' },
  { id: 'snow-globe', name: 'Snow globe', desc: 'Sallow Row under glass. Shake it and the lamps come on.', kind: 'trinket' },
  { id: 'left-glove', name: 'A left glove', desc: 'Child\'s, wool. The barrow has forty of these and no rights.', kind: 'trinket' },
  { id: 'postcard', name: 'Blank postcard', desc: 'GREETINGS FROM LOWMERE. The picture is of the valley, dry, with washing out.', kind: 'trinket' },
  { id: 'conker-king', name: 'A sixer', desc: 'A conker that has won six. It is warm on one side.', kind: 'trinket' },
  /* collectibles */
  { id: 'square', name: 'Chalked square', desc: 'A small square with a dot in it. You copy it into your sleeve.', kind: 'find' },
  { id: 'conker', name: 'Conker', desc: 'Split from its case, bright as a wet eye.', kind: 'find' },
);

type Stock = { item: string; price: number; limit?: number }[];
const stock = (id: string): Stock => (SHOPS.find((s) => s.id === id)?.stock ?? []) as Stock;
stock('dray').push({ item: 'bread', price: 1 }, { item: 'jam-jar', price: 2 });
stock('sull').push({ item: 'twine', price: 3 }, { item: 'oil-can', price: 4, limit: 1 }, { item: 'shears', price: 7, limit: 1 });
stock('lantern').push({ item: 'chips', price: 2 });

SHOPS.push(
  // Kept by Mrs Brine at the school kitchen hatch.
  { id: 'hatch', name: 'The kitchen hatch', open: ['day'], stock: [{ item: 'chalks', price: 2 }, { item: 'humbug', price: 1 }, { item: 'bread', price: 1 }] },
  // Kept by Mr Twelvetrees, wherever the barrow has stopped.
  { id: 'barrow', name: 'The barrow', open: ['dawn', 'day', 'dusk'], stock: [
    { item: 'candle', price: 2 }, { item: 'tonic', price: 4, limit: 3 }, { item: 'snow-globe', price: 14, limit: 1 },
    { item: 'left-glove', price: 1, limit: 1 }, { item: 'postcard', price: 2, limit: 1 }, { item: 'jam-jar', price: 1 },
  ] },
);

COLLECT.push(
  { id: 'square', name: 'Chalked squares', one: 'a chalked square', count: 11, item: 'square', districts: ['row', 'school', 'church', 'parade', 'rail', 'shore'],
    reward: { glow: 1500, sky: [['sun', 1]], flags: ['squares-all'] }, says: 'Eleven squares, each with its dot. Eleven houses under the mere. You have drawn the street plan of Lowmere on your sleeve.' },
  { id: 'conker', name: 'Conkers', one: 'a conker', count: 12, item: 'conker', districts: ['woods', 'park', 'lots', 'hill'],
    reward: { coins: 12, items: [['conker-king', 1]], sky: [['belt', 1]] }, says: 'Twelve conkers. Strung in a ring they will not hang straight. They hang toward the quarry.' },
);
