// The band: everything on the register, put where it belongs and added up.

import { stations } from '../stations/index.js';
import { unit, seed } from './hash.js';
import { DAY, midnight } from './clock.js';

export { stations };

// All frequencies from here on are absolute, in Hz.
export const BAND = Object.freeze({ lo: 6_000_000, hi: 6_500_000 });

// Nobody transmits here.
export const QUIET = Object.freeze({ lo: 6_250_000, hi: 6_260_000 });

// A receiver hears from its dial frequency up to this far above it.
export const PASSBAND = 3000;

// Strokes longer than this are cut on a fixed grid, so that fading can
// act on them and so that no consumer has to hold an hour-long stroke.
const SLICE = 0.5;

export const dial = (st) => Math.round(st.kHz * 1000);
const firstDay = (st) => midnight(st.since);

// Whether a station had come on the air by time t.
export const live = (st, t) => firstDay(st) <= t;

// Slow fading. Each station has its own, fixed by its designator.
export function fade(st, t) {
  const s = seed(st.id);
  const p1 = 19 + 23 * unit(s, 1);
  const p2 = 6.5 + 7 * unit(s, 2);
  const depth = 0.22 + 0.3 * unit(s, 3);
  const slow = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / p1 + 6.283 * unit(s, 4));
  const fast = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / p2 + 6.283 * unit(s, 5));
  return 1 - depth * slow * (0.55 + 0.45 * fast);
}

// Everything on the air between t0 and t1 and between lo and hi, as
// absolute strokes:
//
//   { k, s, v, t0, t1, f, f1, a, w, tau }
//
// k is unique to the stroke and stable however the window is chosen.
// s is the station's designator. v, where present, names an oscillator
// that should run unbroken through every stroke that shares it.
export function onAir(t0, t1, lo = BAND.lo, hi = BAND.hi) {
  const out = [];
  for (const st of stations) {
    const base = dial(st);
    if (base > hi || base + st.width < lo) continue;
    if (t1 <= firstDay(st)) continue;
    for (const s of st.strokes(t0, t1)) {
      if (s.t1 <= firstDay(st)) continue;
      const long = s.t1 - s.t0 > 2 * SLICE && !s.tau;
      const v = s.v ? `${st.id}/${s.v}` : long ? `${st.id}/${Math.round(s.t0 * 1000)}/${Math.round(s.f)}` : undefined;
      if (!long) {
        out.push(absolute(st, base, s, s.t0, s.t1, v));
        continue;
      }
      const i0 = Math.floor(Math.max(s.t0, t0) / SLICE);
      const i1 = Math.ceil(Math.min(s.t1, t1) / SLICE);
      for (let i = i0; i < i1; i++) {
        const a = Math.max(s.t0, i * SLICE);
        const b = Math.min(s.t1, (i + 1) * SLICE);
        if (b > a) out.push(absolute(st, base, s, a, b, v));
      }
    }
  }
  return out;
}

function absolute(st, base, s, t0, t1, v) {
  const glide = s.f1 !== undefined && s.f1 !== s.f;
  const at = (t) => (glide ? s.f + ((s.f1 - s.f) * (t - s.t0)) / (s.t1 - s.t0) : s.f);
  const f = base + at(t0);
  const o = { k: `${st.id}|${Math.round(t0 * 1000)}|${Math.round(f)}`, s: st.id, t0, t1, f, a: s.a * fade(st, t0) };
  if (v) o.v = v;
  if (glide) o.f1 = base + at(t1);
  if (s.w) o.w = s.w;
  if (s.tau) o.tau = s.tau;
  return o;
}

// The station a receiver tuned to hz would be copying, if any, and how
// far off tune it is. Given a time, only stations on the air by then count.
export function tuned(hz, reach = 500, t = Infinity) {
  let best = null;
  for (const st of stations) {
    if (!live(st, t)) continue;
    const off = hz - dial(st);
    if (Math.abs(off) <= reach && (!best || Math.abs(off) < Math.abs(best.off))) best = { station: st, off };
  }
  return best;
}

const MUSH = '~^*#%$@&!/\\|<>';

// What a decoder tuned to hz prints between t0 and t1: [{ t, s }]
//
// Within 120 Hz of the dial frequency the copy is clean. Beyond that
// characters start to go, and past 500 Hz there is nothing.
export function copy(hz, t0, t1) {
  const lock = tuned(hz, 500, t1);
  if (!lock) return [];
  const st = lock.station;
  const loss = Math.min(1, Math.max(0, (Math.abs(lock.off) - 120) / 380)) ** 1.5;
  const events = st.copy(t0, t1).filter((e) => e.t >= firstDay(st));
  if (loss === 0) return events;
  return events.map((e) => {
    let s = '';
    for (let i = 0; i < e.s.length; i++) {
      const roll = unit('mush', Math.round(e.t * 1000), i);
      if (e.s[i] === '\n' || roll >= loss) s += e.s[i];
      else if (roll < loss * 0.6) s += MUSH[Math.floor(unit('mush', Math.round(e.t * 1000), i, 1) * MUSH.length)];
    }
    return { t: e.t, s };
  });
}

// When each scheduled station is next on, soonest first:
//   [{ station, start, end }]   start <= t means it is on now.
export function sked(t) {
  const out = [];
  for (const st of stations) {
    if (!st.next || !live(st, t)) continue;
    const w = st.next(t);
    if (w) out.push({ station: st, start: w.start, end: w.end });
  }
  return out.sort((a, b) => a.start - b.start);
}

// The band from end to end as a list of segments, for the register:
//   [{ lo, hi, kind: 'station' | 'quiet' | 'unassigned', station? }]
export function plan() {
  const taken = stations.map((st) => ({ lo: dial(st), hi: dial(st) + st.width, kind: 'station', station: st }));
  taken.push({ lo: QUIET.lo, hi: QUIET.hi, kind: 'quiet' });
  taken.sort((a, b) => a.lo - b.lo);
  const out = [];
  let at = BAND.lo;
  for (const seg of taken) {
    if (seg.lo > at) out.push({ lo: at, hi: seg.lo, kind: 'unassigned' });
    out.push(seg);
    at = Math.max(at, seg.hi);
  }
  if (at < BAND.hi) out.push({ lo: at, hi: BAND.hi, kind: 'unassigned' });
  return out;
}

export { DAY };
