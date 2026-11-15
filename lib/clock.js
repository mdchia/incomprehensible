// Time on the band is UTC, in seconds since the Unix epoch, as a number.
// There is no other clock.

export const MINUTE = 60;
export const HOUR = 3600;
export const DAY = 86400;

// The frame. Thirty seconds. Several things on the band repeat on it.
export const FRAME = 30;

// First carrier.
export const EPOCH = Date.UTC(2026, 10, 15) / 1000;

// The present. It can be moved: any moment can be listened to again,
// or ahead of time.
let skew = 0;
export const now = () => Date.now() / 1000 + skew;
export const setNow = (t) => {
  skew = t - Date.now() / 1000;
};

// Whole days since first carrier. Day 0 is 2026-11-15.
export const dayOf = (t) => Math.floor((t - EPOCH) / DAY);

// The moment a date begins. Anything with a date on it - a station, a
// keeper, a sentence, an item of traffic - counts from 0000 UTC that day
// and not before, so that adding to the band never changes what it sent.
export const midnight = (date) => Date.parse(date + 'T00:00:00Z') / 1000;

export const pad = (n, w = 2) => String(Math.trunc(n)).padStart(w, '0');

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function utc(t) {
  const d = new Date(Math.floor(t) * 1000);
  const year = d.getUTCFullYear();
  return {
    year,
    month: d.getUTCMonth() + 1,
    mon: MONTHS[d.getUTCMonth()],
    date: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    doy: Math.floor((Date.UTC(year, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(year, 0, 1)) / 86400000) + 1,
  };
}

// "1342"
export function hhmm(t) {
  const u = utc(t);
  return pad(u.hour) + pad(u.minute);
}

// "151342Z NOV" - date-time group
export function dtg(t) {
  const u = utc(t);
  return `${pad(u.date)}${pad(u.hour)}${pad(u.minute)}Z ${u.mon}`;
}

// "2026-11-15T13:42:07Z"
export const iso = (t) => new Date(Math.floor(t) * 1000).toISOString().slice(0, 19) + 'Z';

// Parse a moment from the command line.
//   now | +90s | -2h | +3d | 2026-11-15T13:00Z | 2026-11-15 | 1342 (today, UTC)
export function parse(str, base = now()) {
  if (str === undefined || str === null || str === '' || str === 'now') return base;
  const rel = /^([+-])(\d+(?:\.\d+)?)([smhd])$/.exec(str);
  if (rel) {
    const unit = { s: 1, m: MINUTE, h: HOUR, d: DAY }[rel[3]];
    return base + (rel[1] === '-' ? -1 : 1) * Number(rel[2]) * unit;
  }
  if (/^\d{4}$/.test(str)) {
    const midnight = Math.floor(base / DAY) * DAY;
    return midnight + Number(str.slice(0, 2)) * HOUR + Number(str.slice(2)) * MINUTE;
  }
  let s = str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00Z';
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) s += 'Z';
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(s)) s = s.slice(0, -1) + ':00Z';
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) throw new Error(`not a time: ${str}`);
  return ms / 1000;
}

// Parse a length of time: 90 | 90s | 15m | 2h | 1d
export function span(str, fallback) {
  if (str === undefined || str === null || str === '') return fallback;
  const m = /^(\d+(?:\.\d+)?)([smhd]?)$/.exec(str);
  if (!m) throw new Error(`not a duration: ${str}`);
  return Number(m[1]) * ({ '': 1, s: 1, m: MINUTE, h: HOUR, d: DAY }[m[2]]);
}
