// STAGE 2 scores (bible v3, 2-01..2-07), procedural like the others.
//   MarketMusic   the undercity market: 88 BPM in A minor pentatonic. A
//                 plucked zither-like line over a generator's hum and a soft
//                 hand drum; a radio somewhere plays a little out of reach.
//                 When the search squad is near, a tight pulse and a low
//                 two-note alarm pad come up under the same pluck.
//   BulwarkMusic  방벽: 116 BPM, D minor. Hydraulic hiss on the offbeat, a
//                 clanking anvil pattern, a gritty bass that steps like a
//                 machine, and a warning tone that rises when the shield is
//                 gone (intensity 1).

import { LITE_MODE } from "../config";
import { Score } from "./archivemusic";
import { sharedFilter } from "./lite";

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// A minor pentatonic: A C D E G. Chords: Am F G Em (two bars each), 8ths
const M_ROOT = [45, 41, 43, 40];
const M_PAD = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
// the pluck line: [8th in the 64-step loop, midi]
const M_LINE: [number, number][] = [
  [0, 69], [2, 72], [3, 74], [4, 76], [6, 74], [8, 72], [10, 69],
  [16, 69], [18, 72], [20, 74], [21, 72], [22, 69], [24, 67],
  [32, 64], [34, 67], [35, 69], [36, 72], [38, 74], [40, 76], [42, 79], [44, 76],
  [48, 74], [50, 72], [52, 69], [54, 67], [56, 69], [60, 64],
];

export class MarketMusic extends Score {
  protected readonly stepLen = 60 / 88 / 2;
  protected readonly loop = 64;
  protected readonly kind = "stage" as const;
  protected readonly gainMul = 0.8;
  private pluck!: GainNode;
  private hum!: GainNode;
  private perc!: GainNode;
  private padBus!: GainNode;
  private pulse!: GainNode;
  private radio!: GainNode;

  protected build(ctx: AudioContext) {
    this.pluck = this.gain(0);
    this.send(this.pluck, 0.7);
    this.hum = this.gain(0);
    this.perc = this.gain(0);
    this.send(this.perc, 0.2);
    this.padBus = this.gain(0);
    this.send(this.padBus, 0.8);
    this.pulse = this.gain(0);
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1400; bp.Q.value = 2.5;
    this.radio = this.gain(0);
    bp.connect(this.radio);
    (this as any).radioIn = bp;
  }

  protected levels(t0: number) {
    const I = this.intensity;
    const r = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t0, 0.3);
    r(this.pluck, 0.75 - 0.2 * I);
    r(this.hum, 0.5);
    r(this.perc, 0.5 + 0.2 * I);
    r(this.radio, 0.35 * (1 - I));
    r(this.padBus, I < 0.15 ? 0 : 0.55 * I);
    r(this.pulse, I < 0.15 ? 0 : 0.7 * I + 0.1);
  }

  /** A plucked string: a bright attack that dies fast, a little detuned body. */
  private pl(m: number, t: number, v: number) {
    const f = mtof(m);
    this.osc("sawtooth", f, t, 0.5, v * 0.5, sharedFilter(this.pluck, "lowpass", 2400, 1.5), 0.002);
    this.osc("triangle", f * 1.003, t, 0.9, v, this.pluck, 0.002);
    if (!LITE_MODE) this.osc("sine", f * 2, t, 0.25, v * 0.3, this.pluck, 0.001);
  }

  schedule(step: number, t: number) {
    const bar = Math.floor(step / 8), e = step % 8;
    const ci = Math.floor(bar / 2) % 4;
    const S = this.stepLen, I = this.intensity;
    // the generator hum, re-struck each bar so it breathes
    if (e === 0) {
      this.osc("sawtooth", 55, t, S * 8.5, 0.03, sharedFilter(this.hum, "lowpass", 160, 0.7), 0.3);
      this.osc("sine", 110, t, S * 8.5, 0.02, this.hum, 0.3);
    }
    // the pluck line, an octave lower and sparser when the raid is on
    for (const [at, m] of M_LINE) if (at === step && (I < 0.6 || at % 4 === 0)) this.pl(I > 0.6 ? m - 12 : m, t, at % 8 === 0 ? 0.06 : 0.045);
    // a bass pluck on the chord root
    if (e === 0 || e === 5) this.pl(M_ROOT[ci] - (e === 5 ? 0 : 12), t, 0.05);
    // the hand drum: a low tock and a slap
    if (e === 0 || e === 3) this.drum(t, 150, 70, 0.22, 0.4, this.perc);
    if (e === 4) this.noise(t, "bandpass", 1800, 1.2, 0.12, 0.08, this.perc);
    if (e === 6 && bar % 2) this.noise(t, "bandpass", 2400, 1.5, 0.06, 0.05, this.perc);
    // a radio two stalls away: a thin melody through a cheap speaker
    if (bar % 4 === 2 && (e === 0 || e === 2 || e === 4)) {
      const rin = (this as any).radioIn as AudioNode;
      this.osc("square", mtof([76, 79, 81][e / 2]), t, S * 1.6, 0.02, rin, 0.01);
    }
    // the raid: a tight pulse and a two-note alarm pad
    if (I >= 0.15) {
      if (e % 2 === 0) this.osc("square", mtof(M_ROOT[ci] - 12), t, S * 0.6, 0.06, sharedFilter(this.pulse, "lowpass", 600, 2), 0.003);
      if (e === 0 && bar % 2 === 0) for (const n of M_PAD[ci]) this.pad("sawtooth", mtof(n), t, S * 15, 0.018, sharedFilter(this.padBus, "lowpass", 1100, 0.8), 6, 0.6);
      if (I > 0.8 && e % 2 === 1) this.noise(t, "highpass", 7000, 0.7, 0.025, 0.04, this.perc);
    }
  }
}

