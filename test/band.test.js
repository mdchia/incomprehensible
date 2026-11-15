// The band as a whole: what is on the air, where, and when.

import test from 'node:test';
import assert from 'node:assert/strict';
import { stations, BAND, QUIET, PASSBAND, dial, fade, onAir, tuned, copy, sked, plan, live } from '../lib/band.js';
import { EPOCH, DAY, HOUR, FRAME, parse, span, iso, dtg, hhmm, utc, dayOf, midnight, now, setNow } from '../lib/clock.js';
import { cycle } from '../lib/cycle.js';
import { hash, unit, seed, pick, between } from '../lib/hash.js';
import { at, heard } from './listen.js';

const noon = at('2026-11-15T12:00:00Z');

test('the clock: first carrier, days, and the ways a moment can be written', () => {
  assert.equal(iso(EPOCH), '2026-11-15T00:00:00Z');
  assert.equal(dayOf(EPOCH), 0);
  assert.equal(dayOf(EPOCH - 1), -1);
  assert.equal(dayOf(noon + DAY), 1);
  assert.equal(midnight('2026-11-15'), EPOCH);
  assert.equal(dtg(noon), '151200Z NOV');
  assert.equal(hhmm(noon + 42 * 60), '1242');
  assert.equal(utc(noon).doy, 319);
  assert.equal(parse('2026-11-15T12:00Z'), noon);
  assert.equal(parse('2026-11-15'), EPOCH);
  assert.equal(parse('1200', EPOCH + 5), noon);
  assert.equal(parse('+90s', noon), noon + 90);
  assert.equal(parse('-2h', noon), noon - 2 * HOUR);
  assert.throws(() => parse('teatime'));
  assert.equal(span('4m'), 240);
  assert.equal(span(undefined, 60), 60);
  assert.equal(FRAME, 30);
});

test('the clock can be moved, and put back', () => {
  setNow(noon);
  assert.ok(Math.abs(now() - noon) < 1);
  setNow(Date.now() / 1000);
  assert.ok(Math.abs(now() - Date.now() / 1000) < 1);
});

test('chance is not chance', () => {
  assert.equal(hash('a', 1, 2), hash('a', 1, 2));
  assert.notEqual(hash('a', 1, 2), hash('a', 2, 1));
  assert.notEqual(hash(1), hash(1 + 2 ** 32), 'large numbers are not folded together');
  assert.equal(seed('M1'), seed('M1'));
  const u = unit('x', 7);
  assert.ok(u >= 0 && u < 1);
  assert.ok(between(3, 4, 'x') >= 3 && between(3, 4, 'x') < 4);
  assert.ok(['a', 'b'].includes(pick(['a', 'b'], 9)));
  // Spread evenly enough that the floor has a mean of one.
  let sum = 0;
  for (let i = 0; i < 20000; i++) sum += unit('even', i);
  assert.ok(Math.abs(sum / 20000 - 0.5) < 0.01);
});

test('a cycle gives the same strokes however the time is cut, even past its own end', () => {
  const c = cycle({
    period: 10,
    phase: 3,
    build: (n, start) => ({
      strokes: [
        { t0: start, t1: start + 1, f: 100, a: 1 },
        { t0: start + 9.5, t1: start + 11, f: 200, a: 1 }, // runs into the next period
      ],
      copy: [{ t: start + 10.5, s: String(n) }],
      end: start + 11,
    }),
  });
  const whole = c.strokes(100, 140);
  const parts = [...c.strokes(100, 113.2), ...c.strokes(113.2, 140)];
  const key = (s) => `${s.t0}|${s.f}`;
  assert.deepEqual([...new Set(parts.map(key))].sort(), [...new Set(whole.map(key))].sort());
  assert.ok(c.strokes(113.2, 113.9).some((s) => s.f === 200), 'the overrun is still sounding in the next period');
  assert.equal(c.copy(113, 114).length, 1);
  assert.deepEqual(c.next(113.5), { start: 103, end: 114 });
  assert.deepEqual(c.next(114.5), { start: 113, end: 124 });
});

test('the plan covers the band from end to end with nothing left over', () => {
  const p = plan();
  assert.equal(p[0].lo, BAND.lo);
  assert.equal(p.at(-1).hi, BAND.hi);
  for (let i = 1; i < p.length; i++) assert.equal(p[i].lo, p[i - 1].hi);
  assert.equal(p.filter((s) => s.kind === 'station').length, stations.length);
  assert.equal(p.filter((s) => s.kind === 'quiet').length, 1);
});

