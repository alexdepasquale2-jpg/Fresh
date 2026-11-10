// Creatures (ui/creature). Every universe has a face: a small animal drawn as inline
// SVG, a pure function of the universe (seed, glyph, palette, laws) and of what the
// fighter has become (stats, traits, statuses). Same serial, same creature, every device.
import type { UniverseSpec } from '@/contracts/universe';
import type { Element, Fighter, StatusKind } from '@/contracts/battle';
import { child, rng } from '@/core/hash';
import './creature.css';

export type CreatureAnim = 'attack' | 'hit' | 'crit' | 'heal' | 'guard' | 'fuse' | 'faint' | 'idle' | 'enter';
export interface CreatureOpts {
  /** Rendered size in px (square). Default 128. */
  readonly size?: number;
  /** Which way it looks. Default right. */
  readonly facing?: 'left' | 'right';
}
export interface Creature {
  readonly el: HTMLElement;
  update(fighter: Fighter): void;
  play(anim: CreatureAnim): void;
  dispose(): void;
}

const LAW_ELEMENT: Record<string, Element> = {
  'first-light': 'void', 'cold-fire': 'cold', 'slow-time': 'void', 'salt-tide': 'tide',
  'tallow-bloom': 'bloom', 'glass-rain': 'fire', 'ash-choir': 'fire', 'pale-moss': 'bloom',
};
const TRAIT_ELEMENT: Record<string, Element> = { smoulder: 'fire', stillness: 'cold', ebb: 'tide', bedrock: 'stone', rooted: 'bloom', hollow: 'void' };
/** The element a universe's laws give it (the fighter's own element wins when there is one). */
export const elementOf = (spec: UniverseSpec): Element => LAW_ELEMENT[spec.laws.id] ?? 'stone';

// Palette indices: 0 void,1 shade,2 dark,3 line,4 stone,5 earth,6 sand,7 gold,8 paper,9 pale,10 glow,11 water,12 deep,13 fire,14 ember,15 life
const BODY: Record<Element, readonly number[]> = { fire: [13, 7, 14], cold: [9, 11, 8], tide: [11, 11, 4], stone: [4, 3, 5], bloom: [15, 15, 6], void: [12, 2, 12] };
const SECOND: Record<Element, readonly number[]> = { fire: [7, 6, 8], cold: [11, 12, 4], tide: [12, 9, 8], stone: [6, 8, 5], bloom: [7, 13, 8], void: [11, 3, 9] };

const TAU = Math.PI * 2;
const CX = 60, CY = 64;
const n1 = (n: number): string => String(Math.round(n * 10) / 10);
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const rad = (deg: number): number => (deg * Math.PI) / 180;
let uid = 0;

/** What never changes about a creature: its body plan, rolled once from the seed. */
interface Plan {
  sil: number; eyes: number; eyeShape: number; mouth: number; top: number; side: number; bottom: number; mark: number;
  spikes: number; wobA: number; wobP: number; pear: number; jit: number[]; body: number; second: number; blink: number; count: number;
}
const planOf = (spec: UniverseSpec): Plan => {
  const g = rng(child(spec.seed, 'creature'));
  return {
    sil: g.int(5), // round, tall, wide, spiked, ringed
    eyes: g.pick([1, 2, 2, 2, 2, 3, 3, 4]),
    eyeShape: g.int(5),
    mouth: g.int(6),
    top: g.int(6),
    side: g.int(4),
    bottom: g.int(4),
    mark: (spec.glyph + g.int(2)) % 6,
    spikes: g.range(5, 9),
    wobA: g.range(2, 7) / 100,
    wobP: g.int(628) / 100,
    pear: g.range(-14, 22) / 100,
    jit: Array.from({ length: 12 }, () => g.range(-10, 10) / 100),
    body: g.int(3), second: g.int(3),
    blink: g.int(40) / 10,
    count: g.range(3, 5),
  };
};

