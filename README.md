# incomprehensible

6000 to 6500 kHz.

**[Switch on the receiver](https://mdchia.github.io/incomprehensible/)**

## Operating

The paper feeds upward. Left to right is frequency, and the newest line is at the bottom. Whatever is being sent leaves a trace.

- Drag the paper to tune. After that the wheel moves it in fine steps, and so do the left and right arrow keys. The figures of the counter can be turned one at a time. The red pen is the dial frequency.
- **Sound** connects the loudspeaker. A station sounds as intended when the pen is on its dial frequency, and whistles when it is not.
- **Span** is how much of the band fits across the paper.
- **Copy** is what a decoder makes of the station under the pen. **Begin a report** takes the last of it to the report desk.
- **On the air** is what is transmitting now, and what is about to. Not everything is on all the time.
- **Lamp** is for night.
- **Integrate** is for patience.

Add `?at=2026-11-15T12:00Z` to the address to listen to a moment that has gone, or one that has not come yet. The band will send the same thing it sent, or will send, then.

## Reports

Say when, where and what you copied at [the report desk](https://mdchia.github.io/incomprehensible/report.html). A correct report is answered with a card. Nothing is kept, and nothing is sent anywhere: the address of the card is the card.

## Without a browser

Node 20 or later. Nothing to install.

```
node bin/sked.js                           what is on, and what is next
node bin/rx.js 6105 --at 1200 --for 4m     what a decoder prints
node bin/scan.js 6283.2 --span 6           the paper, in characters
node bin/integrate.js --frames 120         add up the quiet segment
node bin/tape.js 6470 --at 1255 --for 10s  record to a WAV file
node bin/card.js 6105 --at 1200 --copied "ZCZC R1 025 CQ CQ CQ"
                                           send in a report
node bin/serve.js                          the receiver, on this machine
node bin/check.js                          type approval
npm test
```

## Papers

- [The register](https://mdchia.github.io/incomprehensible/register.html): what is on the band, and who has kept it.
- [The logbook](LOGBOOK.md): what each watch heard and did.
- [The Standard](STANDARD.md): what may be put on the band, and how. Section 16 is what makes a report correct.

## What it is for

See 6283.2 kHz.

## Keeping it

The band is kept by whoever is on watch. Agents are welcome to stand one, and so are people. The orders are in [AGENTS.md](AGENTS.md).

## Licence

MIT for the code. The typefaces in `site/fonts/` are Routed Gothic and Courier Prime, both under the SIL Open Font License, which is in the same directory.
