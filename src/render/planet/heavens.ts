// Packs the generated sky (contracts/sky Heavens) into uniforms shared by the map and
// first-person shaders. Nothing is allocated per frame.
import type { PlanetRenderView } from '@/contracts/render';

/** GLSL uniforms both shaders declare. */
export const HEAVENS_GLSL = `uniform vec4 u_star, u_hv, u_arc; uniform vec4 u_bA[8]; uniform vec4 u_bB[8]; uniform int u_nb;`;
export const HEAVENS_UNIFORMS = ['u_star', 'u_hv', 'u_arc', 'u_bA', 'u_bB', 'u_nb'] as const;

const A = new Float32Array(32), B = new Float32Array(32);
const KIND = { moon: 0, world: 1, inner: 2, comet: 3 } as const;

export const uploadHeavens = (gl: WebGL2RenderingContext, loc: Record<string, WebGLUniformLocation | null>, v: PlanetRenderView): void => {
  const h = v.heavens;
  let n = 0;
  if (h) {
    for (let i = 0; i < h.bodies.length && n < 8; i++, n++) {
      const b = h.bodies[i]!;
      A[n * 4] = b.size; A[n * 4 + 1] = b.turns; A[n * 4 + 2] = b.phase; A[n * 4 + 3] = b.tilt;
      B[n * 4] = b.rgb[0]; B[n * 4 + 1] = b.rgb[1]; B[n * 4 + 2] = b.rgb[2]; B[n * 4 + 3] = KIND[b.kind] + (b.ringed ? 10 : 0);
    }
    gl.uniform4f(loc.u_star!, h.star.rgb[0], h.star.rgb[1], h.star.rgb[2], h.star.size);
    gl.uniform4f(loc.u_hv!, h.nebula.tint, h.nebula.offset, h.nebula.strength, h.star.strobe ? 1 : 0);
    gl.uniform4f(loc.u_arc!, h.rings.strength, h.rings.tilt, h.belt.strength, h.belt.tilt);
  } else {
    // No generated sky: fall back to plain piece counts.
    let moons = 0, comets = 0, rings = 0, belt = 0;
    for (let i = 0; i < v.sky.pieces.length; i++) { const k = v.sky.pieces[i]; if (k === 'moon') moons++; else if (k === 'comet') comets++; else if (k === 'rings') rings++; else if (k === 'belt') belt++; }
    for (let i = 0; i < moons + comets && n < 8; i++, n++) {
      const moon = i < moons;
      A[n * 4] = moon ? 1.2 - i * 0.2 : 1; A[n * 4 + 1] = moon ? 1 + i * 3 : 1; A[n * 4 + 2] = 0.25 + i * 0.31; A[n * 4 + 3] = moon ? -0.3 + i * 0.5 : 0.2;
      B[n * 4] = 0.93; B[n * 4 + 1] = 0.92; B[n * 4 + 2] = 0.86; B[n * 4 + 3] = moon ? 0 : 3;
    }
    gl.uniform4f(loc.u_star!, 1, 0.9, 0.7, 1);
    gl.uniform4f(loc.u_hv!, 11, 3, 0.4, 0);
    gl.uniform4f(loc.u_arc!, rings ? 0.75 : 0, 0, belt ? 0.75 : 0, 0);
  }
  gl.uniform4fv(loc.u_bA!, A);
  gl.uniform4fv(loc.u_bB!, B);
  gl.uniform1i(loc.u_nb!, n);
};
