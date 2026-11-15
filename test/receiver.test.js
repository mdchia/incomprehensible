// The receiver: paper, loudspeaker, tape.

import test from 'node:test';
import assert from 'node:assert/strict';
import { expose, rowOf, darkness, shade, INK } from '../lib/paper.js';
import { onAir } from '../lib/band.js';
import { Synth } from '../site/worklet.js';
import { record, wav } from '../bin/recorder.js';
import { at, tone } from './listen.js';

const noon = at('2026-11-15T12:00:00Z');
const RATE = 16000;

test('paper: a line lands in the right place and a block fills its width', () => {
  const row = new Float32Array(100);
  expose(row, [{ t0: 0, t1: 1, f: 1_000_505, a: 1 }], 0, 1, 1_000_000, 10);
  assert.ok(Math.abs(row[50] - INK) < 1e-3);
  assert.equal(row.reduce((x, y) => x + y, 0).toFixed(3), INK.toFixed(3));

  row.fill(0);
  expose(row, [{ t0: 0, t1: 1, f: 1_000_500, w: 200, a: 1 }], 0, 1, 1_000_000, 10);
  for (let i = 40; i < 60; i++) assert.ok(Math.abs(row[i] - INK) < 1e-3, `bin ${i}`);
  assert.equal(row[39], 0);
  assert.equal(row[60], 0);
});

test('paper: half the time is half the power, and a struck note fades', () => {
  const row = new Float32Array(10);
  expose(row, [{ t0: 0, t1: 0.5, f: 1_000_055, a: 1 }], 0, 1, 1_000_000, 10);
  assert.ok(Math.abs(row[5] - INK / 2) < 1e-3);
  const early = expose(new Float32Array(10), [{ t0: 0, t1: 5, f: 1_000_055, a: 1, tau: 1 }], 0, 0.1, 1_000_000, 10)[5];
  const late = expose(new Float32Array(10), [{ t0: 0, t1: 5, f: 1_000_055, a: 1, tau: 1 }], 2, 0.1, 1_000_000, 10)[5];
  assert.ok(late < early / 20);
});

test('paper: a glide is spread along the way it went', () => {
  const row = new Float32Array(100);
  expose(row, [{ t0: 0, t1: 1, f: 1_000_200, f1: 1_000_800, a: 1 }], 0, 1, 1_000_000, 10);
  assert.ok(row[19] === 0 && row[80] === 0);
  for (let i = 20; i < 80; i++) assert.ok(row[i] > 0);
});

test('paper: signal is darker than noise, and a strip of it can be printed', () => {
  assert.equal(darkness(0), 0);
  assert.equal(darkness(1), 0);
  assert.ok(darkness(INK) > 0.9);
  // T1 at the top of the hour: a long tone 1500 Hz above its dial frequency.
  const row = rowOf(new Float32Array(120), onAir(noon, noon + 0.5, 6_000_000, 6_003_000), noon, 0.5, 6_000_000, 25);
  const text = shade(row);
  assert.equal(text.length, 120);
  const darkest = row.indexOf(Math.max(...row));
  assert.ok(darkest === 59 || darkest === 60, String(darkest));
  assert.ok(darkness(row[darkest]) > 0.5 && /[=+*#%@]/.test(text[darkest]), text);
});

test('loudspeaker: a signal 700 Hz above the dial is a 700 Hz tone', () => {
  const synth = new Synth(RATE);
  synth.noise = 0;
  synth.tune(6_000_000);
  synth.add([{ k: 'a', t0: 0, t1: 2, f: 6_000_700, a: 1 }]);
  const out = synth.render(new Float32Array(RATE), 0.5);
  assert.ok(tone(out, RATE, 700) > 100 * tone(out, RATE, 900));
});

test('loudspeaker: off tune it whistles higher or lower, and below the dial is silence', () => {
  const stroke = { k: 'a', t0: 0, t1: 2, f: 6_000_700, a: 1 };
  const listen = (dial) => {
    const synth = new Synth(RATE);
    synth.noise = 0;
    synth.tune(dial);
    synth.add([stroke]);
    return synth.render(new Float32Array(RATE), 0.5);
  };
  const low = listen(5_999_800);
  assert.ok(tone(low, RATE, 900) > 100 * tone(low, RATE, 700));
  const above = listen(6_001_000);
  assert.ok(above.every((v) => Math.abs(v) < 1e-6));
  const far = listen(5_996_000);
  assert.ok(far.every((v) => Math.abs(v) < 1e-6), 'and so is anything beyond the passband');
});

test('loudspeaker: strokes that share a voice are one unbroken oscillator', () => {
  const synth = new Synth(RATE);
  synth.noise = 0;
  synth.tune(1_000_000);
  synth.add([
    { k: 'a', v: 'x', t0: 0, t1: 0.5, f: 1_001_000, a: 1 },
    { k: 'b', v: 'x', t0: 0.5, t1: 1, f: 1_001_170, a: 1 },
  ]);
  const out = synth.render(new Float32Array(RATE), 0);
  // No click at the join: no sample-to-sample jump bigger than the tone itself makes.
  let jump = 0;
  for (let i = RATE / 2 - 40; i < RATE / 2 + 40; i++) jump = Math.max(jump, Math.abs(out[i] - out[i - 1]));
  assert.ok(jump < 0.15, String(jump));
  assert.ok(tone(out.subarray(0, RATE / 2), RATE, 1000) > 50 * tone(out.subarray(0, RATE / 2), RATE, 1170));
  assert.ok(tone(out.subarray(RATE / 2), RATE, 1170) > 50 * tone(out.subarray(RATE / 2), RATE, 1000));
});

test('loudspeaker: the same stroke given twice is played once', () => {
  const once = new Synth(RATE);
  const twice = new Synth(RATE);
  for (const s of [once, twice]) {
    s.noise = 0;
    s.tune(1_000_000);
  }
  const stroke = { k: 'a', t0: 0, t1: 1, f: 1_000_700, a: 0.5 };
  once.add([stroke]);
  twice.add([stroke]);
  twice.add([{ ...stroke }]);
  assert.deepEqual(once.render(new Float32Array(4000), 0.2), twice.render(new Float32Array(4000), 0.2));
});

test('tape: M1 on tune is keyed at 700 Hz, and the same tape twice is the same tape', () => {
  const a = record(6_283_200, noon, 6, RATE);
  const b = record(6_283_200, noon, 6, RATE);
  assert.deepEqual(a, b);
  assert.ok(tone(a, RATE, 700) > 30 * tone(a, RATE, 1100));
  const quiet = record(6_255_000, noon, 2, RATE, 0);
  assert.ok(quiet.every((v) => v === 0), 'the quiet segment is quiet');
});

test('tape: a WAV file is a WAV file', () => {
  const file = wav(new Float32Array([0, 0.5, -0.5, 1, -1, 2]), RATE);
  assert.equal(file.length, 44 + 12);
  assert.equal(file.toString('ascii', 0, 4), 'RIFF');
  assert.equal(file.toString('ascii', 8, 12), 'WAVE');
  assert.equal(file.readUInt32LE(24), RATE);
  assert.equal(file.readInt16LE(44 + 2), Math.round(0.5 * 32767));
  assert.equal(file.readInt16LE(44 + 10), 32767, 'what is too loud is clipped');
});
