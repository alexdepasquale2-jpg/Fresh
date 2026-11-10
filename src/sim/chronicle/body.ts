// The life of the player's body, as the villages tell it. sim/civ sends CivEvent kind 'body'
// with detail = one of the codes below (the same numbers as B in src/sim/civ/body.ts; units
// may not import each other, so change both).
//   cause: which telling; other: the other village; who: a figure; creed: a creed id; count: souls or a small word index.
// %v village, %o other village, %w figure, %k creed, %x a word particular to the deed.
type Tale = { deed: string; text: Record<number, readonly string[]>; small?: boolean };

export const FACE = ['the giver', 'the voice', 'the healer', 'the killer', 'the thief', 'the one who ran', 'the peacemaker', 'the curse', 'the worker', 'the teacher'];
const TENET = [
  'Its first tenet: give of your own body.', 'Its first tenet: the light speaks, so listen.', 'Its first tenet: sit with the sick.', 'Its first tenet: the light strikes back.',
  'Its first tenet: what is needed may be taken.', 'Its first tenet: it will leave you, so be ready.', 'Its first tenet: stand between the spears.', 'Its first tenet: fear what walks.',
  'Its first tenet: work beside the least.', 'Its first tenet: learn what you are shown.',
];
const HOW = ['', 'It died by their hands.', 'It starved.', 'The cold took it.', 'The fever took it.', 'The storm took it.', 'It died between the spears.'];

