#!/usr/bin/env node
// Add up frames.
//
// The paper is cut into lengths of one frame and the lengths are laid on
// top of each other. Anything that repeats on the frame stays where it is
// and anything that does not averages away. Left long enough, the noise
// goes flat and what is under it shows.
//
//   node bin/integrate.js                      the quiet segment, 60 frames
//   node bin/integrate.js --frames 1           not long enough
//   node bin/integrate.js --frames 8           long enough to suspect
//   node bin/integrate.js --frames 400         more than long enough
//   node bin/integrate.js --from 6000 --to 6002 --frames 6
//
//   --frames  how many frames to add up (default 60; a frame is 30 s)
//   --at      when to start (default: far enough back to end now)
//   --wide    print each cell twice across, so that squares look square
//
// Each character is one cell: half a second down, 125 Hz across.

import { QUIET, onAir } from '../lib/band.js';
import { rowOf } from '../lib/paper.js';
import { CELL } from '../lib/floor.js';
import { FRAME, parse, iso, now } from '../lib/clock.js';
import { parseArgs, fail, kHz } from './args.js';

const args = parseArgs(undefined, ['wide', 'help']);
if (args.help) {
  process.stdout.write('usage: node bin/integrate.js [--from kHz --to kHz] [--frames n] [--at time] [--wide]\n');
  process.exit(0);
}

const lo = args.from ? Number(args.from) * 1000 : QUIET.lo;
const hi = args.to ? Number(args.to) * 1000 : QUIET.hi;
if (!(hi > lo)) fail('nothing between those frequencies');
const frames = Math.max(1, Math.round(Number(args.frames || 60)));
const first = Math.floor((args.at ? parse(args.at) : now() - frames * FRAME) / FRAME) * FRAME;

// Look five times finer than a cell each way, then add the looks up.
const FINE = 5;
const dt = CELL.t / FINE;
const hz = CELL.f / FINE;
const cols = Math.ceil((hi - lo) / CELL.f);
const rows = Math.round(FRAME / CELL.t);
const bins = cols * FINE;

const sum = Array.from({ length: rows }, () => new Float64Array(cols));
const row = new Float32Array(bins);
for (let n = 0; n < frames; n++) {
  const t0 = first + n * FRAME;
  const strokes = onAir(t0, t0 + FRAME, lo, hi);
  for (let r = 0; r < rows * FINE; r++) {
    rowOf(row, strokes, t0 + r * dt, dt, lo, hz);
    const into = sum[Math.floor(r / FINE)];
    for (let i = 0; i < bins; i++) into[Math.floor(i / FINE)] += row[i];
  }
}

// Noise power averaged over n looks has a mean of 1 and a spread of
// 1/sqrt(n). Print how far above the flat floor each cell stands, in
// units of that spread. What is real climbs as frames are added. What is
// not stays where it was.
const SHADES = ' .:-=+*#%@';
const looks = frames * FINE * FINE;
const out = [];
out.push(`${kHz(lo)} to ${kHz(hi)} kHz, ${frames} frame${frames === 1 ? '' : 's'} from ${iso(first)}`);
const rule = '+' + '-'.repeat(cols * (args.wide ? 2 : 1)) + '+';
out.push(rule);
for (let r = 0; r < rows; r++) {
  let line = '';
  for (let i = 0; i < cols; i++) {
    const z = (sum[r][i] / looks - 1) * Math.sqrt(looks);
    const ch = SHADES[Math.max(0, Math.min(SHADES.length - 1, Math.floor(z - 1)))];
    line += args.wide ? ch + ch : ch;
  }
  out.push(`|${line}|${r % 10 === 0 ? ` ${r * CELL.t}s` : ''}`);
}
out.push(rule);
process.stdout.write(out.join('\n') + '\n');
