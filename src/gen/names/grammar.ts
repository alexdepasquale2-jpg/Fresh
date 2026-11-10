// The wider name grammar, as data. Eight phonetic families: a universe leans to one, so the systems,
// worlds, villages and people inside it sound like they belong to each other.
// Patterns: {s} short stem, {S} long stem, {p} place ending, {e} person ending, {w} a family word,
// any other {key} is a list in WIDE.

export interface Family {
  readonly id: string;
  readonly onset: readonly string[];
  readonly vowel: readonly string[];
  readonly coda: readonly string[];
  /** Endings for places and for people, joined straight onto a stem. */
  readonly place: readonly string[];
  readonly person: readonly string[];
  /** Whole words in the family's mood, for compounds. */
  readonly words: readonly string[];
}

export const FAMILIES: readonly Family[] = [
  { id: 'salt', onset: ['l', 'm', 's', 'v', 'n', 'sh', 'th', 'w', 'l', 's'], vowel: ['a', 'e', 'ai', 'o', 'ea', 'a', 'e'], coda: ['l', 'n', 'r', 's', 'th', 'n'],
    place: ['mere', 'low', 'wen', 'lis', 'eth', 'shore', 'lea', 'sand'], person: ['a', 'en', 'is', 'el', 'ene', 'wyn'], words: ['Salt', 'Brine', 'Shoal', 'Gull', 'Tide', 'Kelp', 'Foam', 'Strand'] },
  { id: 'bone', onset: ['k', 'g', 'd', 't', 'br', 'kr', 'gr', 'dr', 'b'], vowel: ['o', 'u', 'a', 'ou', 'o', 'a'], coda: ['k', 'g', 'rd', 'rn', 'm', 'r'],
    place: ['gar', 'dun', 'rok', 'holt', 'mor', 'barrow', 'cairn', 'tor'], person: ['ok', 'ar', 'und', 'a', 'gan', 'ra'], words: ['Bone', 'Cairn', 'Horn', 'Flint', 'Marrow', 'Tusk', 'Antler', 'Stone'] },
  { id: 'wax', onset: ['p', 'b', 'm', 'h', 'w', 'bl', 'pl', 't'], vowel: ['o', 'oo', 'u', 'a', 'ow', 'o'], coda: ['m', 'b', 'p', 'll', 'mp', 'n'],
    place: ['ham', 'bury', 'wick', 'pool', 'combe', 'well', 'hive', 'stead'], person: ['o', 'om', 'by', 'kin', 'ow', 'ell'], words: ['Wax', 'Tallow', 'Candle', 'Honey', 'Wick', 'Comb', 'Lamp', 'Amber'] },
  { id: 'moth', onset: ['f', 'h', 's', 'th', 'wh', 'ph', 'fl', 'v'], vowel: ['i', 'e', 'y', 'ei', 'a', 'i'], coda: ['th', 'sh', 'f', 'ss', 'n', 'l'],
    place: ['fen', 'hithe', 'sith', 'veil', 'feth', 'hush', 'loft', 'dusk'], person: ['ith', 'is', 'eph', 'a', 'iel', 'yn'], words: ['Moth', 'Dusk', 'Hush', 'Veil', 'Feather', 'Whisper', 'Soot', 'Lint'] },
  { id: 'cinder', onset: ['c', 'z', 'x', 'ch', 'sk', 'st', 'v', 'k'], vowel: ['i', 'a', 'e', 'ia', 'a', 'i'], coda: ['x', 'z', 't', 'sk', 'nt', 'r'],
    place: ['zar', 'cht', 'ix', 'stead', 'tane', 'forge', 'scar', 'kiln'], person: ['ix', 'az', 'et', 'ia', 'ane', 'ek'], words: ['Cinder', 'Ember', 'Slag', 'Kiln', 'Char', 'Spark', 'Coal', 'Scorch'] },
  { id: 'fen', onset: ['gl', 'sl', 'dr', 'm', 'n', 'w', 'y', 'r'], vowel: ['u', 'o', 'e', 'ou', 'a', 'u'], coda: ['g', 'd', 'sh', 'rl', 'mb', 'm'],
    place: ['mire', 'slough', 'wade', 'marsh', 'reach', 'sedge', 'moss', 'ford'], person: ['a', 'ud', 'ow', 'en', 'eg', 'ru'], words: ['Fen', 'Mire', 'Reed', 'Sedge', 'Moss', 'Eel', 'Peat', 'Rush'] },
  { id: 'elder', onset: ['', '', 'l', 'r', 'n', 'd', 'v', 'th'], vowel: ['ae', 'e', 'o', 'u', 'au', 'ie', 'e'], coda: ['l', 'r', 'n', 'nd', 'th', 's'],
    place: ['ael', 'dor', 'iel', 'oth', 'une', 'vale', 'spire', 'hall'], person: ['iel', 'or', 'aen', 'us', 'eth', 'ara'], words: ['Elder', 'Yew', 'Lich', 'Crown', 'Vault', 'Psalm', 'Relic', 'Aeon'] },
  { id: 'rook', onset: ['r', 'k', 't', 'n', 'c', 'cr', 'tr', 'h'], vowel: ['oo', 'a', 'i', 'aw', 'e', 'a'], coda: ['k', 'ck', 't', 'rt', 'n', 'p'],
    place: ['rook', 'croft', 'tarn', 'wick', 'garth', 'thorpe', 'gate', 'nock'], person: ['ic', 'ot', 'ack', 'en', 'in', 'art'], words: ['Rook', 'Crow', 'Thorn', 'Hob', 'Nettle', 'Burr', 'Rag', 'Twig'] },
];