export const BODY: Record<number, Tale> = {
  1: { deed: 'recognised', text: {
    1: ['In %v they knew the walk. The one who came before had come again.', '%v saw the stranger and said: it is the same one.'],
    2: ['%v knew the stranger at once, and barred its doors.', 'In %v they said: it has come back.'],
  } },
  2: { deed: 'heal', small: true, text: {
    1: ['The stranger sat with the sick of %v, and the fever loosened.', 'In %v the stranger went from bed to bed.'],
    2: ['The stranger bound the wounded of %v.', 'In %v the stranger washed wounds that were not its own.'],
  } },
  3: { deed: 'work', small: true, text: {
    1: ['The stranger worked a field at %v like any other pair of hands.', 'In %v the stranger bent its back in the furrows.'],
    2: ['The stranger carried stone for the %x of %v.', 'At %v the stranger put its shoulder to the %x.'],
  } },
  4: { deed: 'trade', small: true, text: { 0: ['The stranger sold the goods of %o in %v.', 'Goods from %o came to %v on the back of the stranger.'] } },
  5: { deed: 'teach', text: {
    1: ['The stranger showed %v %x.', '%v learned %x from the stranger.'],
    2: ['The stranger taught in %v, and they began to see what comes next.', 'In %v the stranger drew in the dust, and they understood some of it.'],
  } },
  6: { deed: 'peace', text: { 0: ['The stranger asked %w for peace with %o, and was heard.', '%w of %v put down the war with %o because the stranger asked.'] } },
  7: { deed: 'refused', text: { 0: ['The stranger asked %w for peace with %o. The hall laughed.', '%w of %v would not hear the stranger speak of peace.'] } },
  8: { deed: 'incite', text: { 0: ['The stranger whispered to %w, and %v marched on %o.', 'War between %v and %o. They say the stranger wanted it.'] } },
  9: { deed: 'tribute', text: { 0: ['The stranger spoke, and %o forgave the tribute of %v.', '%v pays %o nothing now. The stranger asked it.'] } },
  10: { deed: 'tribute-kept', text: { 0: ['The stranger asked %o to forgive the tribute of %v. The carts still roll.'] } },
  11: { deed: 'stand', text: { 0: ['The stranger stood between the spears of %v and %o, and they were lowered.', 'The armies of %v and %o found the stranger standing between them. They went home.'] } },
  12: { deed: 'stand-fell', text: { 0: ['The stranger stood between %v and %o, and the spears went through it.', 'The stranger stepped between the armies of %v and %o and was cut down.'] } },
  13: { deed: 'challenge', text: { 0: ['The stranger answered the heretic %w before all of %v. There was no reply.', '%w fell silent in %v. The stranger had spoken last.'] } },
  14: { deed: 'challenge-lost', text: { 0: ['The stranger argued with %w in %v and lost.', 'In %v they laughed when the stranger tried to answer %w.'] } },
  15: { deed: 'side', text: { 0: ['The stranger stood beside %w in %v.', '%w spoke in %v with the stranger at their shoulder.'] } },
  16: { deed: 'bless', small: true, text: { 0: ['The stranger laid its hands on the fields of %v.', 'The fields of %v came in heavy where the stranger had walked.'] } },
  17: { deed: 'curse', text: { 0: ['The stranger soured the fields of %v.', 'Where the stranger walked in %v, the grain went black.'] } },
  18: { deed: 'vigil', small: true, text: { 0: ['The stranger kept a night at the shrine of %v.', 'A light stayed in the shrine of %v until morning.'] } },
  19: { deed: 'bury', text: {
    1: ['The stranger buried the dead of %v after the raid.', 'In %v the stranger dug graves beside them.'],
    2: ['The stranger buried those the fever took in %v.', 'In %v the stranger carried out the fever-dead.'],
    3: ['The stranger buried the dead of old %v.', 'Someone has laid the bones of %v to rest. They say it was the stranger.'],
  } },
  21: { deed: 'deliver', text: {
    1: ['The stranger carried words of peace from %o to %v.', 'Words of peace came to %v from %o, in the mouth of the stranger.'],
    2: ['The stranger carried grain from %o to %v.', 'Grain from %o reached %v on the back of the stranger.'],
    3: ['The stranger carried medicine from %o to %v.', 'What %o knew of the fever came to %v with the stranger.'],
    4: ['The stranger carried goods and a greeting from %o to %v.', 'A greeting from %o came to %v with the stranger.'],
  } },
  22: { deed: 'found', text: { 0: ['Those who followed the stranger stopped walking and built %v.', '%v was raised where the stranger said to stop.'] } },
  23: { deed: 'role', text: {
    1: ['%v asked the stranger to be its healer, and it agreed.'],
    2: ['%v made the stranger its envoy.'],
    3: ['In %v they began to call the stranger a prophet.'],
  } },
  25: { deed: 'steal', text: { 0: ['The stranger was seen taking bread from the stores of %v.', '%v caught the stranger with its hands in the grain.'] } },
  26: { deed: 'follower', text: {
    1: ['One of %v left their door and walked behind the stranger.', 'In %v someone put down their work and followed the stranger.'],
    4: ['Four walk behind the stranger now, out of %v.'],
    8: ['Eight follow the stranger. %v counts its empty doors.'],
  } },
  27: { deed: 'creed', text: { 0: ['In %v those who follow the stranger gave their faith a name: %k.', 'A creed was spoken in %v, about the stranger: %k.'] } },
  28: { deed: 'creed-spread', text: { 0: ['%v took up %k from %o.', '%k came to %v along the road from %o.'] } },
  29: { deed: 'creed-schism', text: { 0: ['%v broke from the others and named its faith %k.', 'Those of %v kept another memory of the stranger: %k.'] } },
  30: { deed: 'court', text: { 0: ['%w of %v set a place for the stranger at the high table.', '%w called the stranger into the hall of %v and fed it.'] } },
  31: { deed: 'hunt', text: { 0: ['%w of %v sent hunters after the stranger.', '%w of %v put a price on the stranger.'] } },
  32: { deed: 'death', text: {
    1: ['The stranger died near %v. They wept, and kept what it had left.', 'They carried the body of the stranger into %v and would not bury it for three days.'],
    2: ['The thing that walked near %v is dead. They burned what was left.', '%v lit fires the night the stranger died, and danced.'],
    3: ['A stranger died near %v. No one knew its name.', 'Something fell down near %v and did not get up. It was not much spoken of.'],
  } },
  33: { deed: 'ascend', text: {
    1: ['The stranger walked up out of %v into the light. They watched the sky a long time.', 'The stranger left %v the way it came.'],
    2: ['The stranger left %v, and no one was sorry.', 'The stranger went up out of %v. Doors opened again that night.'],
  } },
  34: { deed: 'fled', text: { 0: ['The stranger ran from the spears of %v.', 'In %v they tell how the stranger turned and ran.'] } },
  35: { deed: 'fever', text: { 0: ['The stranger walked into %v with the fever on it.', 'The fever came to %v in the body of the stranger.'] } },
};

