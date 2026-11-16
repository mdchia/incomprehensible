// Reports, and whether they are correct.
//
// A listener says: at this time, on this frequency, I copied this. The
// band is a function of the time, so anyone can work out whether that is
// right, at any time afterwards, with nothing kept on file. A correct
// report is answered with a card: report.html draws one, and bin/card.js
// types one.
//
// What makes a report correct is section 16 of the Standard. This is that
// section as code.

import { BAND, QUIET, stations, dial, live, tuned, onAir } from './band.js';
import { EPOCH, MINUTE, FRAME, now, midnight, dayOf, hhmm, iso, pad } from './clock.js';
import { hash } from './hash.js';
import { rowOf } from './paper.js';
import { SIZE, CELL, place } from './floor.js';
import { keepers } from '../keepers/index.js';

export const REACH = 500; // Hz either side of a dial frequency within which a report belongs to its station
export const WITHIN = 5 * MINUTE; // how far either side of the stated minute the copy may lie
export const QUOTE = 12; // characters in a row that a report must have right
export const SLIPS = 3; // cells of a mark that may be set down wrong
export const CARD = 72; // characters of the report that a card has room to quote
export const HAND = 32; // characters in the name a card is made out to

const kHz = (hz) => (hz / 1000).toFixed(2);
const clock = (t) => iso(t).slice(11, 19);

