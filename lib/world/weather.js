// The weather over the sea areas.
//
// Pressure systems are born off the western edge of the map every twenty
// hours or so, cross it over several days, deepen, fill, and leave to the
// east. Everything else - wind, rain, what the teleprinter says and what
// the chart shows - is read off the pressure field they make, so the
// stations that report it cannot disagree with each other.

import { unit, between } from '../hash.js';
import { HOUR, DAY } from '../clock.js';
import { nearest } from './sea.js';

const SPAWN = 20 * HOUR;
const LONGEST = 6.2 * DAY;

function system(k) {
  const life = between(3.4, 6.2, 'wx', k, 1) * DAY;
  const born = k * SPAWN + between(-4, 4, 'wx', k, 2) * HOUR;
  const low = unit('wx', k, 3) < 0.64;
  const depth = low ? -between(9, 35, 'wx', k, 4) : between(8, 20, 'wx', k, 4);
  const sigma = low ? between(0.13, 0.24, 'wx', k, 5) : between(0.2, 0.34, 'wx', k, 5);
  const y0 = between(0.05, 0.95, 'wx', k, 6);
  const dy = between(-0.35, 0.35, 'wx', k, 7);
  const wobble = between(0.03, 0.09, 'wx', k, 8);
  const turns = between(0.8, 2.2, 'wx', k, 9);
  const ph = between(0, 2 * Math.PI, 'wx', k, 10);
  return {
    k,
    low,
    sigma,
    // Where it is and how strong, at time t. Null before birth and after death.
    at(t) {
      const u = (t - born) / life;
      if (u < 0 || u > 1) return null;
      return {
        x: -0.3 + 1.6 * u,
        y: y0 + dy * u + wobble * Math.sin(2 * Math.PI * turns * u + ph),
        strength: depth * Math.sin(Math.PI * u) ** 1.2,
      };
    },
  };
}

const made = new Map();
function get(k) {
  let s = made.get(k);
  if (!s) {
    s = system(k);
    made.set(k, s);
    if (made.size > 64) made.delete(made.keys().next().value);
  }
  return s;
}

// The systems alive at t: [{ k, low, sigma, x, y, strength }]
export function systems(t) {
  const out = [];
  const k1 = Math.floor((t + 4 * HOUR) / SPAWN);
  const k0 = Math.floor((t - LONGEST - 4 * HOUR) / SPAWN);
  for (let k = k0; k <= k1; k++) {
    const s = get(k);
    const now = s.at(t);
    if (now) out.push({ k, low: s.low, sigma: s.sigma, ...now });
  }
  return out;
}

// A field you can sample many times at one moment without recomputing
// where the systems are.
export function field(t) {
  const alive = systems(t);
  return (x, y) => {
    let p = 1013 + 6 * (y - 0.5);
    for (const s of alive) {
      p += s.strength * Math.exp(-((x - s.x) ** 2 + (y - s.y) ** 2) / (2 * s.sigma * s.sigma));
    }
    return p;
  };
}

// Pressure in hPa at one place and time.
export const pressure = (x, y, t) => field(t)(x, y);

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (deg) => POINTS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

const BEAUFORT = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
export function beaufort(ms) {
  let f = 0;
  while (f < 12 && ms >= BEAUFORT[f]) f++;
  return f;
}

// Metres per second of surface wind per hPa of gradient across the map,
// and the speed the wind here never quite reaches.
const DRAG = 0.19;
const CEILING = 27;
const INFLOW = (20 * Math.PI) / 180;

// Wind at a place and time: { from (degrees), speed (m/s), force }
export function wind(x, y, t, p = field(t)) {
  const h = 0.012;
  const gx = (p(x + h, y) - p(x - h, y)) / (2 * h);
  const gn = -(p(x, y + h) - p(x, y - h)) / (2 * h); // northward
  // Along the isobars with low pressure to the left, turned a little
  // toward the low by friction.
  const east = DRAG * (Math.cos(INFLOW) * -gn + Math.sin(INFLOW) * -gx);
  const north = DRAG * (Math.cos(INFLOW) * gx + Math.sin(INFLOW) * -gn);
  const speed = CEILING * Math.tanh(Math.hypot(east, north) / CEILING);
  const from = ((Math.atan2(-east, -north) * 180) / Math.PI + 360) % 360;
  return { from, speed, force: beaufort(speed) };
}

