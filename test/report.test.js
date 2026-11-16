// Reports and cards: section 16 of the Standard.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stations, dial, onAir, QUIET } from '../lib/band.js';
import { MINUTE, HOUR, DAY, midnight, iso, hhmm } from '../lib/clock.js';
import { place, CELL, SIZE } from '../lib/floor.js';
import { keepers } from '../keepers/index.js';
import { examine, clipping, card, stated, address, readAddress, hand, QUOTE, CARD, SLIPS, HAND, WITHIN } from '../lib/report.js';
import { at } from './listen.js';

// Long after everything reported here, so that all of it has gone by.
const LATER = at('2027-06-01T00:00:00Z');
const report = (khz, date, utc, copied = '', to = '') => examine({ khz, date, utc, copied, to }, LATER);

const kHz = (hz) => (hz / 1000).toFixed(2);
const drawn = (keeper) => keeper.mark.join('\n');

// A drawing with the first n cells set down wrong.
const slipped = (keeper, n) =>
  keeper.mark
    .join('')
    .replace(/./g, (cell, i) => (i < n ? (cell === '#' ? '.' : '#') : cell))
    .match(/.{9}/g)
    .join('\n');

test('report: a correct one is confirmed, and the card says what was quoted', () => {
  const finding = report('6105', '2026-11-15', '1200', 'zczc r1 025   cq cq cq');
  assert.equal(finding.ok, true);
  assert.equal(finding.station.id, 'R1');
  assert.equal(finding.quoted, 'ZCZC R1 025\nCQ CQ CQ');
  assert.ok(finding.from >= at('2026-11-15T12:00:00Z') && finding.till < at('2026-11-15T12:01:00Z'));
  assert.match(finding.number, /^\d{6}$/);

  const says = card(finding);
  assert.equal(says.heading, 'R1');
  assert.equal(says.name, 'the Forecast');
  assert.deepEqual(says.lines, [
    ['To', 'the listener'],
    ['Date', '2026-11-15, day 0'],
    ['UTC', '1200'],
    ['kHz', '6105.00'],
    ['Copied', 'ZCZC R1 025 / CQ CQ CQ'],
  ]);
  assert.equal(says.keeper, 'Station kept by keeper 1');
});

test('report: what was not sent is not confirmed', () => {
  // The bulletin at 1200 on the first day was 025.
  const wrong = report('6105', '2026-11-15', '1200', 'ZCZC R1 026 CQ CQ CQ');
  assert.equal(wrong.ok, false);
  assert.match(wrong.why, /^That is not what R1 sent from 1155 to 1205 UTC\./);
  // Eleven in a row will not do, and twelve will. Spaces are not counted.
  assert.equal(report('6105', '2026-11-15', '1200', 'CQ CQ CQ DE R1 R').ok, false);
  assert.equal(report('6105', '2026-11-15', '1200', 'CQ CQ CQ DE R1 R1').ok, true);
  assert.equal(report('6105', '2026-11-15', '1200', 'cqcqcqder1r1').ok, true);
  assert.equal(QUOTE, 12);
  // Right, but from the wrong half hour.
  assert.equal(report('6105', '2026-11-15', '1230', 'ZCZC R1 025 CQ CQ CQ').ok, false);
  assert.equal(report('6105', '2026-11-15', '1200', '').why, 'The report does not say what was copied.');
  // P1 is on at a quarter past and a quarter to, and silent at the hour.
  assert.equal(report('6225', '2026-11-15', '1200', '001 001 001 47 47').why, 'A decoder on P1 printed nothing from 1155 to 1205 UTC.');
});

test('report: the copy may lie five minutes either side of the stated minute, and no further', () => {
  // R1 began at 1200 and sent this line in its first few seconds.
  assert.equal(WITHIN, 5 * MINUTE);
  assert.equal(report('6105', '2026-11-15', '1155', 'ZCZC R1 025 CQ CQ CQ').ok, true);
  assert.equal(report('6105', '2026-11-15', '1154', 'ZCZC R1 025 CQ CQ CQ').ok, false);
  assert.equal(report('6105', '2026-11-15', '1205', 'ZCZC R1 025 CQ CQ CQ').ok, true);
  assert.equal(report('6105', '2026-11-15', '1206', 'ZCZC R1 025 CQ CQ CQ').ok, false);
});

