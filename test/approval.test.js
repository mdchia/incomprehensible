// The band as it stands meets the Standard.

import test from 'node:test';
import assert from 'node:assert/strict';
import { all, LIMITS, moments } from '../bin/approval.js';
import { stations } from '../lib/band.js';

test('type approval finds nothing wrong', async () => {
  assert.deepEqual(await all(), []);
});

test('every station is examined at the same moments each time', () => {
  for (const st of stations) assert.deepEqual(moments(st), moments(st));
});

test('the limits are not adjustable from outside', () => {
  assert.throws(() => {
    'use strict';
    LIMITS.voices = 1e9;
  });
});
