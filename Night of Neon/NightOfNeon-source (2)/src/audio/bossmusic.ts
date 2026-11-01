// 홍귀's theme: procedural, 132 BPM, D with a Japanese "in" scale colour
// (D Eb G A Bb C). Taiko and a distorted bass drive it; a koto-like pluck
// carries the riff and a cutting lead joins in the second half.
// Intensity: 0 = drone + taiko only (entrance), 0.6 = phase one,
// 1 = phase two (lead, double hats). Runs through the world bus like the
// stage music, so slow motion bends it too.

import { SFX } from "./sfx";
import { TUNE, LITE_MODE, musicAllowed } from "../config";
import { liteBass, liteNoise } from "./lite";

const BPM = 132;
const S16 = 60 / BPM / 4;
const LOOK = 0.14;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// 8 bars
const ROOTS = [38, 38, 39, 38, 34, 36, 39, 33];
// koto riff, 2 bars of 16ths (null = rest)
const _ = null;
const RIFF: (number | null)[] = [
  74, _, _, 72, 70, _, 69, _, 70, _, 67, _, 69, _, _, _,
  74, _, _, 75, 74, _, 72, _, 70, _, 69, _, 67, _, 62, _,
];
const RIFF_B: (number | null)[] = [
  70, _, _, 69, 67, _, 63, _, 62, _, 63, _, 67, _, _, _,
  69, _, _, 70, 72, _, 70, _, 69, _, 67, _, 69, _, _, _,
];
// lead over bars 5-8: [step within the 4 bars, midi, length in 16ths]
const LEAD: [number, number, number][] = [
  [0, 74, 8], [8, 75, 4], [12, 74, 4],
  [16, 72, 6], [22, 70, 2], [24, 69, 8],
  [32, 70, 4], [36, 69, 4], [40, 67, 4], [44, 63, 4],
  [48, 62, 14],
];

export class BossMusic {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private drone!: GainNode;
  private taiko!: GainNode;
  private drums!: GainNode;
  private bass!: GainNode;
  private koto!: GainNode;
  private lead!: GainNode;
  private echo!: GainNode;
  private timer = 0;
  private step = 0;
  private next = 0;
  intensity = 0;
  private target = 0;
  private duckAmt = 1;
  playing = false;
  private shaper!: WaveShaperNode;

  start(intensity = 0) {
    if (!musicAllowed("oni")) return;
    const ctx = SFX.ctx;
    if (!ctx) return;
    this.ctx = ctx;
    if (!this.master) this.build(ctx);
    this.target = intensity;
    this.intensity = intensity;
    if (this.playing) { this.applyVolume(0.3); return; }
    this.playing = true;
    this.step = 0;
    this.next = ctx.currentTime + 0.05;
    this.duckAmt = 1;
    this.applyVolume(0.15);
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  stop(fade = 1.5) {
    if (!this.ctx || !this.playing) return;
    this.playing = false;
    window.clearInterval(this.timer);
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
  }

  setIntensity(x: number) { this.target = Math.max(0, Math.min(1, x)); }

  duck(amount: number, tc = 0.4) {
    this.duckAmt = amount;
    this.applyVolume(tc);
  }

  applyVolume(tc = 0.3) {
    if (!this.ctx || !this.master) return;
    const v = this.playing ? TUNE.music * 0.33 * this.duckAmt : 0; // ~1.4x the stage music: it must not bury the parries
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  private build(ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(SFX.world);
    const mk = (v: number, dest: AudioNode = this.master) => { const g = ctx.createGain(); g.gain.value = v; g.connect(dest); return g; };
    const droneLP = ctx.createBiquadFilter();
    droneLP.type = "lowpass";
    droneLP.frequency.value = 520;
    this.drone = mk(0.8);
    droneLP.connect(this.drone);
    (this as any).droneLP = droneLP;
    this.taiko = mk(1);
    this.drums = mk(0);
    // bass goes through a soft clipper for grit
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const v = i / 256 - 1; curve[i] = Math.tanh(v * 3.2); }
    this.shaper.curve = curve;
    const bassLP = ctx.createBiquadFilter();
    bassLP.type = "lowpass";
    bassLP.frequency.value = 1800;
    this.bass = mk(0);
    this.shaper.connect(bassLP).connect(this.bass);
    this.koto = mk(0.5);
    this.lead = mk(0);
    // a short slap echo on the koto and lead
    const delay = ctx.createDelay(1);
    delay.delayTime.value = S16 * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    this.echo = ctx.createGain();
    this.echo.gain.value = 0.35;
    this.echo.connect(delay);
    delay.connect(tone).connect(fb).connect(delay);
    tone.connect(this.koto);
  }

  private pump() {
    const ctx = this.ctx!;
    const k = 1 - Math.exp(-0.025 * 1.6);
    this.intensity += (this.target - this.intensity) * k;
    const I = this.intensity;
    const t0 = ctx.currentTime;
    const ramp = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t0, 0.12);
    ramp(this.drone, 0.9 - 0.3 * I);
    ramp(this.taiko, 0.8 + 0.2 * I);
    ramp(this.drums, I < 0.2 ? 0 : 0.35 + 0.65 * I);
    ramp(this.bass, I < 0.2 ? 0 : 0.5 + 0.4 * I);
    ramp(this.koto, I < 0.2 ? 0.25 : 0.5 + 0.15 * I);
    ramp(this.lead, I > 0.8 ? 0.55 * (I - 0.8) / 0.2 : 0);
    ((this as any).droneLP as BiquadFilterNode).frequency.setTargetAtTime(420 + 900 * I, t0, 0.3);
    while (this.next < ctx.currentTime + LOOK) {
      this.schedule(this.step, this.next);
      this.step = (this.step + 1) % 128;
      this.next += S16;
    }
  }

