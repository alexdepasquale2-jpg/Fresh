// Rival kids out in the world. Each entry places one of ctx.battles.rivals() (by index) on the map.
// The ladder's own rules still hold: a rival will not fight until the one before is beaten, and wins
// are recorded by the battle screen. Add more with ENCOUNTERS.push(...).
import type { EncounterDef } from './types';

export const ENCOUNTERS: EncounterDef[] = [
  { rival: 0, at: { day: [90, 60], dusk: [88, 61] }, look: { hair: 12, top: 4, legs: 2 }, before: 'They are bouncing a ball off your kerb as if it were theirs.', after: 'They nod at you now. The ball stays in their pocket.' },
  { rival: 1, at: { day: [86, 96], dusk: [78, 116] }, look: { hair: 1, top: 12, legs: 3 }, before: 'Sat on the back of the bench with a box on their knees.', after: 'They shift up to make room on the bench.' },
  { rival: 2, at: { day: [120, 64], dusk: [108, 59] }, look: { hair: 11, top: 13, legs: 1 }, before: 'King of the far corner of the yard.', after: 'The far corner is anybody\'s now.' },
  { rival: 3, at: { day: [150, 101], dusk: [150, 101] }, look: { hair: 5, top: 7, legs: 11 }, before: 'Leaning on the last lamp of the Parade, counting change.', after: 'They keep the change in the other pocket when you pass.' },
  { rival: 4, at: { dawn: [21, 104], day: [21, 104] }, look: { hair: 0, top: 10, legs: 2, hat: 4 }, before: 'Between the bean rows, where the grown-ups cannot see a box.', after: 'They have gone back to weeding, mostly.' },
  { rival: 5, at: { day: [100, 133], dusk: [92, 137] }, look: { hair: 9, top: 14, legs: 3 }, before: 'Throwing stones at the water, not across it.', after: 'They skim now. You showed them something.' },
  { rival: 6, at: { day: [86, 24], dusk: [72, 36] }, look: { hair: 11, top: 4, legs: 1 }, before: 'On the wood path, exactly in the middle of it.', after: 'They step off the path for you.' },
  { rival: 7, at: { dusk: [22, 66], night: [22, 62] }, look: { hair: 1, top: 2, legs: 0, tall: true }, before: 'Among the stones, reading the names out, quietly, to a box.', after: 'They read the names to themselves now.' },
  { rival: 8, at: { day: [30, 127], dusk: [30, 127] }, look: { hair: 12, top: 13, legs: 11 }, before: 'Down in the Cut, where the dog lets only some through.', after: 'They wave from the far bank.' },
  { rival: 9, at: { day: [36, 26], dawn: [36, 26] }, look: { hair: 5, top: 12, legs: 2 }, before: 'Under the hill, listening to the mast with their eyes shut.', after: 'They open one eye when you come by.' },
  { rival: 10, at: { dusk: [124, 79], night: [124, 79] }, look: { hair: 0, top: 3, legs: 1, tall: true }, before: 'On the platform, waiting for a train that is not on the sheet.', after: 'They still wait. They look less sure it is coming.' },
  { rival: 11, at: { night: [128, 31], dusk: [130, 41] }, look: { hair: 9, top: 0, legs: 1, tall: true }, before: 'By the old workings, where the fence gives up.', after: 'They look at the pit, not at you.' },
  { rival: 12, at: { day: [64, 116], dusk: [64, 116] }, look: { hair: 11, top: 7, legs: 3 }, before: 'By the Rec lamp, box open, daring anyone.', after: 'The box stays shut when you pass.' },
  { rival: 13, at: { day: [112, 133], dusk: [112, 133] }, look: { hair: 1, top: 14, legs: 2 }, before: 'On the promenade rail, feet over the water.', after: 'They move their feet for you.' },
  { rival: 14, at: { night: [60, 70], dusk: [60, 70] }, look: { hair: 0, top: 12, legs: 0, tall: true }, before: 'In the back lane, where the lamps do not reach.', after: 'They stand under a lamp now. It suits them less.' },
  { rival: 15, at: { night: [100, 36], dusk: [100, 36] }, look: { hair: 9, top: 13, legs: 1, tall: true }, before: 'At the wood\'s edge, at night, with too many boxes.', after: 'They carry fewer boxes now.' },
];
