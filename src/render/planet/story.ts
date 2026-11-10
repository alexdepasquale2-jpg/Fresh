// The story layer (part of unit 15). What the civilisation sim knows, drawn on the land:
// roads and carts between villages with a pact, a shared pennant for allies, a broken red
// line and marching columns for a war, raiders, tribute caravans, pilgrims, refugees;
// walls, creed banners, holy places, great works, schools, halls, plague marks, ruins that
// burn and are later rebuilt; the skyline of each age; and the launch of an ark.
// One instanced sprite program, shared by the map and by first person (billboards tested
// against the terrain's distance). Everything is placed from CivView each frame into one
// preallocated buffer: nothing is allocated in draw().
import type { GlCore } from '@/contracts/render';
import type { Village } from '@/contracts/sim';
import { warpZ } from './first-person';
import type { LifeFrame } from './life';

const K = { dash: 0, walker: 1, cart: 2, wall: 3, banner: 4, holy: 5, work: 6, school: 7, hall: 8, ruin: 9, puff: 10, skyline: 11, gantry: 12, light: 13 } as const;
const WT = { soldier: 1, raider: 2, pilgrim: 3, porter: 4, refugee: 5, guard: 6, ruler: 7, heretic: 8, listener: 9, sick: 10 } as const;
/** Great works by name, in the order the sim keeps them (src/sim/civ/lore.ts). */
/** Which program draws each kind, by K. Drawn in the order 2 (behind the buildings), 5, 3, 4, 1, 0. */
const GROUP = [1, 0, 0, 5, 1, 3, 4, 3, 3, 3, 1, 2, 3, 1];
const CAP = [420, 560, 40, 100, 64, 80];
const WORK_NAMES = ['Great Granary', 'Sea Wall', 'High Shrine', 'Great Bell', 'Lighthouse', 'Star House', 'Sky Dock'];
const LIQUID = 3;

