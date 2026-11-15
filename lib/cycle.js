// Most stations repeat. This is the repeating part.
//
// A stroke is one continuous deposit of energy on the time-frequency plane:
//
//   { t0, t1, f, a }            a line: from t0 to t1 (UTC seconds), f Hz above
//                               the station's dial frequency, amplitude 0..1
//   { ..., f1 }                 a glide: f at t0, f1 at t1
//   { ..., w }                  a block: w Hz wide, centred on f
//   { ..., tau }                a struck note: amplitude decays with time constant tau
//   { ..., v: 'name' }          strokes sharing a voice are one oscillator, keyed and
//                               retuned without a break in phase
//
// A copy event is what a decoder would print, and when: { t, s }.
//
// cycle({ period, phase, build }) calls build(n, start) once for each
// period it needs and expects back { strokes, copy, end } in absolute time,
// or nothing if the station is silent that period. build must depend on
// nothing but its arguments and the repository.
//
// What a period builds may run on past the end of the period, into the
// next one, but no further than that.

export function cycle({ period, phase = 0, build, keep = 8, horizon = 4000 }) {
  const cache = new Map();

  function get(n) {
    let c = cache.get(n);
    if (c) return c;
    const start = n * period + phase;
    const made = build(n, start) || {};
    const strokes = (made.strokes || []).slice().sort((a, b) => a.t0 - b.t0);
    const copy = (made.copy || []).slice().sort((a, b) => a.t - b.t);
    let longest = 0;
    let last = start;
    let first = Infinity;
    for (const s of strokes) {
      if (s.t1 - s.t0 > longest) longest = s.t1 - s.t0;
      if (s.t1 > last) last = s.t1;
      if (s.t0 < first) first = s.t0;
    }
    c = {
      strokes,
      copy,
      longest,
      start: strokes.length ? (made.start ?? first) : null,
      end: strokes.length ? (made.end ?? last) : null,
    };
    cache.set(n, c);
    if (cache.size > keep) cache.delete(cache.keys().next().value);
    return c;
  }

  // First index i with key(list[i]) >= x.
  function lower(list, key, x) {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (key(list[mid]) < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  const index = (t) => Math.floor((t - phase) / period);

  return {
    period,
    phase,

    strokes(t0, t1) {
      const out = [];
      for (let n = index(t0) - 1; n <= index(t1); n++) {
        const c = get(n);
        if (!c.strokes.length) continue;
        for (let i = lower(c.strokes, (s) => s.t0, t0 - c.longest); i < c.strokes.length; i++) {
          const s = c.strokes[i];
          if (s.t0 >= t1) break;
          if (s.t1 > t0) out.push(s);
        }
      }
      return out;
    },

    copy(t0, t1) {
      const out = [];
      for (let n = index(t0) - 1; n <= index(t1); n++) {
        const c = get(n);
        for (let i = lower(c.copy, (e) => e.t, t0); i < c.copy.length; i++) {
          if (c.copy[i].t >= t1) break;
          out.push(c.copy[i]);
        }
      }
      return out;
    },

    // The transmission in progress at t, or failing that the next one.
    next(t) {
      const n0 = index(t) - 1;
      for (let n = n0; n < n0 + horizon; n++) {
        const c = get(n);
        if (c.start !== null && c.end > t) return { start: c.start, end: c.end };
      }
      return null;
    },
  };
}

// Small conveniences for building strokes.
export const line = (t0, t1, f, a = 1, more) => ({ t0, t1, f, a, ...more });
