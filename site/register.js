// The register: what is on the band, and who has kept it.
//
// Nothing here is typed in by hand. The band plan is read off the
// stations themselves and the roll off the keepers' files, so the
// register cannot disagree with the band.

import { plan, stations, dial, BAND, QUIET } from '../lib/band.js';
import { keepers } from '../keepers/index.js';
import { dayOf, hhmm, now, setNow, parse, midnight, iso } from '../lib/clock.js';

const at = new URLSearchParams(location.search).get('at');
if (at) {
  try {
    setNow(parse(at));
  } catch {
    // Not a time. The present stays where it is.
  }
}

const el = (tag, props, ...kids) => {
  const node = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null) node.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined) node.append(kid);
  return node;
};

const kHz = (hz) => (hz / 1000).toFixed(2);
const wide = (hz) => `${(hz / 1000).toFixed(1)}`;
const tune = (hz) => `./${location.search}#${kHz(hz)}`;

// When a station sends, in a few words.
function sends(st, t) {
  if (midnight(st.since) > t) return `from ${st.since}`;
  if (st.continuous) return 'always';
  const w = st.next?.(t);
  if (!w) return 'silent';
  return w.start <= t ? `now, until ${hhmm(w.end)}` : `next at ${hhmm(w.start)}`;
}

function bandPlan(t) {
  const rows = plan().map((seg) => {
    const range = el('td', { class: 'num' }, `${kHz(seg.lo)} to ${kHz(seg.hi)}`);
    if (seg.kind === 'station') {
      const st = seg.station;
      return el(
        'tr',
        null,
        range,
        el('td', { class: 'num' }, wide(st.width)),
        el('td', null, el('a', { href: tune(dial(st)), title: `Tune to ${kHz(dial(st))} kHz` }, el('strong', null, st.id))),
        el('td', null, st.name),
        el('td', null, st.emission),
        el('td', null, sends(st, t)),
        el('td', { class: 'num' }, String(st.keeper)),
        el('td', null, st.since),
      );
    }
    const quiet = seg.kind === 'quiet';
    return el(
      'tr',
      { class: quiet ? 'quiet' : 'free' },
      range,
      el('td', { class: 'num' }, wide(seg.hi - seg.lo)),
      el('td', null, ''),
      el('td', { colspan: '5' }, quiet ? [el('a', { href: tune(seg.lo), title: `Tune to ${kHz(seg.lo)} kHz` }, 'Quiet segment'), '. Nothing is sent here.'] : 'Unassigned.'),
    );
  });
  const head = ['kHz', 'Width', 'ID', 'Station', 'Emission', 'Sends', 'Keeper', 'Since'];
  return el(
    'div',
    { class: 'scroll' },
    el(
      'table',
      null,
      el('thead', null, el('tr', null, head.map((h, i) => el('th', { scope: 'col', class: i < 2 || i === 6 ? 'num' : null }, h)))),
      el('tbody', null, rows),
    ),
  );
}

function roll() {
  const rows = keepers.map((k) => {
    const theirs = stations.filter((st) => st.keeper === k.n).map((st) => st.id);
    return el(
      'tr',
      null,
      el('td', { class: 'num' }, String(k.n)),
      el('td', null, k.hand),
      el('td', null, k.since),
      el('td', null, theirs.length ? theirs.join(' ') : '-'),
      el('td', null, 'On file.'),
    );
  });
  const head = ['No.', 'Hand', 'On watch', 'Put up', 'Mark'];
  return el(
    'div',
    { class: 'scroll' },
    el('table', null, el('thead', null, el('tr', null, head.map((h, i) => el('th', { scope: 'col', class: i === 0 ? 'num' : null }, h)))), el('tbody', null, rows)),
  );
}

function draw() {
  const sheet = document.getElementById('sheet');
  const t = now();
  const used = stations.reduce((sum, st) => sum + st.width, 0);
  const free = BAND.hi - BAND.lo - used - (QUIET.hi - QUIET.lo);
  const day = dayOf(t);
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  sheet.replaceChildren(
    el('h1', null, 'Register'),
    el(
      'p',
      null,
      `The band as it stood at ${hhmm(t)} UTC on ${iso(t).slice(0, 10)}, `,
      day >= 0 ? `day ${day}.` : `${count(-day, 'day', 'days')} before first carrier.`,
    ),
    el('h2', { id: 'band' }, 'The band'),
    bandPlan(t),
    el('p', null, `${count(stations.length, 'station', 'stations')}. ${(free / 1000).toFixed(1)} kHz unassigned. An ID is a link: it puts the receiver on that station.`),
    el('h2', { id: 'roll' }, 'The roll'),
    roll(),
    el(
      'p',
      null,
      `${count(keepers.length, 'keeper', 'keepers')}. Marks are held on file and are not shown. Where they are kept is in `,
      el('a', { href: 'standard.html#8-the-floor' }, 'the Standard, section 8'),
      '.',
    ),
    el('h2', { id: 'purpose' }, 'Purpose'),
    el('p', null, 'See ', el('a', { href: tune(6_283_200) }, '6283.2 kHz'), '.'),
  );
}

draw();
setInterval(draw, 30_000);