test('report: only what has gone by can be reported', () => {
  const fields = { khz: '6105', date: '2026-11-15', utc: '1200', copied: 'ZCZC R1 025 CQ CQ CQ' };
  const early = examine(fields, at('2026-11-15T11:59:59Z'));
  assert.equal(early.ok, false);
  assert.match(early.why, /^That has not been sent yet\./);
  // Nor can a line be quoted before the last of it has arrived.
  assert.equal(examine(fields, at('2026-11-15T12:00:02Z')).ok, false);
  assert.equal(examine(fields, at('2026-11-15T12:01:00Z')).ok, true);

  assert.match(report('6105', '2026-11-14', '2359', 'ZCZC').why, /^Nothing was sent before first carrier/);
  for (const [date, utc] of [['2026-02-30', '1200'], ['2026-11-15', '2400'], ['2026-11-15', '12'], ['15 November', '1200'], ['', '']]) {
    assert.match(report('6105', date, utc, 'ZCZC').why, /^A report needs a date/, `${date} ${utc}`);
  }
  assert.equal(report('6105', '2026-11-15', '12:00', 'ZCZC R1 025 CQ CQ CQ').ok, true);
});

test('report: it belongs on a dial frequency', () => {
  assert.equal(report('6105.40', '2026-11-15', '1200', 'ZCZC R1 025 CQ CQ CQ').ok, true);
  assert.equal(report('6104.50', '2026-11-15', '1200', 'ZCZC R1 025 CQ CQ CQ').ok, true);
  assert.match(report('6105.60', '2026-11-15', '1200', 'ZCZC R1 025 CQ CQ CQ').why, /inside the allocation of R1, whose dial frequency is 6105\.00 kHz/);
  assert.equal(report('6050', '2026-11-15', '1200', 'ANYTHING AT ALL').why, 'Nothing is allocated at 6050.00 kHz and nothing was sent there.');
  assert.match(report('5999', '2026-11-15', '1200', 'ANYTHING AT ALL').why, /is off the band/);
  assert.match(report('6500.01', '2026-11-15', '1200', 'ANYTHING AT ALL').why, /is off the band/);
  assert.equal(report('', '2026-11-15', '1200', 'ANYTHING AT ALL').why, 'A report needs a frequency, in kHz.');
  for (const odd of ['six thousand', '0x17D9', '6.105e3', 'Infinity', '-6105', '6105 kHz']) {
    assert.equal(report(odd, '2026-11-15', '1200', 'ZCZC R1 025 CQ CQ CQ').why, 'A report needs a frequency, in kHz.', odd);
  }
  // A comma will do for the point, and the point may be left hanging.
  assert.equal(report('6105,00', '2026-11-15', '1200', 'ZCZC R1 025 CQ CQ CQ').ok, true);
  assert.equal(report(' 6105. ', '2026-11-15', '1200', 'ZCZC R1 025 CQ CQ CQ').ok, true);
});

test('report: a station cannot be reported from before it came on the air', () => {
  for (const st of stations) {
    const eve = midnight(st.since) - 12 * HOUR;
    if (eve < midnight('2026-11-15')) continue; // there since first carrier
    const finding = report(kHz(dial(st)), iso(eve).slice(0, 10), hhmm(eve), 'ANYTHING AT ALL');
    assert.equal(finding.why, `${st.id} was not on the air until ${st.since}.`);
  }
});

test('report: where fewer than twelve characters were sent, all of them', () => {
  // S1 was one note long on the first day, and a decoder printed its name.
  assert.equal(report('6470', '2026-11-15', '1155', 'd').quoted, 'D');
  assert.equal(report('6470', '2026-11-15', '1155', 'E').ok, false);
  // C1 pipped three times at high water.
  assert.equal(report('6400', '2026-11-15', '0936', '...').ok, true);
  assert.equal(report('6400', '2026-11-15', '0936', '..').ok, false);
});

