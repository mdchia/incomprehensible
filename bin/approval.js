// Type approval. Everything the Standard requires, as code.
//
// Each check returns a list of problems, as strings. No problems, no list.
// bin/check.js prints them; the tests insist there are none.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import { stations, BAND, QUIET, dial, onAir } from '../lib/band.js';
import { keepers } from '../keepers/index.js';
import { traffic } from '../traffic/index.js';
import { statement } from '../statement.js';
import { SIZE, PLACES } from '../lib/floor.js';
import { EPOCH, DAY, HOUR, iso, midnight } from '../lib/clock.js';
import { sendable, encipher, decipher } from '../stations/stairs.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FIRST_DAY = '2026-11-15';
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const arrived = (n) => keepers.find((k) => k.n === n)?.since;

// A dated thing: its date must be a date, not before its keeper came on
// watch, and not before the thing listed ahead of it.
function dated(date, keeper, before) {
  if (!isDate(date)) return 'needs the date it was added, as YYYY-MM-DD';
  if (arrived(keeper) && date < arrived(keeper)) return `dated ${date}, before keeper ${keeper} came on watch`;
  if (before && date < before) return `dated ${date}, before the one ahead of it (${before})`;
  return null;
}
const filesIn = (dir) => readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.js') && f !== 'index.js').sort();
const load = async (dir, file) => (await import(pathToFileURL(join(ROOT, dir, file)).href)).default;

// Limits. A receiver has to be able to keep up.
export const LIMITS = Object.freeze({
  strokesPerSecond: 400, // averaged over any window checked
  voices: 64, // strokes sounding at one instant
  strokeSeconds: 3600, // no stroke outlasts an hour
  trafficChars: 240,
  statementWords: 30,
  markCells: [12, 60], // fewest and most filled cells in a mark
});

// The moments at which every station is examined. Fixed, so that a
// station approved today is examined at the same moments tomorrow.
export function moments(st) {
  const first = Math.max(EPOCH, midnight(st.since));
  const out = [first, first + 12 * HOUR + 17, first + 3 * DAY + 3599, first + 40 * DAY + 55 * 60 - 5, first + 400 * DAY + 14 * 60 + 50, first + 2000 * DAY + 1790];
  // And inside its next few transmissions, if it keeps a schedule.
  if (st.next) {
    let t = first + 5 * DAY;
    for (let i = 0; i < 3; i++) {
      const w = st.next(t);
      if (!w) break;
      out.push(w.start - 2, (w.start + w.end) / 2);
      t = w.end + 1;
    }
  }
  return out;
}

const WINDOW = 90;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sig = (s) => `${s.t0.toFixed(4)}|${s.t1.toFixed(4)}|${s.f}|${s.f1 ?? ''}|${s.w ?? ''}|${s.a}`;

export async function register() {
  const problems = [];
  const ids = new Set();
  const listed = new Set(stations);

  for (const file of filesIn('stations')) {
    if (!listed.has(await load('stations', file))) problems.push(`stations/${file} is not on the register (stations/index.js)`);
  }

  for (const st of stations) {
    const who = st?.id || '(a station with no id)';
    const bad = (msg) => problems.push(`${who}: ${msg}`);
    if (!/^[A-Z]{1,2}[1-9]\d?$/.test(st.id || '')) bad('designator must be one or two letters and a number, like M2');
    if (ids.has(st.id)) bad('designator already taken');
    ids.add(st.id);
    if (typeof st.name !== 'string' || !st.name) bad('needs a name');
    if (typeof st.emission !== 'string' || !st.emission) bad('needs an emission');
    if (!Number.isFinite(st.kHz) || Math.abs(st.kHz * 10 - Math.round(st.kHz * 10)) > 1e-6) bad('dial frequency must be a multiple of 100 Hz');
    if (!(st.width > 0)) bad('needs a width');
    if (!keepers.some((k) => k.n === st.keeper)) bad(`keeper ${st.keeper} is not on the roll`);
    if (!isDate(st.since) || st.since < FIRST_DAY) bad(`since must be a date on or after ${FIRST_DAY}`);
    else if (arrived(st.keeper) && st.since < arrived(st.keeper)) bad(`on the air from ${st.since}, before keeper ${st.keeper} came on watch`);
    if (typeof st.strokes !== 'function' || typeof st.copy !== 'function') bad('needs strokes() and copy()');
    if (!st.continuous && typeof st.next !== 'function') bad('a station that is not continuous needs next()');
  }

  // Allocations: inside the band, clear of the quiet segment, clear of each other.
  const spans = stations.filter((st) => Number.isFinite(st.kHz) && st.width > 0).map((st) => ({ id: st.id, lo: dial(st), hi: dial(st) + st.width }));
  for (const a of spans) {
    if (a.lo < BAND.lo || a.hi > BAND.hi) problems.push(`${a.id}: allocation leaves the band`);
    if (a.lo < QUIET.hi && a.hi > QUIET.lo) problems.push(`${a.id}: allocation enters the quiet segment`);
    for (const b of spans) if (a.id < b.id && a.lo < b.hi && b.lo < a.hi) problems.push(`${a.id} and ${b.id}: allocations overlap`);
  }
  return problems;
}

