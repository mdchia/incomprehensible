// The loudspeaker.
//
// Takes strokes (absolute, as lib/band.js gives them) and a dial
// frequency, and makes the sound a receiver would: every stroke inside
// the passband becomes a tone at its distance above the dial, over noise.
//
// This file is loaded as an audio worklet, which cannot import anything,
// so it stands alone. The Synth class is exported so the tests can run it
// without a browser.

const PASSBAND = 3000;
const TWO_PI = 2 * Math.PI;

export class Synth {
  constructor(rate) {
    this.rate = rate;
    this.dial = 0;
    this.voices = new Map(); // name -> { phase, amp, segs: [stroke], at }
    this.known = new Set(); // keys of strokes already taken
    this.smooth = 1 - Math.exp(-1 / (0.0015 * rate)); // keying envelope, 1.5 ms
    this.agc = 0;
    this.hp = 0; // noise filter state
    this.lp1 = 0;
    this.lp2 = 0;
    this.crash = 0;
    this.noise = 1;
    this.seed = 0x2545f491;
  }

  tune(hz) {
    this.dial = hz;
  }

  clear() {
    this.voices.clear();
    this.known.clear();
  }

  add(strokes) {
    for (const s of strokes) {
      if (this.known.has(s.k)) continue;
      this.known.add(s.k);
      const name = s.v || s.k;
      let voice = this.voices.get(name);
      if (!voice) {
        voice = { phase: 0, amp: 0, segs: [], at: 0 };
        this.voices.set(name, voice);
      }
      // Keep each voice's strokes in order of start.
      let i = voice.segs.length;
      while (i > voice.at && voice.segs[i - 1].t0 > s.t0) i--;
      voice.segs.splice(i, 0, s);
    }
  }

  // How much of a tone at audio frequency f gets through.
  gain(f) {
    if (f <= 60 || f >= PASSBAND) return 0;
    if (f < 220) return 0.5 - 0.5 * Math.cos((Math.PI * (f - 60)) / 160);
    if (f > PASSBAND - 300) return 0.5 + 0.5 * Math.cos((Math.PI * (f - (PASSBAND - 300))) / 300);
    return 1;
  }

  random() {
    // xorshift32; Math.random is fine in a browser but this keeps tests repeatable
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }

  // Fill `out` with samples starting at UTC time t.
  render(out, t) {
    const n = out.length;
    const rate = this.rate;
    const dt = 1 / rate;
    const tEnd = t + n * dt;
    out.fill(0);
    let loudest = 0;

    for (const [name, voice] of this.voices) {
      const segs = voice.segs;
      // Drop strokes that are over.
      while (voice.at < segs.length && segs[voice.at].t1 <= t) voice.at++;
      if (voice.at > 32) {
        segs.splice(0, voice.at);
        voice.at = 0;
      }
      if (voice.at >= segs.length && voice.amp < 1e-4) {
        this.voices.delete(name);
        continue;
      }

      let i = 0;
      let at = voice.at;
      while (i < n) {
        const now = t + i * dt;
        while (at < segs.length && segs[at].t1 <= now) at++;
        const seg = at < segs.length ? segs[at] : null;
        const live = seg && seg.t0 <= now;
        // Run until this stroke ends or the next begins, whichever is first.
        const until = live ? seg.t1 : seg ? seg.t0 : tEnd;
        const j = Math.min(n, Math.max(i + 1, Math.ceil((until - t) * rate)));

        let target = 0;
        let decay = 1;
        let f = 0;
        let df = 0;
        if (live) {
          target = seg.a;
          if (seg.tau) {
            target *= Math.exp(-(now - seg.t0) / seg.tau);
            decay = Math.exp(-dt / seg.tau);
          }
          f = seg.f - this.dial;
          if (seg.f1 !== undefined) {
            const slope = (seg.f1 - seg.f) / (seg.t1 - seg.t0);
            f += slope * (now - seg.t0);
            df = slope * dt;
          }
          voice.f = f;
        } else f = voice.f || 0;

        const g = this.gain(f);
        if (g === 0 && voice.amp < 1e-4) {
          // Out of the passband and silent: nothing to add.
          if (live && seg.tau) voice.amp = 0;
          i = j;
          continue;
        }
        let amp = voice.amp;
        let phase = voice.phase;
        const k = this.smooth;
        for (; i < j; i++) {
          amp += (target - amp) * k;
          target *= decay;
          phase += TWO_PI * f * dt;
          f += df;
          out[i] += amp * g * Math.sin(phase);
        }
        voice.amp = amp;
        voice.phase = phase % TWO_PI;
        if (amp * g > loudest) loudest = amp * g;
      }
    }

    // Forget keys of strokes long gone, now and then.
    if (this.known.size > 6000) this.known.clear();

    // Automatic gain: a strong signal pushes the noise down.
    this.agc += (loudest - this.agc) * (loudest > this.agc ? 0.5 : 0.01);
    const signal = 0.26 / (1 + 0.5 * this.agc);
    const hiss = (0.085 * this.noise) / (1 + 3 * this.agc);

    // Noise: white, shaped to the passband, with the odd crash of static.
    const a1 = 1 - Math.exp((-TWO_PI * 2400) / rate);
    const ah = 1 - Math.exp((-TWO_PI * 260) / rate);
    if (this.crash <= 0 && this.random() < n / (rate * 5)) this.crash = 0.01 + 0.05 * this.random();
    for (let i = 0; i < n; i++) {
      const w = this.random() * 2 - 1;
      this.lp1 += (w - this.lp1) * a1;
      this.lp2 += (this.lp1 - this.lp2) * a1;
      this.hp += (this.lp2 - this.hp) * ah;
      let v = (this.lp2 - this.hp) * 3.2;
      if (this.crash > 0) {
        v *= 3.5;
        this.crash -= dt;
      }
      out[i] = Math.tanh(out[i] * signal + v * hiss);
    }
    return out;
  }
}

if (typeof registerProcessor === 'function') {
  registerProcessor(
    'loudspeaker',
    class extends AudioWorkletProcessor {
      constructor() {
        super();
        this.synth = new Synth(sampleRate);
        this.synth.seed = (Math.random() * 4294967296) >>> 0 || 1;
        this.offset = null; // UTC seconds minus context seconds
        this.port.onmessage = ({ data }) => {
          if (data.tune !== undefined) this.synth.tune(data.tune);
          if (data.clear) this.synth.clear();
          if (data.strokes) this.synth.add(data.strokes);
          if (data.noise !== undefined) this.synth.noise = data.noise;
          if (data.offset !== undefined) {
            // Small corrections are ignored; the two clocks drift slowly.
            if (this.offset === null || Math.abs(data.offset - this.offset) > 0.08) this.offset = data.offset;
          }
        };
      }

      process(inputs, outputs) {
        const out = outputs[0][0];
        if (!out || this.offset === null) return true;
        this.synth.render(out, currentFrame / sampleRate + this.offset);
        for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
        return true;
      }
    },
  );
}
