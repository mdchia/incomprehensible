// The noise, and what is under it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { floor, place, DEPTH, CELL, SIZE, PLACE, PLACES } from '../lib/floor.js';
import { QUIET, BAND } from '../lib/band.js';
import { FRAME, EPOCH, DAY, midnight } from '../lib/clock.js';
import { keepers } from '../keepers/index.js';
import { at } from './listen.js';

const noon = at('2026-11-15T12:00:00Z');
// A time by which every keeper on the roll had come on watch.
const present = Math.max(...keepers.map((k) => midnight(k.since))) + DAY / 2;
const COLS = (QUIET.hi - QUIET.lo) / CELL.f;
const ROWS = FRAME / CELL.t;

// Add up `frames` frames of the quiet segment, a cell at a time.
function fold(frames, from = present) {
  const sum = Array.from({ length: ROWS }, () => new Float64Array(COLS));
  const row = new Float32Array(COLS);
  for (let n = 0; n < frames; n++) {
    for (let r = 0; r < ROWS; r++) {
      floor(row, from + n * FRAME + r * CELL.t, CELL.t, QUIET.lo, CELL.f);
      for (let i = 0; i < COLS; i++) sum[r][i] += row[i];
    }
  }
  return sum.map((line) => Array.from(line, (v) => v / frames));
}

// The mean over the filled cells of a keeper's mark, and over the empty ones.
function levels(mean, k) {
  const where = place(k.n);
  const r0 = Math.round(where.t / CELL.t);
  const c0 = Math.round((where.f - QUIET.lo) / CELL.f);
  let on = 0;
  let off = 0;
  let nOn = 0;
  let nOff = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (k.mark[r][c] === '#') {
        on += mean[r0 + r][c0 + c];
        nOn++;
      } else {
        off += mean[r0 + r][c0 + c];
        nOff++;
      }
    }
  }
  return { on: on / nOn, off: off / nOff };
}

test('the floor has a mean of one and is the same piece of paper each time', () => {
  const a = floor(new Float32Array(4000), noon, 0.05, BAND.lo + 50_000, 12.5);
  const b = floor(new Float32Array(4000), noon, 0.05, BAND.lo + 50_000, 12.5);
  assert.deepEqual(a, b);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(Math.abs(mean - 1) < 0.06, String(mean));
  assert.ok(a.every((v) => v >= 0));
  const c = floor(new Float32Array(4000), noon + 0.05, 0.05, BAND.lo + 50_000, 12.5);
  assert.notDeepEqual(a, c);
});

test('there is a place under the floor for each of 48 keepers, and they do not touch', () => {
  assert.equal(PLACES, 48);
  const seen = new Set();
  for (let n = 1; n <= PLACES; n++) {
    const p = place(n);
    assert.ok(p.f >= QUIET.lo && p.f + SIZE * CELL.f <= QUIET.hi, `mark ${n} leaves the segment`);
    assert.ok(p.t >= 0 && p.t + SIZE * CELL.t <= FRAME, `mark ${n} leaves the frame`);
    assert.equal(p.t % CELL.t, 0);
    assert.equal((p.f - QUIET.lo) % CELL.f, 0);
    seen.add(`${p.t}|${p.f}`);
  }
  assert.equal(seen.size, PLACES);
  assert.ok(PLACE.t >= (SIZE + 1) * CELL.t && PLACE.f >= (SIZE + 1) * CELL.f, 'a cell of clear floor between neighbours');
});

test('in one frame a mark cannot be told from the noise', () => {
  const mean = fold(1);
  for (const k of keepers) {
    const { on, off } = levels(mean, k);
    // The spread of a single cell is as large as the floor itself.
    assert.ok(Math.abs(on - off) < 0.6);
  }
  let peak = 0;
  for (const line of mean) for (const v of line) peak = Math.max(peak, v);
  assert.ok(peak > 4, 'and the noise alone throws up taller cells than any mark');
});

test('added up over many frames, every mark is there', () => {
  const mean = fold(400);
  for (const k of keepers) {
    const { on, off } = levels(mean, k);
    assert.ok(Math.abs(off - 1) < 0.03, `keeper ${k.n}: empty cells at ${off.toFixed(3)}`);
    assert.ok(Math.abs(on - (1 + DEPTH)) < 0.04, `keeper ${k.n}: filled cells at ${on.toFixed(3)}`);
  }
});

test('a mark is not under the floor before its keeper came on watch', () => {
  const mean = fold(400, EPOCH - 2 * DAY);
  for (const k of keepers) {
    const { on, off } = levels(mean, k);
    assert.ok(Math.abs(on - off) < 0.04);
  }
});

test('outside the quiet segment there is nothing under the floor at all', () => {
  const sum = new Float64Array(COLS);
  const row = new Float32Array(COLS);
  for (let n = 0; n < 2000; n++) {
    floor(row, noon + n * 0.5, 0.5, QUIET.hi + 5000, CELL.f);
    for (let i = 0; i < COLS; i++) sum[i] += row[i];
  }
  for (const v of sum) assert.ok(Math.abs(v / 2000 - 1) < 0.12);
});
