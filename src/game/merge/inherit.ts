// The data of inheritance: named recipes, mutation traits, the signs sky pieces leave. All plain data.
import type { MergeRecipe } from '@/contracts/merge';
import type { UniverseModifiers, UniverseTrait } from '@/contracts/universe';
import type { SkyPieceKind } from '@/contracts/sky';

const recipe = (id: string, name: string, a: string, b: string, says: string, traitName: string, traitSays: string, mods: UniverseModifiers): MergeRecipe => ({
  id, name, tags: [a, b].sort() as [string, string], says,
  trait: { id: `recipe-${id}`, name: traitName, says: traitSays, mods, dominant: true, source: 'recipe' },
});

/**
 * A recipe fires when one parent's laws carry the first tag and the other's the second.
 * The first match in this list wins, so the order is part of the rules.
 */
export const RECIPES: readonly MergeRecipe[] = [
  recipe('grey-shore', 'The Grey Shore', 'ASH', 'SALT', 'Ash settles on the water and the tide carries it out.', 'Grey-shored', 'Its beaches are ash. Its ash is wet.', { tide: 8, ward: 8 }),
  recipe('embers-under-snow', 'Embers Under Snow', 'ASH', 'COLD FIRE', 'Under the grey there is still something lit, and it is cold.', 'Ember-bedded', 'Dig anywhere in it and you find a glow.', { glow: 10, ward: 6, climateCalm: -4 }),
  recipe('singing-pane', 'The Singing Pane', 'CHOIR', 'GLASS', 'Every window in it holds one note.', 'Pane-voiced', 'Its glass sings when the weather turns.', { faith: 10, luck: 6 }),
  recipe('first-garden', 'First Garden After', 'ASH', 'GREEN', 'Something green comes up through the grey.', 'Ash-fed', 'What burned here feeds what grows here.', { growth: 14, faith: 4 }),
  recipe('held-note', 'The Held Note', 'CHOIR', 'SLOW TIME', 'One voice, one breath, and no one has let it go.', 'Held', 'Its songs take a lifetime to finish.', { tempo: -10, faith: 10 }),
  recipe('candle-end', 'Candle-end', 'ASH', 'TALLOW', 'What is left when the candle is done still gives a little light.', 'Stub-lit', 'It burns down to nothing and then a little further.', { glow: 8, ward: 6 }),
  recipe('frost-window', 'Frost Window', 'COLD FIRE', 'GLASS', 'The cold draws ferns on every pane.', 'Rimed', 'It is beautiful to look through and hard to see into.', { climateCalm: 8, luck: 8 }),
  recipe('burning-sea', 'Burning Sea', 'COLD FIRE', 'TIDES', 'The water is alight, and nothing in it is warm.', 'Sea-lit', 'Its tides come in burning blue.', { tide: 10, might: 8 }),
  recipe('unwarming-candle', 'The Candle That Does Not Warm', 'COLD FIRE', 'TALLOW', 'It is lit. Hold your hand to it. Nothing.', 'Cold-wicked', 'Its lamps give light and keep their heat.', { glow: 14, growth: -4 }),
  recipe('wisp', "Will-o'-the-wisp", 'COLD FIRE', 'PALE', 'A pale light goes ahead of you. It knows the way down.', 'Wisp-led', 'Follow its lights and you find things. Not always the way back.', { luck: 12, depth: 6 }),
  recipe('hourglass', 'Hourglass', 'GLASS', 'SLOW TIME', 'The sand in it has almost stopped.', 'Waisted', 'Everything in it passes through one narrow place.', { tempo: -8, depth: 10 }),
  recipe('terrarium', 'Terrarium', 'GLASS', 'GREEN', 'Green things, sealed in, breathing their own breath.', 'Glassed-in', 'Its weather belongs to it alone.', { growth: 10, climateCalm: 10 }),
  recipe('wax-flowers', 'Wax Flowers', 'BLOOM', 'RAIN', 'The rain cannot wilt them. They were never alive.', 'Wax-petalled', 'Its flowers do not fade. They soften at noon.', { growth: 8, glow: 8 }),
  recipe('kelp-cathedral', 'Kelp Cathedral', 'GREEN', 'TIDES', 'The weed grows up in aisles. The fish go quietly.', 'Weed-vaulted', 'Its seas have a roof of leaves.', { growth: 8, tide: 8, faith: 6 }),
  recipe('preserved', 'Preserved', 'SALT', 'TALLOW', 'Packed in salt, sealed in fat. It will keep.', 'Long-kept', 'Nothing put away in it is ever lost.', { ward: 14 }),
  recipe('long-afternoon', 'Long Afternoon', 'PLAIN', 'SLOW TIME', 'The light lies gold across the floor and does not move.', 'Gold-houred', 'It is always a little after four.', { climateCalm: 10, tempo: -8 }),
  recipe('dead-calm', 'Dead Calm', 'SALT', 'SLOW TIME', 'The sea has stopped. A gull hangs where it was.', 'Becalmed', 'No wind has crossed it in an age.', { climateCalm: 14, tide: -6 }),
  recipe('hearth-thief', 'Hearth-thief', 'COLD FIRE', 'PLAIN', 'It took the warmth out of an ordinary morning and kept it.', 'Warm-handed', 'It has more heat than it came by honestly.', { might: 8, glow: 6 }),
  recipe('second-morning', 'Second Morning', 'PLAIN', 'PLAIN', 'Two plain days folded together make one that is new.', 'Twice-dawned', 'The sun comes up in it, and then comes up again.', { glow: 6, luck: 6, growth: 6 }),
  recipe('stopped-clock', 'Stopped Clock', 'SLOW TIME', 'SLOW TIME', 'Slow, folded into slow, is still.', 'Stilled', 'It is right twice a day and does not care.', { tempo: -15, ward: 10 }),
];

