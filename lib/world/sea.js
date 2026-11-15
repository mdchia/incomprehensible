// The sea areas, and the coast they are off.
//
// The map is a unit square: x runs west to east, y north to south.
// The coast does not change. It is the same hash every time.

import { unit } from '../hash.js';

export const AREAS = [
  { name: 'NORTH FETCH', x: 0.13, y: 0.15 },
  { name: 'HASK', x: 0.42, y: 0.13 },
  { name: 'MORROW', x: 0.67, y: 0.14 },
  { name: 'LATHE', x: 0.12, y: 0.43 },
  { name: 'EMBER BANK', x: 0.41, y: 0.50 },
  { name: 'THE PANS', x: 0.66, y: 0.39 },
  { name: 'SOUTH FETCH', x: 0.13, y: 0.71 },
  { name: 'TALLOW', x: 0.37, y: 0.80 },
  { name: 'SILL', x: 0.63, y: 0.66 },
  { name: 'WEND', x: 0.60, y: 0.91 },
  { name: 'QUIRE', x: 0.17, y: 0.93 },
];

export const COAST = [
  { name: 'HASK LIGHT', x: 0.42, y: 0.29 },
  { name: 'MORROW QUAY', x: 0.73, y: 0.17 },
  { name: 'SILL HEAD', x: 0.71, y: 0.62 },
  { name: 'TALLOW ROADS', x: 0.30, y: 0.67 },
];

export const PORT = 'SILL HEAD';

// The sea area nearest a point.
export function nearest(x, y) {
  let best = AREAS[0];
  let d = Infinity;
  for (const a of AREAS) {
    const dd = (a.x - x) ** 2 + (a.y - y) ** 2;
    if (dd < d) {
      d = dd;
      best = a;
    }
  }
  return best;
}

const smooth = (u) => u * u * (3 - 2 * u);

function lattice(x, y, scale) {
  const fx = x * scale;
  const fy = y * scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const ux = smooth(fx - ix);
  const uy = smooth(fy - iy);
  const v = (i, j) => unit('coast', scale, ix + i, iy + j);
  return (v(0, 0) * (1 - ux) + v(1, 0) * ux) * (1 - uy) + (v(0, 1) * (1 - ux) + v(1, 1) * ux) * uy;
}

const bump = (x, y, cx, cy, r) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r));

// Height of the ground, in no particular unit. Above zero is land.
export function ground(x, y) {
  const rough = (lattice(x, y, 5) - 0.5) * 0.5 + (lattice(x, y, 11) - 0.5) * 0.26 + (lattice(x, y, 23) - 0.5) * 0.12;
  return (
    Math.max(-0.4, (x - 0.8) * 1.5) + // a shelf, then the mainland rising to the east
    rough +
    0.42 * bump(x, y, 0.77, 0.62, 0.06) + // Sill Head
    0.62 * bump(x, y, 0.42, 0.31, 0.034) + // Hask
    0.56 * bump(x, y, 0.3, 0.685, 0.027) + // Tallow
    0.44 * bump(x, y, 0.54, 0.52, 0.016) // the Ember
  );
}

export const land = (x, y) => ground(x, y) > 0;
