// Named places, hidden spots, signs and two gates for the story quests. Small tile edits only, on ground
// nothing else uses, so the base map and its paths stay as they were.
import { PLACES, GATES } from '../map';
import { T } from '../types';

PLACES.push(
  // Hollin Wood: a spur off the north path to a hollow oak, laced shut with brambles.
  { id: 'oak', name: 'The hollow oak', at: [92, 12], hidden: true, build: (b) => {
    b.rect(87, 12, 5, 1, T.PATH); b.rect(91, 11, 3, 3, T.GRASS); b.set(93, 11, T.TREE); b.set(92, 10, T.STUMP);
    b.set(88, 11, T.BUSH); b.set(88, 13, T.BUSH); b.set(89, 11, T.BUSH); b.set(89, 13, T.BUSH); b.set(90, 11, T.TREE); b.set(90, 13, T.TREE);
    b.set(87, 11, T.BUSH); b.set(87, 13, T.BUSH); b.set(91, 10, T.TREE); b.set(93, 10, T.TREE); b.set(94, 11, T.TREE); b.set(94, 12, T.TREE); b.set(94, 13, T.TREE);
    b.set(91, 14, T.TREE); b.set(92, 14, T.TREE); b.set(93, 14, T.TREE); b.set(90, 12, T.PATH); b.set(90, 14, T.TREE); b.set(90, 10, T.TREE);
  } },
  // The Down Line: a dead siding east of the signal box, behind a hand gate Harrow keeps.
  { id: 'buffer', name: 'The buffer stop', at: [150, 79], hidden: true, build: (b) => { b.rect(141, 78, 11, 2, T.GRAVEL); b.set(152, 78, T.ROCK); b.set(152, 79, T.ROCK); b.set(151, 78, T.STUMP); } },
  // St Orrin's: a capped well in the north-east corner, on the plan and not in the yard.
  { id: 'well', name: 'St Orrin\'s well', at: [33, 48], hidden: true, build: (b) => { b.rect(32, 47, 3, 3, T.GRASS); b.set(33, 47, T.ROCK); } },
  // Mast Hill: a cairn on the plateau, outside the mast fence.
  { id: 'cairn', name: 'The cairn', at: [16, 9], hidden: true, build: (b) => { b.rect(15, 8, 3, 3, T.GRASS); b.set(16, 8, T.ROCK); } },
  // Lowmere: where the water stops, and has stopped for thirty years.
  { id: 'low-water', name: 'The low-water mark', at: [120, 136], hidden: true },
  { id: 'plot9', name: 'Plot 9', at: [26, 109] },
  { id: 'hive', name: 'The hives', at: [35, 97] },
  { id: 'bandstand', name: 'Where the bandstand was', at: [97, 92] },
  { id: 'winding', name: 'The winding house', at: [118, 34] },
  { id: 'boiler', name: 'The boiler house', at: [148, 52] },
  { id: 'hopscotch', name: 'The hopscotch', at: [130, 66] },
  { id: 'stones', name: 'The stepping stones', at: [36, 132] },
  { id: 'sign-lane', name: 'Sign', at: [50, 71], sign: 'BACK LANE. NO THROUGH ROAD. Under it, in biro: "there is, at night."' },
  { id: 'sign-oak', name: 'Sign', at: [85, 13], sign: 'COPPICE. Private. The letters have been cut in, then filled with moss, by hand.' },
  { id: 'sign-siding', name: 'Sign', at: [136, 77], sign: 'SIDING No. 9. OUT OF USE. Wagons left here are not collected. They are not here in the morning either.' },
  { id: 'sign-stand', name: 'Sign', at: [100, 92], sign: 'BANDSTAND. Removed 1931 for safety. On summer evenings please do not dance on the site.' },
  { id: 'sign-shore', name: 'Sign', at: [122, 135], sign: 'LOW WATER. The mark has not moved since it was painted. The paint is renewed each spring; nobody is paid to.' },
  { id: 'sign-yard', name: 'Sign', at: [114, 56], sign: 'PLAYGROUND RULES. 1. No running. 2. No chalk. 3. If a game is already drawn, finish it.' },
  { id: 'sign-winding', name: 'Sign', at: [122, 34], sign: 'WINDING HOUSE. Depth of shaft: the figure has been chiselled out, and a longer one chiselled in, four times.' },
  { id: 'sign-cut2', name: 'Sign', at: [30, 126], sign: 'ELVERS RUN IN RAIN. Take none. They are expected somewhere.' },
);

GATES.push(
  { id: 'brambles', at: [89, 12], look: 'dark', open: { has: 'shears' }, shut: 'Brambles, laced across the path like handwriting. Shears would do it.' },
  { id: 'siding', at: [141, 78], h: 2, look: 'bar', open: { flag: 'siding-open' }, shut: 'A hand gate, wired to a lever in the signal box. Harrow would have to pull it.' },
);