/** Traits no found universe has. Only a merge can make one. */
export const MUTATIONS: readonly UniverseTrait[] = ([
  ['seamed', 'Seamed', 'You can see where the two were joined. Light gets in there.', { glow: 8, depth: 4 }],
  ['twice-folded', 'Twice-folded', 'It has more inside than either of the two it came from.', { depth: 12 }],
  ['grafted', 'Grafted', 'One took on the other like a branch. It fruits oddly.', { growth: 10, luck: 4 }],
  ['double-pulsed', 'Double-pulsed', 'It has two heartbeats, a little apart.', { tempo: 8, might: 6 }],
  ['orphaned', 'Orphaned', 'It does not remember either of them. It clings to you instead.', { luck: 10 }],
  ['overgrown-seam', 'Scarred over', 'Where it was torn and mended, it is stronger.', { ward: 12 }],
  ['haunted', 'Haunted', 'Something of the two that were spent still walks in it.', { faith: 12, climateCalm: -4 }],
  ['star-spilled', 'Star-spilled', 'Stars from both ran together and none were lost.', { starDensity: 14 }],
  ['mirror-skied', 'Mirror-skied', 'Its sky shows another sky, a little late.', { luck: 6, glow: 6 }],
  ['unnamed', 'Unnamed', 'Its people have no word for where they live.', { faith: -8, growth: 8, might: 6 }],
] as const).map(([id, name, says, mods]) => ({ id: `mut-${id}`, name, says, mods: { ...mods }, source: 'mutation' as const }));

/** The mark a sky piece leaves on a universe reborn under it. */
export const SIGNS: Record<SkyPieceKind, UniverseTrait> = {
  comet: { id: 'sign-comet', name: 'Comet-marked', says: 'It was reborn under a comet and has been in a hurry since.', mods: { tempo: 6, luck: 6 }, source: 'inherited' },
  moon: { id: 'sign-moon', name: 'Moon-drawn', says: 'It was reborn under a moon. Its water has not forgotten.', mods: { tide: 10 }, source: 'inherited' },
  belt: { id: 'sign-belt', name: 'Belted', says: 'It was reborn under a belt of stone and wears it like armour.', mods: { ward: 8 }, source: 'inherited' },
  sun: { id: 'sign-sun', name: 'Sun-struck', says: 'It was reborn under a sun and still gives it back.', mods: { glow: 10 }, source: 'inherited' },
  rings: { id: 'sign-rings', name: 'Ringed', says: 'It was reborn under rings. Its seasons keep to their lanes.', mods: { climateCalm: 8 }, source: 'inherited' },
  dust: { id: 'sign-dust', name: 'Dust-sown', says: 'It was reborn under dust, and the dust took root.', mods: { growth: 8 }, source: 'inherited' },
};
