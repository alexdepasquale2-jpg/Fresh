/**
 * Screen geometry of a fold, shared by render/dive and ui/dive-hud so tap
 * targets match what is drawn. Each fold is a unit circle holding a centre
 * child (radius 1/3) and six ring children (radius 1/3, distance 2/3).
 * Zooming 3x into the centre child turns it into the next fold.
 */
export interface FoldFrame { cx: number; cy: number; R: number; zoom: number }

export const foldFrame = (w: number, h: number, progress: number): FoldFrame => ({
  cx: w / 2,
  cy: h * 0.47,
  R: Math.min(w, h * 0.9) * 0.46,
  zoom: Math.pow(3, Math.max(0, Math.min(999, progress)) / 1000),
});

/** Centre of child i (0 centre, 1..6 clockwise from top) in unit coords. */
export const childOffset = (i: number): [number, number] => {
  if (i === 0) return [0, 0];
  const a = ((i - 1) * Math.PI) / 3 - Math.PI / 2;
  return [(2 / 3) * Math.cos(a), (2 / 3) * Math.sin(a)];
};

export const childScreen = (f: FoldFrame, i: number) => {
  const [ox, oy] = childOffset(i);
  return { x: f.cx + ox * f.R * f.zoom, y: f.cy + oy * f.R * f.zoom, r: (f.R * f.zoom) / 3 };
};

/** Child index under a screen point, or -1. */
export const childAt = (f: FoldFrame, x: number, y: number): number => {
  for (let i = 0; i < 7; i++) {
    const c = childScreen(f, i);
    if ((x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r) return i;
  }
  return -1;
};
