// Ambient life (part of unit 15). Nothing here is simulated: every bird, herd, fish,
// firefly, boat and tree is a pure function of (universe seed, column, time of day,
// season) and of what the grid and the weather are at that column right now. Drawn as
// instanced quads over the map, and as depth-tested billboards in first person, where
// each site also gets a depth so the world has parallax.
import type { GlCore } from '@/contracts/render';
import type { CivView, SurfaceEnv } from '@/contracts/sim';
import { FIELD } from '@/contracts/sim';
import { warpZ } from './first-person';

const K = { bird: 0, fish: 1, grazer: 2, fly: 3, swarm: 4, boat: 5, devil: 6, lantern: 7, puff: 8, tree: 9 } as const;
const LIQUID = 3, POWDER = 2, SOLID = 1, LIFE = 6;

const VS = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_a;   // x, y (foot), z, kind
layout(location=2) in vec4 a_b;   // phase, facing (+-1, +-2 = second pose), size in cells, seed
uniform int u_mode;               // 0 map, 1 first person
uniform vec4 u_cam;               // map: cx, cy, zoom, _ ; fp: yaw, pitch, aspect, _
uniform vec3 u_ro; uniform vec2 u_grid;
out vec2 v_p; out vec4 v_b; out float v_kind; out float v_dist;
void main(){
  vec2 n = vec2(a_pos.x * 0.5, a_pos.y * 0.5 + 0.5);
  vec2 l = n * a_b.z;
  v_p = n; v_b = a_b; v_kind = a_a.w; v_dist = 0.0;
  if (u_mode == 0) {
    vec2 w = vec2(a_a.x + l.x, a_a.y - l.y);
    vec2 q = (w - u_cam.xy) * u_cam.z / u_grid + 0.5;
    gl_Position = vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0);
  } else {
    float cy = cos(u_cam.x), sy = sin(u_cam.x), cp = cos(u_cam.y), sp = sin(u_cam.y);
    vec3 fwd = vec3(cy * cp, sp, sy * cp), right = vec3(-sy, 0.0, cy), upv = cross(right, fwd);
    vec3 pos = a_a.xyz + right * l.x + vec3(0.0, l.y, 0.0);
    vec3 rel = pos - u_ro;
    v_dist = length(rel);
    gl_Position = vec4(dot(rel, right) / (u_cam.z * 0.75), dot(rel, upv) / 0.75, 0.0, dot(rel, fwd));
  }
}`;

const FS = `#version 300 es
precision highp float; precision highp int;
in vec2 v_p; in vec4 v_b; in float v_kind; in float v_dist; out vec4 o;
uniform int u_mode; uniform float u_time, u_amb, u_night, u_season, u_snow, u_leaf; uniform sampler2D u_pal, u_depth; uniform vec4 u_vp;
vec3 pal(int i){ return texelFetch(u_pal, ivec2(i & 15, 0), 0).rgb; }
float h1(float n){ return fract(sin(n * 91.345) * 47453.5453); }
float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float seg(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r; }
void main(){
  int kind = int(v_kind + 0.5);
  float ph = v_b.x, face = v_b.y, seed = v_b.w;
  bool alt = abs(face) > 1.5;
  vec2 p = vec2(v_p.x * sign(face), v_p.y);            // x -0.5..0.5, y 0..1 from the foot
  vec2 c = p - vec2(0.0, 0.5);
  float d = 9.0, a = 0.0, emis = 0.0; vec3 col = vec3(0.0);
  if (kind == ${K.bird}) {
    if (alt) { d = min(length((c + vec2(0.0, 0.3)) * vec2(1.0, 1.25)) - 0.17, length(c - vec2(0.15, -0.16)) - 0.085); }   // roosting: a round shape with a head
    else {
      // In the air: two bent wings and a small body, the shape a child draws for a bird.
      float fl = sin(ph) * 0.2, ax = abs(c.x);
      vec2 q = vec2(ax, c.y);
      d = min(seg(q, vec2(0.0, -0.02), vec2(0.21, 0.1 + fl * 0.5), 0.032), seg(q, vec2(0.21, 0.1 + fl * 0.5), vec2(0.44, fl), 0.024));
      d = min(d, seg(c, vec2(-0.1, -0.02), vec2(0.13, -0.02), 0.05));
    }
    col = mix(pal(0), pal(1), seed) * (0.6 + 0.4 * u_amb);
  } else if (kind == ${K.fish}) {
    if (alt) {                                             // the ring it leaves
      float r = length(c * vec2(1.0, 3.0)); a = smoothstep(0.08, 0.0, abs(r - 0.1 - ph * 0.35)) * (1.0 - ph) * 0.8;
      col = pal(9) * (0.5 + 0.5 * u_amb);
    } else {
      float an = (0.5 - ph) * 2.4, cs = cos(an), sn = sin(an);
      vec2 q = vec2(c.x * cs + c.y * sn, -c.x * sn + c.y * cs);
      d = min(length(q * vec2(1.0, 2.6)) - 0.3, max(abs(q.y) - (-q.x - 0.22) * 0.9, max(-q.x - 0.46, q.x + 0.22)));
      col = mix(pal(9), pal(12), 0.35 + 0.4 * step(0.0, -q.y)) * (0.55 + 0.6 * u_amb);
    }
  } else if (kind == ${K.grazer}) {
    float sw = sin(ph) * 0.09;
    d = length((p - vec2(-0.06, 0.4)) / vec2(0.27, 0.17)) * 0.17 - 0.17;
    d = min(d, min(min(seg(p, vec2(-0.24, 0.3), vec2(-0.24 + sw, 0.03), 0.03), seg(p, vec2(-0.18, 0.3), vec2(-0.18 - sw, 0.03), 0.03)),
                   min(seg(p, vec2(0.06, 0.3), vec2(0.06 - sw, 0.03), 0.03), seg(p, vec2(0.12, 0.3), vec2(0.12 + sw, 0.03), 0.03))));
    // Head down to the grass, or up and looking when something frightens it.
    vec2 head = alt ? vec2(0.36, 0.76) : vec2(0.41, 0.12 + 0.03 * sin(u_time * 3.0 + seed * 40.0));
    float hd = min(seg(p, vec2(0.16, 0.46), head, 0.055), seg(p, head, head + vec2(0.09, alt ? -0.02 : -0.04), 0.06));
    if (seed > 0.5) hd = min(hd, seg(p, head + vec2(-0.02, 0.05), head + vec2(-0.1, 0.2), 0.016));
    d = min(d, min(hd, seg(p, vec2(-0.32, 0.46), vec2(-0.4, 0.3), 0.018)));
    col = mix(mix(pal(3), pal(4), step(0.5, seed)), pal(1), 0.25 + fract(seed * 7.3) * 0.3) * (0.8 + 0.3 * smoothstep(0.3, 0.52, p.y)) * u_amb;
  } else if (kind == ${K.fly}) {
    float r2 = dot(c, c);
    if (seed > 1.0) {                                      // a moth: pale wings that beat
      float wb = 0.55 + 0.45 * sin(ph * 5.0);
      d = min(length(vec2(abs(c.x) - 0.11 * wb, c.y) / vec2(0.1 * wb + 0.02, 0.13)) * 0.1 - 0.1, seg(c, vec2(0.0, -0.08), vec2(0.0, 0.08), 0.02));
      col = mix(pal(9), pal(8), 0.4) * (0.45 + 0.4 * u_amb + 0.3 * u_night);
    } else {
      float bl = pow(0.5 + 0.5 * sin(ph), 3.0);
      a = (exp(-r2 * 70.0) * 0.45 + smoothstep(0.012, 0.0, r2)) * bl;
      col = mix(pal(10), pal(7), step(0.5, seed)) * 1.7; emis = 1.0;
    }
  } else if (kind == ${K.swarm}) {
    for (int i = 0; i < 7; i++) { float fi = float(i);
      vec2 q = vec2(0.32 * sin(u_time * (2.1 + h1(fi + seed * 9.0)) + fi * 2.1 + seed * 30.0), 0.5 + 0.3 * sin(u_time * (2.9 + h1(fi + 3.0)) + fi * 1.3));
      d = min(d, length(p - q) - 0.022); }
    col = pal(1) * (0.4 + 0.6 * u_amb);
  } else if (kind == ${K.boat}) {
    float an = sin(ph) * 0.07, cs = cos(an), sn = sin(an);
    vec2 q = p - vec2(0.0, 0.2); q = vec2(q.x * cs + q.y * sn, -q.x * sn + q.y * cs);
    float hull = max(length(q * vec2(1.0, 2.4)) - 0.42, q.y);
    float mast = seg(q, vec2(0.0), vec2(0.0, 0.66), 0.014);
    float sail = max(max(0.035 - q.x, q.x - 0.4 * (0.66 - q.y) / 0.58), 0.08 - q.y);
    d = min(hull, min(mast, sail));
    col = (sail < min(hull, mast) ? mix(pal(8), pal(9), 0.3 + 0.4 * step(0.5, seed)) * (0.85 + 0.15 * sin(q.y * 30.0)) : pal(3) * 1.25) * u_amb;
    float lamp = length(q - vec2(-0.3, 0.08));
    if (u_night > 0.4) { if (lamp < 0.035) { d = -1.0; col = pal(13) * 1.6; emis = 1.0; } a = exp(-lamp * lamp * 60.0) * 0.35 * u_night; }
  } else if (kind == ${K.devil}) {
    float w = 0.05 + 0.3 * p.y * p.y, cx = 0.06 * sin(p.y * 12.0 - u_time * 6.0);
    a = smoothstep(w, w * 0.25, abs(p.x - cx)) * (0.3 + 0.25 * sin(p.y * 30.0 - u_time * 14.0 + p.x * 22.0)) * smoothstep(1.0, 0.75, p.y) * sin(clamp(ph, 0.0, 1.0) * 3.14159);
    col = mix(pal(5), pal(8), 0.5) * (0.4 + 0.6 * u_amb);
  } else if (kind == ${K.lantern}) {
    vec2 q = abs(c) - vec2(0.1, 0.14);
    float body = length(max(q, 0.0)) - 0.05;
    float fade = 1.0 - clamp(ph, 0.0, 1.0);
    a = (exp(-dot(c, c) * 14.0) * 0.4 + smoothstep(0.02, -0.02, body)) * fade * (0.55 + 0.45 * u_night);
    col = mix(pal(13), pal(9), smoothstep(0.1, -0.12, body) * 0.7 + 0.1 * sin(u_time * 9.0 + seed * 20.0)) * 1.5; emis = 1.0;
  } else if (kind == ${K.puff}) {
    a = exp(-dot(c, c) * 9.0) * (1.0 - ph) * smoothstep(0.0, 0.12, ph) * 0.42 * (0.8 + 0.4 * h2(floor(c * 9.0 + seed * 7.0)));
    col = mix(pal(2), pal(9), 0.4) * (0.15 + 0.65 * u_amb);
  } else {                                                 // a tree
    float lean = ph;                                       // sway, already in sprite units
    float winter = smoothstep(0.66, 0.74, u_season) * smoothstep(0.98, 0.9, u_season);
    float autumn = smoothstep(0.42, 0.58, u_season) * smoothstep(0.8, 0.68, u_season);
    float spring = smoothstep(0.0, 0.04, u_season) * smoothstep(0.24, 0.12, u_season);
    bool conifer = seed > 0.68;
    vec2 topc = vec2(lean, 0.66);
    float trunk = seg(p, vec2(0.0), vec2(lean * 0.6, conifer ? 0.3 : 0.55), 0.035 - 0.012 * p.y);
    float crown;
    if (conifer) { float yy = (p.y - 0.18) / 0.8; float tier = fract(yy * 3.0); crown = max(abs(p.x - lean * p.y) - 0.27 * (1.0 - yy) * (0.55 + 0.45 * (1.0 - tier)), max(-yy, yy - 1.0)); }
    else crown = min(length(p - topc) - 0.25, min(length(p - topc - vec2(-0.17, -0.09)) - 0.17, length(p - topc - vec2(0.17, -0.07)) - 0.17)) + 0.035 * (h2(floor(p * 16.0) + seed) - 0.5);
    vec3 leaf = pal(int(u_leaf + 0.5)) * (0.75 + 0.5 * h1(seed * 31.0)) * (0.75 + 0.45 * smoothstep(-0.1, 0.25, (p.y - 0.6) - p.x * 0.5));
    float speck = h2(floor(p * 22.0) + seed * 13.0);
    if (!conifer) {
      leaf = mix(leaf, mix(pal(14), pal(13), h1(seed * 17.0)) * 1.05, autumn * 0.85);
      if (speck > 0.72) leaf = mix(leaf, mix(pal(15), pal(9), 0.5), spring * 0.9);     // blossom
      // Bare in winter: only a lattice of twigs is left.
      if (winter > 0.01 && speck > 0.34 - 0.2 * (1.0 - winter)) crown = mix(crown, 9.0, step(0.5, winter));
      if (winter > 0.5) leaf = pal(3) * 0.9;
      // Leaves let go in autumn.
      if (autumn > 0.3 && crown > 0.0) { vec2 lf = vec2(fract(p.x * 5.0 + seed) - 0.5, fract(p.y * 3.0 + u_time * (0.25 + 0.2 * h1(floor(p.x * 5.0 + seed)))) - 0.5);
        if (length(lf) < 0.07 && p.y < 0.62 && abs(p.x) < 0.36 && h1(floor(p.x * 5.0 + seed) + 3.0) > 0.55) { crown = -0.01; leaf = pal(14) * 1.1; } }
    }
    // Snow sits on the tops.
    float capY = conifer ? fract(((p.y - 0.18) / 0.8) * 3.0) : (p.y - topc.y) / 0.25;
    if (u_snow > 0.03 && capY > 1.0 - u_snow * (conifer ? 0.5 : 0.75)) leaf = mix(leaf, pal(9), 0.9);
    d = min(trunk, crown);
    col = (crown < trunk ? leaf : pal(3) * 0.8) * u_amb;
  }
  float aa = fwidth(d) * 0.9 + 0.001;
  float alpha = max(clamp(a, 0.0, 1.0), smoothstep(aa, -aa, d));
  if (alpha < 0.02) discard;
  if (u_mode == 1) {
    vec2 suv = (gl_FragCoord.xy - u_vp.xy) / u_vp.zw;
    float td = texture(u_depth, suv).a; td = td * td * 260.0;
    // The stored distance is 8 bits of a square root, so its error grows with distance: allow for it.
    if (v_dist > td + 1.0 + 0.3 * sqrt(td)) discard;
    // Far things go pale and thin into the air.
    alpha *= smoothstep(200.0, 110.0, v_dist);
    if (emis < 0.5) col = mix(col, pal(9) * u_amb * 0.8, clamp(v_dist / 260.0, 0.0, 0.6));
  }
  o = vec4(col * alpha, alpha);
}`;

/** Integer hash to 0..1. */
const hs = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};
const sat = (v: number) => Math.max(0, Math.min(1, v));
const sstep = (a: number, b: number, v: number) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

export interface LifeFrame {
  civ: CivView; env: SurfaceEnv;
  /** Ground row per column, and the material kind (0..6) lying there. */
  top: Uint8Array; kind: Uint8Array;
  W: number; H: number;
  /** Universe seed folded to a u32. */
  seed: number;
  /** Smoothed env.day, 0..1. Everything moves on whole cycles of it, so a day loops cleanly. */
  day: number;
  time: number; dt: number;
  snow: number; dry: number; leaf: number;
  /** First person. tw/th: size of the off-screen sprite target bound for drawing (absent or 0 = draw to the canvas rect). */
  fp: null | { ro: [number, number, number]; yaw: number; pitch: number; depth: WebGLTexture; ground: (x: number, z: number) => number; tw?: number; th?: number };
  /** First person: nothing further than this many cells is drawn (falls with quality). Default 260, where the depth runs out. */
  far?: number;
  /** 0.5..1 from Perf.resolutionScale(); the layers thin out their smallest things as it falls. */
  quality?: number;
  view: { cx: number; cy: number; zoom: number };
  rect: { x: number; y: number; w: number; h: number };
  amb: number; night: number; pal: WebGLTexture;
}

export const createLife = (core: GlCore) => {
  const gl = core.gl;
  const prog = core.program(VS, FS);
  const names = ['u_mode', 'u_cam', 'u_ro', 'u_grid', 'u_time', 'u_amb', 'u_night', 'u_season', 'u_snow', 'u_leaf', 'u_pal', 'u_depth', 'u_vp'];
  const loc = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])) as Record<string, WebGLUniformLocation | null>;
  const MAXN = 520;
  const data = new Float32Array(MAXN * 8);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  for (let i = 0; i < 2; i++) {
    gl.enableVertexAttribArray(1 + i);
    gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, 32, i * 16);
    gl.vertexAttribDivisor(1 + i, 1);
  }
  gl.bindVertexArray(null);

  const SLOT = 12;
  const flee = new Float32Array(64);       // eased scatter per herd site
  let n = 0;
  let F: LifeFrame | null = null;
  const col = (x: number) => Math.max(0, Math.min(F!.W - 1, Math.floor(x)));

  /** One sprite standing `alt` cells above the ground of column gx, at depth z (first person only). */
  const put = (x: number, gx: number, alt: number, z: number, kind: number, phase: number, face: number, size: number, seed: number) => {
    const f = F!;
    if (n >= MAXN || x < 0 || x >= f.W) return;
    const k = n * 8;
    if (f.fp) {
      const w = warpZ(z);
      // Nothing behind the eye, nothing past the far line.
      const rx = x - w - f.fp.ro[0], rz = z - f.fp.ro[2], far = f.far ?? 260;
      if (rx * Math.cos(f.fp.yaw) + rz * Math.sin(f.fp.yaw) < -size - 2 || rx * rx + rz * rz > far * far) return;
      data[k] = x - w; data[k + 1] = f.fp.ground(gx - w, z) + alt; data[k + 2] = z;
    } else { data[k] = x; data[k + 1] = f.top[col(gx)]! - alt; data[k + 2] = 0; }
    data[k + 3] = kind; data[k + 4] = phase; data[k + 5] = face; data[k + 6] = size; data[k + 7] = seed;
    n++;
  };

  const place = () => {
    const f = F!;
    const { W, top, kind, civ, env, seed, time } = f;
    const d = f.day, season = env.season / 1000;
    const sunUp = -Math.cos(d * TAU);
    const daylight = sstep(-0.3, 0.35, sunUp);
    const winter = sstep(0.66, 0.74, season) * sstep(0.98, 0.9, season);
    const summer = sstep(0.1, 0.2, season) * sstep(0.45, 0.36, season);
    const storm = sat((env.rain - 90) / 80);
    const wind = env.wind / 100;
    const fp = !!f.fp;
    const av = civ.avatar;
    const vs = civ.villages;

    // ---- trees: every few columns of living ground, and further rows of them in first person ----
    const rows = fp ? 4 : 1;
    for (let r = 0; r < rows; r++) {
      const z = r === 0 ? -5.5 : r === 1 ? 9 : r === 2 ? -17 : 24;
      for (let s = 0; s * 7 < W - 7; s++) {
        const h = hs(seed, 9000 + s * 3 + r * 977);
        const x = s * 7 + 2.3 + h * 2.4;
        if (kind[col(x)] !== LIFE || kind[col(x - 1)] === LIQUID || kind[col(x + 1)] === LIQUID || hs(seed, 9500 + s + r * 31) > 0.72) continue;
        const sd = hs(seed, 9900 + s + r * 57);
        const size = 6 + 5 * h + (sd > 0.68 ? 2 : 0);
        const sway = (Math.sin(time * (1.1 + sd) + s * 1.7) * (0.012 + Math.abs(wind) * 0.03) + wind * 0.05);
        put(x, x, -0.3, z + (h - 0.5) * 3, K.tree, sway, 1, size, sd);
      }
    }

    // ---- sites: one per stretch of ground ----
    const ns = Math.min(64, Math.floor(W / SLOT));
    for (let s = 0; s < ns; s++) {
      const sx = s * SLOT + 6;
      const k = kind[sx]!;
      const h = hs(seed, s * 8 + 1), h2 = hs(seed, s * 8 + 2), h3 = hs(seed, s * 8 + 3), h4 = hs(seed, s * 8 + 4);
      let vd = 999, lamps = false;
      for (let i = 0; i < vs.length; i++) { const dd = Math.abs(vs[i]!.x - sx); if (dd < vd) { vd = dd; lamps = vs[i]!.tech >= 3; } }
      const wet = k === LIQUID || kind[col(sx - SLOT)] === LIQUID || kind[col(sx + SLOT)] === LIQUID;
      const side = h3 > 0.5 ? 1 : -1;

      // Birds wheel by day and come down to roost at dusk, in trees and over roofs.
      if ((k === LIFE || vd < 12) && h < 0.62 && !(winter > 0.5 && h2 > 0.45)) {
        const aloft = sstep(-0.2, 0.25, sunUp) * (1 - storm);
        const zc = (h2 - 0.5) * 60;
        const cx = sx + 20 * Math.sin(TAU * d + h * 9) * aloft;
        const cy = 17 + 7 * h2 + 5 * Math.sin(TAU * 2 * d + h2 * 7);
        // They roost in the nearest tree if there is one (the same tree the loop above drew), else on the ground.
        let roostAlt = 0.15, roostX = sx + (h4 - 0.5) * 4, spread = 1.5;
        for (let o = -1; o <= 1; o++) {
          const ts = Math.floor(sx / 7) + o;
          if (ts < 0 || ts * 7 >= W - 7) continue;
          const th = hs(seed, 9000 + ts * 3), tx = ts * 7 + 2.3 + th * 2.4;
          if (kind[col(tx)] !== LIFE || kind[col(tx - 1)] === LIQUID || kind[col(tx + 1)] === LIQUID || hs(seed, 9500 + ts) > 0.72) continue;
          roostAlt = (6 + 5 * th + (hs(seed, 9900 + ts) > 0.68 ? 2 : 0)) * 0.6; roostX = tx; spread = 0.5;
          break;
        }
        const count = 4 + Math.floor(h3 * 4);
        for (let i = 0; i < count; i++) {
          const a = TAU * 5 * d * (h3 > 0.5 ? 1 : -1) + i * (TAU / count) * 0.45 + h * 20;
          const rad = 6 + i * 1.3;
          const fx = cx + Math.cos(a) * rad, fy = cy + Math.sin(a * 2 + i) * 2.2;
          const px = roostX + (i - (count - 1) / 2) * spread;
          // Each bird leaves and lands in its own moment.
          const up = sstep(i * 0.08, 0.5 + i * 0.08, aloft * 1.4);
          const perch = roostAlt + (spread < 1 ? (i % 3) * 0.55 : 0);
          const x = px + (fx - px) * up, alt = perch + (fy - perch) * up;
          const dirx = -Math.sin(a) * (h3 > 0.5 ? 1 : -1);
          put(x, up < 0.5 ? roostX : sx, alt, (spread < 1 ? -5.5 + (hs(seed, 9000 + Math.floor(roostX / 7) * 3) - 0.5) * 3 : zc) * (1 - up) + (zc + Math.sin(a) * rad + (i - 2) * 1.5) * up, K.bird, time * (9 + i) + i, up < 0.04 ? (i % 2 ? 2 : -2) : dirx >= 0 ? 1 : -1, fp ? 2.4 : 2.1, hs(seed, s * 50 + i));
        }
      }

      // Fish jump, and leave a ring.
      if (k === LIQUID && h < 0.8 && storm < 0.6) {
        const jp = (d * 9 + h * 7) % 1;
        const jn = Math.floor(d * 9 + h * 7);
        const hx = hs(seed, s * 131 + jn);
        const x0 = sx + (hx - 0.5) * (SLOT - 2);
        const zf = (h2 - 0.5) * 34 + (hx - 0.5) * 8;
        if (kind[col(x0)] === LIQUID && kind[col(x0 + 2)] === LIQUID && kind[col(x0 - 2)] === LIQUID && hx < 0.75) {
          const dir = hx > 0.37 ? 1 : -1;
          if (jp < 0.2) { const t = jp / 0.2; put(x0 + dir * (t - 0.5) * 3, x0, Math.sin(Math.PI * t) * 3 - 0.7, zf, K.fish, t, dir, 1.9, hx); }
          if (jp < 0.07) put(x0 - dir * 1.5, x0, -0.9, zf, K.fish, jp / 0.07, 2, 2.6, hx);
          else if (jp > 0.17 && jp < 0.4) put(x0 + dir * 1.5, x0, -0.9, zf, K.fish, (jp - 0.17) / 0.23, 2, 3.2, hx);
        }
      }

      // Herds graze open ground, and scatter from fire and from your body.
      if ((k === LIFE || k === POWDER || k === SOLID) && vd > 13 && h > 0.42 && s < 64) {
        let push = 0;
        if (av) { const dx = sx + flee[s]! - av.x; if (Math.abs(dx) < 18) push += (dx >= 0 ? 1 : -1) * (18 - Math.abs(dx)); }
        for (let o = -16; o <= 16; o += FIELD) {
          const c = col(sx + o), fx = Math.min(env.fieldW - 1, (c / FIELD) | 0), fy = Math.max(0, Math.min(env.fieldH - 1, ((top[c]! - 1) / FIELD) | 0));
          if (env.temp[fy * env.fieldW + fx]! > 196) push += (o > 0 ? -1 : 1) * (20 - Math.abs(o)) * 0.6;
        }
        push = Math.max(-16, Math.min(16, push));
        const before = flee[s]!;
        flee[s] = before + (push - before) * Math.min(1, f.dt * 0.0035);
        const run = Math.abs(push - flee[s]!) > 0.8;
        const count = 3 + Math.floor(h2 * 3);
        const gap = 2.3;
        const zh = side * (7 + h4 * 20);
        for (let i = 0; i < count; i++) {
          const hi = hs(seed, s * 70 + i);
          const drift = 3.2 * Math.sin(TAU * (1 + (i % 2)) * d + hi * 12) * (0.35 + 0.65 * daylight);
          const x = sx + (i - (count - 1) / 2) * gap + drift + flee[s]! * (0.8 + 0.4 * hi);
          if (x < 1 || x > W - 2 || kind[col(x)] === LIQUID || kind[col(x)] === 5 || kind[col(x)] === 0) continue;
          const vx = run ? push - flee[s]! : Math.cos(TAU * (1 + (i % 2)) * d + hi * 12);
          put(x, x, -0.15, zh + (hi - 0.5) * 9, K.grazer, run ? time * 16 + i : Math.sin(time * 1.3 + i * 2) * 0.6, (vx >= 0 ? 1 : -1) * (run ? 2 : 1), (fp ? 2.9 : 2.4) * (0.8 + 0.35 * hi), hi);
        }
      }

      // Fireflies over water and round lamps on warm nights; moths at the lamps themselves.
      if (daylight < 0.35 && winter < 0.3 && storm < 0.3 && (wet || (lamps && vd < 14)) && h4 < 0.85) {
        const gl0 = 1 - daylight / 0.35;
        const count = 3 + Math.floor(h * 4);
        for (let i = 0; i < count; i++) {
          const hi = hs(seed, s * 90 + i);
          const x = sx + (hi - 0.5) * SLOT + 2.5 * Math.sin(TAU * 3 * d + hi * 30);
          const alt = 1.5 + 3.2 * (0.5 + 0.5 * Math.sin(TAU * 4 * d + hi * 17 + i));
          const moth = lamps && vd < 14 && i % 3 === 0;
          put(moth ? sx + (vs.length ? Math.sign(hi - 0.5) * 2 : 0) + Math.sin(time * 3 + i) * 1.4 : x, sx, moth ? 3 + Math.sin(time * 4.3 + i) : alt, (h2 - 0.5) * 30 + (hi - 0.5) * 16, K.fly, time * (1.6 + hi * 1.8) + hi * 40, 1, moth ? 1.3 : 1.8 * (0.6 + 0.4 * gl0), moth ? hi + 2 : hi);
        }
      }

      // Dust devils walk the dry ground when the wind is up.
      if (f.dry > 0.05 && (k === POWDER || k === SOLID) && h2 > 0.4) {
        const t = (d * 4 + h * 5) % 1;
        const x = sx + (wind >= 0 ? 1 : -1) * (t - 0.5) * 26;
        if (kind[col(x)] !== LIQUID) put(x, x, -0.2, side * (10 + h4 * 24), K.devil, t, 1, (7 + 6 * h3) * (0.5 + 0.5 * f.dry), h);
      }
    }

    // ---- villages: boats, insects over the crops, lanterns let go, smoke columns ----
    for (let i = 0; i < vs.length && i < 12; i++) {
      const v = vs[i]!;
      const hv = hs(seed, 7000 + v.id);
      // The nearest open water within reach.
      let wx = -1, dir = 0;
      for (let o = 3; o < 44 && wx < 0; o++) {
        if (kind[col(v.x + o)] === LIQUID && v.x + o < W - 2) { wx = v.x + o; dir = 1; }
        else if (kind[col(v.x - o)] === LIQUID && v.x - o > 1) { wx = v.x - o; dir = -1; }
      }
      let docks = 0, farms = 0, houses = 0;
      for (let j = 0; j < v.buildings.length; j++) {
        const b = v.buildings[j]!;
        if (b.kind === 'dock') docks++;
        else if (b.kind === 'farm') {
          farms++;
          if (summer > 0.3 && daylight > 0.4 && storm < 0.3 && farms <= 3) put(b.x + 0.5, b.x, 0.2, ((b.seed * 5 + v.id * 3 + b.x) % 7) - 3, K.swarm, 0, 1, 4.6, hs(seed, b.x * 3 + j));
        } else if (b.kind === 'house' || b.kind === 'workshop') {
          houses++;
          if (fp && houses <= 6) {
            // In the round, chimney smoke is a column of puffs leaning with the wind.
            const zoff = ((b.seed * 5 + v.id * 3 + b.x) % 7) - 3;
            for (let q = 0; q < 4; q++) {
              const t = (time * 0.16 + q * 0.25 + hs(seed, b.x) ) % 1;
              put(b.x + 1.2 + wind * t * t * 9 + Math.sin(t * 5 + q) * 0.3, b.x, 4.2 + t * 9, zoff, K.puff, t, 1, 1.6 + t * 4.2, hs(seed, b.x + q * 7));
            }
          }
        }
      }
      if (wx >= 0 && (docks > 0 || v.tech >= 1 || v.souls >= 4)) {
        // Boats work the water in front of the village, further out as the day goes on.
        let reach = 0;
        while (reach < 22 && kind[col(wx + dir * (reach + 1))] === LIQUID && wx + dir * (reach + 1) > 1 && wx + dir * (reach + 1) < W - 2) reach++;
        const boats = reach < 4 ? 0 : 1 + (v.prosperity > 55 ? 1 : 0) + (docks > 1 ? 1 : 0);
        for (let b = 0; b < boats; b++) {
          const hb = hs(seed, 7100 + v.id * 5 + b);
          const out = 2 + (reach - 3) * (0.5 + 0.5 * Math.sin(TAU * d * (1 + b) + hb * 9)) * (0.35 + 0.65 * daylight) * (1 - storm * 0.8);
          const x = wx + dir * out;
          const vx = Math.cos(TAU * d * (1 + b) + hb * 9) * dir;
          put(x, x, -0.75, (hb - 0.5) * 22, K.boat, time * 1.4 + hb * 9, vx >= 0 ? 1 : -1, fp ? 4.6 : 4.2, hb);
        }
      }
      // Lanterns let go: when something has just been launched, and on nights when a village is doing well.
      const la = civ.launchAge;
      if (la < 260 && civ.launches > 0) {
        for (let q = 0; q < 4; q++) {
          const hq = hs(seed, 7300 + v.id * 9 + q);
          const rise = Math.max(0, la - q * 14);
          if (rise <= 0) continue;
          put(v.x + (q - 1.5) * 2.2 + wind * rise * 0.05 + Math.sin(rise * 0.05 + q) * 1.2, v.x, 3 + rise * (0.2 + hq * 0.1), (hq - 0.5) * 14, K.lantern, rise / 260, 1, 2.2, hq);
        }
      } else if (v.prosperity >= 65 && daylight < 0.3 && storm < 0.2) {
        for (let q = 0; q < 3; q++) {
          const hq = hs(seed, 7400 + v.id * 9 + q);
          const t = (d * 3 + hq * 3 + hv) % 1;
          put(v.x + (q - 1) * 3.5 + wind * t * 10 + Math.sin(t * 9 + q) * 1.2, v.x, 4 + t * 32, (hq - 0.5) * 14, K.lantern, t * t, 1, 1.9, hq);
        }
      }
    }
  };

  return {
    draw: (f: LifeFrame) => {
      F = f; n = 0;
      place();
      F = null;
      if (!n) return;
      const sx = core.canvas.width / Math.max(1, core.width()), sy = core.canvas.height / Math.max(1, core.height());
      let vx = Math.round(f.rect.x * sx), vw = Math.round(f.rect.w * sx), vh = Math.round(f.rect.h * sy);
      let vy = Math.round(core.canvas.height - (f.rect.y + f.rect.h) * sy);
      if (f.fp && f.fp.tw) { vx = 0; vy = 0; vw = f.fp.tw; vh = f.fp.th!; }
      gl.viewport(vx, vy, vw, vh);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(vx, vy, vw, vh);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog);
      gl.uniform1i(loc.u_mode!, f.fp ? 1 : 0);
      if (f.fp) { gl.uniform4f(loc.u_cam!, f.fp.yaw, f.fp.pitch, vw / vh, 0); gl.uniform3f(loc.u_ro!, f.fp.ro[0], f.fp.ro[1], f.fp.ro[2]); }
      else gl.uniform4f(loc.u_cam!, f.view.cx, f.view.cy, f.view.zoom, 0);
      gl.uniform2f(loc.u_grid!, f.W, f.H);
      gl.uniform1f(loc.u_time!, f.time % 10000);
      gl.uniform1f(loc.u_amb!, f.amb);
      gl.uniform1f(loc.u_night!, f.night);
      gl.uniform1f(loc.u_season!, f.env.season / 1000);
      gl.uniform1f(loc.u_snow!, f.snow);
      gl.uniform1f(loc.u_leaf!, f.leaf);
      gl.uniform4f(loc.u_vp!, vx, vy, vw, vh);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, f.pal);
      gl.uniform1i(loc.u_pal!, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, f.fp ? f.fp.depth : f.pal);
      gl.uniform1i(loc.u_depth!, 1);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * 8);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
    },
  };
};
export type Life = ReturnType<typeof createLife>;