const VS = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_a;   // x, y (foot), z, kind
layout(location=2) in vec4 a_b;   // p1, p2, size in cells, seed
uniform int u_mode;               // 0 map, 1 first person
uniform vec4 u_cam;               // map: cx, cy, zoom, _ ; fp: yaw, pitch, aspect, _
uniform vec3 u_ro; uniform vec2 u_grid;
out vec2 v_p; out vec4 v_b; out float v_kind; out float v_dist;
void main(){
  vec2 n = vec2(a_pos.x * 0.5, a_pos.y * 0.5 + 0.5);
  float size = a_b.z;
  // Marks that must read from far off (lines, banners, smoke, lights) do not shrink to nothing.
  if (u_mode == 0 && (a_a.w < 0.5 || (a_a.w > 3.5 && a_a.w < 4.5) || a_a.w > 12.5)) size *= max(1.0, 2.4 / u_cam.z);
  // Most things are wider than they are tall: do not shade empty sky above them.
  int k = int(a_a.w + 0.5);
  n.y *= k == 11 ? 0.62 : k == 9 ? 0.5 : k == 7 || k == 0 || k == 2 ? 0.6 : k == 6 || k == 8 ? 0.78 : k == 5 || k == 12 ? 0.86 : 1.0;
  vec2 l = n * size;
  v_p = n * a_b.z; v_b = a_b; v_kind = a_a.w; v_dist = 0.0;
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

// One program per group of kinds (G), so a sprite's pixels only pay for shapes of its own group.
const fsFor = (g: number) => `#version 300 es
#define G ${g}
precision highp float; precision highp int;
in vec2 v_p; in vec4 v_b; in float v_kind; in float v_dist; out vec4 o;
uniform int u_mode; uniform float u_time, u_amb, u_night, u_zoom, u_wind; uniform sampler2D u_pal, u_depth; uniform vec4 u_vp;
vec3 pal(int i){ return texelFetch(u_pal, ivec2(i & 15, 0), 0).rgb; }
float h1(float n){ return fract(sin(n * 91.345) * 47453.5453); }
float bx(vec2 p, vec2 c, vec2 h){ vec2 d = abs(p - c) - h; return max(d.x, d.y); }
float seg(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r; }
vec3 hue(float h){ vec3 c = clamp(abs(fract(h + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); return mix(c, vec3(1.0), 0.12) * 0.95; }
float L(float z){ return u_mode == 1 ? 1.0 : smoothstep(z, z * 1.25, u_zoom); }
vec4 col = vec4(0.0); float emis = 0.0;
void put(float d, vec3 c){ float a = smoothstep(0.04, -0.04, d); col = mix(col, vec4(c, 1.0), a); if (a > 0.5) emis = 0.0; }
void glow(float d, vec3 c, float k){ float a = smoothstep(0.04, -0.04, d); col = mix(col, vec4(c, 1.0), a); if (a > 0.5) emis = k; }
void soft(float a, vec3 c, float k){ a = clamp(a, 0.0, 1.0); col.rgb = mix(col.rgb, c, a / max(0.001, a + col.a * (1.0 - a))); col.a = a + col.a * (1.0 - a); if (a > 0.3) emis = k; }
void flag(vec2 p, vec2 at, vec2 sz, vec3 c){
  float wv = sin((p.x - at.x) * 4.0 - u_time * (3.0 + abs(u_wind) * 3.0)) * 0.12 * clamp((p.x - at.x) / sz.x, 0.0, 1.0);
  put(bx(vec2(p.x, p.y + wv), at + vec2(sz.x * 0.5, 0.0), sz * vec2(0.5, 0.5)), c * (0.85 + 0.15 * sin((p.x - at.x) * 9.0 - u_time * 4.0)));
}
void flame(vec2 p, vec2 at, float r){
  float fl = sin(u_time * 9.0 + p.y * 5.0 + at.x * 3.0) * 0.12 * r;
  vec2 q = p - at; glow(length(vec2((q.x + fl) * (1.0 + max(q.y, 0.0) * 0.9 / r), q.y - r * 0.6)) - r, mix(pal(13), pal(9), smoothstep(r * 1.6, 0.0, q.y) * 0.7), 1.7);
}
void main(){
  int kind = int(v_kind + 0.5); float p1 = v_b.x, p2 = v_b.y, size = v_b.z, seed = v_b.w; vec2 p = v_p;
  vec3 wood = pal(3), stone = pal(4), dark = pal(1), lit = pal(13) * 1.4, paper = pal(8), gold = pal(7), roof = pal(14) * 1.1, wallc = pal(5) * 1.05;
  float lamp = smoothstep(0.2, 0.7, u_night);
  float soft_a = -1.0;
#if G == 1
  if (kind == ${K.dash}) {
    // A mark on the ground between two villages. p1: 0 road, 1 allies, 2 war, 3 tribute, 4 rivalry.
    vec2 q = p - vec2(0.0, size * 0.22); int t = int(p1 + 0.5);
    float s = size / 1.3;
    if (t == 0) put(bx(q, vec2(0.0), vec2(0.42, 0.09) * s), mix(wood, paper, 0.45));
    else if (t == 1) put(length(q) - 0.16 * s, hue(seed));
    else if (t == 2) glow(bx(q, vec2(0.0), vec2(0.46, 0.13) * s), mix(pal(13), vec3(0.9, 0.12, 0.1), 0.75), 1.0);
    else if (t == 3) put(length(q) - 0.17 * s, gold * 1.15);
    else put(min(seg(q, vec2(-0.25, -0.12) * s, vec2(0.25, 0.3) * s, 0.05 * s), seg(q, vec2(-0.25, 0.3) * s, vec2(0.25, -0.12) * s, 0.05 * s)), mix(pal(13), dark, 0.35));
  }
#endif
#if G == 0
  if (kind == ${K.walker}) {
    int t = int(abs(p2) + 0.5); float face = sign(p2); p.x *= face;
    float ph = p1, lean = 0.0, sw = sin(ph) * 0.32, squat = 0.0, lift = 0.0;
    if (t == ${WT.refugee}) lean = 0.3; if (t == ${WT.sick}) { lean = 0.42; sw *= 0.4; } if (t == ${WT.soldier}) lean = 0.08;
    if (t == ${WT.guard} || t == ${WT.heretic}) sw = 0.06; if (t == ${WT.listener}) { squat = 0.45; sw = 0.0; } if (t == ${WT.ruler}) sw *= 0.5;
    if (t == ${WT.heretic}) { lift = 0.5; put(bx(p, vec2(0.0, 0.25), vec2(0.5, 0.25)), wood * 0.9); }
    p.y -= lift;
    float k = 1.0 - squat;
    vec2 hip = vec2(0.0, 0.95 * k), sh = vec2(lean, 0.95 * k + 0.65), hd = vec2(lean * 1.3, 0.95 * k + 1.1);
    float legs = squat > 0.2 ? min(seg(p, hip, vec2(0.35, 0.08), 0.1), seg(p, vec2(0.35, 0.08), vec2(-0.15, 0.08), 0.09)) : min(seg(p, hip, vec2(sw, 0.08), 0.1), seg(p, hip, vec2(-sw, 0.08), 0.1));
    float torso = seg(p, hip, sh, t == ${WT.pilgrim} || t == ${WT.ruler} ? 0.25 : 0.2);
    float head = length(p - hd) - 0.27;
    vec2 hand = sh + vec2(0.4, -0.25);
    if (t == ${WT.heretic}) hand = sh + vec2(0.35, 0.55 + 0.12 * sin(u_time * 4.0 + seed * 9.0));
    float arm = seg(p, sh, hand, 0.075);
    vec3 cloth = mix(pal(5), pal(12), step(0.5, fract(seed * 7.3)));
    if (t == ${WT.soldier} || t == ${WT.guard}) cloth = mix(hue(seed), pal(13), 0.35) * 0.9;
    if (t == ${WT.raider}) cloth = dark * 1.3;
    if (t == ${WT.pilgrim}) cloth = mix(pal(9), paper, 0.4);
    if (t == ${WT.refugee}) cloth = mix(pal(4), pal(2), 0.5);
    if (t == ${WT.ruler}) cloth = hue(seed) * 0.9;
    if (t == ${WT.heretic}) cloth = mix(dark, pal(13), 0.25);
    if (t == ${WT.sick}) cloth = mix(pal(9), pal(15), 0.3) * 0.75;
    if (t == ${WT.listener}) cloth = mix(pal(5), pal(9), 0.4);
    if (t == ${WT.pilgrim} || t == ${WT.ruler}) put(max(abs(p.x - lean * 0.4) - 0.2 - 0.22 * (1.0 - p.y / 1.5), max(p.y - 1.5, 0.12 - p.y)), cloth * 0.8);   // a long robe
    put(legs, cloth * 0.6); put(torso, cloth * (0.78 + 0.22 * smoothstep(0.1, -0.1, p.x - lean))); put(arm, cloth * 0.9); put(head, paper);
    if (t == ${WT.soldier} || t == ${WT.guard}) {
      put(seg(p, vec2(0.42, 0.25), vec2(0.5, 2.85), 0.04), wood); put(max(abs(p.x - 0.5) - 0.11 * (1.0 - (p.y - 2.85) / 0.35), 2.85 - p.y), pal(9) * 0.9);
      put(length((p - vec2(0.2, 1.3)) * vec2(1.3, 1.0)) - 0.3, mix(stone, hue(seed), 0.5));
      put(max(length(p - hd - vec2(0.0, 0.05)) - 0.3, hd.y + 0.06 - p.y), stone * 1.2);                 // a helm
    } else if (t == ${WT.raider}) {
      put(seg(p, hand, hand + vec2(0.12, 0.6), 0.04), wood); flame(p, hand + vec2(0.12, 0.75), 0.2);
      put(seg(p, sh + vec2(-0.2, 0.1), sh + vec2(-0.5, 0.75), 0.05), stone * 1.2);
    } else if (t == ${WT.pilgrim}) {
      put(seg(p, vec2(0.48, 0.05), vec2(0.5 + lean, 2.5), 0.04), wood); put(bx(p, vec2(0.66, 2.3), vec2(0.14, 0.12)), hue(seed));
      put(max(length(p - hd - vec2(-0.03, 0.03)) - 0.33, -(p.x - hd.x) + 0.02), cloth);                 // a hood
    } else if (t == ${WT.porter}) {
      put(bx(p, vec2(-0.4, 1.45), vec2(0.27, 0.36)), gold * 0.85); put(bx(p, vec2(-0.4, 1.95), vec2(0.2, 0.14)), paper * 0.8);
      put(seg(p, vec2(0.45, 0.05), vec2(0.5, 1.6), 0.035), wood);
    } else if (t == ${WT.refugee}) {
      put(seg(p, sh + vec2(0.3, -0.1), sh + vec2(-0.75, 0.5), 0.035), wood); put(length(p - sh - vec2(-0.75, 0.38)) - 0.26, paper * 0.75);
    } else if (t == ${WT.ruler}) {
      put(max(bx(p, hd + vec2(0.0, 0.32), vec2(0.24, 0.12)), -(abs(fract(p.x * 4.0) - 0.5) - 0.2) - (p.y - hd.y - 0.3) * 2.0 + 0.1), gold * 1.3);   // a crown
      put(seg(p, vec2(0.5, 0.05), vec2(0.5, 2.3), 0.04), gold); glow(length(p - vec2(0.5, 2.42)) - 0.1, pal(10), 1.0);
      put(max(max(abs(p.x - lean + 0.25) - 0.28, p.y - sh.y), 0.25 - p.y), cloth * 0.65);                // the cloak behind
    } else if (t == ${WT.heretic}) {
      put(max(length(p - hd - vec2(-0.03, 0.03)) - 0.34, -(p.x - hd.x) + 0.04), dark * 1.5);
      glow(length(p - hand - vec2(0.0, 0.14)) - 0.09, pal(13), 1.4);
    }
  }
#endif
#if G == 0
  if (kind == ${K.cart}) {
    int t = int(abs(p2) + 0.5); float face = sign(p2); p.x *= face;
    float bob = abs(sin(p1 * 2.0)) * 0.04; vec2 q = p - vec2(0.0, bob);
    put(bx(q, vec2(-0.3, 0.72), vec2(0.95, 0.24)), wood * (1.0 - L(12.0) * 0.2 * step(0.8, fract(q.x * 3.0))));
    put(seg(q, vec2(0.65, 0.7), vec2(1.3, 0.8), 0.04), wood * 0.8);
    for (int i = 0; i < 2; i++) { vec2 w = q - vec2(-0.85 + float(i) * 1.1, 0.3); float r = length(w);
      put(abs(r - 0.25) - 0.05, dark * 1.4); if (L(12.0) > 0.5) put(max(min(abs(w.x * cos(p1) - w.y * sin(p1)), abs(w.x * sin(p1) + w.y * cos(p1))) - 0.03, r - 0.25), dark * 1.6); }
    if (t == 1) { put(bx(q, vec2(-0.65, 1.2), vec2(0.3, 0.26)), gold * 0.8); put(length((q - vec2(0.05, 1.18)) * vec2(1.0, 1.25)) - 0.3, paper * 0.85); put(bx(q, vec2(-0.3, 1.6), vec2(0.24, 0.16)), pal(15) * 0.9); }
    else if (t == 2) { put(bx(q, vec2(-0.3, 1.2), vec2(0.6, 0.26)), wood * 1.3); glow(max(length((q - vec2(-0.3, 1.46)) * vec2(0.6, 1.0)) - 0.3, 1.44 - q.y), gold * 1.4, 1.0);
      put(seg(q, vec2(-1.2, 0.9), vec2(-1.2, 2.3), 0.035), wood); flag(q, vec2(-1.2, 2.05), vec2(0.6, 0.4), hue(seed)); }
    else { put(max(length((q - vec2(-0.3, 0.95)) * vec2(0.55, 1.0)) - 0.55, 0.95 - q.y), mix(pal(9), paper, 0.5) * 0.85); put(seg(q, vec2(-0.9, 1.0), vec2(0.3, 1.25), 0.03), dark * 1.5); }
    // the beast that pulls it
    float lg = sin(p1) * 0.14;
    put(seg(q, vec2(1.25, 0.72), vec2(1.85, 0.72), 0.2), pal(4) * 0.8); put(length(q - vec2(2.02, 0.92)) - 0.17, pal(4) * 0.7);
    put(min(seg(q, vec2(1.3, 0.6), vec2(1.3 + lg, 0.06), 0.06), seg(q, vec2(1.8, 0.6), vec2(1.8 - lg, 0.06), 0.06)), pal(4) * 0.6);
  }
#endif
#if G == 5
  if (kind == ${K.wall}) {
    // p1: era. p2: 1 = this length has the gate.
    bool stoneW = p1 > 1.5; float wx = p.x, hgt = stoneW ? 2.5 : 2.1;
    if (stoneW) {
      float cren = 0.38 * step(0.5, fract(wx * 0.9 + 0.25));
      put(max(abs(wx) - size * 0.5, p.y - hgt - cren), stone * (0.85 + 0.12 * h1(floor(wx * 1.2) + floor(p.y * 2.2) * 7.0)) * (1.0 - L(10.0) * 0.22 * step(0.86, fract(p.y * 2.2))));
      if (p1 > 5.5) glow(bx(vec2(fract(wx * 0.5) - 0.5, p.y), vec2(0.0, hgt - 0.5), vec2(0.07, 0.07)), lit, lamp);
    } else {
      float fx = fract(wx * 2.2) - 0.5, sh = h1(floor(wx * 2.2) + seed) * 0.35;
      put(max(abs(wx) - size * 0.5, max(abs(fx) - 0.44, p.y - (hgt + sh - abs(fx) * 1.3))), wood * (0.75 + 0.3 * h1(floor(wx * 2.2) * 3.0 + seed)));
      put(bx(p, vec2(0.0, 1.3), vec2(size * 0.5, 0.07)), wood * 0.6);
    }
    if (p2 > 0.5) {
      put(bx(p, vec2(0.0, 1.9), vec2(1.15, 1.9)), (stoneW ? stone : wood) * 1.12);
      put(max(abs(p.x) - 1.4 * (1.0 - (p.y - 3.8) / 1.1), 3.8 - p.y), stoneW ? roof * 0.85 : wood * 0.7);
      put(max(length(vec2(p.x, max(p.y - 1.1, 0.0))) - 0.62, -p.y), dark * 0.5);
      glow(length(p - vec2(-0.85, 2.6)) - 0.1, mix(dark, lit, lamp), lamp * 1.4); glow(length(p - vec2(0.85, 2.6)) - 0.1, mix(dark, lit, lamp), lamp * 1.4);
    }
  }
#endif
#if G == 1
  if (kind == ${K.banner}) {
    // p2: 0 creed banner, 1 plague banner, 2 allies' pennant.
    int t = int(p2 + 0.5); float s = size / 6.0; vec2 q = p / s;
    put(seg(q, vec2(0.0, 0.0), vec2(0.0, 5.0), 0.055), t == 1 ? paper * 0.6 : wood);
    if (t == 0) { flag(q, vec2(0.05, 4.2), vec2(1.7, 1.3), hue(p1)); put(length(q - vec2(0.75, 4.2 )) - 0.24, mix(hue(p1), pal(9), 0.75)); put(length(q - vec2(0.0, 5.1)) - 0.13, gold * 1.2); }
    else if (t == 1) { float tat = step(0.5, fract(q.x * 2.5)) * 0.5;
      float wv = sin(q.x * 3.0 - u_time * 1.2) * 0.07 * q.x;
      put(max(bx(vec2(q.x, q.y + wv), vec2(0.6, 4.0), vec2(0.55, 0.9)), 3.1 + tat * step(0.3, q.x) - q.y), mix(pal(9), paper, 0.3) * 0.95);
      put(min(seg(q, vec2(0.3, 3.8), vec2(0.9, 4.4), 0.05), seg(q, vec2(0.3, 4.4), vec2(0.9, 3.8), 0.05)), dark); }
    else { float wv = sin(q.x * 4.0 - u_time * 3.5) * 0.1 * q.x; put(max(abs(q.y + wv - 4.5) - 0.4 * (1.0 - q.x / 1.6), -q.x + 0.05), hue(p1)); }
  }
#endif
#if G == 3
  if (kind == ${K.holy}) {
    vec3 hc = hue(p1);
    put(bx(p, vec2(0.0, 0.15), vec2(3.2, 0.15)), stone); put(bx(p, vec2(0.0, 0.45), vec2(2.6, 0.15)), stone * 1.1); put(bx(p, vec2(0.0, 0.75), vec2(2.0, 0.15)), stone * 1.2);
    put(bx(p, vec2(-1.3, 2.6), vec2(0.2, 1.7)), paper * 0.9); put(bx(p, vec2(1.3, 2.6), vec2(0.2, 1.7)), paper * 0.9);
    put(max(abs(length(vec2(p.x, p.y - 4.3)) - 1.4) - 0.2, 4.3 - p.y), paper);                           // the arch
    put(max(abs(p.x) - 0.28 * (1.0 - (p.y - 5.9) / 1.6), 5.8 - p.y), gold * 1.2);                        // a spire
    float halo = length(p - vec2(0.0, 3.1 + 0.1 * sin(u_time * 1.5)));
    glow(halo - 0.5, mix(hc, pal(9), 0.35) * 1.3, 1.7);
    soft(smoothstep(1.6, 0.4, halo) * 0.35 * (0.6 + 0.4 * lamp), hc, 1.2);
    flame(p, vec2(-2.6, 1.15), 0.24); flame(p, vec2(2.6, 1.15), 0.24);
    put(bx(p, vec2(-2.6, 0.5), vec2(0.12, 0.5)), stone * 0.9); put(bx(p, vec2(2.6, 0.5), vec2(0.12, 0.5)), stone * 0.9);
    if (L(9.0) > 0.5) { put(seg(p, vec2(-1.3, 4.6), vec2(1.3, 4.6), 0.03), wood); for (int i = 0; i < 5; i++) put(bx(p, vec2(-1.0 + float(i) * 0.5, 4.35 + 0.05 * sin(u_time * 3.0 + float(i))), vec2(0.1, 0.18)), i % 2 == 0 ? hc : pal(9)); }
  }
#endif
#if G == 4
  if (kind == ${K.work}) {
    int t = int(p1 + 0.5);
    if (t == 0) {                                      // Great Granary: a vaulted barn and its silo
      put(bx(p, vec2(-0.8, 1.5), vec2(3.2, 1.5)), wood * 1.2 * (1.0 - L(9.0) * 0.22 * step(0.85, fract(p.x * 2.0))));
      put(max(length(vec2((p.x + 0.8) * 0.72, p.y - 3.0)) - 2.35, 3.0 - p.y), roof * 0.8);
      put(max(length(vec2(p.x + 0.8, max(p.y - 1.5, 0.0))) - 0.95, -p.y), dark * 0.6);
      put(bx(p, vec2(3.7, 2.6), vec2(0.95, 2.6)), paper * 0.8 * (0.85 + 0.15 * step(0.5, fract(p.y * 1.1))));
      put(max(abs(p.x - 3.7) - 1.15 * (1.0 - (p.y - 5.2) / 1.3), 5.2 - p.y), roof);
      if (L(8.0) > 0.5) { put(length((p - vec2(-4.6, 0.35)) * vec2(1.0, 1.3)) - 0.42, gold * 0.8); put(length((p - vec2(-5.2, 0.3)) * vec2(1.0, 1.3)) - 0.36, gold * 0.7); }
    } else if (t == 1) {                               // Sea Wall: a long stepped rampart with a beacon
      put(max(bx(p, vec2(0.0, 0.8), vec2(6.6, 0.8)), p.y - 1.6 + 0.35 * step(0.5, fract(p.x * 0.45))), stone * (0.8 + 0.2 * h1(floor(p.x * 1.1) + floor(p.y * 2.0) * 5.0)));
      put(max(abs(p.x) - 6.9 + p.y * 0.5, p.y - 0.6), stone * 0.7);
      for (int i = 0; i < 3; i++) put(bx(p, vec2(-4.4 + float(i) * 4.4, 1.1), vec2(0.45, 1.1)), stone * 1.15);
      put(bx(p, vec2(5.6, 2.6), vec2(0.4, 1.2)), stone * 1.2); glow(length(p - vec2(5.6, 4.1)) - 0.34, mix(pal(13), lit, lamp), 0.9 + lamp);
    } else if (t == 2) {                               // High Shrine: a stepped mountain of stone, a light at its top
      for (int i = 0; i < 5; i++) { float fi = float(i); put(bx(p, vec2(0.0, 0.7 + fi * 1.4), vec2(5.0 - fi * 1.0, 0.7)), mix(stone, paper, 0.25 + fi * 0.1) * (1.0 - L(9.0) * 0.18 * step(0.85, fract(p.x * 1.4 + fi * 0.5)))); }
      put(max(abs(p.x) - 0.5, max(p.y - 7.0, -p.y)), stone * 0.6 * (0.8 + 0.2 * step(0.5, fract(p.y * 3.0))));   // the stair
      float orb = length(p - vec2(0.0, 8.2 + 0.12 * sin(u_time * 1.7)));
      glow(orb - 0.55, mix(pal(10), pal(9), 0.5) * 1.3, 1.9); soft(smoothstep(2.2, 0.5, orb) * 0.3, pal(10), 1.3);
    } else if (t == 3) {                               // Great Bell: an open frame and the bell that swings in it
      put(bx(p, vec2(-1.7, 3.3), vec2(0.3, 3.3)), stone * 1.1); put(bx(p, vec2(1.7, 3.3), vec2(0.3, 3.3)), stone * 1.1);
      put(bx(p, vec2(0.0, 0.3), vec2(2.6, 0.3)), stone * 0.9); put(bx(p, vec2(0.0, 6.5), vec2(2.4, 0.22)), wood);
      put(max(abs(p.x) - 2.9 * (1.0 - (p.y - 6.7) / 1.5), 6.7 - p.y), roof);
      float a = sin(u_time * 1.6) * 0.3; vec2 b = p - vec2(0.0, 6.3); b = vec2(b.x * cos(a) - b.y * sin(a), b.x * sin(a) + b.y * cos(a));
      put(max(abs(b.x) - (0.45 + 0.75 * smoothstep(-0.6, -2.6, b.y)), max(b.y + 0.5, -b.y - 2.7)), gold * (1.0 + 0.3 * smoothstep(0.3, -0.5, b.x)));
      put(length(b - vec2(0.0, -2.9)) - 0.2, gold * 0.7);
    } else if (t == 4) {                               // Lighthouse: a tall banded tower and its turning beam
      float w = 1.0 - 0.045 * p.y;
      put(max(abs(p.x) - w, max(p.y - 9.0, -p.y)), mix(paper, pal(13) * 0.9, step(0.5, fract(p.y * 0.33))));
      put(bx(p, vec2(0.0, 9.2), vec2(1.0, 0.16)), stone); put(bx(p, vec2(0.0, 9.95), vec2(0.6, 0.6)), mix(dark, lit, 0.3 + 0.7 * lamp));
      put(max(abs(p.x) - 0.85 * (1.0 - (p.y - 10.55) / 0.9), 10.55 - p.y), roof);
      float sweep = sin(u_time * 0.8 + seed * 6.0); vec2 bq = p - vec2(0.0, 9.95);
      float beam = smoothstep(0.34, 0.0, abs(bq.y - bq.x * 0.12 * sweep) / (abs(bq.x) * 0.22 + 0.2)) * step(0.0, bq.x * sweep) * smoothstep(7.5, 0.5, abs(bq.x)) * abs(sweep);
      soft(beam * (0.15 + 0.6 * lamp), lit, 1.5);
      glow(length(bq) - 0.3, lit, 0.8 + lamp);
    } else if (t == 5) {                               // Star House: a dome with a slit, and the glass looking out of it
      put(bx(p, vec2(0.0, 1.3), vec2(3.0, 1.3)), stone * (1.0 - L(9.0) * 0.2 * step(0.86, fract(p.y * 2.0))));
      float dome = length(p - vec2(0.0, 2.6)) - 2.8;
      put(max(dome, 2.6 - p.y), mix(paper, pal(12), 0.25) * (0.75 + 0.3 * smoothstep(1.0, -2.0, p.x)));
      put(max(max(dome, 2.6 - p.y), abs(p.x - 0.9 - (p.y - 2.6) * 0.35) - 0.3), dark * 0.6);
      put(seg(p, vec2(0.9, 3.4), vec2(2.5, 6.6), 0.22), stone * 1.3); glow(length(p - vec2(2.6, 6.8)) - 0.2, pal(10), 1.2);
      glow(bx(p, vec2(-1.6, 1.3), vec2(0.3, 0.4)), mix(dark, lit, lamp), lamp); put(bx(p, vec2(0.6, 0.7), vec2(0.4, 0.7)), dark);
      for (int i = 0; i < 3; i++) glow(length(p - vec2(-2.5 + float(i) * 2.4, 8.2 + h1(float(i) + seed) * 2.5)) - 0.09 * (0.6 + 0.4 * sin(u_time * 3.0 + float(i) * 2.0)), pal(9), 1.6 * lamp + 0.4);
    } else {                                           // Sky Dock: a mast, an arm, and a hull moored in the air
      float lat = step(0.78, fract(p.y * 1.2)) + step(0.78, fract((p.y + p.x) * 1.2));
      put(max(bx(p, vec2(-2.5, 5.5), vec2(0.5, 5.5)), 0.5 - lat), stone * 1.3);
      put(bx(p, vec2(0.2, 10.4), vec2(3.3, 0.16)), stone * 1.2); put(bx(p, vec2(-2.5, 0.25), vec2(1.5, 0.25)), stone);
      vec2 hq = p - vec2(2.2, 8.4 + 0.15 * sin(u_time * 0.9));
      put(length(hq * vec2(0.42, 1.0)) - 1.15, mix(paper, pal(12), 0.3) * (0.8 + 0.25 * smoothstep(-0.5, 0.8, hq.y)));
      put(bx(hq, vec2(0.0, -1.35), vec2(1.0, 0.25)), wood * 1.2); put(seg(p, vec2(2.2, 10.3), vec2(2.2, 9.5), 0.03), dark);
      for (int i = 0; i < 4; i++) glow(length(hq - vec2(-0.75 + float(i) * 0.5, -1.35)) - 0.09, lit, lamp * 1.5);
      glow(length(p - vec2(-2.5, 11.3)) - 0.16, pal(13), 0.6 + 0.9 * step(0.5, fract(u_time * 0.7)));
    }
  }
#endif
#if G == 3
  if (kind == ${K.school}) {
    put(bx(p, vec2(0.0, 0.15), vec2(3.1, 0.15)), stone); put(bx(p, vec2(0.0, 1.5), vec2(2.7, 1.2)), wallc * 0.85);
    for (int i = 0; i < 5; i++) put(bx(p, vec2(-2.4 + float(i) * 1.2, 1.5), vec2(0.16, 1.2)), paper);
    put(bx(p, vec2(0.0, 2.85), vec2(3.0, 0.16)), paper * 0.9);
    put(max(abs(p.x) - 3.0 * (1.0 - (p.y - 3.0) / 1.2), 3.0 - p.y), paper * 0.8);
    glow(length(p - vec2(0.0, 3.45)) - 0.22, pal(10), 0.8 + lamp);
    for (int i = 0; i < 4; i++) glow(bx(p, vec2(-1.8 + float(i) * 1.2, 1.6), vec2(0.22, 0.4)), mix(dark, lit, lamp), lamp * 1.2);
    if (L(12.0) > 0.5) { put(bx(p, vec2(3.3, 0.5), vec2(0.3, 0.2)), wood); put(bx(p, vec2(3.3, 0.78), vec2(0.24, 0.05)), paper); }
  }
#endif
#if G == 3
  if (kind == ${K.hall}) {
    vec3 hc = hue(p1);
    put(bx(p, vec2(0.0, 0.12), vec2(3.6, 0.12)), stone); put(bx(p, vec2(0.0, 0.34), vec2(3.0, 0.1)), stone * 1.1);
    put(bx(p, vec2(0.0, 1.9), vec2(2.7, 1.5)), mix(wood, stone, 0.5) * 1.15 * (1.0 - L(10.0) * 0.2 * step(0.86, fract(p.y * 2.0))));
    float ry = (p.y - 3.4) / 2.7; put(max(abs(p.x) - 3.2 * (1.0 - ry), -ry), roof * 0.9 * (1.0 - L(10.0) * 0.22 * step(0.6, fract(p.y * 3.0 + p.x * 0.5))));
    put(min(seg(p, vec2(-0.5, 5.7), vec2(0.5, 6.7), 0.07), seg(p, vec2(0.5, 5.7), vec2(-0.5, 6.7), 0.07)), wood * 0.7);    // crossed beams at the gable
    glow(max(length(vec2(p.x, max(p.y - 1.4, 0.0))) - 0.7, 0.44 - p.y), mix(dark, lit, 0.25 + 0.75 * lamp), lamp * 1.3);
    glow(bx(p, vec2(-1.8, 2.0), vec2(0.25, 0.5)), mix(dark, lit, lamp), lamp); glow(bx(p, vec2(1.8, 2.0), vec2(0.25, 0.5)), mix(dark, lit, lamp), lamp);
    put(seg(p, vec2(-3.2, 0.4), vec2(-3.2, 4.4), 0.05), wood); flag(p, vec2(-3.15, 3.7), vec2(1.1, 1.1), hc);
    put(seg(p, vec2(3.2, 0.4), vec2(3.2, 4.4), 0.05), wood); flag(p, vec2(3.25, 3.7), vec2(1.1, 1.1), hc);
    put(length(p - vec2(0.0, 4.2)) - 0.3, gold * 1.2);
  }
#endif
#if G == 3
  if (kind == ${K.ruin}) {
    // p1: how hard it burns. p2: how far the rebuilding has come.
    float sl = floor(p.x * 0.8), fxs = fract(p.x * 0.8) - 0.5, hh = h1(sl * 3.7 + seed * 11.0);
    float hgt = step(0.35, hh) * (0.6 + 2.6 * h1(sl + seed * 5.0)) * smoothstep(5.0, 3.0, abs(p.x));
    float jag = 0.5 * h1(floor(p.x * 3.0) + seed);
    vec3 char_ = mix(dark, stone, 0.3) * (0.7 + 0.3 * h1(floor(p.x * 2.0) + floor(p.y * 2.0) * 3.0));
    put(max(abs(fxs) - 0.36, p.y - hgt + jag), char_);
    put(bx(p, vec2(0.0, 0.1), vec2(4.6, 0.12)), dark * 1.2);
    put(seg(p, vec2(-2.4, 0.2), vec2(-0.6, 1.9), 0.07), dark * 0.9); put(seg(p, vec2(1.0, 0.2), vec2(2.8, 1.3), 0.07), dark * 0.9);
    if (L(10.0) > 0.5) put(max(length(vec2(p.x - 0.6, max(p.y - 0.8, 0.0))) - 0.4, max(-p.y, -(hgt - 1.0))), pal(0));
    if (p1 > 0.02) { for (int i = 0; i < 4; i++) { float fi = float(i); float on = step(fi * 0.22, p1); if (on > 0.5) flame(p, vec2(-3.0 + fi * 2.0 + h1(fi + seed) * 0.8, 0.5 + 1.6 * h1(fi * 3.0 + seed)), 0.42 * (0.5 + 0.5 * p1)); } }
    if (p2 > 0.02) {
      float up = 4.0 * p2;
      for (int i = 0; i < 4; i++) put(max(abs(p.x + 3.3 - float(i) * 2.2) - 0.06, p.y - up), wood * 1.3);
      put(bx(p, vec2(0.0, up * 0.5), vec2(3.4, 0.05)), wood * 1.2); put(bx(p, vec2(0.0, up), vec2(3.4, 0.05)), wood * 1.2);
      put(max(abs(p.x) - 2.0, abs(p.y - 0.9 * p2) - 0.9 * p2), wallc * 1.05);
    }
  }
#endif
#if G == 1
  if (kind == ${K.puff}) {
    // p1: age 0..1. p2: 1 = lit from below by fire.
    vec2 c = p - vec2(0.0, size * 0.5); float r = length(c) / (size * 0.5);
    float n = h1(floor(c.x * 2.5 / size * 4.0) + floor(c.y * 2.5 / size * 4.0) * 9.0 + seed * 7.0);
    soft_a = smoothstep(1.0, 0.2, r) * (1.0 - p1) * smoothstep(0.0, 0.08, p1) * (0.5 + 0.2 * n);
    col = vec4(mix(mix(pal(2), pal(1), 0.6), pal(13), p2 * 0.6 * smoothstep(0.5, 0.0, p1)) * (0.45 + 0.55 * u_amb + p2 * 0.3 * (1.0 - p1)), soft_a);
    emis = -1.0;
  }
#endif
#if G == 2
  if (kind == ${K.skyline}) {
    // The village as its age builds: p1 era 0..8, p2 how many lights are lit (0..1).
    float sl = floor(p.x / 2.4), fx = (fract(p.x / 2.4) - 0.5) * 2.4;
    float ha = h1(sl * 7.3 + seed * 31.0), hb = h1(sl * 3.1 + seed * 17.0), hc2 = h1(sl * 5.7 + seed * 3.0);
    float edge = smoothstep(size * 0.5, size * 0.28, abs(p.x));
    vec2 q = vec2(fx, p.y); float back = 0.72;
    float lights = lamp * p2;
    if (ha < (0.34 + p1 * 0.075) * edge) {
      if (p1 < 1.5) {
        put(max(length(q - vec2(0.0, 0.5)) - 0.95, -q.y), wood * back * 1.1);
        put(max(abs(q.x) - 1.15 * (1.0 - (q.y - 0.9) / 1.3), 0.9 - q.y), mix(gold, wood, 0.5) * back);
        put(max(length(vec2(q.x, max(q.y - 0.4, 0.0))) - 0.3, -q.y), dark * 0.7);
        if (p1 > 0.5 && hb > 0.6) flame(q, vec2(1.0, 0.25), 0.16);
      } else if (p1 < 3.5) {
        float hgt = 1.5 + 1.3 * hb;
        put(bx(q, vec2(0.0, hgt * 0.5), vec2(0.95, hgt * 0.5)), mix(stone, wallc, 0.4) * back * (1.0 - L(11.0) * 0.2 * step(0.85, fract(q.y * 2.2))));
        put(max(abs(q.x) - 1.15 * (1.0 - (q.y - hgt) / 0.95), hgt - q.y), roof * back);
        float on = lights * step(hc2, 0.6);
        glow(bx(q, vec2(0.3, hgt * 0.6), vec2(0.2, 0.22)), mix(dark, lit, on), on);
        if (p1 > 2.5 && hb > 0.5) { put(bx(q, vec2(1.1, 0.9), vec2(0.04, 0.9)), dark * 1.5); glow(length(q - vec2(1.1, 1.9)) - 0.13, mix(dark, lit, lamp), lamp * 1.5); }
      } else if (p1 < 5.5) {
        float hgt = 2.6 + 4.2 * hb + (p1 > 4.5 ? 1.2 * hc2 : 0.0), w = 0.62 + 0.3 * hc2;
        put(bx(q, vec2(0.0, hgt * 0.5), vec2(w, hgt * 0.5)), stone * back * 1.05 * (1.0 - L(11.0) * 0.2 * step(0.86, fract(q.y * 2.0))));
        if (hc2 > 0.5) put(max(abs(q.x) - (w + 0.2) * (1.0 - (q.y - hgt) / 1.3), hgt - q.y), roof * back);
        else put(max(bx(q, vec2(0.0, hgt + 0.2), vec2(w + 0.12, 0.2)), -(0.3 - abs(fract(q.x * 2.0) - 0.5)) * step(hgt + 0.2, q.y)), stone * back * 1.2);
        float wy = fract(q.y * 0.8) - 0.5, row = floor(q.y * 0.8);
        float on = lights * step(h1(row * 3.0 + sl), 0.55);
        if (q.y < hgt - 0.3 && q.y > 0.6) glow(max(abs(q.x) - 0.16, abs(wy) - 0.2), mix(dark, lit, on), on);
      } else {
        float hgt = 3.0 + 5.2 * hb, w = 1.02;
        put(bx(q, vec2(0.0, hgt * 0.5), vec2(w, hgt * 0.5)), mix(stone, dark, 0.35) * back * 1.15);
        put(bx(q, vec2(0.0, hgt + 0.1), vec2(w + 0.08, 0.1)), stone * back * 1.3);
        vec2 wq = vec2(fract(q.x * 1.7 + 0.5) - 0.5, fract(q.y * 1.15) - 0.5);
        float on = lights * step(h1(floor(q.x * 1.7 + 0.5) * 5.0 + floor(q.y * 1.15) * 3.0 + sl), 0.62);
        if (q.y < hgt - 0.2 && q.y > 0.5 && abs(q.x) < w - 0.1) glow(max(abs(wq.x) - 0.26, abs(wq.y) - 0.24), mix(dark * 0.8, mix(lit, pal(10) * 1.3, step(0.6, hc2)), on), on * 1.2);
        if (hc2 > 0.45) {                              // an engine's stack, breathing
          put(bx(q, vec2(0.55, hgt + 1.3), vec2(0.2, 1.3)), stone * back * 0.9);
          glow(bx(q, vec2(0.55, hgt + 2.45), vec2(0.2, 0.1)), pal(13), 0.8 + 0.6 * sin(u_time * 2.0 + sl));
        }
        if (p1 > 6.5 && ha < 0.22) {                   // far-speaking: masts and a dish
          put(seg(q, vec2(-0.5, hgt), vec2(-0.5, hgt + 5.0), 0.045), stone * 1.3);
          put(seg(q, vec2(-0.5, hgt + 3.0), vec2(-1.0, hgt + 0.2), 0.02), stone); put(seg(q, vec2(-0.5, hgt + 3.0), vec2(0.0, hgt + 0.2), 0.02), stone);
          put(max(abs(length(q - vec2(-0.5, hgt + 4.0)) - 0.5) - 0.05, q.x + 0.5 - (q.y - hgt - 4.0) * 0.6), paper);
          glow(length(q - vec2(-0.5, hgt + 5.15)) - 0.12, vec3(1.0, 0.2, 0.15), step(0.5, fract(u_time * 0.8 + sl * 0.37)) * 1.8);
        }
        if (p1 > 7.5 && ha > 0.2 && ha < 0.36) {       // leaving: gantries lit all night
          float lat = step(0.75, fract(q.y * 1.4)) + step(0.75, fract((q.y + q.x) * 1.4));
          put(max(bx(q, vec2(0.2, hgt + 3.5), vec2(0.38, 3.5)), 0.5 - lat), paper * 0.9);
          glow(length(vec2(q.x - 0.2, fract(q.y * 0.5) - 0.5)) - 0.09, pal(10) * 1.3, step(hgt, q.y) * step(q.y, hgt + 7.0) * 1.6);
        }
      }
    }
  }
#endif
#if G == 3
  if (kind == ${K.gantry}) {
    // p1: launch 0..1 (0 = standing ready, negative = the ship has gone). p2: 1 = an ark.
    put(bx(p, vec2(0.0, 0.18), vec2(4.2, 0.18)), stone);
    float lat = step(0.78, fract(p.y * 1.1)) + step(0.78, fract((p.y + p.x) * 1.1));
    put(max(bx(p, vec2(-2.4, 6.0), vec2(0.6, 6.0)), 0.5 - lat), paper * 0.9);
    for (int i = 0; i < 3; i++) { float ay = 3.5 + float(i) * 3.6; put(bx(p, vec2(-1.2, ay), vec2(0.75 - 0.5 * smoothstep(0.02, 0.08, p1), 0.1)), stone * 1.3); glow(length(p - vec2(-2.4, ay + 0.5)) - 0.12, pal(10) * 1.3, 1.5); }
    glow(length(p - vec2(-2.4, 12.3)) - 0.16, vec3(1.0, 0.2, 0.15), step(0.5, fract(u_time * 0.9)) * 1.8);
    if (p1 >= 0.0) {
      float burn = smoothstep(0.0, 0.03, p1);
      float up = max(p1 - 0.06, 0.0); up = up * up * 420.0;
      vec2 r = p - vec2(0.6 + sin(u_time * 40.0) * 0.03 * burn, 0.5 + up);
      float hw = 0.95;
      put(max(abs(r.x) - hw, abs(r.y - 4.4) - 4.0), mix(paper, pal(9), 0.5) * (0.75 + 0.3 * smoothstep(0.6, -0.8, r.x)));
      float ny = (r.y - 8.4) / 2.2; put(max(abs(r.x) - hw * (1.0 - ny * ny), -ny), pal(14) * 1.15);
      put(max(abs(r.x) - 1.9 * (1.0 - r.y / 2.2), max(-r.y + 0.4, r.y - 2.2)), pal(14));
      put(bx(r, vec2(0.0, 5.2), vec2(hw, 0.14)), pal(12));
      for (int i = 0; i < 4; i++) glow(length(r - vec2(0.0, 3.0 + float(i) * 1.1)) - 0.14, pal(10) * 1.2, 1.2);
      if (burn > 0.01) {
        float fl = 3.0 + 4.0 * burn + sin(u_time * 31.0) * 0.6;
        glow(max(abs(r.x) - 0.8 * (1.0 + r.y / fl), max(r.y - 0.4, -r.y - fl)), mix(pal(9), pal(13), clamp(-r.y / fl, 0.0, 1.0)), 2.2);
        soft(smoothstep(5.0, 0.0, length((p - vec2(0.6, 0.6)) * vec2(0.5, 1.2))) * burn * smoothstep(0.3, 0.05, p1) * 0.7, mix(pal(13), pal(9), 0.5), 1.8);
      }
    }
  }
#endif
#if G == 1
  if (kind == ${K.light}) {
    // A light: p1 brightness, p2 > 0 leaves a trail below it.
    vec2 c = p - vec2(0.0, size * 0.7); float r = length(c) / (size * 0.3);
    float a = exp(-r * r * 3.0) + 0.5 * exp(-r * 1.6);
    if (p2 > 0.5 && c.y < 0.0) a += exp(-abs(c.x) * 9.0 / size - (-c.y) * 3.2 / size) * 0.9 * (0.75 + 0.25 * sin(u_time * 30.0 + c.y * 4.0));
    soft_a = clamp(a * p1, 0.0, 1.0);
    col = vec4(mix(pal(13), pal(9), smoothstep(0.7, 0.0, r)) * 1.5, soft_a); emis = -1.0;
  }
#endif
  if (col.a < 0.02) discard;
  vec3 c = emis < -0.5 ? col.rgb : emis > 0.0 ? col.rgb * max(emis, 0.6) : col.rgb * u_amb;
  float alpha = col.a;
  if (u_mode == 1) {
    vec2 suv = (gl_FragCoord.xy - u_vp.xy) / u_vp.zw;
    float td = texture(u_depth, suv).a; td = td * td * 260.0;
    if (v_dist > td + 1.0 + 0.3 * sqrt(td)) discard;
    alpha *= smoothstep(215.0, 130.0, v_dist);
    if (emis <= 0.0 && emis > -0.5) c = mix(c, pal(9) * u_amb * 0.8, clamp(v_dist / 280.0, 0.0, 0.55));
  }
  o = vec4(c * alpha, alpha);
}`;

const hs = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};
/** A stable colour for a name: 0..1 round the wheel. */
const hueOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 997) / 997;
};
const fr = (n: number) => n - Math.floor(n);

