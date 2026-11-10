// Second haunts for a few ladder rivals, at other hours, once something has changed. The ladder's own
// rules (order, wins) are untouched: each entry only places an existing rival somewhere else.
import { ENCOUNTERS } from '../encounters';

ENCOUNTERS.push(
  { rival: 0, at: { dawn: [64, 61] }, look: { hair: 12, top: 4, legs: 2 }, when: { fact: ['beaten', '>=', 1] }, before: 'Out before school, watching the milk float go by with their box under one arm.', after: 'Up early since you beat them. Practising, they say, at nothing you can see.' },
  { rival: 2, at: { night: [126, 68] }, look: { hair: 11, top: 13, legs: 1 }, when: { quest: ['chalk', 'done'] }, before: 'Standing on the twelfth square, at night, to see what it does.', after: 'Hopping the twelve squares in the dark, over and over, losing count on purpose.' },
  { rival: 5, at: { dawn: [96, 136] }, look: { hair: 9, top: 14, legs: 3 }, when: { weather: 'fog' }, before: 'On the sand in the fog, box open, holding it out toward the water like a lantern.', after: 'In the fog again. They shut the box when they see it is you.' },
  { rival: 6, at: { dawn: [86, 14] }, look: { hair: 11, top: 4, legs: 1 }, when: { quest: ['oak', 'done'] }, before: 'By the cut brambles, looking for what the jackdaw took from their house.', after: 'They found their thing in the oak. They do not say what it was.' },
);
