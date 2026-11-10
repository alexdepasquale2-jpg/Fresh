/**
 * Q16.16 fixed-point helpers. Use in src/gen, src/rules and src/sim instead of
 * floats. Angles are in "turns": FX_ONE is one full turn.
 */
export type Fx = number;
export const FX_SHIFT = 16;
export const FX_ONE: Fx = 1 << FX_SHIFT;
export const FX_HALF: Fx = FX_ONE >> 1;

export const fx = (n: number): Fx => (n << FX_SHIFT) | 0;
/** Convert a ratio num/den to Fx, exactly truncated. */
export const fxRatio = (num: number, den: number): Fx => Math.trunc((num * FX_ONE) / den) | 0;
export const fxToInt = (a: Fx): number => a >> FX_SHIFT;
/** For rendering only. Never feed the result back into sim state. */
export const fxToFloat = (a: Fx): number => a / FX_ONE;

/** Exact a*b>>16 for |a|,|b| < 2^31 using split multiplication. */
export const fxMul = (a: Fx, b: Fx): Fx => {
  const hi = (a >> 16) * b;
  const lo = Math.trunc(((a & 0xffff) * b) / FX_ONE);
  return (hi + lo) | 0;
};

export const fxDiv = (a: Fx, b: Fx): Fx => {
  if (b === 0) throw new Error('fxDiv by zero');
  return Math.trunc((a * FX_ONE) / b) | 0;
};

export const fxClamp = (a: Fx, lo: Fx, hi: Fx): Fx => (a < lo ? lo : a > hi ? hi : a);
export const fxLerp = (a: Fx, b: Fx, t: Fx): Fx => (a + fxMul(b - a, t)) | 0;

/** Integer square root (floor) of a non-negative integer < 2^53. */
export const isqrt = (n: number): number => {
  if (n < 0) throw new Error('isqrt of negative');
  if (n < 2) return n;
  let x = Math.floor(Math.sqrt(n)); // sqrt is correctly rounded by IEEE 754
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
};

export const fxSqrt = (a: Fx): Fx => isqrt(a * FX_ONE) | 0;

/**
 * sin of an angle in turns (Fx), integer-only. Bhaskara-style parabolic
 * approximation with one refinement; max error about 0.001.
 */
export const fxSin = (turns: Fx): Fx => {
  let t = turns & (FX_ONE - 1); // [0, 1) turn
  let sign = 1;
  if (t >= FX_HALF) {
    t -= FX_HALF;
    sign = -1;
  }
  // y = 4x(1-x) on half turn mapped to x in [0,1)
  const x = t * 2; // Fx in [0, 1)
  const y = fxMul(4 * x, FX_ONE - x);
  // refine: y = 0.775y + 0.225y^2
  const r = fxMul(50790, y) + fxMul(14746, fxMul(y, y));
  return (sign * r) | 0;
};

export const fxCos = (turns: Fx): Fx => fxSin((turns + (FX_ONE >> 2)) | 0);
