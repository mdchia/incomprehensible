// Teleprinter. Frequency-shift keying, 45.45 baud, 170 Hz shift,
// five-unit code (ITA2), one start unit, one and a half stop units.
//
// This is the ordinary amateur standard, deliberately. A real decoder
// pointed at the loudspeaker should print.

const LTRS = 31;
const FIGS = 27;

//               0    1    2     3    4    5    6    7    8     9    10   11   12   13   14   15
const LETTERS = ['\0', 'E', '\n', 'A', ' ', 'S', 'I', 'U', '\r', 'D', 'R', 'J', 'N', 'F', 'C', 'K',
//               16   17   18   19   20   21   22   23   24   25   26   27    28   29   30   31
                 'T', 'Z', 'L', 'W', 'H', 'Y', 'P', 'Q', 'O', 'B', 'G', null, 'M', 'X', 'V', null];
const FIGURES = ['\0', '3', '\n', '-', ' ', "'", '8', '7', '\r', null, '4', null, ',', null, ':', '(',
                 '5', '+', ')', '2', null, '6', '0', '1', '9', '?', null, null, '.', '/', '=', null];

const inLetters = new Map();
const inFigures = new Map();
LETTERS.forEach((c, i) => c !== null && inLetters.set(c, i));
FIGURES.forEach((c, i) => c !== null && !inLetters.has(c) && inFigures.set(c, i));

export const printable = (ch) => inLetters.has(ch) || inFigures.has(ch);

// Text -> five-unit codes, with shifts inserted as needed.
//
// Some printers drop back to letters whenever they see a space, and some
// do not. The shift is therefore sent again after every space, whichever
// case comes next, so that both kinds print the same thing.
export function encode(text) {
  const codes = [LTRS];
  let figs = false; // the case a printer that ignores spaces is in
  let sure = true; // false after a space: the other kind may have unshifted
  for (const ch of text.toUpperCase()) {
    if (inLetters.has(ch)) {
      const code = inLetters.get(ch);
      if (code === 4) sure = false;
      // Space, CR, LF and NUL exist in both cases and need no shift.
      else if (code !== 0 && code !== 2 && code !== 8 && figs) {
        codes.push(LTRS);
        figs = false;
        sure = true;
      }
      codes.push(code);
    } else if (inFigures.has(ch)) {
      if (!figs || !sure) {
        codes.push(FIGS);
        figs = true;
        sure = true;
      }
      codes.push(inFigures.get(ch));
    } else {
      codes.push(4); // anything unprintable goes out as a space
      sure = false;
    }
  }
  return codes;
}

// Five-unit codes -> text. The inverse of encode; used to check that
// what goes out can be read back.
export function decode(codes) {
  let figs = false;
  let out = '';
  for (const c of codes) {
    if (c === LTRS) figs = false;
    else if (c === FIGS) figs = true;
    else {
      const ch = (figs ? FIGURES : LETTERS)[c];
      if (ch !== null && ch !== '\0') out += ch;
    }
  }
  return out;
}

export const BAUD = 45.45;
export const UNIT = 0.022; // seconds per unit; 1 / 45.45
export const MARK = 2125;
export const SPACE = 2295;
export const CHAR = 7.5 * UNIT;

// teleprint(text, { t0, a }) -> { strokes, copy, end }
//
// Idle (and the stop unit) is mark. Runs of the same tone are merged
// into single strokes; the whole transmission is one voice.
export function teleprint(text, { t0, a = 1, mark = MARK, space = SPACE, v = 'fsk' } = {}) {
  const strokes = [];
  const copy = [];
  const codes = encode(text);
  let t = t0;
  let run = null; // the stroke currently being extended

  const put = (isMark, len) => {
    const f = isMark ? mark : space;
    if (run && run.f === f && Math.abs(run.t1 - t) < 1e-9) run.t1 = t + len;
    else {
      run = { t0: t, t1: t + len, f, a, v };
      strokes.push(run);
    }
    t += len;
  };

  let figs = false;
  for (const code of codes) {
    put(false, UNIT); // start
    for (let b = 0; b < 5; b++) put(((code >> b) & 1) === 1, UNIT);
    put(true, 1.5 * UNIT); // stop
    if (code === LTRS) figs = false;
    else if (code === FIGS) figs = true;
    else {
      const ch = (figs ? FIGURES : LETTERS)[code];
      if (ch !== null && ch !== '\0' && ch !== '\r') copy.push({ t, s: ch });
    }
  }
  return { strokes, copy, end: t };
}

// A steady mark tone, as sent between messages.
export const idle = (t0, t1, { a = 1, mark = MARK, v = 'fsk' } = {}) => ({ t0, t1, f: mark, a, v });

// Read strokes back into text, the way a decoder would: sample the tone
// in the middle of each unit. Used by the tests; not used on the air.
export function demodulate(strokes, { mark = MARK, space = SPACE } = {}) {
  const fsk = strokes.filter((s) => s.f === mark || s.f === space).sort((x, y) => x.t0 - y.t0);
  if (!fsk.length) return '';
  const toneAt = (t) => {
    for (const s of fsk) if (t >= s.t0 && t < s.t1) return s.f;
    return mark;
  };
  const end = fsk[fsk.length - 1].t1;
  const codes = [];
  let t = fsk[0].t0;
  while (t < end) {
    if (toneAt(t + UNIT / 2) === space) {
      let code = 0;
      for (let b = 0; b < 5; b++) if (toneAt(t + UNIT * (1.5 + b)) === mark) code |= 1 << b;
      codes.push(code);
      t += CHAR;
    } else {
      t += UNIT / 4;
    }
  }
  return decode(codes);
}
