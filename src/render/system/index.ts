// Solar-system renderer (unit 14): star, smooth orbits, planets, pieces, drag ghost.
import type { SystemRendererFactory, GlCore } from '@/contracts/render';
import type { SkyPieceKind } from '@/contracts/sky';
import { FULLSCREEN_VS, hexToRgb } from '@/render/gl';
import { FX_ONE } from '@/core/fixed';
import { seedToHex } from '@/core/hash';

export const systemLayout = (w: number) => ({ cx: w / 2, cy: 250, ring: (i: number) => 52 + i * 34 });
const KIND_ID: Record<SkyPieceKind, number> = { comet: 1, moon: 2, belt: 3, sun: 4, rings: 5, dust: 6 };

const FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform vec2 u_res, u_c; uniform float u_rings[4]; uniform int u_n, u_sel, u_hover;
uniform vec3 u_planet[4]; uniform vec4 u_piece[16]; uniform vec3 u_ghost;
uniform vec3 u_bg, u_line, u_ink, u_gold, u_glow; uniform float u_pulse, u_heat;
void main(){
  vec2 fc = vec2(v_uv.x * u_res.x, (1.0 - v_uv.y) * u_res.y);
  vec3 col = u_bg;
  float d = length(fc - u_c);
  float sr = 18.0 + u_heat * 14.0 + 3.0 * sin(u_pulse * 6.2831);
  vec3 sc = mix(u_glow, u_gold, u_heat);
  col += sc * smoothstep(sr, 0.0, d) * 1.2 + sc * exp(-d * 0.03) * 0.15;
  float ang = atan(fc.y - u_c.y, fc.x - u_c.x);
  col += sc * smoothstep(sr * 2.2, sr, d) * pow(abs(sin(ang * 6.0 + u_pulse * 3.0)), 12.0) * 0.25;
  col += u_gold * smoothstep(90.0, 0.0, d) * 0.12 * (0.6 + u_heat);
  for (int i = 0; i < 4; i++) {
    if (i >= u_n) break;
    vec3 lc = i == u_hover ? u_glow : (i == u_sel ? u_glow * 0.7 : u_line);
    float w = i == u_hover ? 2.2 : 1.2;
    col = mix(col, lc, smoothstep(w, 0.0, abs(d - u_rings[i])));
    float pd = length(fc - u_planet[i].xy);
    col = mix(col, i == u_sel ? u_glow : u_ink, smoothstep(u_planet[i].z, u_planet[i].z - 1.5, pd));
  }
  for (int i = 0; i < 16; i++) {
    vec4 p = u_piece[i];
    if (p.w < 0.5) continue;
    vec2 r = fc - p.xy; float pd = length(r); int k = int(p.z + 0.5);
    if (k == 1) { // comet: head and a tail pointing away from the star
      vec2 away = normalize(p.xy - u_c); float al = dot(r, away); float ac = length(r - away * al);
      col = mix(col, u_glow, smoothstep(2.6, 1.4, pd) + smoothstep(0.0, 2.0, al) * smoothstep(16.0, 0.0, al) * smoothstep(1.2 + al * 0.12, 0.0, ac) * 0.7);
    } else if (k == 2) { // moon: shaded disc
      col = mix(col, mix(u_line, u_ink, smoothstep(-2.0, 2.0, dot(r, normalize(u_c - p.xy)))), smoothstep(3.6, 2.6, pd));
    } else if (k == 3) { // belt: scattered glints in a ring
      float a = atan(r.y, r.x); col += u_gold * smoothstep(1.2, 0.0, abs(pd - 4.0)) * step(0.5, fract(a * 2.5)) * 0.9;
    } else if (k == 4) { // second sun
      col += u_gold * (smoothstep(3.8, 2.4, pd) * 1.3 + exp(-pd * 0.35) * 0.4);
    } else if (k == 5) { // rings: a tilted ellipse
      vec2 e = vec2(r.x, r.y * 3.0); col = mix(col, u_ink, smoothstep(1.4, 0.4, abs(length(e) - 7.0)) * 0.8);
    } else { // dust: a soft haze
      col = mix(col, u_line * 1.3, smoothstep(9.0, 0.0, pd) * 0.45 * (0.7 + 0.3 * sin(pd * 2.0 + u_pulse * 6.28)));
    }
  }
  if (u_ghost.z > 0.5) col = mix(col, u_glow, smoothstep(9.0, 7.0, length(fc - u_ghost.xy)) * 0.8);
  o = vec4(col, 1.0);
}`;

export const factory: SystemRendererFactory = () => {
  let core: GlCore | null = null;
  let prog: WebGLProgram | null = null;
  const loc: Record<string, WebGLUniformLocation | null> = {};
  const rings = new Float32Array(4);
  const planets = new Float32Array(12);
  const pieces = new Float32Array(64);
  let n = 0;
  const build = () => {
    prog = core!.program(FULLSCREEN_VS, FS);
    for (const k of ['u_res', 'u_c', 'u_rings', 'u_n', 'u_sel', 'u_hover', 'u_planet', 'u_piece', 'u_ghost', 'u_bg', 'u_line', 'u_ink', 'u_gold', 'u_glow', 'u_pulse', 'u_heat']) loc[k] = core!.gl.getUniformLocation(prog, k);
  };
  const rgb = (gl: WebGL2RenderingContext, l: WebGLUniformLocation | null | undefined, hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    gl.uniform3f(l!, r / 255, g / 255, b / 255);
  };
  return {
    init: (c) => {
      core = c;
      build();
      c.onRestore(build);
    },
    orbitAt: (x, y) => {
      if (!core) return -1;
      const L = systemLayout(core.width());
      const d = Math.hypot(x - L.cx, y - L.cy);
      for (let i = 0; i < n; i++) if (Math.abs(d - L.ring(i)) <= 16) return i;
      return -1;
    },
    draw: (v) => {
      if (!core || !prog || core.lost()) return;
      const gl = core.gl;
      const w = core.width();
      const L = systemLayout(w);
      n = v.system.orbits.length;
      pieces.fill(0);
      let pc = 0;
      v.system.orbits.forEach((o, i) => {
        rings[i] = L.ring(i);
        const a = ((v.tick % o.periodTicks) / o.periodTicks) * Math.PI * 2 + i * 1.7;
        const px = L.cx + Math.cos(a) * rings[i]!, py = L.cy + Math.sin(a) * rings[i]!;
        planets.set([px, py, 6 + (i % 2) * 2], i * 3);
        const key = seedToHex(v.system.planets[o.planet]!.seed);
        const sky = v.skies.find((s) => s.planetKey === key);
        sky?.pieces.forEach((k, j) => {
          if (pc >= 16) return;
          const pa = a + (j + 1) * 0.5 + (v.tick / 40) * (j % 2 ? 1 : -1) * 0.05;
          pieces.set([px + Math.cos(pa) * 14, py + Math.sin(pa) * 14, KIND_ID[k], 1], pc++ * 4);
        });
      });
      gl.useProgram(prog);
      gl.uniform2f(loc.u_res!, w, core.height());
      gl.uniform2f(loc.u_c!, L.cx, L.cy);
      gl.uniform1fv(loc.u_rings!, rings);
      gl.uniform1i(loc.u_n!, n);
      gl.uniform1i(loc.u_sel!, v.selectedOrbit);
      gl.uniform1i(loc.u_hover!, v.drag?.overOrbit ?? -1);
      gl.uniform3fv(loc.u_planet!, planets);
      gl.uniform4fv(loc.u_piece!, pieces);
      gl.uniform3f(loc.u_ghost!, v.drag?.x ?? 0, v.drag?.y ?? 0, v.drag ? 1 : 0);
      const p = v.universe.palette;
      rgb(gl, loc.u_bg, p[0]!); rgb(gl, loc.u_line, p[3]!); rgb(gl, loc.u_ink, p[8]!); rgb(gl, loc.u_gold, p[7]!); rgb(gl, loc.u_glow, p[10]!);
      gl.uniform1f(loc.u_pulse!, v.pulse / FX_ONE);
      gl.uniform1f(loc.u_heat!, v.system.star.heat / 255);
      core.quad(prog);
    },
    dispose: () => void (core = null),
  };
};
