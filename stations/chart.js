// F1. The analysis chart, by facsimile, at ten past and twenty to.
//
// Stripes to say it is starting, a bar with a notch to line the paper up,
// then 120 lines of chart, then wider stripes to say it has stopped.
// It is drawn for the hour or half hour just gone, so it shows what R1
// has just finished describing.

import { cycle } from '../lib/cycle.js';
import { print, bitmap, LINE, COLUMN } from '../lib/modes/fax.js';
import { chart, SIZE } from '../lib/world/chart.js';

const START = 2.0;
const PHASE = 1.5;
const STOP = 1.2;

function stripes(every, lines) {
  const img = bitmap(SIZE, lines);
  for (let y = 0; y < lines; y++) for (let x = 0; x < SIZE; x++) if (Math.floor(x / every) % 2 === 0) img.set(x, y, 1);
  return img;
}

function notch(lines) {
  const img = bitmap(SIZE, lines);
  for (let y = 0; y < lines; y++) for (let x = 0; x < SIZE; x++) if (x < SIZE / 2 - 4 || x >= SIZE / 2 + 4) img.set(x, y, 1);
  return img;
}

const half = cycle({
  period: 1800,
  phase: 600,
  build(n, start) {
    const strokes = [];
    const copy = [];
    let t = start;
    const put = (img) => {
      const p = print(img, { t0: t });
      strokes.push(...p.strokes);
      t = p.end;
    };

    copy.push({ t, s: '\nSTART ' });
    put(stripes(2, Math.round(START / LINE)));
    copy.push({ t, s: 'PHASE ' });
    put(notch(Math.round(PHASE / LINE)));
    copy.push({ t, s: `${SIZE} LINES ` });
    put(chart(start - 600));
    put(stripes(4, Math.round(STOP / LINE)));
    copy.push({ t, s: 'STOP\n' });

    return { strokes, copy, end: t };
  },
});

export default {
  id: 'F1',
  name: 'the Chart',
  kHz: 6340.0,
  width: SIZE * COLUMN,
  emission: 'facsimile',
  keeper: 1,
  since: '2026-11-15',
  strokes: half.strokes,
  copy: half.copy,
  next: half.next,
};
