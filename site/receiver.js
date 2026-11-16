// The receiver.
//
// It draws the band on paper, newest at the bottom, and puts whatever is
// in the passband through the loudspeaker. It knows nothing about any
// station; it asks lib/band.js what is on the air and renders that.

import { BAND, QUIET, PASSBAND, stations, dial as dialOf, onAir, copy as decode, tuned as tunedAt, sked, live } from '../lib/band.js';
import { rowOf, ink } from '../lib/paper.js';
import { css, mix } from './ink.js';
import { CELL } from '../lib/floor.js';
import { FRAME, dayOf, pad, utc, hhmm, iso, now, setNow, parse } from '../lib/clock.js';
import { address } from '../lib/report.js';

const $ = (id) => document.getElementById(id);

// The station under a frequency, counting only those on the air by now.
const tuned = (hz) => tunedAt(hz, 500, now());
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const ROW = 0.05; // seconds of paper per row
const STEP = 10; // Hz; the finest step of the dial
const SPANS = [3000, 6000, 12000, 24000, 48000];
const HOME = 6_283_200; // where the dial rests the first time

// ---- state -------------------------------------------------------------

// `span` is what the paper shows. `chosen` is the span last picked by hand;
// jumping to a station too wide for it borrows a wider one for the visit.
const state = { dial: HOME, span: 6000, chosen: 6000, lamp: true, volume: 0.7, sound: false, integrate: false };

const store = {
  read() {
    try {
      return JSON.parse(localStorage.getItem('receiver') || '{}');
    } catch {
      return {};
    }
  },
  write() {
    try {
      localStorage.setItem('receiver', JSON.stringify({ dial: state.dial, span: state.chosen, lamp: state.lamp, volume: state.volume }));
    } catch {
      // No storage. The dial will not be remembered.
    }
  },
};

function fromHash() {
  const m = /^#(\d{4}(?:\.\d{1,2})?)$/.exec(location.hash);
  return m ? Number(m[1]) * 1000 : null;
}

// ?at=2026-11-15T12:10Z moves the present. Everything on the band is a
// function of the time, so any moment can be had again.
{
  const at = new URLSearchParams(location.search).get('at');
  if (at) {
    try {
      setNow(parse(at));
    } catch {
      // Not a time. The present stays where it is.
    }
  }
}

{
  const saved = store.read();
  if (Number.isFinite(saved.dial)) state.dial = saved.dial;
  if (SPANS.includes(saved.span)) state.span = state.chosen = saved.span;
  if (Number.isFinite(saved.volume)) state.volume = clamp(saved.volume, 0, 1);
  state.lamp = typeof saved.lamp === 'boolean' ? saved.lamp : !window.matchMedia('(prefers-color-scheme: dark)').matches;
  const h = fromHash();
  if (h !== null) state.dial = h;
  state.dial = clamp(Math.round(state.dial / STEP) * STEP, BAND.lo, BAND.hi);
}

// ---- elements ----------------------------------------------------------

const well = $('well');
const paper = $('paper');
const ctx = paper.getContext('2d', { alpha: false });
const pen = $('pen');
const passband = $('passband');
const head = $('head');
const exposure = $('exposure');
const rail = $('rail');
const strip = $('strip');

let W = 0; // paper width in bins, which are also pixels
let H = 0; // paper height in rows
const view = { lo: 0, hz: 1 }; // frequency of the left edge, and Hz per bin

let row = new Float32Array(1);
let lineImage = null;
let linePx = null;
let fullImage = null;
let fullPx = null;
let rules = new Uint8Array(1); // which columns carry a printed line
let feedT = 0; // time of the next row to print

const nib = () => 3.2 * view.hz; // lines are drawn at least this wide, in Hz

const xOf = (hz) => (hz - view.lo) / view.hz;
const hzAt = (x) => view.lo + x * view.hz;

// ---- ink ---------------------------------------------------------------

const lutPaper = new Uint32Array(256);
const lutRule = new Uint32Array(256);
const tone = { legend: '#000', soft: '#444', pen: '#c00', face: '#fff', edge: '#888', paper: '#fff' };

