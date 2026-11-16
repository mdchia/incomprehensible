// Paper. Turns strokes into rows of power, the same way for the receiver
// in the browser and for the tools in bin/.

import { floor } from './floor.js';

// Power, relative to the noise floor, of a full-amplitude line.
export const INK = 40;

// Add the strokes to `row`, a slice of paper starting at time t, lasting
// dt, whose first bin starts at f0 and whose bins are hz wide. Strokes
// are absolute, as given by band.onAir(). `nib` is the narrowest a line
// may be drawn, in Hz; a fine line is easier to read a little wider.
export function expose(row, strokes, t, dt, f0, hz, nib = 0) {
  const n = row.length;
  const t1 = t + dt;
  for (const s of strokes) {
    if (s.t1 <= t || s.t0 >= t1) continue;
    const a = Math.max(s.t0, t);
    const b = Math.min(s.t1, t1);
    let amp = s.a;
    if (s.tau) amp *= Math.exp(-((a + b) / 2 - s.t0) / s.tau);
    const power = INK * amp * amp * ((b - a) / dt);
    if (power < 1e-4) continue;

    // The span of frequency the stroke covers during this slice.
    let fa = s.f;
    let fb = s.f;
    if (s.f1 !== undefined) {
      const rate = (s.f1 - s.f) / (s.t1 - s.t0);
      fa = s.f + rate * (a - s.t0);
      fb = s.f + rate * (b - s.t0);
      if (fb < fa) [fa, fb] = [fb, fa];
    }
    const half = Math.max(s.w || 0, nib) / 2;
    fa -= half;
    fb += half;

    if (fb - fa < hz) {
      // Narrower than a bin: share it between the two nearest.
      const x = ((fa + fb) / 2 - f0) / hz - 0.5;
      const i = Math.floor(x);
      const frac = x - i;
      if (i >= 0 && i < n) row[i] += power * (1 - frac);
      if (i + 1 >= 0 && i + 1 < n) row[i + 1] += power * frac;
    } else {
      const i0 = Math.max(0, Math.floor((fa - f0) / hz));
      const i1 = Math.min(n - 1, Math.ceil((fb - f0) / hz) - 1);
      for (let i = i0; i <= i1; i++) {
        const lo = f0 + i * hz;
        const cover = (Math.min(lo + hz, fb) - Math.max(lo, fa)) / hz;
        if (cover > 0) row[i] += power * cover;
      }
    }
  }
  return row;
}

// One finished row: floor plus strokes.
export function rowOf(row, strokes, t, dt, f0, hz, nib = 0) {
  floor(row, t, dt, f0, hz);
  return expose(row, strokes, t, dt, f0, hz, nib);
}

// Power -> how dark, 0..1. Noise comes out as light grain; a strong
// signal comes out black.
export function darkness(p, lo = 0.5, hi = 16) {
  if (p <= 0) return 0;
  const d = (10 * Math.log10(p) - lo) / (hi - lo);
  return d <= 0 ? 0 : d >= 1 ? 1 : d;
}

// Power -> how much ink, 0..255, the way the receiver's pen lays it down.
// The pen needs more to start than darkness() does, and comes on slowly,
// so that the noise prints as a light grain and not as a grey wash.
const PEN = { lo: 2.6, hi: 17 }; // dB above the mean floor: where ink starts, and where it is solid
const DB = 10 / Math.LN10;
export function ink(p) {
  if (p <= 1.8) return 0;
  const d = (Math.log(p) * DB - PEN.lo) / (PEN.hi - PEN.lo);
  return d <= 0 ? 0 : d >= 1 ? 255 : (d ** 1.35 * 255) | 0;
}

// A row of darkness as text, for a terminal.
const SHADES = ' .:-=+*#%@';
export function shade(row, lo, hi) {
  let out = '';
  for (let i = 0; i < row.length; i++) {
    out += SHADES[Math.min(SHADES.length - 1, Math.floor(darkness(row[i], lo, hi) * SHADES.length))];
  }
  return out;
}
