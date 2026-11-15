// Keyed carrier.

const CODE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
  5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '?': '..--..', '=': '-...-', '+': '.-.-.', '/': '-..-.', '.': '.-.-.-',
  ',': '--..--', '-': '-....-', ':': '---...', "'": '.----.', '!': '-.-.--',
};

export const morse = (ch) => CODE[ch];

// Split text into sendable units: single characters, spaces, and
// prosigns written <LIKE THIS>, which are sent as one run-together symbol.
function units(text) {
  const out = [];
  const re = /<([A-Z]+)>|(\s+)|(.)/g;
  let m;
  while ((m = re.exec(text.toUpperCase()))) {
    if (m[1]) {
      const code = [...m[1]].map((c) => CODE[c] || '').join('');
      if (code) out.push({ code, print: `<${m[1]}>` });
    } else if (m[2]) {
      out.push({ gap: true });
    } else if (CODE[m[3]]) {
      out.push({ code: CODE[m[3]], print: m[3] });
    }
  }
  return out;
}

// key(text, { t0, wpm, f, a, v }) -> { strokes, copy, end }
//
// Timing is standard: a dot is 1.2 / wpm seconds, a dash three dots, one
// dot between elements, three between characters, seven between words.
export function key(text, { t0, wpm = 16, f = 700, a = 1, v = 'key' } = {}) {
  const dot = 1.2 / wpm;
  const strokes = [];
  const copy = [];
  let t = t0;
  let first = true;
  let spaced = true;

  for (const u of units(text)) {
    if (u.gap) {
      if (!spaced) {
        t += 4 * dot; // on top of the 3 already left after a character
        copy.push({ t: t - 2 * dot, s: ' ' });
        spaced = true;
      }
      continue;
    }
    for (let i = 0; i < u.code.length; i++) {
      const len = u.code[i] === '-' ? 3 * dot : dot;
      strokes.push({ t0: t, t1: t + len, f, a, v });
      t += len + (i < u.code.length - 1 ? dot : 0);
    }
    copy.push({ t, s: u.print });
    t += 3 * dot;
    first = false;
    spaced = false;
  }

  return { strokes, copy, end: first ? t0 : t - 3 * dot };
}

// How long text would take, without building it.
export function duration(text, wpm = 16) {
  return key(text, { t0: 0, wpm }).end;
}
