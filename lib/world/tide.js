// The tide at Sill Head. Five harmonic constituents with their true
// speeds, so springs and neaps keep step with the moon in moon.js and
// therefore with the one outside.

import { NEW_MOON } from './moon.js';
import { HOUR } from '../clock.js';

const RAD = Math.PI / 180;

// name, amplitude (m), speed (degrees per hour), phase lag (degrees)
//
// Hours are counted from a new moon. M2 and S2 are then in step at new
// moon plus the age of the tide, which here is a day and a half.
const CONSTITUENTS = [
  ['M2', 1.55, 28.9841042, 0],
  ['S2', 0.52, 30.0, 36.57],
  ['N2', 0.30, 28.4397295, 211],
  ['K1', 0.22, 15.0410686, 74],
  ['O1', 0.16, 13.9430356, 302],
];

export const MEAN = 2.8; // mean level above datum, metres

// Height of tide above datum, in metres.
export function height(t) {
  const h = (t - NEW_MOON) / HOUR;
  let z = MEAN;
  for (const [, amp, speed, lag] of CONSTITUENTS) z += amp * Math.cos((speed * h - lag) * RAD);
  return z;
}

// High and low waters between t0 and t1: [{ t, h, high }]
export function turns(t0, t1) {
  const out = [];
  const step = 180;
  let a = height(t0 - step);
  let b = height(t0);
  for (let t = t0; t < t1; t += step) {
    const c = height(t + step);
    if ((b > a && b >= c) || (b < a && b <= c)) {
      // b is the extreme sample; fit a parabola through a, b, c
      const denom = a - 2 * b + c;
      const shift = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
      const tt = t + shift * step;
      if (tt >= t0 && tt < t1) out.push({ t: tt, h: height(tt), high: b > a });
    }
    a = b;
    b = c;
  }
  return out;
}

// The largest the tide can be either side of the mean.
export const REACH = CONSTITUENTS.reduce((sum, c) => sum + c[1], 0);