// Read the colours off the stylesheet, so the lamp changes the paper too.
function inks() {
  mix(lutPaper, lutRule);
  for (const name of Object.keys(tone)) tone[name] = css('--' + name);
}

// One row of power onto the paper. Noise prints as a light grain, a
// strong signal as solid ink.
function tint(px, at, power, t) {
  const ruled = Math.round(t / ROW) % 100 === 0; // a line across every five seconds
  for (let x = 0; x < W; x++) {
    const i = ink(power[x]);
    px[at + x] = ruled || rules[x] ? lutRule[i] : lutPaper[i];
  }
}

// ---- layout ------------------------------------------------------------

function measure() {
  W = Math.max(240, Math.floor(well.clientWidth));
  H = Math.max(120, Math.floor(well.clientHeight));
  paper.width = W;
  paper.height = H;
  row = new Float32Array(W);
  lineImage = ctx.createImageData(W, 1);
  linePx = new Uint32Array(lineImage.data.buffer);
  fullImage = ctx.createImageData(W, H);
  fullPx = new Uint32Array(fullImage.data.buffer);
  rules = new Uint8Array(W);
}

// Put the view where `at` (Hz) is a third of the way across. If the dial
// is on a station too wide for that but not too wide for the paper, show
// the whole of the station instead.
function place(at = state.dial) {
  view.hz = state.span / W;
  let want = at - state.span / 3;
  const lock = at === state.dial ? tuned(state.dial) : null;
  if (lock && lock.station.width > state.span * 0.6 && lock.station.width <= state.span) {
    want = dialOf(lock.station) - (state.span - lock.station.width) / 2;
  }
  const lo = clamp(want, BAND.lo - 1000, Math.max(BAND.lo - 1000, BAND.hi + 1000 - state.span));
  view.lo = Math.round(lo / view.hz) * view.hz;

  const every = state.span > 24000 ? 5000 : state.span < 6000 ? 500 : 1000;
  rules.fill(0);
  for (let f = Math.ceil(view.lo / every) * every; f < view.lo + state.span; f += every) {
    const x = Math.round(xOf(f));
    if (x >= 0 && x < W) rules[x] = 1;
  }

  if (state.integrate) resetPlate();
  else repaint();
  drawRail();
  drawStrip();
  movePen();
}

// ---- the paper, feeding ------------------------------------------------

function repaint(t = now()) {
  feedT = Math.floor(t / ROW) * ROW;
  const top = feedT - H * ROW;
  const strokes = onAir(top, feedT, view.lo, view.lo + state.span);
  for (let r = 0; r < H; r++) {
    const ts = top + r * ROW;
    rowOf(row, strokes, ts, ROW, view.lo, view.hz, nib());
    tint(fullPx, r * W, row, ts);
  }
  ctx.putImageData(fullImage, 0, 0);
}

function feed(t) {
  const due = Math.floor((t - feedT) / ROW);
  if (due <= 0) return;
  if (due >= H) return repaint(t);
  const strokes = onAir(feedT, feedT + due * ROW, view.lo, view.lo + state.span);
  ctx.drawImage(paper, 0, due, W, H - due, 0, 0, W, H - due);
  for (let i = 0; i < due; i++) {
    const ts = feedT + i * ROW;
    rowOf(row, strokes, ts, ROW, view.lo, view.hz, nib());
    tint(linePx, 0, row, ts);
    ctx.putImageData(lineImage, 0, H - due + i);
  }
  feedT += due * ROW;
}

// ---- the paper, integrating ---------------------------------------------
//
// The paper stops. One frame of time runs from the top of the well to the
// bottom, and each pass of the head down it is added to the passes before.

const plate = { sum: null, count: null, mean: null, blur: null, dt: 1, next: 0, since: 0, drawn: 0 };

function resetPlate() {
  plate.sum = new Float32Array(W * H);
  plate.count = new Uint16Array(H);
  plate.mean = new Float32Array(W * H);
  plate.blur = new Float32Array(W * H);
  plate.dt = FRAME / H;
  plate.since = now();
  plate.next = Math.ceil(plate.since / plate.dt) * plate.dt;
  plate.drawn = 0;
  drawPlate();
}

