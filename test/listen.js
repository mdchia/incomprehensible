// Things the tests need in order to listen.

import { copy } from '../lib/band.js';
import { parse } from '../lib/clock.js';

// A moment, from a string: at('2026-11-15T12:00Z')
export const at = (s) => parse(s);

// What a decoder tuned to kHz prints for `seconds` from `when`.
export function heard(kHz, when, seconds) {
  const t = typeof when === 'string' ? at(when) : when;
  return copy(Math.round(kHz * 1000), t, t + seconds).map((e) => e.s).join('');
}

// How much of `samples` is a tone at hz (Goertzel), as power per sample.
export function tone(samples, rate, hz) {
  const w = (2 * Math.PI * hz) / rate;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const s0 = samples[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return (s1 * s1 + s2 * s2 - c * s1 * s2) / (samples.length * samples.length);
}
