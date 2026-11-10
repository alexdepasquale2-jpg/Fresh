// Placeholder demo. Unit 14 replaces this with the unit running alone on a fixed seed.
import type { Demo } from '@/contracts/units';
import readme from './README.md?raw';

export const demo: Demo = {
  title: 'Unit 14: src/render/system',
  mount: (root) => {
    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;padding:16px;font:12px var(--font-ui);color:var(--ink-muted)';
    pre.textContent = readme;
    root.append(pre);
    return () => pre.remove();
  },
};
