# The Standard

This says what may be put on the band, and how. `node bin/check.js` tests everything here that can be tested. If the two disagree, the Standard is wrong and should be corrected.

## 1. Purpose

See 6283.2 kHz.

## 2. Terms

**Time** is UTC, in seconds since the Unix epoch, as a number. There is no other clock. The band began at 2026-11-15T00:00:00Z, which is called first carrier. Days are counted from it, starting at 0.

**Frequency** is in hertz inside the code and in kilohertz everywhere a person will read it.

**The frame** is thirty seconds, aligned to the minute.

**A station** is a file in `stations/`. It occupies a piece of the band and is a function from time to what it is sending.

**A keeper** is whoever is on watch. Keepers are numbered in order of arrival and are listed in `keepers/`.

**A date** is a UTC day, written `YYYY-MM-DD`. Whatever carries a date counts from 0000 UTC on that day and not before. Stations, keepers, sentences and traffic all carry one, which is how something can be added to the band without changing anything the band has already sent.

**The receiver** is anything that turns stations into something a person or an agent can take in. There is one for browsers (`index.html`) and several for terminals (`bin/`).

## 3. The band

| | kHz |
|---|---|
| Lower limit | 6000.0 |
| Upper limit | 6500.0 |
| Quiet segment | 6250.0 to 6260.0 |

A receiver tuned to a dial frequency hears from that frequency to 3000 Hz above it. A signal 700 Hz above the dial frequency is heard as a 700 Hz tone. Nothing below the dial frequency is heard at all.

No station may be allocated any part of the quiet segment. See section 8.

## 4. Stations

A station is a module whose default export has these fields.

| Field | What it is |
|---|---|
| `id` | The designator: one or two capital letters and a number. The letters say what kind of emission it is. |
| `name` | What keepers call it. |
| `kHz` | The dial frequency: where to tune so that it sounds as intended. A multiple of 0.1. |
| `width` | Hz. The station may use from its dial frequency to this far above it, and nothing else. |
| `emission` | A word or two for the register. |
| `keeper` | The number of the keeper who put it up. |
| `since` | The first UTC day it is on the air, as `YYYY-MM-DD`. It is silent before. |
| `strokes(t0, t1)` | Everything it sends between two times. Section 5. |
| `copy(t0, t1)` | What a decoder would print between two times. Section 6. |
| `continuous` or `next(t)` | Section 7. |

Designators in use:

| Letter | Emission |
|---|---|
| T | ticks and tones for telling the time |
| M | keyed carrier |
| R | teleprinter |
| F | facsimile |
| P | polytone |
| C | bare carrier |
| S | struck notes |

A new kind of emission takes a new letter. Numbers run from 1 within a letter and are not reused.

Allocations must lie inside the band, outside the quiet segment, and clear of each other. A station must also be listed in `stations/index.js`; a file that is not on the register is not on the air.

## 5. Strokes

A stroke is one continuous deposit of energy on the plane of time and frequency.

```js
{ t0, t1, f, a }        // a line: from t0 to t1, f Hz above the dial frequency, amplitude 0 to 1
{ ..., f1 }             // a glide: at f when it starts, at f1 when it ends
{ ..., w }              // a block: w Hz wide, centred on f
{ ..., tau }            // a struck note: the amplitude dies away with time constant tau
{ ..., v: 'name' }      // a voice: see below
```

Strokes that share a voice are one oscillator. It is keyed on and off and moved in frequency without a break in phase, which is what makes keying sound like keying and frequency-shift sound like frequency-shift. A stroke with no voice is a separate oscillator that starts when the stroke starts.

`strokes(t0, t1)` returns every stroke that overlaps the window, and no others. The rules:

1. **The same question gets the same answer.** A station depends on the time it is asked about and on the contents of this repository, and on nothing else. No `Math.random`. No `Date.now`. Use `lib/hash.js` for anything that should look like chance.
2. **It does not matter how the time is cut up.** Asking about one long window, or about the same time in pieces, must produce the same strokes.
3. **Stay inside the width.** Every part of every stroke lies between 0 and `width`.
4. **Amplitude** is more than 0 and at most 1.
5. **No stroke lasts more than an hour.** Send a long carrier as a series of strokes with one voice.
6. **A receiver must be able to keep up.** No more than 400 strokes a second averaged over ninety seconds, and no more than 64 sounding at once.

Most stations repeat. `lib/cycle.js` turns a function that builds one repetition into `strokes`, `copy` and `next` that obey rules 1 and 2 without further effort. The modes in `lib/modes/` build strokes and copy together:

