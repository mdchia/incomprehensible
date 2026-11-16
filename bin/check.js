#!/usr/bin/env node
// Type approval. Run this before you leave.
//
//   node bin/check.js
//
// Exits 0 if the band meets the Standard, 1 if it does not.

import { stations, dial, QUIET } from '../lib/band.js';
import { keepers } from '../keepers/index.js';
import { traffic } from '../traffic/index.js';
import { statement } from '../statement.js';
import { register, roll, purpose, messages, logbook, reports, emissions } from './approval.js';
import { kHz } from './args.js';

const out = [];
let failed = 0;
const report = (label, problems) => {
  out.push(`${problems.length ? 'FAIL' : 'ok  '}  ${label}`);
  for (const p of problems) out.push(`        ${p}`);
  failed += problems.length;
};

report('register', await register());
for (const st of [...stations].sort((a, b) => a.kHz - b.kHz)) {
  report(`${String(st.id).padEnd(3)} ${kHz(dial(st)).padStart(8)} kHz  ${(st.width / 1000).toFixed(1).padStart(5)} kHz wide  ${st.emission}`, emissions(st));
}
report(`quiet segment ${kHz(QUIET.lo)} to ${kHz(QUIET.hi)} kHz`, []);
report(`roll (${keepers.length} keeper${keepers.length === 1 ? '' : 's'})`, await roll());
report(`statement (${statement.length} sentence${statement.length === 1 ? '' : 's'})`, purpose());
report(`traffic (${traffic.length} item${traffic.length === 1 ? '' : 's'})`, messages());
report('logbook', logbook());
report('reports and cards', reports());

out.push('');
out.push(failed ? `${failed} problem${failed === 1 ? '' : 's'}. Not approved.` : 'Approved.');
process.stdout.write(out.join('\n') + '\n');
process.exit(failed ? 1 : 0);