export const WIDE = {
  noun: ['Ossuary', 'Choir', 'Tallow', 'Reliquary', 'Lantern', 'Vigil', 'Censer', 'Hollow', 'Wick', 'Psalter', 'Cairn', 'Orrery', 'Vesper', 'Shroud', 'Sallow', 'Gloam',
    'Litany', 'Thurible', 'Cloister', 'Gnomon', 'Almanac', 'Lodestar', 'Vessel', 'Undercroft', 'Sextant', 'Reredos', 'Catafalque', 'Requiem', 'Antiphon', 'Compline', 'Nocturne', 'Tabernacle',
    'Hourglass', 'Meridian', 'Threshold', 'Ember', 'Sepulchre', 'Chantry', 'Belfry', 'Lacuna', 'Penumbra', 'Votive', 'Chalice', 'Canticle', 'Lychgate', 'Solstice', 'Umbra', 'Halo'],
  adj: ['Pallid', 'Minor', 'Major', 'Hollow', 'Ashen', 'Wan', 'Lesser', 'Grey', 'Lambent', 'Quiet', 'Drowned', 'Pale', 'Last', 'Low',
    'Sunken', 'Unlit', 'Patient', 'Thin', 'Further', 'Nether', 'Tarnished', 'Kept', 'Sleeping', 'Borrowed', 'Faint', 'Waning', 'Second', 'Inner', 'Unsung', 'Mended', 'Late', 'Still', 'Bitter', 'Mild', 'Lost', 'Small'],
  rank: ['Minor', 'Major', 'Lesser', 'Prime', 'Inferior', 'Reverse', 'Below', 'Again', 'Twice', 'Unnumbered'],
  thing: ['Well', 'Lamp', 'Stair', 'Door', 'Bell', 'Loom', 'Kiln', 'Hearth', 'Gate', 'Mill', 'Bridge', 'Rest', 'Watch', 'Cross', 'Orchard', 'Quay'],
  body: ['Eye', 'Hand', 'Crown', 'Mouth', 'Rib', 'Tooth', 'Lung', 'Heel', 'Brow', 'Spine'],
  number: ['Two', 'Three', 'Seven', 'Nine', 'Twelve', 'Forty', 'Hundred'],
  plural: ['Silences', 'Lamps', 'Bells', 'Tides', 'Ashes', 'Hours', 'Doors', 'Sleepers', 'Moths', 'Candles', 'Salts', 'Windows', 'Names', 'Rains', 'Stairs', 'Embers', 'Roots', 'Rings', 'Suns', 'Moons'],
  agePlain: ['Tides', 'Ash', 'Lamps', 'Quiet', 'Salt', 'Long Night', 'Two Suns', 'Falling Stone', 'Moss', 'Bells', 'Small Fires', 'Rings',
    'Glass', 'Wax', 'Sleep', 'Dust', 'Slow Water', 'Thorns', 'Kilns', 'Open Doors', 'Cold Hearths', 'First Roofs', 'Empty Roads', 'Low Skies', 'Deep Wells', 'Paper', 'Iron', 'Listening', 'Thaw', 'Hunger', 'Plenty', 'Mending'],
  ageAdj: ['Quiet', 'Long', 'Cold', 'Low', 'Pale', 'Small', 'Late', 'Bitter', 'Mild', 'Thin', 'Second', 'Last', 'Borrowed', 'Slow'],
  creedNoun: ['Rule', 'Vigil', 'Silence', 'Order', 'Way', 'Keeping', 'Covenant', 'Watch', 'Fast', 'Psalm', 'Vow', 'Lamp', 'Thread', 'Remnant', 'Witness', 'Table'],
  creedFolk: ['Keepers', 'Children', 'Sisters', 'Brothers', 'Watchers', 'Menders', 'Listeners', 'Bearers', 'Tenders', 'Heirs', 'Friends', 'Servants'],
  creedOf: ['the Low Lamp', 'the Open Hand', 'the Second Sun', 'the Still Water', 'the Empty Chair', 'the Long Night', 'the Small Fire', 'the Shut Door', 'the Falling Stone', 'the Pale Moon', 'the Salt Road', 'the Last Bell', 'the Green Thread', 'the Deep Well', 'the One Above', 'Ash', 'Rain', 'Glass', 'Moss', 'Tallow'],
  epithet: ['the Quiet', 'the Younger', 'the Elder', 'the Lame', 'the Patient', 'the Grey', 'the Mender', 'the Kind', 'the Tall', 'the Late', 'the Unlit', 'the Small', 'Twice-born', 'Lampwright', 'Bellfounder', 'Saltwife', 'Wellkeeper', 'Kilnsman', 'Reedcutter', 'Ashwalker'],
} as const;

