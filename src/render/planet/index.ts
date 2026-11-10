// Planet renderer (unit 15). One fragment shader composes:
// sky (day/night, dusk, stars, suns, moons, rings, comet, belt, wind-blown fbm clouds, dust haze,
// lightning), materials (per-cell grain, rock strata, water depth + shimmer, seasonal moss,
// emissive fire, ice sparkle, heat glow and frost from the temperature field, depth darkness)
// and a CPU-written overlay (houses, windows lit at night, chimney smoke, bell towers,
// bonfires, walking people with lamps, rain and snow), with village light halos on the pulse.
import type { PlanetRendererFactory, GlCore } from '@/contracts/render';
import { ENGINE, FIELD, ROLE } from '@/contracts/sim';
import { FULLSCREEN_VS } from '@/render/gl';
import { createFirstPerson } from './first-person';
import { createPeople } from './people';
import { createStructures } from './structures';
import type { Structures } from './structures';
import type { People } from './people';
import { FX_ONE } from '@/core/fixed';
import { HEAVENS_GLSL, HEAVENS_UNIFORMS, uploadHeavens } from './heavens';

const O = { person: 1, wall: 2, roof: 3, window: 4, smoke: 5, rain: 6, snow: 7, lamp: 8, bonfire: 9, tower: 10, launch: 11, priest: 12, travel: 13, avatar: 14, attack: 15 } as const;
const KIND = { empty: 0, solid: 1, powder: 2, liquid: 3, gas: 4, fire: 5, life: 6 } as const;

