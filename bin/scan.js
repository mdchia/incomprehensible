#!/usr/bin/env node
// Print a strip of paper. Earliest at the top, as it comes off the roll.
//
//   node bin/scan.js                          the whole band, the last minute
//   node bin/scan.js 6283.2                   12 kHz around a frequency
//   node bin/scan.js 6340 --span 12 --at 1310 --for 30s --row 0.3
//   node bin/scan.js --from 6400 --to 6440 --for 1d --row 20m
//
//   --at     when the strip starts (default: one strip-length ago)
//   --for    how long it runs (default 60s)
//   --row    how much time each printed row covers (default: for / 40)
//   --span   kHz across (default 12 with a frequency, the whole band without)
//   --cols   characters across (default 100)

import { BAND, onAir } from '../lib/band.js';
import { rowOf, shade } from '../lib/paper.js';
import { parse, span, iso, now } from '../lib/clock.js';
import { parseArgs, fail } from './args.js';

const args = parseArgs();
if (args.help) {
  process.stdout.write('usage: node bin/scan.js [kHz] [--span kHz | --from kHz --to kHz] [--at time] [--for length] [--row length] [--cols n]\n');
  process.exit(0);
}

const cols = Number(args.cols || 100);
let lo = BAND.lo;
let hi = BAND.hi;
if (args.from || args.to) {
  lo = Number(args.from ?? BAND.lo / 1000) * 1000;
  hi = Number(args.to ?? BAND.hi / 1000) * 1000;
} else if (args._[0]) {
  const centre = Number(args._[0]) * 1000;
  const width = Number(args.span || 12) * 1000;
  lo = centre - width / 2;
  hi = centre + width / 2;
}
if (!(hi > lo)) fail('nothing between those frequencies');

const length = span(args.for, 60);
const dt = span(args.row, length / 40);
const start = args.at ? parse(args.at) : now() - length;
const hz = (hi - lo) / cols;
const rows = Math.max(1, Math.round(length / dt));

// A row that covers a long time is sampled, not summed: a few short
// looks spread across it. Otherwise an hour of ticks would be a smear.
const looks = dt > 2 ? 8 : 1;
const glance = dt > 2 ? 0.25 : dt;

const scale = (() => {
  const marks = new Array(cols).fill(' ');
  const stepK = [0.5, 1, 2, 5, 10, 20, 50, 100].find((s) => ((hi - lo) / 1000 / s) * 9 <= cols) || 100;
  let line = '';
  for (let k = Math.ceil(lo / 1000 / stepK) * stepK; k <= hi / 1000; k += stepK) {
    const x = Math.round(((k * 1000 - lo) / (hi - lo)) * cols);
    if (x >= 0 && x < cols) marks[x] = '|';
    const label = String(Number(k.toFixed(1)));
    if (x + label.length + 1 < cols && x + 1 >= line.length) line = line.padEnd(x + 1) + label;
  }
  return { ticks: marks.join(''), labels: line };
})();

const out = [];
out.push(`${' '.repeat(10)}${scale.labels}`);
out.push(`${' '.repeat(10)}${scale.ticks}`);
const row = new Float32Array(cols);
const sum = new Float32Array(cols);
for (let r = 0; r < rows; r++) {
  const t = start + r * dt;
  sum.fill(0);
  for (let k = 0; k < looks; k++) {
    const tt = t + (k * dt) / looks;
    rowOf(row, onAir(tt, tt + glance, lo, hi), tt, glance, lo, hz);
    for (let i = 0; i < cols; i++) sum[i] = Math.max(sum[i], row[i]);
  }
  out.push(`${iso(t).slice(11, 19)}  ${shade(sum)}`);
}
out.push(`${' '.repeat(10)}${scale.ticks}`);
out.push(`${' '.repeat(10)}${iso(start)} for ${Math.round(length)} s, ${(hz).toFixed(0)} Hz a column`);
process.stdout.write(out.join('\n') + '\n');
