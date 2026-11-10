import { describe, it, expect } from 'vitest';
import { factory } from '@/render/planet';

describe('unit 15: src/render/planet', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Draws the grid crisp at an integer scale via GlCore.blit with the universe palette.");
  it.todo("Uploads only dirty chunk rows, not the whole texture, when few chunks are dirty.");
  it.todo("Draws a bonfire at each village whose flicker follows the pulse; bonfires use the glow token.");
  it.todo("No allocation in draw().");
  it.todo("Recovers after context loss by re-uploading the full grid.");
  it.todo("Holds 60 fps at 390x844 with all chunks dirty on a 4x-throttled profile (state numbers).");
});