const FS = `#version 300 es
precision highp float; precision highp usampler2D;
in vec2 v_uv; out vec4 o;
uniform vec2 u_res; uniform vec4 u_rect; uniform vec2 u_grid; uniform vec3 u_view;
uniform usampler2D u_cells, u_over, u_mat, u_top;
uniform sampler2D u_temp, u_hum, u_pal;
uniform float u_day, u_season, u_time, u_pulse, u_nl, u_dim, u_warm, u_dust, u_wind, u_rain, u_flash;
uniform float u_moons, u_suns, u_orb;
${HEAVENS_GLSL}
uniform vec4 u_vill[12]; uniform int u_nvill;
vec3 pal(int i){ return texelFetch(u_pal, ivec2(i & 15, 0), 0).rgb; }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.0), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
float disc(vec2 p, vec2 c, float r){ return smoothstep(r, r - 1.2, length(p - c)); }
void main(){
  vec2 fc = vec2(v_uv.x * u_res.x, (1.0 - v_uv.y) * u_res.y);
  vec2 q = (fc - u_rect.xy) / u_rect.zw;
  if (q.x < 0.0 || q.y < 0.0 || q.x >= 1.0 || q.y >= 1.0) discard;
  vec2 gp = clamp(u_view.xy + (q - 0.5) * u_grid / u_view.z, vec2(0.0), u_grid - 0.001);
  ivec2 g = ivec2(floor(gp)); vec2 gc = vec2(g) + 0.5;
  vec2 wq = gp / u_grid;           // position in the world, 0..1
  vec2 f = fract(gp);              // position inside the cell
  float det = smoothstep(1.4, 2.6, u_view.z); // sub-cell detail fades in as you zoom
  float sunUp = -cos(u_day * 6.2831853);
  float daylight = smoothstep(-0.3, 0.35, sunUp);
  float dusk = exp(-pow(sunUp * 3.5, 2.0));
  float hum = texture(u_hum, vec2(wq.x, 0.5)).r;
  float T = texture(u_temp, wq).r;
  float autumn = smoothstep(0.45, 0.6, u_season) * smoothstep(0.85, 0.7, u_season);
  float winter = smoothstep(0.62, 0.75, u_season) * smoothstep(0.98, 0.85, u_season);
  float amb = mix(0.24 + u_nl * 0.4 + u_moons * 0.08, 1.0, daylight) * (1.0 - u_dim * 0.45) * (1.0 - hum * 0.22);

  // ---------- sky ----------
  vec3 dayTop = mix(pal(12), pal(9), 0.25);
  vec3 horizon = mix(pal(9), pal(13), dusk * 0.65);
  vec3 skyDay = mix(dayTop, horizon, smoothstep(0.0, 0.65, wq.y));
  vec3 skyNight = mix(pal(0) * 0.7, pal(2), wq.y * 0.8);
  vec3 sky = mix(skyNight, skyDay, daylight) + pal(14) * dusk * 0.3 * smoothstep(0.15, 0.6, wq.y);
  sky = mix(sky, pal(14) * 0.6 + pal(7) * 0.2, u_dust * 0.55);
  // stars
  float st = h21(floor(gp * 0.7));
  float pin = mix(1.0, smoothstep(0.3, 0.05, length(fract(gp * 0.7) - 0.5)) * 2.0, det); // stars stay points up close
  if (st > 0.985) sky += pin * pal(9) * (1.0 - daylight) * (1.0 - hum) * (0.4 + 0.6 * sin(u_time * 3.0 + st * 400.0)) * (1.0 - u_dust);
  // the far dark of this system
  { float nb = fbm(gp * 0.035 + u_hv.y); sky += mix(pal(int(u_hv.x)), pal(11), fbm(gp.yx * 0.06 + 7.0)) * pow(smoothstep(0.4, 0.9, nb), 2.0) * u_hv.z * 0.3 * (1.0 - daylight) * (1.0 - hum) * (1.0 - u_dust); }
  // belt: a dusty band of glints
  if (u_arc.z > 0.01) { float by = abs(gp.y - (18.0 + sin(gp.x * 0.03) * 4.0 + (gp.x - u_grid.x * 0.5) * u_arc.w * 0.08)); sky += pal(7) * smoothstep(2.0 + u_arc.z * 2.0, 0.0, by) * (0.12 + 0.5 * step(0.95 - u_arc.z * 0.06, h21(floor(gp)))) * (0.4 + 0.6 * (1.0 - daylight)); }
  // rings: a wide arc
  if (u_arc.x > 0.01) { float ry = 34.0 + pow((gp.x - u_grid.x * 0.5) / u_grid.x, 2.0) * 120.0 + (gp.x - u_grid.x * 0.5) * u_arc.y * 0.12; float rd = abs(gp.y - ry);
    sky = mix(sky, mix(pal(8), pal(9), 0.5) * (0.5 + 0.5 * daylight + u_nl * 0.4), (smoothstep(2.6, 0.6, rd) * 0.5 + smoothstep(5.0, 3.6, rd) * smoothstep(3.4, 3.8, rd) * 0.25 + smoothstep(1.0, 0.2, abs(rd - 7.0)) * 0.3 * step(0.9, u_arc.x)) * (0.6 + 0.5 * u_arc.x)); }
  // suns: the first is this system's star
  vec2 sun0 = vec2((u_day - 0.25) * 2.0 * u_grid.x, (0.62 - sin(3.14159 * clamp((u_day - 0.25) * 2.0, 0.0, 1.0)) * 0.5) * u_grid.y);
  vec3 starCol = mix(pal(9), u_star.rgb, 0.65) * (u_hv.w > 0.5 ? 0.7 + 0.5 * sin(u_time * 9.0) : 1.0);
  for (int s = 0; s < 3; s++) {
    if (float(s) >= 1.0 + u_suns) break;
    float ph = u_day - 0.25 + float(s) * 0.07;
    vec2 sp = vec2(ph * 2.0 * u_grid.x, (0.62 - sin(3.14159 * clamp(ph * 2.0, 0.0, 1.0)) * 0.5) * u_grid.y);
    float d = length(gp - sp);
    float sr = s == 0 ? u_star.w : 0.8;
    sky += (s == 0 ? starCol : pal(13)) * (smoothstep(5.5 * sr, 4.0 * sr, d) * 1.2 + exp(-d * 0.12 / sr) * 0.25) * step(0.0, ph) * step(ph, 0.5);
  }
  // every body in this sky
  for (int m = 0; m < 8; m++) {
    if (m >= u_nb) break;
    vec4 A = u_bA[m], B = u_bB[m];
    float k = mod(B.w, 10.0);
    bool inner = k > 1.5 && k < 2.5;
    float ph = inner ? fract(u_day - 0.25 + A.w * sin((u_season * A.y + A.z) * 6.2831853)) : fract(u_day + A.z + u_season * A.y);
    vec2 mp = vec2(ph * 2.0 * u_grid.x, (0.6 - sin(3.14159 * clamp(ph * 2.0, 0.0, 1.0)) * 0.45 + (inner ? 0.02 : A.w * 0.12)) * u_grid.y);
    float up = step(ph, 0.5);
    vec2 rel = gp - mp;
    if (k < 0.5) {
      float md = disc(gp, mp, 3.2 * A.x);
      float shade = smoothstep(-1.4 * A.x, 1.4 * A.x, rel.x * sign(sun0.x - mp.x + 0.01));
      vec3 face = B.rgb * (0.85 + 0.15 * noise(rel * 0.9 + A.z * 9.0));
      sky = mix(sky, mix(face * 0.12 + sky * 0.5, face, shade), md * up);
    } else if (k < 2.5) {
      float vis = up * (1.0 - daylight * 0.85);
      sky += B.rgb * (disc(gp, mp, 1.1 * A.x) * 1.5 + exp(-length(rel) * 1.3 / A.x) * 0.45) * vis;
      if (B.w > 9.5) sky += B.rgb * smoothstep(0.7, 0.15, abs(rel.y - rel.x * 0.3)) * step(abs(rel.x), 3.0 * A.x) * 0.7 * vis;
    } else {
      float w = smoothstep(0.1, 0.6, sin((u_season + A.z) * 6.2831853)) * up;
      vec2 td = normalize(mp - sun0 + vec2(0.01, -0.01)); float along = dot(rel, td); float across = abs(dot(rel, vec2(-td.y, td.x)));
      sky += B.rgb * (disc(gp, mp, 1.8 * A.x) + smoothstep(0.0, 1.0, along) * smoothstep(36.0 * A.x, 0.0, along) * smoothstep(1.4 + along * 0.08, 0.0, across) * 0.6) * w * (1.0 - daylight * 0.7);
    }
  }
  // what they launched: small lights crossing the sky in a line
  for (int j = 0; j < 8; j++) { if (float(j) >= u_orb) break; float ox = fract(u_time * 0.012 + float(j) * 0.13); vec2 op = vec2(ox * u_grid.x, 22.0 + sin(ox * 3.14159) * -12.0 + float(j));
    sky += pal(10) * smoothstep(1.3, 0.2, length(gp - op)) * (0.8 + 0.4 * sin(u_pulse * 6.2831 + float(j))); }
  // clouds driven by humidity, pushed by the wind
  float cn = fbm(vec2(gp.x * 0.045 - u_time * u_wind * 0.02, gp.y * 0.11 + u_time * 0.01));
  float cloud = smoothstep(0.42, 0.75, cn + hum * 1.3 - 0.3) * smoothstep(0.6, 0.05, wq.y);
  vec3 cloudCol = mix(pal(2), pal(9), daylight * 0.85) * (1.0 - hum * 0.45) + pal(14) * dusk * 0.25;
  sky = mix(sky, cloudCol, cloud * 0.9);
  sky += pal(9) * u_flash * (0.6 + cloud);

  // ---------- surface ----------
  uint m = texelFetch(u_cells, g, 0).r;
  bool blade = false;
  if (det > 0.0) {
    // Higher resolution from the same cells: round the corners where two neighbours agree
    // (so slopes and droplets are smooth, not stair-stepped)...
    ivec2 sgn = ivec2(f.x < 0.5 ? -1 : 1, f.y < 0.5 ? -1 : 1);
    ivec2 gmax = ivec2(u_grid) - 1;
    uint mh = texelFetch(u_cells, clamp(g + ivec2(sgn.x, 0), ivec2(0), gmax), 0).r;
    uint mv = texelFetch(u_cells, clamp(g + ivec2(0, sgn.y), ivec2(0), gmax), 0).r;
    vec2 c = abs(f - 0.5);
    if (c.x + c.y > 1.0 - 0.38 * det && mh == mv && mh != m && (m == 0u || mh == 0u)) m = mh;
    // ...and grow blades of moss up into the air above it.
    if (m == 0u) {
      uint mb = texelFetch(u_cells, clamp(g + ivec2(0, 1), ivec2(0), gmax), 0).r;
      if (mb != 0u && texelFetch(u_mat, ivec2(int(mb), 0), 0).g == 6u) {
        float bx = floor(gp.x * 5.0);
        float hgt = (0.2 + 0.6 * h21(vec2(bx, float(g.y)))) * det;
        float sway = sin(u_time * 1.5 + bx) * 0.08 * (1.0 - f.y);
        if (1.0 - f.y < hgt && fract(gp.x * 5.0 + sway) < 0.55) { m = mb; blade = true; }
      }
    }
  }
  vec3 col = sky;
  float emissive = 0.0;
  float topY = float(texelFetch(u_top, ivec2(g.x, 0), 0).r);
  if (m == 0u && float(g.y) > topY) {
    // A cave: dark air, faint damp sheen near the walls.
    col = pal(0) * (0.7 + 0.3 * noise(gp * 0.3)) + pal(2) * 0.15 * amb;
  }
  if (m != 0u) {
    uvec2 mk = texelFetch(u_mat, ivec2(int(m), 0), 0).rg;
    int slot = int(mk.r); uint kind = mk.g;
    float depth = float(g.y) - float(texelFetch(u_top, ivec2(g.x, 0), 0).r);
    vec3 base = pal(slot);
    float n = h21(vec2(g));
    float fine = h21(floor(gp * 4.0)) - 0.5; // 4x4 grains per cell, visible when zoomed
    float det2 = smoothstep(8.0, 11.0, u_view.z), det3 = smoothstep(20.0, 26.0, u_view.z);
    fine += det2 * (h21(floor(gp * 16.0)) - 0.5) * 0.8 + det3 * (noise(gp * 70.0) - 0.5) * 0.9;   // pebbles, then the grain of the grains
    if (kind <= 2u && det2 > 0.0) base *= 1.0 - det2 * 0.35 * smoothstep(0.18, 0.1, length(fract(gp * 3.0 + h21(floor(gp * 3.0)) * 0.6) - 0.5)) * step(0.7, h21(floor(gp * 3.0) + 3.0));
    if (kind == 1u) { base *= 0.82 + 0.18 * noise(vec2(g) * vec2(0.18, 0.9)) + 0.12 * n; base *= 1.0 + det * (fine * 0.16 - 0.3 * step(0.8, noise(gp * vec2(2.3, 3.1)) * noise(gp.yx * 1.7 + 9.0) * 2.2)); } // strata, cracks
    else if (kind == 2u) base *= 0.85 + 0.3 * n + det * fine * 0.4;                              // grains
    else if (kind == 3u) {                                                                       // water
      base = mix(base, pal(12) * 0.6, clamp(depth / 45.0, 0.0, 0.85));
      base = mix(base, sky, 0.18 * smoothstep(3.0, 0.0, depth));
      base += pal(9) * 0.18 * smoothstep(1.5, 0.0, depth) * (0.5 + 0.5 * sin(gp.x * 0.9 + u_time * 2.5 + sin(gp.x * 0.13) * 3.0));
      base += pal(10) * 0.05 * step(0.8, noise(gp * 0.4 + u_time * 0.6)) * smoothstep(20.0, 2.0, depth);
      base += pal(9) * det * 0.07 * sin(gp.y * 9.0 + sin(gp.x * 2.0 + u_time * 1.7) * 2.0) * smoothstep(12.0, 0.0, depth);
    }
    else if (kind == 4u) base = mix(base, pal(9), 0.3);
    else if (kind == 5u) { base = mix(pal(13), pal(9), noise(gp * mix(0.6, 2.5, det) + vec2(0.0, u_time * 5.0))); emissive = 1.0; }
    else if (kind == 6u) { base *= 0.8 + 0.35 * n + det * fine * 0.3; if (blade) base *= 1.15; base = mix(base, pal(14), autumn * 0.55); base = mix(base, pal(9) * 0.8, winter * 0.3 * step(depth, 1.5)); }
    if (m == ${ENGINE.ice.id}u) { base = mix(pal(9), pal(10), 0.4 + 0.2 * n) * (0.9 + 0.2 * step(0.97, h21(vec2(g) + floor(u_time * 2.0)))); }
    if (m == ${ENGINE.ore.id}u) { base = mix(pal(7), pal(9), step(0.85, n)); }
    float lit = kind == 3u ? 1.0 : clamp(1.0 - max(depth - 3.0, 0.0) / 70.0, 0.35, 1.0);
    col = emissive > 0.5 ? base * 1.25 : base * amb * lit;
    float hot = smoothstep(0.76, 0.95, T);
    col += pal(13) * hot * 0.4 * (0.7 + 0.3 * sin(u_time * 4.0 + gp.x));
    float cold = smoothstep(0.42, 0.33, T);
    col = mix(col, pal(9) * amb, cold * 0.28);
  }
  // ---------- overlay ----------
  uint ov = texelFetch(u_over, g, 0).r;
  if (det > 0.5 && (ov == 1u || ov == 8u || ov == 12u || ov == 13u || ov == 15u)) {
    // People get a round head, a body and two legs when you are close.
    uint ob = texelFetch(u_over, clamp(g + ivec2(0, 1), ivec2(0), ivec2(u_grid) - 1), 0).r;
    bool head = ob == 1u || ob == 13u || ob == 15u;
    bool keep = head ? length(f - vec2(0.5, 0.55)) < 0.36 : (abs(f.x - 0.5) < 0.28 && (f.y < 0.55 || abs(abs(f.x - 0.5) - 0.17) < 0.11));
    if (!keep) ov = 0u;
  }
  if (ov != 0u) {
    float night = 1.0 - daylight;
    if (ov == 1u || ov == 13u) col = mix(pal(8), pal(5), float(g.y & 1)) * (0.35 + 0.65 * amb);
    else if (ov == 12u) col = mix(pal(9), pal(10), 0.4) * (0.5 + 0.5 * amb);
    else if (ov == 8u) { col = pal(10) * 1.3; emissive = 1.0; }
    else if (ov == 2u) col = pal(5) * 1.1 * amb * (1.0 - det * 0.3 * max(step(0.88, fract(gp.y * 2.0)), step(0.9, fract(gp.x * 1.5 + floor(gp.y * 2.0) * 0.5))));
    else if (ov == 3u) col = pal(14) * 1.15 * amb * (1.0 - det * 0.3 * step(0.7, fract(gp.x * 3.0 + gp.y * 3.0)));
    else if (ov == 4u) { col = mix(pal(2) * amb, pal(13) * 1.3, smoothstep(0.2, 0.8, night)); if (det > 0.5 && (max(abs(f.x - 0.5), abs(f.y - 0.5)) > 0.34 || abs(f.x - 0.5) < 0.05)) col = pal(5) * 0.9 * amb; }
    else if (ov == 5u) col = mix(col, pal(9) * (0.4 + 0.6 * amb), 0.4);
    else if (ov == 6u) col = mix(col, pal(9), 0.28 + 0.2 * amb);
    else if (ov == 7u) col = pal(9) * (0.6 + 0.4 * amb);
    else if (ov == 9u) { col = mix(pal(13), pal(9), noise(vec2(gp.x, u_time * 8.0))); emissive = 1.0; }
    else if (ov == 10u) col = pal(3) * 1.3 * amb;
    else if (ov == 11u) { col = pal(10) * 2.0; emissive = 1.0; }
    else if (ov == 14u) { col = mix(pal(9), pal(10), 0.5 + 0.5 * sin(u_time * 6.0)) * 1.6; emissive = 1.0; }
    else if (ov == 15u) col = mix(pal(13), pal(14), float(g.y & 1)) * (0.5 + 0.5 * amb);
  }
  // village light halos at night, breathing with the pulse
  float glow = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= u_nvill) break;
    vec4 v = u_vill[i];
    float d = length(gp - v.xy);
    glow += v.w * exp(-d * d / (v.z * v.z));
  }
  col += pal(13) * glow * (1.0 - daylight * 0.9) * (0.8 + 0.2 * sin(u_pulse * 6.2831853)) * 0.55;
  // vignette inside the frame
  vec2 e = min(q, 1.0 - q); col *= 0.82 + 0.18 * smoothstep(0.0, 0.08, min(e.x, e.y));
  o = vec4(col, 1.0);
}`;