/** What a fighter's history shows on the body, bucketed so small changes do not redraw. */
interface Look {
  element: Element; element2: Element | null; big: number; rings: number; aura: number; plates: number; motes: number;
  traits: string; status: string; low: boolean; down: boolean; guarding: boolean; fused: boolean;
  /** 1, 2 or 3: grown forms carry more on the body. */
  form: number; shield: boolean; relic: boolean;
}
const STATUSES: readonly StatusKind[] = ['burn', 'chill', 'ward', 'regen', 'expose'];
const lookOf = (spec: UniverseSpec, f?: Fighter): Look => {
  const element = f?.element ?? elementOf(spec);
  const ids = f ? f.traits.map((t) => t.id) : [];
  const other = ids.map((id) => TRAIT_ELEMENT[id]).find((e) => e && e !== element) ?? null;
  return {
    element, element2: f?.fused ? other : null,
    big: Math.round(clamp01(((f?.might ?? 8) - 8) / 52) * 8) / 8,
    rings: Math.max(0, Math.min(3, Math.floor(((f?.depth ?? 4) - 4) / 4))),
    aura: Math.round(clamp01(((f?.radiance ?? 4) - 4) / 30) * 8) / 8,
    plates: Math.max(0, Math.min(3, Math.ceil((f?.guard ?? 0) / 3))),
    motes: Math.max(0, Math.min(4, Math.floor(((f?.speed ?? 5) - 5) / 3))),
    traits: ids.filter((id) => !TRAIT_ELEMENT[id]).sort().join(' '),
    status: f ? STATUSES.filter((k) => f.status[k] > 0).join(' ') : '',
    low: !!f && f.hp > 0 && f.hp < f.maxHp * 0.35,
    down: !!f && f.hp <= 0,
    guarding: !!f?.guarding,
    fused: !!f?.fused,
    form: Math.max(1, Math.min(3, f?.form ?? 1)), shield: (f?.shield ?? 0) > 0, relic: !!f?.relic,
  };
};

