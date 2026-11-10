// Planet renderer (unit 15). One fragment shader composes:
// sky (day/night, dusk, stars, suns, moons, rings, comet, belt, wind-blown fbm clouds, dust haze,
// lightning), materials (per-cell grain, rock strata, water depth + shimmer, seasonal moss,
// emissive fire, ice sparkle, heat glow and frost from the temperature field, depth darkness),
// weather (slanting rain, snow that settles and melts, forked lightning, dawn fog in the
// valleys, heat shimmer, smoke over hot ground, wet ground and puddles) and ground detail
// (shore foam, fish, flowers after rain, ash going green, roads worn between villages).
// Buildings, people and ambient life are instanced sprites drawn over it.
import type { PlanetRendererFactory, GlCore } from '@/contracts/render';
import { ENGINE, FIELD, ROLE } from '@/contracts/sim';
import { FULLSCREEN_VS, hexToRgb } from '@/render/gl';
import { createFirstPerson } from './first-person';
import { createPeople } from './people';
import { createStructures } from './structures';
import type { Structures } from './structures';
import type { People } from './people';
import { createLife } from './life';
import type { Life, LifeFrame } from './life';
import { createStory } from './story';
import type { Story } from './story';
import { seedToU32 } from '@/core/hash';
import type { SurfaceEnv } from '@/contracts/sim';
import type { PlanetRenderView } from '@/contracts/render';
import { FX_ONE } from '@/core/fixed';
import { HEAVENS_GLSL, HEAVENS_UNIFORMS, uploadHeavens } from './heavens';

const KIND = { empty: 0, solid: 1, powder: 2, liquid: 3, gas: 4, fire: 5, life: 6 } as const;

