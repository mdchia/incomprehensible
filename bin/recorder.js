// The tape recorder: the loudspeaker, run without a browser.

import { PASSBAND, onAir } from '../lib/band.js';
import { Synth } from '../site/worklet.js';

// What a receiver tuned to `dial` (Hz) puts out for `seconds` from UTC
// time t0, as samples between -1 and 1.
export function record(dial, t0, seconds, sampleRate = 16000, noise = 1) {
  const synth = new Synth(sampleRate);
  synth.tune(dial);
  synth.noise = noise;
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  const block = sampleRate; // a second at a time
  for (let i = 0; i < samples.length; i += block) {
    const t = t0 + i / sampleRate;
    synth.add(onAir(t, t + 1, dial - 500, dial + PASSBAND + 500));
    synth.render(samples.subarray(i, Math.min(samples.length, i + block)), t);
  }
  return samples;
}

// Sixteen-bit, one channel.
export function wav(samples, sampleRate) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF', 0, 'ascii');
  data.writeUInt32LE(36 + samples.length * 2, 4);
  data.write('WAVEfmt ', 8, 'ascii');
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(1, 22); // mono
  data.writeUInt32LE(sampleRate, 24);
  data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36, 'ascii');
  data.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return data;
}