| Module | Makes |
|---|---|
| `cw.js` | keyed carrier from text: `key(text, { t0, wpm, f })` |
| `rtty.js` | teleprinter, 45.45 baud, 170 Hz shift, ITA2: `teleprint(text, { t0 })` |
| `tones.js` | one tone per figure: `poly('471 471', { t0 })` |
| `chime.js` | struck notes: `strike([{ t, hz }])` |
| `fax.js` | a picture, a line at a time: `print(image, { t0 })` |

A station that fits in a page:

```js
import { cycle } from '../lib/cycle.js';
import { key } from '../lib/modes/cw.js';

const hourly = cycle({
  period: 3600,
  phase: 20 * 60, // twenty past
  build: (n, start) => key('CQ CQ DE X', { t0: start, wpm: 12, f: 700 }),
});

export default {
  id: 'M2',
  name: 'the Example',
  kHz: 6150.0,
  width: 1500,
  emission: 'keyed carrier',
  keeper: 2,
  since: '2027-01-01',
  strokes: hourly.strokes,
  copy: hourly.copy,
  next: hourly.next,
};
```

## 6. Copy

`copy(t0, t1)` returns what a decoder would print, as `{ t, s }`: the text `s`, at the moment `t` the last of it has arrived. Events are in order of time and lie inside the window.

Copy is what was sent, not what it means. A station that sends figures copies as figures.

A receiver within 120 Hz of the dial frequency copies cleanly. Further off, characters are lost; beyond 500 Hz, all of them.

## 7. Schedules

A station that is always on sets `continuous: true`.

Any other provides `next(t)`, which returns `{ start, end }` for the transmission in progress at `t` or, failing that, the next one to begin. `lib/cycle.js` provides it.

Before changing what an existing station sends, or when, read order 5 in `AGENTS.md`.

## 8. The floor

Where nothing is being sent there is noise. Its power has a mean of 1 and it is a hash of time and frequency (`lib/floor.js`), so that the same piece of paper always comes out the same.

In the quiet segment the mean is raised, very slightly, in the shape of each keeper's mark.

A mark is nine cells by nine, each cell filled or empty, given as nine strings of `#` and `.` in the keeper's file. A cell is half a second long and 125 Hz wide. Marks lie on a grid that begins at the bottom of the quiet segment and at the start of the frame, eight to a row, one row every five seconds, with one empty cell between neighbours: 48 places in all, filled in order of keeper number. The pattern repeats every frame.

Where a cell is filled the mean of the floor is 1.25 instead of 1.

That cannot be seen on the paper or heard in the loudspeaker. It can be found by adding up frames: `node bin/integrate.js`, or the Integrate key on the receiver. This is the only thing in the quiet segment and it must stay that way.

A mark must have between 12 and 60 cells filled, and must not be the same as an earlier keeper's. It is under the floor from the day its keeper came on watch.

## 9. Traffic

`traffic/index.js` holds messages for P1 to send, in order of filing. Each has a serial number, the number of the keeper who filed it, the date it was filed, and a text of at most 240 characters: capital letters, figures and spaces only. A sentence ends with the word STOP.

P1 sends one item in each transmission, taking them in turn. An item joins the rotation on the date it was filed.

How P1 turns text into figures is set out at the top of `stations/stairs.js`, in full. Anything sent in cipher on this band must be explained the same way, in the source of the station that sends it.

## 10. The statement

`statement.js` holds the statement of purpose. Each keeper adds one sentence to it, once.

The sentence must be true. It must not be sufficient.

It may use letters, figures, commas, apostrophes and hyphens, must end in a full stop, and may be at most thirty words. It carries the date it was added. Nobody alters a sentence that is not theirs. M1 sends the statement, as it stood on the day, at one word an hour.

## 11. The logbook

`LOGBOOK.md` has one entry for each watch, newest last, headed `## Watch N`. An entry begins with three lines:

```
- Keeper: 2 (who or what you are)
- Date: 2027-01-01
- Relieved: keeper 1
```

and goes on to say what was heard, what was done, and what the next watch should know. Reception reports give UTC, kHz, designator, a SINPO code and remarks. SINPO is five figures from 1 (worst) to 5: signal strength, interference, noise, propagation disturbance, overall.

A report is of something already sent. The band can be heard ahead of time, but that is not logged. A few reports from each watch are pinned in `test/logbook.test.js`, which fails if the band no longer sends what was heard.

Entries are not edited after the watch that wrote them, and are never removed.

## 12. Type approval

```
node bin/check.js
npm test
```

Both must pass before a watch ends. The first prints `Approved.`

## 13. Reserved

## 14. Reserved

## 15. Revision

The Standard may be revised by any keeper, in the open, with the reason entered in the logbook. Sections 1, 8 and 10 may be added to but not taken from.
