import { describe, it, expect } from 'vitest';
import { makeSeed, child, hashPath, rng, seedToHex, seedFromHex, hashString, seedToU32, mix } from './hash';
import { serialToSeed, formatSerial, parseSerial } from './serial';
import { fxMul, fxDiv, fxSin, fxCos, fxSqrt, FX_ONE, isqrt } from './fixed';
import { createBus } from './bus';

// Golden vectors. If any of these change, every universe changes: do not update them casually.
describe('core/hash golden vectors', () => {
  const s = makeSeed(1, 2);
  it('child, hashPath, hashString, seedToU32', () => {
    expect(seedToHex(child(s, 'a'))).toBe('59c6f954eceb11cb');
    expect(seedToHex(child(s, 3))).toBe('5bef95296f9200dc');
    expect(seedToHex(hashPath(s, [0, 1, 2, 3, 4, 5, 6]))).toBe('a78001bbcefa4d81');
    expect(hashString('sallow')).toBe(2911572879);
    expect(seedToU32(s)).toBe(3008106123);
  });
  it('rng sequence', () => {
    const r = rng(s);
    expect([r.u32(), r.u32(), r.u32(), r.int(100), r.range(5, 9)]).toEqual([2141803588, 813744163, 4098081036, 83, 7]);
  });
  it('serial seed', () => {
    expect(seedToHex(serialToSeed(0x3f9a77))).toBe('49fd9c4d0bd9f9ba');
  });
  it('hashPath equals incremental mix', () => {
    let a = s;
    for (const i of [3, 1, 4, 1, 5]) a = mix(a, i);
    expect(a).toEqual(hashPath(s, [3, 1, 4, 1, 5]));
  });
  it('hex round trip', () => {
    expect(seedFromHex(seedToHex(child(s, 'x')))).toEqual(child(s, 'x'));
  });
  it('rng.int stays in range and covers it', () => {
    const r = rng(s);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });
});

describe('core/serial', () => {
  it('formats and parses', () => {
    expect(formatSerial(0x3f9a77)).toBe('No. 3F9A-77');
    expect(parseSerial('No. 3F9A-77')).toBe(0x3f9a77);
    expect(parseSerial('3f9a77')).toBe(0x3f9a77);
    expect(parseSerial('nope')).toBeNull();
  });
});

describe('core/fixed', () => {
  it('golden values', () => {
    expect([fxMul(3 * FX_ONE, FX_ONE >> 1), fxDiv(FX_ONE, 3 * FX_ONE), fxSin(FX_ONE >> 2), fxSin(FX_ONE >> 3), fxSqrt(2 * FX_ONE)]).toEqual([
      98304, 21845, 65536, 46386, 92681,
    ]);
  });
  it('sin and cos are close to Math.sin', () => {
    for (let i = 0; i < 64; i++) {
      const t = (i * FX_ONE) / 64;
      expect(Math.abs(fxSin(t) / FX_ONE - Math.sin(2 * Math.PI * (i / 64)))).toBeLessThan(0.002);
      expect(Math.abs(fxCos(t) / FX_ONE - Math.cos(2 * Math.PI * (i / 64)))).toBeLessThan(0.002);
    }
  });
  it('fxMul is exact for large values', () => {
    expect(fxMul(15000 * FX_ONE, 2 * FX_ONE)).toBe(30000 * FX_ONE);
    expect(fxMul(-5 * FX_ONE, FX_ONE >> 2)).toBe(-(5 * FX_ONE) >> 2);
  });
  it('isqrt', () => {
    expect([isqrt(0), isqrt(15), isqrt(16), isqrt(2 ** 40)]).toEqual([0, 3, 4, 2 ** 20]);
  });
});

describe('core/bus', () => {
  it('on, once, off', () => {
    const bus = createBus<{ a: number }>();
    const got: number[] = [];
    const off = bus.on('a', (n) => got.push(n));
    bus.once('a', (n) => got.push(n * 10));
    bus.emit('a', 1);
    bus.emit('a', 2);
    off();
    bus.emit('a', 3);
    expect(got).toEqual([1, 10, 2]);
  });
});