export const factory: PlanetRendererFactory = () => {
  let core: GlCore | null = null;
  let prog: WebGLProgram | null = null;
  const loc: Record<string, WebGLUniformLocation | null> = {};
  const tex: Record<string, WebGLTexture | null> = {};
  let W = 0, H = 0, FWd = 0, FHd = 0;
  let over = new Uint8Array(0);
  let top = new Uint8Array(0);
  const mat = new Uint8Array(512);
  const vill = new Float32Array(48);
  let matKey = '';
  let lastTick = -1;
  let time = 0;
  let flash = 0;
  let fp: ReturnType<typeof createFirstPerson> | null = null;
  let people: People | null = null;
  let structures: Structures | null = null;
  const fract = (n: number) => n - Math.floor(n);
  let lastLightning = 9999;

  const makeTex = (w: number, h: number, internal: number, format: number, linear: boolean) => {
    const gl = core!.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, null);
    return t;
  };
  const upload = (t: WebGLTexture, w: number, h: number, format: number, data: Uint8Array) => {
    const gl = core!.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, format, gl.UNSIGNED_BYTE, data);
  };
  const build = () => {
    const gl = core!.gl;
    prog = core!.program(FULLSCREEN_VS, FS);
    for (const k of ['u_res', 'u_rect', 'u_grid', 'u_view', 'u_cells', 'u_over', 'u_mat', 'u_top', 'u_temp', 'u_hum', 'u_pal', 'u_day', 'u_season', 'u_time', 'u_pulse', 'u_nl', 'u_dim', 'u_warm', 'u_dust', 'u_wind', 'u_rain', 'u_flash', 'u_moons', 'u_suns', 'u_orb', 'u_vill', 'u_nvill', ...HEAVENS_UNIFORMS]) loc[k] = gl.getUniformLocation(prog, k);
    W = H = 0;
    matKey = '';
    fp = null;
    people = null;
    structures = null;
  };
  const put = (x: number, y: number, code: number) => {
    if (x >= 0 && y >= 0 && x < W && y < H) over[y * W + x] = code;
  };

  return {
    init: (c) => {
      core = c;
      build();
      c.onRestore(build);
    },
    draw: (v, dt) => {
      if (!core || !prog || core.lost()) return;
      const gl = core.gl;
      const g = v.grid;
      const env = v.env;
      time += dt / 1000;
      if (W !== g.width || H !== g.height || FWd !== env.fieldW || FHd !== env.fieldH || !tex.cells) {
        W = g.width; H = g.height; FWd = env.fieldW; FHd = env.fieldH;
        over = new Uint8Array(W * H);
        top = new Uint8Array(W);
        tex.cells = makeTex(W, H, gl.R8UI, gl.RED_INTEGER, false);
        tex.over = makeTex(W, H, gl.R8UI, gl.RED_INTEGER, false);
        tex.top = makeTex(W, 1, gl.R8UI, gl.RED_INTEGER, false);
        tex.mat = makeTex(256, 1, gl.RG8UI, gl.RG_INTEGER, false);
        tex.temp = makeTex(FWd, FHd, gl.R8, gl.RED, true);
        tex.hum = makeTex(FWd, 1, gl.R8, gl.RED, true);
        lastTick = -1;
        matKey = '';
      }
      if (matKey !== v.universe.serial) {
        matKey = v.universe.serial;
        mat.fill(0);
        for (const m of v.universe.materialTable) { mat[m.id * 2] = m.color; mat[m.id * 2 + 1] = KIND[m.kind]; }
        const eng: [number, number, number][] = [[ENGINE.ice.id, ENGINE.ice.color, 1], [ENGINE.snow.id, ENGINE.snow.color, 2], [ENGINE.ore.id, ENGINE.ore.color, 1], [ENGINE.fire.id, ENGINE.fire.color, 5], [ENGINE.ash.id, ENGINE.ash.color, 2]];
        for (const [id, c, k] of eng) { mat[id * 2] = c; mat[id * 2 + 1] = k; }
        upload(tex.mat!, 256, 1, gl.RG_INTEGER, mat);
        tex.pal = core.paletteTexture(v.universe.palette);
      }
      const tickNow = env.day + env.season * 1000;
      if (tickNow !== lastTick) {
        lastTick = tickNow;
        // Ground starts at the first run of 4 solid-ish cells. Sparks, ash, steam and
        // falling drops in the air are not ground, so the air under them is not a cave.
        const airy = (c: number) => c === 0 || c === 5 || c === ENGINE.fire.id;
        for (let x = 0; x < W; x++) {
          let y = 0;
          while (y < H - 4) {
            if (!airy(g.cells[y * W + x]!) && !airy(g.cells[(y + 1) * W + x]!) && !airy(g.cells[(y + 2) * W + x]!) && !airy(g.cells[(y + 3) * W + x]!)) break;
            y++;
          }
          top[x] = y;
        }
        upload(tex.cells!, W, H, gl.RED_INTEGER, g.cells as Uint8Array);
        upload(tex.top!, W, 1, gl.RED_INTEGER, top);
        upload(tex.temp!, FWd, FHd, gl.RED, env.temp as Uint8Array);
        upload(tex.hum!, FWd, 1, gl.RED, env.humidity as Uint8Array);
      }
      if (env.lightning < lastLightning) flash = 1;
      lastLightning = env.lightning;
      flash = Math.max(0, flash - dt / 250);

      people ??= createPeople(core);
      people.update(v.civ, dt);
      const sunUp = -Math.cos((env.day / 1000) * Math.PI * 2);
      const dayl = Math.max(0, Math.min(1, (sunUp + 0.3) / 0.65));
      const ambP = (0.32 + Math.max(0, v.modifiers.nightLight) / 250 + (1 - 0.32) * dayl) * (1 - Math.max(0, v.modifiers.dimming) / 220);
      if (v.view?.fp) {
        fp ??= createFirstPerson(core);
        const body = people.avatar();
        const view3 = v.view.fp;
        const cam = fp.draw({ view: v, W, H, top, matTex: tex.mat!, palTex: tex.pal!, time, flash, eyeX: body ? body.x : view3.x });
        people.draw({
          fp: { ro: cam.ro, yaw: cam.yaw, pitch: cam.pitch, depth: cam.depth,
            // Those who come for you (or to you) step out of the slice toward where you stand.
            place: (s) => {
              const near = s.role === ROLE.attack || s.role === ROLE.kneel || s.role === ROLE.watch || s.role === ROLE.listen;
              const z = near ? view3.z + (s.seed - 0.5) * 8 : s.z;
              // Nobody stands inside your head: keep them at arm's length.
              let x = s.x;
              const dx = x - cam.ro[0];
              if (near && Math.abs(dx) < 2.4) x = cam.ro[0] + (dx >= 0 ? 1 : -1) * (2.6 + fract(s.seed * 5.3) * 2.2);
              return [x, cam.ground(x, z), z];
            } },
          view: { cx: 0, cy: 0, zoom: 1 }, rect: v.rect, W, H, time, amb: ambP, night: 1 - dayl, pal: tex.pal!,
        });
        return;
      }
      // ---- overlay ----
      over.fill(0);
      const night = env.day < 230 || env.day > 770;
      let nv = 0;
      vill.fill(0);
      for (const vg of v.civ.villages) {
        const gy = top[Math.max(0, Math.min(W - 1, vg.x))]! - 1;
        if (nv < 12) {
          vill.set([vg.x, gy - 1, 6 + Math.min(14, vg.souls / 4), (night ? 1 : 0.3) * (0.5 + vg.tech * 0.15)], nv * 4);
          nv++;
        }
      }
      if (env.rain > 0) {
        const drops = Math.min(160, env.rain);
        for (let k = 0; k < drops; k++) {
          const hx = ((k * 2654435761) >>> 0) % W;
          const col = Math.min(FWd - 1, (hx / FIELD) | 0);
          if (env.humidity[col]! < 70) continue;
          const fall = env.snowing ? 12 : 70;
          const x = Math.floor(hx + ((time * env.wind) / (env.snowing ? 6 : 12)) + (env.snowing ? Math.sin(time * 2 + k) * 2 : 0));
          const xx = ((x % W) + W) % W;
          const y = Math.floor((((k * 40503) % H) + time * fall) % Math.max(1, top[xx]!));
          put(xx, y, env.snowing ? O.snow : O.rain);
          if (!env.snowing) put(xx, y - 1, O.rain);
        }
      }
      upload(tex.over!, W, H, gl.RED_INTEGER, over);

      // ---- draw ----
      core.clear(v.universe.palette[0]!);
      gl.useProgram(prog);
      const bind = (unit: number, t: WebGLTexture, name: string) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.uniform1i(loc[name]!, unit);
      };
      bind(0, tex.cells!, 'u_cells'); bind(1, tex.over!, 'u_over'); bind(2, tex.mat!, 'u_mat'); bind(3, tex.top!, 'u_top');
      bind(4, tex.temp!, 'u_temp'); bind(5, tex.hum!, 'u_hum'); bind(6, tex.pal!, 'u_pal');
      const R = v.rect;
      gl.uniform2f(loc.u_res!, core.width(), core.height());
      gl.uniform4f(loc.u_rect!, R.x, R.y, R.w, R.h);
      gl.uniform2f(loc.u_grid!, W, H);
      gl.uniform3f(loc.u_view!, v.view?.cx ?? W / 2, v.view?.cy ?? H / 2, Math.max(1, v.view?.zoom ?? 1));
      const md = v.modifiers;
      const count = (k: string) => v.sky.pieces.filter((p) => p === k).length;
      gl.uniform1f(loc.u_day!, env.day / 1000);
      gl.uniform1f(loc.u_season!, env.season / 1000);
      gl.uniform1f(loc.u_time!, time % 10000);
      gl.uniform1f(loc.u_pulse!, v.pulse / FX_ONE);
      gl.uniform1f(loc.u_nl!, Math.max(0, md.nightLight) / 100);
      gl.uniform1f(loc.u_dim!, Math.max(0, md.dimming) / 100);
      gl.uniform1f(loc.u_warm!, md.warmth / 100);
      gl.uniform1f(loc.u_dust!, Math.max(0, md.dust) / 100);
      gl.uniform1f(loc.u_wind!, env.wind / 100);
      gl.uniform1f(loc.u_rain!, env.rain / 255);
      gl.uniform1f(loc.u_flash!, flash);
      gl.uniform1f(loc.u_moons!, count('moon'));
      gl.uniform1f(loc.u_suns!, count('sun'));
      uploadHeavens(gl, loc, v);
      gl.uniform1f(loc.u_orb!, Math.min(8, v.sky.built ?? 0));
      gl.uniform4fv(loc.u_vill!, vill);
      gl.uniform1i(loc.u_nvill!, nv);
      core.quad(prog);
      const cam2 = { cx: v.view?.cx ?? W / 2, cy: v.view?.cy ?? H / 2, zoom: Math.max(1, v.view?.zoom ?? 1) };
      structures ??= createStructures(core);
      structures.draw({ civ: v.civ, top, view: cam2, rect: v.rect, W, H, time, amb: ambP, night: 1 - dayl, pulse: v.pulse / FX_ONE, pal: tex.pal! });
      people.draw({ fp: null, view: { cx: v.view?.cx ?? W / 2, cy: v.view?.cy ?? H / 2, zoom: Math.max(1, v.view?.zoom ?? 1) }, rect: v.rect, W, H, time, amb: ambP, night: 1 - dayl, pal: tex.pal! });
    },
    dispose: () => { core = null; },
  };
};
