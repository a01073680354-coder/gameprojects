// Stage 3 scores, procedural like the others.
//   ArchiveMusic    the Forgotten Archive: 84 BPM in E minor. A music box
//                   turning over a hushed choir, a slow drone, the tick of
//                   indexing machines; combat adds a soft pulse bass and
//                   brushed drums.
//   ArchivistMusic  the boss: a requiem waltz in C minor, 3/4 at 132 BPM.
//                   A pipe organ, a choir, timpani on the downbeat, a clock
//                   that never stops ticking; phase 2 adds a choir lead and
//                   running hats.

import { SFX } from "./sfx";
import { TUNE, LITE_MODE, musicAllowed } from "../config";
import { liteNoise, sharedFilter } from "./lite";

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const LOOK = 0.14;

/** The shared plumbing: scheduling loop, volume, ducking, intensity. */
export abstract class Score {
  protected ctx: AudioContext | null = null;
  protected master!: GainNode;
  private timer = 0;
  protected step = 0;
  private next = 0;
  intensity = 0;
  protected target = 0;
  private duckAmt = 1;
  playing = false;
  protected abstract readonly stepLen: number;
  protected abstract readonly loop: number;
  protected abstract readonly kind: "stage" | "arc" | "cha";
  protected abstract readonly gainMul: number;

  start(intensity = 0) {
    if (!musicAllowed(this.kind)) return;
    const ctx = SFX.ctx;
    if (!ctx) return;
    this.ctx = ctx;
    if (!this.master || this.master.context !== ctx) {
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(SFX.world);
      this.build(ctx);
    }
    this.target = Math.max(this.target, intensity);
    this.intensity = intensity;
    if (this.playing) { this.applyVolume(0.3); return; }
    this.playing = true;
    this.step = 0;
    this.next = ctx.currentTime + 0.05;
    this.duckAmt = 1;
    this.applyVolume(0.2);
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  stop(fade = 1.5) {
    if (!this.ctx || !this.playing) return;
    this.playing = false;
    window.clearInterval(this.timer);
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
  }

  setIntensity(x: number) { this.target = Math.max(0, Math.min(1, x)); }
  duck(amount: number, tc = 0.4) { this.duckAmt = amount; this.applyVolume(tc); }
  applyVolume(tc = 0.3) {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.playing ? TUNE.music * this.gainMul * this.duckAmt : 0, this.ctx.currentTime, tc);
  }

  private pump() {
    const ctx = this.ctx!;
    this.intensity += (this.target - this.intensity) * (1 - Math.exp(-0.025 * 1.4));
    this.levels(ctx.currentTime);
    while (this.next < ctx.currentTime + LOOK) {
      this.schedule(this.step, this.next);
      this.step = (this.step + 1) % this.loop;
      this.next += this.stepLen;
    }
  }

  protected abstract build(ctx: AudioContext): void;
  protected abstract levels(t0: number): void;
  abstract schedule(step: number, t: number): void;

  protected gain(v: number, dest: AudioNode = this.master) { const g = this.ctx!.createGain(); g.gain.value = v; g.connect(dest); return g; }
  protected send(from: AudioNode, amt: number) { const g = this.ctx!.createGain(); g.gain.value = amt; from.connect(g).connect(SFX.verb); }

  protected osc(type: OscillatorType, f: number, t: number, dur: number, peak: number, dest: AudioNode, attack = 0.004, detune = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  /** A held note with a slow swell (pads, organ). */
  protected pad(type: OscillatorType, f: number, t: number, dur: number, peak: number, dest: AudioNode, detune = 0, attack = 0.4) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    const g = ctx.createGain();
    const a = Math.min(attack, dur * 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + dur - a * 0.5);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.5);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.6);
  }

  protected noise(t: number, type: BiquadFilterType, f: number, q: number, amp: number, dur: number, dest: AudioNode, verb = 0) {
    const ctx = this.ctx!;
    if (LITE_MODE && !verb) { liteNoise(ctx, t, type, f, q, amp, dur, dest); return; }
    const src = ctx.createBufferSource();
    src.buffer = SFX.noiseBuf;
    const fl = ctx.createBiquadFilter();
    fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(dest);
    if (verb) { const sv = ctx.createGain(); sv.gain.value = verb; g.connect(sv).connect(SFX.verb); }
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  protected drum(t: number, f0: number, f1: number, dur: number, amp: number, dest: AudioNode, verb = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    if (verb) { const sv = ctx.createGain(); sv.gain.value = verb; g.connect(sv).connect(SFX.verb); }
    o.start(t); o.stop(t + dur + 0.05);
  }
}

// ------------------------------------------------------------- the archive

// Em  C  G  D  |  Em  C  Am  B7 : two bars each, 16th grid, 16 bars
const A_CHORDS = [[52, 55, 59, 66], [48, 52, 55, 59], [43, 50, 55, 59], [50, 54, 57, 64], [52, 55, 59, 66], [48, 52, 55, 62], [45, 52, 55, 60], [47, 51, 54, 57]];
const A_ROOTS = [40, 36, 43, 38, 40, 36, 45, 35];
const A_BOX = [3, 1, 2, 0, 2, 1, 3, 2]; // music-box figure (eighths), chord indices

