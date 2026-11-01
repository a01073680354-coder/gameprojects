// STAGE 1 scores (bible v3, 1-01..1-07), procedural like the others.
//   OutskirtsMusic  the rain-soaked edge of the city: 70 BPM in D minor.
//                   An old upright piano, slightly out of tune, played into
//                   the rain; a low drone under it. When the squad is near, a
//                   frame drum and a low pulse come in under the same piano,
//                   and a bowed note swells on each chord change.
//   ChiefMusic      차승호: heavy and plain. 96 BPM in E phrygian. A kick on
//                   every beat, a clanking metal hit on two and four, a
//                   gritty bass ostinato, and a siren that rises with the
//                   fight. Nothing grand: a tired man doing a job.

import { LITE_MODE } from "../config";
import { Score } from "./archivemusic";
import { sharedFilter } from "./lite";

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// Dm  Bb  F  C | Gm  Bb  A  A : two bars each, eighth grid (8 per bar), 16 bars
const O_CHORDS = [[50, 53, 57, 62], [46, 50, 53, 58], [45, 48, 53, 57], [43, 48, 52, 55], [43, 46, 50, 55], [46, 50, 53, 57], [45, 49, 52, 57], [45, 49, 52, 55]];
const O_ROOTS = [38, 34, 41, 36, 31, 34, 33, 33];
// the right hand: [eighth in the two-bar cell, chord index (4 = an octave up on the top note)]
const O_FIG: [number, number][] = [[0, 0], [2, 2], [3, 3], [5, 1], [6, 2], [8, 4], [11, 2], [13, 3]];
// a melody that comes in on the second time round: [eighth in the 128 loop, midi, eighths]
const O_MELODY: [number, number, number][] = [
  [64, 69, 3], [67, 67, 1], [68, 65, 4], [72, 64, 2], [74, 62, 6],
  [80, 65, 3], [83, 64, 1], [84, 62, 4], [88, 60, 2], [90, 58, 6],
  [96, 62, 3], [99, 65, 1], [100, 67, 4], [104, 65, 2], [106, 64, 6],
  [112, 61, 4], [116, 64, 2], [118, 69, 10],
];

export class OutskirtsMusic extends Score {
  protected readonly stepLen = 60 / 70 / 2;
  protected readonly loop = 128;
  protected readonly kind = "stage" as const;
  protected readonly gainMul = 0.85;
  private piano!: GainNode;
  private drone!: GainNode;
  private bow!: GainNode;
  private perc!: GainNode;
  private bass!: GainNode;

  protected build(ctx: AudioContext) {
    this.piano = this.gain(0);
    this.send(this.piano, 0.8);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320; lp.Q.value = 0.7;
    this.drone = this.gain(0);
    lp.connect(this.drone);
    (this as any).droneIn = lp;
    this.bow = this.gain(0);
    this.send(this.bow, 0.9);
    this.perc = this.gain(0);
    this.bass = this.gain(0);
  }

  protected levels(t0: number) {
    const I = this.intensity;
    const r = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t0, 0.3);
    r(this.piano, 0.8 - 0.15 * I);
    r(this.drone, 0.6);
    r(this.bow, I < 0.15 ? 0 : 0.5 * I + 0.15);
    r(this.perc, I < 0.15 ? 0 : 0.55 * I + 0.25);
    r(this.bass, I < 0.15 ? 0 : 0.6 * I + 0.15);
  }

  /** One piano note: a struck sine with a faint detuned partner and a hammer tick. */
  private key(m: number, t: number, v: number, len = 1.6) {
    const f = mtof(m);
    this.osc("triangle", f, t, len, v, this.piano, 0.003);
    if (!LITE_MODE) {
      this.osc("sine", f * 1.004, t, len * 0.8, v * 0.5, this.piano, 0.003);
      this.osc("sine", f * 2, t, len * 0.3, v * 0.15, this.piano, 0.002);
    }
  }

  schedule(step: number, t: number) {
    const cell = step % 16;
    const ci = Math.floor(step / 16) % 8;
    const chord = O_CHORDS[ci], root = O_ROOTS[ci];
    const S = this.stepLen, I = this.intensity;
    const droneIn = (this as any).droneIn as AudioNode;
    if (cell === 0) {
      // left hand: root and fifth, low; the drone holds the root
      this.key(root, t, 0.07, 3.2);
      this.key(root + 7, t + 0.02, 0.04, 2.6);
      this.pad("sawtooth", mtof(root - 12), t, S * 16, 0.05, droneIn, 0, 1.2);
      if (I >= 0.15) {
        for (const n of LITE_MODE ? [chord[1] + 12] : [chord[1] + 12, chord[3]]) this.pad("sawtooth", mtof(n), t, S * 15, 0.02, sharedFilter(this.bow, "lowpass", 1400, 0.8), 5, 1.1);
      }
    }
    // right hand: a slow broken chord, sparser when the fight is on
    for (const [at, k] of O_FIG) {
      if (at !== cell || (I > 0.6 && at % 4 !== 0)) continue;
      const n = k === 4 ? chord[3] + 12 : chord[k] + 12;
      this.key(n, t + (Math.random() - 0.5) * 0.012, at === 0 ? 0.05 : 0.035);
    }
    // the melody, second half of the loop only
    for (const [at, n, len] of O_MELODY) if (at === step) this.key(n + 12, t, 0.045, Math.max(1.2, len * S * 1.6));
    // the squad is near: a frame drum on one and the "and" of three, a low pulse
    if (I >= 0.15) {
      const b = cell % 8;
      if (b === 0) this.drum(t, 92, 48, 0.5, 0.5, this.perc, 0.3);
      if (b === 5) this.drum(t, 80, 50, 0.3, 0.3, this.perc, 0.2);
      if (b === 4) this.noise(t, "bandpass", 900, 0.8, 0.12, 0.18, this.perc, 0.4);
      if (b % 2 === 0) this.osc("triangle", mtof(root - 12), t, S * 1.4, b === 0 ? 0.16 : 0.09, sharedFilter(this.bass, "lowpass", 500, 1), 0.006);
      if (I > 0.8 && b % 2 === 1) this.noise(t, "highpass", 6500, 0.7, 0.02, 0.05, this.perc);
    }
  }
}