function expose(t) {
  for (let guard = 0; plate.next + plate.dt <= t && guard < 40; guard++) {
    const ts = plate.next;
    const r = Math.round((((ts % FRAME) + FRAME) % FRAME) / plate.dt) % H;
    rowOf(row, onAir(ts, ts + plate.dt, view.lo, view.lo + state.span), ts, plate.dt, view.lo, view.hz, nib());
    const at = r * W;
    for (let x = 0; x < W; x++) plate.sum[at + x] += row[x];
    if (plate.count[r] < 65535) plate.count[r]++;
    plate.next += plate.dt;
  }
  // Fallen behind (the page was hidden): what was missed is missed.
  if (plate.next + plate.dt <= t) plate.next = Math.ceil(t / plate.dt) * plate.dt;
}

function drawPlate() {
  const { sum, count, mean, blur } = plate;
  // Average over about one cell each way; the eye would do this anyway.
  const bw = Math.max(1, Math.round(CELL.f / view.hz));
  const bh = Math.max(1, Math.round(CELL.t / plate.dt));

  for (let r = 0; r < H; r++) {
    const n = count[r];
    const at = r * W;
    if (!n) mean.fill(1, at, at + W);
    else for (let x = 0; x < W; x++) mean[at + x] = sum[at + x] / n;
  }
  // Box blur across, into blur.
  const hw = bw >> 1;
  for (let r = 0; r < H; r++) {
    const at = r * W;
    let acc = 0;
    for (let x = -hw; x <= hw; x++) acc += mean[at + clamp(x, 0, W - 1)];
    for (let x = 0; x < W; x++) {
      blur[at + x] = acc / (2 * hw + 1);
      acc += mean[at + clamp(x + hw + 1, 0, W - 1)] - mean[at + clamp(x - hw, 0, W - 1)];
    }
  }
  // Box blur down, back into mean.
  const hh = bh >> 1;
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let r = -hh; r <= hh; r++) acc += blur[clamp(r, 0, H - 1) * W + x];
    for (let r = 0; r < H; r++) {
      mean[r * W + x] = acc / (2 * hh + 1);
      acc += blur[clamp(r + hh + 1, 0, H - 1) * W + x] - blur[clamp(r - hh, 0, H - 1) * W + x];
    }
  }

  const looks = (2 * hw + 1) * (2 * hh + 1);
  const five = Math.round(5 / plate.dt);
  for (let r = 0; r < H; r++) {
    const at = r * W;
    const ruled = r % five === 0;
    // How far each point stands above a flat floor, in units of how far
    // noise alone would stand after this many looks.
    const k = Math.sqrt(Math.max(1, count[r]) * looks);
    for (let x = 0; x < W; x++) {
      const z = count[r] ? (mean[at + x] - 1) * k : 0;
      const d = (z - 1.2) / 7;
      const i = d <= 0 ? 0 : d >= 1 ? 255 : (d * 255) | 0;
      fullPx[at + x] = ruled || rules[x] ? lutRule[i] : lutPaper[i];
    }
  }
  ctx.putImageData(fullImage, 0, 0);
  plate.drawn = now();
}

function describeExposure(t) {
  const secs = Math.max(0, Math.floor(t - plate.since));
  const frames = Math.floor(secs / FRAME);
  const span = secs < 60 ? `${secs} s` : `${Math.floor(secs / 60)} min ${pad(secs % 60)} s`;
  exposure.textContent = `Adding up. ${frames} frame${frames === 1 ? '' : 's'}, ${span}.`;
}

// ---- pen, rail, strip ----------------------------------------------------

function movePen() {
  const x = xOf(state.dial);
  pen.style.transform = `translateX(${x}px)`;
  passband.style.transform = `translateX(${x}px)`;
  passband.style.width = `${PASSBAND / view.hz}px`;
}

function crisp(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
  }
  const c = canvas.getContext('2d');
  c.setTransform(ratio, 0, 0, ratio, 0, 0);
  c.clearRect(0, 0, w, h);
  return { c, w, h };
}