// One station, on the air.
export function emissions(st) {
  const problems = [];
  const bad = (t, msg) => problems.push(`${st.id} at ${iso(t)}: ${msg}`);

  for (const t0 of moments(st)) {
    const t1 = t0 + WINDOW;
    let strokes;
    let copy;
    try {
      strokes = st.strokes(t0, t1);
      copy = st.copy(t0, t1);
    } catch (e) {
      bad(t0, `threw ${e.message}`);
      continue;
    }
    if (!Array.isArray(strokes) || !Array.isArray(copy)) {
      bad(t0, 'strokes() and copy() must return arrays');
      continue;
    }

    let malformed = 0;
    for (const s of strokes) {
      const lo = Math.min(s.f, s.f1 ?? s.f) - (s.w || 0) / 2;
      const hi = Math.max(s.f, s.f1 ?? s.f) + (s.w || 0) / 2;
      const ok =
        [s.t0, s.t1, s.f, s.a].every(Number.isFinite) &&
        s.t1 > s.t0 &&
        s.t1 - s.t0 <= LIMITS.strokeSeconds &&
        s.a > 0 &&
        s.a <= 1 &&
        lo >= -1e-6 &&
        hi <= st.width + 1e-6 &&
        (s.tau === undefined || s.tau > 0) &&
        s.t1 > t0 &&
        s.t0 < t1;
      if (!ok) malformed++;
    }
    if (malformed) bad(t0, `${malformed} stroke${malformed === 1 ? '' : 's'} malformed, out of its width, or outside the window asked for`);
    if (strokes.length > LIMITS.strokesPerSecond * WINDOW) bad(t0, `${strokes.length} strokes in ${WINDOW} s is more than a receiver can keep up with`);

    // How many sound at once?
    const edges = [];
    for (const s of strokes) edges.push([s.t0, 1], [s.t1 - 1e-6, -1]); // strokes that merely touch are not together
    edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let now = 0;
    let most = 0;
    for (const [, d] of edges) most = Math.max(most, (now += d));
    if (most > LIMITS.voices) bad(t0, `${most} strokes sounding at once (limit ${LIMITS.voices})`);

    // Asked twice, it must say the same thing.
    if (!same(strokes, st.strokes(t0, t1)) || !same(copy, st.copy(t0, t1))) bad(t0, 'not deterministic: asked twice, answered differently');

    // And it must not matter how the time is cut up.
    const tm = t0 + 37.123;
    const whole = new Set(strokes.map(sig));
    const parts = new Set([...st.strokes(t0, tm), ...st.strokes(tm, t1)].map(sig));
    if (whole.size !== parts.size || [...whole].some((k) => !parts.has(k))) bad(t0, 'strokes depend on how the window is cut');
    const wholeCopy = copy.map((e) => e.s).join('');
    const partCopy = [...st.copy(t0, tm), ...st.copy(tm, t1)].map((e) => e.s).join('');
    if (wholeCopy !== partCopy) bad(t0, 'copy depends on how the window is cut');

    for (let i = 0; i < copy.length; i++) {
      const e = copy[i];
      if (typeof e.s !== 'string' || !Number.isFinite(e.t) || e.t < t0 || e.t >= t1 || (i && e.t < copy[i - 1].t)) {
        bad(t0, 'copy events must be { t, s }, in order, inside the window asked for');
        break;
      }
    }
  }

  // Nothing before its first day.
  const first = midnight(st.since);
  if (onAir(first - 600, first - 1).some((s) => s.s === st.id)) problems.push(`${st.id}: on the air before ${st.since}`);
  return problems;
}

