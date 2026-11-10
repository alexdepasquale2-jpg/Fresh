// Planet renderer (unit 15). One fragment shader composes:
// sky (day/night, dusk, stars, suns, moons, rings, comet, belt, wind-blown fbm clouds, dust haze,
// lightning), materials (per-cell grain, rock strata, water depth + shimmer, seasonal moss,
// emissive fire, ice sparkle, heat glow and frost from the temperature field, depth darkness)
// and a CPU-written overlay (houses, windows lit at night, chimney smoke, bell towers,
// bonfires, walking people with lamps, rain and snow), with village light halos on the pulse.
import type { PlanetRendererFactory, GlCore } from '@/contracts/render';
import { ENGINE, FIELD, ROLE } from '@/contracts/sim';
import { FULLSCREEN_VS } from '@/render/gl';
import { FX_ONE } from '@/core/fixed';

const O = { person: 1, wall: 2, roof: 3, window: 4, smoke: 5, rain: 6, snow: 7, lamp: 8, bonfire: 9, tower: 10, launch: 11, priest: 12, travel: 13, avatar: 14, attack: 15 } as const;
const KIND = { empty: 0, solid: 1, powder: 2, liquid: 3, gas: 4, fire: 5, life: 6 } as const;

const FS = `#version 300 es
precision highp float; precision highp usampler2D;
in vec2 v_uv; out vec4 o;
uniform vec2 u_res; uniform vec4 u_rect; uniform vec2 u_grid;
uniform usampler2D u_cells, u_over, u_mat, u_top;
uniform sampler2D u_temp, u_hum, u_pal;
uniform float u_day, u_season, u_time, u_pulse, u_nl, u_dim, u_warm, u_dust, u_wind, u_rain, u_flash;
uniform float u_moons, u_suns, u_rings, u_comet, u_belt;
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
  vec2 gp = q * u_grid; ivec2 g = ivec2(floor(gp)); vec2 gc = vec2(g) + 0.5;
  float sunUp = -cos(u_day * 6.2831853);
  float daylight = smoothstep(-0.3, 0.35, sunUp);
  float dusk = exp(-pow(sunUp * 3.5, 2.0));
  float hum = texture(u_hum, vec2(q.x, 0.5)).r;
  float T = texture(u_temp, q).r;
  float autumn = smoothstep(0.45, 0.6, u_season) * smoothstep(0.85, 0.7, u_season);
  float winter = smoothstep(0.62, 0.75, u_season) * smoothstep(0.98, 0.85, u_season);
  float amb = mix(0.24 + u_nl * 0.4 + u_moons * 0.08, 1.0, daylight) * (1.0 - u_dim * 0.45) * (1.0 - hum * 0.22);

  // ---------- sky ----------
  vec3 dayTop = mix(pal(12), pal(9), 0.25);
  vec3 horizon = mix(pal(9), pal(13), dusk * 0.65);
  vec3 skyDay = mix(dayTop, horizon, smoothstep(0.0, 0.65, q.y));
  vec3 skyNight = mix(pal(0) * 0.7, pal(2), q.y * 0.8);
  vec3 sky = mix(skyNight, skyDay, daylight) + pal(14) * dusk * 0.3 * smoothstep(0.15, 0.6, q.y);
  sky = mix(sky, pal(14) * 0.6 + pal(7) * 0.2, u_dust * 0.55);
  // stars
  float st = h21(floor(gp * 0.7));
  if (st > 0.985) sky += pal(9) * (1.0 - daylight) * (1.0 - hum) * (0.4 + 0.6 * sin(u_time * 3.0 + st * 400.0)) * (1.0 - u_dust);
  // belt: a dusty band of glints
  if (u_belt > 0.5) { float by = abs(gp.y - (18.0 + sin(gp.x * 0.03) * 4.0)); sky += pal(7) * smoothstep(3.0, 0.0, by) * (0.12 + 0.5 * step(0.93, h21(floor(gp)))) * (0.4 + 0.6 * (1.0 - daylight)); }
  // rings: a wide arc
  if (u_rings > 0.5) { float ry = 34.0 + pow((gp.x - u_grid.x * 0.5) / u_grid.x, 2.0) * 120.0; float rd = abs(gp.y - ry);
    sky = mix(sky, mix(pal(8), pal(9), 0.5) * (0.5 + 0.5 * daylight + u_nl * 0.4), smoothstep(2.6, 0.6, rd) * 0.5 + smoothstep(5.0, 3.6, rd) * smoothstep(3.4, 3.8, rd) * 0.25); }
  // suns
  for (int s = 0; s < 3; s++) {
    if (float(s) >= 1.0 + u_suns) break;
    float ph = u_day - 0.25 + float(s) * 0.07;
    vec2 sp = vec2(ph * 2.0 * u_grid.x, (0.62 - sin(3.14159 * clamp(ph * 2.0, 0.0, 1.0)) * 0.5) * u_grid.y);
    float d = length(gp - sp);
    vec3 sc = s == 0 ? pal(9) : pal(13);
    sky += sc * (smoothstep(5.5 - float(s), 4.0 - float(s), d) * 1.2 + exp(-d * 0.12) * 0.25) * step(0.0, ph) * step(ph, 0.5);
  }
  // moons
  for (int m = 0; m < 2; m++) {
    if (float(m) >= u_moons) break;
    float ph = fract(u_day + 0.25 + float(m) * 0.31 + u_time * 0.001 * float(m + 1));
    vec2 mp = vec2(ph * 2.0 * u_grid.x, (0.6 - sin(3.14159 * clamp(ph * 2.0, 0.0, 1.0)) * 0.45) * u_grid.y);
    float md = disc(gp, mp, 4.0 - float(m));
    float shade = smoothstep(-1.0, 2.0, (gp - mp).x + sin(u_season * 6.28) * 3.0);
    sky = mix(sky, mix(pal(3), pal(9), shade), md * step(ph, 0.5));
  }
  // comet with tail
  if (u_comet > 0.5) { float cx = fract(u_time * 0.004) * 1.4 - 0.2; vec2 cp = vec2(cx * u_grid.x, 26.0 + cx * 18.0);
    vec2 rel = gp - cp; float along = dot(rel, normalize(vec2(-1.0, -0.4)));
    float across = abs(dot(rel, normalize(vec2(0.4, -1.0))));
    sky += pal(10) * (disc(gp, cp, 2.2) + smoothstep(0.0, 1.0, along) * smoothstep(40.0, 0.0, along) * smoothstep(1.5 + along * 0.08, 0.0, across) * 0.6); }
  // clouds driven by humidity, pushed by the wind
  float cn = fbm(vec2(gp.x * 0.045 - u_time * u_wind * 0.02, gp.y * 0.11 + u_time * 0.01));
  float cloud = smoothstep(0.42, 0.75, cn + hum * 1.3 - 0.3) * smoothstep(0.6, 0.05, q.y);
  vec3 cloudCol = mix(pal(2), pal(9), daylight * 0.85) * (1.0 - hum * 0.45) + pal(14) * dusk * 0.25;
  sky = mix(sky, cloudCol, cloud * 0.9);
  sky += pal(9) * u_flash * (0.6 + cloud);

  // ---------- surface ----------
  uint m = texelFetch(u_cells, g, 0).r;
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
    if (kind == 1u) base *= 0.82 + 0.18 * noise(vec2(g) * vec2(0.18, 0.9)) + 0.12 * n;       // strata
    else if (kind == 2u) base *= 0.85 + 0.3 * n;                                                // grains
    else if (kind == 3u) {                                                                       // water
      base = mix(base, pal(12) * 0.6, clamp(depth / 45.0, 0.0, 0.85));
      base = mix(base, sky, 0.18 * smoothstep(3.0, 0.0, depth));
      base += pal(9) * 0.18 * smoothstep(1.5, 0.0, depth) * (0.5 + 0.5 * sin(gp.x * 0.9 + u_time * 2.5 + sin(gp.x * 0.13) * 3.0));
      base += pal(10) * 0.05 * step(0.8, noise(gp * 0.4 + u_time * 0.6)) * smoothstep(20.0, 2.0, depth);
    }
    else if (kind == 4u) base = mix(base, pal(9), 0.3);
    else if (kind == 5u) { base = mix(pal(13), pal(9), noise(gp * 0.6 + vec2(0.0, u_time * 5.0))); emissive = 1.0; }
    else if (kind == 6u) { base *= 0.8 + 0.35 * n; base = mix(base, pal(14), autumn * 0.55); base = mix(base, pal(9) * 0.8, winter * 0.3 * step(depth, 1.5)); }
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
  if (ov != 0u) {
    float night = 1.0 - daylight;
    if (ov == 1u || ov == 13u) col = mix(pal(8), pal(5), float(g.y & 1)) * (0.35 + 0.65 * amb);
    else if (ov == 12u) col = mix(pal(9), pal(10), 0.4) * (0.5 + 0.5 * amb);
    else if (ov == 8u) { col = pal(10) * 1.3; emissive = 1.0; }
    else if (ov == 2u) col = pal(5) * 1.1 * amb;
    else if (ov == 3u) col = pal(14) * 1.15 * amb;
    else if (ov == 4u) { col = mix(pal(2) * amb, pal(13) * 1.3, smoothstep(0.2, 0.8, night)); }
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
    for (const k of ['u_res', 'u_rect', 'u_grid', 'u_cells', 'u_over', 'u_mat', 'u_top', 'u_temp', 'u_hum', 'u_pal', 'u_day', 'u_season', 'u_time', 'u_pulse', 'u_nl', 'u_dim', 'u_warm', 'u_dust', 'u_wind', 'u_rain', 'u_flash', 'u_moons', 'u_suns', 'u_rings', 'u_comet', 'u_belt', 'u_vill', 'u_nvill']) loc[k] = gl.getUniformLocation(prog, k);
    W = H = 0;
    matKey = '';
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
        for (let x = 0; x < W; x++) {
          let y = 0;
          while (y < H - 1 && (g.cells[y * W + x] === 0 || g.cells[y * W + x] === 5)) y++;
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

      // ---- overlay ----
      over.fill(0);
      const night = env.day < 230 || env.day > 770;
      let nv = 0;
      vill.fill(0);
      for (const vg of v.civ.villages) {
        const houses = Math.min(7, 1 + (vg.souls >> 3));
        const hh = 2 + (vg.tech >= 2 ? 1 : 0);
        for (let k = 0; k < houses; k++) {
          const off = (k % 2 ? -1 : 1) * (3 + (k >> 1) * 6) - 1;
          const hx = vg.x + off;
          if (hx < 1 || hx > W - 4) continue;
          const gy = Math.min(top[hx]!, top[hx + 1]!, top[hx + 2]!) - 1;
          for (let yy = 0; yy < hh; yy++) for (let xx = 0; xx < 3; xx++) put(hx + xx, gy - yy, xx === 1 && yy === hh - 1 ? O.window : O.wall);
          for (let xx = -1; xx <= 3; xx++) put(hx + xx, gy - hh, O.roof);
          put(hx + 1, gy - hh - 1, O.roof);
          if (vg.tech >= 1 && k === 0) {
            for (let j = 0; j < 5; j++) {
              const sx = Math.round(hx + 2 + Math.sin(time * 1.5 + j) * 0.8 + (env.wind * j) / 60);
              const sy = gy - hh - 2 - j - (Math.floor(time * 4) % 2);
              put(sx, sy, O.smoke);
            }
          }
        }
        const gy = top[vg.x]! - 1;
        if (vg.tech >= 1) put(vg.x, gy, O.bonfire);
        if (vg.tech >= 4) {
          for (let j = 1; j < 8; j++) put(vg.x, gy - j, O.tower);
          put(vg.x, gy - 8, O.window);
        }
        if (vg.tech >= 5 && Math.floor(time) % 7 === vg.id % 7) put(vg.x, gy - 10 - Math.floor((time % 1) * 60), O.launch);
        if (nv < 12) {
          vill.set([vg.x, gy - 1, 6 + Math.min(14, vg.souls / 4), (night ? 1 : 0.3) * (0.5 + vg.tech * 0.15)], nv * 4);
          nv++;
        }
      }
      const pp = v.civ.people;
      for (let i = 0; i < v.civ.peopleCount; i++) {
        const x = pp[i * 4]!, y = pp[i * 4 + 1]!, role = pp[i * 4 + 2]!;
        const code = role === ROLE.lamp ? O.lamp : role === ROLE.pray || role === ROLE.kneel ? O.priest : role === ROLE.travel ? O.travel : role === ROLE.attack ? O.attack : O.person;
        put(x, y, role === ROLE.attack ? O.attack : O.person);
        if (role === ROLE.kneel) { put(x, y - 1, O.priest); continue; }
        put(x, y - 1, code === O.person ? O.person : code);
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
      const av = v.civ.avatar;
      if (av) {
        for (let j = 0; j < 4; j++) put(av.x, av.y - j, O.avatar);
        put(av.x - 1, av.y - 2, O.avatar); put(av.x + 1, av.y - 2, O.avatar);
        if (nv < 12) { vill.set([av.x, av.y - 2, 10, 1.2 * (av.hp / 100) + 0.3], nv * 4); nv++; }
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
      gl.uniform1f(loc.u_rings!, count('rings') ? 1 : 0);
      gl.uniform1f(loc.u_comet!, count('comet') ? 1 : 0);
      gl.uniform1f(loc.u_belt!, count('belt') ? 1 : 0);
      gl.uniform4fv(loc.u_vill!, vill);
      gl.uniform1i(loc.u_nvill!, nv);
      core.quad(prog);
    },
    dispose: () => { core = null; },
  };
};