export const createStory = (core: GlCore) => {
  const gl = core.gl;
  const names = ['u_mode', 'u_cam', 'u_ro', 'u_grid', 'u_time', 'u_amb', 'u_night', 'u_zoom', 'u_wind', 'u_pal', 'u_depth', 'u_vp'];
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const groups = CAP.map((cap, g) => {
    const prog = core.program(VS, fsFor(g));
    const loc = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])) as Record<string, WebGLUniformLocation | null>;
    const data = new Float32Array(cap * 8);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
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
    return { prog, loc, data, vao, inst, cap, n: 0 };
  });

  // ---- what the eye remembers between frames ----
  const MAXV = 32, RU = 6;
  const pid = new Int32Array(MAXV), px = new Float32Array(MAXV), pwar = new Uint8Array(MAXV);
  let pn = -1, key = -1;
  const knownWar = new Uint8Array(4096);
  const rx = new Float32Array(RU), rt = new Float32Array(RU), rburn = new Uint8Array(RU), rlive = new Uint8Array(RU), rid = new Int32Array(RU);
  const sx = new Float32Array(RU), st = new Float32Array(RU).fill(-999);
  let ns = 0;
  let la = 9999;                           // launch age, eased between ticks

  let F: LifeFrame | null = null;
  const col = (x: number) => Math.max(0, Math.min(F!.W - 1, Math.floor(x)));
  const wet = (x: number) => F!.kind[col(x)] === LIQUID;
  const put = (x: number, gx: number, alt: number, z: number, kind: number, p1: number, p2: number, size: number, seed: number) => {
    const f = F!;
    const G = groups[GROUP[kind]!]!;
    if (G.n >= G.cap || x < 0 || x >= f.W) return;
    const data = G.data, k = G.n * 8;
    if (f.fp) {
      const w = warpZ(z);
      const rx = x - w - f.fp.ro[0], rz = z - f.fp.ro[2];
      // Nothing behind the eye, nothing too far to see.
      if (rx * Math.cos(f.fp.yaw) + rz * Math.sin(f.fp.yaw) < -size || rx * rx + rz * rz > Math.min(200, f.far ?? 200) ** 2) return;
      data[k] = x - w; data[k + 1] = f.fp.ground(gx - w, z) + alt; data[k + 2] = z;
    } else { data[k] = x; data[k + 1] = f.top[col(gx)]! - alt; data[k + 2] = 0; }
    data[k + 3] = kind; data[k + 4] = p1; data[k + 5] = p2; data[k + 6] = size; data[k + 7] = seed;
    G.n++;
  };
  /** The column a wide thing should stand on: the lowest ground under it, so no corner hangs in the air. */
  const seat = (x: number, half: number) => {
    const f = F!;
    let best = col(x);
    for (let c = col(x - half); c <= col(x + half); c++) if (f.top[c]! > f.top[best]!) best = c;
    return best;
  };
  const find = (id: number): Village | null => {
    const vs = F!.civ.villages;
    for (let i = 0; i < vs.length; i++) if (vs[i]!.id === id) return vs[i]!;
    return null;
  };
  const has = (v: Village, kind: string) => { for (let i = 0; i < v.buildings.length; i++) if (v.buildings[i]!.kind === kind) return v.buildings[i]!.x; return -1; };
  const eraOf = (v: Village) => v.era ?? v.tech;
  /** Is this village its creed's holy place? The view does not say, so: the High Shrine, else the creed's eldest village. */
  const holy = (v: Village) => {
    if (!v.creed) return false;
    if (v.works && v.works.indexOf('High Shrine') >= 0) return true;
    const vs = F!.civ.villages;
    let others = 0;
    for (let i = 0; i < vs.length; i++) {
      const o = vs[i]!;
      if (o === v || o.creed !== v.creed) continue;
      if (o.id < v.id || (o.works && o.works.indexOf('High Shrine') >= 0)) return false;
      others++;
    }
    return others > 0;
  };
  /** People on foot from xa toward xb, in a loose line. */
  const line = (xa: number, xb: number, count: number, type: number, speed: number, gap: number, salt: number, hue: number, z0: number) => {
    const f = F!;
    const dist = Math.abs(xb - xa);
    if (dist < 6) return;
    const dir = xb > xa ? 1 : -1;
    const head = fr((f.time * speed) / dist + hs(f.seed, salt)) * (dist + count * gap);
    for (let i = 0; i < count; i++) {
      const along = head - i * gap;
      if (along < 1 || along > dist - 1) continue;
      const x = xa + dir * along;
      if (wet(x)) continue;
      put(x, x, 0, z0 + (hs(salt, i) - 0.5) * 3, K.walker, f.time * speed * 2.6 + i * 1.7, dir * type, 3.6, hue);
    }
  };
  const cart = (xa: number, xb: number, type: number, speed: number, salt: number, hue: number) => {
    const f = F!;
    const dist = Math.abs(xb - xa);
    if (dist < 8) return;
    const dir = xb > xa ? 1 : -1;
    const along = 2 + fr((f.time * speed) / dist + hs(f.seed, salt)) * (dist - 4);
    const x = xa + dir * along;
    if (wet(x) || wet(x + dir * 2)) return;
    put(x, x, 0, (hs(salt, 3) - 0.5) * 4, K.cart, f.time * speed * 2.2, dir * type, 4.6, hue);
  };
  const smoke = (x: number, alt: number, z: number, count: number, rise: number, big: number, lit: number, salt: number) => {
    const f = F!;
    const wind = f.env.wind / 100;
    for (let q = 0; q < count; q++) {
      const t = fr(f.time * 0.11 + q / count + hs(salt, q) * 0.2);
      put(x + wind * t * t * rise * 0.9 + Math.sin(t * 6 + q) * 0.6, x, alt + t * rise, z, K.puff, t, lit, big * (0.5 + t * 1.3), hs(salt, q + 9));
    }
  };

  const track = () => {
    const f = F!;
    const civ = f.civ, vs = civ.villages, t = f.time;
    if (key !== f.seed) { key = f.seed; pn = -1; knownWar.fill(0); rlive.fill(0); st.fill(-999); la = 9999; }
    if (pn >= 0) {
      for (let i = 0; i < pn; i++) {
        if (find(pid[i]!)) continue;
        let near = false;
        for (let j = 0; j < vs.length; j++) if (Math.abs(vs[j]!.x - px[i]!) <= 8) near = true;
        if (near) continue;
        // A village has gone. Keep where it stood.
        let slot = 0;
        for (let r = 0; r < RU; r++) { if (!rlive[r]) { slot = r; break; } if (rt[r]! < rt[slot]!) slot = r; }
        rx[slot] = px[i]!; rt[slot] = t; rburn[slot] = pwar[i]!; rlive[slot] = 1; rid[slot] = pid[i]!;
      }
    }
    for (let r = 0; r < RU; r++) {
      if (!rlive[r]) continue;
      let again = -1;
      for (let j = 0; j < vs.length; j++) if (Math.abs(vs[j]!.x - rx[r]!) <= 12) again = j;
      if (again >= 0) { rlive[r] = 0; sx[ns % RU] = vs[again]!.x; st[ns % RU] = t; ns++; }
      else if (civ.ruins === 0 && t - rt[r]! > 50) rlive[r] = 0;
    }
    pn = Math.min(MAXV, vs.length);
    for (let i = 0; i < pn; i++) {
      const v = vs[i]!;
      pid[i] = v.id; px[i] = v.x; pwar[i] = v.state === 'war' ? 1 : 0;
      if (v.state === 'war') knownWar[v.id & 4095] = 1;
    }
    const rel = civ.relations;
    if (rel) for (let i = 0; i < rel.length; i++) { const r = rel[i]!; if (r.kind === 'war' || r.kind === 'tribute' || r.kind === 'rivalry') { knownWar[r.a & 4095] = 1; knownWar[r.b & 4095] = 1; } }
    // Launch age moves in whole ticks: let it run on between them.
    const target = civ.launches > 0 ? civ.launchAge : 9999;
    la = target < la || target - la > 12 ? target : Math.min(target + 1, la + f.dt * 0.02);
  };

  const place = () => {
    const f = F!;
    const civ = f.civ, vs = civ.villages, t = f.time, fp = !!f.fp;
    const zoom = fp ? 99 : f.view.zoom;
    const rel = civ.relations;
    const night = f.night > 0.5;

    // ---- behind the buildings: each village's skyline, by its true age ----
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i]!;
      const era = eraOf(v);
      const lights = v.state === 'plague' ? 0.12 : 0.45 + v.prosperity / 180;
      const wide = 16 + era * 1.6 + Math.min(8, v.souls / 8);
      // In first person the houses round you are solid already: the skyline is for villages seen from away.
      if (!fp || Math.abs(v.x - f.fp!.ro[0]) > 34) put(v.x, v.x, 0, fp ? -15 : 0, K.skyline, era, lights, wide, v.id * 0.37);
    }
    for (let r = 0; r < RU; r++) {
      if (!rlive[r]) continue;
      const age = t - rt[r]!;
      const burn = rburn[r] ? Math.max(0, 1 - age / 40) : 0;
      put(rx[r]!, rx[r]!, 0, fp ? -6 : 0, K.ruin, burn, 0, 10, rid[r]! * 0.61);
    }
    for (let r = 0; r < RU; r++) {
      const age = t - st[r]!;
      if (age < 0 || age > 45) continue;
      // Rebuilt: the frames go up over the old stones, then come down.
      put(sx[r]!, sx[r]!, 0, fp ? -6 : 0, K.ruin, 0, Math.min(1, age / 12) * (age > 35 ? (45 - age) / 10 : 1), 10, r * 0.61 + 3);
    }

    // ---- between villages ----
    if (rel) for (let i = 0; i < rel.length; i++) {
      const r = rel[i]!;
      const a = find(r.a), b = find(r.b);
      if (!a || !b) continue;
      const lo = a.x < b.x ? a : b, hi = a.x < b.x ? b : a;
      const dist = hi.x - lo.x;
      if (dist < 8) continue;
      const salt = r.a * 131 + r.b * 17;
      const type = r.kind === 'pact' ? 0 : r.kind === 'alliance' ? 1 : r.kind === 'war' ? 2 : r.kind === 'tribute' ? 3 : 4;
      const hue = hs(salt, 77);
      if (!fp) {
        const step = type === 2 ? 2.5 : 3;
        for (let x = lo.x + 5, q = 0; x < hi.x - 4; x += step, q++) {
          if (wet(x)) continue;
          if (type === 2 && q % 3 === 2) continue;               // a broken line
          if (type === 4 && q % 3 !== 0) continue;
          if (type === 1 && q % 2) continue;
          put(x, x, type === 2 ? 0.2 : 0, 0, K.dash, type, 0, 1.3, hue);
        }
      }
      if (type === 0) {
        cart(lo.x, hi.x, 1, 2.4, salt + 1, hue); cart(hi.x, lo.x, 1, 2.1, salt + 2, hue);
        line(lo.x, hi.x, 3, WT.porter, 1.7, 2.2, salt + 3, hue, 2);
      } else if (type === 1) {
        put(lo.x + 3.5, lo.x + 3, 0, -2, K.banner, hue, 2, 5.2, 0); put(hi.x - 3.5, hi.x - 3, 0, -2, K.banner, hue, 2, 5.2, 0);
        line(hi.x, lo.x, 2, WT.porter, 1.6, 3, salt + 4, hue, 2);
      } else if (type === 2) {
        // Two columns march out, meet in the middle, and fall back.
        const u = fr(t / 46 + hs(f.seed, salt));
        const reach = (dist / 2 - 1.5) * (u < 0.55 ? u / 0.55 : u < 0.85 ? 1 : (1 - u) / 0.15);
        const ha = hueOf(lo.creed ?? lo.name), hb = hueOf(hi.creed ?? hi.name);
        for (let s = 0; s < 6; s++) {
          const da = Math.max(0, reach - s * 1.7), z = (hs(salt, s) - 0.5) * 5;
          if (da > 2 && !wet(lo.x + da)) put(lo.x + da, lo.x + da, 0, z, K.walker, t * 5 + s * 1.3, WT.soldier, 3.6, ha);
          if (da > 2 && !wet(hi.x - da)) put(hi.x - da, hi.x - da, 0, -z, K.walker, t * 5 + s * 2.1, -WT.soldier, 3.6, hb);
        }
        if (reach > 3) { put(lo.x + reach + 1.2, lo.x + reach, 0, 0, K.banner, ha, 0, 4.4, 0); put(hi.x - reach - 1.2, hi.x - reach, 0, 0, K.banner, hb, 0, 4.4, 0); }
        if (u > 0.55 && u < 0.85) {
          const mid = (lo.x + hi.x) / 2;
          smoke(mid, 1, 0, 3, 9, 3.2, 0, salt + 5);
          put(mid + Math.sin(t * 13) * 1.2, mid, 1.5, 0, K.light, 0.5 + 0.5 * Math.sin(t * 23), 0, 2.6, 0);
        }
      } else if (type === 3) {
        const payer = a.state === 'tribute' && a.stateWith === b.id ? a : b.state === 'tribute' && b.stateWith === a.id ? b : lo;
        const lord = payer === a ? b : a;
        cart(payer.x, lord.x, 2, 1.8, salt + 6, hueOf(lord.creed ?? lord.name));
        line(payer.x, lord.x, 2, WT.guard, 1.8, 2.4, salt + 7, hueOf(lord.creed ?? lord.name), -2);
      } else {
        // Rivals: now and then a few go over with torches after dark, and come back.
        const u = fr(t / 60 + hs(f.seed, salt + 8));
        if (u < 0.45 || night) {
          const from = hs(salt, 9) > 0.5 ? lo : hi, to = from === lo ? hi : lo;
          line(from.x, to.x, 3, WT.raider, 3.2, 1.6, salt + 10, 0, 3);
        }
      }
    }

    // ---- each village ----
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i]!;
      const era = eraOf(v);
      const vh = v.creed ? hueOf(v.creed) : -1;
      const hl = v.creed ? holy(v) : false;
      const hv = hs(f.seed, 4000 + v.id);
      // Walls, once they have known war.
      if (knownWar[v.id & 4095]) {
        const out = 11 + Math.min(5, v.souls / 12);
        if (fp) for (let s = -1; s <= 1; s++) { put(v.x - out, v.x - out, 0, s * 7.6, K.wall, era, s === 0 ? 1 : 0, 7.8, v.id); put(v.x + out, v.x + out, 0, s * 7.6, K.wall, era, s === 0 ? 1 : 0, 7.8, v.id + 3); }
        else { put(v.x - out, v.x - out, 0, 0, K.wall, era, 1, 5.4, v.id); put(v.x + out, v.x + out, 0, 0, K.wall, era, 1, 5.4, v.id + 3); }
      }
      if (v.works) for (let k = 0; k < v.works.length && k < 4; k++) {
        const w = WORK_NAMES.indexOf(v.works[k]!);
        if (w < 0) continue;
        const side = (k + (hv > 0.5 ? 1 : 0)) % 2 ? 1 : -1;
        let x = v.x + side * (17 + (k >> 1) * 15);
        if (w === 1 || w === 4) {                      // the sea wall and the lighthouse go to the water
          for (let d = 4; d < 34; d++) { if (wet(v.x + d + 1)) { x = v.x + d - (w === 1 ? 5 : 1); break; } if (wet(v.x - d - 1)) { x = v.x - d + (w === 1 ? 5 : 1); break; } }
        }
        put(x, seat(x, w === 1 ? 5 : 3), 0, fp ? (side > 0 ? -11 : 12) : 0, K.work, w, 0, 16, v.id * 0.13 + k);
      }
      if (hl) put(v.x - 6.5, seat(v.x - 6.5, 2), 0, fp ? -7 : 0, K.holy, vh, 0, 9, v.id);
      if (v.school) put(v.x + 8.5, seat(v.x + 8.5, 2), 0, fp ? 8 : 0, K.school, 0, 0, 7.4, v.id);
      if (v.ruler) {
        const hx = v.x - 12.5;
        put(hx, seat(hx, 2), 0, fp ? -9 : 0, K.hall, vh >= 0 ? vh : hueOf(v.name), 0, 9, v.id);
        if (zoom > 5 && !night) {
          // The ruler walks out with two behind.
          const walk = Math.sin(t * 0.13 + hv * 6) * 5, dir = Math.cos(t * 0.13 + hv * 6) >= 0 ? 1 : -1;
          const rh = vh >= 0 ? vh : hueOf(v.name);
          put(hx + 3 + walk, hx + 3 + walk, 0, 1, K.walker, t * 2.2, dir * WT.ruler, 4.1, rh);
          put(hx + 3 + walk - dir * 1.5, hx + 3 + walk - dir * 1.5, 0, 2, K.walker, t * 2.2 + 1, dir * WT.guard, 3.6, rh);
          put(hx + 3 + walk - dir * 2.7, hx + 3 + walk - dir * 2.7, 0, 0, K.walker, t * 2.2 + 2, dir * WT.guard, 3.6, rh);
        }
      }
      if (vh >= 0) put(v.x + 2.6, v.x + 2, 0, fp ? -3 : 0, K.banner, vh, 0, 6, 0);
      if (v.state === 'plague') {
        put(v.x - 3.5, v.x - 3, 0, fp ? 3 : 0, K.banner, 0, 1, 5.4, 0); put(v.x + 6, v.x + 6, 0, fp ? -4 : 0, K.banner, 0, 1, 5.4, 0);
        cart(v.x - 2, v.x + (hv > 0.5 ? 16 : -16), 3, 0.8, 5000 + v.id, 0);
        if (zoom > 5) for (let q = 0; q < 3; q++) { const sxp = v.x + (hs(v.id, q + 20) - 0.5) * 14 + Math.sin(t * 0.2 + q * 2) * 1.5; put(sxp, sxp, 0, (q - 1) * 2.5, K.walker, t * 0.9 + q, (q % 2 ? 1 : -1) * WT.sick, 3.5, 0); }
        smoke(v.x + 9 * (hv > 0.5 ? 1 : -1), 0.5, fp ? 5 : 0, 3, 10, 2.6, 0.4, 5100 + v.id);   // the pyre at the edge
      } else if (v.state === 'heresy') {
        const hx = v.x + (hv > 0.5 ? 6 : -6);
        put(hx, hx, 0, fp ? 4 : 0, K.walker, 0, WT.heretic, 3.9, hv);
        for (let q = 0; q < 5; q++) { const lx = hx + (q < 3 ? 1.6 + q * 1.1 : -1.4 - (q - 3) * 1.2); put(lx, lx, 0, fp ? 4 + (q % 3) - 1 : 0, K.walker, 0, (lx > hx ? -1 : 1) * WT.listener, 3.2, hs(v.id, q)); }
      } else if (v.state === 'war') {
        // Watch on the walls, and the smoke of what has been set alight.
        const foe = v.stateWith !== undefined ? find(v.stateWith) : null;
        const out = 11 + Math.min(5, v.souls / 12);
        put(v.x - out + 1.6, v.x - out + 1, 0, 1, K.walker, 0, -WT.guard, 3.6, vh >= 0 ? vh : hueOf(v.name));
        put(v.x + out - 1.6, v.x + out - 1, 0, 1, K.walker, 0, WT.guard, 3.6, vh >= 0 ? vh : hueOf(v.name));
        if (foe && foe.souls > v.souls) {
          const side = foe.x > v.x ? 1 : -1;
          smoke(v.x + side * 5, 2, fp ? -4 : 0, 5, 20, 4.2, 1, 5200 + v.id);
          put(v.x + side * 5, v.x + side * 5, 0.6, fp ? -4 : 0, K.light, 0.55 + 0.25 * Math.sin(t * 9), 0, 4, 0);
        }
      }
      // Pilgrims come to a holy place from those who keep its creed.
      if (hl) for (let j = 0; j < vs.length; j++) {
        const o = vs[j]!;
        if (o === v || o.creed !== v.creed) continue;
        line(o.x, v.x - 6, 3, WT.pilgrim, 1.3, 2.6, 6000 + o.id * 7 + v.id, vh, -2);
      }
    }

    // ---- ruins: fire and smoke while it burns, and those who walked away ----
    for (let r = 0; r < RU; r++) {
      if (!rlive[r]) continue;
      const age = t - rt[r]!;
      if (rburn[r] && age < 60) {
        const heat = Math.max(0, 1 - age / 40);
        smoke(rx[r]!, 2, fp ? -6 : 0, 7, 30, 6, heat, 5300 + r);
        smoke(rx[r]! + 2.5, 1, fp ? -5 : 0, 4, 20, 4, heat, 5400 + r);
        if (heat > 0) put(rx[r]!, rx[r]!, 0.5, fp ? -6 : 0, K.light, heat * (0.6 + 0.2 * Math.sin(t * 8)), 0, 6, 0);
      }
      if (age < 50 && vs.length) {
        let near = vs[0]!;
        for (let j = 1; j < vs.length; j++) if (Math.abs(vs[j]!.x - rx[r]!) < Math.abs(near.x - rx[r]!)) near = vs[j]!;
        const dist = Math.abs(near.x - rx[r]!), dir = near.x > rx[r]! ? 1 : -1;
        for (let q = 0; q < 5; q++) {
          const along = age * 2.2 - q * 2.4;
          if (along < 1 || along > dist - 3) continue;
          const x = rx[r]! + dir * along;
          if (!wet(x)) put(x, x, 0, (q % 3) - 1, K.walker, t * 4 + q, dir * WT.refugee, 3.5, hs(r, q));
        }
      }
    }

    // ---- leaving ----
    let port: Village | null = null, padX = -1;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i]!;
      const pad = has(v, 'pad');
      if (pad >= 0 && (!port || eraOf(v) > eraOf(port))) { port = v; padX = pad; }
    }
    if (port) {
      const ark = eraOf(port) >= 8 || (civ.arks ?? 0) > 0;
      const LAUNCH = 300;
      const going = la < LAUNCH;
      const lt = la / LAUNCH;
      const gx = padX + (padX >= port.x ? 6 : -6);
      const gz = fp ? -8 : 0;
      if (ark) put(gx, seat(gx, 3), 0, gz, K.gantry, going ? lt : la < LAUNCH * 3 ? -1 : 0, 1, 16, 0);
      if (going) {
        const sxp = ark ? gx + 0.6 : padX + 0.8;
        const wind = f.env.wind / 100;
        if (lt < 0.6) for (let q = 0; q < 8; q++) {
          const pt = fr(t * 0.35 + q / 8);
          put(sxp + (q % 2 ? 1 : -1) * pt * (5 + q) + wind * pt * 6, sxp, 0.3 + pt * 4, gz, K.puff, pt * 0.9 + lt * 0.1, 1, (ark ? 3.5 : 2.2) * (0.6 + pt * 1.6), q * 0.37);
        }
        // The light that rises and goes to join the others in the sky.
        const up = Math.max(0, lt - (ark ? 0.1 : 0.2));
        if (up > 0) {
          const alt = (ark ? 12 : 6) + up * up * 230;
          const bright = Math.min(1, 1.25 - up * 0.6);
          put(sxp + up * up * 40 * (hs(f.seed, 31) > 0.5 ? 1 : -1), sxp, alt, gz, K.light, bright, 1, (ark ? 9 : 6) * (1 - up * 0.45), 0);
        }
      }
    }
  };

  // The six groups share one set of state: viewport, scissor, blend and textures are set once per run
  // of groups, and each group then only switches program and draws.
  let open = false;
  let vx = 0, vy = 0, vw = 1, vh = 1;
  const begin = (f: LifeFrame) => {
    const sxp = core.canvas.width / Math.max(1, core.width()), syp = core.canvas.height / Math.max(1, core.height());
    vx = Math.round(f.rect.x * sxp); vw = Math.round(f.rect.w * sxp); vh = Math.round(f.rect.h * syp);
    vy = Math.round(core.canvas.height - (f.rect.y + f.rect.h) * syp);
    if (f.fp && f.fp.tw) { vx = 0; vy = 0; vw = f.fp.tw; vh = f.fp.th!; }
    gl.viewport(vx, vy, vw, vh);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(vx, vy, vw, vh);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, f.fp ? f.fp.depth : f.pal);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, f.pal);
    open = true;
  };
  const end = () => {
    if (!open) return;
    open = false;
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
  };
  const flush = (f: LifeFrame, g: number) => {
    const G = groups[g]!;
    if (!G.n) return;
    if (!open) begin(f);
    const loc = G.loc;
    gl.useProgram(G.prog);
    gl.uniform1i(loc.u_mode!, f.fp ? 1 : 0);
    if (f.fp) { gl.uniform4f(loc.u_cam!, f.fp.yaw, f.fp.pitch, vw / vh, 0); gl.uniform3f(loc.u_ro!, f.fp.ro[0], f.fp.ro[1], f.fp.ro[2]); }
    else gl.uniform4f(loc.u_cam!, f.view.cx, f.view.cy, f.view.zoom, 0);
    gl.uniform2f(loc.u_grid!, f.W, f.H);
    gl.uniform1f(loc.u_time!, f.time % 10000);
    gl.uniform1f(loc.u_amb!, f.amb);
    gl.uniform1f(loc.u_night!, f.night);
    gl.uniform1f(loc.u_zoom!, f.fp ? 40 : f.view.zoom);
    gl.uniform1f(loc.u_wind!, f.env.wind / 100);
    gl.uniform4f(loc.u_vp!, vx, vy, vw, vh);
    gl.uniform1i(loc.u_pal!, 0);
    gl.uniform1i(loc.u_depth!, 1);
    gl.bindVertexArray(G.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, G.data, 0, G.n * 8);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, G.n);
  };
  const front = (f: LifeFrame) => { flush(f, 5); flush(f, 3); flush(f, 4); flush(f, 1); flush(f, 0); };

  return {
    /** Place everything, and draw what stands behind the buildings (each village's skyline). */
    back: (f: LifeFrame) => {
      F = f;
      for (let g = 0; g < groups.length; g++) groups[g]!.n = 0;
      track();
      place();
      F = null;
      flush(f, 2);
      // In first person there is no sprite layer of buildings to stand between: draw the rest at once.
      if (f.fp) front(f);
      end();
    },
    /** Draw the rest, over the buildings and under the people. */
    front: (f: LifeFrame) => { if (!f.fp) { front(f); end(); } },
  };
};
export type Story = ReturnType<typeof createStory>;
