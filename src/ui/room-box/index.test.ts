import { describe, it, expect } from 'vitest';
import { factory } from '@/ui/room-box';

describe('unit 21: src/ui/room-box', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Bedroom shows LIGHT pips top left, BOX nn/25 top right, one narration line, OPEN THE BOX and hints, at 390x844.");
  it.todo("Tapping the floor walks the kid there and Mote follows (via render/room).");
  it.todo("The Box shows a ROOM back chip, title, count, the Mote card, and a 5x5 slot grid with a glyph per universe.");
  it.todo("Selecting a slot shows name, serial, law tags and three stats; ENTER starts a dive, WORLDS n lists worlds tended.");
  it.todo("Uses src/ui/kit components and tokens only; all targets at least 44 px.");
  it.todo("Playwright screenshot at 390x844 matches docs/DESIGN.md layout (checked by review of the demo).");
});