const draw = (p: Plan, k: Look, id: string, still: boolean): string => {
  const has = (t: string): boolean => k.traits.split(' ').includes(t);
  const st = (s: string): boolean => k.status.split(' ').includes(s);
  const isEl = (e: Element): boolean => k.element === e || k.element2 === e;
  const stone = k.element === 'stone';
  const R = (26 + 6 * k.big) * (has('thriving') ? 1.05 : 1) * [0.9, 1, 1.08][k.form - 1]!;
  const rx = R * [1, 0.82, 1.2, 0.9, 0.86][p.sil]!, ry = R * [0.96, 1.16, 0.82, 0.9, 0.86][p.sil]!;

  // The silhouette: a radius around the centre, flattened where it sits.
  const N = stone ? 10 : p.sil === 3 ? 48 : 28;
  const at = (th: number, s = 1): [number, number] => {
    let m = 1 + p.wobA * Math.sin(2 * th + p.wobP) + p.wobA * 0.6 * Math.sin(3 * th + p.wobP * 2);
    if (p.sil === 3) m *= 1 + 0.3 * Math.pow(0.5 + 0.5 * Math.cos(p.spikes * (th + Math.PI / 2)), 3);
    if (stone) m *= 1 + (p.jit[Math.round(((th / TAU + 1.25) % 1) * N) % 10] ?? 0) * 1.3;
    let x = Math.cos(th) * rx * m * s, y = Math.sin(th) * ry * m * s;
    if (y > 0) { x *= 1 + p.pear * (y / ry); y *= 0.84; }
    return [CX + x, CY + y];
  };
  const pts = Array.from({ length: N }, (_, i) => at((i / N) * TAU - Math.PI / 2));
  let body = `M${n1(pts[0]![0])} ${n1(pts[0]![1])}`;
  for (let i = 0; i < N; i++) {
    const a = pts[(i + N - 1) % N]!, b = pts[i]!, c = pts[(i + 1) % N]!, d = pts[(i + 2) % N]!;
    body += stone ? `L${n1(c[0])} ${n1(c[1])}`
      : `C${n1(b[0] + (c[0] - a[0]) / 6)} ${n1(b[1] + (c[1] - a[1]) / 6)} ${n1(c[0] - (d[0] - b[0]) / 6)} ${n1(c[1] - (d[1] - b[1]) / 6)} ${n1(c[0])} ${n1(c[1])}`;
  }
  body += 'Z';
  const bottomY = at(Math.PI / 2)[1];

  // A tapering blade rooted on the body at angle deg: horns, fins, flames, shards, leaves.
  const blade = (deg: number, len: number, w: number, bend: number, cls: string, bulge = 0.9, root = 0.86, delay = ''): string => {
    const th = rad(deg), [bx, by] = at(th, root);
    const dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx;
    const tx = bx + dx * len + nx * bend, ty = by + dy * len + ny * bend;
    const mx = bx + dx * len * 0.5 + nx * bend * 0.3, my = by + dy * len * 0.5 + ny * bend * 0.3;
    return `<path class="${cls}"${delay ? ` style="animation-delay:${delay}s"` : ''} d="M${n1(bx - nx * w)} ${n1(by - ny * w)}Q${n1(mx - nx * w * bulge)} ${n1(my - ny * w * bulge)} ${n1(tx)} ${n1(ty)}Q${n1(mx + nx * w * bulge)} ${n1(my + ny * w * bulge)} ${n1(bx + nx * w)} ${n1(by + ny * w)}Z"/>`;
  };
  const dot = (x: number, y: number, r: number, cls: string): string => `<circle class="${cls}" cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}"/>`;
  const zig = (x: number, y: number, len: number, deg: number, cls: string): string => {
    const th = rad(deg), dx = Math.cos(th), dy = Math.sin(th);
    let d = `M${n1(x)} ${n1(y)}`;
    for (let i = 1; i <= 4; i++) { const o = (i % 2 ? 1 : -1) * 2.2; d += `L${n1(x + (dx * len * i) / 4 - dy * o)} ${n1(y + (dy * len * i) / 4 + dx * o)}`; }
    return `<path class="${cls}" d="${d}"/>`;
  };
  const orbit = (rxo: number, ryo: number, tilt: number, dur: number, items: string[]): string =>
    `<g transform="translate(${CX} ${CY}) rotate(${tilt})">${items.map((it, i) => {
      const a = (i / items.length) * TAU + p.wobP;
      return still
        ? `<g transform="translate(${n1(Math.cos(a) * rxo)} ${n1(Math.sin(a) * ryo)})">${it}</g>`
        : `<g>${it}<animateMotion dur="${dur}s" begin="${n1(-(i / items.length) * dur - p.blink)}s" repeatCount="indefinite" path="M${-rxo} 0a${rxo} ${ryo} 0 1 0 ${rxo * 2} 0a${rxo} ${ryo} 0 1 0 ${-rxo * 2} 0"/></g>`;
    }).join('')}</g>`;

  const back: string[] = [], inside: string[] = [], front: string[] = [], over: string[] = [];

  // Limbs and headgear from the body plan.
  if (p.sil === 4) back.push(`<ellipse class="cr-ring" cx="${CX}" cy="${CY + 2}" rx="${n1(rx * 1.55)}" ry="${n1(ry * 0.36)}" transform="rotate(-14 ${CX} ${CY})"/>`);
  const fire = isEl('fire'), tide = isEl('tide'), bloom = isEl('bloom');
  if (!fire && !bloom) {
    if (p.top === 1) back.push(blade(-118, R * 0.6, 3.6, -3, 'cr-horn'), blade(-62, R * 0.6, 3.6, 3, 'cr-horn'));
    else if (p.top === 2) back.push(blade(-128, R * 0.5, 6.5, -2, 'cr-limb', 1.3), blade(-52, R * 0.5, 6.5, 2, 'cr-limb', 1.3));
    else if (p.top === 3) for (const dg of [-112, -68]) {
      const [bx, by] = at(rad(dg), 0.9), ex = bx + (dg < -90 ? -6 : 6), ey = by - R * 0.55;
      back.push(`<path class="cr-line" d="M${n1(bx)} ${n1(by)}Q${n1(bx)} ${n1(ey)} ${n1(ex)} ${n1(ey)}"/>`, dot(ex, ey, 2.6, 'cr-bulb'));
    } else if (p.top === 4) back.push(blade(-84, R * 0.75, 4.2, 2, 'cr-horn'));
    else if (p.top === 5) back.push(blade(-100, R * 0.4, 3, -4, 'cr-limb'), blade(-88, R * 0.52, 3, 0, 'cr-limb'), blade(-76, R * 0.4, 3, 4, 'cr-limb'));
  }
  if (tide || p.side === 2) back.push(blade(168, R * 0.55, 6, 5, 'cr-fin', 1.2), blade(12, R * 0.55, 6, -5, 'cr-fin', 1.2));
  else if (p.side === 1) for (const dg of [160, 20]) front.push(`<ellipse class="cr-limb" cx="${n1(at(rad(dg), 0.96)[0])}" cy="${n1(CY + ry * 0.3)}" rx="3.4" ry="5.5"/>`);
  else if (p.side === 3) back.push(blade(196, R * 0.42, 3, 3, 'cr-horn'), blade(176, R * 0.42, 3, -2, 'cr-horn'), blade(-16, R * 0.42, 3, -3, 'cr-horn'), blade(4, R * 0.42, 3, 2, 'cr-horn'));
  if (p.bottom === 1) for (let i = 0; i < p.count; i++) {
    const dg = 90 + (i - (p.count - 1) / 2) * (110 / p.count), [bx, by] = at(rad(dg), 0.9), s = i % 2 ? 4 : -4;
    back.push(`<path class="cr-tendril" style="animation-delay:${n1(-i * 0.4)}s" d="M${n1(bx)} ${n1(by)}q${s} 6 0 11t0 9"/>`);
  } else if (p.bottom !== 2) {
    back.push(`<ellipse class="cr-limb" cx="${n1(CX - rx * 0.42)}" cy="${n1(bottomY)}" rx="6" ry="3.6"/>`, `<ellipse class="cr-limb" cx="${n1(CX + rx * 0.48)}" cy="${n1(bottomY)}" rx="6" ry="3.6"/>`);
    if (p.bottom === 3) back.push(blade(152, R * 0.8, 4.5, -9, 'cr-limb cr-tail', 1.1));
  }

  // The element in the form.
  if (fire) for (let i = 0; i < p.count; i++) {
    const dg = -90 + (i - (p.count - 1) / 2) * 24;
    back.push(blade(dg, R * (0.62 - Math.abs(dg + 90) / 220), 5, i % 2 ? 3 : -3, `cr-flame${i % 2 ? ' alt' : ''}`, 1.5, 0.86, n1(-i * 0.23)));
  }
  if (isEl('cold')) {
    for (let i = 0; i < p.count; i++) back.push(blade(-168 + i * 30 + (p.jit[i] ?? 0) * 60, R * (0.5 + (i % 2) * 0.22), 3.2, 0, 'cr-shard', 0.7));
    over.push(`<path class="cr-twinkle" d="M${n1(CX - rx * 0.5)} ${n1(CY + ry * 0.3)}l1.4 3.2 3.2 1.4-3.2 1.4-1.4 3.2-1.4-3.2-3.2-1.4 3.2-1.4z"/>`);
  }
  if (tide) {
    back.push(blade(-96, R * 0.55, 7, -7, 'cr-fin', 1.1));
    inside.push(`<path class="cr-wave" d="M${n1(CX - rx * 1.3)} ${n1(CY + ry * 0.42)}q${n1(rx * 0.32)} -5 ${n1(rx * 0.65)} 0t${n1(rx * 0.65)} 0t${n1(rx * 0.65)} 0t${n1(rx * 0.65)} 0V${CY + 50}H${n1(CX - rx * 1.3)}Z"/>`);
    for (const [i, dx] of [-0.5, 0.35].entries()) front.push(`<path class="cr-drip" style="animation-delay:${n1(-i * 0.9)}s" d="M${n1(CX + rx * dx)} ${n1(bottomY - 1)}q-2.6 4.6 0 6.2q2.6 -1.6 0 -6.2z"/>`);
  }
  if (isEl('stone')) over.push(zig(CX - rx * 0.6, CY - ry * 0.5, R * 0.5, 70, 'cr-crack'));
  if (stone) {
    over.push(zig(CX + rx * 0.2, CY + ry * 0.35, R * 0.45, 20, 'cr-crack'));
    back.push(`<rect class="cr-pebble" x="${n1(CX - rx - 5)}" y="${n1(bottomY - 5)}" width="8" height="7" transform="rotate(-12 ${n1(CX - rx)} ${n1(bottomY)})"/>`, `<rect class="cr-pebble" x="${n1(CX + rx - 1)}" y="${n1(bottomY - 3)}" width="6" height="5"/>`);
  }
  if (bloom) {
    for (let i = 0; i < p.count; i++) back.push(blade(-90 + (i - (p.count - 1) / 2) * 34, R * 0.62, 4, i % 2 ? 4 : -4, 'cr-leaf', 2.1));
    const [fx, fy] = at(rad(-128), 1.02);
    over.push(...[0, 72, 144, 216, 288].map((a) => dot(fx + Math.cos(rad(a)) * 3, fy + Math.sin(rad(a)) * 3, 2.1, 'cr-petal')), dot(fx, fy, 1.6, 'cr-pollen'));
  }
  const voidy = isEl('void');
  if (voidy) inside.push(dot(CX + 2, CY + ry * 0.5, R * 0.22, 'cr-hole'), dot(CX + 2, CY + ry * 0.5, R * 0.07, 'cr-bulb'));

  // Markings (clipped to the body).
  if (p.mark === 1 || p.mark === 5) for (let i = 0; i < 4; i++) inside.push(dot(CX + rx * (p.jit[i] ?? 0) * 7, CY + ry * (p.jit[i + 4] ?? 0) * 7, 2 + (i % 3) * 1.3, 'cr-mark'));
  if (p.mark === 2) for (let i = 0; i < 3; i++) inside.push(`<path class="cr-stripe" d="M${n1(CX - rx * 1.4)} ${n1(CY - ry * 0.75 + i * 4)}q${n1(rx * 0.5)} ${6 + i * 2} ${n1(rx * (0.8 - i * 0.16))} ${3 + i * 5}"/>`);
  if (p.mark === 3 || p.mark === 5) inside.push(`<ellipse class="cr-belly" cx="${CX + 3}" cy="${n1(CY + ry * 0.62)}" rx="${n1(rx * 0.62)}" ry="${n1(ry * 0.5)}"/>`);
  if (p.mark === 4) inside.push(`<rect class="cr-mask" x="0" y="${n1(CY - ry * 0.42)}" width="120" height="${n1(ry * 0.5)}"/>`);
  if (k.fused) inside.push(`<rect class="cr-half" x="${CX}" y="0" width="60" height="120"/>`);
  for (let i = 1; i <= k.rings; i++) inside.push(`<path class="cr-depth" d="${body}" transform="translate(${CX} ${n1(CY + i * 2)}) scale(${n1(1 - i * 0.2)}) translate(${-CX} ${-CY})"/>`);
  if (has('thriving')) inside.push(dot(CX - rx * 0.62, CY + ry * 0.22, 3.4, 'cr-blush'), dot(CX + rx * 0.72, CY + ry * 0.22, 3.4, 'cr-blush'));

  // Guard: plates along the back.
  for (let i = 0; i < k.plates; i++) {
    const a0 = [196, 238, 154][i]!;
    const seg = [0, 12, 24, 36].map((d) => at(rad(a0 + d), 1.03)).map(([x, y], j) => `${j ? 'L' : 'M'}${n1(x)} ${n1(y)}`).join('');
    over.push(`<path class="cr-plate-edge" d="${seg}"/><path class="cr-plate" d="${seg}"/>`);
  }
  if (k.fused) over.push(zig(CX, CY - ry * 1.02, ry * 1.86, 90, 'cr-seam'));

  // The face. It sits a little toward where the creature looks.
  const fx = CX + rx * 0.14, fy = CY - ry * (voidy ? 0.26 : 0.14);
  const e = rx * 0.4, er = R * (p.eyes === 1 ? 0.3 : p.eyes === 2 ? 0.2 : 0.16);
  const spots: [number, number, number][] = p.eyes === 1 ? [[fx, fy, er]]
    : p.eyes === 2 ? [[fx - e, fy, er], [fx + e, fy, er]]
    : p.eyes === 3 ? [[fx - e, fy + 2, er], [fx + e, fy + 2, er], [fx, fy - e * 0.8, er]]
    : [[fx - e, fy + 2, er], [fx + e, fy + 2, er], [fx - e * 0.5, fy - e * 0.75, er * 0.7], [fx + e * 0.5, fy - e * 0.75, er * 0.7]];
  const eye = (x: number, y: number, r: number, shape: number): string => {
    if (k.down) return `<path class="cr-x" d="M${n1(x - r * 0.7)} ${n1(y - r * 0.7)}l${n1(r * 1.4)} ${n1(r * 1.4)}m0 ${n1(-r * 1.4)}l${n1(-r * 1.4)} ${n1(r * 1.4)}"/>`;
    const ex = r * [1, 0.76, 1.2, 1, 0.6][shape]!, ey = r * [1, 1.25, 0.78, 1, 0.6][shape]!;
    const pupil = shape === 4 ? '' : `<g class="cr-pupil">${shape === 2 ? `<ellipse class="cr-pup" cx="${n1(x + ex * 0.2)}" cy="${n1(y)}" rx="${n1(ex * 0.22)}" ry="${n1(ey * 0.8)}"/>` : dot(x + ex * 0.22, y + ey * 0.08, Math.min(ex, ey) * 0.56, 'cr-pup')}${dot(x + ex * 0.36, y - ey * 0.3, Math.min(ex, ey) * 0.2, 'cr-glint')}</g>`;
    const lid = k.low || shape === 3 ? `<rect class="cr-lid" x="${n1(x - ex - 1)}" y="${n1(y - ey - 1)}" width="${n1(ex * 2 + 2)}" height="${n1(ey * (k.low ? 0.95 : 0.45) + 1)}"/>` : '';
    return `<g class="cr-eye" style="animation-delay:${n1(-p.blink)}s"><ellipse class="cr-white" cx="${n1(x)}" cy="${n1(y)}" rx="${n1(ex)}" ry="${n1(ey)}"/>${pupil}${lid}</g>`;
  };
  const face: string[] = spots.map(([x, y, r], i) => eye(x, y, r, k.fused && i === spots.length - 1 ? (p.eyeShape + 2) % 5 : p.eyeShape));
  const my = fy + ry * 0.44 + (p.eyes > 2 ? 1 : 0), mw = rx * 0.26;
  const smile = `<path class="cr-mouth" d="M${n1(fx - mw)} ${n1(my - 1)}q${n1(mw)} ${n1(mw * 0.9)} ${n1(mw * 2)} 0"/>`;
  if (k.down) face.push(`<path class="cr-mouth" d="M${n1(fx - mw)} ${n1(my)}q${n1(mw / 2)} -3 ${n1(mw)} 0t${n1(mw)} 0"/>`);
  else if (k.low) face.push(`<path class="cr-mouth" d="M${n1(fx - mw)} ${n1(my + 2)}q${n1(mw)} ${n1(-mw * 0.9)} ${n1(mw * 2)} 0"/>`);
  else if (p.mouth === 1) face.push(`<ellipse class="cr-maw" cx="${n1(fx)}" cy="${n1(my)}" rx="${n1(mw * 0.45)}" ry="${n1(mw * 0.55)}"/>`);
  else if (p.mouth === 2) face.push(smile, `<path class="cr-fang" d="M${n1(fx - mw * 0.6)} ${n1(my + 0.6)}l1.5 3.4 1.5 -2.6zM${n1(fx + mw * 0.6)} ${n1(my + 0.6)}l-1.5 3.4 -1.5 -2.6z"/>`);
  else if (p.mouth === 3) face.push(`<path class="cr-mouth" d="M${n1(fx - mw * 0.8)} ${n1(my)}h${n1(mw * 1.6)}"/>`);
  else if (p.mouth === 4) face.push(`<path class="cr-mouth" d="M${n1(fx - mw)} ${n1(my - 1)}q${n1(mw / 2)} ${n1(mw * 0.8)} ${n1(mw)} 0q${n1(mw / 2)} ${n1(mw * 0.8)} ${n1(mw)} 0"/>`);
  else if (p.mouth === 5) face.push(`<path class="cr-maw" d="M${n1(fx - mw)} ${n1(my - 1)}h${n1(mw * 2)}q${n1(-mw)} ${n1(mw * 1.5)} ${n1(-mw * 2)} 0z"/>`);
  else face.push(smile);

  // Grown forms. The second wears a mane and a tail-plume; the third has wings, a crown and a second outline.
  if (k.form >= 2) {
    for (let i = 0; i < 5; i++) back.push(blade(-150 + i * 30, R * (0.34 + (i % 2) * 0.12), 4.2, i < 2 ? -2 : 2, 'cr-mane', 1.4, 0.9));
    back.push(blade(140, R * 0.7, 5, -10, 'cr-mane cr-tail', 1.3));
    inside.push(`<path class="cr-chest" d="M${n1(CX - rx * 0.5)} ${n1(CY + ry * 0.2)}q${n1(rx * 0.5)} ${n1(ry * 0.5)} ${n1(rx)} 0"/>`);
  }
  if (k.form >= 3) {
    back.push(blade(200, R * 1.05, 9, 12, 'cr-wing', 1.5, 0.7), blade(222, R * 0.8, 7, 9, 'cr-wing', 1.5, 0.7), blade(-20, R * 1.05, 9, -12, 'cr-wing', 1.5, 0.7), blade(-42, R * 0.8, 7, -9, 'cr-wing', 1.5, 0.7));
    const topY = at(-Math.PI / 2)[1];
    over.push(`<path class="cr-crown" d="M${n1(CX - 9)} ${n1(topY + 1)}l2 -9 4 5 3 -8 3 8 4 -5 2 9z"/>`, dot(CX, topY - 9, 1.6, 'cr-bulb'));
    over.push(`<path class="cr-elder" d="${body}" transform="translate(${CX} ${CY}) scale(1.09) translate(${-CX} ${-CY})"/>`);
  }
  if (k.relic) { const [px, py] = at(rad(70), 0.98); over.push(`<path class="cr-line" d="M${n1(px - 4)} ${n1(py - 5)}q4 5 4 5"/>`, `<path class="cr-relic" d="M${n1(px)} ${n1(py - 2)}l3 4 -3 4 -3 -4z"/>`); }

  // Traits anyone can see.
  if (has('awake')) {
    back.push(`<ellipse class="cr-halo" cx="${CX}" cy="${n1(at(-Math.PI / 2)[1] - 9)}" rx="${n1(rx * 0.62)}" ry="3.6"/>`);
    if (!k.down) { const ay = fy - ry * 0.52; face.push(`<g class="cr-third"><path class="cr-white" d="M${n1(fx - 5)} ${n1(ay)}q5 -5.5 10 0q-5 5.5 -10 0z"/>${dot(fx, ay, 1.7, 'cr-pup')}</g>`); }
  }
  if (has('lamplit')) {
    const [bx, by] = at(rad(-64), 0.9), lx = bx + R * 0.62, ly = by - R * 0.34;
    back.push(`<path class="cr-line" d="M${n1(bx)} ${n1(by)}Q${n1(bx + 2)} ${n1(ly - 9)} ${n1(lx)} ${n1(ly - 5)}"/>`);
    over.push(dot(lx, ly, 6.5, 'cr-lampglow'), dot(lx, ly, 2.8, 'cr-bulb'));
  }
  if (has('thriving')) back.push(blade(206, R * 0.4, 3.2, 3, 'cr-leaf', 2), blade(226, R * 0.46, 3.2, -2, 'cr-leaf', 2), blade(-22, R * 0.4, 3.2, -3, 'cr-leaf', 2));
  if (has('legion')) for (const [i, dx] of [-1.25, 1.15, 1.5].entries()) {
    const x = CX + Math.max(-44, Math.min(44, rx * dx)), y = bottomY - 1 + (i % 2) * 2;
    over.push(`<g class="cr-minion" style="animation-delay:${n1(-i * 0.5)}s">${dot(x, y, 4.2, 'cr-fill cr-mini')}${dot(x - 0.4, y - 0.8, 0.9, 'cr-white')}${dot(x + 2, y - 0.8, 0.9, 'cr-white')}</g>`);
  }

  // Statuses on the body.
  if (st('burn')) for (const [i, dg] of [-150, -40, 30].entries()) over.push(blade(dg, 9, 3.4, i % 2 ? 2 : -2, 'cr-flame cr-ember', 1.5, 0.82, n1(-i * 0.31)));
  if (st('chill')) {
    inside.push(`<path class="cr-frost" d="${body}"/>`);
    for (const dg of [58, 90, 122, 180, 0]) over.push(blade(dg, 7, 2.6, 0, 'cr-shard', 0.7, 0.92));
  }
  if (st('regen')) for (const [i, dg] of [-120, -74, -30].entries()) {
    const [bx, by] = at(rad(dg), 0.96);
    over.push(`<g class="cr-sprout" style="animation-delay:${n1(-i * 0.5)}s"><path class="cr-stem" d="M${n1(bx)} ${n1(by)}v-7"/><path class="cr-leaf" d="M${n1(bx)} ${n1(by - 6)}q-5 -4 -6 1q4 2 6 -1zm0 0q5 -4 6 1q-4 2 -6 -1z"/></g>`);
  }
  if (st('expose')) over.push(zig(CX - rx * 0.2, CY - ry * 0.95, R * 0.7, 80, 'cr-break'), zig(CX + rx * 0.5, CY - ry * 0.1, R * 0.6, 110, 'cr-break'), zig(CX - rx * 0.75, CY + ry * 0.1, R * 0.5, 60, 'cr-break'));

  // Things in orbit: speed motes, the worlds of the Reaching, the bits a void keeps.
  const orbits: string[] = [];
  if (k.motes > 0) orbits.push(orbit(46, 14, -16, 7 - k.motes, Array.from({ length: k.motes }, () => dot(0, 0, 1.9, 'cr-mote'))));
  if (has('reaching')) orbits.push(orbit(42, 20, 24, 9, [`${dot(0, 0, 3.4, 'cr-moon')}<ellipse class="cr-moonring" rx="5.6" ry="1.6"/>`, dot(0, 0, 2.5, 'cr-moon')]));
  if (voidy) orbits.push(orbit(40, 30, 40, 11, Array.from({ length: p.count }, (_, i) => `<rect class="cr-bit" x="-2" y="-2" width="${3 + (i % 2)}" height="${3 + (i % 2)}" transform="rotate(${i * 31})"/>`)));
  if (k.shield) orbits.push(`<path class="cr-shell" d="M${n1(CX - Math.max(rx, ry) - 9)} ${CY + 8}a${n1(Math.max(rx, ry) + 9)} ${n1(Math.max(rx, ry) + 9)} 0 0 1 ${n1((Math.max(rx, ry) + 9) * 2)} 0"/>`);
  if (st('ward')) orbits.push(`<circle class="cr-ward" cx="${CX}" cy="${CY}" r="${n1(Math.max(rx, ry) + 13)}"/>`);
  if (k.guarding) orbits.push(`<path class="cr-shield" d="M${n1(CX + rx + 10)} ${n1(CY - ry * 0.8)}q9 ${n1(ry * 0.8)} 0 ${n1(ry * 1.6)}"/>`);

  const floaty = p.bottom === 2 || p.bottom === 1;
  return `<defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs>`
    + `<ellipse class="cr-shadow" cx="${CX}" cy="${n1(bottomY + (floaty ? 9 : 3))}" rx="${n1(rx * 0.8)}" ry="3"/>`
    + `<g class="cr-act"><g class="cr-bob${floaty ? ' floaty' : ''}">${back.join('')}`
    + `<path class="cr-fill cr-body" d="${body}"/><g clip-path="url(#${id})">${inside.join('')}</g><path class="cr-outline" d="${body}"/>`
    + (p.sil === 4 ? `<path class="cr-ring front" d="M${n1(CX - rx * 1.55)} ${CY + 2}a${n1(rx * 1.55)} ${n1(ry * 0.36)} 0 0 0 ${n1(rx * 3.1)} 0" transform="rotate(-14 ${CX} ${CY})"/>` : '')
    + `${front.join('')}<g class="cr-face">${face.join('')}</g>${over.join('')}<path class="cr-flash" d="${body}"/></g></g>${orbits.join('')}`;
};