function drawRail() {
  const { c, h } = crisp(rail);
  const [minor, major] = { 3000: [100, 500], 6000: [100, 1000], 12000: [500, 1000], 24000: [1000, 2000], 48000: [1000, 5000] }[state.span];
  c.fillStyle = tone.legend;
  c.font = '13px "Routed Gothic", sans-serif';
  c.textBaseline = 'bottom';
  c.textAlign = 'center';
  for (let f = Math.ceil(view.lo / minor) * minor; f <= view.lo + state.span; f += minor) {
    const x = Math.round(xOf(f));
    const big = f % major === 0;
    c.fillRect(x, 0, 1, big ? 9 : f % 1000 === 0 ? 6 : 4);
    if (big && x > 20 && x < W - 20) c.fillText(String(f / 1000), x, h - 5);
  }
}

const stripX = (hz, w) => ((hz - BAND.lo) / (BAND.hi - BAND.lo)) * (w - 2) + 1;

function drawStrip() {
  const { c, w } = crisp(strip);
  const base = 26;
  const t = now();
  c.font = '11px "Routed Gothic", sans-serif';
  c.textAlign = 'center';

  // What is in view.
  c.globalAlpha = 0.14;
  c.fillStyle = tone.pen;
  c.fillRect(stripX(view.lo, w), base - 11, Math.max(2, (state.span / (BAND.hi - BAND.lo)) * (w - 2)), 11);
  c.globalAlpha = 1;

  // The scale.
  c.fillStyle = tone.legend;
  c.fillRect(1, base, w - 2, 1);
  c.textBaseline = 'top';
  const lettered = w < 560 ? 100000 : 50000; // fewer figures where there is less room
  for (let f = BAND.lo; f <= BAND.hi; f += 10000) {
    const x = Math.round(stripX(f, w));
    const big = f % 50000 === 0;
    c.fillRect(x, base, 1, big ? 6 : 3);
    if (f % lettered === 0) {
      c.textAlign = f === BAND.lo ? 'left' : f === BAND.hi ? 'right' : 'center';
      c.fillText(String(f / 1000), x, base + 8);
    }
  }
  c.textAlign = 'center';

  // The quiet segment: hatched, and left alone.
  {
    const x0 = stripX(QUIET.lo, w);
    const x1 = stripX(QUIET.hi, w);
    c.strokeStyle = tone.pen;
    c.lineWidth = 1;
    c.strokeRect(Math.round(x0) + 0.5, base - 9.5, Math.max(4, Math.round(x1 - x0)), 9);
  }

  // The allocations: solid while something is being sent, hollow while not.
  c.textBaseline = 'alphabetic';
  c.font = 'bold 12px "Courier Prime", monospace';
  for (const st of stations) {
    if (!live(st, t)) continue;
    const x0 = Math.round(stripX(dialOf(st), w));
    const wide = Math.max(4, Math.round(((st.width / (BAND.hi - BAND.lo)) * (w - 2))));
    let on = true;
    if (!st.continuous && st.next) {
      const next = st.next(t);
      on = !!next && next.start <= t;
    }
    c.fillStyle = tone.legend;
    c.strokeStyle = tone.legend;
    if (on) c.fillRect(x0, base - 9, wide, 9);
    else c.strokeRect(x0 + 0.5, base - 8.5, wide - 1, 8);
    c.fillText(st.id, clamp(x0 + wide / 2, 9, w - 9), base - 13);
  }
  c.font = '11px "Routed Gothic", sans-serif';

  // The dial: under the lettering, not through it.
  c.fillStyle = tone.pen;
  c.fillRect(Math.round(stripX(state.dial, w)), base - 11, 1, 17);
}

// ---- the dial ------------------------------------------------------------

const PLACES = [1_000_000, 100_000, 10_000, 1000, 100, 10];
const drums = [];

