// The grammar that needs no network. Seeded by a hex string, so a line is the same every time it is asked for.
import type { VoiceKind } from '@/contracts/platform';
import { hashString, makeSeed, rng } from '@/core/hash';
import type { Rng } from '@/core/hash';

const L = {
  thing: ['a lamp', 'a door', 'a stair', 'a well', 'a bell', 'a candle', 'a window', 'a river', 'a field of ash', 'a small fire', 'a salt shore', 'a moth', 'a locked box', 'a long table', 'a tide', 'a roof'],
  things: ['lamps', 'doors', 'stairs', 'bells', 'candles', 'windows', 'moths', 'boxes', 'tides', 'stars', 'roofs', 'stones'],
  who: ['someone small', 'a child', 'an old woman', 'a keeper', 'a stranger', 'somebody you know', 'nobody', 'a kid like you', 'the one above', 'a sleeper'],
  does: ['is counting', 'is waiting by', 'has lit', 'has lost', 'is carrying', 'is mending', 'is knocking at', 'is listening to', 'has buried', 'is looking for'],
  where: ['under the floor', 'at the bottom', 'behind the sky', 'past the last fold', 'in the next room', 'far below', 'inside the lid', 'on the other shore', 'where the light stops', 'in the dark between'],
  how: ['slowly', 'without a sound', 'again', 'for the last time', 'as it always has', 'and does not stop', 'a little late', 'by lamplight', 'in its sleep', 'while you watch'],
  adj: ['quiet', 'pale', 'cold', 'small', 'slow', 'grey', 'far', 'thin', 'old', 'patient', 'low', 'kept'],
  feel: ['It is not unkind.', 'It does not see you.', 'It has been like this a long time.', 'It will still be here tomorrow.', 'You are the only one who knows.', 'Nothing here is in a hurry.', 'Something is about to begin.', 'It was waiting for a sky.'],
  time: ['Tonight', 'Once', 'Again', 'Before morning', 'In the dream', 'Somewhere', 'Further down', 'Later'],
} as const;

const DREAM = [
  '{time}, {who} {does} {thing} {where}.', 'You dream of {thing} {where}. {feel}', '{time} there are {things} {where}, {how}.', 'A {adj} voice says your name {how}.',
  'You are falling past {things}. None of them are yours.', '{who} {does} {thing}. You wake before you see which.', 'In the dream the Box is open and {thing} is inside.', '{time} the {things} go out, one by one, {how}.',
  'Mote is there, {where}, {how}.', 'You dream that it rains {things}.', 'A {adj} sun comes up {where} and nobody looks.', 'You count the {things}. There is one more than before.',
  '{who} hands you {thing} and says nothing.', 'The stairs go down {how}. {feel}', 'You are {where}. It is {adj} there, and you are not afraid.', 'Something turns over in the Box. {feel}',
] as const;

const DESCRIBE: Record<VoiceKind, readonly string[]> = {
  universe: ['A {adj} universe. {feel}', 'It holds {things} and {things}, {how}.', '{where}, {who} {does} {thing}.', 'It is {adj} all the way down. {feel}', 'There is {thing} in it {where}.', 'It turns {how}. {feel}'],
  system: ['A {adj} sun and what circles it.', 'Its worlds go round {how}.', 'There is {thing} hung in its sky.', 'The light here is {adj}. {feel}', 'Something circles it that is not a world.', '{who} {does} its {things}.'],
  planet: ['A {adj} world. {feel}', 'Its sky is {adj} and close.', 'There is {thing} on it {where}.', 'It keeps its {things} {how}.', '{who} {does} {thing} here.', 'The ground is {adj}. It remembers rain.'],
  village: ['A {adj} place with {things} in it.', '{who} {does} {thing} here, {how}.', 'They keep {thing} lit.', 'Their roofs are {adj}. {feel}', 'They have {things} and not much else.', 'They look up {how}.'],
  chronicle: ['It was written down {how}.', '{time}, {who} {does} {thing}.', 'They remember it as {adj}.', 'After that the {things} were different.', 'Nobody agreed on what it meant.', 'It is still told, {how}.'],
  narration: ['{feel}', '{time}, {thing} {where}.', 'It goes on {how}.', 'You hear {things}, {where}.', 'The dark is {adj} here.', '{who} {does} {thing}.'],
};
/** A quiet sentence that can follow any grammar line of that kind. */
const CODA: Record<VoiceKind, readonly string[]> = {
  universe: ['{feel}', 'It turns {how}.', 'It is {adj} at the edges.'],
  system: ['Its light arrives {how}.', '{feel}', 'The dark around it is {adj}.'],
  planet: ['Its sky is {adj} tonight.', '{feel}', 'It turns {how}.'],
  village: ['A lamp is lit there {how}.', '{feel}', 'Their doors are {adj}.'],
  chronicle: ['So it is told, {how}.', 'Nobody wrote down the rest.', '{feel}'],
  narration: ['{feel}', 'It goes on {how}.', 'The dark is {adj} here.'],
};

const fill = (pattern: string, r: Rng): string => {
  const s = pattern.replace(/\{(\w+)\}/g, (_, k: string) => r.pick((L as Record<string, readonly string[]>)[k] ?? ['']));
  // "A old" never; and each sentence starts with a capital.
  return s.replace(/\b([Aa]) ([aeiou])/g, '$1n $2').replace(/(^|[.!?] )([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
};
const seeded = (seedHex: string, label: string, index: number) => rng(makeSeed(hashString(`${label}:${seedHex}`), hashString(`${index}:${seedHex}:${label}`)));

/** A dream line. Same seed and index, same line; there are thousands. */
export const dreamLine = (seedHex: string, index = 0): string => fill(DREAM[seeded(seedHex, 'dream-pick', index).int(DREAM.length)]!, seeded(seedHex, 'dream', index));
/** A descriptive line for a kind of thing. */
export const describe = (kind: VoiceKind, seedHex: string, index = 0): string => {
  const list = DESCRIBE[kind] ?? DESCRIBE.narration;
  return fill(list[seeded(seedHex, `d-pick-${kind}`, index).int(list.length)]!, seeded(seedHex, `d-${kind}`, index));
};
/** The grammar's own re-voicing: the same line, with a seeded quiet sentence after it (one time in three, left alone). */
export const vary = (kind: VoiceKind, seedHex: string, text: string): string => {
  const r = seeded(`${seedHex}:${hashString(text)}`, `v-${kind}`, 0);
  if (r.chance(1, 3) || !/[.!?]$/.test(text.trim())) return text;
  const coda = fill(r.pick(CODA[kind] ?? CODA.narration), r);
  return text.includes(coda) ? text : `${text.trim()} ${coda}`;
};
