// People as animated sprites (part of unit 15). The sim moves people a whole cell at a
// time; here each person (by stable id) eases toward their cell, so walking is smooth,
// and each role has its own pose: walking legs, a raised club, a load on the head,
// kneeling, dancing, talking, fishing, fleeing. Drawn as instanced quads over the map
// and as depth-tested billboards in first person.
import type { GlCore } from '@/contracts/render';
import type { CivView } from '@/contracts/sim';
import { PERSON_STRIDE, ROLE } from '@/contracts/sim';

const VS = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_a;   // x, y (feet, world), z, role (+100 for the notable)
layout(location=2) in vec4 a_b;   // walk phase, facing * (1 + mark: 1 at arms, 2 sick), moving 0..1, seed
uniform int u_mode;               // 0 map, 1 first person
uniform vec4 u_cam;               // map: view cx, cy, zoom, _ ; fp: yaw, pitch, aspect, _
uniform vec3 u_ro; uniform vec2 u_grid;
out vec2 v_p; out vec4 v_b; out float v_role; out float v_dist; out float v_mark;
void main(){
  float mark = step(99.5, a_a.w), role = a_a.w - 100.0 * mark;
  float big = role > 98.5 ? 1.35 : 1.0 + 0.12 * mark;
  vec2 size = vec2(2.2, 3.0) * big;        // sprite box in cells
  vec2 l = vec2(a_pos.x * 0.5 * size.x, (a_pos.y * 0.5 + 0.5) * size.y);
  v_p = l / big; v_b = a_b; v_role = role; v_dist = 0.0; v_mark = mark;
  if (u_mode == 0) {
    vec2 w = vec2(a_a.x + l.x, a_a.y - l.y);
    vec2 q = (w - u_cam.xy) * u_cam.z / u_grid + 0.5;
    gl_Position = vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0);
  } else {
    float cy = cos(u_cam.x), sy = sin(u_cam.x), cp = cos(u_cam.y), sp = sin(u_cam.y);
    vec3 fwd = vec3(cy * cp, sp, sy * cp), right = vec3(-sy, 0.0, cy), upv = cross(right, fwd);
    vec3 pos = vec3(a_a.x, a_a.y, a_a.z) + right * l.x + vec3(0.0, l.y, 0.0);
    vec3 rel = pos - u_ro;
    float cz = dot(rel, fwd);
    v_dist = length(rel);
    gl_Position = vec4(dot(rel, right) / (u_cam.z * 0.75), dot(rel, upv) / 0.75, 0.0, cz);
  }
}`;

const FS = `#version 300 es
precision highp float; precision highp int;
in vec2 v_p; in vec4 v_b; in float v_role; in float v_dist; in float v_mark; out vec4 o;
uniform int u_mode; uniform float u_time, u_amb, u_night, u_zoom; uniform sampler2D u_pal, u_depth; uniform vec4 u_vp;
vec3 pal(int i){ return texelFetch(u_pal, ivec2(i & 15, 0), 0).rgb; }
float seg(vec2 p, vec2 a, vec2 b, float r){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r; }
void main(){
  int role = int(v_role + 0.5);
  float ph = v_b.x, face = sign(v_b.y), mv = v_b.z, seed = v_b.w;
  int tag = int(abs(v_b.y) - 0.5);                      // what weighs on their village: 1 at arms, 2 sick
  vec2 p = vec2(v_p.x * face, v_p.y);
  float t = u_time + seed * 10.0;
  // ---- pose ----
  float hip = 0.95, sh = 1.6, headY = 2.05, lean = 0.0, bob = 0.0, squat = 0.0;
  float sw = sin(ph) * 0.34 * mv;                        // leg swing
  vec2 handF = vec2(0.22 + sw * 0.5, 1.05), handB = vec2(-0.22 - sw * 0.5, 1.05);
  float extra = 9.0; vec3 extraCol = vec3(0.0); float emis = 0.0;
  if (role == ${ROLE.attack}) { lean = 0.18; float sw2 = sin(t * 11.0); handF = vec2(0.45, 1.75 + sw2 * 0.35);
    extra = seg(p, handF, handF + vec2(0.35 + sw2 * 0.2, 0.55 - sw2 * 0.3), 0.05); extraCol = pal(3); }
  else if (role == ${ROLE.flee}) { lean = 0.32; handF = vec2(-0.3, 1.9); handB = vec2(-0.45, 1.7); }
  else if (role == ${ROLE.kneel} || role == ${ROLE.pray}) { squat = 0.45; float bw = 0.5 + 0.5 * sin(t * 1.6); lean = 0.15 + 0.25 * bw; handF = vec2(0.4, 1.2 - 0.3 * bw); handB = vec2(0.35, 1.1 - 0.3 * bw); }
  else if (role == ${ROLE.listen}) { squat = 0.4; handF = vec2(0.15, 0.75); handB = vec2(-0.15, 0.75); }
  else if (role == ${ROLE.dance}) { bob = abs(sin(t * 6.0)) * 0.28; float a = sin(t * 6.0); handF = vec2(0.45, 1.95 + a * 0.2); handB = vec2(-0.45, 1.95 - a * 0.2); sw = a * 0.25; }
  else if (role == ${ROLE.carry}) { handF = vec2(0.2, 2.25); handB = vec2(-0.2, 2.25);
    extra = max(abs(p.x) - 0.3, abs(p.y - 2.52 - bob) - 0.17); extraCol = pal(7); }
  else if (role == ${ROLE.farm}) { lean = 0.38 + 0.1 * sin(t * 4.0); handF = vec2(0.55, 0.55 + 0.2 * sin(t * 4.0)); handB = vec2(0.45, 0.7);
    extra = seg(p, handF, handF + vec2(0.1, -0.5), 0.04); extraCol = pal(3); }
  else if (role == ${ROLE.fish}) { handF = vec2(0.4, 1.35); extra = min(seg(p, handF, vec2(1.0, 2.2), 0.03), seg(p, vec2(1.0, 2.2), vec2(1.02, 0.5 + 0.1 * sin(t * 2.0)), 0.015)); extraCol = pal(3); }
  else if (role == ${ROLE.chat}) { float a = sin(t * 5.0); handF = vec2(0.4, 1.3 + 0.25 * a); headY += 0.03 * a; }
  else if (role == ${ROLE.lamp}) { handF = vec2(0.42, 1.5); extra = length(p - handF - vec2(0.0, 0.12)) - 0.13; extraCol = pal(10); emis = 1.0; }
  else if (role == ${ROLE.watch}) { handF = vec2(0.28, 1.95); }
  else if (role == ${ROLE.mine}) { float a = sin(t * 6.0); lean = 0.2 + 0.12 * a; handF = vec2(0.5, 1.5 + 0.5 * a); handB = vec2(0.4, 1.4 + 0.45 * a);
    extra = min(seg(p, handF, handF + vec2(0.25, 0.6), 0.04), seg(p, handF + vec2(-0.1, 0.62), handF + vec2(0.6, 0.5), 0.06)); extraCol = pal(4); }
  else if (role == ${ROLE.craft} || role == ${ROLE.build}) { float a = max(sin(t * 8.0), 0.0); lean = 0.12; handF = vec2(0.45, 1.25 + 0.6 * a);
    extra = min(seg(p, handF, handF + vec2(0.1, 0.4), 0.04), max(abs(p.x - handF.x - 0.12) - 0.17, abs(p.y - handF.y - 0.48) - 0.1)); extraCol = pal(4); }
  else if (role == ${ROLE.trade}) { lean = 0.1; extra = max(abs(p.x + 0.42) - 0.26, abs(p.y - 1.45) - 0.34); extraCol = pal(7); handB = vec2(-0.3, 1.5); }
  else if (role == ${ROLE.travel}) { lean = 0.16; handF = vec2(0.3, 1.5);                              // on the road with what they could carry
    extra = min(seg(p, handF, vec2(-0.7, 2.15), 0.035), length(p - vec2(-0.7, 2.0)) - 0.25); extraCol = pal(8) * 0.8; }
  else if (role == 99) { float a = sin(t * 3.0); handF = vec2(0.45, 1.3 + 0.1 * a); handB = vec2(-0.45, 1.3 - 0.1 * a); }
  bool armed = tag == 1 && extra > 8.0 && role != ${ROLE.dance} && role != 99;
  if (armed) { handF = vec2(0.4, 1.3); extra = min(seg(p, vec2(0.42, 0.1), vec2(0.46, 2.75), 0.04), max(abs(p.x - 0.46) - 0.1 * (1.0 - (p.y - 2.75) / 0.3), 2.75 - p.y)); extraCol = pal(4) * 1.3; }
  if (tag == 2) { lean += 0.3; sw *= 0.4; }
  p.y -= bob;
  float k = 1.0 - squat;                                  // kneeling folds the legs
  vec2 hipP = vec2(0.0, hip * k), shP = vec2(lean, hip * k + (sh - hip)), headP = vec2(lean * 1.3, hip * k + (headY - hip));
  handF.y -= hip * squat; handB.y -= hip * squat;
  float legs = squat > 0.2
    ? min(seg(p, hipP, vec2(0.35, 0.08), 0.1), seg(p, vec2(0.35, 0.08), vec2(-0.15, 0.08), 0.09))
    : min(seg(p, hipP, vec2(sw, 0.08), 0.1), seg(p, hipP, vec2(-sw, 0.08), 0.1));
  float torso = seg(p, hipP, shP, 0.2);
  float arms = min(seg(p, shP, handF, 0.075), seg(p, shP, handB, 0.075));
  float head = length(p - headP) - 0.27;
  float d = min(min(legs, torso), min(arms, head));
  // The one the chronicle follows: a pale hood and cloak, and a tall staff with a bone cap.
  float staff = 9.0, hood = 9.0;
  if (v_mark > 0.5) {
    vec2 foot = vec2(-0.5, 0.05), tip = vec2(-0.5 + lean * 0.5, 2.62 - hip * squat);
    staff = min(seg(p, foot, tip, 0.05), length(p - tip - vec2(0.0, 0.1)) - 0.12);
    hood = length(p - headP - vec2(-0.03, 0.03)) - 0.35;
    d = min(d, hood);
  }
  float all = min(min(d, extra), staff);
  float aa = fwidth(all) * 0.9 + 0.001;
  float alpha = smoothstep(aa, -aa, all);
  if (alpha < 0.02) discard;
  // ---- colour ----
  vec3 cloth = role == ${ROLE.attack} ? pal(13) : role == ${ROLE.kneel} || role == ${ROLE.pray} || role == ${ROLE.listen} ? pal(9) : mix(mix(pal(5), pal(12), step(0.5, seed)), pal(14), step(0.8, fract(seed * 7.3)));
  if (armed) cloth = mix(cloth, pal(13), 0.6);
  if (tag == 2) cloth = mix(pal(9), pal(15), 0.3) * 0.7;
  vec3 col = head < min(min(legs, torso), arms) ? (tag == 2 ? mix(pal(8), pal(9), 0.5) : pal(8)) : (legs < torso ? cloth * 0.6 : cloth);
  col *= 0.75 + 0.25 * smoothstep(0.1, -0.1, p.x - lean);   // a little form
  col *= u_amb;
  // Closer layers add a belt, then eyes.
  float zl = u_mode == 1 ? 40.0 : u_zoom;
  if (zl > 14.0 && torso < 0.0 && abs(p.y - hipP.y - 0.12) < 0.05) col = pal(3) * u_amb;
  if (zl > 19.0 && head < 0.0) { vec2 e = p - headP; if (length(vec2(abs(e.x - 0.08) - 0.08, e.y - 0.03)) < 0.035) col = pal(0); }
  if (zl > 26.0 && head < -0.02 && (p.y - headP.y) > 0.13) col = mix(pal(3), pal(1), step(0.5, seed)) * u_amb;   // hair
  if (v_mark > 0.5) {
    vec3 pale = mix(pal(9), pal(8), 0.35);
    if (torso < min(legs, min(arms, head))) col = pale * 0.8 * (0.75 + 0.25 * smoothstep(0.1, -0.1, p.x - lean)) * u_amb;
    // The hood covers all but the face.
    if (hood < 0.0 && !(head < 0.0 && p.x - headP.x > 0.06 && p.y - headP.y < 0.13)) col = pale * u_amb;
  }
  if (extra < d) { col = extraCol * (emis > 0.5 ? 1.6 : u_amb); }
  if (staff < min(d, extra)) col = (length(p - vec2(-0.5 + lean * 0.5, 2.72 - hip * squat)) < 0.13 ? mix(pal(9), pal(8), 0.35) : pal(3)) * u_amb;
  if (role == 99) { col = mix(pal(9), pal(10), 0.5 + 0.5 * sin(u_time * 5.0)) * 1.5; }
  if (role == ${ROLE.lamp}) col += pal(13) * u_night * 0.25 * smoothstep(1.2, 0.0, length(p - handF));
  if (u_mode == 1) {
    // Hidden behind the terrain? The 3D pass left its distance in alpha.
    vec2 suv = (gl_FragCoord.xy - u_vp.xy) / u_vp.zw;
    float td = texture(u_depth, suv).a; td = td * td * 260.0;
    if (v_dist > td + 1.2) discard;
    alpha *= smoothstep(190.0, 120.0, v_dist);
  }
  o = vec4(col * alpha, alpha);
}`;

interface Soul { x: number; y: number; face: number; phase: number; moving: number; seen: number; role: number; seed: number; z: number; tag: number }

export const createPeople = (core: GlCore) => {
  const gl = core.gl;
  const prog = core.program(VS, FS);
  const names = ['u_zoom', 'u_mode', 'u_cam', 'u_ro', 'u_grid', 'u_time', 'u_amb', 'u_night', 'u_pal', 'u_depth', 'u_vp'];
  const loc = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])) as Record<string, WebGLUniformLocation | null>;
  const MAXN = 260;
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

  const souls = new Map<number, Soul>();
  const home = new Uint8Array(4096);     // what weighs on each village, by id
  let frame = 0;
  let notableId = -2;
  const AVATAR = -1;
  const ease = (s: Soul, x: number, y: number, role: number, dt: number) => {
    const k = Math.min(1, dt * 0.009);
    const dx = x - s.x;
    if (Math.abs(dx) > 8 || Math.abs(y - s.y) > 10) { s.x = x; s.y = y; }
    else { s.x += dx * k; s.y += (y - s.y) * Math.min(1, dt * 0.012); }
    const speed = Math.abs(dx);
    if (speed > 0.06) s.face = dx > 0 ? 1 : -1;
    const target = speed > 0.06 ? 1 : 0;
    s.moving += (target - s.moving) * Math.min(1, dt * 0.01);
    s.phase += dt * 0.012 * (0.4 + speed * 1.6) * (role === ROLE.flee ? 1.6 : 1);
    s.role = role;
    s.seen = frame;
  };

  // Map walks through callbacks made once: iterating [id, soul] pairs would allocate one array per soul per frame.
  type PeopleFpArg = { ro: [number, number, number]; yaw: number; pitch: number; depth: WebGLTexture; place: (s: Soul) => readonly [number, number, number]; tw?: number; th?: number; far?: number };
  const sweep = (s: Soul, id: number) => { if (s.seen !== frame) souls.delete(id); };
  let n = 0;
  let fillFp: PeopleFpArg | null = null;
  const fill = (s: Soul, id: number) => {
    if (n >= MAXN || s.role === ROLE.sleep) return;
    const fp = fillFp;
    if (fp && id === AVATAR) return;       // you do not see your own body
    const k = n * 8;
    if (fp) {
      const p = fp.place(s);
      const rx = p[0] - fp.ro[0], rz = p[2] - fp.ro[2], far = fp.far ?? 260;
      if (rx * rx + rz * rz > far * far) return;
      data[k] = p[0]; data[k + 1] = p[1]; data[k + 2] = p[2];
    }
    else { data[k] = s.x; data[k + 1] = s.y; data[k + 2] = 0; }
    data[k + 3] = id === notableId ? s.role + 100 : s.role; data[k + 4] = s.phase; data[k + 5] = s.face * (1 + s.tag); data[k + 6] = s.moving; data[k + 7] = s.seed;
    n++;
  };

  return {
    /** Ease every person toward where the sim has them. */
    update: (civ: CivView, dt: number) => {
      frame++;
      const pp = civ.people;
      notableId = civ.notable?.personId ?? -2;
      home.fill(0);
      for (const v of civ.villages) home[v.id & 4095] = v.state === 'war' ? 1 : v.state === 'plague' ? 2 : 0;
      for (let i = 0; i < civ.peopleCount; i++) {
        const k = i * PERSON_STRIDE;
        const id = pp[k + 4]!, x = pp[k]! + 0.5, y = pp[k + 1]! + 1, role = pp[k + 2]!;
        let s = souls.get(id);
        if (!s) { const seed = ((id * 9301 + 49297) % 233280) / 233280; souls.set(id, (s = { x, y, face: seed > 0.5 ? 1 : -1, phase: seed * 6, moving: 0, seen: frame, role, seed, z: (seed - 0.5) * 9, tag: 0 })); }
        ease(s, x, y, role, dt);
        const hs = home[pp[k + 3]! & 4095]!;
        s.tag = hs === 1 && s.seed < 0.55 ? 1 : hs === 2 && s.seed > 0.5 ? 2 : 0;
      }
      const av = civ.avatar;
      if (av) {
        let s = souls.get(AVATAR);
        if (!s) souls.set(AVATAR, (s = { x: av.x + 0.5, y: av.y + 1, face: 1, phase: 0, moving: 0, seen: frame, role: 99, seed: 0.5, z: 0, tag: 0 }));
        ease(s, av.x + 0.5, av.y + 1, 99, dt);
      }
      souls.forEach(sweep);
    },
    /** Smoothed avatar position (cell coords, feet), or null. */
    avatar: () => souls.get(AVATAR) ?? null,
    /**
     * Draw. Map mode: cam = view (cx, cy, zoom). First person: cam = eye, and
     * place() gives each soul its 3D ground position.
     */
    draw: (o: {
      fp: null | PeopleFpArg;
      view: { cx: number; cy: number; zoom: number };
      rect: { x: number; y: number; w: number; h: number };
      W: number; H: number; time: number; amb: number; night: number; pal: WebGLTexture;
    }) => {
      n = 0;
      fillFp = o.fp;
      souls.forEach(fill);
      fillFp = null;
      if (!n) return;
      const sx = core.canvas.width / Math.max(1, core.width()), sy = core.canvas.height / Math.max(1, core.height());
      let vx = Math.round(o.rect.x * sx), vw = Math.round(o.rect.w * sx), vh = Math.round(o.rect.h * sy);
      let vy = Math.round(core.canvas.height - (o.rect.y + o.rect.h) * sy);
      if (o.fp && o.fp.tw) { vx = 0; vy = 0; vw = o.fp.tw; vh = o.fp.th!; }
      gl.viewport(vx, vy, vw, vh);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(vx, vy, vw, vh);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog);
      gl.uniform1i(loc.u_mode!, o.fp ? 1 : 0);
      if (o.fp) { gl.uniform4f(loc.u_cam!, o.fp.yaw, o.fp.pitch, vw / vh, 0); gl.uniform3f(loc.u_ro!, ...o.fp.ro); }
      else gl.uniform4f(loc.u_cam!, o.view.cx, o.view.cy, o.view.zoom, 0);
      gl.uniform2f(loc.u_grid!, o.W, o.H);
      gl.uniform1f(loc.u_time!, o.time % 10000);
      gl.uniform1f(loc.u_amb!, o.amb);
      gl.uniform1f(loc.u_night!, o.night);
      gl.uniform1f(loc.u_zoom!, o.view.zoom);
      gl.uniform4f(loc.u_vp!, vx, vy, vw, vh);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, o.pal);
      gl.uniform1i(loc.u_pal!, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, o.fp ? o.fp.depth : o.pal);
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
export type People = ReturnType<typeof createPeople>;
