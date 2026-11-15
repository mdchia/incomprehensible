// The logbook can be checked.
//
// Each watch reports what it heard. Some of those reports are pinned
// here, so that nobody can change what the band sent in the past without
// finding out. If one of these fails, you have not broken a test. You
// have altered something that has already happened. See order 5.
//
// When you log a watch, pin two or three of your own reports below.

import test from 'node:test';
import assert from 'node:assert/strict';
import { onAir, QUIET } from '../lib/band.js';
import { hash } from '../lib/hash.js';
import { chart } from '../lib/world/chart.js';
import { turns } from '../lib/world/tide.js';
import { frame } from '../stations/standard.js';
import wanderer, { offset } from '../stations/wanderer.js';
import { at, heard } from './listen.js';

test('watch 1, 1200, 6000.00: T1 gave the hour on the higher tone, and the right frame', () => {
  const noon = at('2026-11-15T12:00:00Z');
  assert.equal(frame(noon).join(''), '000000000001001000001100010000100100100001100011100000000100');
  assert.equal(heard(6000, noon, 60), '\nH 00000000 010010000 110001000 100100100 011000111 000000010 ');
});

test('watch 1, 1200, 6105.00: R1 sent bulletin 025', () => {
  const text = heard(6105, '2026-11-15T12:00:00Z', 240);
  assert.ok(text.includes('ZCZC R1 025\nCQ CQ CQ DE R1 R1 R1\nSEA AREA FORECAST ISSUED 151200Z NOV\n'));
  assert.ok(text.includes('GALE WARNINGS: EMBER BANK, SILL.\n'));
  assert.ok(text.includes('COMPLEX LOW 975 THE PANS MOVING E AND FILLING.\nHIGH 1025 QUIRE MOVING NE.\n'));
  assert.ok(text.includes('EMBER BANK. NW 7 TO SEVERE GALE 9. RAIN. MODERATE.\n'));
  assert.ok(text.includes('TIDES SILL HEAD 15 NOV\nLW 0340 1.5 / HW 0936 4.0 / LW 1544 1.3 / HW 2210 4.4\nMOON FIRST QUARTER AGE 05\n'));
  assert.ok(text.includes('NEXT ISSUE 1230Z\nNNNN\n'));
});

test('watch 1, 1200, 6283.20: M1 sent word 13, twice, and said to wait', () => {
  assert.ok(heard(6283.2, '2026-11-15T12:00:00Z', 60).startsWith('VVV DE ? = QTC 13 = IS IS = QRX 1300 +\n'));
  assert.ok(heard(6283.2, '2026-11-15T11:00:00Z', 60).startsWith('VVV DE ? = QTC 12 = IT IT = QRX 1200 +\n'));
});

// The chart sent at 1210 on the first day, as a single number.
const PICTURE = 3860620939;

test('watch 1, 1210, 6340.00: F1 sent the chart for 1200, with Hask on it as an island', () => {
  assert.equal(heard(6340, '2026-11-15T12:10:00Z', 60), '\nSTART PHASE 120 LINES STOP\n');
  const picture = chart(at('2026-11-15T12:00:00Z')).toString();
  assert.equal(hash(picture), PICTURE);
  // Land, with a shore each side, and well short of the mainland.
  assert.match(picture.split('\n')[44].slice(40, 62), / #:{4,8}# /);
});

test('watch 1, 1215, 6225.00: P1 sent serial 001 in 47 groups', () => {
  const text = heard(6225, '2026-11-15T12:15:00Z', 120);
  assert.ok(text.startsWith('~~~~~~~~~\n~~~~~~~~~\n~~~~~~~~~\n001 001 001\n47 47\n98042 98042\n48225 88090 26672 30324 26869\n'));
  assert.ok(text.trimEnd().endsWith('63193 35242\n000 000'));
});

test('watch 1, 1155, 6470.00: S1 was one note long', () => {
  assert.equal(heard(6470, '2026-11-15T11:55:00Z', 120), 'D \n');
});

test('watch 1, 0936, 6427.24: C1 pipped three times at high water, and was on 6421.86 by noon', () => {
  const [high] = turns(at('2026-11-15T09:30:00Z'), at('2026-11-15T09:45:00Z'));
  assert.ok(high.high);
  assert.equal(Math.floor((high.t % 86400) / 60), 9 * 60 + 36);
  assert.equal(((wanderer.kHz * 1000 + offset(high.t)) / 1000).toFixed(2), '6427.24');
  assert.equal(((wanderer.kHz * 1000 + offset(at('2026-11-15T12:00:00Z'))) / 1000).toFixed(2), '6421.86');
  assert.equal(heard(6400, '2026-11-15T09:36:00Z', 60), '...\n');
});

test('watch 1, 1200, 6255.00: nothing heard in the quiet segment', () => {
  const noon = at('2026-11-15T12:00:00Z');
  assert.equal(onAir(noon, noon + 600, QUIET.lo, QUIET.hi).length, 0);
  assert.equal(heard(6255, noon, 600), '');
});