const ANIM_MS: Record<CreatureAnim, number> = { attack: 460, hit: 420, crit: 640, heal: 820, guard: 560, fuse: 900, faint: 820, enter: 420, idle: 0 };

/** A living portrait of one universe. Call update() whenever its fighter changes. */
export const creature = (spec: UniverseSpec, fighter?: Fighter, opts: CreatureOpts = {}): Creature => {
  const p = planOf(spec);
  const id = `cr${uid++}`;
  const size = opts.size ?? 128;
  const root = document.createElement('div');
  root.setAttribute('role', 'img');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '10 12 100 100');
  svg.setAttribute('aria-hidden', 'true');
  const aura = document.createElement('i');
  aura.className = 'cr-aura';
  root.append(aura, svg);
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const col = (i: number): string => spec.palette[i] ?? '#8a7f4e';
  let key = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let anim: CreatureAnim = 'idle';

  const render = (f?: Fighter) => {
    const k = lookOf(spec, f);
    const next = JSON.stringify(k);
    if (next === key) return;
    key = next;
    const pick = (list: readonly number[], i: number) => col(list[i % list.length]!);
    const dark = k.element === 'void';
    root.className = `creature el-${k.element}${opts.facing === 'left' ? ' face-left' : ''}${k.low ? ' is-low' : ''}${k.down ? ' is-down' : ''}${k.guarding ? ' is-guard' : ''}${k.fused ? ' is-fused' : ''} form-${k.form}${k.status.split(' ').filter(Boolean).map((s) => ` st-${s}`).join('')}${anim !== 'idle' ? ` a-${anim}` : ''}`;
    root.setAttribute('aria-label', `${f?.name ?? spec.name}, a ${k.element} creature${k.form > 1 ? `, form ${k.form}` : ''}`);
    const vars: Record<string, string> = {
      '--cr-size': `${size}px`,
      '--cb': pick(BODY[k.element], p.body), '--cs': pick(SECOND[k.element], p.second),
      '--cb2': k.element2 ? pick(BODY[k.element2], p.body) : pick(SECOND[k.element], p.second + 1),
      '--co': col(dark ? 9 : 0), '--cf': col(dark ? 9 : 0),
      '--c-fire': col(13), '--c-ember': col(14), '--c-gold': col(7), '--c-life': col(15),
      '--c-water': col(11), '--c-deep': col(12), '--c-pale': col(9), '--c-paper': col(8), '--c-line': col(3), '--c-void': col(0),
      '--cr-aura': String(0.1 + k.aura * 0.6), '--cr-beat': `${n1(3.4 - k.motes * 0.25)}s`,
    };
    for (const [n, v] of Object.entries(vars)) root.style.setProperty(n, v);
    svg.innerHTML = draw(p, k, id, still);
  };
  render(fighter);

  return {
    el: root,
    update: (f) => render(f),
    play: (a) => {
      clearTimeout(timer);
      if (anim !== 'idle') root.classList.remove(`a-${anim}`);
      anim = a;
      if (a === 'idle') return;
      void root.offsetWidth; // restart the keyframes
      root.classList.add(`a-${a}`);
      timer = setTimeout(() => { root.classList.remove(`a-${a}`); anim = 'idle'; }, ANIM_MS[a]);
    },
    dispose: () => { clearTimeout(timer); root.remove(); },
  };
};
