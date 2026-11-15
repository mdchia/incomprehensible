// Polytone: one tone per digit, ten tones a hundred hertz apart.
// Groups of digits are separated by silence.

export const BASE = 600; // the tone for 0
export const STEP = 100; // each digit is this much higher than the last

// poly('471 471 471', { t0 }) -> { strokes, copy, end }
//
// A newline in the text is a longer pause, and prints as a newline.
export function poly(text, { t0, a = 1, base = BASE, step = STEP, tone = 0.11, rest = 0.025, gap = 0.34, pause = 1.2, v = 'poly' } = {}) {
  const strokes = [];
  const copy = [];
  let t = t0;
  let pending = '';
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') {
      if (pending) {
        copy.push({ t, s: pending });
        pending = '';
      }
      strokes.push({ t0: t, t1: t + tone, f: base + step * Number(ch), a, v });
      t += tone;
      copy.push({ t, s: ch });
      t += rest;
    } else if (ch === ' ') {
      t += gap;
      pending = ' ';
    } else if (ch === '\n') {
      t += pause;
      pending = '\n';
    }
  }
  if (pending === '\n') copy.push({ t, s: '\n' });
  return { strokes, copy, end: t };
}
