/** /dev gallery: auto-discovers every demo.ts. Units add demos without touching this file. */
import '@/ui/tokens.css';
import './app.css';
import type { Demo } from '@/contracts/units';

const modules = {
  ...import.meta.glob<{ demo: Demo }>('/src/**/demo.ts'),
  ...import.meta.glob<{ demo: Demo }>('/atlas/**/demo.ts'),
  ...import.meta.glob<{ demo: Demo }>('/tools/**/demo.ts'),
};

export const bootDev = (host: HTMLElement) => {
  host.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:16px;overflow:auto;position:fixed;inset:0';
  const nav = document.createElement('nav');
  nav.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
  const stage = document.createElement('section');
  stage.style.cssText = 'position:relative;width:390px;min-height:844px;border:2px solid var(--line-dim)';
  host.append(nav, stage);
  let cleanup: (() => void) | null = null;
  const open = async (path: string) => {
    cleanup?.();
    stage.replaceChildren();
    const m = await modules[path]!();
    cleanup = m.demo.mount(stage);
    location.hash = path;
  };
  for (const path of Object.keys(modules).sort()) {
    const b = document.createElement('button');
    b.className = 'k-btn';
    b.textContent = path.replace(/^\/(src\/)?/, '').replace(/\/demo\.ts$/, '');
    b.onclick = () => void open(path);
    nav.append(b);
  }
  const first = location.hash.slice(1);
  if (first && modules[first]) void open(first);
};
