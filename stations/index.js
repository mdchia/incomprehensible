// The register. One file per station, and one line here for each.
// See STANDARD.md before adding one.

import { census } from '../lib/census.js';
import { midnight } from '../lib/clock.js';

import standard from './standard.js';
import forecast from './forecast.js';
import stairs from './stairs.js';
import question from './question.js';
import chart from './chart.js';
import wanderer from './wanderer.js';
import song from './song.js';
import crossing from './crossing.js';

export const stations = [standard, forecast, stairs, question, chart, wanderer, song, crossing];

census.since = stations.map((st) => midnight(st.since));
