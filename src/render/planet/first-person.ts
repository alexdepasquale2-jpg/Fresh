// First-person view of a planet (part of unit 15). The same sim cells, seen from the
// ground: each column's surface becomes terrain height and material, extruded into
// depth as a valley that bends and rises away from the slice. Houses, towers,
// bonfires and people stand where the sim has them. Ray-marched in one fragment
// shader into a half-resolution target, then scaled up into the surface rect.
import type { GlCore, PlanetRenderView } from '@/contracts/render';
import { ENGINE, ROLE } from '@/contracts/sim';
import { FULLSCREEN_VS } from '@/render/gl';
import { FX_ONE } from '@/core/fixed';
import { HEAVENS_GLSL, HEAVENS_UNIFORMS, uploadHeavens } from './heavens';

// Shared by shader and camera so the eye always stands on what is drawn.
const sat = (v: number) => Math.max(0, Math.min(1, v));
export const warpZ = (z: number) => 14 * Math.sin(z * 0.045) * Math.sin(z * 0.021 + 1.3) * sat(Math.abs(z) / 12);
export const bump = (x: number, z: number) =>
  3.5 * Math.sin(x * 0.11 + z * 0.13) * Math.sin(z * 0.09 + x * 0.02) * sat(Math.abs(z) / 15) +
  sat((Math.abs(z) - 25) / 40) * 12 * (0.5 + 0.5 * Math.sin(x * 0.03 + z * 0.05));

