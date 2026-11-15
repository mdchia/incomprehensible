#!/usr/bin/env node
// Record the loudspeaker to a WAV file.
//
//   node bin/tape.js 6283.2                       the last 30 seconds, to tape.wav
//   node bin/tape.js 6470 --at 1255 --for 10s
//   node bin/tape.js 6105 --at 1200 --for 1m --out forecast.wav --clean
//
//   --at     when the recording starts (default: one recording-length ago)
//   --for    how long it runs (default 30s, at most 10m)
//   --out    where to write it (default tape.wav, wherever you are standing)
//   --rate   samples a second (default 16000)
//   --clean  leave the noise out
//
// It is the same loudspeaker the browser uses (site/worklet.js), so what
// is on the tape is what would have been heard. The same tape twice is
// the same file twice.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BAND, tuned } from '../lib/band.js';
import { parse, span, iso, now } from '../lib/clock.js';
import { record, wav } from './recorder.js';
import { parseArgs, fail, kHz } from './args.js';

const args = parseArgs(undefined, ['clean', 'help']);
if (args.help || !args._[0]) {
  process.stdout.write('usage: node bin/tape.js <kHz> [--at time] [--for length] [--out file.wav] [--rate n] [--clean]\n');
  process.exit(args.help ? 0 : 2);
}

const hz = Number(args._[0]) * 1000;
if (!Number.isFinite(hz)) fail(`not a frequency: ${args._[0]}`);
if (hz < BAND.lo - 5000 || hz > BAND.hi + 5000) fail(`${kHz(hz)} kHz is off the band (${kHz(BAND.lo)} to ${kHz(BAND.hi)})`);

const rate = Math.round(Number(args.rate || 16000));
if (!(rate >= 8000 && rate <= 96000)) fail('rate must be between 8000 and 96000');
const length = span(args.for, 30);
if (!(length > 0 && length <= 600)) fail('a tape runs for ten minutes at most');
const start = args.at ? parse(args.at) : now() - length;
const out = resolve(typeof args.out === 'string' ? args.out : 'tape.wav');

const lock = tuned(hz, 500, start + length);
const samples = record(hz, start, length, rate, args.clean ? 0 : 1);
writeFileSync(out, wav(samples, rate));

let peak = 0;
for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > peak) peak = Math.abs(samples[i]);
process.stdout.write(`${kHz(hz)} kHz${lock ? `, ${lock.station.id}` : ''}. ${iso(start)} for ${Math.round(length)} s.\n${out}\n${peak < 0.02 ? 'Nothing on the tape but tape.\n' : ''}`);
