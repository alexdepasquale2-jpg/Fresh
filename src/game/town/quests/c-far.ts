// Errands that send you back to your room and check what is really in the Box when you return.
// (The whose-box arc also reads souls, deepest and floors; Lune Walks reads Light.)
import { QUESTS } from '../quests';

QUESTS.push(
  {
    id: 'duel', name: 'The Yard Ladder', thread: 'side', giver: 'hob', needs: { quest: ['chalk', 'done'] },
    offer: 'There is a ladder. Not a real one. Whoever has won five with their box gets to say what game the yard plays. Nobody has won five. Have you?',
    steps: [
      { hint: 'Win five battles against rival kids, in all.', on: { type: 'cond', need: { fact: ['wins', '>=', 5] }, say: 'Five wins. The yard will have heard already.' }, mark: [128, 64] },
      { hint: 'Tell Hob in the school yard.', on: { type: 'talk', npc: 'hob', say: 'Five. Then you say the game. Go on. You are not saying one. Good. That is the right game. I shall tell them it is that.' } },
    ],
    reward: { coins: 10, sky: [['comet', 1], ['belt', 1]] }, end: 'You won five and named no game. The yard plays that now.',
  },
  {
    id: 'back', name: 'What the Losers Said', thread: 'side', giver: 'corin', needs: { quest: ['w3', 'done'], not: { quest: ['w6', 'active'] } },
    offer: 'When mine went, some of the kids with boxes said they had it. They were lying, but each lie was a different shape. Beat three of them. Losers tell the truth for about a minute after.',
    steps: [
      { hint: 'Beat three different rival kids.', on: { type: 'cond', need: { fact: ['beaten', '>=', 3] }, say: 'Three of them beaten. Each said the same thing afterwards, quietly.' }, mark: [111, 60] },
      { hint: 'Tell Corin what they said.', on: { type: 'talk', npc: 'corin', say: 'They all said it went down. Not who took it. Only down. Thank you. I can stop looking at their hands now.' } },
    ],
    reward: { coins: 12, sky: [['comet', 2]] }, end: 'Three losers said the same thing. Corin\'s box went down.',
  },
  {
    id: 'peal', name: 'A Peal Below', thread: 'side', giver: 'pym', needs: { quest: ['bell', 'done'] },
    offer: 'Do your people ring anything yet? There comes an age when they hang a bell, before they know what to call with it. Show me a world that has come to bells and I shall tell you what ours is for.',
    steps: [
      { hint: 'Tend a world in your Box until its people reach the age of bells (their fourth age).', on: { type: 'cond', need: { fact: ['era', '>=', 4] }, say: 'One of your worlds has hung a bell. You could tell Miss Pym.' }, mark: [24, 55] },
      { hint: 'Tell Miss Pym at St Orrin\'s.', on: { type: 'talk', npc: 'pym', say: 'Bells. Then they have something they want heard further off than a voice goes. Ask yourself who they think is listening. Then be it. That is what ours is for: somebody up there asked the same question about us.' } },
    ],
    reward: { sky: [['moon', 1], ['rings', 1]], glow: 400 }, end: 'One of your worlds rings a bell, and you know who it is for.',
  },
  {
    id: 'engine', name: 'One on the Sheet', thread: 'side', giver: 'mara', needs: { quest: ['siding', 'done'] },
    offer: 'I count trains that do not come. I should like to count one that does. Have any of your worlds built engines? Real ones, with smoke. Show me one that has, and I shall count it as ours.',
    steps: [
      { hint: 'Tend a world in your Box until its people build engines (their sixth age).', on: { type: 'cond', need: { fact: ['era', '>=', 6] }, say: 'One of your worlds has engines now. Smoke over the roofs.' }, mark: [126, 79] },
      { hint: 'Tell Mara Finch at Hollin Halt.', on: { type: 'talk', npc: 'mara', say: 'An engine. On a world, in a box, in your room. I am counting it. That makes one. Do not tell Mr Harrow. He will want to log it and then it will be his.' } },
    ],
    reward: { sky: [['belt', 1], ['sun', 1]], coins: 10 }, end: 'Mara has counted one train. It runs on a world in your Box.',
  },
  {
    id: 'rare', name: 'The Note Under', thread: 'side', giver: 'tam', needs: { quest: ['hum', 'done'] },
    offer: 'Most boxes hum the same. They say a rare one hums a note under. I have only heard about it. If you ever hold a rare one, come up here after dusk with it in your head, and I will listen at you.',
    steps: [
      { hint: 'Hold a universe of rare quality or better in your Box.', on: { type: 'cond', need: { fact: ['rare', '>=', 1] }, say: 'There is a rare one in your Box. You can feel the note it makes, lower than the rest.' }, mark: [31, 26] },
      { hint: 'Let Tam listen, below the mast at dusk or night.', on: { type: 'talk', npc: 'tam', need: { phase: ['dusk', 'night'] }, say: 'Stand still. There. Under the hum. It is not lower. It is further. Thank you. I am going to build a set that only gets that.' } },
    ],
    reward: { sky: [['sun', 1]], glow: 500 }, end: 'A rare universe hums a note that is not lower, only further.',
  },
  {
    id: 'shelf', name: 'The Weight of Twelve', thread: 'side', giver: 'osk',
    offer: 'The rag-and-bone man, Twelvetrees. He says his barrow knows who keeps boxes, and it dips toward them. He says if a kid ever held twelve it would tip right over. You are the only one who might. Get twelve and go and stand by it.',
    steps: [
      { hint: 'Hold twelve universes in your Box.', on: { type: 'cond', need: { fact: ['count', '>=', 12] }, say: 'Twelve universes in your Box. It is getting heavy to think about.' }, mark: [108, 102] },
      { hint: 'Find Mr Twelvetrees and his barrow (Sallow Row at dawn, behind the shops by day, the Parade at dusk).', on: { type: 'talk', npc: 'twelvetrees', say: 'Twelve. See the barrow dip on your side? Here. These came in with the gloves and I could not price them. Things for skies. I have no sky to put them in.' } },
    ],
    reward: { sky: [['rings', 1], ['moon', 1]], coins: 10 }, end: 'The barrow weighed you at twelve universes, and dipped.',
  },
  {
    id: 'tonic', name: 'Hollin Tonic', thread: 'side', giver: 'dov',
    offer: 'The caps. HOLLIN TONIC. Somebody leaves them on Mrs Dray\'s step and she has never stocked it. Twelvetrees has bottles on his barrow and will not say where from. She wants one, to read the back. I am not allowed in the shop. Here is her money.',
    start: { coins: 4 },
    steps: [
      { hint: 'Buy a bottle of Hollin Tonic from the barrow (Sallow Row at dawn, behind the shops by day, the Parade at dusk).', on: { type: 'cond', need: { has: 'tonic' } }, mark: [108, 102] },
      { hint: 'Bring the bottle to Mrs Dray.', on: { type: 'talk', npc: 'dray', say: '"Draws out what the dark puts in." Bottled at Lowmere, child. And the date on it is a Thursday that has not come. It is going on the high shelf.' }, give: { take: [['tonic', 1]] } },
    ],
    reward: { coins: 8, items: [['humbug', 3]], glow: 200 }, end: 'Hollin Tonic is bottled at Lowmere, on a Thursday that has not come.',
  },
);