// Change in pressure over the last three hours, hPa.
export const tendency = (x, y, t) => pressure(x, y, t) - pressure(x, y, t - 3 * HOUR);

export function tendencyWord(dp) {
  const mag = Math.abs(dp);
  if (mag < 0.4) return 'STEADY';
  const way = dp < 0 ? 'FALLING' : 'RISING';
  if (mag < 1.6) return `${way} SLOWLY`;
  if (mag < 3.6) return way;
  return `${way} QUICKLY`;
}

// What the sky is doing: { weather, visibility }
export function sky(x, y, t) {
  let wet = 0;
  let calm = 0;
  for (const s of systems(t)) {
    const d2 = (x - s.x) ** 2 + (y - s.y) ** 2;
    if (s.low) wet += (-s.strength / 14) * Math.exp(-d2 / (2 * (1.35 * s.sigma) ** 2));
    else calm += (s.strength / 12) * Math.exp(-d2 / (2 * s.sigma ** 2));
  }
  const w = wind(x, y, t);
  const six = Math.floor(t / (6 * HOUR));
  const whim = unit('sky', Math.round(x * 100), Math.round(y * 100), six);
  if (wet > 1.5) return { weather: whim < 0.2 ? 'THUNDERY RAIN' : 'RAIN', visibility: whim < 0.45 ? 'POOR' : 'MODERATE' };
  if (wet > 0.9) return { weather: whim < 0.5 ? 'RAIN AT TIMES' : 'SHOWERS', visibility: 'MODERATE' };
  if (wet > 0.45) return { weather: whim < 0.4 ? 'DRIZZLE' : 'SHOWERS', visibility: whim < 0.3 ? 'MODERATE' : 'GOOD' };
  if (calm > 0.8 && w.force <= 3) return whim < 0.45 ? { weather: 'FOG PATCHES', visibility: 'VERY POOR' } : { weather: 'FAIR', visibility: 'MODERATE' };
  return { weather: whim < 0.25 ? 'MAINLY FAIR' : 'FAIR', visibility: 'GOOD' };
}

// The systems worth mentioning, most important first.
export function synopsis(t) {
  const p = field(t);
  const notable = [];
  for (const s of systems(t)) {
    if (Math.abs(s.strength) < 7 || s.x < -0.08 || s.x > 1.08 || s.y < -0.1 || s.y > 1.1) continue;
    const later = get(s.k).at(t + 3 * HOUR);
    const dx = later ? later.x - s.x : 0;
    const dy = later ? later.y - s.y : 0;
    const moving = Math.hypot(dx, dy) < 0.012 ? null : compass((Math.atan2(dx, -dy) * 180) / Math.PI);
    const growing = later ? Math.abs(later.strength) - Math.abs(s.strength) : 0;
    let trend = null;
    if (growing > 0.35) trend = s.low ? 'DEEPENING' : 'BUILDING';
    else if (growing < -0.35) trend = s.low ? 'FILLING' : 'DECLINING';
    notable.push({
      low: s.low,
      x: s.x,
      y: s.y,
      strength: s.strength,
      pressure: Math.round(p(s.x, s.y)),
      area: nearest(Math.min(1, Math.max(0, s.x)), Math.min(1, Math.max(0, s.y))).name,
      moving,
      trend,
    });
  }
  notable.sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength));

  // Two centres of the same kind close together are one complex system.
  const out = [];
  for (const s of notable) {
    const twin = out.find((o) => o.low === s.low && Math.hypot(o.x - s.x, o.y - s.y) < 0.16);
    if (twin) twin.complex = true;
    else out.push(s);
  }
  return out;
}
