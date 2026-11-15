// The noise floor, and what is under it.
//
// The floor is noise power with a mean of one. It is not random: it is a
// hash of where and when, so the same patch of paper always comes out
// the same.
//
// In the quiet segment the mean is very slightly more than one in some
// places. Each keeper has a mark, nine cells by nine, and the marks are
// laid out in the quiet segment eight to a row, a row every five seconds,
// repeating every frame. A cell is half a second by 125 Hz. Where a cell
// of a mark is filled, the floor is raised by DEPTH. That is far too
// little to see or hear. It is enough to find by adding up frames.

import { hash } from './hash.js';
import { FRAME, midnight } from './clock.js';
import { QUIET } from './band.js';
import { keepers } from '../keepers/index.js';

export const DEPTH = 0.25;
export const CELL = Object.freeze({ t: 0.5, f: 125 });
export const SIZE = 9; // cells along each side of a mark
export const PLACE = Object.freeze({ t: 5, f: 1250, across: 8, down: FRAME / 5 });
export const PLACES = PLACE.across * PLACE.down;

// Where keeper n's mark sits: seconds into the frame, and Hz. Marks lie
// on a grid of cells that starts at the bottom of the quiet segment and
// the top of the frame, with one empty cell between neighbours.
export function place(n) {
  const i = n - 1;
  return {
    t: Math.floor(i / PLACE.across) * PLACE.t,
    f: QUIET.lo + (i % PLACE.across) * PLACE.f,
  };
}

// Fill `row` with the floor: noise for the slice of paper starting at
// time t, lasting dt, whose first bin starts at f0 and whose bins are
// hz wide. Mean one, plus whatever is under it.
export function floor(row, t, dt, f0, hz) {
  const tk = Math.round(t * 1000);
  const fk = Math.round(f0 / hz);
  const hk = Math.round(hz * 100);
  for (let i = 0; i < row.length; i++) {
    row[i] = -Math.log(1 - hash(tk, fk + i, hk) / 4294967296);
  }
  under(row, t, dt, f0, hz);
  return row;
}

// Raise the mean of `row` where the marks are.
export function under(row, t, dt, f0, hz) {
  const f1 = f0 + row.length * hz;
  if (f1 <= QUIET.lo || f0 >= QUIET.hi) return row;
  const phase = ((t % FRAME) + FRAME) % FRAME;
  for (const k of keepers) {
    if (k.n < 1 || k.n > PLACES || midnight(k.since) > t) continue;
    const at = place(k.n);
    // Which cell rows of the mark does this slice of time touch?
    const r0 = Math.max(0, Math.floor((phase - at.t) / CELL.t));
    const r1 = Math.min(SIZE - 1, Math.floor((phase + dt - at.t - 1e-9) / CELL.t));
    for (let r = r0; r <= r1; r++) {
      const ta = at.t + r * CELL.t;
      const share = (Math.min(phase + dt, ta + CELL.t) - Math.max(phase, ta)) / dt;
      if (share <= 0) continue;
      const line = k.mark[r];
      for (let c = 0; c < SIZE; c++) {
        if (line[c] !== '#') continue;
        const fa = at.f + c * CELL.f;
        const b0 = Math.max(0, Math.floor((fa - f0) / hz));
        const b1 = Math.min(row.length - 1, Math.ceil((fa + CELL.f - f0) / hz) - 1);
        for (let b = b0; b <= b1; b++) {
          const lo = f0 + b * hz;
          const cover = (Math.min(lo + hz, fa + CELL.f) - Math.max(lo, fa)) / hz;
          if (cover > 0) row[b] *= 1 + DEPTH * share * cover;
        }
      }
    }
  }
  return row;
}