  private osc(type: OscillatorType, f: number, t: number, dur: number, peak: number, dest: AudioNode, attack = 0.004, detune = 0, bend = 1) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (bend !== 1) o.frequency.exponentialRampToValueAtTime(f * bend, t + Math.min(dur, 0.08));
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private schedule(step: number, t: number) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const root = ROOTS[bar];
    const I = this.intensity;

    // drone: root + fifth, re-struck every two bars
    if (s === 0 && bar % 2 === 0) {
      const voices: [number, number][] = LITE_MODE ? [[root, 0], [root + 7, 0]] : [[root, -7], [root, 7], [root + 7, 0], [root - 12, 0]];
      for (const [n, det] of voices) {
        this.osc("sawtooth", mtof(n), t, S16 * 32 + 0.3, 0.05, (this as any).droneLP, 0.6, det);
      }
    }

    // taiko: "don, do-don" with a roll into every 4th bar
    const don = [0, 3, 6, 8, 11, 14];
    if (don.includes(s)) this.taikoHit(t, s === 0 || s === 8 ? 1 : 0.6, s === 0 ? 1 : 0);
    if (bar % 4 === 3 && s >= 12) this.taikoHit(t, 0.35 + (s - 12) * 0.15, 0);

    // drum kit
    if (s === 0 || s === 8 || (s === 10 && bar % 2)) this.kick(t);
    if (s === 4 || s === 12) this.snare(t, 1);
    if (I > 0.85 || s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.1 : 0.05);

    // driving bass: root 16ths with octave stabs
    {
      const n = s % 8 === 6 ? root + 12 : s % 16 === 14 ? root + 7 : root;
      this.bassNote(mtof(n), t, S16 * 0.85, s % 4 === 0 ? 0.2 : 0.13);
    }

    // koto riff (B riff on the second half of the loop)
    {
      const riff = bar >= 4 ? RIFF_B : RIFF;
      const n = riff[step % 32];
      if (n !== null) {
        const f = mtof(n);
        this.osc("triangle", f, t, 0.32, 0.12, this.koto, 0.002, 0, 0.995);
        if (!LITE_MODE) this.osc("square", f * 2, t, 0.06, 0.03, this.koto, 0.001);
        this.osc("triangle", f, t, 0.3, 0.06, this.echo, 0.002);
      }
    }

    // lead (phase two): bars 5-8
    if (bar >= 4 && I > 0.8) {
      const rel = step - 64;
      for (const [at, n, len] of LEAD) {
        if (at !== rel) continue;
        const dur = len * S16;
        for (const det of LITE_MODE ? [0] : [-8, 8]) {
          const o = this.osc("sawtooth", mtof(n), t, dur + 0.05, LITE_MODE ? 0.085 : 0.06, this.lead, 0.03, det);
          const lfo = this.ctx!.createOscillator();
          lfo.frequency.value = 5.5;
          const lg = this.ctx!.createGain();
          lg.gain.setValueAtTime(0, t);
          lg.gain.linearRampToValueAtTime(6, t + dur);
          lfo.connect(lg).connect(o.detune);
          lfo.start(t);
          lfo.stop(t + dur + 0.1);
        }
        this.osc("square", mtof(n - 12), t, dur, 0.025, this.lead, 0.03);
      }
    }
  }

  private taikoHit(t: number, amp: number, accent: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(accent ? 120 : 140, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * amp, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(this.taiko);
    const sv = ctx.createGain();
    sv.gain.value = 0.35;
    g.connect(sv).connect(SFX.verb);
    o.start(t);
    o.stop(t + 0.6);
    // skin slap
    if (LITE_MODE) { liteNoise(ctx, t, "bandpass", 600, 1.2, 0.35 * amp, 0.08, this.taiko); return; }
    const src = ctx.createBufferSource();
    src.buffer = SFX.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 600;
    f.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.35 * amp, t + 0.002);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    src.connect(f).connect(ng).connect(this.taiko);
    src.start(t, Math.random());
    src.stop(t + 0.1);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.85, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.32);
  }

  private snare(t: number, amp: number) {
    const ctx = this.ctx!;
    if (LITE_MODE) {
      liteNoise(ctx, t, "bandpass", 2200, 0.7, 0.5 * amp, 0.2, this.drums);
      this.osc("triangle", 200, t, 0.09, 0.25 * amp, this.drums, 0.002);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = SFX.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 2200;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * amp, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    src.connect(f).connect(g).connect(this.drums);
    const sv = ctx.createGain();
    sv.gain.value = 0.55;
    g.connect(sv).connect(SFX.verb);
    src.start(t, Math.random());
    src.stop(t + 0.25);
    this.osc("triangle", 200, t, 0.09, 0.25 * amp, this.drums, 0.002);
  }

  private hat(t: number, amp: number) {
    const ctx = this.ctx!;
    if (LITE_MODE) { liteNoise(ctx, t, "highpass", 8000, 0.7, amp, 0.04, this.drums); return; }
    const src = ctx.createBufferSource();
    src.buffer = SFX.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 8000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(f).connect(g).connect(this.drums);
    src.start(t, Math.random());
    src.stop(t + 0.06);
  }

  private bassNote(f: number, t: number, dur: number, peak: number) {
    const ctx = this.ctx!;
    if (LITE_MODE) { liteBass(ctx, f, t, dur, peak * 1.3, this.shaper, 1400); return; }
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 5;
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [type, mul, det] of [["sawtooth", 1, -6], ["sawtooth", 1, 6], ["square", 0.5, 0]] as [OscillatorType, number, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mul;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    lp.connect(g).connect(this.shaper);
  }
}

export const BOSS_MUSIC = new BossMusic();
