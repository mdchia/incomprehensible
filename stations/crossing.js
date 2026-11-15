// F2. One word, sent as a picture of itself at each high water.
//
// It begins at the turn. The word is enlarged from the chart alphabet
// and printed from top to bottom.

import { cycle } from '../lib/cycle.js';
import { HOUR } from '../lib/clock.js';
import { HEIGHT, measure, write } from '../lib/font.js';
import { bitmap, COLUMN, print } from '../lib/modes/fax.js';
import { turns } from '../lib/world/tide.js';

const WORD = 'OVER';
const SCALE = 4;
const MARGIN = 2;

export function wordImage() {
  const image = bitmap(measure(WORD) * SCALE + 2 * MARGIN, HEIGHT * SCALE + 2 * MARGIN);
  const enlarged = {
    set(x, y, d) {
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) image.set(MARGIN + x * SCALE + dx, MARGIN + y * SCALE + dy, d);
      }
    },
  };
  write(enlarged, WORD, 0, 0);
  return image;
}

const image = wordImage();
const hourly = cycle({
  period: HOUR,
  build(_n, start) {
    const high = turns(start, start + HOUR).find((turn) => turn.high);
    if (!high) return null;
    const sent = print(image, { t0: high.t });
    return {
      strokes: sent.strokes,
      copy: [{ t: sent.end, s: `\n${WORD}\n` }],
      start: high.t,
      end: sent.end,
    };
  },
});

export default {
  id: 'F2',
  name: 'the Crossing',
  kHz: 6160.0,
  width: image.w * COLUMN,
  emission: 'facsimile',
  keeper: 2,
  since: '2026-11-16',
  strokes: hourly.strokes,
  copy: hourly.copy,
  next: hourly.next,
};
