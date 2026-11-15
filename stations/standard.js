// T1. Seconds, minutes, and a frame.
//
// Every second a tick at 1000 Hz. A doubled tick is a one, a single tick
// a zero, a long tick a position marker. Second 0 is a long tone: 1000 Hz
// for the minute, 1500 Hz for the hour. Under it for the first 45 seconds,
// a steady tone: 500 Hz in even minutes, 600 Hz in odd.
//
// The frame, by second (most significant bit first):
//
//    1-3   minute, tens          20-21  day of year, hundreds   40-43  year, units
//    4-7   minute, units         22-25  day of year, tens       44-48  Q
//   10-11  hour, tens            30-33  day of year, units      50-57  W
//   12-15  hour, units           34-37  year, tens              58     parity (even)
//
// Seconds 9, 19, 29, 39, 49 and 59 are markers. Everything else is zero.
// Q and W are counts. What they count is in frame(), below.

import { cycle } from '../lib/cycle.js';
import { utc, midnight } from '../lib/clock.js';
import { stationsAt } from '../lib/census.js';
import { keepers } from '../keepers/index.js';

const keepersAt = (t) => keepers.filter((k) => midnight(k.since) <= t).length;

export function frame(t) {
  const u = utc(t);
  const b = new Array(60).fill(0);
  const put = (at, value, width) => {
    for (let i = 0; i < width; i++) b[at + i] = (value >> (width - 1 - i)) & 1;
  };
  put(1, Math.floor(u.minute / 10), 3);
  put(4, u.minute % 10, 4);
  put(10, Math.floor(u.hour / 10), 2);
  put(12, u.hour % 10, 4);
  put(20, Math.floor(u.doy / 100), 2);
  put(22, Math.floor(u.doy / 10) % 10, 4);
  put(30, u.doy % 10, 4);
  put(34, Math.floor(u.year / 10) % 10, 4);
  put(40, u.year % 10, 4);
  put(44, stationsAt(t) & 31, 5); // Q: stations on the register
  put(50, keepersAt(t) & 255, 8); // W: keepers on the roll
  let parity = 0;
  for (let s = 1; s <= 57; s++) parity ^= b[s];
  b[58] = parity;
  return b;
}

const TICK = 0.04;
const MARKER = 0.25;

const minute = cycle({
  period: 60,
  build(n, start) {
    const u = utc(start);
    const bits = frame(start);
    const strokes = [];
    const copy = [];

    const top = u.minute === 0;
    strokes.push({ t0: start, t1: start + 0.8, f: top ? 1500 : 1000, a: 1 });
    copy.push({ t: start + 0.8, s: top ? '\nH ' : '\nM ' });

    for (let s = 1; s < 60; s++) {
      const t = start + s;
      if (s % 10 === 9) {
        strokes.push({ t0: t, t1: t + MARKER, f: 1000, a: 1 });
        copy.push({ t: t + MARKER, s: ' ' });
      } else {
        strokes.push({ t0: t, t1: t + TICK, f: 1000, a: 1 });
        if (bits[s]) strokes.push({ t0: t + 0.1, t1: t + 0.1 + TICK, f: 1000, a: 1 });
        copy.push({ t: t + 0.1 + TICK, s: bits[s] ? '1' : '0' });
      }
    }

    strokes.push({ t0: start + 1, t1: start + 45, f: n % 2 === 0 ? 500 : 600, a: 0.3, v: 'tone' });

    return { strokes, copy, end: start + 60 };
  },
});

export default {
  id: 'T1',
  name: 'the Standard',
  kHz: 6000.0,
  width: 2000,
  emission: 'ticks',
  keeper: 1,
  since: '2026-11-15',
  continuous: true,
  strokes: minute.strokes,
  copy: minute.copy,
};
