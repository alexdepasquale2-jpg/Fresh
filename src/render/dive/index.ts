// Dive renderer (unit 13): nested-ring fractal that re-roots at every fold, coloured by the
// stratum, with parallax dust, speed lines, and a marker for everything a fold can hold.
// One fullscreen pass. draw() allocates nothing: every uniform comes from scalars or a preallocated array.
import type { DiveRendererFactory, GlCore } from '@/contracts/render';
import type { FoldThingKind, StratumMotion } from '@/contracts/fold';
import { FULLSCREEN_VS, hexToRgb } from '@/render/gl';
import { childOffset } from '@/core/fold-layout';
import { FX_ONE } from '@/core/fixed';

// The fragment stage declares highp for everything it uses and shares no uniform with the
// vertex stage, so the two stages can never disagree on a precision.
const FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv; out vec4 o;
uniform vec2 u_res; uniform vec2 u_c; uniform float u_R, u_zoom, u_depth, u_pulse, u_light, u_time;
uniform vec3 u_pal[6]; uniform vec4 u_mark[7]; uniform float u_family; uniform vec2 u_jc; uniform vec2 u_aimOff; uniform float u_t, u_aim, u_came;
uniform vec4 u_par; uniform float u_speed, u_dark, u_shiver, u_follow, u_levels; uniform vec2 u_rot; uniform vec2 u_drift; uniform vec4 u_catch;
const vec3 HZ = vec3(1.0, 0.33, 0.24);
float h(vec2 n){ return fract(sin(dot(n, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + 1.0), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.1 + 3.7; a *= 0.5; } return s; }
// Pattern inside one fold disc, in that fold's local coords (so re-rooting never pops).
float pattern(vec2 p, float key){
  if (u_family < 0.5) { float d = length(p); return 0.5 + 0.5 * sin(d * 18.0 + key * 6.0 - u_pulse * 6.2831 + 0.9 * sin(atan(p.y, p.x) * 3.0 + key)); }
  if (u_family < 1.5) { vec2 z = p * 1.4; float trap = 9.0; vec2 c = u_jc + vec2(sin(key * 3.1), cos(key * 2.3)) * 0.04;
    for (int i = 0; i < 10; i++) { z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c; trap = min(trap, abs(length(z) - 0.6)); if (dot(z, z) > 16.0) break; }
    return exp(-trap * 7.0); }
  vec2 w = p * 2.4 + key; w += vec2(fbm(w + u_time * 0.05), fbm(w.yx - u_time * 0.04)) * 1.6; return fbm(w);
}
// Dust: one cell-hashed speck per grid cell. Two octaves cross-fade so the zoom never pops.
float specks(vec2 uv, float seed){ vec2 g = floor(uv), f = fract(uv);
  vec2 c = vec2(h(g * 1.7 + seed + 3.1), h(g * 2.3 + seed + 7.7)) * 0.7 + 0.15;
  return step(0.7, h(g + seed)) * smoothstep(0.09, 0.0, length(f - c)); }
float dust(vec2 q, float ph, float seed){
  float p2 = fract(ph + 0.5);
  return specks(q * exp2(ph * 2.0) * 2.5, seed) * sin(3.14159 * ph) + specks(q * exp2(p2 * 2.0) * 2.5, seed + 19.0) * sin(3.14159 * p2); }
void main(){
  vec2 fc = vec2(v_uv.x * u_res.x, (1.0 - v_uv.y) * u_res.y);
  vec2 sq = (fc - u_c) / u_R;
  float sr = length(sq);
  vec2 p = sq / u_zoom + u_aimOff * u_t;
  float neb = fbm(sq * 1.3 + vec2(u_time * 0.02, -u_time * 0.015) + u_drift);
  vec3 col = (u_pal[0] + u_pal[1] * neb * 0.35 + u_pal[3] * pow(neb, 3.0) * 0.4) * (1.0 - 0.55 * u_dark);
  // Far dust, behind the folds.
  col += u_pal[2] * dust(sq + u_drift * 0.4, u_par.x, 1.0) * 0.55;
  float lvl = 0.0; float idx = u_came;
  for (int L = 0; L < 8; L++) {
    if (float(L) >= u_levels) break;
    float d = length(p);
    if (d > 1.0) break;
    float k = h(vec2(mod(u_depth + lvl, 997.0), idx));
    vec3 c = u_pal[1 + int(floor(k * 4.0))];
    col = mix(col, c, 0.42);
    // The stratum's motion turns the pattern, never the geometry: tap targets stay true.
    float sgn = mod(lvl, 2.0) < 0.5 ? 1.0 : -1.0;
    vec2 pr = vec2(u_rot.x * p.x - sgn * u_rot.y * p.y, sgn * u_rot.y * p.x + u_rot.x * p.y);
    pr += (vec2(h(vec2(floor(u_time * 14.0), lvl)), h(vec2(lvl, floor(u_time * 14.0)))) - 0.5) * u_shiver;
    float pat = pattern(pr, k * 10.0);
    col = mix(col, mix(u_pal[2], u_pal[5], pat * 0.6), 0.22 * smoothstep(1.0, 0.7, d));
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
  // Near dust, in front, moving faster.
  col += u_pal[5] * dust(sq * 0.6 + 7.3, u_par.y, 41.0) * 0.5;
  // Speed lines, streaming outward from the fall line.
  if (u_speed > 0.01) {
    float a = atan(sq.y, sq.x) * 11.0;
    float n = h(vec2(floor(a), 3.0));
    float along = fract(sr * 0.9 - u_time * (1.4 + n * 2.2) + n * 9.0);
    col += u_pal[5] * step(0.5, n) * smoothstep(0.16, 0.0, abs(fract(a) - 0.5)) * smoothstep(0.0, 0.15, along) * smoothstep(0.55, 0.15, along) * smoothstep(0.5, 1.15, sr) * u_speed * 0.6;
  }
  for (int i = 0; i < 7; i++) {
    vec4 m = u_mark[i];
    float mz = max(m.z, 1.0);
    vec2 lp = (fc - m.xy) / mz;
    float d = length(lp);
    float dp = d * mz;
    if (float(i) == u_aim) col += u_pal[5] * smoothstep(2.5, 0.0, abs(dp - mz * 0.97)) * (0.55 + 0.25 * sin(u_time * 5.0));
    if (m.w < 0.5 || d > 1.0) continue;
    float fi = float(i);
    float ang = atan(lp.y, lp.x);
    if (m.w < 1.5) { // star
      float core = smoothstep(mz * 0.22, 0.0, dp);
      float halo = smoothstep(mz * 0.9, 0.0, dp) * 0.35;
      col += u_pal[4] * (core * 1.6 + halo) * (0.85 + 0.15 * sin(u_pulse * 12.566));
    } else if (m.w < 2.5) { // flicker
      float ring = smoothstep(3.0, 0.0, abs(dp - mz * 0.28));
      col += u_pal[5] * ring * (0.5 + 0.5 * sin(u_time * 9.0 + fi));
    } else if (m.w < 3.5) { // drifting sky piece: a gold lozenge with a glint
      vec2 b = lp + vec2(0.05 * sin(u_time * 1.3 + fi), 0.05 * cos(u_time * 1.7 + fi));
      float dd = abs(b.x) + abs(b.y);
      col = mix(col, u_pal[4] * 1.35, smoothstep(0.27, 0.21, dd));
      col += u_pal[4] * smoothstep(0.03, 0.0, min(abs(b.x), abs(b.y))) * smoothstep(0.5, 0.12, d) * 0.7;
      col += u_pal[4] * smoothstep(0.03, 0.0, abs(d - 0.44)) * 0.3;
    } else if (m.w < 4.5) { // light well: a soft bright pool with slow rays
      float rays = 0.6 + 0.4 * cos(ang * 8.0 + u_time * 1.5);
      col += mix(u_pal[5], vec3(1.0), 0.55) * (smoothstep(0.32, 0.0, d) * 1.4 + smoothstep(0.78, 0.1, d) * 0.4 * rays);
    } else if (m.w < 5.5) { // echo: rings going out, like a voice
      float w = fract(d * 2.6 - u_time * 0.6);
      col += u_pal[5] * smoothstep(0.14, 0.0, abs(w - 0.5)) * smoothstep(0.78, 0.3, d) * smoothstep(0.04, 0.14, d) * 0.65;
      col += vec3(1.0) * smoothstep(0.07, 0.03, d) * 0.8;
    } else if (m.w < 6.5) { // wreck: a tumbling hull and a mast
      float ra = u_time * 0.3 + fi;
      vec2 w = vec2(cos(ra) * lp.x - sin(ra) * lp.y, sin(ra) * lp.x + cos(ra) * lp.y);
      vec2 q = abs(w) - vec2(0.3, 0.1);
      vec2 q2 = abs(w + vec2(0.1, 0.0)) - vec2(0.03, 0.3);
      float hull = smoothstep(0.02, 0.0, min(max(q.x, q.y), max(q2.x, q2.y)));
      col = mix(col, mix(u_pal[0], vec3(0.78, 0.74, 0.62), 0.8), hull);
      col = mix(col, u_pal[0], smoothstep(0.03, 0.0, abs(w.x - 0.12)) * step(abs(w.y), 0.1));
    } else if (m.w < 7.5) { // storm: a torn red cloud that sparks
      float n = vn(lp * 5.0 + u_time * 1.2);
      float blob = smoothstep(0.62, 0.3, d + (n - 0.5) * 0.35);
      col = mix(col, HZ * (0.3 + 0.7 * n), blob * 0.78);
      col += vec3(1.0, 0.9, 0.8) * step(0.9, h(vec2(floor(u_time * 9.0), fi))) * blob * 0.6;
    } else if (m.w < 8.5) { // undertow: a dark spiral drain
      float sp = sin(ang * 3.0 + log(d + 0.05) * 6.0 + u_time * 4.0);
      col = mix(col, u_pal[0] * 0.4, smoothstep(0.72, 0.2, d) * 0.65);
      col += HZ * smoothstep(0.3, 0.9, sp) * smoothstep(0.75, 0.4, d) * smoothstep(0.03, 0.15, d) * 0.7;
    } else { // the thing that follows: a hole with an eye in it
      col = mix(col, vec3(0.02, 0.0, 0.02), smoothstep(0.5, 0.38, d));
      float eye = smoothstep(0.1, 0.06, length(lp * vec2(0.6, 1.6)));
      col += vec3(1.0, 0.9, 0.7) * eye * step(0.08, fract(u_time * 0.23 + fi * 0.3));
      col += HZ * smoothstep(0.04, 0.0, abs(d - 0.5)) * 0.6;
    }
    // Every hazard wears the same broken red ring.
    if (m.w > 6.5) col += HZ * smoothstep(0.035, 0.0, abs(d - 0.82)) * step(0.5, fract(ang * 1.91 + u_time * 0.4)) * (0.65 + 0.3 * sin(u_time * 6.0));
  }
  // A reliquary throw being timed: a band to hit and a ring closing on it.
  if (u_catch.z > 0.0) {
    float dc = length(fc - u_catch.xy);
    col += u_pal[4] * (smoothstep(1.6, 0.0, abs(dc - u_catch.z * 1.25)) + smoothstep(1.6, 0.0, abs(dc - u_catch.z * 0.75))) * 0.7;
    col += u_pal[4] * 0.12 * step(abs(dc - u_catch.z), u_catch.z * 0.25);
    col += vec3(1.0) * smoothstep(2.6, 0.0, abs(dc - u_catch.w));
  }
  float v = sr / (0.55 + 0.09 * u_light);
  col *= clamp(1.25 - v * v, 0.05, 1.0);
  // Something follows: the dark closes in from the edge, red at its lip.
  if (u_follow > 0.0) {
    float e = mix(2.0, 1.0, u_follow);
    col = mix(col, vec3(0.03, 0.0, 0.02), smoothstep(e - 0.2, e + 0.1, sr) * 0.92);
    col += HZ * smoothstep(0.06, 0.0, abs(sr - e + 0.2)) * (0.35 + 0.25 * sin(u_time * 7.0));
  }
  col += (h(fc + u_time) - 0.5) * 0.04;
  o = vec4(col, 1.0);
}`;

const MARK: Record<FoldThingKind, number> = { piece: 3, well: 4, echo: 5, wreck: 6, storm: 7, undertow: 8, follower: 9 };
const CHURN: Record<StratumMotion, number> = { still: 0, drift: 0.04, churn: 0.5, shiver: 0, pull: 0.12 };
const UNIFORMS = ['u_res', 'u_c', 'u_R', 'u_zoom', 'u_depth', 'u_pulse', 'u_light', 'u_time', 'u_pal', 'u_mark', 'u_family', 'u_jc', 'u_aimOff', 'u_t', 'u_aim', 'u_came', 'u_par', 'u_speed', 'u_dark', 'u_shiver', 'u_follow', 'u_levels', 'u_rot', 'u_drift', 'u_catch'] as const;
// Child centres in unit coords, fixed (see core/fold-layout).
const OFF = new Float32Array(14);
for (let i = 0; i < 7; i++) { const [x, y] = childOffset(i); OFF[i * 2] = x; OFF[i * 2 + 1] = y; }
const fract = (x: number) => x - Math.floor(x);

export const factory: DiveRendererFactory = () => {
  let core: GlCore | null = null;
  let prog: WebGLProgram | null = null;
  const rgb = new Float32Array(48); // the universe palette, 16 x rgb
  const pal = new Float32Array(18); // what is drawn now
  const want = new Float32Array(18); // what the stratum asks for
  const marks = new Float32Array(28);
  let palKey = '';
  let stratumKey = -2;
  let time = 0;
  let turn = 0, driftX = 0, driftY = 0;
  let speed = 0, dark = 0, shiver = 0, follow = 0;
  const loc: Record<string, WebGLUniformLocation | null> = {};
  const build = () => {
    prog = core!.program(FULLSCREEN_VS, FS);
    for (const n of UNIFORMS) loc[n] = core!.gl.getUniformLocation(prog, n);
  };
  const slot = (i: number, pi: number) => { want[i * 3] = rgb[pi * 3]!; want[i * 3 + 1] = rgb[pi * 3 + 1]!; want[i * 3 + 2] = rgb[pi * 3 + 2]!; };
  return {
    init: (c) => {
      core = c;
      build();
      c.onRestore(build);
    },
    draw: (v, dt) => {
      if (!core || !prog || core.lost()) return;
      const dv = v.dive;
      const u = dv.universe;
      const gl = core.gl;
      const s = dt / 1000;
      time += s;
      const st = dv.stratum ?? null;
      let snap = false;
      if (u && u.serial !== palKey) {
        // Only when the universe changes: parse its palette once.
        palKey = u.serial;
        stratumKey = -2;
        snap = true;
        for (let i = 0; i < 16; i++) {
          const c = hexToRgb(u.palette[i]!);
          rgb[i * 3] = c[0] / 255; rgb[i * 3 + 1] = c[1] / 255; rgb[i * 3 + 2] = c[2] / 255;
        }
      }
      const sk = st ? st.index : -1;
      if (sk !== stratumKey) {
        stratumKey = sk;
        slot(0, 0);
        slot(1, st ? st.hues[0] : 2);
        slot(2, st ? st.hues[1] : 3);
        slot(3, st ? st.hues[2] : 4);
        slot(4, 7); // stars and sky pieces in gold
        slot(5, 10);
      }
      // Ease into a stratum's colours instead of cutting.
      const k = snap ? 1 : Math.min(1, s * 1.6);
      for (let i = 0; i < 18; i++) pal[i] = pal[i]! + (want[i]! - pal[i]!) * k;
      const motion: StratumMotion = st ? st.motion : 'still';
      const falling = dv.phase === 'falling';
      const mult = dv.multiplier ?? 1;
      const e = Math.min(1, s * 3);
      speed += ((falling ? Math.min(1, 0.12 + (mult - 1) * 0.22 + (motion === 'pull' ? 0.3 : 0)) : 0) - speed) * e;
      dark += ((st ? st.dark / 100 : 0) - dark) * e;
      shiver += ((motion === 'shiver' ? 0.07 : 0) - shiver) * e;
      const f = dv.follower ?? 0;
      follow += ((f > 0 ? Math.max(0.15, Math.min(1, (6 - f) / 5)) : 0) - follow) * e;
      if (follow < 0.004) follow = 0;
      turn = (turn + s * CHURN[motion]) % 6.2831853;
      if (motion === 'drift') { driftX = (driftX + s * 0.11) % 64; driftY = (driftY + s * 0.04) % 64; }

      const w = core.width(), h = core.height();
      // The same frame as core/fold-layout foldFrame, inlined so nothing is allocated.
      const zoom = Math.pow(3, Math.max(0, Math.min(999, dv.progress)) / 1000);
      const cx = w / 2, cy = h * 0.47, R = Math.min(w, h * 0.9) * 0.46;
      const t = (zoom - 1) / 2;
      const ax = OFF[dv.aim * 2] ?? 0, ay = OFF[dv.aim * 2 + 1] ?? 0;
      const cr = (R * zoom) / 3;
      for (let i = 0; i < 7; i++) {
        const ch = dv.children[i];
        marks[i * 4] = cx + (OFF[i * 2]! - ax * t) * R * zoom;
        marks[i * 4 + 1] = cy + (OFF[i * 2 + 1]! - ay * t) * R * zoom;
        marks[i * 4 + 2] = cr;
        marks[i * 4 + 3] = !ch ? 0 : ch.star ? 1 : ch.flicker ? 2 : ch.thing ? MARK[ch.thing.kind] : 0;
      }
      const fall = dv.depth + dv.progress / 1000;
      const cring = v.catchRing ?? null;
      gl.useProgram(prog);
      gl.uniform2f(loc.u_res!, w, h);
      gl.uniform2f(loc.u_c!, cx, cy);
      gl.uniform1f(loc.u_R!, R);
      gl.uniform1f(loc.u_zoom!, zoom);
      gl.uniform1f(loc.u_depth!, dv.depth % 997);
      gl.uniform1f(loc.u_pulse!, v.pulse / FX_ONE);
      gl.uniform1f(loc.u_light!, v.lightPips);
      gl.uniform1f(loc.u_time!, time % 1000);
      gl.uniform3fv(loc.u_pal!, pal);
      gl.uniform4fv(loc.u_mark!, marks);
      gl.uniform2f(loc.u_aimOff!, ax, ay);
      gl.uniform1f(loc.u_t!, t);
      gl.uniform1f(loc.u_aim!, dv.phase === 'surfaced' || !u ? -1 : dv.aim);
      gl.uniform1f(loc.u_came!, dv.cameFrom);
      gl.uniform1f(loc.u_family!, u ? (u.glyph + u.seed.lo) % 3 : 0);
      gl.uniform2f(loc.u_jc!, u ? -0.8 + ((u.seed.hi >>> 8) % 100) / 250 : -0.7, u ? 0.156 + ((u.seed.lo >>> 8) % 100) / 400 : 0.27);
      gl.uniform4f(loc.u_par!, fract(fall * 0.4), fract(fall * 0.85 + 0.3), 0, 0);
      gl.uniform1f(loc.u_speed!, speed);
      gl.uniform1f(loc.u_dark!, dark);
      gl.uniform1f(loc.u_shiver!, shiver);
      gl.uniform1f(loc.u_follow!, follow);
      gl.uniform1f(loc.u_levels!, (v.quality ?? 1) < 0.7 ? 5 : 8);
      gl.uniform2f(loc.u_rot!, Math.cos(turn), Math.sin(turn));
      gl.uniform2f(loc.u_drift!, driftX, driftY);
      if (cring && cring.index >= 0 && cring.index < 7) gl.uniform4f(loc.u_catch!, marks[cring.index * 4]!, marks[cring.index * 4 + 1]!, cr * 0.5, cr * 0.5 * cring.scale);
      else gl.uniform4f(loc.u_catch!, 0, 0, 0, 0);
      core.quad(prog);
    },
    dispose: () => void (core = null),
  };
};