const FS = `#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform vec2 u_res; uniform vec3 u_ro; uniform vec2 u_look; uniform vec2 u_grid;
uniform sampler2D u_cols, u_pal; uniform highp usampler2D u_mat;
uniform float u_day, u_season, u_time, u_pulse, u_nl, u_dim, u_dust, u_wind, u_hum, u_rain, u_flash, u_moons, u_suns, u_rings, u_snow, u_orb, u_impacts, u_aurora;
uniform vec4 u_vill[12]; uniform int u_nvill;
${HEAVENS_GLSL}
vec3 pal(int i){ return texelFetch(u_pal, ivec2(i & 15, 0), 0).rgb; }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.0), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
float warpZ(float z){ return 14.0 * sin(z * 0.045) * sin(z * 0.021 + 1.3) * clamp(abs(z) / 12.0, 0.0, 1.0); }
float bump(float x, float z){ return 3.5 * sin(x * 0.11 + z * 0.13) * sin(z * 0.09 + x * 0.02) * clamp(abs(z) / 15.0, 0.0, 1.0)
  + clamp((abs(z) - 25.0) / 40.0, 0.0, 1.0) * 12.0 * (0.5 + 0.5 * sin(x * 0.03 + z * 0.05)); }
float ground(vec2 p){ float xw = p.x + warpZ(p.y); return u_grid.y - texture(u_cols, vec2(xw / u_grid.x, 1.0 / 6.0)).r * 255.0 + bump(p.x, p.y); }
// Height of everything standing at p. layer: 0 ground, 1 built, 2 person.
float map(vec2 p, out float layer, out vec4 tag){
  float h = ground(p); layer = 0.0; tag = vec4(0.0);
  if (abs(p.y) < 9.0) {
    // Buildings and people stand on straight columns (no valley bend), so walls stay square.
    float xw = p.x;
    int xi = int(floor(xw));
    if (xi >= 0 && xi < int(u_grid.x)) {
      vec4 b = texelFetch(u_cols, ivec2(xi, 1), 0);
      float half_ = b.a * 255.0 / 16.0, dz = abs(p.y - (b.b * 255.0 - 128.0) / 16.0);
      if (b.g > 0.0 && dz < half_) {
        // Houses get a gable: the roof rises to a ridge along the middle.
        h += b.r * 255.0 / 16.0 + (b.g * 255.0 < 1.5 ? 1.3 * (1.0 - dz / half_) : 0.0);
        layer = 1.0; tag = b;
      }
      vec4 q = texelFetch(u_cols, ivec2(xi, 2), 0);
      if (q.r > 0.0 && abs(p.y - (q.b * 255.0 - 128.0) / 16.0) < 0.32 && abs(fract(xw) - 0.5) < 0.32) { h += 2.0; layer = 2.0; tag = q; }
    }
  }
  return h;
}
vec3 sunDir(float k){ float a = (u_day - 0.25 + k * 0.07) * 6.2831853; return normalize(vec3(cos(a), sin(a), 0.35)); }
vec3 sky(vec3 rd, float daylight, float dusk, bool hq){
  float up = clamp(rd.y, -0.2, 1.0);
  vec3 day = mix(mix(pal(9), pal(13), dusk * 0.6), mix(pal(12), pal(9), 0.25), smoothstep(0.0, 0.6, up));
  vec3 night = mix(pal(2), pal(0) * 0.6, smoothstep(0.0, 0.7, up));
  day = mix(day, day * (0.55 + u_star.rgb * 0.75), 0.35);   // the star colours its own daylight
  vec3 c = mix(night, day, daylight) + pal(14) * dusk * 0.35 * smoothstep(0.45, 0.0, up);
  c = mix(c, pal(14) * 0.6 + pal(7) * 0.2, u_dust * 0.55);
  // stars
  vec2 sp = rd.xz / (abs(rd.y) + 0.35) * 28.0;
  float st = h21(floor(sp));
  c += pal(9) * step(0.985, st) * smoothstep(0.35, 0.05, length(fract(sp) - 0.5)) * 2.0 * (1.0 - daylight) * (1.0 - u_dust) * step(0.0, rd.y) * (0.5 + 0.5 * sin(u_time * 3.0 + st * 300.0));
  // The far dark of this system: a glow seeded by its star.
  if (hq && rd.y > 0.0) { vec2 nq = rd.xz / (rd.y + 0.4) * 1.6 + u_hv.y; float nb = fbm(nq);
    c += mix(pal(int(u_hv.x)), pal(11), fbm(nq.yx * 2.3 + 7.0)) * pow(smoothstep(0.35, 0.9, nb), 2.0) * u_hv.z * 0.4 * (1.0 - daylight) * (1.0 - u_dust); }
  vec3 L = sunDir(0.0);
  // suns: the first is this system's star, its colour and size; lesser suns follow it
  vec3 starCol = mix(pal(9), u_star.rgb, 0.65) * (u_hv.w > 0.5 ? 0.7 + 0.5 * sin(u_time * 9.0) : 1.0);
  for (int s = 0; s < 3; s++) {
    if (float(s) >= 1.0 + u_suns) break;
    float d = dot(rd, sunDir(float(s)));
    float sz = s == 0 ? u_star.w : 0.7;
    float cr = 1.0 - 0.0011 * sz * sz;
    c += (s == 0 ? starCol : pal(13)) * (smoothstep(cr - 0.0004, cr + 0.0003, d) * 2.0 + pow(max(d, 0.0), 40.0 / sz) * 0.5 + pow(max(d, 0.0), 6.0) * 0.12 * daylight);
  }
  // every body in this sky: each moon its own, the other worlds of the star, comets
  for (int m = 0; m < 8; m++) {
    if (m >= u_nb) break;
    vec4 A = u_bA[m], B = u_bB[m];
    float k = mod(B.w, 10.0);
    float a, z;
    if (k > 1.5 && k < 2.5) { a = (u_day - 0.25 + A.w * sin((u_season * A.y + A.z) * 6.2831853)) * 6.2831853; z = 0.35; }
    else { a = (u_day + A.z + u_season * A.y) * 6.2831853; z = A.w; }
    vec3 md = normalize(vec3(cos(a), sin(a), z));
    float d = dot(rd, md);
    if (d < 0.9) continue;
    vec3 dv = rd - md;
    if (k < 0.5) {
      float r = 0.032 * A.x, cr = 1.0 - r * r * 0.5;
      float disc = smoothstep(cr - r * r * 0.1, cr, d);
      vec3 face = B.rgb * (0.82 + 0.18 * noise(dv.xy / r * 2.5 + A.z * 9.0)) * (0.9 + 0.1 * smoothstep(cr, 1.0, d));
      c = mix(c, mix(face * 0.1 + c * 0.55, face, smoothstep(-0.5, 0.5, dot(dv, L) / r)), disc);
      c += B.rgb * pow(max(d, 0.0), 60.0) * 0.12 * A.x * (1.0 - daylight * 0.7);
    } else if (k < 2.5) {
      float r = 0.0075 * A.x, cr = 1.0 - r * r * 0.5;
      float vis = 1.0 - daylight * 0.85;
      c += B.rgb * (smoothstep(cr - r * r * 0.35, cr, d) * 1.8 + pow(max(d, 0.0), 2600.0 / A.x) * 0.5) * vis;
      if (B.w > 9.5) { vec3 rdir = normalize(vec3(-sin(a), cos(a), 0.35)); float al = dot(dv, rdir); float ac = length(dv - al * rdir);
        c += B.rgb * smoothstep(r * 0.45, 0.0, ac) * smoothstep(r * 2.8, r * 2.2, abs(al)) * 0.8 * vis; }
    } else {
      float w = smoothstep(0.1, 0.6, sin((u_season + A.z) * 6.2831853));
      float r = 0.006 * A.x, cr = 1.0 - r * r * 0.5;
      vec3 tdir = normalize(md - L); float al = dot(dv, tdir); float ac = length(dv - al * tdir);
      float tail = smoothstep(0.0, 0.01, al) * smoothstep(0.32 * A.x, 0.0, al) * smoothstep(0.004 + al * 0.13, 0.0, ac);
      c += B.rgb * (smoothstep(cr - r * r * 0.4, cr, d) * 2.0 + tail * 0.7) * w * (1.0 - daylight * 0.8);
    }
  }
  // rings: a bright arc across the whole sky, tilted as this world is tilted
  if (u_arc.x > 0.01) { float band = abs(rd.z * 0.9 + rd.y * (0.45 + u_arc.y) - 0.25);
    c += mix(pal(8), pal(9), 0.5) * (smoothstep(0.03, 0.0, band) * 0.5 + smoothstep(0.07, 0.04, band) * 0.15 + smoothstep(0.012, 0.0, abs(band - 0.1)) * 0.25 * step(0.9, u_arc.x)) * step(0.0, rd.y) * (0.5 + 0.5 * daylight + u_nl) * (0.5 + 0.7 * u_arc.x); }
  // belt: a river of stones, some catching the light
  if (u_arc.z > 0.01 && rd.y > 0.0) { float band = abs(rd.z * 0.7 - rd.y * (0.5 + u_arc.w) + 0.12);
    float glint = step(0.9 - u_arc.z * 0.12, h21(floor(rd.xz / (rd.y + 0.3) * 70.0)));
    c += mix(pal(7), pal(9), glint * 0.6) * smoothstep(0.07, 0.0, band) * (0.08 + 0.9 * glint) * u_arc.z * (1.0 - daylight * 0.6); }
  float sd = max(dot(rd, L), 0.0);
  // Atmosphere: forward-scattered glow round the sun, and a warm band along the horizon at dusk.
  c += mix(pal(13), pal(9), 0.5) * (pow(sd, 8.0) * 0.25 + pow(sd, 3.0) * 0.08) * (daylight * 0.6 + dusk);
  c = mix(c, mix(pal(9), pal(13), dusk), smoothstep(0.25, 0.0, up) * 0.3 * (daylight * 0.5 + dusk * 0.6));
  if (rd.y > 0.0) {
    // Milky band of faint stars.
    float band = exp(-pow((rd.x * 0.6 + rd.z * 0.8) * 3.0, 2.0));
    if (hq) c += (pal(9) * 0.5 + pal(11) * 0.4) * band * fbm(rd.xz * 9.0 + 3.0) * 0.35 * (1.0 - daylight) * (1.0 - u_dust);
    // What they launched: small steady lights crossing the sky in a line.
    for (int j = 0; j < 8; j++) {
      if (float(j) >= u_orb) break;
      float a = u_time * 0.07 + float(j) * 0.55;
      vec3 od = normalize(vec3(cos(a), 0.55 + 0.25 * sin(a * 0.7 + float(j)), sin(a) * 0.7));
      c += pal(10) * smoothstep(0.99985, 0.99997, dot(rd, od)) * 2.5 * (0.7 + 0.3 * sin(u_pulse * 6.2831 + float(j)));
    }
    // Shooting stars under a sky that throws stones.
    if (u_impacts > 0.01 && hq) {
      float k = floor(u_time * 0.6); float ph = fract(u_time * 0.6);
      if (h21(vec2(k, 7.0)) < u_impacts) {
        vec3 a0 = normalize(vec3(h21(vec2(k, 1.0)) - 0.5, 0.5 + 0.4 * h21(vec2(k, 2.0)), h21(vec2(k, 3.0)) - 0.5));
        vec3 dirv = normalize(vec3(0.6, -0.5, 0.3));
        vec3 head = normalize(a0 + dirv * ph * 0.5);
        float along = dot(rd - head, -dirv);
        float off = length((rd - head) + dirv * along);
        c += pal(9) * smoothstep(0.004, 0.0, off) * smoothstep(0.12, 0.0, along) * step(0.0, along) * (1.0 - ph) * 3.0;
      }
    }
    // Aurora: curtains of light on cold, lit or star-reaching worlds.
    if (u_aurora > 0.01 && hq) {
      vec2 av = rd.xz / (rd.y + 0.25);
      float curtain = sin(av.x * 3.0 + fbm(av * 1.5 + u_time * 0.05) * 6.0 + u_time * 0.2);
      float ray = pow(max(curtain, 0.0), 6.0) * (0.6 + 0.4 * noise(vec2(av.x * 30.0, u_time * 0.5)));
      c += mix(pal(10), pal(15), 0.5 + 0.5 * sin(av.x * 2.0)) * ray * smoothstep(0.05, 0.3, rd.y) * smoothstep(0.9, 0.4, rd.y) * u_aurora * (1.0 - daylight) * 1.3;
    }
  }
  // Clouds with depth: marched through a slab and lit from the sun's side, so they have
  // bright edges, grey bellies and a silver lining.
  if (rd.y > 0.02) {
    vec2 drift = vec2(u_time * u_wind * 0.05 + u_time * 0.004, 0.0);
    float trans = 1.0; vec3 acc = vec3(0.0);
    int steps = hq ? 5 : 1;
    for (int i = 0; i < 5; i++) {
      if (i >= steps) break;
      float hgt = (float(i) + 0.5) / float(steps);
      vec2 uv = rd.xz / (rd.y + 0.18) * (1.15 + hgt * 0.3) + drift * (1.0 + hgt);
      float d = smoothstep(0.42, 0.8, fbm(uv) + u_hum * 1.4 - 0.34 - abs(hgt - 0.45) * 0.25);
      if (d > 0.01) {
        float toSun = smoothstep(0.42, 0.8, fbm(uv + L.xz * 0.22) + u_hum * 1.4 - 0.34);
        float shade = exp(-toSun * 2.2) * (0.55 + 0.45 * hgt);
        vec3 lit = mix(pal(2) * 1.2, mix(pal(9), pal(13), dusk * 0.7), shade) * (0.25 + 0.75 * daylight) + pal(14) * dusk * 0.35 * shade;
        lit += pal(9) * pow(sd, 12.0) * shade * 0.9 * (daylight + dusk);          // silver lining
        lit += pal(9) * u_flash * 1.5;                                             // lightning inside the cloud
        float a = d * (hq ? 0.5 : 0.9);
        acc += lit * a * trans; trans *= 1.0 - a;
      }
    }
    float fade = smoothstep(0.02, 0.2, rd.y);
    c = mix(c, acc + c * trans, fade);
    // High, thin streaks.
    if (hq) c = mix(c, mix(pal(9), pal(13), dusk) * (0.3 + 0.7 * daylight), smoothstep(0.55, 0.9, fbm(rd.xz / (rd.y + 0.3) * vec2(0.5, 3.0) + drift * 0.4)) * 0.25 * fade);
    // Shafts of light fanning from the sun through broken cloud.
    if (hq) { float ang = atan(rd.y - L.y, rd.x * L.z - rd.z * L.x); c += mix(pal(9), pal(13), dusk) * pow(sd, 5.0) * (0.5 + 0.5 * sin(ang * 14.0 + fbm(vec2(ang * 3.0, u_time * 0.05)) * 6.0)) * (1.0 - trans) * 0.35 * (daylight + dusk); }
    // A rainbow, opposite the sun, while rain is thinning.
    if (hq && u_rain > 0.02 && u_rain < 0.6) { float ra = dot(rd, -L); float bow = (ra - 0.74) / 0.035;
      if (bow > 0.0 && bow < 1.0) c += mix(mix(pal(13), pal(7), smoothstep(0.0, 0.4, bow)), mix(pal(15), pal(11), smoothstep(0.6, 1.0, bow)), smoothstep(0.35, 0.65, bow)) * sin(bow * 3.14159) * 0.3 * daylight; }
  }
  return c;
}
void main(){
  vec2 fc = v_uv * u_res;
  vec2 uv = (v_uv * 2.0 - 1.0) * vec2(u_res.x / u_res.y, 1.0) * 0.75;
  float cy = cos(u_look.x), sy = sin(u_look.x), cp = cos(u_look.y), sp = sin(u_look.y);
  vec3 fwd = vec3(cy * cp, sp, sy * cp), right = vec3(-sy, 0.0, cy), upv = cross(right, fwd);
  vec3 rd = normalize(fwd + uv.x * right + uv.y * upv);
  vec3 ro = u_ro;
  float sunUp = sin((u_day - 0.25) * 6.2831853);
  float daylight = smoothstep(-0.3, 0.35, sunUp) * (1.0 - u_dim * 0.45);
  float dusk = exp(-pow(sunUp * 3.5, 2.0));
  vec3 skyc = sky(rd, daylight, dusk, true);
  // march
  float t = 0.3, tp = 0.0, layer = 0.0; vec4 tag = vec4(0.0); bool hit = false;
  for (int i = 0; i < 96; i++) {
    vec3 p = ro + rd * t;
    float d = p.y - map(p.xz, layer, tag);
    if (d < 0.02 + 0.0015 * t) { hit = true; break; }
    tp = t;
    t += clamp(d * 0.45, 0.1 + 0.004 * t, 7.0);
    if (t > 260.0 || (rd.y > 0.0 && p.y > u_grid.y + 30.0)) break;
  }
  vec3 col = skyc;
  if (hit) {
    for (int i = 0; i < 5; i++) { float tm = 0.5 * (tp + t); vec3 pm = ro + rd * tm; float l2; vec4 g2; if (pm.y - map(pm.xz, l2, g2) < 0.0) t = tm; else tp = tm; }
    vec3 p = ro + rd * t;
    float l0; vec4 g0;
    float hc = map(p.xz, layer, tag);
    float e = 0.12 + t * 0.004;
    vec3 n = normalize(vec3(map(p.xz - vec2(e, 0.0), l0, g0) - map(p.xz + vec2(e, 0.0), l0, g0), 2.0 * e, map(p.xz - vec2(0.0, e), l0, g0) - map(p.xz + vec2(0.0, e), l0, g0)));
    float xw = p.x + warpZ(p.z);
    int xi = clamp(int(floor(xw)), 0, int(u_grid.x) - 1);
    uint m = uint(texelFetch(u_cols, ivec2(xi, 0), 0).g * 255.0 + 0.5);
    uvec2 mk = texelFetch(u_mat, ivec2(int(m), 0), 0).rg;
    uint kind = mk.g;
    vec3 base = pal(int(mk.r));
    float emis = 0.0, spec = 0.0;
    float fine = noise(p.xz * 3.0), grain = h21(floor(p.xz * 4.0));
    float hy = p.y - ground(p.xz);
    float autumn = smoothstep(0.45, 0.6, u_season) * smoothstep(0.85, 0.7, u_season);
    if (layer > 1.5) {            // a person
      int role = int(tag.g * 255.0 + 0.5);
      base = hy > 1.35 ? pal(8) : (role == ${ROLE.attack} ? pal(13) : role == ${ROLE.kneel} || role == ${ROLE.pray} ? pal(9) : mix(pal(5), pal(12), step(0.5, h21(vec2(float(xi), 3.0)))));
      if (role == ${ROLE.lamp} && hy > 0.9 && hy < 1.3) { base = pal(10); emis = 1.2; }
      if (role == 99) { base = mix(pal(9), pal(10), 0.5 + 0.5 * sin(u_time * 6.0)); emis = 1.0; }
    } else if (layer > 0.5) {     // built
      int code = int(tag.g * 255.0 + 0.5);
      float wallh = tag.r * 255.0 / 16.0;
      if (code == 3) { base = mix(pal(13), pal(9), noise(vec2(p.x * 4.0, u_time * 8.0))); emis = 1.5; }
      else if (code == 2) { base = pal(3) * (0.9 + 0.3 * grain); if (hy > wallh - 1.0) { base = pal(13); emis = (1.0 - daylight) * 1.2; } }
      else if (hy > wallh - 0.05) base = pal(14) * (0.85 + 0.3 * step(0.5, fract(p.x * 2.0 + p.z * 2.0)));
      else {
        base = pal(5) * (1.0 - 0.25 * max(step(0.88, fract(p.y * 2.0)), step(0.9, fract((p.x + p.z) * 1.5 + floor(p.y * 2.0) * 0.5))));
        vec2 w = vec2(fract((p.x + p.z) * 0.9), hy);
        if (abs(w.x - 0.5) < 0.2 && w.y > 0.7 && w.y < 1.5) { base = mix(pal(2), pal(13), smoothstep(0.2, 0.8, 1.0 - daylight)); emis = (1.0 - daylight) * 1.1; }
      }
    } else if (kind == 3u) {      // water
      vec3 wn = normalize(vec3(sin(p.x * 1.7 + u_time * 1.6) * 0.06 + sin(p.z * 2.3 - u_time * 1.1) * 0.05, 1.0, cos(p.z * 1.9 + u_time * 1.3) * 0.06));
      n = wn;
      vec3 refl = sky(reflect(rd, wn), daylight, dusk, false);
      float fres = pow(1.0 - max(dot(-rd, wn), 0.0), 4.0);
      base = mix(mix(base, pal(12), 0.5) * (0.35 + 0.65 * daylight), refl, 0.25 + 0.7 * fres);
      emis = 1.0; spec = 1.0;
    } else if (kind == 5u) { base = mix(pal(13), pal(9), noise(p.xz * 2.5 + vec2(0.0, u_time * 5.0))); emis = 1.4; }
    else if (kind == 6u) {        // moss and grass
      base *= 0.75 + 0.5 * fine; base = mix(base, pal(14), autumn * 0.5);
      base *= 0.85 + 0.3 * step(0.5, fract(p.x * 5.0 + noise(p.xz * 2.0) * 2.0 + sin(u_time * 1.5 + p.z) * 0.1));
    }
    else if (kind == 2u) base *= 0.8 + 0.25 * grain + 0.15 * sin(p.x * 2.0 + noise(p.xz * 0.6) * 6.0);
    else base *= 0.8 + 0.3 * fine + 0.1 * grain;
    if (layer < 0.5 && kind != 3u && kind != 5u) {
      if (n.y < 0.55) base = mix(base, pal(4) * (0.6 + 0.4 * noise(vec2(p.x + p.z, p.y * 3.0))), 0.7);   // cliffs show rock
      if (m == ${ENGINE.ice.id}u) { base = mix(pal(9), pal(10), 0.4); spec = 1.0; }
      if (m == ${ENGINE.ore.id}u) base = mix(pal(7), pal(9), step(0.8, grain));
      base = mix(base, pal(9), u_snow * smoothstep(0.6, 0.9, n.y) * 0.7);
    }
    vec3 L = sunDir(0.0);
    float dif = max(dot(n, L), 0.0) * daylight;
    if (dif > 0.0 && emis < 0.5) {      // soft shadow toward the sun
      float st = 0.4, sh = 1.0;
      for (int i = 0; i < 10; i++) { vec3 q = p + n * 0.1 + L * st; float l2; vec4 g2; float d2 = q.y - map(q.xz, l2, g2); sh = min(sh, 6.0 * d2 / st); if (sh < 0.05) break; st += clamp(d2, 0.5, 4.0); }
      dif *= clamp(sh, 0.0, 1.0);
    }
    float amb = mix(0.2 + u_nl * 0.4 + u_moons * 0.07, 0.42, daylight) * (0.6 + 0.4 * n.y);
    vec3 sunCol = mix(pal(13), pal(9), smoothstep(0.0, 0.5, sunUp));
    vec3 lit = base * (amb * mix(pal(11) * 1.4 + 0.3, vec3(1.0), 0.6) + dif * sunCol * (1.0 + u_suns * 0.3));
    // village fires at night
    for (int i = 0; i < 12; i++) {
      if (i >= u_nvill) break;
      vec3 lp = vec3(u_vill[i].x, u_vill[i].y + 1.5, 0.0);
      float d = length(p - lp);
      lit += base * pal(13) * u_vill[i].w * (0.8 + 0.2 * sin(u_pulse * 6.2831853 + float(i))) * 5.0 / (1.0 + d * d * 0.05) * (1.0 - daylight * 0.9);
    }
    lit += pal(9) * spec * pow(max(dot(reflect(rd, n), L), 0.0), 60.0) * daylight;
    col = emis > 0.5 ? (kind == 3u && layer < 0.5 ? base + pal(9) * spec * pow(max(dot(reflect(rd, n), L), 0.0), 80.0) * daylight : base * emis) : lit;
    col += base * u_flash * 0.6;
    float fog = 1.0 - exp(-t * (0.006 + u_hum * 0.012 + u_dust * 0.02));
    col = mix(col, sky(normalize(vec3(rd.x, 0.03, rd.z)), daylight, dusk, false), fog);
  }
  // rain or snow on the lens
  if (u_rain > 0.01) {
    float snow = u_snow;
    vec2 g = mix(vec2(floor(fc.x / 2.0), floor((fc.y + u_time * 700.0) / 34.0)), floor((fc + vec2(sin(u_time + fc.y * 0.02) * 12.0, u_time * 70.0)) / 5.0), snow);
    col = mix(col, pal(9), step(mix(0.985, 0.992, snow) - u_rain * 0.03, h21(g)) * 0.35);
  }
  col *= 0.85 + 0.15 * smoothstep(1.3, 0.4, length(uv));
  // Alpha carries distance, so sprites drawn afterwards can hide behind the terrain.
  o = vec4(col, hit ? sqrt(clamp(t / 260.0, 0.0, 1.0)) : 1.0);
}`;

