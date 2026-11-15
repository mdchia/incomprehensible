// The station of the second watch.

import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, midnight } from '../lib/clock.js';
import { COLUMN, LINE } from '../lib/modes/fax.js';
import { turns } from '../lib/world/tide.js';
import crossing, { wordImage } from '../stations/crossing.js';
import { heard } from './listen.js';

test('F2: its word is its picture', () => {
  const image = wordImage();
  assert.equal(image.w * COLUMN, crossing.width);
  assert.equal(image.h, 24);

  const rows = [];
  for (let y = 0; y < 5; y++) {
    let row = '';
    for (let x = 0; x < 15; x++) row += image.at(2 + x * 4, 2 + y * 4) ? '#' : '.';
    rows.push(row);
  }
  assert.deepEqual(rows, [
    '###.#.#.###.##.',
    '#.#.#.#.#...#.#',
    '#.#.#.#.##..##.',
    '#.#.#.#.#...#.#',
    '###..#..###.#.#',
  ]);
});

test('F2: it speaks at high water and not at low water', () => {
  const first = midnight(crossing.since);
  const tide = turns(first, first + DAY);
  const high = tide.find((turn) => turn.high);
  const low = tide.find((turn) => !turn.high);
  const next = crossing.next(first);

  assert.ok(Math.abs(next.start - high.t) < 1e-9);
  assert.ok(Math.abs(next.end - (high.t + wordImage().h * LINE)) < 1e-9);
  assert.equal(heard(crossing.kHz, high.t, 10), '\nOVER\n');
  assert.equal(heard(crossing.kHz, low.t, 10), '');
});