// The name a card is made out to, as it would be typed: letters and
// figures of any alphabet, in capitals where it has them, and a few
// marks. It appears on the card and nowhere else.
export const hand = (s) =>
  [
    ...String(s ?? '')
      .normalize('NFC')
      .toUpperCase()
      .replace(/[^\p{L}\p{M}\p{N} /'.-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ]
    .slice(0, HAND)
    .join('')
    .trim();

// The stated moment: a date and four figures, UTC. To the minute.
function moment(date, time) {
  const d = /^\d{4}-\d{2}-\d{2}$/.exec(String(date ?? '').trim());
  const h = /^(\d{2}):?(\d{2})$/.exec(String(time ?? '').trim());
  if (!d || !h || Number(h[1]) > 23 || Number(h[2]) > 59) return null;
  const ms = Date.parse(`${d[0]}T${h[1]}:${h[2]}:00Z`);
  // A date that is not in the calendar must not be quietly taken for another.
  if (Number.isNaN(ms) || iso(ms / 1000).slice(0, 10) !== d[0]) return null;
  return ms / 1000;
}

// Spacing and capitals are not examined.
const squeeze = (s) => String(s).toUpperCase().replace(/\s+/g, '');

// What a decoder on st printed between t0 and t1: the text as it came,
// the same text squeezed, and for each squeezed character the moment it
// arrived and where it stood in the text as it came.
function printed(st, t0, t1) {
  let raw = '';
  let text = '';
  const when = [];
  const where = [];
  for (const e of st.copy(Math.max(t0, midnight(st.since)), t1)) {
    for (const ch of e.s) {
      if (!/\s/.test(ch)) {
        for (const up of ch.toUpperCase()) {
          text += up;
          when.push(e.t);
          where.push(raw.length);
        }
      }
      raw += ch;
    }
  }
  return { raw, text, when, where };
}

// The longest run of characters that said and sent have in common. Of
// two runs the same length, the one that arrived nearer to t.
function run(said, sent, when, t) {
  let best = { length: 0, at: 0 };
  let prev = new Uint16Array(sent.length + 1);
  let cur = new Uint16Array(sent.length + 1);
  for (let i = 1; i <= said.length; i++) {
    for (let j = 1; j <= sent.length; j++) {
      if (said[i - 1] !== sent[j - 1]) {
        cur[j] = 0;
        continue;
      }
      const n = prev[j - 1] + 1;
      cur[j] = n;
      const nearer = n === best.length && Math.abs(when[j - 1] - t) < Math.abs(when[best.at + best.length - 1] - t);
      if (n > best.length || nearer) best = { length: n, at: j - n };
    }
    [prev, cur] = [cur, prev];
  }
  return best;
}

// A card's number. The same listener reporting the same thing in the same
// minute always gets the same one, and nobody keeps a list.
const serial = (what, t, to) => pad(hash('card', what, Math.floor(t / MINUTE), to) % 1_000_000, 6);

// ---- the quiet segment -----------------------------------------------------
//
// Nothing is sent there, so there is nothing to quote. What can be
// reported is what lies under the floor: a drawing of it, nine rows of
// nine, on the frequency where it was found.

function drawing(copied) {
  const s = String(copied).replace(/[^#.]/g, '');
  return s.length === SIZE * SIZE ? s : null;
}

function examineMark(hz, t, copied, to, no) {
  const drawn = drawing(copied);
  if (!drawn) return no(`A report from the quiet segment is a drawing of what was found there: ${SIZE} rows of ${SIZE}, # where a cell is filled and . where it is not.`);
  let best = null;
  for (const k of keepers) {
    if (midnight(k.since) > t) continue;
    const at = place(k.n);
    if (hz < at.f - CELL.f || hz > at.f + (SIZE + 1) * CELL.f) continue; // a cell of grace either side
    const theirs = k.mark.join('');
    let wrong = 0;
    for (let i = 0; i < theirs.length; i++) if (theirs[i] !== drawn[i]) wrong++;
    if (!best || wrong < best.wrong) best = { keeper: k, wrong };
  }
  if (!best || best.wrong > SLIPS) return no(`That is not what lay at ${kHz(hz)} kHz.`);
  return { ok: true, to, hz, t, mark: best.keeper, drawn, cells: SIZE * SIZE - best.wrong, number: serial(`mark ${best.keeper.n}`, t, to) };
}

// ---- examining -------------------------------------------------------------

// examine({ khz, date, utc, copied, to }) -> a finding.
//
// The fields are as a listener would write them: '6105.00', '2026-11-15',
// '1200', what was copied, and a name for the card. A finding is either
//
//   { ok: false, why }                           and why is a sentence, or
//   { ok: true, station, quoted, from, till, number, ... }   for a station, or
//   { ok: true, mark, cells, number, ... }                   for a mark.
//
// quoted is the run of the report that was right, as it was sent, or as
// much of it as a card has room for; from and till are when the first
// and last of that arrived.
export function examine(fields, present = now()) {
  const to = hand(fields.to);
  const copied = String(fields.copied ?? '');
  const typed = String(fields.khz ?? '').trim().replace(',', '.'); // some write 6105,00
  const hz = /^\d+(\.\d*)?$/.test(typed) ? Math.round(Number(typed) * 100) * 10 : NaN; // to ten hertz, as the dial reads
  const t = moment(fields.date, fields.utc);
  const no = (why, more) => ({ ok: false, why, to, hz, t, ...more });

  if (!Number.isFinite(hz)) return no('A report needs a frequency, in kHz.');
  if (t === null) return no('A report needs a date, as YYYY-MM-DD, and a time, as four figures, UTC.');
  if (hz < BAND.lo || hz > BAND.hi) return no(`${kHz(hz)} kHz is off the band. The band is ${BAND.lo / 1000} to ${BAND.hi / 1000} kHz.`);
  if (t < EPOCH) return no(`Nothing was sent before first carrier, at 0000 UTC on ${iso(EPOCH).slice(0, 10)}.`);
  if (t > present) return no('That has not been sent yet. A report is of something already heard.');

  if (hz >= QUIET.lo && hz < QUIET.hi) return examineMark(hz, t, copied, to, no);

  const lock = tuned(hz, REACH, t);
  if (!lock) {
    const early = stations.find((st) => Math.abs(hz - dial(st)) <= REACH && !live(st, t));
    if (early) return no(`${early.id} was not on the air until ${early.since}.`);
    const inside = stations.find((st) => live(st, t) && hz >= dial(st) && hz <= dial(st) + st.width);
    if (inside) return no(`${kHz(hz)} kHz is inside the allocation of ${inside.id}, whose dial frequency is ${kHz(dial(inside))} kHz. A report belongs on the dial frequency.`);
    return no(`Nothing is allocated at ${kHz(hz)} kHz and nothing was sent there.`);
  }

  // The copy may have arrived in the stated minute or in any of the five
  // either side of it, so far as they have gone by.
  const st = lock.station;
  const t0 = Math.max(t - WITHIN, EPOCH);
  const t1 = Math.min(t + MINUTE + WITHIN, present);
  const between = `from ${hhmm(t0)} to ${hhmm(Math.ceil(t1) - 1)} UTC`;
  const sent = printed(st, t0, t1);
  if (!sent.text) return no(`A decoder on ${st.id} printed nothing ${between}.`, { station: st });
  const said = squeeze(copied).slice(0, 2000);
  if (!said) return no('The report does not say what was copied.', { station: st });
  const found = run(said, sent.text, sent.when, t);
  if (found.length < Math.min(QUOTE, sent.text.length)) {
    return no(`That is not what ${st.id} sent ${between}. A report quotes at least ${QUOTE} characters in a row as they were sent, or all of them where fewer were sent.`, { station: st });
  }

  // A card quotes the start of what was right, and no more than it has
  // room for. If that much was sent more than once, it is the sending
  // nearest the stated time that is confirmed, so that the report as the
  // card states it gets the same card again.
  let a = found.at;
  let b = found.at + found.length - 1;
  while (sent.where[b] - sent.where[a] >= CARD) b--;
  const settled = run(sent.text.slice(a, b + 1), sent.text, sent.when, t);
  a = settled.at;
  b = settled.at + settled.length - 1;
  return {
    ok: true,
    to,
    hz,
    t,
    station: st,
    quoted: sent.raw.slice(sent.where[a], sent.where[b] + 1),
    from: sent.when[a],
    till: sent.when[b],
    number: serial(st.id, t, to),
  };
}

// ---- the card --------------------------------------------------------------

const SPANS = [6000, 12000, 24000, 48000];

// The piece of paper a card carries, earliest row first:
//
//   { lo, hi, t0, t1, rows }     rows[r] is a Float32Array of power
//
// For a station it is the stretch in which the quoted copy arrived, with
// the station across it. For a mark it is the place where the mark lies,
// in the frame before the stated time, which looks like nothing at all.
export function clipping(finding, cols = 360, lines = 150) {
  let lo;
  let span;
  let t1;
  let length;
  if (finding.mark) {
    const at = place(finding.mark.n);
    span = 3000;
    lo = at.f - (span - SIZE * CELL.f) / 2;
    length = 12;
    const frame = Math.floor(finding.t / FRAME) * FRAME - FRAME;
    t1 = frame + at.t + SIZE * CELL.t + (length - SIZE * CELL.t) / 2;
  } else {
    const st = finding.station;
    span = SPANS.find((s) => s >= st.width * 1.05) ?? SPANS[SPANS.length - 1];
    lo = st.width > span * 0.6 ? dial(st) - (span - st.width) / 2 : dial(st) - span / 3;
    lo = Math.min(Math.max(lo, BAND.lo - 1000), BAND.hi + 1000 - span);
    length = Math.min(30, Math.max(12, finding.till - finding.from + 4));
    t1 = finding.till + 1;
  }
  const t0 = t1 - length;
  const hz = span / cols;
  const dt = length / lines;
  const strokes = onAir(t0, t1, lo, lo + span);
  const rows = [];
  for (let r = 0; r < lines; r++) rows.push(rowOf(new Float32Array(cols), strokes, t0 + r * dt, dt, lo, hz, 3.2 * hz));
  return { lo, hi: lo + span, t0, t1, rows };
}

// Everything a card says, as text, so that the page and the terminal say
// the same thing.
export function card(finding, clip = clipping(finding)) {
  const date = iso(finding.t).slice(0, 10);
  const lines = [
    ['To', finding.to || 'the listener'],
    ['Date', `${date}, day ${dayOf(finding.t)}`],
    ['UTC', hhmm(finding.t)],
    ['kHz', kHz(finding.hz)],
  ];
  const caption = `${kHz(clip.lo)} to ${kHz(clip.hi)} kHz, ${clock(clip.t0)} to ${clock(clip.t1)} UTC`;
  if (finding.mark) {
    return {
      heading: `Mark ${finding.mark.n}`,
      name: 'the quiet segment',
      emission: 'nothing sent',
      lines: [...lines, ['Copied', `a mark, ${finding.cells} cells of ${SIZE * SIZE}`]],
      number: finding.number,
      keeper: `The mark of keeper ${finding.mark.n}`,
      caption,
    };
  }
  const st = finding.station;
  const quoted = finding.quoted.trim().replace(/[^\S\n]+/g, ' ').replace(/ ?\n+ ?/g, ' / ');
  return {
    heading: st.id,
    name: st.name,
    emission: st.emission,
    lines: [...lines, ['Copied', quoted]],
    number: finding.number,
    keeper: `Station kept by keeper ${st.keeper}`,
    caption,
  };
}

// A confirmed report as the card states it, which is the short way to
// write it down. Sent in again, it gets the same card.
export function stated(finding) {
  return {
    khz: kHz(finding.hz),
    date: iso(finding.t).slice(0, 10),
    utc: hhmm(finding.t),
    copied: finding.mark ? finding.drawn.match(/.{9}/g).join(' ') : finding.quoted.replace(/\s+/g, ' '),
    to: finding.to,
  };
}

// ---- the address -----------------------------------------------------------

// What a report is made of, in the order it is written down.
export const FIELDS = Object.freeze(['khz', 'date', 'utc', 'copied', 'to']);

// A report as an address: report.html#khz=6105.00&date=...
//
// It goes after the #, which a browser keeps to itself, and not after a
// ?, which it would send to whoever serves the page. begun marks a report
// that has been started for the listener and not yet sent in by them.
export function address(fields, begun = false) {
  const parts = begun ? ['begun'] : [];
  for (const name of FIELDS) {
    const value = String(fields[name] ?? '');
    if (value) parts.push(`${name}=${encodeURIComponent(value).replace(/%20/g, '+')}`);
  }
  return `report.html#${parts.join('&')}`;
}

// And an address, or the end of one, as a report again:
//
//   { fields, begun, empty }
//
// empty is true where it says nothing that could be examined.
export function readAddress(written) {
  const params = new URLSearchParams(String(written ?? '').replace(/^[^#]*#/, ''));
  const fields = Object.fromEntries(FIELDS.map((name) => [name, params.get(name) ?? '']));
  return { fields, begun: params.has('begun'), empty: !(fields.khz || fields.utc || fields.copied) };
}
