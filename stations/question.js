// M1. A question mark, keyed, every ten seconds.
//
// Every five minutes it says when it will next have something to say.
// On the hour it says it: one word of the statement, numbered, twice.
// Then it says when it will next have something to say.

import { cycle } from '../lib/cycle.js';
import { key } from '../lib/modes/cw.js';
import { utc, pad, midnight, EPOCH, HOUR } from '../lib/clock.js';
import { statement } from '../statement.js';

const WPM = 12;
const PITCH = 700;

// The statement as it stood at time t and as it is sent: upper case, one
// word at a time, the last word of each sentence keeping its full stop.
export function words(t = Infinity) {
  const out = [];
  for (const { text, since } of statement) {
    if (midnight(since) > t) continue;
    const w = text.toUpperCase().replace(/[^A-Z0-9'. ]+/g, ' ').replace(/\.(?=\s*\S)/g, ' ').split(/\s+/).filter(Boolean);
    out.push(...w);
  }
  return out;
}

// Which word goes out in the hour beginning at t: { number, word }
export function wordAt(t) {
  const list = words(t);
  if (!list.length) return { number: 0, word: '?' };
  const h = Math.floor((t - EPOCH) / HOUR);
  const i = ((h % list.length) + list.length) % list.length;
  return { number: i + 1, word: list[i] };
}

const five = cycle({
  period: 300,
  build(n, start) {
    const u = utc(start);
    const strokes = [];
    const copy = [];
    let t = start;

    const send = (text) => {
      const k = key(text, { t0: t, wpm: WPM, f: PITCH });
      strokes.push(...k.strokes);
      copy.push(...k.copy);
      t = k.end;
    };

    const next = `${pad((u.hour + 1) % 24)}00`;
    if (u.minute === 0) {
      const { number, word } = wordAt(start);
      send(`VVV DE ? = QTC ${number} = ${word} ${word} = QRX ${next} +`);
    } else {
      send(`VVV DE ? = QRX ${next} +`);
    }
    copy.push({ t, s: '\n' });

    // Then the question, on every ten-second mark that is left.
    for (let s = Math.ceil((t + 2.5 - start) / 10) * 10; s < 300; s += 10) {
      t = start + s;
      send('?');
      copy.push({ t, s: ' ' });
    }

    return { strokes, copy, end: start + 300 };
  },
});

export default {
  id: 'M1',
  name: 'the Question',
  kHz: 6283.2,
  width: 1500,
  emission: 'keyed carrier',
  keeper: 1,
  since: '2026-11-15',
  continuous: true,
  strokes: five.strokes,
  copy: five.copy,
};
