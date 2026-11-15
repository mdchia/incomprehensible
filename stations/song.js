// S1. A song, at five to the hour, played from the beginning each time.
//
// It began on the day of first carrier with one note, and has gained one
// note every day since. The notes are not chosen. Note n is given by
//
//   a(0) = 0      a(2n) = -a(n)      a(2n + 1) = a(n) + 1
//
// read as steps of a scale either side of D. Any part of it, played at
// half speed, is the whole of it. It does not repeat and it does not end.

import { cycle } from '../lib/cycle.js';
import { strike, degree } from '../lib/modes/chime.js';
import { dayOf } from '../lib/clock.js';

const BEAT = 0.36;
const LEAD = 3; // seconds of bare carrier before the first note
const TAIL = 3; // and after the last

export function step(n) {
  let a = 0;
  for (let bit = 31 - Math.clz32(n); bit >= 0; bit--) a = (n >> bit) & 1 ? a + 1 : -a;
  return a || 0; // never minus nothing
}

// How many notes the song has on the day containing t.
export const length = (t) => Math.max(0, dayOf(t) + 1);

const NAMES = ['D', 'E', 'F', 'G', 'A', 'B', 'C'];
const name = (d) => NAMES[((d % 7) + 7) % 7];

const hour = cycle({
  period: 3600,
  phase: 55 * 60,
  build(n, start) {
    const count = length(start);
    if (!count) return null;
    const notes = [];
    const copy = [];
    for (let i = 0; i < count; i++) {
      const d = step(i);
      const t = start + LEAD + i * BEAT;
      notes.push({ t, hz: degree(d), a: i % 4 === 0 ? 1 : 0.78 });
      copy.push({ t: t + 0.05, s: name(d) + (i % 8 === 7 ? '\n' : ' ') });
    }
    const end = start + LEAD + count * BEAT + TAIL;
    copy.push({ t: end, s: '\n' });
    const strokes = strike(notes, { tau: 0.8 });
    strokes.push({ t0: start, t1: end, f: 0, a: 0.25, v: 'carrier' });
    return { strokes, copy, end };
  },
});

export default {
  id: 'S1',
  name: 'the Song',
  kHz: 6470.0,
  width: 3000,
  emission: 'chimes',
  keeper: 1,
  since: '2026-11-15',
  strokes: hour.strokes,
  copy: hour.copy,
  next: hour.next,
};
