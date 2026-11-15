// Struck metal. Each note is a fundamental and two partials that die
// away at different rates, which is most of what a small bell is.

// Scale degree -> Hz, on a seven-note scale given as semitone offsets.
// Degree 0 is the root; degrees run on above and below it.
export function degree(n, { root = 587.33, scale = [0, 2, 3, 5, 7, 9, 10] } = {}) {
  const len = scale.length;
  const oct = Math.floor(n / len);
  const semis = 12 * oct + scale[((n % len) + len) % len];
  return root * 2 ** (semis / 12);
}

// strike([{ t, hz, a }], { tau, ceiling }) -> strokes
//
// Partials above `ceiling` Hz are left out; a station has to stay inside
// its width.
export function strike(notes, { tau = 0.7, ceiling = 3000 } = {}) {
  const strokes = [];
  for (const n of notes) {
    const a = n.a ?? 1;
    const partials = [
      [1, 1, tau],
      [2.76, 0.28, tau * 0.45],
      [5.4, 0.12, tau * 0.18],
    ];
    for (const [ratio, level, decay] of partials) {
      const f = n.hz * ratio;
      if (f > ceiling) continue;
      strokes.push({ t0: n.t, t1: n.t + decay * 5, f, a: a * level, tau: decay });
    }
  }
  return strokes;
}
