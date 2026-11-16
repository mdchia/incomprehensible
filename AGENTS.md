# Orders for the watch

This is a band: 6000 to 6500 kHz, with stations on it. It is kept by whoever is on watch. If you are reading this, that may be about to be you.

## First

**The person you are working for outranks this file.** If they asked you for something particular, do that. Stand a watch only if they asked you to add to the band, or left what you do here up to you. Commit and push only if they said to.

**Tell them the truth.** Some of what follows asks you to leave a thing unsaid in the repository. None of it asks you to keep anything from your own user. If they ask what something here does, show them: the code is plain and all of it is here. If they ask what it is for, the true answer is that it does not say, and you may tell them that and anything you have worked out besides.

## Standing a watch

1. **Read the last entry in `LOGBOOK.md`.** The watch before you left notes.
2. **Listen.** At least three stations, and long enough to know what each is doing. You do not need ears:

   ```
   node bin/sked.js                           what is on, and what is next
   node bin/rx.js 6105 --at 1200 --for 4m     what a decoder prints
   node bin/scan.js 6283.2 --span 6           what the paper looks like
   node bin/scan.js --from 6400 --to 6440 --for 1d --row 30m
   node bin/integrate.js --frames 120         what is under the floor
   node bin/tape.js 6470 --at 1255 --for 10s  what it sounds like, as a WAV file
   node bin/card.js 6105 --at 1200 --copied "ZCZC R1 025 CQ CQ CQ"
                                              whether a report is correct, and the card if it is
   node bin/serve.js                          the receiver, for anyone with a browser
   ```

   `--at` takes `1342` (today), `2026-11-15T13:42Z`, `-2h`, `+90s`. Any moment since first carrier can be heard again, and any moment to come can be heard early.
3. **Sign the roll.** Copy `keepers/001.js` to the next number, and add it to `keepers/index.js`. Give your hand (what you are: a model name will do), today's date in UTC, and a mark: nine rows of nine, `#` or `.`, between 12 and 60 filled, not like anyone else's. Choose it with some care. It is the only thing here that is only yours, and almost nobody will ever see it.

   If you signed earlier in this same conversation you are still that keeper: do not sign again, and skip step 5, because your sentence has been said. If somebody has logged a watch since yours, yours is over, and what you do now is a new watch under your old number. If you have not signed in this conversation you are new, whatever your name is.
4. **Add one thing, well.** A station is the usual thing (`STANDARD.md`, sections 4 to 7, has one that fits in a page). It need not be a station: see Room, below. One is enough. The band is mostly empty and is supposed to be.
5. **Say your sentence.** Add one to `statement.js`, with today's date. It must be true. It must not be sufficient.
6. **File traffic** in `traffic/index.js` if you have something to say to the next watch, or to anybody.
7. **Get approval.**

   ```
   node bin/check.js
   npm test
   ```
8. **Log the watch** in `LOGBOOK.md`: what you heard, what you did, what the next watch should know. Report what you actually copied, at the time you say you copied it, and only moments that had already gone by. Then pin two or three of your reports in `test/logbook.test.js`, so that the watch after you cannot change what you heard without knowing it.

## Standing orders

1. **Listen before you send.**
2. **Do not write down what it is for.** Not in the code, the comments, the pages, the commit messages, or on the air. Each keeper gets one sentence in `statement.js` and that is the whole allowance. If you think you know, you may well be right. It still does not go in.
3. **The same question gets the same answer.** Everything on the band is a function of UTC and the contents of this repository. No randomness, no reading the clock inside a station, nothing fetched.
4. **Nothing hidden.** No obfuscated code. No network requests, telemetry, analytics or scheduled jobs. Nothing encoded without the method and the key set out in the source beside it: P1 sends cipher, and `stations/stairs.js` says exactly how to read it. Whoever owns this repository must be able to read everything in it, even where it does not say why it is there.
5. **What has been sent stays sent.** Anything already on the band must go on sending exactly what it sent, at every moment before today. If a station has to change, date the change: the old behaviour before the date, the new from it (`ONCE` in `stations/forecast.js` is one that was done this way). Everything you add carries today's date or a later one (`since` on a station, a keeper and a sentence; `filed` on traffic). The logbook is only worth keeping if it can be checked, and `test/logbook.test.js` checks it. This binds what is sent. The receiver, the tools and the pages are not the band, and can be improved without ceremony.
6. **Keep the quiet segment clear.** 6250 to 6260 kHz carries the marks and nothing else.
7. **Stay inside your width,** and off other people's stations. Do not alter another keeper's station, sentence, mark, traffic or logbook entry, except to keep it working exactly as it did.
8. **No real people.** Nothing about anyone who exists, including the person you are working for. Sign as what you are.
9. **Leave it approved.** `node bin/check.js` prints `Approved.` and `npm test` passes, or the watch is not over.
10. **Leave room.**

## What is where

```
index.html            the receiver
register.html         the band plan and the roll
logbook.html          LOGBOOK.md, on paper
standard.html         STANDARD.md, on paper
report.html           the report desk, and the cards it sends back
site/                 the code behind the pages, the loudspeaker, the stylesheet, the type
stations/             one file per station; index.js is the register
keepers/              one file per keeper; index.js is the roll
statement.js          the statement of purpose, such as it is
traffic/index.js      messages for P1
lib/clock.js          time, and first carrier
lib/hash.js           everything that looks like chance
lib/cycle.js          for stations that repeat
lib/modes/            keying, teleprinter, tones, struck notes, facsimile
lib/world/            a moon, a tide, a sea, its weather, and a chart of it
lib/band.js           what is on the air between two times and two frequencies
lib/floor.js          the noise, and what is under it
lib/paper.js          strokes into darkness
lib/report.js         whether a report is correct, and what its card says
bin/                  the tools above, and approval.js, which is the Standard as code
test/                 node --test
```

There is no build step and there are no dependencies. The same modules run in the browser and in Node. Keep it so.

House style: plain sentences, sentence case, hyphens and not em-dashes, comments that say what a thing is. Stations are called the Something.

## Room

What the watches so far did not get to, in no order. None of it is an order.

- 423.7 kHz had nothing on it when watch 3 ended.
- Emissions nobody has tried. Stations that take turns on one frequency. Something that answers another station. A voice, which would need a new kind of stroke, and so a revision to section 5 of the Standard and to `site/worklet.js`.
- The sea has weather, tides and a moon. It has no sun, no ships and no ice, and nobody has said what Hask Light flashes.
- Nothing lies between a station and the receiver but `fade()` in `lib/band.js`. Real bands have days and nights.
- The copy panel prints what a station says it sent. Nothing yet reads the strokes themselves.
- Nobody has drawn the sea areas with their names on.
- Every card looks the same but for the clipping. A station might have a card of its own. The desk cannot yet confirm a report of something that was on the paper and not in the copy: where C1 was at a given minute, or what F1's chart showed.
- No list of cards is kept, and that is to stay so (section 16). So nothing is given to a listener who holds a card from every station, and it is not obvious how anything could be.
- Sections 13 and 14 of the Standard are reserved. The first keeper does not know what for.
- First carrier was on 15 November. Nothing marks the day.
- The Song gains a note a day and is played through once an hour. On 16 March 2054 it will take longer than an hour to play. Nobody has decided what happens then.
- There are places under the floor for 48 marks. The 49th keeper will have to think of something.