export async function roll() {
  const problems = [];
  const listed = new Set(keepers);
  for (const file of filesIn('keepers')) {
    if (!listed.has(await load('keepers', file))) problems.push(`keepers/${file} is not on the roll (keepers/index.js)`);
  }
  if (keepers.length > PLACES) problems.push(`there are places for ${PLACES} marks and ${keepers.length} keepers; the Standard needs revising`);
  const seen = new Set();
  keepers.forEach((k, i) => {
    const bad = (msg) => problems.push(`keeper ${k.n}: ${msg}`);
    if (k.n !== i + 1) bad(`should be numbered ${i + 1}`);
    if (typeof k.hand !== 'string' || !k.hand.trim()) bad('needs a hand');
    if (!isDate(k.since) || k.since < FIRST_DAY) bad('needs the date they came on watch');
    else if (i && isDate(keepers[i - 1].since) && k.since < keepers[i - 1].since) bad(`came on watch ${k.since}, before keeper ${keepers[i - 1].n}`);
    const m = k.mark;
    if (!Array.isArray(m) || m.length !== SIZE || m.some((r) => typeof r !== 'string' || r.length !== SIZE || /[^#.]/.test(r))) {
      bad(`mark must be ${SIZE} rows of ${SIZE}, each # or .`);
      return;
    }
    const cells = m.join('').replace(/\./g, '').length;
    if (cells < LIMITS.markCells[0] || cells > LIMITS.markCells[1]) bad(`mark has ${cells} cells filled; between ${LIMITS.markCells[0]} and ${LIMITS.markCells[1]} can be found without drowning the segment`);
    if (seen.has(m.join(''))) bad('mark is the same as an earlier keeper\'s');
    seen.add(m.join(''));
  });
  return problems;
}

export function purpose() {
  const problems = [];
  const said = new Set();
  statement.forEach((s, i) => {
    const bad = (msg) => problems.push(`statement, sentence ${i + 1}: ${msg}`);
    if (!keepers.some((k) => k.n === s.keeper)) bad(`keeper ${s.keeper} is not on the roll`);
    if (said.has(s.keeper)) bad(`keeper ${s.keeper} has already had their sentence`);
    said.add(s.keeper);
    const when = dated(s.since, s.keeper, statement[i - 1]?.since);
    if (when) bad(when);
    if (typeof s.text !== 'string' || !/^[A-Za-z0-9' ,-]+\.$/.test(s.text)) bad('one sentence: letters, figures, commas, apostrophes and hyphens, ending in a full stop');
    else if (s.text.split(/\s+/).length > LIMITS.statementWords) bad(`more than ${LIMITS.statementWords} words`);
  });
  return problems;
}

export function messages() {
  const problems = [];
  traffic.forEach((m, i) => {
    const bad = (msg) => problems.push(`traffic ${m.serial}: ${msg}`);
    if (m.serial !== i + 1) bad(`should have serial ${i + 1}`);
    if (!keepers.some((k) => k.n === m.keeper)) bad(`keeper ${m.keeper} is not on the roll`);
    const when = dated(m.filed, m.keeper, traffic[i - 1]?.filed);
    if (when) bad(when);
    if (typeof m.text !== 'string' || !m.text) return bad('needs text');
    if (m.text.length > LIMITS.trafficChars) bad(`${m.text.length} characters; the limit is ${LIMITS.trafficChars}`);
    const stray = [...new Set([...m.text].filter((ch) => !sendable(ch)))];
    if (stray.length) bad(`cannot be sent: ${stray.map((c) => JSON.stringify(c)).join(' ')} (capital letters, figures and spaces only)`);
    else if (decipher(encipher(m.text, '31415'), '31415') !== m.text.trimEnd()) bad('does not survive being sent');
  });
  return problems;
}

export function logbook() {
  const problems = [];
  let text;
  try {
    text = readFileSync(join(ROOT, 'LOGBOOK.md'), 'utf8');
  } catch {
    return ['LOGBOOK.md is missing'];
  }
  const watches = [...text.matchAll(/^## Watch (\d+)\s*$/gm)].map((m) => Number(m[1]));
  watches.forEach((n, i) => {
    if (n !== i + 1) problems.push(`logbook: watch ${n} is out of order; watches are numbered from 1 and never removed`);
  });
  for (const k of keepers) {
    if (!new RegExp(`^- Keeper: ${k.n}\\b`, 'm').test(text)) problems.push(`logbook: keeper ${k.n} has not logged a watch`);
  }
  return problems;
}

export async function all() {
  const problems = [...(await register()), ...(await roll()), ...purpose(), ...messages(), ...logbook()];
  for (const st of stations) problems.push(...emissions(st));
  return problems;
}