export class ArchiveMusic extends Score {
  protected readonly stepLen = 60 / 84 / 4;
  protected readonly loop = 256;
  protected readonly kind = "stage" as const;
  protected readonly gainMul = 0.8;
  private choir!: GainNode;
  private box!: GainNode;
  private boxEcho!: GainNode;
  private bass!: GainNode;
  private drums!: GainNode;
  private ticks!: GainNode;
  private choirIn!: BiquadFilterNode;

  protected build(ctx: AudioContext) {
    this.choir = this.gain(0);
    this.choirIn = ctx.createBiquadFilter();
    this.choirIn.type = "bandpass"; this.choirIn.frequency.value = 520; this.choirIn.Q.value = 1.2;
    this.choirIn.connect(this.choir);
    this.send(this.choir, 1.0);
    this.box = this.gain(0);
    this.send(this.box, 0.7);
    const d = ctx.createDelay(2);
    d.delayTime.value = this.stepLen * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.45;
    const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 2400;
    this.boxEcho = ctx.createGain(); this.boxEcho.gain.value = 0.5;
    this.boxEcho.connect(d); d.connect(tone).connect(fb).connect(d); tone.connect(this.box);
    this.bass = this.gain(0);
    this.drums = this.gain(0);
    this.ticks = this.gain(0);
  }

  protected levels(t0: number) {
    const I = this.intensity;
    const r = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t0, 0.25);
    r(this.choir, 0.8 - 0.2 * I);
    r(this.box, 0.7 - 0.15 * I);
    r(this.ticks, 0.6);
    r(this.bass, I < 0.15 ? 0 : 0.7 * I + 0.2);
    r(this.drums, I < 0.15 ? 0 : 0.6 * I + 0.2);
  }

  schedule(step: number, t: number) {
    const bar = Math.floor(step / 16), s = step % 16;
    const ci = Math.floor(bar / 2) % 8;
    const chord = A_CHORDS[ci], root = A_ROOTS[ci];
    const S = this.stepLen, I = this.intensity;
    if (s === 0 && bar % 2 === 0) {
      for (const n of LITE_MODE ? chord.slice(0, 3) : chord) {
        this.pad("sawtooth", mtof(n), t, S * 32, LITE_MODE ? 0.03 : 0.022, this.choirIn, -5, 1.4);
        if (!LITE_MODE) this.pad("sawtooth", mtof(n), t, S * 32, 0.018, this.choirIn, 6, 1.6);
      }
      this.pad("sine", mtof(root - 12), t, S * 32, 0.05, this.choir, 0, 2);
    }
    // the music box: an eighth-note figure two octaves up, sparser in combat
    if (s % 2 === 0 && (I < 0.6 || s % 4 === 0)) {
      const n = chord[A_BOX[s / 2]] + 24;
      const v = s === 0 ? 0.05 : 0.035;
      this.osc("sine", mtof(n), t, 0.9, v, this.box, 0.002);
      if (!LITE_MODE) this.osc("sine", mtof(n) * 3.01, t, 0.25, v * 0.12, this.box, 0.001);
      this.osc("sine", mtof(n), t, 0.6, v * 0.7, this.boxEcho, 0.002);
    }
    // indexing machines: soft ticks, now and then a little run
    if (s === 6 || s === 14 || (bar % 4 === 3 && s >= 10 && s % 1 === 0 && s < 14)) this.noise(t, "bandpass", 4200, 8, 0.05, 0.03, this.ticks);
    // combat: a pulse bass and brushed drums
    if (I >= 0.15) {
      if (s % 2 === 0) this.osc("triangle", mtof(root - (s % 8 === 6 ? 0 : 12)), t, S * 1.6, s % 8 === 0 ? 0.16 : 0.1, sharedFilter(this.bass, "lowpass", 700, 1.2), 0.004);
      if (s === 0 || s === 10) this.drum(t, 110, 42, 0.36, 0.55, this.drums);
      if (s === 8) { this.noise(t, "bandpass", 1600, 0.6, 0.22, 0.22, this.drums, 0.5); this.osc("triangle", 190, t, 0.08, 0.1, this.drums); }
      if (s % 2 === 1 || I > 0.8) this.noise(t, "highpass", 7000, 0.7, s % 4 === 2 ? 0.035 : 0.02, 0.05, this.drums);
    }
  }
}

// ------------------------------------------------------------- the requiem

// Cm  Ab  Fm  G | Cm  Eb  Ab  G7 : two bars each, 3/4 eighths (6 per bar)
const R_CHORDS = [[48, 51, 55], [44, 48, 51], [41, 44, 48], [43, 47, 50], [48, 51, 55], [46, 51, 55], [44, 48, 51], [43, 47, 53]];
const R_ROOTS = [36, 32, 29, 31, 36, 39, 32, 31];
// the choir's lament (phase 2): [eighth within the 96-step loop, midi, length]
const R_LEAD: [number, number, number][] = [
  [0, 67, 6], [6, 68, 3], [9, 67, 3], [12, 65, 6], [18, 63, 6],
  [24, 65, 6], [30, 67, 3], [33, 65, 3], [36, 62, 12],
  [48, 67, 6], [54, 70, 6], [60, 68, 6], [66, 67, 6],
  [72, 68, 6], [78, 67, 3], [81, 65, 3], [84, 62, 12],
];

