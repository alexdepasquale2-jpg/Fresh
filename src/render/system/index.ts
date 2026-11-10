// Solar-system renderer (unit 14): the star and what it is doing, a companion sun,
// natural belts and a debris disc, the habitable band, smooth orbits (resonant ones
// beat), planets shaded by biome and form with a lit side, their natural moons and
// rings, a rogue world on a leaning path, a long comet, placed pieces, what
// civilisations launched, and the drag ghost. One fragment shader; draw() allocates nothing.
import type { SystemRendererFactory, SystemRenderView, GlCore } from '@/contracts/render';
import type { SkyPieceKind, SkyState } from '@/contracts/sky';
import type { SystemSpec } from '@/contracts/system';
import { FULLSCREEN_VS, hexToRgb } from '@/render/gl';
import { FX_ONE } from '@/core/fixed';
import { seedToHex, seedToU32, child } from '@/core/hash';

export const systemLayout = (w: number) => ({ cx: w / 2, cy: 250, ring: (i: number) => 52 + i * 34 });
const KIND_ID: Record<SkyPieceKind, number> = { comet: 1, moon: 2, belt: 3, sun: 4, rings: 5, dust: 6 };
const BIOME_RGB: Record<string, readonly [number, number, number]> = { ash: [0.62, 0.6, 0.64], salt: [0.96, 0.93, 0.84], moss: [0.5, 0.82, 0.5], tallow: [0.97, 0.8, 0.48], glass: [0.58, 0.86, 0.97] };
const FORM_ID: Record<string, number> = { continents: 0, archipelago: 1, pangaea: 2, canyon: 3, crater: 4, iceshell: 5, highlands: 6, ocean: 7 };
const STATE_ID: Record<string, number> = { steady: 0, variable: 1, flare: 2, dying: 3, remnant: 4 };
// Star colour by kind: cool end, hot end (the same family the planet skies use).
const STAR_RGB: Record<string, readonly [number, number, number, number, number, number]> = {
  dwarf: [1, 0.42, 0.26, 1, 0.62, 0.38], giant: [1, 0.58, 0.3, 1, 0.8, 0.52], pulsar: [0.7, 0.82, 1, 0.86, 0.9, 1], main: [1, 0.86, 0.6, 0.86, 0.93, 1],
};
const KIND_SIZE: Record<string, number> = { dwarf: 0.7, giant: 1.25, pulsar: 0.4, main: 1 };
const TAU = Math.PI * 2;
/** The orrery's frame: the clear band of the system screen round the star (below the star's name, above the ORRERY row). */
const FRAME_R = 118;
/** With a rect in the view the layout is always worked out for this width, so a system looks the same in any window. */
const RECT_W = 390;

const FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform vec2 u_res, u_c; uniform float u_rings[4]; uniform int u_n, u_sel, u_hover;
uniform vec3 u_planet[4]; uniform vec4 u_piece[16]; uniform vec3 u_ghost;
uniform vec3 u_bg, u_line, u_ink, u_gold, u_glow; uniform float u_pulse, u_flare; uniform vec3 u_touch; uniform float u_built[4]; uniform vec2 u_align; uniform float u_time;
uniform vec4 u_star; uniform vec3 u_starCol;
uniform vec4 u_comp; uniform vec3 u_compCol;
uniform vec3 u_belt[2]; uniform vec3 u_disc; uniform vec2 u_hz; uniform float u_reso[4];
uniform vec3 u_pcol[4]; uniform vec4 u_psea[4]; uniform vec4 u_pinfo[4];
uniform vec4 u_moon[12];
uniform vec4 u_rogue; uniform vec4 u_rogueAt; uniform vec3 u_rogueCol;
uniform vec4 u_cpath; uniform vec4 u_comet;
uniform vec3 u_fit;    // x scale that fits the whole system in its frame, y radius (layout px) past which nothing but the star's glow and the comet is drawn, z 0 at the lowest quality
uniform ivec2 u_cnt;   // moon slots and piece slots in use
const vec3 MOONC[6] = vec3[6](vec3(0.93, 0.92, 0.86), vec3(0.8, 0.78, 0.72), vec3(0.95, 0.82, 0.62), vec3(0.72, 0.84, 0.92), vec3(0.9, 0.66, 0.56), vec3(0.74, 0.9, 0.78));
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
// Distance in px to an axis-aligned ellipse with radii ab, centred on the origin (first order).
float ell(vec2 q, vec2 ab){ vec2 k = q / ab; float e = length(k); float g = length(k / ab) / max(e, 0.0001); return abs(e - 1.0) / max(g, 0.0001); }
void main(){
  vec2 fs = vec2(v_uv.x * u_res.x, (1.0 - v_uv.y) * u_res.y);
  vec3 col = u_bg;
  // Far stars.
  float sh = h21(floor(fs / 3.0));
  if (sh > 0.9965) col += u_line * (0.4 + 0.3 * sin(u_time * (0.6 + sh * 2.0) + sh * 40.0));
  // Everything below is laid out in its own px and scaled about the star so the widest system fits its frame.
  vec2 fc = u_c + (fs - u_c) / u_fit.x;
  vec2 rc = fc - u_c;
  float d = length(rc);
  float ang = atan(rc.y, rc.x);
  bool near = d < u_fit.y;
  if (near) {
  // The habitable band: a faint wash where the star's warmth is kind.
  if (u_hz.y > 0.0) col += u_glow * 0.05 * smoothstep(u_hz.x - 8.0, u_hz.x + 2.0, d) * smoothstep(u_hz.y + 8.0, u_hz.y - 2.0, d);
  // Debris disc: a broad pale band of dust beyond the last world.
  if (u_disc.z > 0.0) {
    float t = (d - u_disc.x) / (u_disc.y - u_disc.x);
    col += mix(u_gold, u_line, 0.5) * smoothstep(0.0, 0.3, t) * smoothstep(1.0, 0.45, t) * u_disc.z * (0.07 + 0.16 * vn(vec2(ang * 7.0 + u_time * 0.008, d * 0.3)));
  }
  }
  // The star.
  float sr = u_star.x;
  vec3 sc = u_starCol;
  int state = int(u_star.y + 0.5);
  col += sc * smoothstep(sr, 0.0, d) * 1.2 + sc * exp(-d * 0.03) * 0.15;
  if (d < sr * 2.2) col += sc * smoothstep(sr * 2.2, sr, d) * pow(abs(sin(ang * 6.0 + u_pulse * 3.0)), 12.0) * 0.25;
  col += u_gold * smoothstep(90.0, 0.0, d) * 0.1 * (0.4 + sr / 26.0);
  if (state == 3) { // dying: it sheds itself in slow shells
    for (int k = 0; k < 2; k++) { float s = fract(u_time * 0.03 + float(k) * 0.5); col += sc * smoothstep(4.0, 0.0, abs(d - sr - s * 30.0)) * (1.0 - s) * 0.24; }
  } else if (state == 4) { // remnant: a hard white core inside the ring of what it threw off
    col += sc * smoothstep(5.0, 0.0, abs(d - 27.0 - 5.0 * vn(vec2(ang * 3.0, 1.0)))) * 0.2 * (0.4 + vn(vec2(ang * 7.0, u_time * 0.04)));
    col += vec3(1.0) * smoothstep(3.0, 0.5, d) * 0.7;
  }
  if (u_star.w > 0.01 && d < sr * 3.4) col += sc * u_star.w * pow(abs(sin(ang * 2.5 + 1.3)), 22.0) * smoothstep(sr * 3.4, sr * 0.8, d);
  if (u_star.z > -5.0 && d < 175.0) col += sc * pow(abs(cos(ang - u_star.z)), 240.0) * smoothstep(175.0, 6.0, d) * 0.6;
  if (near) {
  // Companion sun, and the road a far one keeps.
  if (u_comp.z > 0.0) {
    if (u_comp.w > 0.0) col = mix(col, u_compCol, smoothstep(1.0, 0.0, abs(d - u_comp.w)) * 0.3 * step(0.5, fract(ang * 3.8)));
    vec2 cr = fc - u_comp.xy; float cd = length(cr);
    col += u_compCol * (smoothstep(u_comp.z, 0.0, cd) * 1.3 + exp(-cd * 0.1) * 0.25);
    col += u_compCol * smoothstep(u_comp.z * 2.4, u_comp.z, cd) * pow(abs(sin(atan(cr.y, cr.x) * 4.0 - u_pulse * 3.0)), 10.0) * 0.22;
  }
  // Natural belts: grains of stone tumbling in a band.
  for (int b = 0; b < 2; b++) {
    vec3 B = u_belt[b];
    float off = d - B.x;
    if (B.y <= 0.0 || abs(off) > B.z + 2.0) continue;
    if (u_fit.z < 0.5) { col += u_gold * smoothstep(B.z, B.z * 0.3, abs(off)) * (0.045 + 0.1) * B.y; continue; }
    float a2 = (ang + u_time * 0.012 * (b == 0 ? 1.0 : -0.7)) * B.x / 3.2;
    float hh = h21(vec2(floor(a2), floor(off / 2.6)) + float(b) * 17.0);
    float env = smoothstep(B.z, B.z * 0.3, abs(off));
    col += mix(u_gold, u_ink, hh) * step(1.0 - 0.2 - 0.25 * B.y, hh) * smoothstep(0.45, 0.1, length(vec2(fract(a2), fract(off / 2.6)) - 0.5)) * env * 0.85;
    col += u_gold * env * 0.045 * B.y;
  }
  // The player's orbits. Resonant ones are drawn in beats.
  for (int i = 0; i < 4; i++) {
    if (i >= u_n) break;
    bool hov = i == u_hover;
    vec3 lc = hov ? u_glow : (i == u_sel ? u_glow * 0.7 : u_line);
    float w = (hov ? 2.2 : 1.2) / max(u_fit.x, 0.6);
    float beat = (u_reso[i] > 0.5 && !hov) ? 0.45 + 0.55 * step(0.22, fract(ang * u_reso[i] * 0.955 + u_time * 0.02)) : 1.0;
    col = mix(col, lc, smoothstep(w, 0.0, abs(d - u_rings[i])) * beat);
  }
  // The rogue's leaning road and the comet's long one.
  if (u_rogue.w > 0.5) {
    float cs = cos(u_rogue.z), sn = sin(u_rogue.z); vec2 q = vec2(rc.x * cs + rc.y * sn, rc.y * cs - rc.x * sn);
    col = mix(col, u_rogueCol, smoothstep(1.2, 0.0, ell(q, u_rogue.xy)) * 0.45 * step(0.45, fract(atan(q.y, q.x) * 2.3)));
  }
  }
  if (u_comet.w > 0.5) {
    float cs = cos(u_cpath.z), sn = sin(u_cpath.z); vec2 q = vec2(rc.x * cs + rc.y * sn, rc.y * cs - rc.x * sn) + vec2(u_cpath.w, 0.0);
    col = mix(col, u_glow, smoothstep(1.0, 0.0, ell(q, u_cpath.xy)) * 0.14);
  }
  if (near) {
  // Worlds: a lit side to the star, a face from biome and form, rings where they were born with them.
  for (int i = 0; i < 4; i++) {
    if (i >= u_n) break;
    vec3 P = u_planet[i]; vec2 rel = fc - P.xy; float pd = length(rel);
    if (pd > P.z * 2.6 + 3.0) continue;
    vec4 info = u_pinfo[i];
    vec2 l = normalize(u_c - P.xy);
    float rb = 0.0;
    if (info.y > 0.5) {
      float rr = length(vec2(rel.x, rel.y * 2.7));
      rb = smoothstep(P.z * 2.35, P.z * 2.15, rr) * smoothstep(P.z * 1.3, P.z * 1.5, rr) * (0.6 + 0.4 * sin(rr * 2.6)) * 0.85;
      col = mix(col, mix(u_pcol[i], u_ink, 0.55), rb);
    }
    float m = smoothstep(P.z, P.z - 1.2, pd);
    if (m > 0.0) {
      vec2 n2 = rel / P.z; float z = sqrt(max(0.0, 1.0 - dot(n2, n2)));
      vec2 sp = n2 * (1.3 - 0.5 * z) * 2.2 + vec2(info.z * 37.0 + (info.w > 0.5 ? 0.0 : u_time * 0.06), info.z * 11.0);
      int form = int(info.x + 0.5);
      vec4 S = u_psea[i];
      vec3 land = u_pcol[i] * (0.78 + 0.44 * vn(sp * 3.0 + 9.0));
      vec3 surf = mix(land, S.rgb, step(vn(sp * (form == 1 ? 2.4 : form == 2 ? 0.7 : 1.1)), S.a));
      if (form == 3) surf *= 0.55 + 0.45 * smoothstep(0.0, 0.14, abs(fract(sp.y * 1.3 + vn(sp * 0.8) * 1.5) - 0.5));
      else if (form == 4) { vec2 cg = floor(sp * 1.6); surf *= 0.55 + 0.45 * smoothstep(0.1, 0.3, length(fract(sp * 1.6) - 0.5 - (vec2(h21(cg), h21(cg + 7.0)) - 0.5) * 0.4)); }
      else if (form == 5) surf = mix(vec3(0.9, 0.95, 1.0), S.rgb, smoothstep(0.07, 0.0, abs(vn(sp * 1.7) - 0.5)) * 0.85);
      else if (form == 6) surf = mix(surf, vec3(1.0), smoothstep(0.62, 0.8, vn(sp * 1.9 + 3.0)) * 0.5);
      float facing = dot(n2, l);
      if (info.w > 0.5) surf = mix(mix(surf, vec3(0.92, 0.96, 1.0), 0.75), mix(surf, u_gold, 0.45), smoothstep(-0.25, 0.3, facing));
      float lit = smoothstep(-0.55, 0.75, facing + z * 0.35);
      col = mix(col, surf * (0.15 + 0.95 * lit) + u_starCol * lit * lit * lit * 0.12, m);
    }
    if (rb > 0.0 && rel.y > 0.0) col = mix(col, mix(u_pcol[i], u_ink, 0.55), rb);
    if (i == u_sel) col = mix(col, u_glow, smoothstep(1.5, 0.0, abs(pd - P.z - 3.0)) * 0.9);
  }
  // Moons the worlds were born with.
  for (int j = 0; j < 12; j++) {
    if (j >= u_cnt.x) break;
    vec4 M = u_moon[j];
    if (M.w < 0.5) continue;
    vec2 r = fc - M.xy; float md = length(r);
    if (md > M.z + 1.0) continue;
    float lit = smoothstep(-0.6, 0.6, dot(r / M.z, normalize(u_c - M.xy)));
    col = mix(col, MOONC[int(M.w - 0.5)] * (0.2 + 0.8 * lit), smoothstep(M.z, M.z - 0.9, md));
  }
  // The rogue world itself, and the comet with its tail blown away from the star.
  if (u_rogue.w > 0.5) {
    vec2 r = fc - u_rogueAt.xy; float rd = length(r);
    if (rd < u_rogueAt.z + 1.0) {
      vec2 n2 = r / u_rogueAt.z;
      float lit = smoothstep(-0.55, 0.75, dot(n2, normalize(u_c - u_rogueAt.xy)));
      col = mix(col, u_rogueCol * (0.55 + 0.45 * vn(n2 * 3.0 + 4.0)) * (0.14 + 0.9 * lit), smoothstep(u_rogueAt.z, u_rogueAt.z - 1.0, rd));
    }
  }
  }
  if (u_comet.w > 0.5) {
    vec2 r = fc - u_comet.xy; float pd = length(r); vec2 away = normalize(u_comet.xy - u_c); float al = dot(r, away); float ac = length(r - away * al);
    col += mix(u_glow, vec3(0.8, 0.95, 1.0), 0.5) * (smoothstep(3.2, 1.2, pd) + exp(-pd * 0.5) * 0.5 + smoothstep(0.0, 2.0, al) * smoothstep(u_comet.z, 0.0, al) * smoothstep(1.5 + al * 0.16, 0.0, ac) * 0.75);
  }
  if (near) {
  // What each world has put into orbit: small lights circling it, blinking on the pulse.
  for (int i = 0; i < 4; i++) {
    if (i >= u_n) break;
    if (u_built[i] < 0.5 || length(fc - u_planet[i].xy) > u_planet[i].z + 20.0) continue;
    for (int j = 0; j < 8; j++) {
      if (float(j) >= u_built[i]) break;
      float a = u_time * (0.9 + float(j) * 0.23) * (mod(float(j), 2.0) < 0.5 ? 1.0 : -1.0) + float(j) * 1.05 + float(i);
      vec2 op = u_planet[i].xy + (u_planet[i].z + 5.0 + float(j) * 1.4) * vec2(cos(a), sin(a) * 0.6);
      col += u_glow * smoothstep(2.2, 0.3, length(fc - op)) * (0.7 + 0.3 * sin(u_pulse * 6.2831 + float(j)));
    }
  }
  // Alignment: a line of light from the star through the worlds as their orbits lock together.
  if (u_align.x > 0.02) {
    vec2 dir = vec2(cos(u_align.y), sin(u_align.y));
    float along = dot(rc, dir), perp = abs(dot(rc, vec2(-dir.y, dir.x)));
    col += mix(u_gold, u_glow, 0.5) * u_align.x * u_align.x * step(0.0, along) * smoothstep(190.0, 20.0, along) * (smoothstep(1.6, 0.0, perp) * 0.8 + smoothstep(14.0, 0.0, perp) * 0.12 * (0.6 + 0.4 * sin(u_pulse * 6.2831)));
  }
  // Pieces the player hung.
  for (int i = 0; i < 16; i++) {
    if (i >= u_cnt.y) break;
    vec4 p = u_piece[i];
    if (p.w < 0.5) continue;
    vec2 r = fc - p.xy; float pd = length(r);
    if (pd > 24.0) continue;
    int k = int(p.z + 0.5);
    if (k == 1) { // comet: head and a tail pointing away from the star
      vec2 away = normalize(p.xy - u_c); float al = dot(r, away); float ac = length(r - away * al);
      col = mix(col, u_glow, clamp(smoothstep(2.6, 1.4, pd) + smoothstep(0.0, 2.0, al) * smoothstep(16.0, 0.0, al) * smoothstep(1.2 + al * 0.12, 0.0, ac) * 0.7, 0.0, 1.0));
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
  }
  if (u_flare > 0.0) col += u_gold * u_flare * 0.35 * exp(-d * 0.006);
  if (u_touch.z > 0.0) { float tr = (1.0 - u_touch.z) * 46.0; col = mix(col, u_glow, smoothstep(2.0, 0.0, abs(length(fc - u_touch.xy) - tr)) * u_touch.z); }
  if (u_ghost.z > 0.5) col = mix(col, u_glow, smoothstep(9.0, 7.0, length(fc - u_ghost.xy)) * 0.8);
  o = vec4(col, 1.0);
}`;

const UNIFORMS = ['u_res', 'u_c', 'u_rings', 'u_n', 'u_sel', 'u_hover', 'u_planet', 'u_piece', 'u_ghost', 'u_bg', 'u_line', 'u_ink', 'u_gold', 'u_glow', 'u_pulse', 'u_flare', 'u_touch', 'u_built', 'u_align', 'u_time',
  'u_star', 'u_starCol', 'u_comp', 'u_compCol', 'u_belt', 'u_disc', 'u_hz', 'u_reso', 'u_pcol', 'u_psea', 'u_pinfo', 'u_moon', 'u_rogue', 'u_rogueAt', 'u_rogueCol', 'u_cpath', 'u_comet', 'u_fit', 'u_cnt'] as const;

export const factory: SystemRendererFactory = () => {
  let core: GlCore | null = null;
  let prog: WebGLProgram | null = null;
  const loc: Record<string, WebGLUniformLocation | null> = {};
  const rings = new Float32Array(4);
  const planets = new Float32Array(12);
  const pieces = new Float32Array(64);
  const ringR = new Float32Array(4);
  const built = new Float32Array(4);
  const moons = new Float32Array(48);
  let n = 0;
  // ---- everything that only changes with the system or the palette, packed once ----
  let cachedSystem: SystemSpec | null = null;
  let cachedPalette: readonly string[] | null = null;
  let cachedW = 0;
  const keys: string[] = ['', '', '', ''];
  const pal = new Float32Array(15); // bg, line, ink, gold, glow
  const starCol = new Float32Array(3);
  const compCol = new Float32Array(3);
  const rogueCol = new Float32Array(3);
  const belts = new Float32Array(6);
  const disc = new Float32Array(3);
  const hz = new Float32Array(2);
  const reso = new Float32Array(4);
  const pcol = new Float32Array(12);
  const psea = new Float32Array(16);
  const pinfo = new Float32Array(16);
  const prad = new Float32Array(4);
  const moonSpec = new Float32Array(36); // per planet, 3 x (radius px, look + 1, turns)
  const S = { starR: 20, state: 0, pulsar: false, compR: 0, compOrbit: 0, compPeriod: 1, compClose: false, rogueA: 0, rogueB: 0, roguePhi: 0, roguePeriod: 1, roguePhase: 0, rogueR: 4, cometA: 0, cometB: 0, cometE: 0, cometAxis: 0, cometPeriod: 1, cometPhase: 0, fit: 1, far: 192, ext: 132 };
  // Where the star is and how layout px map to screen px, as last drawn. orbitAt reads the same numbers.
  const cur = { cx: 0, cy: 250, fit: 1, set: false };

  const build = () => {
    prog = core!.program(FULLSCREEN_VS, FS);
    for (const k of UNIFORMS) loc[k] = core!.gl.getUniformLocation(prog, k);
  };
  const pack = (v: SystemRenderView, w: number) => {
    const sys = v.system;
    const L = systemLayout(w);
    const p = v.universe.palette;
    [p[0]!, p[3]!, p[8]!, p[7]!, p[10]!].forEach((hex, i) => {
      const [r, g, b] = hexToRgb(hex);
      pal.set([r / 255, g / 255, b / 255], i * 3);
    });
    const u = (label: string) => seedToU32(child(sys.seed, label)) / 0x100000000;
    const st = sys.star;
    const state = sys.starState ?? 'steady';
    const heat = st.heat / 255;
    const k = STAR_RGB[st.kind] ?? STAR_RGB.main!;
    // Half the universe's own light (glow to gold by heat), half the star's kind.
    for (let c = 0; c < 3; c++) {
      let x = k[c]! + (k[c + 3]! - k[c]!) * heat;
      if (state === 'dying') x += ([1, 0.36, 0.2][c]! - x) * 0.45;
      else if (state === 'remnant' && st.kind !== 'pulsar') x += ([0.92, 0.94, 1][c]! - x) * 0.7;
      starCol[c] = (pal[12 + c]! + (pal[9 + c]! - pal[12 + c]!) * heat) * 0.45 + x * 0.55;
    }
    const comp = sys.companion;
    S.state = STATE_ID[state] ?? 0;
    S.pulsar = st.kind === 'pulsar';
    S.starR = (16 + heat * 12) * (KIND_SIZE[st.kind] ?? 1) * (state === 'dying' ? 1.2 : state === 'remnant' && !S.pulsar ? 0.55 : 1);
    if (comp?.close) S.starR = Math.min(S.starR, 21);
    const nOrb = sys.orbits.length;
    const last = L.ring(nOrb - 1);
    S.compR = 0;
    if (comp) {
      const ck = STAR_RGB[comp.kind] ?? STAR_RGB.main!;
      for (let c = 0; c < 3; c++) compCol[c] = ck[c]! + (ck[c + 3]! - ck[c]!) * (comp.heat / 255);
      S.compClose = comp.close;
      S.compR = (comp.close ? 7 : 6) * (0.75 + (KIND_SIZE[comp.kind] ?? 1) * 0.35);
      S.compOrbit = comp.close ? Math.min(40, S.starR + 12) : Math.min(w / 2 - 12, Math.max(last + 52, 150));
      S.compPeriod = comp.periodTicks;
    }
    belts.fill(0);
    (sys.belts ?? []).slice(0, 2).forEach((b, i) => belts.set([b.after < 0 ? L.ring(0) - 15 : L.ring(Math.min(b.after, nOrb - 1)) + 17, b.density / 255, 3.5 + (b.density / 255) * 3], i * 3));
    disc.fill(0);
    if (sys.disc) {
      const inner = last + (sys.belts?.some((b) => b.after === nOrb - 1) ? 30 : 20);
      disc.set([inner, inner + 44, 0.45 + (sys.disc.density / 255) * 0.55]);
    }
    hz.fill(0);
    let h0 = -1, h1 = -1;
    sys.orbits.forEach((o, i) => { if (o.habitable) { if (h0 < 0) h0 = i; h1 = i; } });
    if (h0 >= 0) hz.set([L.ring(h0) - 13, L.ring(h1) + 13]);
    reso.fill(0);
    pinfo.fill(0);
    moonSpec.fill(0);
    const water = v.universe.materialTable.find((m) => m.name === 'water');
    const sea = hexToRgb(p[water?.color ?? 5] ?? p[5]!);
    sys.orbits.forEach((o, i) => {
      const q = sys.planets[o.planet]!;
      const t = q.terrain;
      keys[i] = seedToHex(q.seed);
      reso[i] = o.resonance ? o.resonance[0] : 0;
      const base = BIOME_RGB[t.biome] ?? BIOME_RGB.ash!;
      pcol.set(base, i * 3);
      const form = t.form ?? 'continents';
      const dry = (t.biome === 'glass' || t.biome === 'ash') && t.seaLevel < 70;
      const share = form === 'iceshell' ? 0 : dry ? 0.16 : form === 'ocean' ? 0.74 : form === 'pangaea' ? 0.42 : 0.3 + (t.seaLevel / 255) * 0.34;
      if (form === 'iceshell') psea.set([0.42, 0.74, 0.9, share], i * 4);
      else if (dry) psea.set([base[0] * 0.5, base[1] * 0.45, base[2] * 0.5, share], i * 4);
      else psea.set([sea[0] / 255, sea[1] / 255, sea[2] / 255, share], i * 4);
      pinfo.set([FORM_ID[form] ?? 0, q.sky?.rings ? 1 : 0, seedToU32(q.seed) / 0x100000000, t.locked ? 1 : 0], i * 4);
      prad[i] = 5.5 + ((t.gravity ?? 128) / 255) * 3.5;
      (q.sky?.moons ?? []).slice(0, 3).forEach((m, j) => moonSpec.set([1.3 + (m.size / 255) * 1.3, m.look + 1, m.turns], i * 9 + j * 3));
    });
    for (let i = nOrb; i < 4; i++) keys[i] = '';
    const rogue = sys.rogue;
    S.rogueA = 0;
    if (rogue) {
      S.rogueA = Math.min(w / 2 - 10, Math.max(last + 26, 120 + (rogue.stretch / 255) * 50));
      S.rogueB = Math.max(46, S.rogueA * Math.cos((Math.abs(rogue.tilt) * Math.PI) / 180));
      S.roguePhi = u('rogue-road') * Math.PI * (rogue.tilt < 0 ? -1 : 1);
      S.roguePeriod = rogue.periodTicks;
      S.roguePhase = u('rogue-phase') * TAU;
      const rb = BIOME_RGB[rogue.biome] ?? BIOME_RGB.ash!;
      rogueCol.set([rb[0] * 0.65 + 0.2, rb[1] * 0.65 + 0.17, rb[2] * 0.65 + 0.21]);
    }
    const comet = sys.comet;
    S.cometA = 0;
    if (comet) {
      S.cometE = 0.8;
      S.cometA = 165;
      S.cometB = S.cometA * Math.sqrt(1 - S.cometE * S.cometE);
      S.cometAxis = (comet.axis * Math.PI) / 180;
      S.cometPeriod = comet.periodTicks;
      S.cometPhase = comet.phase / 255;
    }
    // How far out anything reaches (the comet's long road aside, which is meant to leave), and the scale that fits it.
    let ext = last + 30;
    for (let i = 0; i < 2; i++) if (belts[i * 3 + 1]! > 0) ext = Math.max(ext, belts[i * 3]! + belts[i * 3 + 2]! + 3);
    if (disc[2]! > 0) ext = Math.max(ext, disc[1]! + 2);
    if (S.compR > 0) ext = Math.max(ext, S.compOrbit + S.compR * 2.4);
    if (S.rogueA > 0) ext = Math.max(ext, S.rogueA + S.rogueR + 3);
    S.ext = ext;
    S.fit = Math.min(1, Math.min(w / 2 - 6, FRAME_R) / ext);
    S.far = Math.max(ext + 30, 192);
    cachedSystem = sys;
    cachedPalette = p;
    cachedW = w;
  };
  const skyFor = (skies: readonly SkyState[], key: string): SkyState | null => {
    for (let i = 0; i < skies.length; i++) if (skies[i]!.planetKey === key) return skies[i]!;
    return null;
  };
  return {
    init: (c) => {
      core = c;
      build();
      c.onRestore(build);
    },
    orbitAt: (x, y) => {
      if (!core) return -1;
      if (!cur.set) { const L = systemLayout(core.width()); cur.cx = L.cx; cur.cy = L.cy; cur.fit = S.fit; }
      // Layout px: the same scale the shader draws with. The reach is 16 screen px, less where the rings sit closer than that.
      const d = Math.hypot(x - cur.cx, y - cur.cy) / cur.fit;
      const reach = Math.min(16 / cur.fit, 17);
      let best = -1, bd = reach;
      for (let i = 0; i < n; i++) { const e = Math.abs(d - ringR[i]!); if (e <= bd) { bd = e; best = i; } }
      return best;
    },
    draw: (v) => {
      if (!core || !prog || core.lost()) return;
      const gl = core.gl;
      const R = v.rect;
      const w = R ? RECT_W : core.width();
      if (v.system !== cachedSystem || v.universe.palette !== cachedPalette || w !== cachedW) pack(v, w);
      // Phone: the fixed spot and the fit that never grows. With a rect: the star at its middle (plus the pan), the widest thing at its nearer edge (times the zoom).
      const cx = R ? R.x + R.w / 2 + (v.pan?.x ?? 0) : w / 2, cy = R ? R.y + R.h / 2 + (v.pan?.y ?? 0) : 250;
      const fitK = R ? (Math.max(40, Math.min(R.w, R.h) / 2 - 10) / S.ext) * Math.max(0.25, Math.min(12, v.zoom ?? 1)) : S.fit;
      cur.cx = cx; cur.cy = cy; cur.fit = fitK; cur.set = true;
      const orbits = v.system.orbits;
      n = orbits.length;
      const tick = v.tick;
      const time = (tick / 20) % 10000;
      pieces.fill(0);
      moons.fill(0);
      built.fill(0);
      let pc = 0, mc = 0;
      const k = Math.max(0, Math.min(1, v.align ?? 0));
      const p0 = orbits[0]!.periodTicks * 2;
      const shared = ((tick % p0) / p0) * TAU;
      for (let i = 0; i < n; i++) {
        const o = orbits[i]!;
        const sky = skyFor(v.skies, keys[i]!);
        const r = 52 + i * 34 + (sky?.drift ?? 0) * 6;
        rings[i] = r;
        ringR[i] = r;
        const own = ((tick % o.periodTicks) / o.periodTicks) * TAU + i * 1.7;
        // Aligned worlds share one angle and one period.
        const a = own * (1 - k) + shared * k;
        built[i] = Math.min(8, sky?.built ?? 0);
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        const pr = prad[i]!;
        planets[i * 3] = px; planets[i * 3 + 1] = py; planets[i * 3 + 2] = pr;
        let nm = 0;
        for (let j = 0; j < 3; j++) {
          const mr = moonSpec[i * 9 + j * 3]!;
          if (mr <= 0) break;
          const ma = time * 0.11 * moonSpec[i * 9 + j * 3 + 2]! + j * 2.1 + i;
          const mo = pr + 4.5 + j * 3.4;
          const at = (i * 3 + j) * 4;
          moons[at] = px + Math.cos(ma) * mo; moons[at + 1] = py + Math.sin(ma) * mo * 0.8; moons[at + 2] = mr; moons[at + 3] = moonSpec[i * 9 + j * 3 + 1]!;
          nm++;
          mc = i * 3 + j + 1;
        }
        if (sky) {
          const pr2 = Math.max(14, pr + 6 + nm * 3.4);
          for (let j = 0; j < sky.pieces.length && pc < 16; j++, pc++) {
            const pa = a + (j + 1) * 0.5 + (tick / 40) * (j % 2 ? 1 : -1) * 0.05;
            pieces[pc * 4] = px + Math.cos(pa) * pr2; pieces[pc * 4 + 1] = py + Math.sin(pa) * pr2; pieces[pc * 4 + 2] = KIND_ID[sky.pieces[j]!]; pieces[pc * 4 + 3] = 1;
          }
        }
      }
      // The star now: its slow breath, a variable's swell, a flare star's fits, a pulsar's beam.
      const pulse = v.pulse / FX_ONE;
      const fit = S.state === 2 ? Math.min(1, Math.max(0, Math.sin(time * 0.31) + Math.sin(time * 0.73 + 1) - 1.3) * 2.5) : 0;
      const sr = S.starR * (S.state === 1 ? 1 + 0.24 * Math.sin(time * 0.7) : 1) + 2.5 * Math.sin(pulse * TAU) * (S.pulsar ? 0.3 : 1) + (v.flare ?? 0) * 40 + fit * 7;
      gl.useProgram(prog);
      gl.uniform2f(loc.u_res!, core.width(), core.height());
      gl.uniform2f(loc.u_c!, cx, cy);
      gl.uniform1fv(loc.u_rings!, rings);
      gl.uniform1i(loc.u_n!, n);
      gl.uniform1i(loc.u_sel!, v.selectedOrbit);
      gl.uniform1i(loc.u_hover!, v.drag?.overOrbit ?? -1);
      gl.uniform3fv(loc.u_planet!, planets);
      gl.uniform4fv(loc.u_piece!, pieces);
      gl.uniform3f(loc.u_ghost!, v.drag ? cx + (v.drag.x - cx) / fitK : 0, v.drag ? cy + (v.drag.y - cy) / fitK : 0, v.drag ? 1 : 0);
      gl.uniform3f(loc.u_fit!, fitK, S.far, (v.quality ?? 1) < 0.52 ? 0 : 1);
      gl.uniform2i(loc.u_cnt!, mc, pc);
      gl.uniform3f(loc.u_bg!, pal[0]!, pal[1]!, pal[2]!);
      gl.uniform3f(loc.u_line!, pal[3]!, pal[4]!, pal[5]!);
      gl.uniform3f(loc.u_ink!, pal[6]!, pal[7]!, pal[8]!);
      gl.uniform3f(loc.u_gold!, pal[9]!, pal[10]!, pal[11]!);
      gl.uniform3f(loc.u_glow!, pal[12]!, pal[13]!, pal[14]!);
      gl.uniform1f(loc.u_pulse!, pulse);
      gl.uniform1f(loc.u_flare!, v.flare ?? 0);
      gl.uniform1fv(loc.u_built!, built);
      gl.uniform2f(loc.u_align!, k, shared);
      gl.uniform1f(loc.u_time!, time);
      gl.uniform3f(loc.u_touch!, v.touch ? cx + (v.touch.x - cx) / fitK : 0, v.touch ? cy + (v.touch.y - cy) / fitK : 0, v.touch ? 1 - v.touch.age : 0);
      gl.uniform4f(loc.u_star!, sr, S.state, S.pulsar ? (time * 2.4) % TAU : -9, fit + (S.state === 2 ? 0.12 : 0));
      gl.uniform3fv(loc.u_starCol!, starCol);
      if (S.compR > 0) {
        const ca = (tick / S.compPeriod) * TAU + 0.6;
        gl.uniform4f(loc.u_comp!, cx + Math.cos(ca) * S.compOrbit, cy + Math.sin(ca) * S.compOrbit, S.compR, S.compClose ? 0 : S.compOrbit);
      } else gl.uniform4f(loc.u_comp!, 0, 0, 0, 0);
      gl.uniform3fv(loc.u_compCol!, compCol);
      gl.uniform3fv(loc.u_belt!, belts);
      gl.uniform3fv(loc.u_disc!, disc);
      gl.uniform2fv(loc.u_hz!, hz);
      gl.uniform1fv(loc.u_reso!, reso);
      gl.uniform3fv(loc.u_pcol!, pcol);
      gl.uniform4fv(loc.u_psea!, psea);
      gl.uniform4fv(loc.u_pinfo!, pinfo);
      gl.uniform4fv(loc.u_moon!, moons);
      if (S.rogueA > 0) {
        // It runs the wrong way round.
        const ra = S.roguePhase - (tick / S.roguePeriod) * TAU;
        const ex = Math.cos(ra) * S.rogueA, ey = Math.sin(ra) * S.rogueB, cs = Math.cos(S.roguePhi), sn = Math.sin(S.roguePhi);
        gl.uniform4f(loc.u_rogue!, S.rogueA, S.rogueB, S.roguePhi, 1);
        gl.uniform4f(loc.u_rogueAt!, cx + ex * cs - ey * sn, cy + ex * sn + ey * cs, S.rogueR, 0);
      } else gl.uniform4f(loc.u_rogue!, 1, 1, 0, 0);
      gl.uniform3fv(loc.u_rogueCol!, rogueCol);
      if (S.cometA > 0) {
        // Kepler: fast past the star, slow and far for most of its years.
        const M = (((tick / S.cometPeriod + S.cometPhase) % 1) - 0.5) * TAU;
        let E = M + S.cometE * Math.sin(M);
        for (let it = 0; it < 6; it++) E -= (E - S.cometE * Math.sin(E) - M) / (1 - S.cometE * Math.cos(E));
        const ex = S.cometA * (Math.cos(E) - S.cometE), ey = S.cometB * Math.sin(E), cs = Math.cos(S.cometAxis), sn = Math.sin(S.cometAxis);
        const far = Math.hypot(ex, ey);
        gl.uniform4f(loc.u_cpath!, S.cometA, S.cometB, S.cometAxis, S.cometA * S.cometE);
        gl.uniform4f(loc.u_comet!, cx + ex * cs - ey * sn, cy + ex * sn + ey * cs, Math.max(8, Math.min(64, 3200 / far)), 1);
      } else {
        gl.uniform4f(loc.u_cpath!, 1, 1, 0, 0);
        gl.uniform4f(loc.u_comet!, 0, 0, 0, 0);
      }
      core.quad(prog);
    },
    dispose: () => {
      core = null;
      cachedSystem = null;
      cur.set = false;
    },
  };
};