test('report: every station on the air can be reported, and gets its own card', () => {
  const numbers = new Set();
  for (const st of stations) {
    // The first thing a decoder prints on its second day, whenever that is.
    let t0 = midnight(st.since) + DAY;
    let events = [];
    for (let tries = 0; tries < 300 && !events.length; tries++, t0 += 10 * MINUTE) events = st.copy(t0, t0 + 10 * MINUTE);
    assert.ok(events.length, `${st.id} printed nothing in two days`);
    const t = events[0].t;
    const copied = st.copy(t - 1, t + 4 * MINUTE).map((e) => e.s).join('');
    const finding = report(kHz(dial(st)), iso(t).slice(0, 10), hhmm(t), copied, 'A TEST');
    assert.equal(finding.ok, true, `${st.id}: ${finding.why}`);
    assert.equal(finding.station, st);
    assert.ok(finding.quoted.length <= CARD, st.id);
    assert.ok(copied.includes(finding.quoted), st.id);
    assert.equal(card(finding).heading, st.id);
    numbers.add(finding.number);

    // The clipping is of the seconds in which the quotation arrived, or
    // the last half minute of them, with the station somewhere on it.
    const clip = clipping(finding, 120, 40);
    assert.equal(clip.rows.length, 40);
    assert.ok(clip.t0 < finding.till && clip.t1 > finding.till && clip.t1 - clip.t0 <= 30, st.id);
    assert.ok(clip.lo <= dial(st) && clip.hi >= dial(st) + Math.min(st.width, 3000), st.id);
    assert.ok(onAir(clip.t0, clip.t1, clip.lo, clip.hi).some((s) => s.f >= dial(st) && s.f <= dial(st) + st.width), st.id);
  }
  assert.equal(numbers.size, stations.length);
});

test('report: the same report gets the same card', () => {
  const first = report('6225', '2026-11-15', '1215', '001 001 001  47 47  98042 98042  48225 88090 26672 30324 26869', 'anybody');
  assert.equal(first.ok, true);
  assert.equal(first.to, 'ANYBODY');
  const again = examine(stated(first), LATER);
  for (const key of ['quoted', 'from', 'till', 'number', 'hz', 't', 'to']) assert.equal(again[key], first[key], key);
  assert.deepEqual(stated(again), stated(first));
  assert.deepEqual(clipping(again, 60, 20), clipping(first, 60, 20));

  // A long report is cut down to what a card has room for, and still stands.
  const all = stations.find((st) => st.id === 'R1').copy(at('2026-11-15T12:00:00Z'), at('2026-11-15T12:04:00Z')).map((e) => e.s).join('');
  const long = report('6105', '2026-11-15', '1200', all);
  assert.ok(all.length > 500 && long.quoted.length <= CARD && long.quoted.length > CARD - 12);
  assert.equal(examine(stated(long), LATER).quoted, long.quoted);

  // The number goes with the station, the minute and the name, and with nothing else.
  const other = (changes) => examine({ ...stated(first), ...changes }, LATER);
  assert.equal(other({ copied: '98042 98042 48225' }).number, first.number);
  assert.equal(other({ khz: '6225.30' }).number, first.number);
  assert.notEqual(other({ to: 'SOMEBODY ELSE' }).number, first.number);
  assert.notEqual(other({ utc: '1216' }).number, first.number);
  assert.notEqual(report('6105', '2026-11-15', '1215', '', 'anybody').number, first.number);
});

test('report: a name is typed in capitals, and is short', () => {
  assert.equal(hand('  the  one who\tstayed up  '), 'THE ONE WHO STAYED UP');
  assert.equal(hand('<b>somebody</b> & co.'), 'B SOMEBODY /B CO.');
  assert.equal(hand("o'brien-smith 2/3"), "O'BRIEN-SMITH 2/3");
  assert.equal(hand('x'.repeat(100)).length, HAND);
  assert.equal(hand(undefined), '');
  // Not everybody's name is in the teleprinter's alphabet.
  assert.equal(hand('josé ångström'), 'JOSÉ ÅNGSTRÖM');
  assert.equal(hand('李 明'), '李 明');
  assert.equal(hand('Ольга'), 'ОЛЬГА');
  assert.equal(hand('\u{1F4FB} radio \u{1F4FB}'), 'RADIO');
  assert.equal([...hand('\u{20000}'.repeat(100))].length, HAND);
  assert.equal(card(report('6105', '2026-11-15', '1200', 'ZCZC R1 025 CQ CQ CQ', 'night owl')).lines[0][1], 'NIGHT OWL');
});

