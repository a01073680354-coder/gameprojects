// Procedural synthwave score, scheduled ahead on the WebAudio clock.
// Layers crossfade with "intensity": exploring = pad + arp + soft bass,
// combat = driving 16th bass + drums. It runs through the world bus, so the
// slow-motion low-pass and the compressor's ducking shape it too.

import { SFX } from "./sfx";
import { TUNE, LITE_MODE, musicAllowed } from "../config";
import { liteBass, liteNoise } from "./lite";

const BPM = 102;
const S16 = 60 / BPM / 4;
const LOOK = 0.14;

// A minor: Am - F - C - G, one bar each
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const ROOTS = [33, 29, 36, 31];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 3, 2, 1, 0, 1];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private pad!: GainNode;
  private arp!: GainNode;
  private bassSoft!: GainNode;
  private bassDrive!: GainNode;
  private drums!: GainNode;
  private delayIn!: GainNode;
  private padLP!: BiquadFilterNode;
  private timer = 0;
  private step = 0;
  private next = 0;
  intensity = 0;
  private target = 0;
  private duckAmt = 1;
  playing = false;
  private hatBuf!: AudioBuffer;

  start() {
    if (!musicAllowed("stage")) return;
    const ctx = SFX.ctx;
    if (!ctx || this.playing) return;
    this.ctx = ctx;
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(SFX.world);
      const mk = (v: number) => { const g = ctx.createGain(); g.gain.value = v; g.connect(this.master); return g; };
      this.padLP = ctx.createBiquadFilter();
      this.padLP.type = "lowpass";
      this.padLP.frequency.value = 1300;
      this.padLP.Q.value = 0.7;
      this.pad = mk(0.9);
      this.padLP.connect(this.pad);
      this.arp = mk(0.55);
      this.bassSoft = mk(0.5);
      this.bassDrive = mk(0);
      this.drums = mk(0);
      // dotted-eighth echo on the arp
      const delay = ctx.createDelay(1);
      delay.delayTime.value = S16 * 3;
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 2400;
      this.delayIn = ctx.createGain();
      this.delayIn.gain.value = 0.45;
      this.delayIn.connect(delay);
      delay.connect(tone).connect(fb).connect(delay);
      tone.connect(this.arp);
      this.hatBuf = SFX.noiseBuf;
    }
    this.playing = true;
    this.step = 0;
    this.next = ctx.currentTime + 0.1;
    this.applyVolume(1.5);
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  stop(fade = 1.2) {
    if (!this.ctx || !this.playing) return;
    this.playing = false;
    window.clearInterval(this.timer);
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
  }

  setIntensity(x: number) { this.target = Math.max(0, Math.min(1, x)); }

  /** Briefly pull the music down (cutscenes, death). */
  duck(amount: number) {
    this.duckAmt = amount;
    this.applyVolume(0.4);
  }

  applyVolume(tc = 0.3) {
    if (!this.ctx || !this.master) return;
    const v = this.playing ? TUNE.music * 0.7 * this.duckAmt : 0;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  private pump() {
    const ctx = this.ctx!;
    // layer crossfade
    const k = 1 - Math.exp(-0.025 * 2.2);
    this.intensity += (this.target - this.intensity) * k;
    const t0 = ctx.currentTime;
    const I = this.intensity;
    this.pad.gain.setTargetAtTime(0.9 - 0.35 * I, t0, 0.1);
    this.arp.gain.setTargetAtTime(0.5 + 0.35 * I, t0, 0.1);
    this.bassSoft.gain.setTargetAtTime(0.5 * (1 - I), t0, 0.1);
    this.bassDrive.gain.setTargetAtTime(0.85 * I, t0, 0.1);
    this.drums.gain.setTargetAtTime(I > 0.05 ? 0.25 + 0.75 * I : 0.18, t0, 0.1);
    this.padLP.frequency.setTargetAtTime(1100 + 1400 * I, t0, 0.2);
    while (this.next < ctx.currentTime + LOOK) {
      this.schedule(this.step, this.next);
      this.step = (this.step + 1) % 64;
      this.next += S16;
    }
  }

  private osc(type: OscillatorType, f: number, t: number, dur: number, peak: number, dest: AudioNode, attack = 0.005, detune = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
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
    const chord = CHORDS[bar];
    const root = ROOTS[bar];
    const barLen = S16 * 16;

    // pad: whole-bar chord, detuned saws through a low-pass
    if (s === 0) {
      for (const n of chord) {
        for (const det of LITE_MODE ? [0] : [-9, 9]) this.osc("sawtooth", mtof(n), t, barLen + 0.4, LITE_MODE ? 0.07 : 0.05, this.padLP, 0.5, det);
      }
      this.osc("sine", mtof(chord[0] - 12), t, barLen + 0.3, 0.06, this.padLP, 0.4);
    }

    // arp: plucked chord tones, an octave up on the 2nd half
    {
      const idx = ARP[s];
      const n = idx === 3 ? chord[0] + 12 : chord[idx];
      const oct = s >= 8 ? 12 : 0;
      if (!LITE_MODE) this.osc("square", mtof(n + 12 + oct), t, 0.16, 0.035, this.arp, 0.003);
      else this.osc("triangle", mtof(n + 12 + oct), t, 0.16, 0.05, this.arp, 0.003);
      this.osc("triangle", mtof(n + 12 + oct), t, 0.18, 0.04, this.delayIn, 0.003);
    }

    // soft bass on 8ths (exploring); the lite build skips whichever layer is silent
    const I = this.intensity;
    if (s % 2 === 0 && !(LITE_MODE && I > 0.95)) {
      const n = s % 8 === 6 ? root + 12 : root;
      this.bassNote(mtof(n), t, S16 * 1.8, 0.16, this.bassSoft, 500);
    }
    // driving bass on 16ths (combat), octave jumps
    if (!(LITE_MODE && I < 0.05)) {
      const n = s % 4 === 2 ? root + 12 : root;
      this.bassNote(mtof(n), t, S16 * 0.9, 0.14, this.bassDrive, s % 4 === 0 ? 1400 : 900);
    }

    // drums
    if (s === 0 || s === 8 || (s === 14 && bar % 2 === 1)) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.09 : 0.05);
    if (s === 15 && bar === 3) this.snare(t, 0.5);
  }

  private bassNote(f: number, t: number, dur: number, peak: number, dest: AudioNode, cutoff: number) {
    const ctx = this.ctx!;
    if (LITE_MODE) { liteBass(ctx, f, t, dur, peak * 1.15, dest, cutoff * 1.2); return; }
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    const sub = ctx.createOscillator();
    sub.type = "square";
    sub.frequency.value = f / 2;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(cutoff * 2.2, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.35), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const sg = ctx.createGain();
    sg.gain.value = 0.35;
    o.connect(lp);
    sub.connect(sg).connect(lp);
    lp.connect(g).connect(dest);
    o.start(t); sub.start(t);
    o.stop(t + dur + 0.05); sub.stop(t + dur + 0.05);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.4);
  }

  private snare(t: number, amp = 1) {
    const ctx = this.ctx!;
    if (LITE_MODE) {
      liteNoise(ctx, t, "bandpass", 1900, 0.8, 0.45 * amp, 0.22, this.drums);
      this.osc("triangle", 190, t, 0.1, 0.25 * amp, this.drums, 0.002);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.hatBuf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1900;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45 * amp, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    src.connect(f).connect(g).connect(this.drums);
    const sv = ctx.createGain();
    sv.gain.value = 0.5;
    g.connect(sv).connect(SFX.verb);
    src.start(t, Math.random());
    src.stop(t + 0.3);
    this.osc("triangle", 190, t, 0.1, 0.25 * amp, this.drums, 0.002);
  }

  private hat(t: number, amp: number) {
    const ctx = this.ctx!;
    if (LITE_MODE) { liteNoise(ctx, t, "highpass", 7500, 0.7, amp, 0.05, this.drums); return; }
    const src = ctx.createBufferSource();
    src.buffer = this.hatBuf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f).connect(g).connect(this.drums);
    src.start(t, Math.random());
    src.stop(t + 0.08);
  }
}

export const MUSIC = new Music();
