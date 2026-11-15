// The seven stations of the first watch, one at a time.

import test from 'node:test';
import assert from 'node:assert/strict';
import { EPOCH, DAY, HOUR, utc, midnight } from '../lib/clock.js';
import { stations } from '../lib/band.js';
import { keepers } from '../keepers/index.js';
import { statement } from '../statement.js';
import { traffic } from '../traffic/index.js';
import standard, { frame } from '../stations/standard.js';
import { words, wordAt } from '../stations/question.js';
import { message, encipher, decipher, board, unboard, chain, sendable } from '../stations/stairs.js';
import { bulletin, serial } from '../stations/forecast.js';
import { step, length } from '../stations/song.js';
import wanderer, { offset } from '../stations/wanderer.js';
import fax from '../stations/chart.js';
import { printable } from '../lib/modes/rtty.js';
import { AREAS, COAST } from '../lib/world/sea.js';
import { turns, height } from '../lib/world/tide.js';
import { at, heard } from './listen.js';

const noon = at('2026-11-15T12:00:00Z');

// Read a field of the T1 frame back out.
const field = (bits, from, width) => bits.slice(from, from + width).reduce((n, b) => n * 2 + b, 0);

test('T1: the frame says what time it is', () => {
  for (const t of [noon, noon + 37 * 60, EPOCH + 400 * DAY + 23 * HOUR + 59 * 60]) {
    const b = frame(t);
    const u = utc(t);
    assert.equal(field(b, 1, 3) * 10 + field(b, 4, 4), u.minute);
    assert.equal(field(b, 10, 2) * 10 + field(b, 12, 4), u.hour);
    assert.equal(field(b, 20, 2) * 100 + field(b, 22, 4) * 10 + field(b, 30, 4), u.doy);
    assert.equal(field(b, 34, 4) * 10 + field(b, 40, 4), u.year % 100);
    assert.equal(b.slice(1, 59).reduce((p, x) => p ^ x, 0), 0, 'parity is even');
  }
});

test('T1: Q and W count the stations and the keepers there were at the time', () => {
  const b = frame(noon);
  assert.equal(field(b, 44, 5), 7);
  assert.equal(field(b, 50, 8), 1);
  const later = frame(EPOCH + 3000 * DAY);
  assert.equal(field(later, 44, 5), stations.length);
  assert.equal(field(later, 50, 8), keepers.length);
});

test('T1: a tick every second, and the hour sounds higher than the minute', () => {
  const hour = standard.strokes(noon, noon + 60);
  assert.equal(hour.find((s) => s.t0 === noon).f, 1500);
  const minute = standard.strokes(noon + 60, noon + 120);
  assert.equal(minute.find((s) => s.t0 === noon + 60).f, 1000);
  for (let s = 0; s < 60; s++) assert.ok(hour.some((x) => Math.abs(x.t0 - (noon + s)) < 1e-9), `second ${s}`);
});

test('M1: one word an hour, in order, from the beginning', () => {
  const list = words(EPOCH);
  assert.deepEqual(list, 'IT IS FOR SOMEONE WHO ASKED NOT TO BE TOLD WHAT IT IS FOR.'.split(' '));
  list.forEach((word, i) => assert.deepEqual(wordAt(EPOCH + i * HOUR + 1800), { number: i + 1, word }));
  assert.deepEqual(wordAt(EPOCH + list.length * HOUR), { number: 1, word: 'IT' });
});

test('M1: a sentence is not sent before its day', () => {
  assert.deepEqual(words(EPOCH - 1), []);
  const all = words();
  for (const s of statement) assert.ok(all.includes(s.text.toUpperCase().split(' ').pop()));
});

test('M1: it asks every ten seconds and announces every five minutes', () => {
  assert.match(heard(6283.2, '2026-11-15T12:05:00Z', 60), /^VVV DE \? = QRX 1300 \+\n\? /);
  const five = heard(6283.2, '2026-11-15T12:05:00Z', 300);
  assert.ok(five.split('?').length - 1 >= 25, 'a question mark on most of the ten-second marks');
  assert.match(heard(6283.2, '2026-11-15T23:00:00Z', 60), /QRX 0000 \+/);
});

test('P1: the board and the chain can be undone', () => {
  const text = 'THE SONG GAINS 1 NOTE A DAY STOP 73';
  assert.equal(unboard(board(text)), text);
  assert.equal(board('TO').length % 5, 0, 'padded to whole groups');
  const figures = board(text);
  assert.equal(chain(chain(figures, '31415', 1), '31415', -1), figures);
  assert.notEqual(encipher(text, '31415'), encipher(text, '31416'));
  assert.equal(decipher(encipher(text, '27182'), '27182'), text);
  assert.ok(sendable('A') && sendable('7') && sendable(' ') && !sendable('.') && !sendable('a'));
});

test('P1: the chain is each figure five back plus the figure four back, without carrying', () => {
  // Indicator 12345: the key runs 3 5 7 9 8, 8 2 6 7 6 ...
  assert.equal(chain('0000000000', '12345', 1), '3579882676');
});

