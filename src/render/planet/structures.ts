// Buildings as sprites (part of unit 15). Each building the sim reports is drawn as a
// procedural shape that gains detail in defined steps as you zoom in: silhouettes
// first, then doors and windows, then bricks and planks, then goods and tools.
import type { GlCore } from '@/contracts/render';
import type { CivView } from '@/contracts/sim';
import { BELIEFS, BUILDING_KINDS } from '@/contracts/sim';

const VS = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_a;   // x, ground y, kind, seed
layout(location=2) in vec4 a_b;   // launch 0..1 (pads) / 1 festival, 2 plague (houses) / 1 famine (farms), faith, prosperity 0..1, true era 0..8
uniform vec3 u_cam; uniform vec2 u_grid;
out vec2 v_p; out vec4 v_a; out vec4 v_b;
void main(){
  vec2 size = vec2(10.0, 13.0);
  vec2 l = vec2(a_pos.x * 0.5 * size.x, (a_pos.y * 0.5 + 0.5) * size.y);
  v_p = l; v_a = a_a; v_b = a_b;
  vec2 w = vec2(a_a.x + l.x, a_a.y - l.y);
  vec2 q = (w - u_cam.xy) * u_cam.z / u_grid + 0.5;
  gl_Position = vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float; precision highp int;
in vec2 v_p; in vec4 v_a; in vec4 v_b; out vec4 o;
uniform float u_time, u_amb, u_night, u_zoom, u_pulse, u_wind, u_season, u_snow; uniform sampler2D u_pal;
vec3 pal(int i){ return texelFetch(u_pal, ivec2(i & 15, 0), 0).rgb; }
float h1(float n){ return fract(sin(n * 91.345) * 47453.5453); }
float bx(vec2 p, vec2 c, vec2 h){ vec2 d = abs(p - c) - h; return max(d.x, d.y); }
float seg2(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float L(float z){ return smoothstep(z, z * 1.25, u_zoom); }     // a detail layer switches on at zoom z
vec4 col = vec4(0.0); float emis = 0.0;
void put(float d, vec3 c){ float a = smoothstep(0.03, -0.03, d); col = mix(col, vec4(c, 1.0), a); if (a > 0.5) emis = 0.0; }
void glow(float d, vec3 c, float k){ float a = smoothstep(0.03, -0.03, d); col = mix(col, vec4(c, 1.0), a); if (a > 0.5) emis = k; }
void smoke(vec2 p, vec2 from){
  for (int i = 0; i < 4; i++) { float t = fract(u_time * 0.25 + float(i) * 0.25); vec2 c = from + vec2(sin(t * 5.0 + float(i)) * 0.3 + t * 0.3 + u_wind * t * t * 4.0, t * (2.6 - abs(u_wind) * 0.8));
    float a = smoothstep(0.25 + t * 0.35, 0.0, length(p - c)) * (1.0 - t) * 0.5; col = mix(col, vec4(pal(9) * 0.8, 1.0), a * max(col.a, 1.0)); col.a = max(col.a, a); }
}
void main(){
  int kind = int(v_a.z + 0.5); float seed = v_a.w; vec2 p = v_p;
  vec3 wall = pal(5) * 1.1, roof = pal(14) * 1.15, wood = pal(3), stone = pal(4), dark = pal(1), lit = pal(13) * 1.4, paper = pal(8), gold = pal(7);
  float lamp = smoothstep(0.2, 0.7, u_night);
  float prosp = v_b.z, era = v_b.w;
  vec3 snowc = pal(9) * 0.95;
  // How many windows are lit: more in later ages and in good years. The last go dark late at night.
  float sick = step(1.5, v_b.x) * step(v_b.x, 2.5);
  // Plague: the shutters stay closed.
  float lights = lamp * step(h1(seed + 3.0), (0.3 + 0.08 * era + 0.5 * prosp) * (1.0 - 0.85 * sick));
  if (kind == 0) {                                   // house
    float tall = 1.0 + 0.3 * step(0.5, h1(seed));
    put(bx(p, vec2(0.0, tall), vec2(1.4, tall)), wall * (1.0 - L(11.0) * 0.22 * max(step(0.86, fract(p.y * 2.2)), step(0.9, fract(p.x * 1.6 + floor(p.y * 2.2) * 0.5)))));
    float ry = (p.y - 2.0 * tall) / 1.4;
    put(max(abs(p.x) - 1.85 * (1.0 - ry), -ry), roof * (1.0 - L(11.0) * 0.25 * step(0.6, fract(p.y * 4.0 + p.x * 0.7))));
    float rd = abs(p.x) - 1.85 * (1.0 - ry);
    if (u_snow > 0.03) put(max(max(rd, -rd - 0.34 * u_snow), -ry), snowc);          // snow lying on the slopes
    put(bx(p, vec2(1.0, 2.0 * tall + 0.9), vec2(0.2, 0.6)), stone);
    put(bx(p, vec2(-0.55, 0.6), vec2(0.32, 0.6)), mix(wood, wood * 0.7, L(20.0) * step(0.8, fract(p.x * 8.0))));
    float win = bx(p, vec2(0.6, 1.25), vec2(0.34, 0.34));
    glow(win, mix(dark, lit * (0.8 + 0.08 * era), lights), lights);
    if (L(15.0) > 0.5) put(max(win, -min(abs(p.x - 0.6), abs(p.y - 1.25)) + 0.05), wood);
    if (tall > 1.1 && era > 1.5) { float on2 = lamp * step(h1(seed + 5.0), 0.2 + 0.7 * prosp) * (1.0 - sick); float w2 = bx(p, vec2(-0.5, 1.95), vec2(0.26, 0.26)); glow(w2, mix(dark, lit, on2), on2); }
    if (sick > 0.5 && L(9.0) > 0.5) put(min(seg2(p, vec2(-0.8, 0.25), vec2(-0.3, 0.95)), seg2(p, vec2(-0.3, 0.25), vec2(-0.8, 0.95))) - 0.05, paper);   // a pale cross on the door
    if (abs(v_b.x - 1.0) < 0.1) {
      // A festival: bunting strung from the ridge, and small lights along it after dark.
      float ax = abs(p.x), yl = 2.0 * tall + 1.25 - 0.9 * sin(3.14159 * clamp((ax - 0.2) / 4.8, 0.0, 1.0));
      float fx = fract(ax * 1.5), dn = yl - p.y;
      if (ax > 0.2 && ax < 5.0) {
        put(abs(dn) - 0.035, wood * 0.8);
        float fi = floor(ax * 1.5) + step(0.0, p.x) * 7.0;
        put(max(-dn, dn - 0.5 * (1.0 - 2.0 * abs(fx - 0.5))) + 0.03, mod(fi, 3.0) < 0.5 ? pal(13) : mod(fi, 3.0) < 1.5 ? pal(10) : pal(15));
        if (lamp > 0.1) glow(length(vec2(fx - 0.5, dn + 0.02) / vec2(1.5, 1.0)) - 0.07, mix(pal(13), pal(10), mod(fi, 2.0)) * 1.3, lamp * 1.5);
      }
    }
    if (L(8.0) > 0.5) smoke(p, vec2(1.0, 2.0 * tall + 1.5));
  } else if (kind == 1) {                            // fire
    put(bx(p, vec2(0.0, 0.12), vec2(0.55, 0.12)), wood * 0.7);
    float fl = sin(u_time * 9.0 + p.y * 5.0) * 0.08;
    glow(length(vec2((p.x + fl) * (1.0 + p.y * 0.9), p.y - 0.6)) - 0.5, mix(pal(13), pal(9), smoothstep(0.9, 0.2, p.y)), 1.6);
  } else if (kind == 2) {                            // farm
    put(bx(p, vec2(0.0, 0.06), vec2(3.4, 0.08)), pal(5) * 0.7);
    float row = floor(p.x * 1.6), fx = fract(p.x * 1.6) - 0.5;
    // Sown in spring, tall by summer, gold at harvest, stubble through the winter.
    float famine = step(0.5, v_b.x);
    float grown = smoothstep(0.02, 0.3, u_season) * (1.0 - 0.82 * smoothstep(0.56, 0.64, u_season)) * (1.0 - 0.92 * famine), ripe = smoothstep(0.3, 0.52, u_season);
    // Famine: bare cracked earth and a few dead stalks.
    if (famine > 0.5) put(bx(p, vec2(0.0, 0.1), vec2(3.4, 0.1)), mix(pal(5) * 0.55, pal(3), 0.4) * (0.8 + 0.3 * step(0.8, fract(p.x * 1.9 + seed))));
    float hgt = (0.45 + 0.5 * h1(row + seed)) * (0.18 + 0.95 * grown);
    float sway = (sin(u_time * (1.4 + abs(u_wind) * 2.0) + row) * (0.08 + abs(u_wind) * 0.12) - u_wind * 0.25) * p.y;
    if (abs(p.x) < 3.3) put(max(abs(fx + sway) - 0.16 * (1.0 - p.y / hgt) - 0.03, p.y - hgt), mix(mix(pal(15), gold, 0.2 * h1(row) + 0.7 * ripe), pal(3) * 0.8, famine));
    if (L(15.0) > 0.5 && abs(p.x) < 3.3 && grown > 0.6 && famine < 0.5) put(length(vec2(fx + sway, p.y - hgt)) - 0.11, gold);
    if (u_snow > 0.03) put(bx(p, vec2(0.0, 0.14), vec2(3.4, 0.07 * u_snow)), snowc);
    put(bx(p, vec2(3.5, 0.5), vec2(0.07, 0.5)), wood); put(bx(p, vec2(-3.5, 0.5), vec2(0.07, 0.5)), wood);
    if (L(11.0) > 0.5) { put(bx(p, vec2(2.6, 0.9), vec2(0.05, 0.9)), wood); put(bx(p, vec2(2.6, 1.4), vec2(0.5, 0.06)), wood); put(length(p - vec2(2.6, 1.95)) - 0.22, paper); }
  } else if (kind == 3) {                            // dock
    put(bx(p, vec2(1.4, 0.3), vec2(1.9, 0.09)), mix(wood, wood * 0.7, L(15.0) * step(0.85, fract(p.x * 3.0))));
    for (int i = 0; i < 4; i++) put(bx(p, vec2(-0.3 + float(i) * 1.1, 0.0), vec2(0.07, 0.35)), wood * 0.8);
    float bob = sin(u_time * 1.5 + seed) * 0.08;
    vec2 b = p - vec2(4.0, 0.1 + bob);
    put(max(length(b * vec2(1.0, 2.2)) - 0.95, b.y), wood * 1.2);
    if (L(8.0) > 0.5) { put(bx(b, vec2(0.0, 0.8), vec2(0.04, 0.8)), wood); put(max(max(b.x - 0.75, -b.x + 0.05), abs(b.y - 0.95) - 0.55 + b.x * 0.5), paper); }
    if (L(20.0) > 0.5) put(length(p - vec2(2.9, 0.55)) - 0.14, gold);
  } else if (kind == 4) {                            // mine
    put(max(length(p * vec2(1.0, 1.25)) - 2.3, -p.y), stone * (0.8 + 0.25 * step(0.5, h1(floor(p.x * 2.0) + floor(p.y * 2.0) * 7.0))));
    put(max(length(vec2(p.x, max(p.y - 0.7, 0.0))) - 0.75, -p.y), dark * 0.5);
    put(bx(p, vec2(-0.8, 0.7), vec2(0.09, 0.7)), wood); put(bx(p, vec2(0.8, 0.7), vec2(0.09, 0.7)), wood); put(bx(p, vec2(0.0, 1.45), vec2(0.95, 0.09)), wood);
    vec2 c = p - vec2(2.9 + sin(u_time * 0.6 + seed) * 0.5, 0.0);
    put(bx(c, vec2(0.0, 0.4), vec2(0.45, 0.22)), wood * 1.2); put(length(c - vec2(-0.25, 0.14)) - 0.14, dark); put(length(c - vec2(0.25, 0.14)) - 0.14, dark);
    if (L(11.0) > 0.5) { put(length(c - vec2(-0.15, 0.68)) - 0.13, gold); put(length(c - vec2(0.15, 0.7)) - 0.12, gold * 0.8); }
    if (L(15.0) > 0.5) put(bx(p, vec2(2.4, 0.02), vec2(1.6, 0.03)), dark);
  } else if (kind == 5) {                            // workshop
    put(bx(p, vec2(0.0, 1.15), vec2(2.0, 1.15)), wall * 0.9 * (1.0 - L(11.0) * 0.2 * step(0.88, fract(p.y * 2.2))));
    put(max(bx(p, vec2(0.0, 2.55), vec2(2.25, 0.3)), p.y - 2.75 + p.x * 0.08), roof * 0.8);
    if (u_snow > 0.03) put(max(bx(p, vec2(0.0, 2.78), vec2(2.25, 0.16 * u_snow)), p.y - 2.75 - 0.3 * u_snow + p.x * 0.08), snowc);
    put(bx(p, vec2(-1.4, 3.6), vec2(0.3, 1.1)), stone);
    float forge = bx(p, vec2(0.6, 0.75), vec2(0.6, 0.6));
    glow(forge, mix(pal(14), pal(9), 0.5 + 0.5 * sin(u_pulse * 6.2831 + p.y * 3.0)), 1.5);
    put(bx(p, vec2(-1.1, 0.65), vec2(0.34, 0.65)), wood * 0.8);
    smoke(p, vec2(-1.4, 4.8));
    if (L(11.0) > 0.5) for (int i = 0; i < 3; i++) { float t = fract(u_time * 0.9 + float(i) * 0.37); glow(length(p - vec2(0.6 + sin(float(i) * 9.0 + t * 4.0) * 0.5, 1.2 + t * 1.6)) - 0.05 * (1.0 - t), pal(9), 2.0); }
    if (L(15.0) > 0.5) { put(bx(p, vec2(2.8, 0.45), vec2(0.36, 0.12)), dark); put(bx(p, vec2(2.8, 0.2), vec2(0.14, 0.2)), dark); }
  } else if (kind == 6) {                            // market
    put(bx(p, vec2(-1.7, 1.0), vec2(0.07, 1.0)), wood); put(bx(p, vec2(1.7, 1.0), vec2(0.07, 1.0)), wood);
    put(max(bx(p, vec2(0.0, 2.2), vec2(2.1, 0.32)), -(p.y - 1.9 - 0.12 * abs(sin(p.x * 4.7)))), mix(paper, pal(14) * 1.2, step(0.5, fract(p.x * 1.2 + seed))));
    put(bx(p, vec2(0.0, 0.55), vec2(1.6, 0.16)), wood * 1.15);
    put(bx(p, vec2(-1.2, 0.2), vec2(0.08, 0.3)), wood); put(bx(p, vec2(1.2, 0.2), vec2(0.08, 0.3)), wood);
    if (L(11.0) > 0.5) for (int i = 0; i < 5; i++) put(length(p - vec2(-1.2 + float(i) * 0.6, 0.86)) - 0.16, i % 3 == 0 ? gold : i % 3 == 1 ? pal(15) : pal(13));
    if (L(15.0) > 0.5) glow(length(p - vec2(0.0, 1.55)) - 0.13, mix(wood, lit, lamp), lamp * 1.5);
    if (L(20.0) > 0.5) put(bx(p, vec2(2.5, 0.25), vec2(0.3, 0.25)), wood * 0.9);
  } else if (kind == 7) {                            // storehouse
    put(bx(p, vec2(0.0, 0.95), vec2(1.8, 0.95)), wood * 1.25 * (1.0 - L(11.0) * 0.25 * step(0.85, fract(p.x * 2.5))));
    float dome = length(vec2(p.x, (p.y - 1.9) * 1.9)) - 1.95;
    put(max(dome, -(p.y - 1.9)), roof * 0.75);
    if (u_snow > 0.03) put(max(max(dome, -dome - 0.3 * u_snow), -(p.y - 2.2)), snowc);
    put(bx(p, vec2(0.0, 0.65), vec2(0.6, 0.65)), dark);
    if (L(11.0) > 0.5) { put(length((p - vec2(2.5, 0.3)) * vec2(1.0, 1.3)) - 0.36, paper * 0.85); put(length((p - vec2(3.0, 0.28)) * vec2(1.0, 1.3)) - 0.32, paper * 0.75); put(length((p - vec2(2.75, 0.75)) * vec2(1.0, 1.3)) - 0.3, paper * 0.8); }
  } else if (kind == 8) {                            // shrine
    put(bx(p, vec2(0.0, 0.12), vec2(1.5, 0.12)), stone); put(bx(p, vec2(0.0, 0.32), vec2(1.2, 0.1)), stone * 1.1);
    put(bx(p, vec2(-0.85, 1.4), vec2(0.14, 1.0)), stone * 1.2); put(bx(p, vec2(0.85, 1.4), vec2(0.14, 1.0)), stone * 1.2);
    put(bx(p, vec2(0.0, 2.5), vec2(1.25, 0.14)), stone * 1.25);
    float orb = length(p - vec2(0.0, 1.35 + 0.08 * sin(u_time * 2.0))) - (0.3 + 0.05 * sin(u_pulse * 6.2831));
    glow(orb, mix(pal(10), pal(13), fract(v_b.y * 0.37)), 1.8);
  } else if (kind == 9) {                            // bell tower
    put(bx(p, vec2(0.0, 3.6), vec2(0.6, 3.6)), stone * (1.1 - L(11.0) * 0.2 * step(0.86, fract(p.y * 2.0))));
    put(bx(p, vec2(0.0, 7.4), vec2(0.85, 0.2)), stone * 1.25);
    float ry = (p.y - 7.6) / 1.2; float rt = abs(p.x) - 0.9 * (1.0 - ry); put(max(rt, -ry), roof);
    if (u_snow > 0.03) put(max(max(rt, -rt - 0.3 * u_snow), -ry), snowc);
    glow(bx(p, vec2(0.0, 6.4), vec2(0.3, 0.45)), mix(dark, lit, lamp), lamp * (1.0 + 0.6 * prosp));
    if (L(15.0) > 0.5) put(length(p - vec2(sin(u_time * 2.0) * 0.12, 6.25)) - 0.16, gold);
  } else {                                           // launch pad
    put(bx(p, vec2(0.0, 0.1), vec2(2.4, 0.1)), stone);
    float lat = step(0.8, fract(p.y * 1.5)) + step(0.8, fract((p.y + p.x) * 1.5));
    put(max(bx(p, vec2(-1.4, 3.0), vec2(0.35, 3.0)), 0.5 - lat), wood * 1.3);
    float up = v_b.x * v_b.x * 60.0;                 // the rocket leaves
    vec2 r = p - vec2(0.3, 0.3 + up);
    put(max(abs(r.x) - 0.42, abs(r.y - 2.2) - 2.0), paper);
    float ny = (r.y - 4.2) / 1.1; put(max(abs(r.x) - 0.42 * (1.0 - ny), -ny), pal(14) * 1.2);
    put(max(abs(r.x) - 0.9 * (1.0 - r.y / 1.0), max(-r.y + 0.2, r.y - 1.0)), pal(14));
    if (L(11.0) > 0.5) glow(length(r - vec2(0.0, 3.2)) - 0.17, pal(10), 1.0);
    if (v_b.x > 0.001) glow(max(abs(r.x) - 0.35 * (1.0 + r.y * 0.3), max(r.y - 0.2, -r.y - 2.5 - sin(u_time * 30.0) * 0.4)), mix(pal(9), pal(13), clamp(-r.y / 2.5, 0.0, 1.0)), 2.0);
  }
  if (col.a < 0.02) discard;
  vec3 c = emis > 0.0 ? col.rgb * max(emis, 0.6) : col.rgb * u_amb;
  o = vec4(c * col.a, col.a);
}`;

export const createStructures = (core: GlCore) => {
  const gl = core.gl;
  const prog = core.program(VS, FS);
  const names = ['u_cam', 'u_grid', 'u_time', 'u_amb', 'u_night', 'u_zoom', 'u_pulse', 'u_wind', 'u_season', 'u_snow', 'u_pal'];
  const loc = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])) as Record<string, WebGLUniformLocation | null>;
  const MAXN = 160;
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

  return {
    draw: (o: {
      civ: CivView; top: Uint8Array; view: { cx: number; cy: number; zoom: number };
      rect: { x: number; y: number; w: number; h: number }; W: number; H: number;
      time: number; amb: number; night: number; pulse: number; pal: WebGLTexture;
      /** -1..1, 0..1 through the year, 0..1 snow lying. */
      wind: number; season: number; snow: number;
    }) => {
      let n = 0;
      const launch = o.civ.launchAge < 100 ? Math.max(0.001, o.civ.launchAge / 100) : 0;
      // An older sim does not say when there is a festival: fall back to good years.
      const live = o.civ.age !== undefined;
      for (const v of o.civ.villages) {
        for (const b of v.buildings) {
          if (n >= MAXN) break;
          const x = Math.max(1, Math.min(o.W - 2, b.x));
          // Stand on the lowest of the three columns under it, so nothing floats.
          const gy = Math.max(o.top[x - 1]!, o.top[x]!, o.top[x + 1]!);
          const k = n * 8;
          data[k] = x + 0.5; data[k + 1] = gy; data[k + 2] = BUILDING_KINDS.indexOf(b.kind); data[k + 3] = b.seed + v.id * 7;
          data[k + 4] = b.kind === 'pad' ? launch : b.kind === 'house' ? (v.state === 'plague' ? 2 : v.state === 'festival' || (live === false && v.prosperity > 64) ? 1 : 0) : b.kind === 'farm' && v.food < 40 && v.souls > 0 ? 1 : 0; data[k + 5] = BELIEFS.indexOf(v.belief); data[k + 6] = Math.max(0, Math.min(1, v.prosperity / 100)); data[k + 7] = v.era ?? v.tech;
          n++;
        }
      }
      if (!n) return;
      const sx = core.canvas.width / Math.max(1, core.width()), sy = core.canvas.height / Math.max(1, core.height());
      const vx = Math.round(o.rect.x * sx), vw = Math.round(o.rect.w * sx), vh = Math.round(o.rect.h * sy);
      const vy = Math.round(core.canvas.height - (o.rect.y + o.rect.h) * sy);
      gl.viewport(vx, vy, vw, vh);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(vx, vy, vw, vh);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog);
      gl.uniform3f(loc.u_cam!, o.view.cx, o.view.cy, o.view.zoom);
      gl.uniform2f(loc.u_grid!, o.W, o.H);
      gl.uniform1f(loc.u_time!, o.time % 10000);
      gl.uniform1f(loc.u_amb!, o.amb);
      gl.uniform1f(loc.u_night!, o.night);
      gl.uniform1f(loc.u_zoom!, o.view.zoom);
      gl.uniform1f(loc.u_pulse!, o.pulse);
      gl.uniform1f(loc.u_wind!, o.wind);
      gl.uniform1f(loc.u_season!, o.season);
      gl.uniform1f(loc.u_snow!, o.snow);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, o.pal);
      gl.uniform1i(loc.u_pal!, 0);
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
export type Structures = ReturnType<typeof createStructures>;