function buildCounter() {
  const counter = $('counter');
  const names = ['thousands of kilohertz', 'hundreds of kilohertz', 'tens of kilohertz', 'kilohertz', 'hundreds of hertz', 'tens of hertz'];
  PLACES.forEach((place, i) => {
    if (i === 4) {
      const point = document.createElement('span');
      point.className = 'point';
      point.textContent = '.';
      point.setAttribute('aria-hidden', 'true');
      counter.append(point);
    }
    const drum = document.createElement('div');
    drum.className = i >= 4 ? 'drum fraction' : 'drum';
    drum.tabIndex = 0;
    drum.setAttribute('role', 'spinbutton');
    drum.setAttribute('aria-label', names[i]);
    drum.setAttribute('aria-valuemin', '0');
    drum.setAttribute('aria-valuemax', '9');
    const reel = document.createElement('div');
    reel.className = 'reel';
    for (let d = 0; d < 10; d++) {
      const s = document.createElement('span');
      s.textContent = d;
      reel.append(s);
    }
    drum.append(reel);
    counter.append(drum);
    drums.push({ drum, reel, place, shown: -1 });

    drum.addEventListener('wheel', (e) => {
      e.preventDefault();
      turn(e.deltaY < 0 ? place : -place);
    }, { passive: false });
    drum.addEventListener('pointerdown', (e) => {
      const box = drum.getBoundingClientRect();
      turn(e.clientY < box.top + box.height / 2 ? place : -place);
    });
    drum.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') turn(place);
      else if (e.key === 'ArrowDown') turn(-place);
      else return;
      e.preventDefault();
    });
  });
}

function showCounter() {
  const digits = pad(Math.round(state.dial / 10), 6);
  drums.forEach((d, i) => {
    const v = Number(digits[i]);
    if (v === d.shown) return;
    d.shown = v;
    d.reel.style.transform = `translateY(${-v * 1.22}em)`;
    d.drum.setAttribute('aria-valuenow', String(v));
  });
}

function showIdent() {
  const lock = tuned(state.dial);
  const ident = $('ident');
  if (!lock) ident.textContent = '';
  else if (lock.off === 0) ident.textContent = lock.station.id;
  else ident.textContent = `${lock.station.id} ${lock.off > 0 ? '+' : '-'}${Math.abs(lock.off)} Hz`;
}

let saveTimer = 0;

function showDial() {
  movePen();
  showCounter();
  showIdent();
  const k = (state.dial / 1000).toFixed(2);
  paper.setAttribute('aria-valuemin', String(BAND.lo / 1000));
  paper.setAttribute('aria-valuemax', String(BAND.hi / 1000));
  paper.setAttribute('aria-valuenow', k);
  paper.setAttribute('aria-valuetext', `${k} kilohertz`);
  if (audio.node) audio.node.port.postMessage({ tune: state.dial });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    store.write();
    history.replaceState(null, '', `#${k}`);
    drawStrip();
  }, 250);
}

// Move the dial. If `follow`, the paper moves to keep the pen on it.
function setDial(hz, follow = true) {
  hz = clamp(Math.round(hz / STEP) * STEP, BAND.lo, BAND.hi);
  if (hz === state.dial) return;
  state.dial = hz;
  if (follow) {
    const x = xOf(hz);
    if (x < -W * 0.25 || x > W * 1.25) place(hz);
    else if (x < W * 0.06) place(view.lo + state.span * (1 / 3 - 0.25));
    else if (x > W * 0.7) place(view.lo + state.span * (1 / 3 + 0.25));
  }
  showDial();
}

const turn = (by) => setDial(state.dial + by);

// The narrowest span that shows the whole of the station on this dial
// frequency, if it is on one and the chosen span would not.
function spanFor(hz) {
  const lock = tuned(hz);
  if (!lock || lock.off !== 0 || lock.station.width <= state.chosen) return state.chosen;
  return SPANS.find((s) => s >= lock.station.width * 1.05) || state.chosen;
}

// Go straight to a frequency. If it is a station's dial frequency and the
// station is wider than the paper, widen the paper until it fits; going
// anywhere else puts the paper back to the span that was chosen.
function jump(hz) {
  setDial(hz, false);
  showSpan(spanFor(state.dial));
  place(state.dial);
}

function showSpan(span) {
  state.span = span;
  for (const input of document.querySelectorAll('input[name="span"]')) input.checked = Number(input.value) === span;
}

// The operator picks a span.
function setSpan(span) {
  state.chosen = span;
  showSpan(span);
  store.write();
}

// ---- the meter -------------------------------------------------------------

let level = 0;

