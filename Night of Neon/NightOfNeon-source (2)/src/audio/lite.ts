// Lite-build audio helpers: shared static filters instead of one automated
// filter per note. A per-note biquad with a swept cutoff is the single most
// expensive thing in the procedural scores (coefficients recomputed every
// sample); sharing one static filter per layer costs almost nothing.

import { SFX } from "./sfx";

const shared = new WeakMap<AudioNode, Map<string, BiquadFilterNode>>();

/** One static filter per (destination, settings), created on first use. */
export function sharedFilter(dest: AudioNode, type: BiquadFilterType, f: number, q = 0.8): BiquadFilterNode {
  let m = shared.get(dest);
  if (!m) { m = new Map(); shared.set(dest, m); }
  const key = `${type}:${Math.round(f)}:${q}`;
  let n = m.get(key);
  if (!n || n.context !== dest.context) {
    n = dest.context.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q;
    n.connect(dest);
    m.set(key, n);
  }
  return n;
}

/** A single-oscillator bass pluck through a shared low-pass. */
export function liteBass(ctx: AudioContext, f: number, t: number, dur: number, peak: number, dest: AudioNode, cutoff: number, type: OscillatorType = "sawtooth") {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sharedFilter(dest, "lowpass", cutoff, 2));
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A noise hit (hat, snare, slap) through a shared filter. */
export function liteNoise(ctx: AudioContext, t: number, type: BiquadFilterType, f: number, q: number, amp: number, dur: number, dest: AudioNode) {
  const src = ctx.createBufferSource();
  src.buffer = SFX.noiseBuf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(amp, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(g).connect(sharedFilter(dest, type, f, q));
  src.start(t, Math.random());
  src.stop(t + dur + 0.02);
}