test('P1: every item of traffic goes out in turn and can be read by hand', () => {
  // From the first slot on the day after the last item was filed.
  const first = Math.max(...traffic.map((m) => midnight(m.filed))) + DAY + 900;
  const sent = new Set();
  for (let i = 0; i < traffic.length; i++) {
    const m = message(first + i * 1800);
    const item = traffic.find((x) => x.serial === Number(m.serial));
    assert.ok(item, `serial ${m.serial} was never filed`);
    assert.equal(decipher(m.groups.join(''), m.indicator), item.text);
    assert.ok(m.groups.every((g) => /^\d{5}$/.test(g)));
    sent.add(item.serial);
  }
  assert.equal(sent.size, traffic.length, 'each item once before any comes round again');
  const a = message(first);
  const b = message(first + traffic.length * 1800);
  assert.equal(a.serial, b.serial, 'the rotation comes round');
  assert.notEqual(a.indicator, b.indicator, 'under a new indicator');
  assert.equal(message(EPOCH - 900), null, 'nothing had been filed before first carrier');
});

test('P1: the first transmission after first carrier carried the first item', () => {
  assert.equal(message(EPOCH + 900).serial, '001');
  assert.equal(message(EPOCH + 900 + 1800).serial, '002');
});

test('P1: what is heard is the serial, the count, the indicator and the groups', () => {
  const start = at('2026-11-15T12:15:00Z');
  const m = message(start);
  const text = heard(6225, start, 200);
  assert.ok(text.includes(`${m.serial} ${m.serial} ${m.serial}\n${m.groups.length} ${m.groups.length}\n${m.indicator} ${m.indicator}\n`));
  assert.ok(text.includes(m.groups.slice(0, 5).join(' ')));
  assert.ok(text.trimEnd().endsWith('000 000'));
});

test('R1: the bulletin is numbered from first carrier and can all be teleprinted', () => {
  assert.equal(serial(EPOCH), 1);
  assert.equal(serial(noon), 25);
  for (const t of [EPOCH, noon, EPOCH + 37 * DAY + 1800, EPOCH + 800 * DAY]) {
    const lines = bulletin(t);
    for (const line of lines) for (const ch of line) assert.ok(printable(ch), `${JSON.stringify(ch)} in ${line}`);
    for (const a of AREAS) assert.ok(lines.some((l) => l.startsWith(a.name + '. ')), a.name);
    for (const c of COAST) assert.ok(lines.some((l) => l.startsWith(c.name + '. ')), c.name);
    assert.ok(lines.every((l) => l.length <= 68), 'fits across a page');
    assert.equal(lines.at(-1), 'NNNN');
  }
});

test('R1: the tides it gives are the tides', () => {
  const lines = bulletin(noon);
  const tides = lines[lines.findIndex((l) => l.startsWith('TIDES')) + 1];
  const day = Math.floor(noon / DAY) * DAY;
  const real = turns(day, day + DAY);
  assert.equal(tides.split(' / ').length, real.length);
  for (const x of real) assert.ok(tides.includes(`${x.high ? 'HW' : 'LW'} `) && tides.includes(x.h.toFixed(1)));
});

test('R1: between bulletins it idles on mark and sends a test line', () => {
  assert.match(heard(6105, '2026-11-15T12:10:00Z', 60), /RYRYRYRY.* DE R1/);
});

test('F1: 120 lines at ten past and twenty to, inside its width', () => {
  const w = fax.next(noon);
  assert.equal(w.start, noon + 600);
  const strokes = fax.strokes(w.start, w.end);
  assert.ok(strokes.length > 500);
  assert.ok(strokes.every((s) => s.w > 0 && s.f - s.w / 2 >= 0 && s.f + s.w / 2 <= fax.width));
  assert.equal(heard(6340, w.start, 60).trim(), 'START PHASE 120 LINES STOP');
  assert.equal(fax.next(w.end + 1).start, noon + 2400);
});

test('C1: the carrier follows the tide and never leaves its allocation', () => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let t = EPOCH; t < EPOCH + 60 * DAY; t += 613) {
    const f = offset(t);
    lo = Math.min(lo, f);
    hi = Math.max(hi, f);
  }
  assert.ok(lo > 0 && hi + 400 < wanderer.width, `${lo} to ${hi}`);
  assert.ok(wanderer.reach <= wanderer.width / 2, 'even at the largest tide there could be');
  const [a, b] = turns(EPOCH, EPOCH + DAY);
  assert.equal(offset(a.t) < offset(b.t), height(a.t) < height(b.t));
});

test('C1: three pips at high water, one at low', () => {
  for (const turn of turns(EPOCH, EPOCH + 2 * DAY)) {
    const text = heard(6400, turn.t - 5, 10);
    assert.equal(text, turn.high ? '...\n' : '.\n');
  }
  assert.equal(heard(6400, noon, 600), '');
});

test('S1: the notes are the infinity series', () => {
  assert.deepEqual(Array.from({ length: 16 }, (_, i) => step(i)), [0, 1, -1, 2, 1, 0, -2, 3, -1, 2, 0, 1, 2, -1, -3, 4]);
  // Every second note, turned upside down, is the whole of it again.
  for (let n = 0; n < 500; n++) assert.equal(step(2 * n) + step(n), 0);
  // And every fourth note is the whole of it again, the right way up.
  for (let n = 0; n < 500; n++) assert.equal(step(4 * n), step(n));
});

test('S1: one note on the first day and one more each day since', () => {
  assert.equal(length(EPOCH - 1), 0);
  assert.equal(length(EPOCH), 1);
  assert.equal(length(EPOCH + DAY - 1), 1);
  assert.equal(length(EPOCH + DAY), 2);
  assert.equal(length(EPOCH + 365 * DAY), 366);
  assert.equal(heard(6470, '2026-11-15T12:55:00Z', 60).trim(), 'D');
  assert.equal(heard(6470, '2026-11-22T12:55:00Z', 60).trim(), 'D E C F E D B G');
});