const FS = `#version 300 es
precision highp float; precision highp usampler2D;
in vec2 v_uv; out vec4 o;
uniform vec2 u_res; uniform vec4 u_rect; uniform vec2 u_grid; uniform vec3 u_view;
uniform usampler2D u_cells, u_mat, u_top;
uniform sampler2D u_temp, u_hum;
uniform float u_day, u_season, u_time, u_pulse, u_nl, u_dim, u_warm, u_dust, u_wind, u_rain, u_flash;
uniform float u_moons, u_suns, u_orb;
uniform vec3 u_palc[16];   // the palette, as uniforms: no fetch per colour
uniform int u_oct;         // cloud octaves, by quality (5 at full)
uniform float u_fx;        // 0 at the lowest quality: the far dark, smoke and drifting dust are not drawn
uniform vec4 u_pl;   // this planet: x 1 = tidally locked, y land form (1 canyon, 2 crater, 3 ice shell, 4 highlands), z gravity -1..1
uniform float u_wet, u_snowc, u_snowing, u_fog, u_life; uniform vec4 u_bolt; uniform vec2 u_road[6]; uniform int u_nroad;
${HEAVENS_GLSL}
uniform vec4 u_vill[12]; uniform int u_nvill;
vec3 pal(int i){ return u_palc[i & 15]; }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.0), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { if (i >= u_oct) break; s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
float disc(vec2 p, vec2 c, float r){ return smoothstep(r, r - 1.2, length(p - c)); }
void main(){
  vec2 fc = vec2(v_uv.x * u_res.x, (1.0 - v_uv.y) * u_res.y);
  vec2 q = (fc - u_rect.xy) / u_rect.zw;
  if (q.x < 0.0 || q.y < 0.0 || q.x >= 1.0 || q.y >= 1.0) discard;
  vec2 gp = clamp(u_view.xy + (q - 0.5) * u_grid / u_view.z, vec2(0.0), u_grid - 0.001);
  vec2 wq = gp / u_grid;           // position in the world, 0..1
  float T = texture(u_temp, wq).r;
  // Heat shimmer: the air over hot ground will not hold still.
  if (T > 0.74) gp.x = clamp(gp.x + sin(gp.y * 2.6 + u_time * 7.0) * 0.3 * smoothstep(0.74, 0.92, T), 0.0, u_grid.x - 0.001);
  ivec2 g = ivec2(floor(gp));
  float topY = float(texelFetch(u_top, ivec2(g.x, 0), 0).r);
  vec2 f = fract(gp);              // position inside the cell
  float det = smoothstep(1.4, 2.6, u_view.z); // sub-cell detail fades in as you zoom
  // A locked world keeps one face to its star: day is a place there, not a time, and the terminator never moves.
  float sunUp = u_pl.x > 0.5 ? (wq.x - 0.5) * 2.7 + 0.03 * sin(u_time * 0.05) : -cos(u_day * 6.2831853);
  float dayS = u_pl.x > 0.5 ? 0.665 : u_day;
  float daylight = smoothstep(-0.3, 0.35, sunUp);
  float dusk = exp(-pow(sunUp * 3.5, 2.0));
  float hum = texture(u_hum, vec2(wq.x, 0.5)).r;
  float autumn = smoothstep(0.45, 0.6, u_season) * smoothstep(0.85, 0.7, u_season);
  float winter = smoothstep(0.62, 0.75, u_season) * smoothstep(0.98, 0.85, u_season);
  float spring = smoothstep(0.0, 0.05, u_season) * smoothstep(0.3, 0.15, u_season);
  // Night is dim and blue, never black: the stars and whatever is in the sky give enough to read the ground by.
  float amb = mix(min(0.58 + u_nl * 0.35 + u_moons * 0.06 + float(u_nb) * 0.015, 0.85), 1.0, daylight) * (1.0 - u_dim * 0.45) * (1.0 - hum * 0.22);

  // ---------- sky ----------
  vec3 dayTop = mix(pal(12), pal(9), 0.25);
  vec3 horizon = mix(pal(9), pal(13), dusk * 0.65);
  vec3 skyDay = mix(dayTop, horizon, smoothstep(0.0, 0.65, wq.y));
  vec3 skyNight = mix(pal(0) * 0.7, pal(2), wq.y * 0.8);
  vec3 sky = mix(skyNight, skyDay, daylight) + pal(14) * dusk * 0.3 * smoothstep(0.15, 0.6, wq.y);
  sky = mix(sky, pal(14) * 0.6 + pal(7) * 0.2, u_dust * 0.55);
  vec2 sun0 = vec2((dayS - 0.25) * 2.0 * u_grid.x, (0.62 - sin(3.14159 * clamp((dayS - 0.25) * 2.0, 0.0, 1.0)) * 0.5) * u_grid.y);
  vec3 cloudCol = mix(pal(2), pal(9), daylight * 0.85) * (1.0 - hum * 0.45) + pal(14) * dusk * 0.25;
  // The sky is only worked out where it can be seen: in the air, and in water and puddles near the top of the ground.
  if (gp.y < topY + 4.0) {
  // stars
  float st = h21(floor(gp * 0.7));
  float pin = mix(1.0, smoothstep(0.3, 0.05, length(fract(gp * 0.7) - 0.5)) * 2.0, det); // stars stay points up close
  if (st > 0.985) sky += pin * pal(9) * (1.0 - daylight) * (1.0 - hum) * (0.4 + 0.6 * sin(u_time * 3.0 + st * 400.0)) * (1.0 - u_dust);
  // the far dark of this system
  if (u_fx > 0.5 && u_hv.z > 0.0 && daylight < 0.999) { float nb = fbm(gp * 0.035 + u_hv.y); sky += mix(pal(int(u_hv.x)), pal(11), fbm(gp.yx * 0.06 + 7.0)) * pow(smoothstep(0.4, 0.9, nb), 2.0) * u_hv.z * 0.3 * (1.0 - daylight) * (1.0 - hum) * (1.0 - u_dust); }
  // belt: a dusty band of glints
  if (u_arc.z > 0.01) { float by = abs(gp.y - (18.0 + sin(gp.x * 0.03) * 4.0 + (gp.x - u_grid.x * 0.5) * u_arc.w * 0.08)); sky += pal(7) * smoothstep(2.0 + u_arc.z * 2.0, 0.0, by) * (0.12 + 0.5 * step(0.95 - u_arc.z * 0.06, h21(floor(gp)))) * (0.4 + 0.6 * (1.0 - daylight)); }
  // rings: a wide arc
  if (u_arc.x > 0.01) { float ry = 34.0 + pow((gp.x - u_grid.x * 0.5) / u_grid.x, 2.0) * 120.0 + (gp.x - u_grid.x * 0.5) * u_arc.y * 0.12; float rd = abs(gp.y - ry);
    sky = mix(sky, mix(pal(8), pal(9), 0.5) * (0.5 + 0.5 * daylight + u_nl * 0.4), (smoothstep(2.6, 0.6, rd) * 0.5 + smoothstep(5.0, 3.6, rd) * smoothstep(3.4, 3.8, rd) * 0.25 + smoothstep(1.0, 0.2, abs(rd - 7.0)) * 0.3 * step(0.9, u_arc.x)) * (0.6 + 0.5 * u_arc.x)); }
  // suns: the first is this system's star
  vec3 starCol = mix(pal(9), u_star.rgb, 0.65) * (u_hv.w > 0.5 ? 0.7 + 0.5 * sin(u_time * 9.0) : 1.0);
  for (int s = 0; s < 3; s++) {
    if (float(s) >= 1.0 + u_suns) break;
    float ph = dayS - 0.25 + float(s) * 0.07;
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
  float cloud = 0.0;
  if (wq.y < 0.6) {
    float cn = fbm(vec2(gp.x * 0.045 - u_time * u_wind * 0.02, gp.y * 0.11 + u_time * 0.01));
    cloud = smoothstep(0.42, 0.75, cn + hum * 1.3 - 0.3) * smoothstep(0.6, 0.05, wq.y);
    sky = mix(sky, cloudCol, cloud * 0.9);
  }
  sky += pal(9) * u_flash * (0.3 + cloud * 0.6) * (0.3 + 0.7 * exp(-abs(gp.x - u_bolt.x) / 55.0));   // the flash is brightest round the bolt
  // lightning: a bolt that wanders down to where it strikes, and forks on the way
  if (u_bolt.z > 0.01 && gp.y < u_bolt.w) {
    float yy = gp.y;
    float bx = u_bolt.x + (noise(vec2(yy * 0.21, u_bolt.y)) - 0.5) * 20.0 * smoothstep(0.0, 28.0, u_bolt.w - yy) + (noise(vec2(yy * 1.3, u_bolt.y + 5.0)) - 0.5) * 2.4;
    float db = abs(gp.x - bx);
    float fy0 = u_bolt.w * (0.3 + 0.3 * fract(u_bolt.y * 0.37)), fdir = fract(u_bolt.y * 0.71) > 0.5 ? 1.0 : -1.0, fl = yy - fy0;
    float df = abs(gp.x - bx - fdir * fl * 0.6 - (noise(vec2(yy * 0.5, u_bolt.y + 9.0)) - 0.5) * 6.0 * clamp(fl / 6.0, 0.0, 1.0));
    float bolt = smoothstep(1.1, 0.25, db) + smoothstep(0.9, 0.2, df) * step(0.0, fl) * smoothstep(34.0, 10.0, fl) * 0.7;
    sky += (pal(9) * bolt * 2.4 + mix(pal(9), pal(12), 0.5) * exp(-db * 0.2) * 0.45) * u_bolt.z * smoothstep(6.0, 15.0, yy);
  }
  }

  // ---------- surface ----------
  uint m = texelFetch(u_cells, g, 0).r;
  bool blade = false; float bladeTip = 0.0;
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
        float sway = (sin(u_time * (1.5 + abs(u_wind) * 2.5) + bx) * (0.08 + abs(u_wind) * 0.14) - u_wind * 0.3) * (1.0 - f.y);
        if (1.0 - f.y < hgt && fract(gp.x * 5.0 + sway) < 0.55) { m = mb; blade = true; bladeTip = (1.0 - f.y) / hgt; }
      }
    }
  }
  vec3 col = sky;
  float emissive = 0.0;
  if (m == 0u && float(g.y) > topY) {
    // A cave: dark air, faint damp sheen near the walls.
    col = pal(0) * (0.7 + 0.3 * noise(gp * 0.3)) + pal(2) * 0.15 * amb;
  }
  if (m != 0u) {
    uvec2 mk = texelFetch(u_mat, ivec2(int(m), 0), 0).rg;
    int slot = int(mk.r); uint kind = mk.g;
    float depth = float(g.y) - topY;
    vec3 base = pal(slot);
    float n = h21(vec2(g));
    float fine = h21(floor(gp * 4.0)) - 0.5; // 4x4 grains per cell, visible when zoomed
    float det2 = smoothstep(8.0, 11.0, u_view.z), det3 = smoothstep(20.0, 26.0, u_view.z);
    if (det2 > 0.0) { fine += det2 * (h21(floor(gp * 16.0)) - 0.5) * 0.8; if (det3 > 0.0) fine += det3 * (noise(gp * 70.0) - 0.5) * 0.9; }   // pebbles, then the grain of the grains
    if (kind <= 2u && det2 > 0.0) base *= 1.0 - det2 * 0.35 * smoothstep(0.18, 0.1, length(fract(gp * 3.0 + h21(floor(gp * 3.0)) * 0.6) - 0.5)) * step(0.7, h21(floor(gp * 3.0) + 3.0));
    if (kind == 1u) { base *= 0.82 + 0.18 * noise(vec2(g) * vec2(0.18, 0.9)) + 0.12 * n; if (det > 0.0) base *= 1.0 + det * (fine * 0.16 - 0.3 * step(0.8, noise(gp * vec2(2.3, 3.1)) * noise(gp.yx * 1.7 + 9.0) * 2.2)); } // strata, cracks
    else if (kind == 2u) base *= 0.85 + 0.3 * n + det * fine * 0.4;                              // grains
    else if (kind == 3u) {                                                                       // water
      base = mix(base, pal(12) * 0.6, clamp(depth / 45.0, 0.0, 0.85));
      base = mix(base, sky, 0.18 * smoothstep(3.0, 0.0, depth));
      base += pal(9) * 0.18 * smoothstep(1.5, 0.0, depth) * (0.5 + 0.5 * sin(gp.x * 0.9 + u_time * 2.5 + sin(gp.x * 0.13) * 3.0));
      if (depth < 20.0) base += pal(10) * 0.05 * step(0.8, noise(gp * 0.4 + u_time * 0.6)) * smoothstep(20.0, 2.0, depth);
      base += pal(9) * det * 0.07 * sin(gp.y * 9.0 + sin(gp.x * 2.0 + u_time * 1.7) * 2.0) * smoothstep(12.0, 0.0, depth);
      if (depth < 1.0) {
        // Foam where the water meets a bank, and a thin bright line along the top.
        ivec2 gm = ivec2(u_grid) - 1;
        uint wl = texelFetch(u_cells, clamp(g + ivec2(-1, 0), ivec2(0), gm), 0).r, wr = texelFetch(u_cells, clamp(g + ivec2(1, 0), ivec2(0), gm), 0).r;
        uint wl2 = texelFetch(u_cells, clamp(g + ivec2(-3, 0), ivec2(0), gm), 0).r, wr2 = texelFetch(u_cells, clamp(g + ivec2(3, 0), ivec2(0), gm), 0).r;
        float shore = ((wl != m && wl != 0u) || (wr != m && wr != 0u)) ? 1.0 : (((wl2 != m && wl2 != 0u) || (wr2 != m && wr2 != 0u)) ? 0.55 : 0.0);
        base = mix(base, pal(9), clamp(shore * (0.4 + 0.35 * sin(u_time * 2.2 + gp.x * 1.3)) + det * 0.2 * step(f.y, 0.2 + 0.1 * sin(gp.x * 3.0 + u_time * 3.0)), 0.0, 0.9));
      } else if (depth < 34.0) {
        // Fish: small pale shapes that turn and catch the light.
        float row = floor(gp.y * 0.5), dirf = h21(vec2(row, 5.0)) > 0.5 ? 1.0 : -1.0;
        vec2 fq = vec2(gp.x * 0.22 + u_time * 0.3 * dirf * (0.4 + h21(vec2(row, 1.0))), gp.y * 0.5);
        vec2 fi = floor(fq), ff = fract(fq) - 0.5;
        if (h21(fi + 31.0) > 0.9) base += pal(9) * smoothstep(0.5, 0.25, length(ff * vec2(2.2, 2.4))) * (0.16 + 0.22 * pow(0.5 + 0.5 * sin(u_time * 4.0 + fi.x * 7.0 + fi.y), 4.0)) * smoothstep(34.0, 6.0, depth);
      }
    }
    else if (kind == 4u) base = mix(base, pal(9), 0.3);
    else if (kind == 5u) { base = mix(pal(13), pal(9), noise(gp * mix(0.6, 2.5, det) + vec2(0.0, u_time * 5.0))); emissive = 1.0; }
    else if (kind == 6u) { base *= 0.8 + 0.35 * n + det * fine * 0.3; if (blade) base *= 1.15; base = mix(base, pal(14), autumn * 0.55); base = mix(base, pal(9) * 0.8, winter * 0.3 * step(depth, 1.5)); }
    if (m == ${ENGINE.ice.id}u) { base = mix(pal(9), pal(10), 0.4 + 0.2 * n) * (0.9 + 0.2 * step(0.97, h21(vec2(g) + floor(u_time * 2.0)))); }
    if (m == ${ENGINE.ore.id}u) { base = mix(pal(7), pal(9), step(0.85, n)); }
    if (m == ${ENGINE.ash.id}u) {
      // Burnt ground: embers while it is hot, then green coming back through the ash.
      base *= 0.7 + 0.35 * n;
      base = mix(base, pal(int(u_life)) * 0.9, step(0.9 - hum * 0.3 - u_wet * 0.25 - spring * 0.15, h21(floor(gp * 2.0) + 11.0)) * step(depth, 2.5) * 0.85);
      base += pal(13) * 0.6 * step(0.95, h21(vec2(g) + floor(u_time * 3.0))) * smoothstep(0.6, 0.8, T);
    }
    if (kind == 6u) {
      // Flowers after rain and in spring.
      float bloom = max(u_wet, spring * 0.7) * (1.0 - winter);
      float fh = h21(vec2(floor(gp.x * (blade ? 5.0 : 1.0)), 7.0 + (blade ? 0.0 : float(g.y))));
      if (bloom > 0.05 && fh > 0.86 - bloom * 0.22 && (blade ? bladeTip > 0.62 : (depth < 1.0 && det < 0.5)))
        base = mix(base, mix(mix(pal(15), pal(13), step(0.93, fh)), pal(9), step(0.97, fh)) * 1.2, bloom * (blade ? 1.0 : 0.6));
    }
    if (kind != 3u && kind != 5u && kind != 4u) {
      // Rain darkens the ground and leaves puddles that hold the sky.
      base *= 1.0 - u_wet * 0.3 * smoothstep(7.0, 0.0, depth);
      if (depth < 1.0 && !blade) {
        float road = 0.0;
        for (int i = 0; i < 6; i++) { if (i >= u_nroad) break; road = max(road, step(u_road[i].x, gp.x) * step(gp.x, u_road[i].y)); }
        // Feet wear a path between villages that are near each other.
        if (road > 0.5 && m != ${ENGINE.ice.id}u) base = mix(base, mix(base * 0.55, pal(3), 0.45) * (0.85 + 0.15 * step(0.5, fract(gp.x * 2.0)) * det), 0.6 * (det > 0.5 ? step(f.y, 0.55) : 1.0));
        if (u_wet > 0.03 && h21(vec2(g) + 3.0) > 0.84) base = mix(base, sky * 0.55 + pal(9) * 0.3 * pow(0.5 + 0.5 * sin(u_time * 3.0 + gp.x * 2.3), 3.0), u_wet * 0.65 * (det > 0.5 ? step(f.y, 0.14) * step(abs(f.x - 0.5), 0.42) : 0.6));
        // Snow settles on the tops, and goes when it warms.
        if (u_snowc > 0.02) base = mix(base, pal(9) * (0.9 + 0.1 * n), det > 0.5 ? step(f.y, u_snowc * 0.75) * 0.95 : u_snowc * 0.8);
      }
      if (blade) base = mix(base, pal(9), u_snowc * 0.6 * step(0.5, bladeTip));
    }
    if (u_pl.y > 0.5 && kind != 3u && kind != 5u && kind != 4u) {
      // The land's own character: which way each slope faces the star, and what the ground is made of.
      int gx1 = int(u_grid.x) - 1;
      float tl = float(texelFetch(u_top, ivec2(clamp(g.x - 2, 0, gx1), 0), 0).r), tr = float(texelFetch(u_top, ivec2(clamp(g.x + 2, 0, gx1), 0), 0).r);
      float facing = clamp((tr - tl) * sign(sun0.x - gp.x + 0.01) * 0.3, -1.0, 1.0);
      float skin = smoothstep(4.0, 0.0, depth);
      if (u_pl.y < 1.5) {          // canyon: banded walls, and warm light thrown back up from the floor
        base *= 0.78 + 0.38 * step(0.5, fract(float(g.y) * 0.085 + noise(vec2(g) * vec2(0.02, 0.0)) * 1.5));
        base = mix(base, pal(14), 0.2 * smoothstep(3.0, 26.0, depth));
        base *= 1.0 + skin * facing * 0.3;
      } else if (u_pl.y < 2.5) {   // crater: rims that catch the light, and their long shadows
        base *= 1.0 + skin * facing * 0.6;
        base += pal(9) * skin * smoothstep(0.35, 1.0, facing) * 0.3 * daylight * step(depth, 1.5);
      } else if (u_pl.y < 3.5) {   // ice shell: a pale skin with a sheen that slides as the light moves, blue veins below
        base = mix(base, mix(pal(9), pal(10), 0.45), 0.34 * skin + 0.1);
        base += pal(9) * skin * pow(noise(vec2(gp.x * 0.22 - sun0.x * 0.012, gp.y * 1.4)), 5.0) * 1.8 * (0.25 + 0.75 * daylight);
        base += pal(10) * 0.14 * step(0.9, noise(gp * vec2(0.45, 0.1) + 3.0)) * smoothstep(2.0, 8.0, depth);
      } else base *= 1.0 + skin * facing * 0.35;   // highlands: hard light on the heights
    }
    float lit = kind == 3u ? 1.0 : clamp(1.0 - max(depth - 3.0, 0.0) / 70.0, max(u_pl.y > 0.5 && u_pl.y < 1.5 ? 0.55 : 0.35, 0.5 * (1.0 - daylight)), 1.0);
    col = emissive > 0.5 ? base * 1.25 : base * amb * lit * mix(vec3(0.82, 0.92, 1.2), vec3(1.0), daylight);
    float hot = smoothstep(0.76, 0.95, T);
    col += pal(13) * hot * 0.4 * (0.7 + 0.3 * sin(u_time * 4.0 + gp.x));
    float cold = smoothstep(0.42, 0.33, T);
    col = mix(col, pal(9) * amb, cold * 0.28);
    if (u_pl.x > 0.5 && kind != 3u) { col = mix(col, mix(pal(9), pal(10), 0.4) * amb, 0.22 * smoothstep(0.4, 0.08, wq.x) * smoothstep(5.0, 0.0, depth)); col += pal(13) * 0.1 * smoothstep(0.72, 1.0, wq.x) * smoothstep(5.0, 0.0, depth); }   // the frozen face, the baked face
    col += base * u_flash * 0.8 * exp(-abs(gp.x - u_bolt.x) / 60.0);   // the strike lights the ground round it
  }
  float hh = topY - gp.y;          // height above the ground, in cells
  if (m == 0u && hh > 0.0) {
    // Heavy worlds hold their air low and thick; on light ones the dust never quite comes down.
    if (u_pl.z > 0.2) col = mix(col, horizon * (0.3 + 0.7 * daylight), smoothstep(8.0, 0.0, hh) * 0.42 * u_pl.z);
    if (u_fx > 0.5 && u_pl.z < -0.2 && hh < 48.0) { vec2 dq = vec2(gp.x * 0.55 + u_time * 0.04, gp.y * 0.55 + sin(u_time * 0.2 + gp.x * 0.1) * 0.6);
      col += pal(7) * step(0.982, h21(floor(dq))) * smoothstep(0.42, 0.1, length(fract(dq) - 0.5)) * (-u_pl.z) * 0.55 * (0.3 + 0.7 * daylight) * smoothstep(48.0, 20.0, hh); }
    if (u_fx > 0.5 && hh < 20.0) {
      // Smoke and glow over anything hot enough: lava, fires, scorched ground. It leans with the wind.
      float Tb = texture(u_temp, vec2(gp.x - u_wind * hh * 0.7, topY + 1.5) / u_grid).r;
      float hotb = smoothstep(0.78, 0.95, Tb);
      if (hotb > 0.0) {
        float sm = noise(vec2(gp.x * 0.35 - u_wind * hh * 0.25, gp.y * 0.3 + u_time * 1.6)) + 0.3 * smoothstep(8.0, 0.0, hh);
        col = mix(col, mix(pal(2), pal(1), 0.5) * (0.5 + 0.5 * amb) + pal(13) * 0.55 * smoothstep(6.0, 0.0, hh), hotb * smoothstep(0.35, 0.75, sm) * smoothstep(20.0, 4.0, hh) * 0.75);
      }
    }
    if (u_rain > 0.004 && hum > 0.27) {
      float wetc = smoothstep(0.27, 0.42, hum);
      // Overcast: under the weather the whole sky goes the grey of its cloud, and thicker toward the ground.
      col = mix(col, cloudCol * mix(0.85, 0.7, u_rain), wetc * min(0.35 + u_rain * 1.2, 0.8) * (0.7 + 0.3 * smoothstep(60.0, 0.0, hh)));
      float rk = 1.0 + 2.0 * step(5.0, u_view.z) + 5.0 * step(18.0, u_view.z);
      if (u_snowing > 0.5) {
        // Snow: slow flakes that wander as they fall.
        vec2 cs = vec2(1.6, 2.2) / (1.0 + 0.5 * (rk - 1.0));
        vec2 sp = vec2(gp.x - u_wind * gp.y * 0.8 + sin(u_time * 1.3 + gp.y * 0.25) * 0.8, gp.y - u_time * 8.0) / cs;
        col = mix(col, pal(9) * (0.6 + 0.4 * amb), step(0.93 - u_rain * 0.14, h21(floor(sp))) * smoothstep(0.24, 0.1, length(fract(sp) - 0.5)) * wetc * 0.95);
      } else {
        // Rain: curtains of streaks slanting with the wind.
        float cxr = floor((gp.x - u_wind * gp.y * 0.55) * rk);
        float ph = h21(vec2(cxr, 3.0));
        float s = fract(gp.y / 18.0 - u_time * (2.6 + ph) + ph * 9.0);
        col = mix(col, mix(pal(9), pal(12), 0.3), step(1.0 - (0.16 + u_rain * 0.6) / sqrt(rk), h21(vec2(cxr, 9.0))) * smoothstep(0.3, 0.0, s) * wetc * (0.4 + 0.25 * amb));
      }
    }
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
  // Fog banks lie in the low ground at dawn.
  if (u_fog > 0.02) {
    int gx1 = int(u_grid.x) - 1;
    float tl = float(texelFetch(u_top, ivec2(clamp(g.x - 14, 0, gx1), 0), 0).r), tr = float(texelFetch(u_top, ivec2(clamp(g.x + 14, 0, gx1), 0), 0).r);
    float valley = clamp((topY - 0.5 * (tl + tr)) * 0.22 + 0.55, 0.0, 1.0);
    float fogd = u_fog * valley * smoothstep(15.0, 0.5, hh) * smoothstep(-3.0, 0.5, hh) * (0.6 + 0.4 * noise(vec2(gp.x * 0.07 - u_time * 0.03, gp.y * 0.22)));
    col = mix(col, mix(pal(9), pal(12), 0.15) * (0.45 + 0.6 * daylight), clamp(fogd * 1.25, 0.0, 0.9));
  }
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
  let top = new Uint8Array(0);
  let colKind = new Uint8Array(0);     // material kind lying on top of each column
  const roads = new Float32Array(12);
  const vx = new Float32Array(12);
  // Weather as the eye keeps it: eased, so rain leaves the ground wet and snow lies a while.
  const wx = { wet: 0, snow: 0, fog: 0, dry: 0, hum: 0, bolt: 0, boltX: 0, boltSeed: 0, day: -1, seed: 1, leaf: 15 };
  let life: Life | null = null;
  let story: Story | null = null;
  // The planet's own character, read once when the planet changes.
  const pl = { ref: undefined as unknown, locked: false, form: 0, grav: 0, seed: 0 };
  const FORMS = ['', 'canyon', 'crater', 'iceshell', 'highlands'];
  // On a locked world the hour is a place: these stand in for env and the view where things are lit by the hour.
  const lockEnv = {} as { -readonly [K in keyof SurfaceEnv]: SurfaceEnv[K] };
  const lockView = {} as { -readonly [K in keyof PlanetRenderView]: PlanetRenderView[K] };
  // Frame records, reused so draw() allocates nothing.
  const mapCam = { cx: 0, cy: 0, zoom: 1 };
  const fpCam: NonNullable<LifeFrame['fp']> = { ro: [0, 0, 0], yaw: 0, pitch: 0, depth: null as unknown as WebGLTexture, ground: () => 0 };
  const lifeFrame = { fp: null, view: mapCam, rect: { x: 0, y: 0, w: 1, h: 1 }, W: 0, H: 0, seed: 1, day: 0, time: 0, dt: 0, snow: 0, dry: 0, leaf: 15, amb: 1, night: 0 } as unknown as LifeFrame;
  const structFrame = { view: mapCam, wind: 0, season: 0, snow: 0 } as unknown as Parameters<Structures['draw']>[0];
  const peopleFrame = { fp: null, view: mapCam } as unknown as Parameters<People['draw']>[0];
  const mat = new Uint8Array(512);
  const palF = new Float32Array(48);   // the palette as floats, for the shaders that take it as uniforms
  // First-person records, reused every frame.
  const fpArgs = { view: null, W: 0, H: 0, top: null, matTex: null, palTex: null, palF, time: 0, flash: 0, eyeX: 0, wet: 0, snow: 0, fog: 0, bolt: 0, boltX: 0, boltSeed: 0 } as unknown as Parameters<ReturnType<typeof createFirstPerson>['draw']>[0];
  type PeopleFp = NonNullable<Parameters<People['draw']>[0]['fp']>;
  const placeOut: [number, number, number] = [0, 0, 0];
  let placeZ = 0;
  // Those who come for you (or to you) step out of the slice toward where you stand.
  const placeFn: PeopleFp['place'] = (s) => {
    const near = s.role === ROLE.attack || s.role === ROLE.kneel || s.role === ROLE.watch || s.role === ROLE.listen;
    const z = near ? placeZ + (s.seed - 0.5) * 8 : s.z;
    // Nobody stands inside your head: keep them at arm's length.
    let x = s.x;
    const dx = x - fpCam.ro[0];
    if (near && Math.abs(dx) < 2.4) x = fpCam.ro[0] + (dx >= 0 ? 1 : -1) * (2.6 + fract(s.seed * 5.3) * 2.2);
    placeOut[0] = x; placeOut[1] = fpCam.ground(x, z); placeOut[2] = z;
    return placeOut;
  };
  const peopleFp: PeopleFp = { ro: [0, 0, 0], yaw: 0, pitch: 0, depth: null as unknown as WebGLTexture, place: placeFn, tw: 0, th: 0, far: 260 };
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
    for (const k of ['u_res', 'u_rect', 'u_grid', 'u_view', 'u_cells', 'u_mat', 'u_top', 'u_temp', 'u_hum', 'u_day', 'u_season', 'u_time', 'u_pulse', 'u_nl', 'u_dim', 'u_warm', 'u_dust', 'u_wind', 'u_rain', 'u_flash', 'u_moons', 'u_suns', 'u_orb', 'u_palc', 'u_oct', 'u_fx', 'u_pl', 'u_vill', 'u_nvill', 'u_wet', 'u_snowc', 'u_snowing', 'u_fog', 'u_life', 'u_bolt', 'u_road', 'u_nroad', ...HEAVENS_UNIFORMS]) loc[k] = gl.getUniformLocation(prog, k);
    W = H = 0;
    matKey = '';
    fp = null;
    people = null;
    structures = null;
    life = null;
    story = null;
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
        top = new Uint8Array(W);
        colKind = new Uint8Array(W);
        // A new size replaces the old textures; free them so switching worlds does not leak GPU memory.
        for (const k of ['cells', 'top', 'mat', 'temp', 'hum'] as const) { const old = tex[k]; if (old) gl.deleteTexture(old); }
        tex.cells = makeTex(W, H, gl.R8UI, gl.RED_INTEGER, false);
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
        if (tex.pal) gl.deleteTexture(tex.pal);
        tex.pal = core.paletteTexture(v.universe.palette);
        for (let i = 0; i < 16; i++) { const c = hexToRgb(v.universe.palette[i] ?? '#000000'); palF[i * 3] = c[0] / 255; palF[i * 3 + 1] = c[1] / 255; palF[i * 3 + 2] = c[2] / 255; }
        let h = 2166136261;
        for (let i = 0; i < matKey.length; i++) h = Math.imul(h ^ matKey.charCodeAt(i), 16777619);
        wx.seed = h >>> 0;
        wx.leaf = 15;
        for (const m of v.universe.materialTable) if (m.kind === 'life') { wx.leaf = m.color; break; }
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
          colKind[x] = mat[g.cells[y * W + x]! * 2 + 1]!;
        }
        let hs = 0;
        for (let i = 0; i < env.humidity.length; i++) hs += env.humidity[i]!;
        wx.hum = hs / (Math.max(1, env.humidity.length) * 255);
        upload(tex.cells!, W, H, gl.RED_INTEGER, g.cells as Uint8Array);
        upload(tex.top!, W, 1, gl.RED_INTEGER, top);
        upload(tex.temp!, FWd, FHd, gl.RED, env.temp as Uint8Array);
        upload(tex.hum!, FWd, 1, gl.RED, env.humidity as Uint8Array);
      }
      // Decay first, in small steps, so a strike is always drawn at full strength even on a slow frame.
      flash = Math.max(0, flash - Math.min(dt, 50) / 250);
      wx.bolt = Math.max(0, wx.bolt - Math.min(dt, 50) / 320);
      if (env.lightning < lastLightning) {
        // The bolt comes down out of the wettest of the cloud.
        flash = 1; wx.bolt = 1;
        let best = 0;
        for (let i = 1; i < env.humidity.length; i++) if (env.humidity[i]! > env.humidity[best]!) best = i;
        wx.boltSeed = (env.day * 7 + env.season * 13 + best * 3) % 97;
        wx.boltX = Math.max(4, Math.min(W - 5, best * FIELD + 2 + ((wx.boltSeed * 37) % 9) - 4));
      }
      lastLightning = env.lightning;
      {
        const rain = env.snowing ? 0 : Math.min(1, (env.rain / 255) * 2.5);
        wx.wet += (rain - wx.wet) * Math.min(1, dt * (rain > wx.wet ? 0.0012 : 0.00009));
        const winter = env.season > 660 && env.season < 980;
        const lie = env.snowing ? 1 : 0;
        wx.snow += (lie - wx.snow) * Math.min(1, dt * (lie > wx.snow ? 0.0005 : winter ? 0.00004 : 0.0002));
        const dawn = Math.exp(-(((env.day - 262) / 60) ** 2));
        const fog = Math.min(1, dawn * (0.45 + wx.hum * 1.4)) * (1 - Math.min(1, env.rain / 120));
        wx.fog += (fog - wx.fog) * Math.min(1, dt * 0.002);
        const dry = Math.max(0, Math.min(1, (Math.abs(env.wind) - 30) / 30)) * Math.max(0, Math.min(1, (0.32 - wx.hum) / 0.14 + Math.max(0, v.modifiers.dust) / 60)) * (env.rain > 0 ? 0 : 1);
        wx.dry += (dry - wx.dry) * Math.min(1, dt * 0.002);
        // The day, eased, so things that move by it move smoothly between sim ticks.
        if (wx.day < 0) wx.day = env.day;
        const dd = ((env.day - wx.day + 1500) % 1000) - 500;
        wx.day = (wx.day + dd * Math.min(1, dt * 0.012) + 1000) % 1000;
      }

      // Build at most one layer's programs per frame. Compiling them all in the first frame of a
      // world, on top of its heaviest drawing, can stall a phone's GPU until the system resets it.
      let made = 0;
      if (!people) { people = createPeople(core); made++; }
      people.update(v.civ, dt);
      if (pl.ref !== v.planet) {
        const p = v.planet;
        pl.ref = p;
        const tr = p?.terrain;
        pl.locked = !!tr?.locked;
        pl.form = tr?.form ? Math.max(0, FORMS.indexOf(tr.form)) : 0;
        pl.grav = tr?.gravity === undefined ? 0 : Math.max(-1, Math.min(1, (tr.gravity - 128) / 100));
        pl.seed = p ? seedToU32(p.seed) : 0;
      }
      // Two worlds of one universe must not grow the same trees in the same places.
      const siteSeed = pl.ref ? (wx.seed ^ Math.imul(pl.seed, 0x9e3779b1)) >>> 0 : wx.seed;
      const camX = v.view?.fp ? v.view.fp.x : v.view?.cx ?? W / 2;
      const sunUp = pl.locked ? Math.max(-1, Math.min(1, (camX / Math.max(1, W) - 0.5) * 2.7)) : -Math.cos((env.day / 1000) * Math.PI * 2);
      const lockDay = pl.locked ? (Math.acos(-sunUp) / (Math.PI * 2)) * 1000 : 0;
      const dayl = Math.max(0, Math.min(1, (sunUp + 0.3) / 0.65));
      const ambP = (0.44 + Math.max(0, v.modifiers.nightLight) / 250 + (1 - 0.44) * dayl) * (1 - Math.max(0, v.modifiers.dimming) / 220);
      if (v.view?.fp) {
        if (!fp) { if (made) return; fp = createFirstPerson(core); made++; }
        const body = people.avatar();
        const view3 = v.view.fp;
        let fv: PlanetRenderView = v;
        if (pl.locked) { Object.assign(lockEnv, env); lockEnv.day = lockDay; Object.assign(lockView, v); lockView.env = lockEnv; fv = lockView; }
        // Quality reaches everything here: target size, shader detail, and how far away things are still drawn.
        const ql = v.quality ?? 1;
        const far = ql >= 0.9 ? 260 : ql >= 0.7 ? 170 : ql >= 0.52 ? 130 : 100;
        fpArgs.view = fv; fpArgs.W = W; fpArgs.H = H; fpArgs.top = top; fpArgs.matTex = tex.mat!; fpArgs.palTex = tex.pal!; fpArgs.time = time; fpArgs.flash = flash;
        fpArgs.eyeX = body ? body.x : view3.x; fpArgs.wet = wx.wet; fpArgs.snow = wx.snow; fpArgs.fog = wx.fog; fpArgs.bolt = wx.bolt; fpArgs.boltX = wx.boltX; fpArgs.boltSeed = wx.boltSeed;
        const cam = fp.draw(fpArgs);
        lifeFrame.civ = v.civ; lifeFrame.env = env; lifeFrame.top = top; lifeFrame.kind = colKind; lifeFrame.W = W; lifeFrame.H = H;
        lifeFrame.seed = siteSeed; lifeFrame.day = (pl.locked ? lockDay : wx.day) / 1000; lifeFrame.time = time; lifeFrame.dt = dt; lifeFrame.snow = wx.snow; lifeFrame.dry = wx.dry; lifeFrame.leaf = wx.leaf;
        fpCam.ro = cam.ro; fpCam.yaw = cam.yaw; fpCam.pitch = cam.pitch; fpCam.depth = cam.depth; fpCam.ground = cam.ground; fpCam.tw = cam.tw; fpCam.th = cam.th;
        lifeFrame.fp = fpCam; lifeFrame.rect = v.rect; lifeFrame.amb = ambP; lifeFrame.night = 1 - dayl; lifeFrame.pal = tex.pal!; lifeFrame.far = far; lifeFrame.quality = ql;
        if (!story && !made) { story = createStory(core); made++; }
        story?.back(lifeFrame);
        placeZ = view3.z;
        peopleFp.ro = cam.ro; peopleFp.yaw = cam.yaw; peopleFp.pitch = cam.pitch; peopleFp.depth = cam.depth; peopleFp.tw = cam.tw; peopleFp.th = cam.th; peopleFp.far = far;
        peopleFrame.fp = peopleFp; peopleFrame.view = mapCam; peopleFrame.rect = v.rect; peopleFrame.W = W; peopleFrame.H = H; peopleFrame.time = time; peopleFrame.amb = ambP; peopleFrame.night = 1 - dayl; peopleFrame.pal = tex.pal!;
        people.draw(peopleFrame);
        if (!life && !made) { life = createLife(core); made++; }
        life?.draw(lifeFrame);
        fp.present();
        return;
      }
      // ---- villages: light halos, and the paths worn between neighbours ----
      let nv = 0;
      vill.fill(0);
      for (const vg of v.civ.villages) {
        if (nv >= 12) break;
        const night = pl.locked ? vg.x < W * 0.47 : env.day < 230 || env.day > 770;
        const gy = top[Math.max(0, Math.min(W - 1, vg.x))]! - 1;
        const k = nv * 4;
        vill[k] = vg.x; vill[k + 1] = gy - 1; vill[k + 2] = 6 + Math.min(14, vg.souls / 4); vill[k + 3] = (night ? 1 : 0.3) * (0.5 + vg.tech * 0.15) * (0.75 + vg.prosperity / 200);
        // insertion sort of village columns
        let j = nv;
        while (j > 0 && vx[j - 1]! > vg.x) { vx[j] = vx[j - 1]!; j--; }
        vx[j] = vg.x;
        nv++;
      }
      let nr = 0;
      for (let i = 0; i + 1 < nv && nr < 6; i++) {
        const a = vx[i]!, b = vx[i + 1]!;
        if (b - a < 8 || b - a > 76) continue;
        let water = 0;
        for (let x = a | 0; x <= b; x++) if (colKind[x] === 3) water++;
        if (water > 2) continue;
        roads[nr * 2] = a - 2; roads[nr * 2 + 1] = b + 3; nr++;
      }

      // ---- draw ----
      core.clear(v.universe.palette[0]!);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.cells!); gl.uniform1i(loc.u_cells!, 0);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex.mat!); gl.uniform1i(loc.u_mat!, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, tex.top!); gl.uniform1i(loc.u_top!, 3);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, tex.temp!); gl.uniform1i(loc.u_temp!, 4);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, tex.hum!); gl.uniform1i(loc.u_hum!, 5);
      const ql = v.quality ?? 1;
      gl.uniform3fv(loc.u_palc!, palF);
      gl.uniform1i(loc.u_oct!, ql >= 0.7 ? 5 : ql >= 0.52 ? 4 : 3);
      gl.uniform1f(loc.u_fx!, ql >= 0.52 ? 1 : 0);
      const R = v.rect;
      gl.uniform2f(loc.u_res!, core.width(), core.height());
      gl.uniform4f(loc.u_rect!, R.x, R.y, R.w, R.h);
      gl.uniform2f(loc.u_grid!, W, H);
      gl.uniform3f(loc.u_view!, v.view?.cx ?? W / 2, v.view?.cy ?? H / 2, Math.max(1, v.view?.zoom ?? 1));
      const md = v.modifiers;
      let moons = 0, suns = 0;
      for (let i = 0; i < v.sky.pieces.length; i++) { const k = v.sky.pieces[i]; if (k === 'moon') moons++; else if (k === 'sun') suns++; }
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
      gl.uniform1f(loc.u_moons!, moons);
      gl.uniform1f(loc.u_suns!, suns);
      uploadHeavens(gl, loc, v);
      gl.uniform4f(loc.u_pl!, pl.locked ? 1 : 0, pl.form, pl.grav, 0);
      gl.uniform1f(loc.u_orb!, Math.min(8, Math.max(v.sky.built ?? 0, v.civ.launches)));
      gl.uniform4fv(loc.u_vill!, vill);
      gl.uniform1i(loc.u_nvill!, nv);
      gl.uniform1f(loc.u_wet!, wx.wet);
      gl.uniform1f(loc.u_snowc!, wx.snow);
      gl.uniform1f(loc.u_snowing!, env.snowing ? 1 : 0);
      gl.uniform1f(loc.u_fog!, wx.fog);
      gl.uniform1f(loc.u_life!, wx.leaf);
      gl.uniform4f(loc.u_bolt!, wx.boltX, wx.boltSeed, wx.bolt, top[wx.boltX | 0] ?? H);
      gl.uniform2fv(loc.u_road!, roads);
      gl.uniform1i(loc.u_nroad!, nr);
      {
        // Only the surface rect is shaded, not the whole canvas.
        const sx = core.canvas.width / Math.max(1, core.width()), sy = core.canvas.height / Math.max(1, core.height());
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(Math.floor(R.x * sx), Math.floor(core.canvas.height - (R.y + R.h) * sy), Math.ceil(R.w * sx) + 1, Math.ceil(R.h * sy) + 1);
        core.quad(prog);
        gl.disable(gl.SCISSOR_TEST);
      }
      mapCam.cx = v.view?.cx ?? W / 2; mapCam.cy = v.view?.cy ?? H / 2; mapCam.zoom = Math.max(1, v.view?.zoom ?? 1);
      if (!life && !made) { life = createLife(core); made++; }
      lifeFrame.civ = v.civ; lifeFrame.env = env; lifeFrame.top = top; lifeFrame.kind = colKind; lifeFrame.W = W; lifeFrame.H = H;
      lifeFrame.seed = siteSeed; lifeFrame.day = (pl.locked ? lockDay : wx.day) / 1000; lifeFrame.time = time; lifeFrame.dt = dt; lifeFrame.snow = wx.snow; lifeFrame.dry = wx.dry; lifeFrame.leaf = wx.leaf;
      lifeFrame.fp = null; lifeFrame.far = 260; lifeFrame.quality = ql; lifeFrame.view = mapCam; lifeFrame.rect = v.rect; lifeFrame.amb = ambP; lifeFrame.night = 1 - dayl; lifeFrame.pal = tex.pal!;
      life?.draw(lifeFrame);
      if (!story && !made) { story = createStory(core); made++; }
      story?.back(lifeFrame);
      if (!structures && !made) { structures = createStructures(core); made++; }
      structFrame.civ = v.civ; structFrame.top = top; structFrame.view = mapCam; structFrame.rect = v.rect; structFrame.W = W; structFrame.H = H; structFrame.time = time;
      structFrame.amb = ambP; structFrame.night = 1 - dayl; structFrame.pulse = v.pulse / FX_ONE; structFrame.pal = tex.pal!;
      structFrame.wind = env.wind / 100; structFrame.season = env.season / 1000; structFrame.snow = wx.snow;
      structures?.draw(structFrame);
      story?.front(lifeFrame);
      peopleFrame.fp = null; peopleFrame.view = mapCam; peopleFrame.rect = v.rect; peopleFrame.W = W; peopleFrame.H = H; peopleFrame.time = time; peopleFrame.amb = ambP; peopleFrame.night = 1 - dayl; peopleFrame.pal = tex.pal!;
      people.draw(peopleFrame);
    },
    dispose: () => { core = null; },
  };
};