// E phrygian: E F G A B C D. A two-bar riff on the 16th grid.
const C_RIFF: [number, number][] = [[0, 28], [3, 28], [6, 29], [8, 28], [11, 28], [14, 31], [16, 28], [19, 28], [22, 29], [24, 33], [26, 31], [28, 29], [30, 28]];
const C_STAB = [[52, 55, 59], [53, 57, 60], [52, 55, 59], [50, 53, 57]];

export class ChiefMusic extends Score {
  protected readonly stepLen = 60 / 96 / 4;
  protected readonly loop = 128;
  protected readonly kind = "cha" as const;
  protected readonly gainMul = 0.55;
  private kick!: GainNode;
  private metal!: GainNode;
  private bass!: GainNode;
  private bassLP!: BiquadFilterNode;
  private stab!: GainNode;
  private siren!: GainNode;

  protected build(ctx: AudioContext) {
    this.kick = this.gain(0);
    this.metal = this.gain(0);
    this.send(this.metal, 0.5);
    this.bassLP = ctx.createBiquadFilter();
    this.bassLP.type = "lowpass"; this.bassLP.frequency.value = 500; this.bassLP.Q.value = 3;
    this.bass = this.gain(0);
    this.bassLP.connect(this.bass);
    this.stab = this.gain(0);
    this.send(this.stab, 0.6);
    this.siren = this.gain(0);
    this.send(this.siren, 0.8);
  }

  protected levels(t0: number) {
    const I = this.intensity;
    const r = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t0, 0.25);
    r(this.kick, 0.9);
    r(this.metal, 0.55);
    r(this.bass, 0.75);
    r(this.stab, 0.35 + 0.3 * I);
    r(this.siren, I > 0.3 ? 0.25 + 0.35 * I : 0.12);
    this.bassLP.frequency.setTargetAtTime(420 + 700 * I, t0, 0.4);
  }

  schedule(step: number, t: number) {
    const s = step % 32, bar = Math.floor(step / 16);
    const S = this.stepLen, I = this.intensity;
    // kick on the beat; a double on the last beat of every other bar
    if (s % 4 === 0) this.drum(t, 120, 40, 0.32, 0.8, this.kick);
    if (s === 30 && bar % 4 === 3) this.drum(t, 110, 40, 0.2, 0.5, this.kick);
    // the clank: a struck pipe on two and four
    if (s % 8 === 4) {
      this.noise(t, "bandpass", 1900, 6, 0.3, 0.16, this.metal, 0.4);
      this.osc("square", 311, t, 0.09, 0.04, this.metal, 0.001);
      if (!LITE_MODE) this.osc("square", 467, t, 0.07, 0.03, this.metal, 0.001);
    }
    if (I > 0.6 && s % 2 === 1) this.noise(t, "highpass", 7500, 0.8, 0.025, 0.04, this.metal);
    // the riff
    for (const [at, n] of C_RIFF) {
      if (at !== s) continue;
      this.osc("sawtooth", mtof(n), t, S * 2.2, 0.16, this.bassLP, 0.004);
      if (!LITE_MODE) this.osc("square", mtof(n + 12), t, S * 1.6, 0.05, this.bassLP, 0.004, 8);
    }
    // stabs on each bar
    if (s % 16 === 0) for (const n of C_STAB[bar % 4]) this.osc("sawtooth", mtof(n), t, S * 3, 0.03, sharedFilter(this.stab, "lowpass", 1500, 1), 0.006);
    // the siren: a slow rise and fall every four bars
    if (step % 64 === 0) {
      const ctx = this.ctx!;
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(mtof(64), t);
      o.frequency.linearRampToValueAtTime(mtof(71), t + S * 32);
      o.frequency.linearRampToValueAtTime(mtof(64), t + S * 64);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03, t + S * 16);
      g.gain.linearRampToValueAtTime(0, t + S * 63);
      o.connect(g).connect(this.siren);
      o.start(t); o.stop(t + S * 64 + 0.1);
    }
  }
}

export const OUTSKIRTS_MUSIC = new OutskirtsMusic();
export const CHIEF_MUSIC = new ChiefMusic();
