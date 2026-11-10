import { describe, it, expect } from 'vitest';
import { factory } from '@/platform/input';

describe('unit 26: src/platform/input', () => {
  it('exports a factory', () => {
    expect(typeof factory).toBe('function');
  });
  it.todo("A press shorter than 250 ms with under 10 px movement is a tap with its data-id target.");
  it.todo("A press held over 250 ms emits hold then release with heldMs.");
  it.todo("A press on a data-drag element that moves over 10 px emits drag start, move, end with the data-drop under the pointer.");
  it.todo("Multi-touch is ignored after the first pointer.");
  it.todo("detach removes every listener.");
  it.todo("Coordinates are CSS px relative to the attached element.");
});
