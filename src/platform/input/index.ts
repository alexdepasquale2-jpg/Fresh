// STUB: replace with the real gesture recogniser (unit 26). See README.md.
import type { InputFactory, InputEvent } from '@/contracts/platform';

export const factory: InputFactory = () => {
  const subs = new Set<(e: InputEvent) => void>();
  let el: HTMLElement | null = null;
  const emit = (e: InputEvent) => subs.forEach((s) => s(e));
  const onUp = (ev: PointerEvent) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = (ev.target as HTMLElement | null)?.closest('[data-id]')?.getAttribute('data-id') ?? null;
    emit({ type: 'tap', at: { x: ev.clientX - r.left, y: ev.clientY - r.top }, target: t });
  };
  return {
    attach: (e) => {
      el = e;
      e.addEventListener('pointerup', onUp);
    },
    detach: () => {
      el?.removeEventListener('pointerup', onUp);
      el = null;
    },
    on: (cb) => {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
  };
};