test('nothing is sent in the quiet segment, ever', () => {
  for (const d of [0, 1, 30, 365, 3000]) {
    const t = EPOCH + d * DAY + 11 * HOUR;
    assert.equal(onAir(t, t + 1800, QUIET.lo, QUIET.hi).length, 0);
  }
  assert.equal(tuned(6_255_000), null);
  assert.equal(heard(6255, noon, 600), '');
});

test('nothing was on the air before first carrier', () => {
  assert.equal(onAir(EPOCH - HOUR, EPOCH - 1).length, 0);
  assert.equal(copy(6_000_000, EPOCH - HOUR, EPOCH - 1).length, 0);
  assert.ok(onAir(EPOCH, EPOCH + 2).length > 0, 'and something was, the second after');
});

test('strokes on the air carry a key that does not depend on the window', () => {
  const whole = onAir(noon, noon + 90);
  const keys = new Set(whole.map((s) => s.k));
  assert.equal(keys.size, whole.length, 'no two strokes share a key');
  const parts = [...onAir(noon, noon + 31.7), ...onAir(noon + 31.7, noon + 90)];
  for (const s of parts) assert.ok(keys.has(s.k), s.k);
  for (const s of whole) {
    const st = stations.find((x) => x.id === s.s);
    assert.ok(s.f >= dial(st) && s.f <= dial(st) + st.width);
    assert.ok(s.a > 0 && s.a <= 1);
  }
});

test('asking for part of the band gives only that part', () => {
  const some = onAir(noon, noon + 60, 6_280_000, 6_290_000);
  assert.ok(some.length > 0);
  assert.ok(some.every((s) => s.s === 'M1'));
});

test('fading is slow, never complete, and each station has its own', () => {
  const [a, b] = stations;
  let differs = false;
  for (let t = noon; t < noon + 600; t += 7) {
    const f = fade(a, t);
    assert.ok(f > 0.4 && f <= 1);
    assert.ok(Math.abs(fade(a, t + 0.05) - f) < 0.01);
    if (Math.abs(f - fade(b, t)) > 0.05) differs = true;
  }
  assert.ok(differs);
});

test('copy is clean on tune, suffers off it, and stops', () => {
  const clean = heard(6105, noon, 240);
  assert.match(clean, /SEA AREA FORECAST ISSUED 151200Z NOV/);
  assert.equal(heard(6105.1, noon, 240), clean, 'a hundred hertz is near enough');
  const rough = heard(6105.35, noon, 240);
  assert.notEqual(rough, clean);
  assert.ok(rough.length > 0 && rough.length <= clean.length);
  assert.equal(heard(6105.35, noon, 240), rough, 'and suffers the same way each time');
  assert.equal(heard(6105.6, noon, 240), '');
  assert.equal(tuned(6_105_100).station.id, 'R1');
  assert.equal(tuned(6_105_100).off, 100);
  assert.equal(tuned(6_105_100, 500, EPOCH - 1), null, 'nothing to tune to before it came on');
  assert.equal(PASSBAND, 3000);
});

test('the schedule is in order and tells the truth', () => {
  const list = sked(noon + 1);
  // On the first day there were these four and no others.
  assert.deepEqual(list.map((x) => x.station.id), ['R1', 'F1', 'P1', 'S1']);
  for (let i = 1; i < list.length; i++) assert.ok(list[i].start >= list[i - 1].start);
  for (const w of list) {
    const st = w.station;
    assert.ok(st.strokes(w.start, w.end).length > 0, `${st.id} is on when it says it is`);
    assert.ok(w.end > w.start);
  }
  assert.ok(list[0].start <= noon + 1 && list[0].end > noon + 1, 'R1 is on now');
  assert.deepEqual(sked(EPOCH - 1), [], 'and before first carrier there was no schedule');
  // Every station that keeps a schedule is on it once it has started.
  const later = Math.max(...stations.map((st) => midnight(st.since))) + DAY;
  assert.deepEqual(sked(later).map((x) => x.station.id).sort(), stations.filter((st) => st.next).map((st) => st.id).sort());
});
