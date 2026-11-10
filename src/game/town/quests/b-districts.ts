// One arc for each district, so every place has a reason to be gone back to at another hour or in other weather.
import { QUESTS } from '../quests';
import type { Look } from '../types';

const LUNE: Look = { hair: 9, top: 9, legs: 9, skin: 8 };

QUESTS.push(
  /* ---------- Hollin Primary ---------- */
  {
    id: 'chalk', name: 'The Eleventh Square', thread: 'side', giver: 'hob',
    offer: 'By day the hopscotch has ten squares. After dark it has eleven. I want to know who draws the eleventh. I am not allowed out. You are, apparently.',
    accept: 'Take chalk. Mrs Brine sells it at the kitchen hatch.',
    steps: [
      { hint: 'Buy a box of chalks from Mrs Brine at the school kitchen hatch (daytime).', on: { type: 'cond', need: { has: 'chalks' } }, mark: [143, 54] },
      { hint: 'Go to the hopscotch in the middle of the school yard, at night.', on: { type: 'reach', at: [130, 66], r: 2, need: { phase: 'night' }, say: 'Eleven squares, the last one fresh. In it lies a stick of chalk that is not white. You draw a twelfth square, to see. When you look up, the eleventh has a dot in it.' }, give: { take: [['chalks', 1]], items: [['chalk-twelve', 1]] } },
      { hint: 'Tell Hob in the yard, by day.', on: { type: 'talk', npc: 'hob', say: 'You drew a twelfth? Then tonight there will be thirteen. You do not finish a game by adding to it. Well. I shall hop it tomorrow and see where it lets me off.' } },
    ],
    reward: { coins: 6, sky: [['dust', 2]] }, end: 'The hopscotch has twelve squares now. Nobody will own up to the eleventh.',
  },
  /* ---------- The Parade and the Down Line (interlocked) ---------- */
  {
    id: 'usual', name: 'The Usual', thread: 'side', giver: 'etta',
    offer: 'Dad shuts at dusk and I do the round he forgets. Mr Harrow at the halt has "the usual" from the Lantern every night, and nobody takes it to him. He cannot leave the levers. Would you? Ask Oona for it by name.',
    accept: 'The halt is over the line. At night the barrier is down: go round by the footbridge.',
    steps: [
      { hint: 'Buy "the usual" at the Lantern Café, east end of the Parade.', on: { type: 'cond', need: { has: 'chips' } }, mark: [147, 99] },
      { hint: 'Take it to Mr Harrow at Hollin Halt, at dusk or night.', on: { type: 'talk', npc: 'harrow', need: { phase: ['dusk', 'night'] }, say: 'The usual. Still hot. Forty years of nights and somebody has thought of me. Tell the Brisk girl I logged it. Under "arrivals".' }, give: { take: [['chips', 1]] } },
      { hint: 'Tell Etta Brisk on the Parade (dusk and night).', on: { type: 'talk', npc: 'etta', say: 'Under arrivals? He has never had an arrival. That is the first one in forty years and it was chips. Here. This was Grandad\'s. He was a guard, when there was something to guard.' } },
    ],
    reward: { items: [['whistle', 1]], coins: 5 }, end: 'Mr Harrow logged an arrival. It was chips.',
  },
  {
    id: 'siding', name: 'Lever Nine', thread: 'side', giver: 'harrow', needs: { quest: ['usual', 'done'] },
    offer: 'Lever nine works the hand gate to the dead siding. It has not moved since the valley went under, and it screams. Sull sells an oil can. Fetch one and I will pull it, and you can tell me what is on the siding. I am not permitted to look.',
    steps: [
      { hint: 'Buy an oil can at Sull & Son (daytime).', on: { type: 'cond', need: { has: 'oil-can' } }, mark: [139, 99] },
      { hint: 'Bring the oil can to Mr Harrow at the halt, at dusk or night.', on: { type: 'talk', npc: 'harrow', need: { phase: ['dusk', 'night'] }, say: 'One drop. There. Hear that? Nothing. That is the sound of nine. The hand gate east of the signal box is open. Go at night. By day there is nothing on the siding to see.' }, give: { take: [['oil-can', 1]], flags: ['siding-open'] } },
      { hint: 'Walk the dead siding east of the signal box to the buffer stop, at night.', on: { type: 'reach', at: [149, 79], r: 1, need: { phase: 'night' }, say: 'One wagon, door slid open. Inside, a stack of plain boxes, each the size of a lunch box, each tied with a label. All the labels say the same thing.' }, give: { items: [['wagon-label', 1]] } },
      { hint: 'Show the label to Mara Finch on the platform (day or dusk).', on: { type: 'talk', npc: 'mara', say: 'RETURNED TO SENDER. So one does come. I have been counting on the wrong platform. It comes, and it goes back full. Whoever those were for said no.' }, give: { take: [['wagon-label', 1]] } },
    ],
    reward: { items: [['ticket', 1]], sky: [['comet', 1]], coins: 8 }, end: 'There is a wagon of boxes on the dead siding at night. They are going back.',
  },
  /* ---------- St Orrin's Yard and the Allotments (interlocked) ---------- */
  {
    id: 'bell', name: 'One Bell', thread: 'side', giver: 'pym',
    offer: 'St Orrin\'s has one bell, and the rope has gone to dust. Twine would do. Tarred, from Sull\'s. I shall splice it; you shall ring it, at dawn, because I have rung it eleven thousand times and I should like to hear it from outside.',
    steps: [
      { hint: 'Buy a ball of twine at Sull & Son (daytime).', on: { type: 'cond', need: { has: 'twine' } }, mark: [139, 99] },
      { hint: 'Bring the twine to Miss Pym at the church door.', on: { type: 'talk', npc: 'pym', say: 'That will hold. Come to the door at dawn and pull once. Only once.' }, give: { take: [['twine', 1]] } },
      { hint: 'Ring the bell at the church door, at dawn.', on: { type: 'reach', at: [22, 55], r: 1, need: { phase: 'dawn' }, say: 'You pull once. The bell rings eleven. Out in the yard, the stones that lean toward each other lean a little more.' } },
      { hint: 'Tell Miss Pym what you heard.', on: { type: 'talk', npc: 'pym', say: 'Eleven. It has always been eleven, whoever pulls and however often. I wanted to know whether it was me. Have the old sally. It is no use and I cannot bring myself to burn it.' } },
    ],
    reward: { items: [['bell-end', 1]], coins: 6, glow: 300 }, end: 'The bell of St Orrin\'s rings eleven, whoever pulls.',
  },
  {
    id: 'plan', name: 'Three Hundred and Five', thread: 'side', giver: 'loam', needs: { quest: ['m1', 'done'] },
    offer: 'Three hundred and five on the plan, three hundred and four in the yard. The odd one is drawn in the north-east corner as a circle, not a stone. I do not go to that corner. Take a candle and go at dusk. The barrow man sells church ends he has no business having.',
    steps: [
      { hint: 'Buy a church candle from Mr Twelvetrees\' barrow (Sallow Row at dawn, behind the shops by day, the Parade at dusk).', on: { type: 'cond', need: { has: 'candle' } }, mark: [108, 102] },
      { hint: 'Find the circle on the plan: the north-east corner of the churchyard, at dusk.', on: { type: 'reach', at: [33, 49], r: 1, need: { phase: 'dusk', has: 'candle' }, say: 'A well, capped with a slab. You stand the candle on it. The flame leans down toward the stone, the way the beans lean to the mast. Under the slab, a long way off, a bell rings once.' }, give: { take: [['candle', 1]] } },
      { hint: 'Tell Mr Loam.', on: { type: 'talk', npc: 'loam', say: 'A well. Then the plan is right and the yard is one short. I shall count it as a stone. Somebody is under it, in a manner of speaking. Several somebodies.' } },
    ],
    reward: { coins: 8, sky: [['dust', 1]], glow: 400 }, end: 'The three hundred and fifth stone is a well.',
  },
  {
    id: 'bees', name: 'Telling the Bees', thread: 'side', giver: 'ruddock', needs: { quest: ['bell', 'done'] },
    offer: 'Bees must be told the news or they leave. Mine have had none since 1931 and they are restless. You rang the bell: ask Miss Pym what it said, then tell the hives. Three mornings; they do not believe a thing said once.',
    accept: 'The hives are by the east path, between the plots.',
    steps: [
      { hint: 'Ask Miss Pym at St Orrin\'s what the news is.', on: { type: 'talk', npc: 'pym', say: 'Tell them it rang eleven. Tell them it will ring eleven tomorrow. That is all the news there is, and it is plenty.' } },
      { hint: 'Tell the hives, at the east side of the allotments.', on: { type: 'reach', at: [35, 97], r: 1, say: 'You tell the hives. The hum drops a note, as if listening.' } },
      { hint: 'Come back tomorrow.', on: { type: 'wait', days: 1 }, mark: [35, 97] },
      { hint: 'Tell the hives a second time.', on: { type: 'reach', at: [35, 97], r: 1, say: 'You tell them again. A few come out and stand on the landing board, facing you.' } },
      { hint: 'One more day.', on: { type: 'wait', days: 1 }, mark: [35, 97] },
      { hint: 'Tell the hives a third time, at dawn.', on: { type: 'reach', at: [35, 97], r: 1, need: { phase: 'dawn' }, say: 'You tell them a third time, at dawn. The whole hive answers with one note. It is the mast\'s note, a long way up.' } },
      { hint: 'Tell Mrs Ruddock.', on: { type: 'talk', npc: 'ruddock', say: 'Settled. I can hear it from here. They only wanted to know that nothing had changed. That is all any of us are waiting to be told.' } },
    ],
    reward: { items: [['honey', 1]], sky: [['rings', 1]], coins: 6 }, end: 'The bees have been told. Nothing has changed, and they are glad of it.',
  },
  /* ---------- Hollin Wood ---------- */
  {
    id: 'oak', name: 'The Hollow Oak', thread: 'side', giver: 'tarn',
    offer: 'There is a hollow oak off the north path, and brambles across the way in that were not there in spring. A jackdaw goes in and out with things from your street. Cut through and see what it has. Sull has shears.',
    accept: 'North path, where the coppice sign is. East of it.',
    steps: [
      { hint: 'Buy hedge shears at Sull & Son (daytime).', on: { type: 'cond', need: { has: 'shears' } }, mark: [139, 99] },
      { hint: 'Cut through the brambles on the north path of Hollin Wood and look inside the oak.', on: { type: 'reach', at: [92, 12], r: 1, say: 'Inside the oak, on a ledge of dry rot: a milk-bottle top, a hair slide, a door key, a tooth. And a parcel label, blank, pecked full of holes.' }, give: { items: [['hoard', 1]] } },
      { hint: 'Show Tarn what the jackdaw kept.', on: { type: 'talk', npc: 'tarn', say: 'All from the Row. One thing from each house that has a box in it. I have watched it choose. It had not been to yours. Hm. Look in your pockets when you get home.' }, give: { take: [['hoard', 1]] } },
    ],
    reward: { coins: 8, sky: [['belt', 1]], glow: 300 }, end: 'The jackdaw takes one thing from every house with a box in it.',
  },
  /* ---------- Mast Hill ---------- */
  {
    id: 'weathercock', name: 'The Weathercock', thread: 'side', giver: 'vane',
    offer: 'The cock on St Orrin\'s is the only thing in this parish that tells the truth, and only in wind. In wind it points at a cairn on the hilltop, north-west of the mast. Stand there in a wind and tell me what it is pointing you at.',
    accept: 'Through the gap in the crag, then left round the fence. Wait for wind.',
    steps: [
      { hint: 'Stand at the cairn on top of Mast Hill (north-west of the mast fence) while the wind is up.', on: { type: 'reach', at: [16, 9], r: 1, need: { weather: 'wind' }, say: 'Wind. From the cairn you can see the cock on St Orrin\'s, and it is pointing straight at you. Past you. You turn round. Behind the cairn the hill goes down to nothing mapped. A tin feather is wedged in the stones.' }, give: { items: [['cock-feather', 1]] } },
      { hint: 'Tell Ms Vane on Mast Hill (dawn and day).', on: { type: 'talk', npc: 'vane', say: 'At the edge. Of course. It points at the edge of the sheet, where I stop drawing. I shall put the cairn in. It will be the first thing on this map that knows it is on one.' } },
    ],
    reward: { sky: [['comet', 1]], coins: 8 }, end: 'In wind the weathercock points at the edge of the map.',
  },
  {
    id: 'hum', name: 'A Jar of Hum', thread: 'side', giver: 'tam',
    offer: 'I built a crystal set and it only gets one station, and the station is the mast. I want a bit of it to keep. Get a jam jar from Dray\'s, hold it open at the mast gate at night, and put the lid on quick.',
    steps: [
      { hint: 'Buy a jam jar at Dray\'s Corner.', on: { type: 'cond', need: { has: 'jam-jar' } }, mark: [115, 99] },
      { hint: 'Hold the jar open at the mast gate on Mast Hill, at night.', on: { type: 'reach', at: [25, 21], r: 1, need: { phase: 'night', has: 'jam-jar' }, say: 'You hold the jar up to the gate. The hum goes in like water. You screw the lid down. It is still humming in there, smaller.' }, give: { take: [['jam-jar', 1]], items: [['hum-jar', 1]] } },
      { hint: 'Let Tam listen (below the mast, dusk and night).', on: { type: 'talk', npc: 'tam', say: 'Give it here. No. Keep it, I have heard what I wanted. It is not one hum. It is a lot of small ones, in a queue. Waiting to be sent.' } },
    ],
    reward: { sky: [['dust', 1]], coins: 5, glow: 300 }, end: 'The hum of the mast is a queue of small hums.',
  },
  /* ---------- The Cut ---------- */
  {
    id: 'elver', name: 'Glass Eels', thread: 'side', giver: 'coble',
    offer: 'Glass eels come up the Cut in rain, on their way to under the mere. You can read a paper through one. Bring a jam jar to the stepping stones while it is raining and dip one out. Then I will tell you what it is worth.',
    accept: 'In rain, mind. Dry days they are not there to be had.',
    steps: [
      { hint: 'Buy a jam jar at Dray\'s Corner.', on: { type: 'cond', need: { has: 'jam-jar' } }, mark: [115, 99] },
      { hint: 'Go to the stepping stones in the Cut while it is raining.', on: { type: 'reach', at: [36, 133], r: 2, need: { weather: 'rain', has: 'jam-jar' }, say: 'Rain on the Cut. Between the stones the water is full of them, clear as the water. One swims into the jar as if it had been told to.' }, give: { take: [['jam-jar', 1]], items: [['elver', 1]] } },
      { hint: 'Take the glass eel to Old Coble (the Cut, dawn or dusk) and decide.', on: { type: 'cond', need: { any: [{ flag: 'elver-sold' }, { flag: 'elver-free' }] } }, mark: [38, 129] },
    ],
    reward: { coins: 3, glow: 200 }, end: 'A glass eel went one way or the other. Old Coble remembers which.',
  },
  /* ---------- Penny Rec ---------- */
  {
    id: 'puddles', name: 'Three Puddles', thread: 'side', giver: 'rook',
    offer: 'It only looks like the Rec when it is dry. In rain you can see where it is deeper than it should be. Three puddles: west path, east path, and where the bandstand was. Stand in each while it is still raining and tell me which has no bottom.',
    steps: [
      { hint: 'In rain: the puddle on the west path of Penny Rec, beside the pond.', on: { type: 'reach', at: [62, 104], r: 1, need: { weather: 'rain' }, say: 'Ankle deep. Ordinary. Your reflection waits for you to finish.' } },
      { hint: 'In rain: the puddle on the east path of Penny Rec.', on: { type: 'reach', at: [90, 104], r: 1, need: { weather: 'rain' }, say: 'This one shows the lamp above it lit. The lamp is not lit.' } },
      { hint: 'In rain: where the bandstand was, north-east corner of the Rec.', on: { type: 'reach', at: [97, 92], r: 2, need: { weather: 'rain' }, say: 'Where the bandstand was. The puddle here is black and does not ring when the rain hits it. You do not put your foot in.' } },
      { hint: 'Tell Rook. He is only out in the rain.', on: { type: 'talk', npc: 'rook', say: 'The bandstand one. I dropped a penny in it last spring and I am still listening for it. Here is one I got out of a different puddle. Look at the year.' } },
    ],
    reward: { items: [['rain-coin', 1]], coins: 7, sky: [['dust', 1]] }, end: 'One puddle in Penny Rec has no bottom. It is where the bandstand was.',
  },
  {
    id: 'bread', name: 'No Feeding', thread: 'side', giver: 'yarrow',
    offer: 'The sign says no feeding what comes to the pond. I painted it. I did not say what comes because I have only ever seen the bread go. Buy a heel of bread at Dray\'s and stand on the jetty at dusk. Do not throw it. Only have it on you.',
    steps: [
      { hint: 'Buy a heel of bread (Dray\'s Corner, or the school kitchen hatch).', on: { type: 'cond', need: { has: 'bread' } }, mark: [115, 99] },
      { hint: 'Stand on the jetty of Penny Pond at dusk, with the bread.', on: { type: 'reach', at: [76, 114], r: 1, need: { phase: 'dusk', has: 'bread' }, say: 'Dusk on the jetty. Under the water a pale shape rises, the exact size and outline of the heel of bread in your pocket, and waits.' } },
      { hint: 'Mr Yarrow is by the jetty at dusk. Decide about the bread.', on: { type: 'cond', need: { any: [{ flag: 'pond-fed' }, { flag: 'pond-unfed' }] } }, mark: [77, 117] },
    ],
    reward: { coins: 6 }, end: 'Something in Penny Pond takes the shape of what you bring it.',
  },
  /* ---------- The Old Workings ---------- */
  {
    id: 'tally', name: 'Stone Tally', thread: 'side', giver: 'jem',
    offer: 'They notched a stick for every ton, and when the stick was full they cut the tally in the rock. Three faces. I cannot read them now; my eyes are on the far thing. Go round by daylight and read me the three.',
    accept: 'North-west corner. North-east corner. And the face by the ramp.',
    steps: [
      { hint: 'By daylight: read the tally in the north-west corner of the quarry.', on: { type: 'reach', at: [115, 6], r: 2, need: { phase: ['dawn', 'day'] }, say: 'The north-west face. Notches in fives, a field of them. At the bottom, the last tally cut in words: ELEVEN.' } },
      { hint: 'By daylight: read the tally in the north-east corner of the quarry.', on: { type: 'reach', at: [153, 7], r: 2, need: { phase: ['dawn', 'day'] }, say: 'The north-east face. The same count, and under it the same word. ELEVEN.' } },
      { hint: 'By daylight: read the face by the ramp, just south of the pit.', on: { type: 'reach', at: [134, 28], r: 1, need: { phase: ['dawn', 'day'] }, say: 'The face by the ramp. No tally. One notch, very deep and quite fresh, at the height of a child\'s hand.' } },
      { hint: 'Read them to Jem Hale at the winding house (dusk and night).', on: { type: 'talk', npc: 'jem', need: { phase: ['dusk', 'night'] }, say: 'Eleven, and eleven, and one. That is the right sum. The one is still being cut. Have the stick. It is full, and I shall not be starting another.' } },
    ],
    reward: { items: [['tally-stick', 1]], sky: [['belt', 1]], coins: 9 }, end: 'Eleven, eleven, and one still being cut.',
  },
  /* ---------- Lowmere Edge ---------- */
  {
    id: 'fogwalk', name: 'The Other Dog', thread: 'side', giver: 'hollis',
    offer: 'Have you seen a dog? Grey. No, that one is Ada\'s. Mine is the other one. He slipped his lead at the low-water mark in a fog like this, and I only come out when it is the same fog. Would you look? Along the sand, east of the pier.',
    steps: [
      { hint: 'In fog: search the sand at the low-water mark, east of the Long Pier.', on: { type: 'reach', at: [120, 136], r: 1, need: { weather: 'fog' }, say: 'A lead on the sand at the water\'s edge. The clip is fastened; the collar loop is pulled tight around nothing. Paw prints go from it into the mere. None come back.' }, give: { items: [['dog-lead', 1]] } },
      { hint: 'Bring the lead to Mrs Hollis. She only walks the shore in fog.', on: { type: 'talk', npc: 'hollis', say: 'His lead. Fastened. Then he did not slip it. He is still on it. Thank you. I shall hold this end. He will come up when the fog is the right way round.' }, give: { take: [['dog-lead', 1]] } },
    ],
    reward: { glow: 600, sky: [['dust', 2]], coins: 5 }, end: 'Mrs Hollis has her end of the lead.',
  },
  /* ---------- Sallow Row ---------- */
  {
    id: 'float', name: 'The Dawn Round', thread: 'side', giver: 'dunnock',
    offer: 'Three gold tops left and the sun nearly up. They must be on the step before day or they turn. No. 2 at the west end, No. 12 along the Row, and No. 9 by its back gate in the lane. Run. I mean it kindly.',
    accept: 'Before seven. If the sun beats you, they keep till tomorrow\'s dawn. Only till then.', start: { items: [['gold-top', 3]] },
    steps: [
      { hint: 'Before dawn ends (07:00): a gold top to No. 2, the west end of Sallow Row.', on: { type: 'reach', at: [46, 57], r: 1, need: { phase: 'dawn' }, say: 'No. 2. The bottle is taken in while your hand is still on it.' }, give: { take: [['gold-top', 1]] } },
      { hint: 'Before dawn ends: a gold top to No. 12, east along the Row.', on: { type: 'reach', at: [86, 57], r: 1, need: { phase: 'dawn' }, say: 'No. 12. An empty is waiting, rinsed, with a note in it: "one fewer from Thursday".' }, give: { take: [['gold-top', 1]] } },
      { hint: 'Before dawn ends: a gold top to the back gate of No. 9, in the back lane.', on: { type: 'reach', at: [79, 70], r: 1, need: { phase: 'dawn' }, say: 'No. 9, by the back gate. The step is warm. Somebody has been sitting on it, waiting.' }, give: { take: [['gold-top', 1]] } },
      { hint: 'Tell Mr Dunnock. He is only on the Row at dawn.', on: { type: 'talk', npc: 'dunnock', say: 'All three down before the sun. Then they will stay milk. I do not say what the late ones turn to. I have only ever found the bottles.' } },
    ],
    reward: { coins: 8, items: [['milk', 1]], glow: 300 }, end: 'Three gold tops, down before the sun.',
  },
  {
    id: 'lune', name: 'Lune Walks', thread: 'side', giver: 'lune', needs: { fact: ['light', '>=', 5] },
    offer: 'She is asleep, standing up, in a nightdress and one slipper. "Walk me home," she says, without waking. "Your light in front. I follow the light."',
    accept: 'She waits for Mote to move, and steps where it has been.',
    steps: [
      { hint: 'Lead Lune west along the back lane, at night. Keep Mote ahead of her.', on: { type: 'reach', at: [75, 70], r: 1, need: { phase: 'night' }, say: 'She walks where Mote has been, exactly, a few steps late.' }, actor: LUNE },
      { hint: 'Lead Lune up the cut-through to the Row, at night.', on: { type: 'reach', at: [75, 62], r: 1, need: { phase: 'night' }, say: 'Past the lamp. Her shadow falls the wrong way from it. Toward you.' }, actor: LUNE },
      { hint: 'Lead Lune to her door: No. 14, the east end of Sallow Row, at night.', on: { type: 'reach', at: [94, 57], r: 1, need: { phase: 'night' }, say: 'No. 14. The door is open the width of a child. She goes in without touching it. Upstairs a light the size of a box lid goes out.' }, actor: LUNE },
      { hint: 'Look on the step of No. 14 at dawn.', on: { type: 'reach', at: [94, 57], r: 1, need: { phase: 'dawn' }, say: 'On the step of No. 14, in the grey: one slipper, set straight, toes toward your house.' }, give: { items: [['lune-slipper', 1]] } },
    ],
    reward: { glow: 700, coins: 4 }, end: 'Lune got home by your light. She does not remember. Her slipper does.',
  },
);