const BLIT_FS = `#version 300 es
precision mediump float;
in vec2 v_uv; out vec4 o;
uniform vec2 u_res; uniform vec4 u_rect; uniform sampler2D u_tex; uniform vec2 u_px;
void main(){
  vec2 fc = vec2(v_uv.x * u_res.x, (1.0 - v_uv.y) * u_res.y);
  vec2 q = (fc - u_rect.xy) / u_rect.zw;
  if (q.x < 0.0 || q.y < 0.0 || q.x >= 1.0 || q.y >= 1.0) discard;
  vec2 uv = vec2(q.x, 1.0 - q.y);
  vec3 c = texture(u_tex, uv).rgb;
  // Reconstruct detail lost to the smaller target: contrast-adaptive sharpening.
  vec3 n = texture(u_tex, uv + vec2(0.0, u_px.y)).rgb, s = texture(u_tex, uv - vec2(0.0, u_px.y)).rgb;
  vec3 e = texture(u_tex, uv + vec2(u_px.x, 0.0)).rgb, w = texture(u_tex, uv - vec2(u_px.x, 0.0)).rgb;
  vec3 mn = min(c, min(min(n, s), min(e, w))), mx = max(c, max(max(n, s), max(e, w)));
  vec3 amt = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(0.001)), 0.0, 1.0)) * -0.18;
  c = clamp((c + (n + s + e + w) * amt) / (1.0 + 4.0 * amt), 0.0, 4.0);
  // Bloom: bright things bleed light.
  vec3 bl = vec3(0.0);
  for (int i = 0; i < 8; i++) { float a = float(i) * 0.7854; vec3 t = texture(u_tex, uv + vec2(cos(a), sin(a)) * u_px * (3.0 + float(i & 1) * 4.0)).rgb; bl += max(t - 0.75, 0.0); }
  c += bl * 0.16;
  // Filmic shoulder so highlights roll off instead of clipping.
  c = c * (1.0 + c * 0.25) / (1.0 + c * 0.55 + c * c * 0.12) * 1.18;
  o = vec4(c, 1.0);
}`;

