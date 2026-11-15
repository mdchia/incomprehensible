// R1. The sea area forecast, by teleprinter, on the hour and the half.
//
// Between bulletins the carrier idles on mark and sends a line of RY
// every minute so that anyone tuning has something to tune to.

import { cycle } from '../lib/cycle.js';
import { teleprint, idle } from '../lib/modes/rtty.js';
import { utc, pad, dtg, hhmm, HOUR, DAY, EPOCH } from '../lib/clock.js';
import { AREAS, COAST, PORT } from '../lib/world/sea.js';
import { field, wind, sky, synopsis, compass, pressure, tendency, tendencyWord } from '../lib/world/weather.js';
import { turns } from '../lib/world/tide.js';
import * as moon from '../lib/world/moon.js';

const STRONG = { 8: 'GALE', 9: 'SEVERE GALE', 10: 'STORM', 11: 'VIOLENT STORM', 12: 'HURRICANE FORCE' };

// The wind in one area over the next twelve hours, as it is said.
function windPhrase(a, t) {
  const w = [0, 6, 12].map((h) => wind(a.x, a.y, t + h * HOUR));
  const lo = Math.min(...w.map((x) => x.force));
  const hi = Math.max(...w.map((x) => x.force));
  if (hi <= 3 && lo <= 2) return `VARIABLE ${Math.max(hi, 2)} OR LESS`;

  const from = compass(w[0].from);
  const to = compass(w[2].from);
  let out = from;
  if (hi >= 8) out += ` ${Math.min(lo, 7)} TO ${STRONG[hi]} ${hi}`;
  else out += hi > lo ? ` ${lo} TO ${hi}` : ` ${lo}`;
  if (to !== from) {
    const turn = ((w[2].from - w[0].from + 540) % 360) - 180;
    out += `${turn > 0 ? ' VEERING' : ' BACKING'} ${to}`;
  }
  return out;
}

// Bulletins are numbered from first carrier. The one at 0000 that day was 001.
export const serial = (t) => Math.floor((t - EPOCH) / 1800) + 1;

// The whole bulletin for issue time t, as lines.
export function bulletin(t) {
  const lines = [];
  lines.push(`ZCZC R1 ${pad(serial(t), 3)}`);
  lines.push('CQ CQ CQ DE R1 R1 R1');
  lines.push(`SEA AREA FORECAST ISSUED ${dtg(t)}`);
  lines.push('');

  const gales = AREAS.filter((a) => [0, 6, 12].some((h) => wind(a.x, a.y, t + h * HOUR).force >= 8));
  lines.push(gales.length ? `GALE WARNINGS: ${gales.map((a) => a.name).join(', ')}.` : 'NO GALE WARNINGS.');
  lines.push('');

  lines.push('GENERAL SITUATION');
  const sys = synopsis(t).slice(0, 3);
  if (!sys.length) lines.push('SLACK PRESSURE ALL AREAS.');
  for (const s of sys) {
    let line = `${s.complex ? 'COMPLEX ' : ''}${s.low ? 'LOW' : 'HIGH'} ${s.pressure} ${s.area}`;
    line += s.moving ? ` MOVING ${s.moving}` : ' SLOW MOVING';
    if (s.trend) line += ` AND ${s.trend}`;
    lines.push(line + '.');
  }
  lines.push('');

  for (const a of AREAS) {
    const s = sky(a.x, a.y, t + 3 * HOUR);
    lines.push(`${a.name}. ${windPhrase(a, t)}. ${s.weather}. ${s.visibility}.`);
  }
  lines.push('');

  lines.push(`COASTAL REPORTS ${hhmm(t)}Z`);
  const p = field(t);
  for (const c of COAST) {
    const w = wind(c.x, c.y, t, p);
    const blow = w.force === 0 ? 'CALM' : `${compass(w.from)} ${w.force}`;
    lines.push(`${c.name}. ${blow}. ${Math.round(pressure(c.x, c.y, t))} ${tendencyWord(tendency(c.x, c.y, t))}.`);
  }
  lines.push('');

  const day = Math.floor(t / DAY) * DAY;
  lines.push(`TIDES ${PORT} ${pad(utc(t).date)} ${utc(t).mon}`);
  lines.push(turns(day, day + DAY).map((x) => `${x.high ? 'HW' : 'LW'} ${hhmm(x.t)} ${x.h.toFixed(1)}`).join(' / '));
  lines.push(`MOON ${moon.name(t)} AGE ${pad(Math.floor(moon.age(t)))}`);
  lines.push('');

  lines.push(`NEXT ISSUE ${hhmm(t + 1800)}Z`);
  lines.push('NNNN');
  return lines;
}

const RY = 'RYRYRYRYRYRYRYRYRYRYRYRYRYRYRYRY DE R1\r\n';

const half = cycle({
  period: 1800,
  build(n, start) {
    const strokes = [];
    const copy = [];
    let t = start;

    const mark = (until) => {
      if (until > t + 1e-6) strokes.push(idle(t, until));
      t = until;
    };
    const send = (text) => {
      const p = teleprint(text, { t0: t });
      strokes.push(...p.strokes);
      copy.push(...p.copy);
      t = p.end;
    };

    mark(start + 2);
    send('\r\n\r\n' + bulletin(start).join('\r\n') + '\r\n\r\n');

    // Idle to the end of the half hour, with a test line on each minute.
    for (let m = Math.ceil((t + 5 - start) / 60) * 60; m < 1800; m += 60) {
      mark(start + m);
      send(RY);
    }
    mark(start + 1800);

    return { strokes, copy, start, end: start + 1800 };
  },
});

// For the schedule: the bulletin itself, not the idling after it.
const ends = new Map();
function bulletinEnd(k) {
  if (!ends.has(k)) {
    const text = '\r\n\r\n' + bulletin(k * 1800).join('\r\n') + '\r\n\r\n';
    ends.set(k, teleprint(text, { t0: k * 1800 + 2 }).end);
    if (ends.size > 8) ends.delete(ends.keys().next().value);
  }
  return ends.get(k);
}

function next(t) {
  const n = Math.floor(t / 1800);
  for (const k of [n, n + 1]) {
    const end = bulletinEnd(k);
    if (end > t) return { start: k * 1800, end };
  }
  return null;
}

export default {
  id: 'R1',
  name: 'the Forecast',
  kHz: 6105.0,
  width: 3000,
  emission: 'teleprinter',
  keeper: 1,
  since: '2026-11-15',
  strokes: half.strokes,
  copy: half.copy,
  next,
};
