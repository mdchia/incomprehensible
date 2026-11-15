// The moon. The real one, near enough: mean motion only, good to within
// a day. It is the one thing here that can be checked by going outside.

import { DAY } from '../clock.js';

export const SYNODIC = 29.530588853 * DAY;
export const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14) / 1000; // a new moon

// 0 at new, 0.5 at full, back to 1.
export const phase = (t) => ((((t - NEW_MOON) % SYNODIC) + SYNODIC) % SYNODIC) / SYNODIC;

// Days since new.
export const age = (t) => phase(t) * (SYNODIC / DAY);

// How much of the disc is lit, 0..1.
export const lit = (t) => (1 - Math.cos(2 * Math.PI * phase(t))) / 2;

const NAMES = ['NEW', 'WAXING CRESCENT', 'FIRST QUARTER', 'WAXING GIBBOUS', 'FULL', 'WANING GIBBOUS', 'LAST QUARTER', 'WANING CRESCENT'];

export const name = (t) => NAMES[Math.floor(phase(t) * 8 + 0.5) % 8];
