#!/usr/bin/env node
// What is on, and what is next.
//
//   node bin/sked.js                  the next hour
//   node bin/sked.js --for 6h
//   node bin/sked.js --at 2027-01-01

import { stations, dial, live } from '../lib/band.js';
import { parse, span, iso, hhmm, now } from '../lib/clock.js';
import { parseArgs, kHz } from './args.js';

const args = parseArgs();
const start = parse(args.at, now());
const length = span(args.for, 3600);

const rows = [];
for (const st of stations) {
  if (st.continuous || !st.next || !live(st, start + length)) continue;
  let t = start;
  for (let guard = 0; guard < 500; guard++) {
    const w = st.next(t);
    if (!w || w.start >= start + length) break;
    rows.push({ st, ...w });
    t = w.end + 0.001;
  }
}
rows.sort((a, b) => a.start - b.start);

const out = [];
out.push(`${iso(start)}`);
out.push('');
out.push('always');
for (const st of stations.filter((s) => s.continuous && live(s, start))) out.push(`        ${kHz(dial(st)).padStart(8)}  ${st.id}`);
out.push('');
out.push('utc          kHz  id   for');
for (const r of rows) {
  const on = r.start <= start ? ' on now' : '';
  const secs = Math.round(r.end - r.start);
  const dur = secs >= 60 ? `${Math.floor(secs / 60)}m${String(secs % 60).padStart(2, '0')}s` : `${secs}s`;
  out.push(`${hhmm(r.start)}    ${kHz(dial(r.st)).padStart(8)}  ${r.st.id.padEnd(4)} ${dur}${on}`);
}
process.stdout.write(out.join('\n') + '\n');
