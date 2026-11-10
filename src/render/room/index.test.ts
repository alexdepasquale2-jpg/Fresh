import { describe, it, expect } from 'vitest';
import { factory } from '@/render/room';

describe('unit 16: src/render/room', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("Draws a top-down pixel bedroom with floor, bed, desk and PC, using design tokens only.");
  it.todo("Kid sprite walks toward target at a fixed speed; mote() eases after the kid.");
  it.todo("PC screen glows with the pulse phase.");
  it.todo("Pixel art is crisp (integer scale); Mote glow is smooth.");
  it.todo("No allocation in draw().");
  it.todo("Recovers after context loss.");
});