function meter(t) {
  let power = 0;
  for (const s of onAir(t, t + 0.04, state.dial, state.dial + PASSBAND)) {
    const f = s.f - state.dial;
    if (f > 60 && f < PASSBAND) power += s.a * s.a;
  }
  const db = 10 * Math.log10(power + 0.0022) + (Math.random() - 0.5) * 1.5;
  const want = clamp((db + 28) / 30, 0, 1);
  level += (want - level) * (want > level ? 0.45 : 0.07);
  $('needle').style.transform = `translateX(${level * ($('needle').parentElement.clientWidth - 2)}px)`;
}

// ---- copy ------------------------------------------------------------------

const copyEl = $('copy');
let copyText = '';
let copyFrom = 0;

function print(s) {
  if (!s) return;
  const stuck = copyEl.scrollHeight - copyEl.scrollTop - copyEl.clientHeight < 24;
  copyText = (copyText + s).replace(/\n{3,}/g, '\n\n');
  if (copyText.length > 6000) copyText = copyText.slice(-5000);
  copyEl.textContent = copyText;
  if (stuck) copyEl.scrollTop = copyEl.scrollHeight;
}

let copyOf = null; // the station the last of the copy came from

function pollCopy() {
  const t = now();
  let s = '';
  for (const e of decode(state.dial, copyFrom, t)) s += e.s;
  copyFrom = t;
  if (!s) return;
  // A new station starts on a new line.
  const from = tuned(state.dial)?.station.id ?? null;
  if (copyOf !== null && from !== copyOf && copyText && !copyText.endsWith('\n') && !s.startsWith('\n')) s = '\n' + s;
  copyOf = from;
  print(s);
}

// ---- reports ---------------------------------------------------------------

// The address of the report desk, with a report of this frequency begun:
// where the dial is, the last of what was copied here, and the minute it
// arrived. Sending it in is left to the listener.
function draft() {
  const t = now();
  const events = decode(state.dial, t - 240, t);
  let said = '';
  for (const e of events) said += e.s;
  said = said.replace(/\s+/g, ' ').trim();
  if (said.length > 48) said = said.slice(-48).replace(/^\S*\s/, '');
  const at = said ? events[events.length - 1].t : t;
  return address({ khz: (state.dial / 1000).toFixed(2), date: iso(at).slice(0, 10), utc: hhmm(at), copied: said }, true);
}

// ---- what is on --------------------------------------------------------------

function until(secs) {
  secs = Math.max(0, Math.round(secs));
  if (secs < 60) return `${secs} s`;
  return `${Math.floor(secs / 60)} min${secs % 60 && secs < 600 ? ` ${secs % 60} s` : ''}`;
}

function showSked() {
  const t = now();
  const body = $('sked');
  const rows = [];
  for (const { station, start, end } of sked(t)) {
    const on = start <= t;
    rows.push({ station, when: hhmm(start), note: on ? `now, ${until(end - t)} left` : `in ${until(start - t)}`, on });
  }
  for (const st of stations) if (st.continuous && live(st, t)) rows.push({ station: st, when: '', note: 'always', on: false });

  body.textContent = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    if (r.on) tr.className = 'on';
    const go = document.createElement('button');
    go.type = 'button';
    go.textContent = (dialOf(r.station) / 1000).toFixed(2);
    go.setAttribute('aria-label', `Tune to ${go.textContent} kilohertz`);
    go.addEventListener('click', () => {
      jump(dialOf(r.station));
      paper.focus({ preventScroll: true });
    });
    const cells = [r.when, go, r.station.id, r.note];
    for (const cell of cells) {
      const td = document.createElement('td');
      td.append(cell);
      tr.append(td);
    }
    body.append(tr);
  }
}

function showClock() {
  const t = now();
  const u = utc(t);
  $('utc').textContent = `${pad(u.hour)}:${pad(u.minute)}:${pad(u.second)}`;
  $('day').textContent = String(dayOf(t));
}

// ---- the loudspeaker -----------------------------------------------------------

const audio = { ctx: null, node: null, gain: null, until: 0, lo: 0, hi: 0, timer: 0 };

const loudness = (v) => v * v * 1.8;

