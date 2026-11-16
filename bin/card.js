#!/usr/bin/env node
// Examine a reception report, and answer a correct one with a card.
//
//   node bin/card.js 6105 --at 2026-11-15T12:00Z --copied "ZCZC R1 025 CQ CQ CQ"
//   node bin/card.js 6105 --at 1200 --copied "ZCZC R1 025 CQ CQ CQ" --to "ANYBODY"
//   node bin/rx.js 6225 --at 1215 --for 2m | node bin/card.js 6225 --at 1215
//
//   --at      when it was heard, as bin/rx.js takes it. To the minute.
//   --copied  what was copied. Left out, it is read from standard input.
//   --to      who the card is made out to
//
// Exits 0 if the report is correct and 1 if it is not. What makes a report
// correct is in lib/report.js, and in section 16 of the Standard.

import { examine, clipping, card, address, stated } from '../lib/report.js';
import { shade } from '../lib/paper.js';
import { parse, iso, hhmm } from '../lib/clock.js';
import { parseArgs, fail } from './args.js';

const args = parseArgs(undefined, ['help']);
if (args.help || !args._[0]) {
  process.stdout.write('usage: node bin/card.js <kHz> --at time [--copied text] [--to name]\n');
  process.exit(args.help ? 0 : 2);
}

let when;
try {
  when = parse(args.at === true ? undefined : args.at);
} catch (e) {
  fail(e.message);
}

let copied = typeof args.copied === 'string' ? args.copied : '';
if (!copied && !process.stdin.isTTY) {
  process.stdin.setEncoding('utf8');
  for await (const piece of process.stdin) copied += piece;
}

const fields = {
  khz: args._[0],
  date: iso(when).slice(0, 10),
  utc: hhmm(when),
  copied,
  to: typeof args.to === 'string' ? args.to : '',
};

const finding = examine(fields);
if (!finding.ok) {
  process.stdout.write(`Not confirmed. ${finding.why}\n`);
  process.exit(1);
}

// The card, typed.
const WIDE = 68;
const clip = clipping(finding, WIDE - 4, 14);
const says = card(finding, clip);
const out = [];
const rule = '+' + '-'.repeat(WIDE) + '+';
const put = (s = '') => out.push('| ' + s.padEnd(WIDE - 2).slice(0, WIDE - 2) + ' |');
const ends = (left, right) => put(left + ' '.repeat(Math.max(1, WIDE - 2 - left.length - right.length)) + right);

out.push(rule);
ends('INCOMPREHENSIBLE', '6000 to 6500 kHz');
put();
put(`${says.heading}  ${says.name}`);
put();
for (const row of clip.rows) put(' ' + shade(row));
put(' ' + says.caption);
put();
for (const [label, value] of says.lines) {
  // A long line is carried over, breaking at a space where there is one.
  let rest = value;
  let head = label;
  while (rest) {
    let cut = rest.length <= WIDE - 11 ? rest.length : rest.lastIndexOf(' ', WIDE - 11);
    if (cut <= 0) cut = WIDE - 11;
    put(`${head.padEnd(8)} ${rest.slice(0, cut)}`);
    rest = rest.slice(cut).trimStart();
    head = '';
  }
}
put(`${'No.'.padEnd(8)} ${says.number}`);
put();
ends('Your report is correct.', says.keeper);
out.push(rule);
out.push('');
out.push(address(stated(finding)));
process.stdout.write(out.join('\n') + '\n');