export interface FpFrame {
  /** Eye column: the body's smoothed position. */
  eyeX: number;
  view: PlanetRenderView;
  W: number;
  H: number;
  top: Uint8Array;
  matTex: WebGLTexture;
  palTex: WebGLTexture;
  time: number;
  flash: number;
}

export const createFirstPerson = (core: GlCore) => {
  const gl = core.gl;
  const prog = core.program(FULLSCREEN_VS, FS);
  const blit = core.program(FULLSCREEN_VS, BLIT_FS);
  const U = (p: WebGLProgram, names: string[]) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)])) as Record<string, WebGLUniformLocation | null>;
  const loc = U(prog, ['u_res', 'u_ro', 'u_look', 'u_grid', 'u_cols', 'u_pal', 'u_mat', 'u_day', 'u_season', 'u_time', 'u_pulse', 'u_nl', 'u_dim', 'u_dust', 'u_wind', 'u_hum', 'u_rain', 'u_flash', 'u_moons', 'u_suns', 'u_rings', 'u_snow', 'u_orb', 'u_impacts', 'u_aurora', 'u_vill', 'u_nvill', ...HEAVENS_UNIFORMS]);
  const bloc = U(blit, ['u_res', 'u_rect', 'u_tex', 'u_px']);
  // Own quad so we can draw into a smaller target.
  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const fbo = gl.createFramebuffer();
  const target = gl.createTexture();
  let fw = 0, fh = 0;
  const colsTex = gl.createTexture();
  let cols = new Uint8Array(0);
  let colsW = 0;
  const vill = new Float32Array(48);
  let eyeY = -1;

  const linear = (t: WebGLTexture | null) => {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  /** Ground height under (x, z), the same function the shader marches. */
  const groundAt = (f: FpFrame, x: number, z: number) => {
    const xw = Math.max(0.5, Math.min(f.W - 0.501, x + warpZ(z))) - 0.5;
    const i = Math.floor(xw), t = xw - i;
    const a = f.top[i]!, b = f.top[Math.min(f.W - 1, i + 1)]!;
    return f.H - (a + (b - a) * t) + bump(x, z);
  };

  return {
    draw: (f: FpFrame) => {
      const { view: v, W, H } = f;
      const fp = v.view!.fp!;
      const civ = v.civ;
      // ---- columns: row 0 ground, row 1 built, row 2 people ----
      if (colsW !== W) {
        colsW = W;
        cols = new Uint8Array(W * 3 * 4);
        linear(colsTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, 3, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      cols.fill(0);
      const cells = v.grid.cells;
      for (let x = 0; x < W; x++) {
        cols[x * 4] = f.top[x]!;
        cols[x * 4 + 1] = cells[f.top[x]! * W + x]!;
      }
      const built = (x: number, extra: number, code: number, zoff: number, half: number) => {
        if (x < 0 || x >= W) return;
        const k = (W + x) * 4;
        cols[k] = Math.min(255, Math.round(extra * 16)); cols[k + 1] = code; cols[k + 2] = Math.round(zoff * 16 + 128); cols[k + 3] = Math.round(half * 16);
      };
      let nv = 0;
      vill.fill(0);
      const night = v.env.day < 230 || v.env.day > 770;
      for (const vg of civ.villages) {
        for (const b of vg.buildings) {
          const zoff = ((b.seed * 5 + vg.id * 3 + b.x) % 7) - 3;
          if (b.kind === 'fire') built(b.x, 0.7, 3, 0, 0.5);
          else if (b.kind === 'tower') built(b.x, 9, 2, 1.5, 0.6);
          else if (b.kind === 'pad') built(b.x, 7, 2, 2.5, 0.5);
          else if (b.kind === 'house' || b.kind === 'workshop' || b.kind === 'store' || b.kind === 'market') {
            const hh = b.kind === 'workshop' ? 3.4 : b.kind === 'market' ? 2.0 : 2.6;
            for (let dx = -1; dx <= 1; dx++) built(b.x + dx, hh, 1, zoff, b.kind === 'house' ? 1.7 : 2.2);
          }
        }
        if (nv < 12) { vill.set([vg.x, H - f.top[Math.max(0, Math.min(W - 1, vg.x))]!, 0, (night ? 1 : 0.2) * (0.5 + vg.tech * 0.15)], nv * 4); nv++; }
      }
      gl.bindTexture(gl.TEXTURE_2D, colsTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, 3, gl.RGBA, gl.UNSIGNED_BYTE, cols);

      // ---- target ----
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const q = Math.max(0.45, Math.max(0.9, 0.7 * dpr) * Math.max(0.4, Math.min(1, v.quality ?? 1)));
      const w = Math.max(64, Math.round(v.rect.w * q)), h = Math.max(48, Math.round(v.rect.h * q));
      if (w !== fw || h !== fh) {
        fw = w; fh = h;
        linear(target);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
      }
      // ---- eye ----
      const want = groundAt(f, f.eyeX, fp.z) + 2.4;
      eyeY = eyeY < 0 || Math.abs(want - eyeY) > 30 ? want : eyeY + (want - eyeY) * 0.25;
      let hum = 0;
      for (let i = 0; i < v.env.humidity.length; i++) hum += v.env.humidity[i]!;
      hum /= Math.max(1, v.env.humidity.length) * 255;

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, fw, fh);
      gl.useProgram(prog);
      const bind = (unit: number, t: WebGLTexture | null, name: string) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc[name]!, unit); };
      bind(0, colsTex, 'u_cols'); bind(1, f.palTex, 'u_pal'); bind(2, f.matTex, 'u_mat');
      const md = v.modifiers;
      const count = (k: string) => v.sky.pieces.filter((p) => p === k).length;
      gl.uniform2f(loc.u_res!, fw, fh);
      const ro: [number, number, number] = [f.eyeX, eyeY + (fp.bob ?? 0), fp.z];
      gl.uniform3f(loc.u_ro!, ...ro);
      gl.uniform2f(loc.u_look!, fp.yaw, fp.pitch);
      gl.uniform2f(loc.u_grid!, W, H);
      gl.uniform1f(loc.u_day!, v.env.day / 1000);
      gl.uniform1f(loc.u_season!, v.env.season / 1000);
      gl.uniform1f(loc.u_time!, f.time % 10000);
      gl.uniform1f(loc.u_pulse!, v.pulse / FX_ONE);
      gl.uniform1f(loc.u_nl!, Math.max(0, md.nightLight) / 100);
      gl.uniform1f(loc.u_dim!, Math.max(0, md.dimming) / 100);
      gl.uniform1f(loc.u_dust!, Math.max(0, md.dust) / 100);
      gl.uniform1f(loc.u_wind!, v.env.wind / 100);
      gl.uniform1f(loc.u_hum!, hum);
      gl.uniform1f(loc.u_rain!, v.env.rain / 255);
      gl.uniform1f(loc.u_flash!, f.flash);
      gl.uniform1f(loc.u_moons!, count('moon'));
      gl.uniform1f(loc.u_suns!, count('sun'));
      uploadHeavens(gl, loc, v);
      gl.uniform1f(loc.u_snow!, v.env.snowing ? 1 : 0);
      gl.uniform1f(loc.u_orb!, Math.min(8, v.sky.built ?? 0));
      gl.uniform1f(loc.u_impacts!, Math.max(0, md.impacts) / 100);
      gl.uniform1f(loc.u_aurora!, Math.min(1, Math.max(0, md.nightLight) / 80 + (v.sky.built ?? 0) / 10 + (v.env.snowing ? 0.4 : 0)));
      gl.uniform4fv(loc.u_vill!, vill);
      gl.uniform1i(loc.u_nvill!, nv);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // ---- scale up into the surface rect ----
      core.clear(v.universe.palette[0]!);
      gl.useProgram(blit);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.uniform1i(bloc.u_tex!, 0);
      gl.uniform2f(bloc.u_res!, core.width(), core.height());
      gl.uniform4f(bloc.u_rect!, v.rect.x, v.rect.y, v.rect.w, v.rect.h);
      gl.uniform2f(bloc.u_px!, 1 / fw, 1 / fh);
      core.quad(blit);
      return { ro, yaw: fp.yaw, pitch: fp.pitch, depth: target!, ground: (x: number, z: number) => groundAt(f, x, z) };
    },
  };
};