function feedAudio(force = false) {
  if (!audio.node) return;
  const t = now();
  if (force || state.dial - 1500 < audio.lo || state.dial + PASSBAND + 1500 > audio.hi) {
    audio.lo = state.dial - 10000;
    audio.hi = state.dial + 13000;
    audio.until = t - 0.25;
  }
  const to = t + 2.5; // far enough ahead to outlast a throttled timer
  if (to <= audio.until) return;
  audio.node.port.postMessage({
    strokes: onAir(audio.until, to, audio.lo, audio.hi),
    offset: now() - audio.ctx.currentTime,
    tune: state.dial,
  });
  audio.until = to;
}

async function soundOn() {
  if (!audio.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !window.AudioWorkletNode) throw new Error('no worklet');
    audio.ctx = new AC({ latencyHint: 'interactive' });
  }
  // Ask to start while the press is still a press. Some browsers will
  // not let sound begin from anything that happens after a wait.
  const started = audio.ctx.resume();
  if (!audio.node) {
    await audio.ctx.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
    audio.node = new AudioWorkletNode(audio.ctx, 'loudspeaker', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    audio.gain = audio.ctx.createGain();
    audio.node.connect(audio.gain).connect(audio.ctx.destination);
  }
  audio.gain.gain.value = loudness(state.volume);
  await started;
  feedAudio(true);
  clearInterval(audio.timer);
  audio.timer = setInterval(feedAudio, 150);
}

function soundOff() {
  clearInterval(audio.timer);
  if (audio.ctx) audio.ctx.suspend();
}

// ---- controls --------------------------------------------------------------------

function press(button, on) {
  button.setAttribute('aria-pressed', String(on));
}

$('sound').addEventListener('click', async () => {
  const button = $('sound');
  if (state.sound) {
    state.sound = false;
    soundOff();
    press(button, false);
    return;
  }
  try {
    await soundOn();
    state.sound = true;
    press(button, true);
  } catch {
    print('\n[This browser cannot work the loudspeaker. The paper and the copy still run.]\n');
  }
});

$('volume').value = String(state.volume);
$('volume').addEventListener('input', (e) => {
  state.volume = Number(e.target.value);
  if (audio.gain) audio.gain.gain.value = loudness(state.volume);
  store.write();
});

for (const input of document.querySelectorAll('input[name="span"]')) {
  input.checked = Number(input.value) === state.span;
  input.addEventListener('change', () => {
    setSpan(Number(input.value));
    place(state.dial);
  });
}

$('integrate').addEventListener('click', () => {
  state.integrate = !state.integrate;
  press($('integrate'), state.integrate);
  well.classList.toggle('plate', state.integrate);
  exposure.hidden = !state.integrate;
  if (state.integrate) {
    resetPlate();
    describeExposure(now());
  } else repaint();
});

function setLamp(on) {
  state.lamp = on;
  document.documentElement.dataset.lamp = on ? 'on' : 'off';
  press($('lamp'), on);
  inks();
  if (W) {
    if (state.integrate) drawPlate();
    else repaint();
    drawRail();
    drawStrip();
  }
}

$('lamp').addEventListener('click', () => {
  setLamp(!state.lamp);
  store.write();
});

// Tuning on the paper: press or drag to put the pen there.
{
  let dragging = false;
  const tuneTo = (e) => {
    const box = paper.getBoundingClientRect();
    const x = clamp(e.clientX - box.left, 0, box.width - 1) * (W / box.width);
    setDial(hzAt(x), false);
  };
  paper.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragging = true;
    paper.setPointerCapture(e.pointerId);
    tuneTo(e);
  });
  paper.addEventListener('pointermove', (e) => dragging && tuneTo(e));
  const stop = () => (dragging = false);
  paper.addEventListener('pointerup', stop);
  paper.addEventListener('pointercancel', stop);
  // The wheel tunes once the paper has been touched. Until then it is
  // left alone, so that a page with a receiver on it can still be scrolled.
  // A sideways scroll always tunes: it has nothing else to do here.
  paper.addEventListener('wheel', (e) => {
    const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!sideways && document.activeElement !== paper) return;
    e.preventDefault();
    const d = sideways ? -e.deltaX : e.deltaY;
    if (d === 0) return;
    turn((d < 0 ? 1 : -1) * (e.shiftKey ? 100 : STEP));
  }, { passive: false });
}

