#!/usr/bin/env node
// Tune to a frequency and print what a decoder would.
//
//   node bin/rx.js 6283.2                     the last two minutes
//   node bin/rx.js 6105 --at 1300 --for 4m    a moment that has been, or will be
//   node bin/rx.js 6225 --live                from now on, as it arrives
//
// The frequency is the dial frequency in kHz. Off tune, the copy suffers.

import { BAND, copy, tuned } from '../lib/band.js';
import { parse, span, iso, now } from '../lib/clock.js';
import { parseArgs, fail, kHz } from './args.js';

const args = parseArgs(undefined, ['live', 'help']);
if (args.help || !args._[0]) {
  process.stdout.write('usage: node bin/rx.js <kHz> [--at time] [--for length] [--live]\n');
  process.exit(args.help ? 0 : 2);
}

const hz = Number(args._[0]) * 1000;
if (!Number.isFinite(hz)) fail(`not a frequency: ${args._[0]}`);
if (hz < BAND.lo - 5000 || hz > BAND.hi + 5000) fail(`${kHz(hz)} kHz is off the band (${kHz(BAND.lo)} to ${kHz(BAND.hi)})`);

const note = (s) => process.stderr.write(s + '\n');
const from = args.live ? now() : args.at ? parse(args.at) : now() - span(args.for, 120);
const lock = tuned(hz, 500, from + (args.live ? 0 : span(args.for, 120)));
if (!lock) note(`${kHz(hz)} kHz. Nothing to copy here.`);
else note(`${kHz(hz)} kHz. ${lock.station.id}${lock.off ? `, ${lock.off > 0 ? '+' : ''}${Math.round(lock.off)} Hz off tune` : ''}.`);

if (args.live) {
  note('Live. Ctrl-C to stop.');
  let from = now();
  setInterval(() => {
    const to = now();
    for (const e of copy(hz, from, to)) process.stdout.write(e.s);
    from = to;
  }, 100);
} else {
  const length = span(args.for, 120);
  const start = args.at ? parse(args.at) : now() - length;
  note(`${iso(start)} for ${Math.round(length)} s.`);
  let text = '';
  for (const e of copy(hz, start, start + length)) text += e.s;
  process.stdout.write(text.replace(/\n{3,}/g, '\n\n') + (text.endsWith('\n') ? '' : '\n'));
}
