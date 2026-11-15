// The world R1 reports on.

import test from 'node:test';
import assert from 'node:assert/strict';
import { EPOCH, DAY, HOUR } from '../lib/clock.js';
import * as moon from '../lib/world/moon.js';
import { height, turns, MEAN, REACH } from '../lib/world/tide.js';
import { AREAS, COAST, land, nearest } from '../lib/world/sea.js';
import { pressure, wind, beaufort, compass, synopsis, systems, sky } from '../lib/world/weather.js';
import { chart, SIZE } from '../lib/world/chart.js';
import { at } from './listen.js';

test('the moon is the one outside, to within a day', () => {
  // New and full moons as they actually fall.
  const off = (p, want) => Math.abs(((p - want + 1.5) % 1) - 0.5);
  assert.ok(off(moon.phase(at('2026-11-09T07:02:00Z')), 0) < 0.035);
  assert.ok(off(moon.phase(at('2026-11-24T14:53:00Z')), 0.5) < 0.035);
  assert.ok(off(moon.phase(at('2030-01-04T02:49:00Z')), 0) < 0.035);
  assert.equal(moon.name(at('2026-11-24T14:53:00Z')), 'FULL');
  assert.ok(moon.lit(at('2026-11-24T14:53:00Z')) > 0.98);
  assert.ok(moon.age(EPOCH) >= 0 && moon.age(EPOCH) < 29.54);
});

test('the tide turns about four times a day and stays within its reach', () => {
  const list = turns(EPOCH, EPOCH + 30 * DAY);
  assert.ok(list.length >= 112 && list.length <= 120, String(list.length));
  for (let i = 1; i < list.length; i++) {
    assert.notEqual(list[i].high, list[i - 1].high, 'high and low take turns');
    assert.ok(list[i].t > list[i - 1].t);
  }
  for (const x of list) assert.ok(Math.abs(x.h - MEAN) <= REACH);
  // A turn is a turn: the water is no higher either side of a high water.
  for (const x of list.slice(0, 20)) {
    const d = x.high ? 1 : -1;
    assert.ok(d * (height(x.t) - height(x.t - 900)) > 0 && d * (height(x.t) - height(x.t + 900)) > 0);
  }
});

test('springs follow new and full moon, neaps follow the quarters', () => {
  // Daily range against the age of the moon, over a year.
  const byAge = new Array(30).fill(0).map(() => []);
  for (let d = 0; d < 365; d++) {
    const t0 = EPOCH + d * DAY;
    let lo = Infinity;
    let hi = -Infinity;
    for (let s = 0; s < DAY; s += 600) {
      const h = height(t0 + s);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    byAge[Math.floor(moon.age(t0 + DAY / 2))].push(hi - lo);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const springs = mean([...byAge[1], ...byAge[2], ...byAge[16], ...byAge[17]]);
  const neaps = mean([...byAge[8], ...byAge[9], ...byAge[23], ...byAge[24]]);
  assert.ok(springs > neaps + 1, `${springs.toFixed(2)} m against ${neaps.toFixed(2)} m`);
});

test('the sea areas are at sea and the coastal stations are on the coast', () => {
  assert.equal(AREAS.length, 11);
  assert.equal(new Set(AREAS.map((a) => a.name)).size, 11);
  for (const a of AREAS) assert.ok(!land(a.x, a.y), `${a.name} is aground`);
  for (const c of COAST) {
    // Land and water both within a short walk.
    let wet = false;
    let dry = false;
    for (const r of [0, 0.02, 0.04, 0.06]) {
      for (let i = 0; i < 16; i++) {
        const x = c.x + r * Math.cos(i * 0.3927);
        const y = c.y + r * Math.sin(i * 0.3927);
        if (land(x, y)) dry = true;
        else wet = true;
      }
    }
    assert.ok(wet && dry, `${c.name} is not on a coast`);
  }
  assert.equal(nearest(AREAS[3].x, AREAS[3].y).name, AREAS[3].name);
});

test('the weather is weather: plausible, and the same each time it is asked', () => {
  let gales = 0;
  let days = 0;
  for (let d = 0; d < 400; d += 3) {
    const t = EPOCH + d * DAY + 7 * HOUR;
    days++;
    let worst = 0;
    for (const a of AREAS) {
      const p = pressure(a.x, a.y, t);
      assert.ok(p > 930 && p < 1060, `${p} hPa`);
      const w = wind(a.x, a.y, t);
      assert.ok(w.force >= 0 && w.force <= 12 && w.from >= 0 && w.from < 360);
      assert.deepEqual(w, wind(a.x, a.y, t));
      assert.ok(typeof sky(a.x, a.y, t).weather === 'string');
      worst = Math.max(worst, w.force);
    }
    if (worst >= 8) gales++;
  }
  assert.ok(gales / days > 0.05 && gales / days < 0.6, `gales somewhere on ${gales} days of ${days}`);
  assert.deepEqual(systems(EPOCH + 5 * DAY), systems(EPOCH + 5 * DAY));
});

test('the wind blows round a low the right way', () => {
  // Northern rules: stand with your back to the wind and the low is on your left.
  // So a little way south of a deep low, the wind has west in it.
  let checked = 0;
  for (let d = 0; d < 400; d++) {
    const t = EPOCH + d * DAY;
    const low = synopsis(t)[0];
    if (!low || !low.low || low.pressure > 985 || low.y > 0.85) continue;
    const w = wind(low.x, low.y + 0.1, t);
    if (w.force < 6) continue; // something else is in the way
    checked++;
    assert.ok(w.from > 180 && w.from < 360, `wind from ${compass(w.from)} south of a low in ${low.area}, day ${d}`);
  }
  assert.ok(checked >= 20, String(checked));
  assert.equal(beaufort(0), 0);
  assert.equal(beaufort(40), 12);
  assert.equal(compass(0), 'N');
  assert.equal(compass(225), 'SW');
});

test('the chart is the same chart each time, and has a coast on it', () => {
  const t = at('2026-11-15T12:00:00Z');
  const a = chart(t);
  assert.equal(a.w, SIZE);
  assert.equal(a.h, SIZE);
  assert.equal(a.toString(), chart(t).toString());
  assert.notEqual(a.toString(), chart(t + 6 * HOUR).toString());
  const text = a.toString();
  assert.ok(text.includes(':'), 'land');
  assert.ok(text.split('\n')[7].startsWith('#'.repeat(SIZE)), 'a rule under the title');
});
