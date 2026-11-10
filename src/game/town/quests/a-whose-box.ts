// "Whose box": the main thread carried on. The kid who lost his, the teacher who had one, the bottom of the
// quarry and the twelfth house under Lowmere. Choices here are made in the speaker's own lines (see
// ../npcs/stories-kids.ts), which set flags the `cond` steps wait on, so they are remembered.
import { QUESTS } from '../quests';

QUESTS.push(
  {
    id: 'w1', name: 'Lost: One Lunch Box', thread: 'main', giver: 'corin', needs: { quest: ['m1', 'done'] },
    offer: 'You read the notice. "Lost: one lunch box, plain, heavy." That is mine. It is not a lunch box. I could not write what it is on a school notice. Will you look where lost things go? Mr Odd keeps them.',
    accept: 'Mr Odd. He is about the school from dawn until he locks up.',
    steps: [
      { hint: 'Ask Mr Odd, the school caretaker, about lost property.', on: { type: 'talk', npc: 'odd', say: 'Plain, heavy. Yes. Handed in years back, by nobody. I put it on the shelf in the boiler house, east end of the school. It was not on the shelf next day. Look anyway. Shelves here have a way.' } },
      { hint: 'Look in the boiler house, at the east end of the school building.', on: { type: 'reach', at: [148, 52], r: 2, say: 'Behind the boiler, a shelf with one clean square in the dust, and on the square a tin lunch box. No name. It is empty. It weighs what yours weighs.' }, give: { items: [['lunch-box', 1]] } },
      { hint: 'Show Corin what you found.', on: { type: 'talk', npc: 'corin', say: 'That is the outside of it. The inside went somewhere. Keep the tin for me. If I hold it I shall only open it again.' } },
    ],
    reward: { coins: 6, glow: 400, flags: ['corin-found'] }, end: 'Corin\'s box left its tin behind. You are keeping the tin.',
  },
  {
    id: 'w2', name: 'The Register', thread: 'main', giver: 'avery', needs: { quest: ['w1', 'done'] },
    offer: 'Corin Vale had one of those boxes and lost it, and he has not been tired since. That is how I know. Mr Gault had Class 4 before me. He kept a register he will not show. He sits by the far bench in the yard. Ask him what the pencil squares are.',
    accept: 'The bench at the east side of the yard. He is there most days.',
    steps: [
      { hint: 'Ask Mr Gault about the register. He sits by the east bench in the school yard by day.', on: { type: 'talk', npc: 'gault', say: 'The squares. I shall tell you when you have shown me you can keep a class. Thirty souls on one of your worlds, alive at the one time. I shall know. I always knew who had done the reading.' } },
      { hint: 'Tend a world in your Box until thirty souls live on it at once.', on: { type: 'cond', need: { fact: ['souls', '>=', 30] }, say: 'Thirty souls on one world. A classful.' }, mark: [149, 61] },
      { hint: 'Go back to Mr Gault.', on: { type: 'talk', npc: 'gault', say: 'Thirty, and you know some of their names. I had one, in 1931. So did eleven of my class. I put a square by each name the morning they came in tired. Here. I have carried it long enough.' }, give: { items: [['register', 1]] } },
      { hint: 'Take the register to Miss Avery.', on: { type: 'talk', npc: 'avery', say: 'Eleven squares. And eleven houses under Lowmere, flooded that same year. He never told me that part. Nobody is given a box. A class is.' }, give: { take: [['register', 1]] } },
    ],
    reward: { coins: 10, sky: [['moon', 1]], glow: 500 }, end: 'In 1931 eleven children in one class had boxes. That year the valley was flooded.',
  },
  {
    id: 'w3', name: 'One Night', thread: 'main', giver: 'corin', needs: { quest: ['w2', 'done'] },
    offer: 'I want to ask you something, and you can say no. Not here. On the Row side of the footbridge, at dusk, when nobody is on it. Will you come and be asked?',
    accept: 'Dusk. The footbridge over the line.',
    steps: [
      { hint: 'Meet Corin at the footbridge at dusk, and answer him.', on: { type: 'cond', need: { any: [{ flag: 'corin-lent' }, { flag: 'corin-kept' }] } }, mark: [73, 78] },
      { hint: 'Give it a night.', on: { type: 'wait', days: 1 }, mark: [121, 79] },
      { hint: 'Find Corin in the morning: Hollin Halt at dawn, the school gate by day.', on: { type: 'talk', npc: 'corin', say: 'Morning. I did not sleep, and I am not tired. It was asked properly and answered properly. That does not happen much on this street.' } },
    ],
    reward: { glow: 600, sky: [['comet', 1]] }, end: 'Corin asked to hold your Box for one night. He remembers what you said.',
  },
  {
    id: 'w4', name: 'It Is Not Deep', thread: 'main', giver: 'hesper', needs: { quest: ['w2', 'done'] },
    offer: 'It is not deep, the pencil says. It is far. I want to know how far. Fall forty folds in one of yours, then come and stand here at night and tell me if it is the same far.',
    accept: 'Forty. I will be here. I am here most nights.',
    steps: [
      { hint: 'Fall to fold 40 in any universe in your Box.', on: { type: 'cond', need: { fact: ['deepest', '>=', 40] }, say: 'Forty folds. On the way back up you passed something going down.' }, mark: [134, 24] },
      { hint: 'Stand at the edge of the pit in the Old Workings, at night.', on: { type: 'reach', at: [134, 23], r: 2, need: { phase: 'night' }, say: 'You look down. The lights are no nearer than before. But you know the feeling now: it is the fortieth fold, seen from above. Behind you, at the winding house, a door bangs.' } },
      { hint: 'Someone is at the winding house, in the south-west of the quarry (dusk and night).', on: { type: 'talk', npc: 'jem', need: { phase: ['dusk', 'night'] }, say: 'Sixty years the drum has paid out cable and never once wound in. There is no bottom to hang a cage at. There is a floor, but it is somebody\'s ceiling. Take the pin. It makes no odds to the drum.' }, give: { items: [['winding-pin', 1]] } },
      { hint: 'Tell Hesper at the pit, at night.', on: { type: 'talk', npc: 'hesper', say: 'So it goes down the way yours goes down. Then the kid at the desk in the pit is forty folds from a floor too. I am going to wave slower, so it arrives.' } },
    ],
    reward: { sky: [['sun', 1]], glow: 1000, coins: 12 }, end: 'The quarry has no bottom. It has a floor, and the floor is a ceiling.',
  },
  {
    id: 'w5', name: 'Under Lowmere', thread: 'main', giver: 'sedge', needs: { quest: ['w4', 'done'] },
    offer: 'You have looked down the dry one. This is the wet one. I row out at night over the eleven houses, and I take a passenger who has stood on a floor. Fall all the way down in one of yours, to where it stops. Then come.',
    accept: 'The end of the pier. Night. Do not wave a light about.',
    steps: [
      { hint: 'Dive to the floor of a universe in your Box.', on: { type: 'cond', need: { fact: ['floors', '>=', 1] }, say: 'You reached a floor. The room, the desk. You know what a bottom looks like now.' }, mark: [90, 147] },
      { hint: 'Find Old Sedge at the end of the Long Pier, at night.', on: { type: 'talk', npc: 'sedge', need: { phase: 'night' }, say: 'In. Sit still. There: eleven roofs. And a twelfth with no roof, only a desk and a lamp, and nobody at it. That is the house they never built. Something is caught on my oar. Yours, I think.' }, give: { items: [['chapel-key', 1]] } },
      { hint: 'Show the key to Mrs Eddy, the warden of Lowmere.', on: { type: 'talk', npc: 'eddy', say: 'The chapel key. It went under with the verger. I will tell you why the level never changes: the water is not held by the dam. It is held up from below. Keep that. And take this; it came ashore the night you rowed.' } },
    ],
    reward: { universe: 'lowmere-gift', glow: 1200, coins: 15 }, end: 'Under Lowmere there are eleven houses and a twelfth desk with nobody at it.',
  },
  {
    id: 'w6', name: 'Whose Box', thread: 'main', giver: 'gault', needs: { quest: ['w5', 'done'], has: 'lunch-box', not: { any: [{ quest: ['w3', 'none'] }, { quest: ['w3', 'active'] }] } },
    offer: 'A desk with a lamp and nobody at it. That desk is Corin\'s. His box is not lost. It is waiting to be put back where a box arrives, and you were shown that place first of all. The wall by the yew, at dusk. Take the tin.',
    accept: 'St Orrin\'s. The dry square on the wall. Dusk.',
    steps: [
      { hint: 'Set the lunch box on the churchyard wall by the yew, at dusk.', on: { type: 'reach', at: [12, 51], r: 2, need: { phase: 'dusk', has: 'lunch-box' }, say: 'You set the tin on the square of dry stone and look away, as you are meant to. When you look back the lid is shut and the wall under it is warm. It weighs more than it did.' } },
      { hint: 'Take the box to Corin. Or do not.', on: { type: 'cond', need: { any: [{ flag: 'w6-gave' }, { flag: 'w6-kept' }] } }, mark: [111, 60] },
      { hint: 'Tell Mr Gault how it ended.', on: { type: 'talk', npc: 'gault', say: 'So that is where it went. I asked a boy to carry mine once, in 1931, and he would not, and he was right. You have done better than my class did, whichever way you did it.' } },
    ],
    reward: { coins: 20, glow: 1000, flags: ['whose-done'] }, end: 'A box came back to the wall by the yew. Whose it is now is a thing you decided.',
  },
);
