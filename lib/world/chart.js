// The analysis chart: coast, isobars every four hectopascals, and the
// centres of whatever is passing through.

import { bitmap } from '../modes/fax.js';
import { write, measure } from '../font.js';
import { dtg } from '../clock.js';
import { land } from './sea.js';
import { field, synopsis } from './weather.js';

export const SIZE = 120;
const TOP = 9; // first row of the map proper; the title sits above it
const SPACING = 4; // hPa between isobars
const LAND = 0.3; // how dark the land prints

export function chart(t) {
  const img = bitmap(SIZE, SIZE);
  const rows = SIZE - TOP;
  const mx = (x) => (x - 0.5) / (SIZE - 1);
  const my = (y) => (y - TOP - 0.5) / (rows - 1);

  write(img, `ANALYSIS ${dtg(t)}`, 2, 1);
  for (let x = 0; x < SIZE; x++) img.set(x, 7);

  // Sample land and pressure once per cell, with a margin of one so
  // neighbours can be compared without special cases.
  const p = field(t);
  const isLand = new Uint8Array((SIZE + 1) * (rows + 1));
  const band = new Int16Array((SIZE + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= SIZE; i++) {
      const x = mx(i);
      const y = my(j + TOP);
      isLand[j * (SIZE + 1) + i] = land(x, y) ? 1 : 0;
      band[j * (SIZE + 1) + i] = Math.floor(p(x, y) / SPACING);
    }
  }
  const at = (grid, i, j) => grid[j * (SIZE + 1) + i];

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < SIZE; i++) {
      const here = at(isLand, i, j);
      const shore = here && (!at(isLand, i + 1, j) || !at(isLand, i, j + 1) || (i > 0 && !at(isLand, i - 1, j)) || (j > 0 && !at(isLand, i, j - 1)));
      const isobar = at(band, i, j) !== at(band, i + 1, j) || at(band, i, j) !== at(band, i, j + 1);
      if (shore) img.set(i, j + TOP, 1);
      else if (here) img.set(i, j + TOP, LAND);
      else if (isobar) img.set(i, j + TOP, 1);
    }
  }

  // Frame, with a tick every ten cells.
  for (let i = 0; i < SIZE; i++) {
    img.set(i, TOP, 1);
    img.set(i, SIZE - 1, 1);
    if (i % 10 === 0) {
      img.set(i, TOP + 1, 1);
      img.set(i, SIZE - 2, 1);
    }
  }
  for (let j = TOP; j < SIZE; j++) {
    img.set(0, j, 1);
    img.set(SIZE - 1, j, 1);
    if ((j - TOP) % 10 === 0) {
      img.set(1, j, 1);
      img.set(SIZE - 2, j, 1);
    }
  }

  // Centres. Clear a small plate behind each label so it can be read.
  for (const s of synopsis(t)) {
    if (s.x < 0.06 || s.x > 0.94 || s.y < 0.08 || s.y > 0.92) continue;
    const cx = Math.round(s.x * (SIZE - 1));
    const cy = Math.round(TOP + s.y * (rows - 1));
    const label = String(s.pressure);
    const w = Math.max(3, measure(label));
    for (let y = cy - 7; y <= cy + 7; y++) for (let x = cx - Math.ceil(w / 2) - 1; x <= cx + Math.ceil(w / 2) + 1; x++) img.set(x, y, 0);
    write(img, s.low ? 'L' : 'H', cx - 1, cy - 6);
    write(img, label, cx - Math.floor(w / 2), cy + 1);
  }

  return img;
}