export const PATTERNS = {
  universe: ['{noun} {rank}', '{adj} {noun}', '{adj} {noun}', '{noun} of {plural}', 'The {adj} {noun}', '{w}{p}', '{noun} {S}', '{S} {rank}', '{number} {plural}', '{w} {noun}', '{noun} and {w}', 'The {noun}', '{S}{p} {noun}'],
  system: ['The {noun}', '{noun} of {S}{p}', '{S} {rank}', "{S}'s {body}", 'The {adj} {body}', '{S}{p} {noun}', '{w} {noun}', '{number} {plural}', '{adj} {S}', 'The {S} {thing}'],
  planet: ['{s}{p}', '{s}{p}', '{S}{p}', '{S}', '{w}{p}', '{S} {rank}', '{s}{p}', '{S}{e}', "{S}'s {thing}", '{adj} {s}{p}'],
  village: ['{s}{p}', '{w}{p}', '{S}{p}', "{S}'s {thing}", '{s}{p} {thing}', '{adj} {s}{p}', '{w} {thing}', '{s}{p}', 'Low {s}{p}', 'High {s}{p}', '{S}{p}'],
  person: ['{s}{e}', '{S}{e}', '{S}', '{s}{e} {S}{p}', '{S}{e} {epithet}', '{s}{e} {epithet}', '{S} {S}{e}', '{s}{e}', '{S}{e} of {s}{p}'],
  age: ['Age of {agePlain}', 'Age of {agePlain}', 'Age of {ageAdj} {plural}', 'Age of {number} {plural}', 'Age of the {adj} {thing}', 'Age of {w}', 'Age of {w} and {w}', 'Age of {ageAdj} {w}'],
  creed: ['The {adj} {creedNoun}', '{creedFolk} of {creedOf}', 'The {number} {plural}', '{creedNoun} of {creedOf}', 'The {w} {creedNoun}', 'The {s}ite {creedNoun}', '{creedFolk} of {S}{e}', "{S}{e}'s {creedNoun}", 'The {creedNoun} of {plural}'],
} as const;
