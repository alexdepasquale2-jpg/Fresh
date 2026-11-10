// Dive renderer (unit 13): nested-ring fractal that re-roots at every fold.
import type { DiveRendererFactory, GlCore } from '@/contracts/render';
import { FULLSCREEN_VS, hexToRgb } from '@/render/gl';
import { foldFrame, childScreen } from '@/core/fold-layout';
import { FX_ONE } from '@/core/fixed';

const FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform vec2 u_res; uniform vec2 u_c; uniform float u_R, u_zoom, u_depth, u_pulse, u_light, u_time;
uniform vec3 u_pal[6]; uniform vec4 u_mark[7];
float h(vec2 n){ return fract(sin(dot(n, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 fc = vec2(v_uv.x * u_res.x, (1.0 - v_uv.y) * u_res.y);
  vec2 p = (fc - u_c) / (u_R * u_zoom);
  vec3 col = u_pal[0];
  float lvl = 0.0; float idx = 0.0;
  for (int L = 0; L < 8; L++) {
    float d = length(p);
    if (d > 1.0) break;
    float k = h(vec2(mod(u_depth + lvl, 997.0), idx));
    vec3 c = u_pal[1 + int(floor(k * 4.0))];
    col = mix(col, c, 0.45);
    float edge = smoothstep(0.05, 0.0, abs(d - 0.96));
    col += u_pal[5] * edge * (0.18 + 0.12 * sin(u_pulse * 6.2831 + lvl * 1.7));
    vec2 off = vec2(0.0); idx = 0.0;
    if (d > 1.0 / 3.0) {
      float a = atan(p.y, p.x) + 1.5708;
      float s = mod(floor(a / 1.0472 + 0.5), 6.0);
      float ang = s * 1.0472 - 1.5708;
      off = (2.0 / 3.0) * vec2(cos(ang), sin(ang));
      idx = s + 1.0;
    }
    vec2 q = (p - off) * 3.0;
    if (length(q) > 1.0) break;
    p = q; lvl += 1.0;
  }
  for (int i = 0; i < 7; i++) {
    vec4 m = u_mark[i];
    if (m.w < 0.5) continue;
    float d = length(fc - m.xy);
    if (m.w < 1.5) { // star
      float core = smoothstep(m.z * 0.22, 0.0, d);
      float halo = smoothstep(m.z * 0.9, 0.0, d) * 0.35;
      col += u_pal[4] * (core * 1.6 + halo) * (0.85 + 0.15 * sin(u_pulse * 12.566));
    } else { // flicker
      float ring = smoothstep(3.0, 0.0, abs(d - m.z * 0.28));
      col += u_pal[5] * ring * (0.5 + 0.5 * sin(u_time * 9.0 + float(i)));
    }
  }
  float v = length(fc - u_c) / (u_R * (0.55 + 0.09 * u_light));
  col *= clamp(1.25 - v * v, 0.05, 1.0);
  col += (h(fc + u_time) - 0.5) * 0.04;
  o = vec4(col, 1.0);
}`;

export const factory: DiveRendererFactory = () => {
  let core: GlCore | null = null;
  let prog: WebGLProgram | null = null;
  const pal = new Float32Array(18);
  const marks = new Float32Array(28);
  let palKey = '';
  let time = 0;
  const loc: Record<string, WebGLUniformLocation | null> = {};
  const build = () => {
    prog = core!.program(FULLSCREEN_VS, FS);
    for (const n of ['u_res', 'u_c', 'u_R', 'u_zoom', 'u_depth', 'u_pulse', 'u_light', 'u_time', 'u_pal', 'u_mark']) loc[n] = core!.gl.getUniformLocation(prog, n);
  };
  return {
    init: (c) => {
      core = c;
      build();
      c.onRestore(build);
    },
    draw: (v, dt) => {
      if (!core || !prog || core.lost()) return;
      const u = v.dive.universe;
      const gl = core.gl;
      time += dt / 1000;
      if (u && u.serial !== palKey) {
        palKey = u.serial;
        [0, 2, 3, 4, 11, 10].forEach((pi, i) => {
          const [r, g, b] = hexToRgb(u.palette[pi]!);
          pal[i * 3] = r / 255; pal[i * 3 + 1] = g / 255; pal[i * 3 + 2] = b / 255;
        });
        const [r, g, b] = hexToRgb(u.palette[7]!);
        pal[12] = r / 255; pal[13] = g / 255; pal[14] = b / 255; // stars in gold
      }
      const w = core.width(), h = core.height();
      const f = foldFrame(w, h, v.dive.progress);
      marks.fill(0);
      for (const ch of v.dive.children) {
        const s = childScreen(f, ch.index);
        marks.set([s.x, s.y, s.r, ch.star ? 1 : ch.flicker ? 2 : 0], ch.index * 4);
      }
      gl.useProgram(prog);
      gl.uniform2f(loc.u_res!, w, h);
      gl.uniform2f(loc.u_c!, f.cx, f.cy);
      gl.uniform1f(loc.u_R!, f.R);
      gl.uniform1f(loc.u_zoom!, f.zoom);
      gl.uniform1f(loc.u_depth!, v.dive.depth % 997);
      gl.uniform1f(loc.u_pulse!, v.pulse / FX_ONE);
      gl.uniform1f(loc.u_light!, v.lightPips);
      gl.uniform1f(loc.u_time!, time % 1000);
      gl.uniform3fv(loc.u_pal!, pal);
      gl.uniform4fv(loc.u_mark!, marks);
      core.quad(prog);
    },
    dispose: () => void (core = null),
  };
};