/** Why, for a body event. k is the creed's name (may be empty), n a count in words. */
export const bodyReason = (code: number, cause: number, count: number, other: number, k: string, n: string, alt: boolean): string => {
  switch (code) {
    case 1: return cause === 1 ? 'They had not forgotten what it did for them.' : 'They had not forgotten what it did to them.';
    case 2: return cause === 1 ? 'It did not seem to fear the fever.' : 'One who should have died did not.';
    case 3: return cause === 2 ? 'The work will be done sooner for it.' : 'They fed it afterwards, as they would anyone.';
    case 4: return 'The road between them is kinder for it.';
    case 5: return cause === 1 ? 'Another village knew it already. Now two do.' : 'It spoke of the age to come as if it had seen it.';
    case 6: return 'They knew the one who asked.';
    case 7: return 'It had not yet earned a hearing in that hall.';
    case 8: return 'It spoke of an old wrong until it sounded new.';
    case 9: return 'A debt can be forgiven, if the right one asks.';
    case 10: return 'It was not loved enough there to be heard.';
    case 11: return 'No one would be the first to strike it.';
    case 12: return 'Someone struck first. Someone always does.';
    case 13: return k ? `${k.charAt(0).toUpperCase() + k.slice(1)} held, with help from outside it.` : 'The old way held, with help from outside it.';
    case 14: return 'The heretic knew their doubts better than it did.';
    case 15: return 'After that there was no going back to the old rite.';
    case 16: return 'It was fainter afterwards.';
    case 17: return 'They saw whose hand it was.';
    case 18: return 'It knelt where they kneel.';
    case 19: return cause === 3 ? 'Good ground does not stay empty once its dead are at rest.' : cause === 2 ? 'No one else would touch them.' : 'Grief is lighter when it is shared.';
    case 21: return cause === 1 ? (count ? 'They were heard.' : 'The words were kept. So were the spears.') : cause === 2 ? 'One had plenty and the other none, and it walks between.' : cause === 3 ? 'The fever was already at their doors.' : 'It is a small thing. Pacts are made of small things.';
    case 22: return k ? `${n.charAt(0).toUpperCase() + n.slice(1)} had followed it that far. They keep ${k} there.` : `${n.charAt(0).toUpperCase() + n.slice(1)} had followed it that far.`;
    case 23: return cause === 1 ? 'It had healed their sick more than once.' : cause === 2 ? 'They trust what it carries between them.' : 'They had listened long enough to begin repeating it.';
    case 25: return 'It was hungry, as they are. They did not care.';
    case 26: return alt ? 'It had done enough there to be loved.' : 'They wanted to see where it would go.';
    case 27: return TENET[cause] ?? 'Its first tenet: watch the light.';
    case 28: return 'They had met the stranger themselves.';
    case 29: return `They could not agree what it had been: ${FACE[cause] ?? 'one thing'} or ${FACE[other] ?? 'another'}.`;
    case 30: return 'A ruler keeps close what the people love.';
    case 31: return cause === 2 ? 'Too many followed it, and a hard ruler shares no one.' : 'It had done them too much harm.';
    case 32: return `${HOW[count] ?? HOW[1]} ${cause === 1 ? `They remember it as ${FACE[other] ?? 'a kindness'}.` : cause === 2 ? 'No one was sorry.' : 'It had done too little to be remembered.'}`;
    case 33: return cause === 2 ? 'They had feared it more than they said.' : count > 0 ? 'It left followers with no one to follow.' : 'They had grown used to it.';
    case 34: return 'They remember a back, not a face.';
    case 35: return alt ? 'It did not know what it carried.' : 'The road that carries a healer carries this too.';
    default: return '';
  }
};
