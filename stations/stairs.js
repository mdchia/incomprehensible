// P1. Figures, as tones, at a quarter past and a quarter to.
//
// Each transmission carries one item of traffic from traffic/. It goes:
//
//   the interval signal, three times
//   SSS SSS SSS        serial number of the item
//   GG GG              how many groups follow
//   IIIII IIIII        the indicator
//   ...                the groups, five figures each
//   000 000            out
//
// The figures are made in two steps, and can be unmade by hand.
//
// 1. The text is turned into figures on this board. A letter in the top
//    row is its column. Any other is its row, then its column.
//
//          0 1 2 3 4 5 6 7 8 9
//          O R I . E N . T _ .        _ is a space
//      3   A B C D F G H J K L
//      6   M P Q S U V W X Y Z
//      9   0 1 2 3 4 5 6 7 8 9
//
//    Spaces are added to fill the last group of five.
//
// 2. A key is grown from the indicator by chain addition: each new figure
//    is the sum, without carrying, of the figure five back and the figure
//    four back. The key is added to the text, figure by figure, without
//    carrying. The five figures of the indicator itself are not used.
//
// To read a message, grow the key from the indicator, subtract it without
// borrowing, and look the result up on the board.

import { cycle } from '../lib/cycle.js';
import { poly } from '../lib/modes/tones.js';
import { strike, degree } from '../lib/modes/chime.js';
import { hash } from '../lib/hash.js';
import { pad, midnight, EPOCH } from '../lib/clock.js';
import { traffic } from '../traffic/index.js';

const TOP = 'ORI.EN.T ';
const ROWS = { 3: 'ABCDFGHJKL', 6: 'MPQSUVWXYZ', 9: '0123456789' };

const toFigures = new Map();
[...TOP].forEach((ch, col) => ch !== '.' && toFigures.set(ch, String(col)));
toFigures.set(' ', '8');
for (const [row, chars] of Object.entries(ROWS)) [...chars].forEach((ch, col) => toFigures.set(ch, row + col));

export const sendable = (ch) => toFigures.has(ch);

// Step 1.
export function board(text) {
  let out = '';
  for (const ch of text.toUpperCase()) out += toFigures.get(ch) ?? '8';
  while (out.length % 5) out += '8';
  return out;
}

export function unboard(figures) {
  let out = '';
  for (let i = 0; i < figures.length; i++) {
    const d = figures[i];
    if (d === '3' || d === '6' || d === '9') {
      if (i + 1 >= figures.length) break;
      out += ROWS[d][Number(figures[++i])];
    } else out += TOP[Number(d)];
  }
  return out.trimEnd();
}

// Step 2. sign is +1 to put the key on, -1 to take it off.
export function chain(figures, indicator, sign = 1) {
  const key = [...indicator].map(Number);
  let out = '';
  for (let i = 0; i < figures.length; i++) {
    key.push((key[i] + key[i + 1]) % 10);
    out += (Number(figures[i]) + sign * key[i + 5] + 10) % 10;
  }
  return out;
}

export const encipher = (text, indicator) => chain(board(text), indicator, 1);
export const decipher = (figures, indicator) => unboard(chain(figures, indicator, -1));

const PERIOD = 1800;
const PHASE = 900;

// What goes out in the slot that starts at time t: { serial, indicator,
// groups }. Items take turns, in order of filing, counting from the first
// slot after first carrier. Only what had been filed by then is in the
// rotation, so filing something new does not change what was sent before.
export function message(t) {
  const filed = traffic.filter((m) => midnight(m.filed) <= t);
  if (!filed.length) return null;
  const n = Math.round((t - PHASE) / PERIOD);
  const k = Math.round((t - EPOCH - PHASE) / PERIOD);
  const item = filed[((k % filed.length) + filed.length) % filed.length];
  const indicator = pad(hash('indicator', n) % 100000, 5);
  const figures = encipher(item.text, indicator);
  const groups = figures.match(/.{5}/g) || [];
  return { serial: pad(item.serial, 3), indicator, groups };
}

// The interval signal: nine notes in A minor.
const TUNE = [0, 4, 2, 3, 1, 4, 0, -1, 0];
const BEAT = 0.33;
const A_MINOR = { root: 440, scale: [0, 2, 3, 5, 7, 8, 10] };

const slot = cycle({
  period: PERIOD,
  phase: PHASE,
  build(n, start) {
    const sending = message(start);
    if (!sending) return null;
    const strokes = [];
    const copy = [];
    let t = start;

    for (let rep = 0; rep < 3; rep++) {
      const notes = TUNE.map((d, i) => ({ t: t + i * BEAT, hz: degree(d, A_MINOR), a: i === TUNE.length - 1 ? 1 : 0.8 }));
      strokes.push(...strike(notes, { tau: 0.5 }));
      for (const note of notes) copy.push({ t: note.t + 0.05, s: '~' });
      t += TUNE.length * BEAT + 1.3;
      copy.push({ t: t - 0.5, s: '\n' });
    }
    t += 1;

    const { serial, indicator, groups } = sending;
    const lines = [`${serial} ${serial} ${serial}`, `${pad(groups.length)} ${pad(groups.length)}`, `${indicator} ${indicator}`];
    for (let i = 0; i < groups.length; i += 5) lines.push(groups.slice(i, i + 5).join(' '));
    lines.push('000 000');

    const p = poly(lines.join('\n') + '\n', { t0: t });
    strokes.push(...p.strokes);
    copy.push(...p.copy);

    return { strokes, copy, end: p.end };
  },
});

export default {
  id: 'P1',
  name: 'the Stairs',
  kHz: 6225.0,
  width: 3000,
  emission: 'polytone',
  keeper: 1,
  since: '2026-11-15',
  strokes: slot.strokes,
  copy: slot.copy,
  next: slot.next,
};
