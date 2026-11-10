import { describe, it, expect } from 'vitest';
import { factory } from '@/ui/dive-hud';

describe('unit 22: src/ui/dive-hud', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Shows SURFACE chip, LIGHT pips, FOLD counter with depth bar and best marker, narration line, RELIQUARIES (3) and a large round HOLD.");
  it.todo("Press and hold HOLD to fall, release to hover; release near a star stops and opens the Solar system.");
  it.todo("Tapping a flicker throws a reliquary and shows the capture result.");
  it.todo("SURFACE returns to the Box.");
  it.todo("Updates every frame without allocating new DOM nodes.");
  it.todo("Uses kit components and tokens only; 44 px targets.");
});
