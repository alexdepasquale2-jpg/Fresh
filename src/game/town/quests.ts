// Quests as data. The state machine that runs them is in index.ts.
// Add more with QUESTS.push(...) from a file in ./quests/ (loaded by index.ts with import.meta.glob).
import type { QuestDef } from './types';

export const QUESTS: QuestDef[] = [
  /* ---------- The main thread: where the boxes come from ---------- */
  {
    id: 'm1', name: 'The Box on the Wall', thread: 'main', giver: 'ines',
    offer: 'I saw one. A box like yours, on the churchyard wall by the yew. At dusk. Gone by morning. Go and look, would you? I am not allowed past the last lamp.',
    accept: 'By the yew. West, over the little bridge, through the lychgate.',
    steps: [
      { hint: 'Look by the yew in St Orrin\'s Yard, west along Sallow Row.', on: { type: 'reach', at: [12, 51], r: 2, say: 'Nothing on the wall. Only a square of dry stone where the moss will not grow. And, snagged in the yew, a parcel label.' }, give: { items: [['label', 1]] } },
      { hint: 'Show Ines the label.', on: { type: 'talk', npc: 'ines', say: 'No address. Just a mark, a mast with rings round it. Mrs Quill at the post office knows every mark there is.' } },
    ],
    reward: { coins: 5, glow: 300 }, end: 'A box had stood on the wall. Something had come for it, or it had gone on.',
  },
  {
    id: 'm2', name: 'Postmarks', thread: 'main', giver: 'quill', needs: { quest: ['m1', 'done'] },
    offer: 'That mark. I have stamped ten thousand parcels and never that one. They come in the dark, down the line. Nobody posts them. Ask Harrow at the halt. After dusk: he is no use before.',
    steps: [
      { hint: 'Find Mr Harrow at Hollin Halt after dusk.', on: { type: 'talk', npc: 'harrow', need: { phase: ['dusk', 'night'] }, wait: 'Not in daylight. In daylight I only think I know things.', say: 'Plain boxes. Heavy for the size. On no manifest. I find them on the platform, and by morning a child has one and a house has a light on late. They do not come by train. They come down the wires. From the hill.' } },
      { hint: 'Tell Mrs Quill what Harrow said.', on: { type: 'talk', npc: 'quill', say: 'From the mast, then. Odd keeps that key. He was the relay man before he was the school caretaker. He will want something for it. He always does.' } },
    ],
    reward: { coins: 8, sky: [['comet', 1]] }, end: 'The boxes come down the wires from Mast Hill. Nobody sends them.',
  },
  {
    id: 'm3', name: 'The Hum', thread: 'main', giver: 'odd', needs: { quest: ['m2', 'done'] },
    offer: 'The mast key. I will lend it to someone who has been deep. Not brave. Deep. Fall twenty folds in one of yours and come back. I will know by your eyes.',
    steps: [
      { hint: 'Fall to fold 20 in any universe in your Box.', on: { type: 'cond', need: { fact: ['deepest', '>=', 20] }, say: 'Twenty folds. You feel it behind your eyes on the walk back.' }, mark: [129, 54] },
      { hint: 'Go back to Mr Odd at the school.', on: { type: 'talk', npc: 'odd', say: 'Yes. You have the look. It does not go away, I am sorry to say. Here. Lock it after you.' }, give: { items: [['mast-key', 1]] } },
      { hint: 'Unlock the gate on Mast Hill and look under the mast.', on: { type: 'reach', at: [25, 15], r: 2, say: 'A logbook under the mast, forty years in one hand. Every line the same: SENT 1. RECEIVED 0. The dish does not point at the sky. It points down, at the Old Workings.' } },
    ],
    reward: { glow: 800, sky: [['moon', 1]] }, end: 'The mast sends one box at a time and listens for an answer that has never come.',
  },
  {
    id: 'm4', name: 'The Old Workings', thread: 'main', giver: 'ines', needs: { quest: ['m3', 'done'] },
    offer: 'The quarry. The gate is chained, everyone says so. Bram says there is a gap on the wood side, behind a bush, where the fence gives up. Go at night. That is when there are lights down there.',
    steps: [
      { hint: 'Find the gap in the quarry fence, from the east path of Hollin Wood.', on: { type: 'reach', at: [112, 23], r: 1, say: 'The wire has been folded back, low down. The height of a child.' } },
      { hint: 'Stand at the edge of the pit, at night.', on: { type: 'reach', at: [134, 23], r: 2, need: { phase: 'night' }, say: 'It is not deep. It is far. Down in the pit there are lights laid out in streets. A row of houses. One window lit late. A kid at a desk, looking into a box.' } },
      { hint: 'Someone is standing by the pit.', on: { type: 'talk', npc: 'hesper', say: 'You came the way I did. Everybody\'s box is the bottom of somebody else\'s. We are not sent them. We are reached. Here. This one fell up out of the pit last night. It is nobody\'s yet.' } },
    ],
    reward: { universe: 'quarry-gift', items: [['pit-tooth', 1]], glow: 1500, coins: 20, flags: ['quarry-open'] },
    end: 'You stood at the bottom of your own sky and looked down into the next one. The chain is off the gate now.',
  },
  /* ---------- Side threads ---------- */
  {
    id: 'milk', name: 'Milk for Mrs Pell', thread: 'side', giver: 'pell',
    offer: 'Would you fetch me a pint from Dray\'s? My knees have stopped believing in the footbridge. Here is the money, near enough.', start: { coins: 3 },
    steps: [
      { hint: 'Buy a pint of milk at Dray\'s Corner on the Parade, over the line.', on: { type: 'cond', need: { has: 'milk' } }, mark: [115, 99] },
      { hint: 'Bring the milk to Mrs Pell at No. 4.', on: { type: 'talk', npc: 'pell', say: 'Silver top. Good. You are the only one on this street who still comes back.' }, give: { take: [['milk', 1]] } },
    ],
    reward: { coins: 6, items: [['humbug', 2]] }, end: 'Mrs Pell has her milk.',
  },
  {
    id: 'ball', name: 'Bram\'s Ball', thread: 'side', giver: 'bram',
    offer: 'I kicked it and it went in the long grass at the bottom of the Rec and it did not come out. Balls come out. Will you look? I am not scared. I am busy.',
    steps: [
      { hint: 'Search the south-west corner of Penny Rec.', on: { type: 'reach', at: [56, 120], r: 2, say: 'A red ball in the long grass, gone soft. The grass is pressed flat around it, as if something sat with it.' }, give: { items: [['ball', 1]] } },
      { hint: 'Take the ball back to Bram.', on: { type: 'talk', npc: 'bram', say: 'It is warm. Why is it warm. Never mind. Thanks.' }, give: { take: [['ball', 1]] } },
    ],
    reward: { coins: 3, sky: [['dust', 1]] }, end: 'Bram has his ball. He does not kick it toward the long grass.',
  },
  {
    id: 'cat', name: 'The Grey Cat', thread: 'side', giver: 'oona',
    offer: 'Ash goes somewhere at the end of the Parade and comes back smelling of coal. Follow her for me? She will not have me behind her.',
    steps: [
      { hint: 'Follow Ash along the Parade.', on: { type: 'reach', at: [128, 99], r: 1, say: 'She looks back once, to be sure you are coming.' }, actor: { hair: 3, top: 3, legs: 3, kind: 'cat' } },
      { hint: 'Follow Ash. She has gone east.', on: { type: 'reach', at: [146, 103], r: 1, say: 'She waits under the lamp, washing a paw that is already clean.' }, actor: { hair: 3, top: 3, legs: 3, kind: 'cat' } },
      { hint: 'Follow Ash round the end of the shops.', on: { type: 'reach', at: [155, 98], r: 1, say: 'Through the gap by the last wall.' }, actor: { hair: 3, top: 3, legs: 3, kind: 'cat' } },
      { hint: 'Follow Ash behind the shops.', on: { type: 'reach', at: [155, 93], r: 1, say: 'A yard nobody owns. A heap of coal nobody ordered, and on it a coat button cut from coal. Ash sits on your foot until you take it.' }, actor: { hair: 3, top: 3, legs: 3, kind: 'cat' }, give: { items: [['coal-button', 1]] } },
      { hint: 'Tell Oona at the Lantern Café.', on: { type: 'talk', npc: 'oona', say: 'Coal. We have not burned coal on the Parade since the valley was flooded. Keep the button. She meant it for you.' } },
    ],
    reward: { coins: 6, items: [['cocoa', 1]] }, end: 'Ash keeps a coal heap behind the shops. Nobody delivers it.',
  },
  {
    id: 'post', name: 'Three Letters', thread: 'side', giver: 'quill',
    offer: 'Three that must be put into the hand, not through the door. Tench on the allotments, Loam at St Orrin\'s, Mrs Eddy at the mere. I would go, but the counter cannot be left. It has been tried.',
    accept: 'Into the hand, mind.', start: { items: [['letter', 3]] },
    steps: [
      { hint: 'Hand a letter to Mr Tench (allotments), Mr Loam (churchyard) and Mrs Eddy (Lowmere).', on: { type: 'cond', need: { flag: 'letter-tench' } }, mark: [14, 100] },
      { hint: 'Two letters left: Mr Loam and Mrs Eddy.', on: { type: 'cond', need: { flag: 'letter-loam' } }, mark: [22, 58] },
      { hint: 'One letter left: Mrs Eddy, the warden at Lowmere.', on: { type: 'cond', need: { flag: 'letter-eddy' } }, mark: [146, 131] },
      { hint: 'Tell Mrs Quill they are delivered.', on: { type: 'talk', npc: 'quill', say: 'All three in the hand. They will each have gone a little pale. That is the right response.' } },
    ],
    reward: { coins: 12 }, end: 'Three letters, three hands.',
  },
  {
    id: 'dog', name: 'Mrs Thursday', thread: 'side', giver: 'tench',
    offer: 'That grey dog across the lane to the Cut. She was Ada Thursday\'s. Ada brought her a sausage from Brisk\'s every morning for eleven years. She is still waiting on this morning\'s.',
    steps: [
      { hint: 'Buy a sausage at Brisk & Daughter (open mornings and days).', on: { type: 'cond', need: { has: 'sausage' } }, mark: [131, 99] },
      { hint: 'Give the sausage to the dog at the lane, south-west of Penny Rec.', on: { type: 'talk', npc: 'thursday', say: 'She takes it as gently as a letter. Then she gets up, turns round twice, and lies down beside the lane, not across it.' }, give: { take: [['sausage', 1]], flags: ['dog-friend'] } },
    ],
    reward: { glow: 300, coins: 2 }, end: 'The lane to the Cut is open. Mrs Thursday watches you through it.',
  },
  {
    id: 'wren', name: 'Come Down, Wren', thread: 'side', giver: 'osk',
    offer: 'Wren has been up the big tree in the Rec since before school and will not come down. Somebody has to say the right thing. I said the wrong thing twice.',
    steps: [
      { hint: 'Talk to Wren in Penny Rec. Choose your words.', on: { type: 'talk', npc: 'wren', say: 'I am not stuck. I am looking. Go away.', choices: [
        { text: 'Come down or I am telling.', say: 'Tell, then. They cannot climb.' },
        { text: 'What can you see from up there?', say: 'The quarry. There are lights in the pit. In the day. Nobody believes me.', set: ['pass'] },
        { text: 'You will fall.', say: 'Everything is falling. I am just higher up while it does.' },
      ] } },
      { hint: 'Wren is listening now. Say one more thing.', on: { type: 'talk', npc: 'wren', say: 'So. Now you know what I am looking at.', choices: [
        { text: 'There is nothing down there.', say: 'Then why do you never look at it either?' },
        { text: 'I believe you. Show me from the ground.', say: 'Fine. But you go first past the long grass.', set: ['pass'] },
        { text: 'Can I come up?', say: 'It is a one-person tree.' },
      ] } },
    ],
    reward: { coins: 4, sky: [['comet', 1]], flags: ['wren-down'] }, end: 'Wren came down. She walks on the side of you away from the quarry.',
  },
  {
    id: 'evening', name: 'The Tall Evening', thread: 'side', giver: 'gaff',
    offer: 'Something walks the Rec once the lamps are on. Tall. Stops at each lamp like it is counting them. I am too old to ask it what for. You are not.',
    steps: [
      { hint: 'Find the tall thing in Penny Rec, at night.', on: { type: 'talk', npc: 'evening', need: { phase: 'night' }, say: 'It bends, a long way. ONE IS OUT, it says, in a voice like a pipe cooling. BRING A LIGHT FOR IT.' } },
      { hint: 'Buy a lamp bulb at Sull & Son (daytime).', on: { type: 'cond', need: { has: 'bulb' } }, mark: [139, 99] },
      { hint: 'Bring the bulb to the tall thing, at night.', on: { type: 'talk', npc: 'evening', need: { phase: 'night' }, say: 'It takes the bulb in fingers like pencils and is gone up the lamp without climbing. The lamp comes on. A thread of its sleeve is left on your hand.' }, give: { take: [['bulb', 1]], items: [['evening-thread', 1]] } },
    ],
    reward: { glow: 1000 }, end: 'Every lamp in Penny Rec is lit. It still counts them.',
  },
  {
    id: 'beans', name: 'Bean Row', thread: 'side', giver: 'tench', needs: { quest: ['dog', 'done'] },
    offer: 'Plot 9 is let to nobody and is not to be dug. So do not dig. Push this in with your thumb and see what a day does.',
    accept: 'Plot 9. The one gone to long grass, middle of the allotments.', start: { items: [['bean', 1]] },
    steps: [
      { hint: 'Plant the bean in Plot 9, the overgrown plot in the allotments.', on: { type: 'reach', at: [26, 109], r: 2, need: { has: 'bean' }, say: 'You push the bean in with your thumb. The soil is warm a long way down.' }, give: { take: [['bean', 1]] } },
      { hint: 'Give it a day.', on: { type: 'wait', days: 1 }, mark: [26, 109] },
      { hint: 'Look at Plot 9 again.', on: { type: 'reach', at: [26, 109], r: 2, say: 'A shoot, white as a tooth, a hand high. It leans toward the mast.' } },
      { hint: 'Give it one more day.', on: { type: 'wait', days: 1 }, mark: [26, 109] },
      { hint: 'Pick what has grown on Plot 9.', on: { type: 'reach', at: [26, 109], r: 2, say: 'Beans, in two days. They are warm in the pod.' }, give: { items: [['beans', 1]] } },
      { hint: 'Show Mr Tench the beans.', on: { type: 'talk', npc: 'tench', say: 'Two days. Hm. It was two weeks for me, and two years for my father. It is getting quicker.' }, give: { take: [['beans', 1]] } },
    ],
    reward: { coins: 10, sky: [['rings', 1]] }, end: 'Plot 9 grows in two days what it used to grow in two years.',
  },
  {
    id: 'lamps', name: 'The Age of Lamps', thread: 'side', giver: 'avery',
    offer: 'You keep worlds, I am told. Do any of them keep a light at night yet? Show me one that has come as far as lamps and I shall stop setting you lines about attention.',
    steps: [
      { hint: 'Tend a world in your Box until its people keep lamps (the age after iron).', on: { type: 'cond', need: { fact: ['era', '>=', 3] }, say: 'One of your worlds keeps lamps now. You could tell her.' }, mark: [136, 56] },
      { hint: 'Tell Miss Avery.', on: { type: 'talk', npc: 'avery', say: 'Lamps. So they are afraid of the dark as well. That is the first thing we have in common with them. Thank you.' } },
    ],
    reward: { coins: 10, sky: [['moon', 1]] }, end: 'Miss Avery knows one of your worlds keeps a light on.',
  },
  {
    id: 'three', name: 'Company', thread: 'side', giver: 'pip',
    offer: 'How many have you got in your Box? I am not asking to see. Only, come back when it is three. One is lonely and two is an argument.',
    steps: [
      { hint: 'Hold three universes in your Box.', on: { type: 'cond', need: { fact: ['count', '>=', 3] } }, mark: [84, 57] },
      { hint: 'Tell Pip.', on: { type: 'talk', npc: 'pip', say: 'Three. Good. Now they can take sides. Have this, it is my second-best.' } },
    ],
    reward: { items: [['pip-marble', 1]], sky: [['dust', 2]] }, end: 'Three in the Box. Pip approves.',
  },
  {
    id: 'skim', name: 'Seven Skips', thread: 'side', giver: 'nell',
    offer: 'Seven. Off the pier or off the pond jetty, I do not mind. Get seven skips out of one stone and you can have my best one.',
    steps: [
      { hint: 'Skim a stone seven times, at the Long Pier or Penny Pond.', on: { type: 'cond', need: { flag: 'skim-7' } }, mark: [90, 150] },
      { hint: 'Tell Nell.', on: { type: 'talk', npc: 'nell', say: 'Seven. I counted from here. The eighth one it did after you looked away.' } },
    ],
    reward: { items: [['best-stone', 1]], coins: 5 }, end: 'Seven skips. Nell\'s best stone is yours.',
  },
  {
    id: 'caps', name: 'Caps for Dov', thread: 'side', giver: 'dov',
    offer: 'I am making a thing out of bottle caps. I need to see five. Not have, see. You keep them. They are all over, if you look at the ground like I do.',
    steps: [
      { hint: 'Find five bottle caps. They glint on streets, yards and paths.', on: { type: 'cond', need: { found: ['cap', 5] } } },
      { hint: 'Show Dov.', on: { type: 'talk', npc: 'dov', say: 'Five different ones. None of them are drinks. Look. HOLLIN TONIC. Nobody sells that. Hold still, I will make you the thing.' } },
    ],
    reward: { coins: 8, items: [['cap-crown', 1]] }, end: 'Dov made a crown of caps. It fits no head.',
  },
  {
    id: 'fight', name: 'Stand Up', thread: 'side', giver: 'tilly',
    offer: 'The other kids with boxes make mine fight and it always loses and then they laugh. Could you beat one? Any of them. Then they would know it can be done.',
    steps: [
      { hint: 'Beat a rival kid. They stand about the neighbourhood; walk up and talk.', on: { type: 'cond', need: { fact: ['wins', '>=', 1] } }, mark: [90, 60] },
      { hint: 'Tell Tilly.', on: { type: 'talk', npc: 'tilly', say: 'You did. I heard. Everybody heard. Tie this to your Box. It is so I know which one is yours.' } },
    ],
    reward: { items: [['tilly-ribbon', 1]], glow: 400 }, end: 'Tilly knows it can be done.',
  },
  {
    id: 'survey', name: 'The Whole Sheet', thread: 'side', giver: 'vane',
    offer: 'I am resurveying the parish and it will not sit still. Walk it for me. Ten districts, on foot, and tell me they are all still where the sheet says.',
    steps: [
      { hint: 'Set foot in ten districts of the neighbourhood.', on: { type: 'cond', need: { districts: 10 } } },
      { hint: 'Report to Ms Vane on Mast Hill.', on: { type: 'talk', npc: 'vane', say: 'All ten. And all a little further apart than last year. I thought so. Take this; the buses owe me.' } },
    ],
    reward: { items: [['bus-pass', 1]], coins: 10 }, end: 'Ten districts walked. The parish is getting bigger.',
  },
  {
    id: 'bus', name: 'The Last Bus', thread: 'side', giver: 'carrow',
    offer: 'Nobody rides the last one out to Lowmere any more. Dusk run. I drive it empty and it feels full. Ride it once, would you, so I know which.',
    steps: [
      { hint: 'At dusk, take the bus from any stop to Lowmere terminus.', on: { type: 'cond', need: { flag: 'last-bus' }, say: 'The bus was empty. You counted eleven people getting off.' } },
      { hint: 'Find Carrow at the terminus (dusk) or on Sallow Row (day).', on: { type: 'talk', npc: 'carrow', say: 'Eleven got off? I only ever count ten. Then you were the eleventh. That is a relief, actually.' } },
    ],
    reward: { coins: 6, sky: [['comet', 1]] }, end: 'You rode the last bus. Eleven got off.',
  },
  {
    id: 'culvert', name: 'Under the Line', thread: 'side', giver: 'sull', needs: { has: 'torch' },
    offer: 'Got the torch, then. Do a thing for me with it. My father chalked his name in the culvert under the line the year they flooded the valley. Tell me if it is still there.',
    steps: [
      { hint: 'Go into the culvert under the Down Line (where the creek goes under, west end).', on: { type: 'reach', at: [46, 83], r: 1, say: 'SULL 1931, in chalk gone yellow. And under it, fresher, a small chalked square with a dot in it. A stub of chalk on the ledge.' }, give: { items: [['chalk', 1]] } },
      { hint: 'Tell Mr Sull.', on: { type: 'talk', npc: 'sull', say: 'Still there. And a square under it? He drew that on everything, at the end. Would not say what it was.' } },
    ],
    reward: { coins: 9 }, end: 'SULL 1931 is still under the line. So is the square.',
  },
  {
    id: 'feathers', name: 'Plover\'s List', thread: 'side', giver: 'plover',
    offer: 'There is a bird in this wood I cannot find in the book. I only ever get its feathers. Bring me word of six and I will know its wingspan at least.',
    steps: [
      { hint: 'Find six feathers: woods, hill, allotments, churchyard, the Cut.', on: { type: 'cond', need: { found: ['feather', 6] } } },
      { hint: 'Tell Mr Plover in Hollin Wood (mornings and days).', on: { type: 'talk', npc: 'plover', say: 'Six, all primaries, all from the left wing. Then it only has a left wing. That would explain the circles.' } },
    ],
    reward: { items: [['plover-quill', 1]], sky: [['belt', 1]], coins: 6 }, end: 'The bird in Hollin Wood has one wing, and uses it.',
  },
];