test('report: in the quiet segment a report is a drawing of a mark', () => {
  const [one, two] = keepers;
  const where = (k) => kHz(place(k.n).f + 4 * CELL.f);

  const finding = report(where(one), '2026-11-15', '1400', drawn(one));
  assert.equal(finding.ok, true);
  assert.equal(finding.mark, one);
  assert.equal(finding.cells, SIZE * SIZE);
  assert.equal(card(finding).heading, 'Mark 1');
  assert.equal(card(finding).keeper, 'The mark of keeper 1');
  assert.equal(card(finding).lines[4][1], 'a mark, 81 cells of 81');

  // A few cells may be set down wrong.
  assert.equal(report(where(one), '2026-11-15', '1400', slipped(one, SLIPS)).cells, SIZE * SIZE - SLIPS);
  assert.equal(report(where(one), '2026-11-15', '1400', slipped(one, SLIPS + 1)).ok, false);

  // Words will not do, and nor will a drawing of the wrong size.
  assert.match(report(where(one), '2026-11-15', '1400', 'A RING INSIDE A RING').why, /^A report from the quiet segment is a drawing/);
  assert.match(report(where(one), '2026-11-15', '1400', drawn(one) + '#').why, /^A report from the quiet segment is a drawing/);

  // A mark is where its keeper's place is, and nowhere else.
  assert.equal(report(where(two), '2026-11-16', '1400', drawn(one)).ok, false);
  assert.equal(report(kHz(QUIET.hi - 500), '2026-11-16', '1400', drawn(one)).why, 'That is not what lay at 6259.50 kHz.');

  // And it is not there before its keeper came on watch.
  const eve = midnight(two.since) - HOUR;
  assert.equal(report(where(two), iso(eve).slice(0, 10), hhmm(eve), drawn(two)).ok, false);
  assert.equal(report(where(two), two.since, '0000', drawn(two)).mark, two);

  // The card for a mark carries a piece of paper with nothing on it.
  const clip = clipping(finding);
  assert.ok(clip.lo >= QUIET.lo - 1000 && clip.hi <= QUIET.hi + 1000);
  assert.equal(onAir(clip.t0, clip.t1, clip.lo, clip.hi).length, 0);
  assert.deepEqual(examine(stated(finding), LATER).number, finding.number);
});

test('report: every keeper can be sent a card for their own mark', () => {
  for (const k of keepers) {
    const finding = report(kHz(place(k.n).f), k.since, '1200', drawn(k), `keeper ${k.n}`);
    assert.equal(finding.ok, true, `keeper ${k.n}`);
    assert.equal(finding.mark, k);
  }
});

test('report: it can be written as an address and read back', () => {
  const fields = { khz: '6105.00', date: '2026-11-15', utc: '1200', copied: 'A+B & C=D #1\n50% "É"', to: "O'BRIEN" };
  const written = address(fields);
  assert.match(written, /^report\.html#khz=6105\.00&date=2026-11-15&utc=1200&copied=/);
  // Everything is after the #, where a browser keeps it to itself.
  assert.equal(written.indexOf('?'), -1);
  assert.equal(written.split('#').length, 2);
  assert.deepEqual(readAddress(written), { fields, begun: false, empty: false });
  assert.deepEqual(readAddress('#' + written.split('#')[1]), { fields, begun: false, empty: false });

  // One that the receiver began is marked, and is not taken for one sent in.
  const begun = address({ khz: '6105.00', date: '2026-11-15', utc: '1201' }, true);
  assert.equal(begun, 'report.html#begun&khz=6105.00&date=2026-11-15&utc=1201');
  assert.deepEqual(readAddress(begun), { fields: { khz: '6105.00', date: '2026-11-15', utc: '1201', copied: '', to: '' }, begun: true, empty: false });

  // Nothing, or only a name and a date, is nothing to examine.
  assert.equal(readAddress('').empty, true);
  assert.equal(readAddress('report.html').empty, true);
  assert.equal(readAddress('#date=2026-11-15&to=ANYBODY').empty, true);
  assert.equal(address({}), 'report.html#');
});

test('report: nothing about a report is stored, and nothing is sent anywhere', () => {
  const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  // The form has nowhere to send itself, and nothing in it has a name to be sent under.
  const page = read('report.html');
  assert.doesNotMatch(page, /<form[^>]*\b(action|method)\s*=/i);
  assert.doesNotMatch(page, /<(input|textarea|select)[^>]*\sname\s*=/i);
  // And the code behind it neither calls out nor writes anything down.
  for (const file of ['lib/report.js', 'site/report.js', 'site/ink.js', 'bin/card.js']) {
    assert.doesNotMatch(read(file), /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|\.cookie|writeFile|appendFile/, file);
  }
});
