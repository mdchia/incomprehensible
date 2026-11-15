// The modes: what goes out can be read back.

import test from 'node:test';
import assert from 'node:assert/strict';
import { key, duration, morse } from '../lib/modes/cw.js';
import { encode, decode, teleprint, demodulate, printable, UNIT, CHAR, MARK, SPACE, BAUD } from '../lib/modes/rtty.js';
import { poly, BASE, STEP } from '../lib/modes/tones.js';
import { degree, strike } from '../lib/modes/chime.js';
import { print, bitmap, LINE, COLUMN } from '../lib/modes/fax.js';
import * as font from '../lib/font.js';

test('keying: PARIS is fifty dots long, less the gap after it', () => {
  // The standard word. At 12 words a minute a dot is a tenth of a second.
  assert.ok(Math.abs(duration('PARIS', 12) - 4.3) < 1e-9);
  assert.ok(Math.abs(duration('PARIS PARIS', 12) - 9.3) < 1e-9);
});

test('keying: elements, and the copy they leave', () => {
  const k = key('A ?', { t0: 100, wpm: 12, f: 700 });
  assert.deepEqual(k.strokes.map((s) => Math.round((s.t1 - s.t0) * 10)), [1, 3, 1, 1, 3, 3, 1, 1]);
  assert.ok(k.strokes.every((s) => s.f === 700 && s.v === 'key'));
  assert.equal(k.copy.map((e) => e.s).join(''), 'A ?');
  for (let i = 1; i < k.strokes.length; i++) assert.ok(k.strokes[i].t0 >= k.strokes[i - 1].t1 - 1e-9, 'elements never overlap');
  assert.equal(morse('?'), '..--..');
});

test('keying: a prosign is sent run together and printed in brackets', () => {
  const k = key('<AR>', { t0: 0, wpm: 12 });
  assert.equal(k.strokes.length, 5);
  assert.equal(k.copy[0].s, '<AR>');
  assert.ok(Math.abs(k.end - duration('+', 12)) < 1e-9, 'AR and + are the same thing');
});

test('teleprinter: the code is the ordinary one', () => {
  assert.equal(BAUD, 45.45);
  assert.equal(SPACE - MARK, 170);
  assert.ok(Math.abs(CHAR - 7.5 * UNIT) < 1e-12);
  // R and Y are each other turned inside out, which is why test lines are made of them.
  const [, r, y] = encode('RY');
  assert.equal(r ^ y, 31);
});

test('teleprinter: text survives being encoded', () => {
  const text = 'ZCZC R1 025\r\nGALE WARNINGS: EMBER BANK, SILL.\r\nLOW 975 THE PANS MOVING E AND FILLING.\r\nHW 0936 4.0 / LW 1544 1.3\r\nNNNN';
  assert.equal(decode(encode(text)), text);
});

test('teleprinter: a printer that unshifts on space prints the same thing', () => {
  // Decode the way those printers do: back to letters after every space.
  const text = 'LOW 975 988 THE PANS 4.0 / 1.3 E';
  const codes = encode(text);
  const plain = decode(codes);
  let usos = '';
  let figs = false;
  const L = decode([1, 3, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30]);
  assert.equal(L.length, 26, 'twenty-six letters');
  for (const c of codes) {
    if (c === 31) figs = false;
    else if (c === 27) figs = true;
    else {
      usos += decode(figs ? [27, c] : [31, c]);
      if (c === 4) figs = false;
    }
  }
  assert.equal(usos, plain);
  assert.equal(plain, text);
});

test('teleprinter: strokes can be read back by sampling them', () => {
  const text = 'RYRY DE R1 151200Z\r\nSILL HEAD. SW 7. 999 FALLING.';
  const p = teleprint(text, { t0: 5000 });
  assert.equal(demodulate(p.strokes), text);
  assert.equal(p.copy.map((e) => e.s).join(''), text.replace(/\r/g, ''));
  assert.ok(p.strokes.every((s) => s.f === MARK || s.f === SPACE));
  for (let i = 1; i < p.strokes.length; i++) assert.ok(Math.abs(p.strokes[i].t0 - p.strokes[i - 1].t1) < 1e-9, 'the carrier never drops');
});

test('teleprinter: what cannot be printed goes out as a space', () => {
  assert.ok(!printable('#'));
  assert.equal(decode(encode('A#B')), 'A B');
});

test('polytone: a figure is a tone, a hundred hertz a step', () => {
  const p = poly('0 9\n5', { t0: 0 });
  assert.deepEqual(p.strokes.map((s) => s.f), [BASE, BASE + 9 * STEP, BASE + 5 * STEP]);
  assert.equal(p.copy.map((e) => e.s).join(''), '0 9\n5');
  assert.ok(p.strokes[1].t0 - p.strokes[0].t1 > 0.3, 'a space is a silence');
});

test('struck notes: the scale, and staying under the ceiling', () => {
  assert.equal(degree(0), 587.33);
  assert.ok(Math.abs(degree(7) - 2 * 587.33) < 1e-9, 'seven steps is an octave');
  assert.ok(Math.abs(degree(-7) - 587.33 / 2) < 1e-9);
  const s = strike([{ t: 0, hz: 900 }], { ceiling: 3000 });
  assert.ok(s.length >= 1 && s.every((x) => x.f <= 3000 && x.tau > 0));
});

test('facsimile: a picture goes out a line at a time, darkest where it is dark', () => {
  const img = bitmap(8, 2);
  img.set(1, 0, 1);
  img.set(2, 0, 1);
  img.set(6, 1, 0.5);
  const p = print(img, { t0: 10 });
  assert.equal(p.strokes.length, 2);
  assert.deepEqual([p.strokes[0].t0, p.strokes[0].w, p.strokes[0].f], [10, 2 * COLUMN, 2 * COLUMN]);
  assert.ok(Math.abs(p.strokes[1].t0 - (10 + LINE)) < 1e-12);
  assert.ok(p.strokes[1].a < p.strokes[0].a);
  assert.ok(Math.abs(p.end - (10 + 2 * LINE)) < 1e-12);
});

test('the small alphabet has every letter and figure', () => {
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') assert.ok(font.has(ch), ch);
  const img = bitmap(font.measure('L 975'), font.HEIGHT);
  font.write(img, 'L 975', 0, 0);
  assert.ok(img.toString().includes('#'));
});
