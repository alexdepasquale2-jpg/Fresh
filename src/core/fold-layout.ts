/**
 * Screen geometry of a fold, shared by render/dive and ui/dive-hud so tap
 * targets match what is drawn. Each fold is a unit circle holding a centre
 * child (radius 1/3) and six ring children (radius 1/3, distance 2/3).
 * Zooming 3x into the centre child turns it into the next fold.
 */
/** zoom 1..3 through a fold; (ax, ay) is the aimed child's offset, t 0..1 how far the camera has slid to it. */
export interface FoldFrame { cx: number; cy: number; R: number; zoom: number; ax: number; ay: number; t: number }

/** Centre of child i (0 centre, 1..6 clockwise from top) in unit coords. */
export const childOffset = (i: number): [number, number] => {
  if (i === 0) return [0, 0];
  const a = ((i - 1) * Math.PI) / 3 - Math.PI / 2;
  return [(2 / 3) * Math.cos(a), (2 / 3) * Math.sin(a)];
};

export const foldFrame = (w: number, h: number, progress: number, aim = 0): FoldFrame => {
  const zoom = Math.pow(3, Math.max(0, Math.min(999, progress)) / 1000);
  const [ax, ay] = childOffset(aim);
  return { cx: w / 2, cy: h * 0.47, R: Math.min(w, h * 0.9) * 0.46, zoom, ax, ay, t: (zoom - 1) / 2 };
};

/** Screen = centre + R*zoom*(unit - aim*t): at zoom 3 the aimed child fills the fold exactly. */
export const childScreen = (f: FoldFrame, i: number) => {
  const [ox, oy] = childOffset(i);
  return { x: f.cx + (ox - f.ax * f.t) * f.R * f.zoom, y: f.cy + (oy - f.ay * f.t) * f.R * f.zoom, r: (f.R * f.zoom) / 3 };
};

/** Child index under a screen point, or -1. */
export const childAt = (f: FoldFrame, x: number, y: number): number => {
  for (let i = 0; i < 7; i++) {
    const c = childScreen(f, i);
    if ((x - c.x) ** 2 + (y - c.y) ** 2 <= c.r * c.r) return i;
  }
  return -1;
};
