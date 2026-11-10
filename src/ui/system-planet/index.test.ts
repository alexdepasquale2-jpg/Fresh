import { describe, it, expect } from 'vitest';
import { factory } from '@/ui/system-planet';

describe('unit 23: src/ui/system-planet', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Solar system shows DIVE chip, system name, universe and fold, the selected planet card with placed pieces and one surface line, WATCH THE SURFACE and the SKY PIECES tray of six tiles with counts.");
  it.todo("Dragging a tile onto an orbit places it via game/sky; invalid drops snap back with a reason.");
  it.todo("Planet shows SKY chip, name, age and year, the surface, THEIR SKY strip, souls, villages, glow, THEIR CHRONICLE newest first, pause/1x/3x and CHANGE THEIR SKY.");
  it.todo("The planet screen has no way to edit the surface directly.");
  it.todo("Chronicle entries show the event and, once known, the reason.");
  it.todo("Kit components and tokens only; 44 px targets.");
});
