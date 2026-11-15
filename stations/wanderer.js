// C1. A bare carrier that does not stay where it is put.
//
// It sits above or below the middle of its allocation by six kilohertz
// for every metre the tide at Sill Head stands above or below its mean.
// At the turn of the tide it pips: three times at high water, once at low.

import { cycle } from '../lib/cycle.js';
import { height, turns, MEAN, REACH } from '../lib/world/tide.js';

const SWING = 6000; // Hz per metre
const CENTRE = 20000; // Hz above the dial frequency
const PIP = { above: 400, on: 0.12, off: 0.13 };

export const offset = (t) => CENTRE + (height(t) - MEAN) * SWING;

const minute = cycle({
  period: 60,
  build(n, start) {
    const strokes = [];
    const copy = [];
    for (let s = 0; s < 60; s++) {
      strokes.push({ t0: start + s, t1: start + s + 1, f: offset(start + s), f1: offset(start + s + 1), a: 0.9, v: 'carrier' });
    }
    for (const turn of turns(start, start + 60)) {
      const count = turn.high ? 3 : 1;
      for (let i = 0; i < count; i++) {
        const t = turn.t + i * (PIP.on + PIP.off);
        strokes.push({ t0: t, t1: t + PIP.on, f: offset(t) + PIP.above, a: 1 });
        copy.push({ t: t + PIP.on, s: i === count - 1 ? '.\n' : '.' });
      }
    }
    return { strokes, copy, end: start + 60 };
  },
});

export default {
  id: 'C1',
  name: 'the Wanderer',
  kHz: 6400.0,
  width: 2 * CENTRE,
  emission: 'carrier',
  keeper: 1,
  since: '2026-11-15',
  continuous: true,
  strokes: minute.strokes,
  copy: minute.copy,
  // How far the carrier can get from the middle, for anyone checking it stays in.
  reach: REACH * SWING + PIP.above,
};
