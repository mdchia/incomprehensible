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
import { decipher } from '../stations/stairs.js';
import { examine } from '../lib/report.js';
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

test('watch 2, 1230, 6105.00: R1 sent bulletin 026', () => {
  const text = heard(6105, '2026-11-15T12:30:00Z', 240);
  assert.ok(text.includes('ZCZC R1 026\nCQ CQ CQ DE R1 R1 R1\nSEA AREA FORECAST ISSUED 151230Z NOV\n'));
  assert.ok(text.includes('GALE WARNINGS: EMBER BANK, SILL.\n'));
  assert.ok(text.includes('COMPLEX LOW 975 THE PANS MOVING E AND FILLING.\nHIGH 1025 TALLOW MOVING NE.\n'));
  assert.ok(text.includes('NEXT ISSUE 1300Z\nNNNN\n'));
});

test('watch 2, 1240, 6340.00: F1 sent the chart for 1230', () => {
  assert.equal(heard(6340, '2026-11-15T12:40:00Z', 30), '\nSTART PHASE 120 LINES STOP\n');
  assert.equal(hash(chart(at('2026-11-15T12:30:00Z')).toString()), 3573350495);
});

test('watch 2, 1245, 6225.00: P1 sent serial 002 in 34 groups', () => {
  const text = heard(6225, '2026-11-15T12:45:00Z', 120);
  assert.ok(text.startsWith('~~~~~~~~~\n~~~~~~~~~\n~~~~~~~~~\n002 002 002\n34 34\n87675 87675\n23193 40324 06110 51104 61373\n'));
  assert.ok(text.trimEnd().endsWith('23864 26149 41973 85913\n000 000'));
});

test('watch 3, 0855, 6470.00: S1 was two notes long', () => {
  assert.equal(heard(6470, '2026-11-16T08:55:00Z', 120), 'D E \n');
});

test('watch 3, 0900, 6000.00: T1 counted eight stations and two keepers', () => {
  const nine = at('2026-11-16T09:00:00Z');
  assert.equal(heard(6000, nine, 60), '\nH 00000000 001001000 110010000 000000100 011001000 000000100 ');
  const bits = frame(nine);
  const field = (from, width) => bits.slice(from, from + width).reduce((n, b) => n * 2 + b, 0);
  assert.equal(field(44, 5), 8);
  assert.equal(field(50, 8), 2);
});

test('watch 3, 0930, 6105.00: R1 sent bulletin 068, and named one low twice', () => {
  const text = heard(6105, '2026-11-16T09:30:00Z', 240);
  assert.ok(text.includes('ZCZC R1 068\nCQ CQ CQ DE R1 R1 R1\nSEA AREA FORECAST ISSUED 160930Z NOV\n\nNO GALE WARNINGS.\n'));
  assert.ok(
    text.includes(
      'GENERAL SITUATION\nLOW 991 THE PANS MOVING E AND FILLING.\nLOW 1002 LATHE MOVING E AND DEEPENING.\nLOW 991 THE PANS MOVING E AND FILLING.\n\nNORTH FETCH.',
    ),
  );
  assert.ok(text.includes('TIDES SILL HEAD 16 NOV\nLW 0427 1.7 / HW 1019 3.8 / LW 1627 1.4 / HW 2301 4.3\nMOON FIRST QUARTER AGE 06\n'));
  // The chart sent twenty minutes before shows why: two centres, side by side.
  assert.equal(hash(chart(at('2026-11-16T09:00:00Z')).toString()), 598380068);
});

test('watch 3, 0945, 6225.00: P1 sent serial 004 in 28 groups, and it was for the next watch', () => {
  const text = heard(6225, '2026-11-16T09:45:00Z', 120);
  assert.ok(text.startsWith('~~~~~~~~~\n~~~~~~~~~\n~~~~~~~~~\n004 004 004\n28 28\n16690 16690\n42360 51210 28708 34212 06213\n'));
  assert.ok(text.trimEnd().endsWith('44191 03213 76566\n000 000'));
  // Read by hand, as the top of stations/stairs.js says how.
  const groups = text.trim().split('\n').slice(6, -1).join('').replace(/ /g, '');
  assert.equal(groups.length, 28 * 5);
  assert.equal(decipher(groups, '16690'), 'TO THE NEXT WATCH STOP F2 SPEAKS ONLY AT HIGH WATER STOP READ THE PAPER BEFORE THE COPY STOP 73');
});

// Reports sent in to the desk during watch 3, examined long afterwards.
const SINCE = at('2027-06-01T00:00:00Z');

test('watch 3, 0930, 6251.25: a drawing of what stood beside my mark was confirmed as keeper 2\'s', () => {
  const drawing = '#.......# .#.....#. ..#...#.. ...#.#... ....#.... ...###... ..#####.. .#######. #########';
  const finding = examine({ khz: '6251.25', date: '2026-11-16', utc: '0930', copied: drawing, to: 'KEEPER 1' }, SINCE);
  assert.equal(finding.ok, true);
  assert.equal(finding.mark.n, 2);
  assert.equal(finding.cells, 81);
  assert.equal(finding.number, '228532');
  // The day before, there was nothing there to draw.
  assert.equal(examine({ khz: '6251.25', date: '2026-11-15', utc: '1248', copied: drawing }, SINCE).ok, false);
});

test('watch 3, 1019, 6160.00: F2 spoke for the first time, and the first card went to it', () => {
  const [high] = turns(at('2026-11-16T10:00:00Z'), at('2026-11-16T10:30:00Z'));
  assert.ok(high.high);
  assert.equal(Math.floor(high.t), at('2026-11-16T10:19:09Z'));
  // Nothing before high water, and then one word.
  assert.equal(heard(6160, '2026-11-16T10:00:00Z', 19 * 60), '');
  assert.equal(heard(6160, '2026-11-16T10:19:00Z', 30), '\nOVER\n');
  // It lay on the paper from 6160.0 to 6164.8 kHz, for four seconds.
  const word = onAir(at('2026-11-16T10:19:00Z'), at('2026-11-16T10:19:30Z'), 6_150_000, 6_175_000);
  assert.ok(word.length > 0);
  assert.ok(word.every((s) => s.s === 'F2' && s.t0 >= high.t - 1e-6 && s.t1 <= high.t + 4 + 1e-6));
  assert.ok(Math.min(...word.map((s) => s.f - (s.w || 0) / 2)) >= 6_160_000 && Math.max(...word.map((s) => s.f + (s.w || 0) / 2)) <= 6_164_800);

  const finding = examine({ khz: '6160.00', date: '2026-11-16', utc: '1019', copied: 'OVER', to: 'KEEPER 1' }, SINCE);
  assert.equal(finding.ok, true);
  assert.equal(finding.station.id, 'F2');
  assert.equal(finding.quoted, 'OVER');
  assert.equal(finding.number, '456656');
});

test('watch 3, 1019, 6425.97: C1 pipped three times at the same high water', () => {
  const [high] = turns(at('2026-11-16T10:00:00Z'), at('2026-11-16T10:30:00Z'));
  assert.equal(((wanderer.kHz * 1000 + offset(high.t)) / 1000).toFixed(2), '6425.97');
  assert.equal(heard(6400, '2026-11-16T10:19:00Z', 60), '...\n');
});
