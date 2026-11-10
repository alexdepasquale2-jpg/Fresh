// Binds the town to the real game: what it may read (Facts) and what it may give (sky pieces, Light, a universe).
// Called by the plugin at boot and again by the screen; binding twice is harmless.
import type { AppContext } from '@/contracts/app';
import type { Fighter } from '@/contracts/battle';
import type { SkyPieceKind } from '@/contracts/sky';
import { hashString } from '@/core/hash';
import { town, type Facts } from '@/game/town';

interface LadderRO { wins: Record<string, number>; xp: Record<string, number>; held: Record<string, string> }
/** Read-only view of the ladder kept by src/ui/battle. The town never writes this key. */
export const readLadder = (): LadderRO => {
  try { const j = JSON.parse(localStorage.getItem('sallow-ladder') ?? 'null') as Partial<LadderRO> | null; return { wins: j?.wins ?? {}, xp: j?.xp ?? {}, held: j?.held ?? {} }; } catch { return { wins: {}, xp: {}, held: {} }; }
};
const RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, mythic: 4 };
const SKY = new Set(['comet', 'moon', 'belt', 'sun', 'rings', 'dust']);

export const readFacts = (c: AppContext): Facts => {
  const L = readLadder();
  let deepest = 0, souls = 0, era = 0, rare = 0, floors = 0, count = 0, firstName = '', bestName = '', bestRank = -1;
  const slots = c.box.slots(), sel = c.box.selected();
  for (let i = 0; i < slots.length; i++) {
    const e = slots[i]; if (!e) continue;
    count++;
    deepest = Math.max(deepest, e.stats.deepestFold); souls = Math.max(souls, e.stats.souls ?? 0); era = Math.max(era, e.stats.era ?? 0); floors += e.stats.floorsReached ?? 0;
    let name = '', rank = 0;
    try { const spec = c.universes.fromSerial(e.serialNumber); name = spec.name; rank = RANK[spec.rarity ?? 'common'] ?? 0; } catch { /* a universe that will not open still counts */ }
    if (rank >= 2) rare++;
    if (!firstName || i === sel) firstName = name;
    if (rank > bestRank) { bestRank = rank; bestName = name; }
  }
  const ids = new Set<number>(c.rivalsBeaten);
  let wins = 0;
  for (const k of Object.keys(L.wins)) { const w = L.wins[k] ?? 0; wins += w; if (w > 0) ids.add(Number(k)); }
  const lv = c.light.view();
  // The wider game, read-only and defensively: any of these may be missing on an older save or build.
  const json = (k: string): Record<string, unknown> => { try { const j = JSON.parse(localStorage.getItem(k) ?? 'null') as unknown; return j && typeof j === 'object' ? (j as Record<string, unknown>) : {}; } catch { return {}; } };
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  let moons = 0, ringed = 0, named = 0, merged = 0, boss = 0;
  try { for (const s of c.sky.snapshot().skies) { let m = 0; for (const p of s.pieces) { if (p === 'moon') m++; else if (p === 'rings') ringed = 1; } moons = Math.max(moons, m); } } catch { /* no skies yet */ }
  try { const v = (c as unknown as { sim?: { latest?: () => { figures?: readonly unknown[]; civ?: { figures?: readonly unknown[] } } | null } }).sim?.latest?.(); named = v?.figures?.length ?? v?.civ?.figures?.length ?? 0; } catch { /* no world being watched */ }
  for (const e of slots) if (e && (e as { lineage?: unknown }).lineage) merged++;
  try { for (const r of c.battles.rivals()) if (r.boss && ids.has(r.id)) boss = 1; } catch { /* no ladder */ }
  const cx = json('sallow-codex'), tally = (cx.n && typeof cx.n === 'object' ? cx.n : {}) as Record<string, unknown>;
  const lad = json('sallow-ladder'), daily = lad.daily as { done?: boolean } | undefined;
  const more = {
    moons, twoMoons: moons >= 2 ? 1 : 0, ringed, named: Math.max(named, n(tally.crowns) > 0 ? 1 : 0), lost: n(tally.vl), body: n(tally.bodies) > 0 || n(tally.body) > 0 ? 1 : 0,
    fragments: n(json('sallow-endgame').fragments), merged: Math.max(merged, n(tally.merges)), boss,
    daily: daily?.done ? 1 : 0, relics: Object.keys(L.held).length, streak: n(json('sallow-almanac').streak), deeds: n(tally.claimed),
  };
  return { ...more, count, deepest, souls, era, rare, floors, wins: Math.max(wins, ids.size), beaten: ids.size, light: lv.pips, lightLow: lv.low, room: slots.length - count, firstName, bestName, beatenIds: [...ids] };
};

export const bindTown = (c: AppContext): void => {
  town().bind({
    facts: () => readFacts(c),
    grantSky: (kind, n) => { if (SKY.has(kind)) { c.sky.grant(kind as SkyPieceKind, n); c.persist(); } },
    addGlow: (p) => { c.light.addGlow(p); c.persist(); },
    addUniverse: (label) => {
      // A fixed serial per gift, so the same gift is the same universe on every device.
      let serial = hashString(`sallow-town-${label}`) & 0xffffff;
      for (let tries = 0; tries < 8; tries++) {
        const slot = c.box.add(serial);
        if (slot >= 0) { c.persist(); try { return c.universes.fromSerial(serial).name; } catch { return 'a universe'; } }
        if (c.box.count() >= c.box.slots().length) return null;
        serial = (serial + 1) & 0xffffff;
      }
      return null;
    },
    rivals: () => c.battles.rivals(),
  });
};

/** Start a ladder battle exactly as the Outside screen does, so the battle screen records the win. */
export const startBattle = (c: AppContext, rivalId: number): boolean => {
  const L = readLadder(), r0 = c.battles.rivals().find((r) => r.id === rivalId);
  if (!r0) return false;
  const grown = (base: Fighter): Fighter => {
    const relic = L.held[base.serialNumber];
    const stt = base.slot >= 0 ? c.box.slots()[base.slot]?.stats : undefined;
    const bond = stt && c.box.bondOf ? c.box.bondOf(stt) : undefined;
    return c.battles.grow ? c.battles.grow(base, { xp: L.xp[base.serialNumber] ?? 0, ...(relic ? { relic } : {}), ...(bond !== undefined ? { bond } : {}) }) : base;
  };
  const power = (f: Fighter): number => f.maxHp + f.depth + f.radiance;
  const mine = c.box.slots().map((s, slot) => (s ? grown(c.battles.fighter(c.universes.fromSerial(s.serialNumber), s.stats, slot)) : null))
    .filter((f): f is Fighter => f !== null).sort((a, b) => power(b) - power(a) || a.slot - b.slot).slice(0, 3);
  if (!mine.length) return false;
  const r = c.battles.rematch?.(r0, L.wins[r0.id] ?? 0) ?? r0;
  c.audio.sfx(r.boss ? 'boss' : 'confirm');
  c.battle = c.battles.start(r, mine, c.battles.rivalTeam(r, (s) => c.universes.fromSerial(s)));
  c.go('battle');
  return true;
};