export class ArchivistMusic extends Score {
  protected readonly stepLen = 60 / 132 / 2;
  protected readonly loop = 96;
  protected readonly kind = "arc" as const;
  protected readonly gainMul = 0.5;
  private organ!: GainNode;
  private organLP!: BiquadFilterNode;
  private choir!: GainNode;
  private perc!: GainNode;
  private clock!: GainNode;
  private lead!: GainNode;
  private bass!: GainNode;

  protected build(ctx: AudioContext) {
    this.organ = this.gain(0);
    this.organLP = ctx.createBiquadFilter();
    this.organLP.type = "lowpass"; this.organLP.frequency.value = 1600; this.organLP.Q.value = 0.8;
    this.organLP.connect(this.organ);
    this.send(this.organ, 0.9);
    this.choir = this.gain(0);
    const vf = ctx.createBiquadFilter(); vf.type = "bandpass"; vf.frequency.value = 700; vf.Q.value = 1.4;
    vf.connect(this.choir);
    (this as any).choirIn = vf;
    this.send(this.choir, 1.0);
    this.perc = this.gain(0);
    this.clock = this.gain(0);
    this.lead = this.gain(0);
    this.send(this.lead, 0.9);
    this.bass = this.gain(0);
  }

  protected levels(t0: number) {
    const I = this.intensity;
    const r = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t0, 0.25);
    r(this.organ, 0.55 + 0.2 * I);
    r(this.choir, 0.8 - 0.2 * I);
    r(this.clock, 0.7);
    r(this.perc, I < 0.2 ? 0.3 : 0.6 + 0.4 * I);
    r(this.bass, I < 0.2 ? 0 : 0.75);
    r(this.lead, I > 0.8 ? 0.6 * (I - 0.8) / 0.2 : 0);
    this.organLP.frequency.setTargetAtTime(1200 + 1400 * I, t0, 0.4);
  }

  schedule(step: number, t: number) {
    const bar = Math.floor(step / 6), e = step % 6;
    const ci = Math.floor(bar / 2) % 8;
    const chord = R_CHORDS[ci], root = R_ROOTS[ci];
    const S = this.stepLen, I = this.intensity;
    const choirIn = (this as any).choirIn as AudioNode;
    // organ: the chord held over two bars, with a pedal note below
    if (e === 0 && bar % 2 === 0) {
      for (const n of chord) {
        this.pad("square", mtof(n), t, S * 12, LITE_MODE ? 0.03 : 0.02, this.organLP, 0, 0.05);
        if (!LITE_MODE) this.pad("sawtooth", mtof(n + 12), t, S * 12, 0.012, this.organLP, 4, 0.05);
      }
      this.pad("square", mtof(root - 12), t, S * 12, 0.035, this.organLP, 0, 0.05);
      for (const n of LITE_MODE ? [chord[0] + 12] : [chord[0] + 12, chord[2] + 12]) this.pad("sawtooth", mtof(n), t, S * 12, 0.03, choirIn, -6, 0.9);
    }
    // the waltz: bass on one, organ stabs on two and three
    if (I >= 0.2) {
      if (e === 0) this.osc("triangle", mtof(root - 12), t, S * 2.2, 0.22, sharedFilter(this.bass, "lowpass", 600, 1), 0.005);
      if (e === 2 || e === 4) for (const n of chord) this.osc("square", mtof(n + 12), t, S * 0.8, 0.012, this.organLP, 0.004);
    }
    // timpani on the downbeat, a roll into each chord change
    if (e === 0) this.drum(t, 90, 60, 0.7, bar % 2 === 0 ? 0.6 : 0.35, this.perc, 0.5);
    if (I > 0.5 && bar % 2 === 1 && e >= 4) this.drum(t, 80, 62, 0.25, 0.25, this.perc, 0.3);
    // the clock: tick-tock on every beat
    if (e % 2 === 0) this.noise(t, "bandpass", e === 0 ? 2600 : 3400, 10, 0.07, 0.04, this.clock, LITE_MODE ? 0 : 0.2);
    if (I > 0.8) this.noise(t, "highpass", 8000, 0.7, e % 2 ? 0.02 : 0.035, 0.04, this.perc);
    // the choir's lament (phase 2)
    if (I > 0.8) {
      for (const [at, n, len] of R_LEAD) {
        if (at !== step) continue;
        for (const det of LITE_MODE ? [0] : [-7, 7]) this.pad("sawtooth", mtof(n), t, len * S, LITE_MODE ? 0.05 : 0.035, sharedFilter(this.lead, "bandpass", 900, 1.2), det, 0.12);
      }
    }
  }
}

export const ARCHIVE_MUSIC = new ArchiveMusic();
export const ARCHIVIST_MUSIC = new ArchivistMusic();
