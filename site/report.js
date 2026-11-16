// The report desk: a form, and whatever answers it.
//
// Nothing is sent anywhere. A report is written after the # in the
// address of this page, where the browser keeps it to itself. The band is
// a function of the time, and lib/report.js works out the rest here, the
// same as bin/card.js does in a terminal.

import { FIELDS, examine, clipping, card, address, readAddress, stated } from '../lib/report.js';
import { ink } from '../lib/paper.js';
import { iso, hhmm, now } from '../lib/clock.js';
import { css, mix } from './ink.js';

const el = (tag, props, ...kids) => {
  const node = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null) node.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined) node.append(kid);
  return node;
};

const COLS = 360; // the clipping, in bins across
const LINES = 168; // and rows down

const form = document.getElementById('report');
const answer = document.getElementById('answer');
const begun = document.getElementById('begun');

// ---- the clipping ----------------------------------------------------------

// Print a clipping the way the receiver prints its paper: the same ink,
// the same ruled lines, and the pen where the dial was.
function paint(canvas, clip, dial) {
  const cols = clip.rows[0].length;
  const lines = clip.rows.length;
  const c = canvas.getContext('2d');
  const image = c.createImageData(cols, lines);
  const px = new Uint32Array(image.data.buffer);
  const paper = new Uint32Array(256);
  const rule = new Uint32Array(256);
  mix(paper, rule);

  const hz = (clip.hi - clip.lo) / cols;
  const dt = (clip.t1 - clip.t0) / lines;
  // A line down the paper every kilohertz, or every five where it is wide.
  const every = clip.hi - clip.lo > 24000 ? 5000 : 1000;
  const down = new Uint8Array(cols);
  for (let f = Math.ceil(clip.lo / every) * every; f < clip.hi; f += every) {
    const x = Math.round((f - clip.lo) / hz);
    if (x >= 0 && x < cols) down[x] = 1;
  }
  for (let r = 0; r < lines; r++) {
    // And a line across it wherever a five-second mark falls.
    const ta = clip.t0 + r * dt;
    const across = Math.floor(ta / 5) !== Math.floor((ta + dt) / 5);
    const row = clip.rows[r];
    for (let x = 0; x < cols; x++) {
      const i = ink(row[x]);
      px[r * cols + x] = across || down[x] ? rule[i] : paper[i];
    }
  }
  c.putImageData(image, 0, 0);

  const x = Math.round((dial - clip.lo) / hz);
  c.fillStyle = css('--pen');
  c.fillRect(x, 0, 1, lines);
}

// ---- the answer ------------------------------------------------------------

let repaint = null; // prints the clipping again, when the lamp changes

function showCard(finding) {
  const clip = clipping(finding, COLS, LINES);
  const says = card(finding, clip);
  const canvas = el('canvas', { width: COLS, height: LINES, role: 'img', 'aria-label': `A clipping of the paper: ${says.caption}.` });

  const fields = says.lines.map(([label, value]) =>
    el('div', { class: `field field-${label.toLowerCase().replace(/[^a-z]/g, '')}` }, el('dt', null, label), el('dd', null, value)),
  );

  const node = el(
    'article',
    { class: 'card', 'aria-label': `Card number ${says.number}` },
    el('header', { class: 'card-top' }, el('span', null, 'incomprehensible'), el('span', null, '6000 to 6500 kHz')),
    el(
      'div',
      { class: 'card-body' },
      el(
        'div',
        { class: 'card-what' },
        el('p', { class: says.heading.length > 3 ? 'card-id long' : 'card-id' }, says.heading),
        el('p', { class: 'card-station' }, `${says.name}, ${says.emission}`),
        el('p', { class: 'card-verdict' }, 'Your report is correct.'),
      ),
      // The caption says two things, and on a narrow card they take a line each.
      el('figure', { class: 'card-clipping' }, canvas, el('figcaption', null, says.caption.split(', ').map((part) => el('span', null, part)))),
      el('dl', { class: 'card-lines' }, fields),
    ),
    el('footer', { class: 'card-foot' }, el('span', { class: 'card-number' }, `No. ${says.number}`), el('span', null, says.keeper)),
  );

  // The report as the card states it is the address to keep.
  history.replaceState(null, '', address(stated(finding)));

  const said = el('span', { class: 'said', role: 'status' });
  const print = el('button', { type: 'button', class: 'key' }, 'Print the card');
  print.addEventListener('click', () => window.print());
  const keep = el('button', { type: 'button', class: 'key' }, 'Copy the address');
  keep.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      said.textContent = 'Address copied.';
    } catch {
      said.textContent = 'This browser will not copy it. The address is in the bar above.';
    }
  });
  const again = el('a', { href: `./?at=${iso(clip.t0 - 3)}#${(finding.hz / 1000).toFixed(2)}` }, 'Listen to it again');

  answer.replaceChildren(node, el('p', { class: 'actions' }, print, keep, again, said));
  answer.hidden = false;
  document.body.classList.add('has-card');
  repaint = () => paint(canvas, clip, finding.hz);
  repaint();
}

function showRefusal(finding) {
  answer.replaceChildren(el('div', { class: 'slip' }, el('p', null, el('strong', null, 'Not confirmed.'), ' ', finding.why)));
  answer.hidden = false;
}

function showNothing() {
  answer.replaceChildren();
  answer.hidden = true;
}

// ---- the form --------------------------------------------------------------

function showClock() {
  const t = now();
  document.getElementById('clock').textContent = `It is now ${hhmm(t)} UTC on ${iso(t).slice(0, 10)}.`;
}

// Take the report in the address, put it on the form, and answer it. One
// that was only begun, at the receiver, is left on the form for the
// listener to finish.
function read() {
  const report = readAddress(location.hash);
  for (const name of FIELDS) form.elements[name].value = report.fields[name];
  if (!report.fields.date) form.elements.date.value = iso(now()).slice(0, 10);

  repaint = null;
  document.body.classList.remove('has-card');
  begun.hidden = !report.begun || report.empty;
  if (report.empty || report.begun) return showNothing();

  const finding = examine(report.fields);
  if (finding.ok) showCard(finding);
  else showRefusal(finding);
}

// Sending a report in is going to its address.
form.addEventListener('submit', (e) => {
  e.preventDefault();
  history.pushState(null, '', address(Object.fromEntries(FIELDS.map((name) => [name, form.elements[name].value.trim()]))));
  read();
  window.scrollTo(0, 0);
});

// Going back, or to an address typed by hand, is the same.
window.addEventListener('hashchange', read);

read();
showClock();
setInterval(showClock, 10_000);

// A card is printed by daylight, whatever the lamp is doing, and the lamp
// is put back as it was afterwards.
let lampWas = null;
window.addEventListener('beforeprint', () => {
  if (lampWas === null) lampWas = document.documentElement.dataset.lamp;
  document.documentElement.dataset.lamp = 'on';
  repaint?.();
});
window.addEventListener('afterprint', () => {
  if (lampWas !== null) document.documentElement.dataset.lamp = lampWas;
  lampWas = null;
  repaint?.();
});