// D minor: the riff steps D D F D G F E C# on 16ths
const B_RIFF: [number, number][] = [[0, 26], [2, 26], [4, 29], [6, 26], [8, 31], [10, 29], [12, 28], [14, 25]];

export class BulwarkMusic extends Score {
  protected readonly stepLen = 60 / 116 / 4;
  protected readonly loop = 64;
  protected readonly kind = "cha" as const;
  protected readonly gainMul = 0.55;
  private kick!: GainNode;
  private anvil!: GainNode;
  private hiss!: GainNode;
  private bass!: GainNode;
  private bassLP!: BiquadFilterNode;
  private warn!: GainNode;

  protected build(ctx: AudioContext) {
    this.kick = this.gain(0);
    this.anvil = this.gain(0);
    this.send(this.anvil, 0.45);
    this.hiss = this.gain(0);
    this.bassLP = ctx.createBiquadFilter();
    this.bassLP.type = "lowpass"; this.bassLP.frequency.value = 480; this.bassLP.Q.value = 4;
    this.bass = this.gain(0);
    this.bassLP.connect(this.bass);
    this.warn = this.gain(0);
    this.send(this.warn, 0.6);
  }

  protected levels(t0: number) {
    const I = this.intensity;
    const r = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t0, 0.25);
    r(this.kick, 0.9);
    r(this.anvil, 0.5);
    r(this.hiss, 0.4);
    r(this.bass, 0.8);
    r(this.warn, I > 0.8 ? 0.4 : 0);
    this.bassLP.frequency.setTargetAtTime(420 + 900 * I, t0, 0.4);
  }

  schedule(step: number, t: number) {
    const s = step % 16, bar = Math.floor(step / 16);
    const S = this.stepLen, I = this.intensity;
    // a machine's gait: kick on 1 and the "and" of 2, a double at the turn
    if (s === 0 || s === 6 || s === 8) this.drum(t, 110, 38, 0.3, 0.85, this.kick);
    if (s === 14 && bar % 2) this.drum(t, 100, 38, 0.2, 0.5, this.kick);
    // the anvil: a struck plate on 2 and 4
    if (s === 4 || s === 12) {
      this.osc("square", 523, t, 0.12, 0.05, this.anvil, 0.001);
      if (!LITE_MODE) this.osc("square", 787, t, 0.09, 0.035, this.anvil, 0.001);
      this.noise(t, "bandpass", 3200, 5, 0.18, 0.1, this.anvil);
    }
    // hydraulics on the offbeats
    if (s % 4 === 2) this.noise(t, "highpass", 3000, 0.6, 0.05, 0.12, this.hiss);
    if (I > 0.6 && s % 2 === 1) this.noise(t, "highpass", 7500, 0.8, 0.02, 0.04, this.hiss);
    // the riff
    for (const [at, n] of B_RIFF) {
      if (at !== s) continue;
      this.osc("sawtooth", mtof(n + (bar % 4 === 3 && at >= 8 ? 2 : 0)), t, S * 1.8, 0.15, this.bassLP, 0.004);
      if (!LITE_MODE) this.osc("square", mtof(n + 12), t, S * 1.2, 0.04, this.bassLP, 0.004, 9);
    }
    // the warning tone once the shield is gone: a rising two-step every bar
    if (I > 0.8 && (s === 0 || s === 8)) this.osc("triangle", mtof(s === 0 ? 74 : 77), t, S * 6, 0.03, this.warn, 0.02);
  }
}

export const MARKET_MUSIC = new MarketMusic();
export const BULWARK_MUSIC = new BulwarkMusic();
