/* The mock library's basic sound and video: a tone made here as a WAV, a note of a pentatonic scale chosen by the
 * seed, and a short H.264 clip. The other compressed formats are in lib/mocks/formats/clips.ts. */

import { hash53 } from "../rng";

/** A short tone as a WAV file (8 kHz, 8-bit, mono): a note of a pentatonic scale chosen by the seed, faded in and out. */
export function wavTone(o: { seed: string; ms?: number }): Uint8Array {
  const rate = 8000;
  const n = Math.round((rate * Math.min(5000, Math.max(100, o.ms ?? 900))) / 1000);
  const notes = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
  const freq = notes[hash53(o.seed) % notes.length];
  const out = new Uint8Array(44 + n);
  const view = new DataView(out.buffer);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + n, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, n, true);
  const fade = Math.min(400, n / 4);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / fade, (n - i) / fade);
    out[44 + i] = Math.round(128 + 90 * env * Math.sin((2 * Math.PI * freq * i) / rate));
  }
  return out;
}

/** a two-second clip (96×54, H.264 baseline, a moving gradient): the same for every video, which is all a
 *  placeholder needs; made once with ffmpeg and kept here as base64 */
export const CLIP_MP4 =
  "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";