// Jumping about on the strip.
{
  let dragging = false;
  const go = (e) => {
    const box = strip.getBoundingClientRect();
    const frac = clamp((e.clientX - box.left - 1) / (box.width - 2), 0, 1);
    let hz = BAND.lo + frac * (BAND.hi - BAND.lo);
    // Land exactly on a dial frequency if one is within a few pixels.
    for (const st of stations) if (live(st, now()) && Math.abs(stripX(dialOf(st), box.width) - (e.clientX - box.left)) < 6) hz = dialOf(st);
    jump(hz);
  };
  strip.addEventListener('pointerdown', (e) => {
    dragging = true;
    strip.setPointerCapture(e.pointerId);
    go(e);
  });
  strip.addEventListener('pointermove', (e) => dragging && go(e));
  const stop = () => (dragging = false);
  strip.addEventListener('pointerup', stop);
  strip.addEventListener('pointercancel', stop);
}

// Left and right tune from anywhere that has no use of its own for them.
// The keys that would otherwise scroll the page tune only while the paper
// has the focus, where they are the ordinary keys for a slider.
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey) return;
  const el = e.target;
  if (el instanceof HTMLElement && (el.closest('input, select, textarea, pre, .drum') || el.isContentEditable)) return;
  const size = e.shiftKey ? 100 : e.altKey ? 1000 : STEP;
  const onPaper = el === paper;
  if (e.key === 'ArrowRight') turn(size);
  else if (e.key === 'ArrowLeft') turn(-size);
  else if (!onPaper) return;
  else if (e.key === 'ArrowUp') turn(size);
  else if (e.key === 'ArrowDown') turn(-size);
  else if (e.key === 'PageUp') turn(1000);
  else if (e.key === 'PageDown') turn(-1000);
  else if (e.key === 'Home') setDial(BAND.lo);
  else if (e.key === 'End') setDial(BAND.hi);
  else return;
  e.preventDefault();
});

// The link to the report desk is aimed when it is about to be used.
for (const type of ['pointerenter', 'pointerdown', 'touchstart', 'focus', 'keydown']) {
  $('report').addEventListener(type, () => ($('report').href = draft()), { passive: true });
}

window.addEventListener('hashchange', () => {
  const h = fromHash();
  if (h !== null && h !== state.dial) jump(h);
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (Math.floor(well.clientWidth) === W && Math.floor(well.clientHeight) === H) return;
    measure();
    place(state.dial);
  }, 120);
});

// ---- begin -------------------------------------------------------------------------

buildCounter();
setLamp(state.lamp);
measure();
showSpan(spanFor(state.dial));
place(state.dial);
showDial();
showClock();
showSked();

// Start the copy with the last minute, as if the printer had been left on.
{
  const t = now();
  let s = '';
  for (const e of decode(state.dial, t - 60, t)) s += e.s;
  copyFrom = t;
  copyOf = tuned(state.dial)?.station.id ?? null;
  print(s.replace(/^\s+/, ''));
}

// For anyone who has asked their machine for less motion, the paper
// advances a second at a time instead of creeping.
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
let fed = 0;

function frame() {
  const t = now();
  if (state.integrate) {
    expose(t);
    if (t - plate.drawn > (calm.matches ? 2 : 0.3)) {
      drawPlate();
      describeExposure(t);
    }
    if (!calm.matches) head.style.transform = `translateY(${(((t % FRAME) + FRAME) % FRAME) / plate.dt}px)`;
  } else if (!calm.matches || Math.abs(t - fed) >= 1) {
    feed(t);
    fed = t;
  }
  meter(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setInterval(pollCopy, 100);
setInterval(() => {
  showClock();
  showSked();
  drawStrip();
}, 1000);

// Lettering on the rail and strip needs the typeface, which may arrive late.
if (document.fonts && document.fonts.load) {
  Promise.all([document.fonts.load('13px "Routed Gothic"'), document.fonts.load('bold 12px "Courier Prime"')]).then(() => {
    drawRail();
    drawStrip();
  });
}
