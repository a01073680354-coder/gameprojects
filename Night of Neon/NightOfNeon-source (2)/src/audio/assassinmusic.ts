// The Assassin's theme: dark, slow-burning darksynth. 92 BPM on a 16th grid
// in D minor, leaning on the phrygian Eb and the harmonic-minor C#.
//   - a low D drone whose filter breathes, never resolving (it grinds a
//     semitone against the Eb chord)
//   - a hushed "ooh" choir, low and close
//   - a music-box bell arpeggio sunk in echo: the only light in the room
//   - a pulsing, overdriven 16th bass and half-time drums with a huge snare
//   - metal "ticks" like a blade being drawn, and a heartbeat before the fight
//   - phase 2: a mournful lead in the harmonic minor, busier kicks
// Intensity: 0 = drone + choir + bell + heartbeat (entrance), 0.6 = phase one,
// 1 = phase two.

import { SFX } from "./sfx";
import { TUNE, LITE_MODE, musicAllowed } from "../config";
import { liteNoise, sharedFilter } from "./lite";

const BPM = 92;
export const ASN_S16 = 60 / BPM / 4;
const S16 = ASN_S16;
const LOOP = 256;                 // 16 bars of 16ths
const LOOK = 0.14;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// two bars per chord, 16 bars per loop:
//   Dm  Bb/D  Gm/D  A    |  Dm  Eb  Bb/D  A7(b9)
const CHORDS: number[][] = [
  [50, 53, 57], [50, 53, 58], [50, 55, 58], [49, 52, 57],
  [50, 53, 57], [51, 55, 58], [50, 53, 58], [49, 55, 58],
];
const ROOTS = [38, 34, 31, 33, 38, 39, 34, 33];
// bell arpeggio, one note per 8th: index into the chord (3 = top octave)
const BELL = [0, 2, 1, 2, 3, 2, 1, 2];
// bass pulse per bar of 16ths: 1 root, 2 octave, 0 rest
const PULSE = [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 2, 0, 1, 2];
// lead (phase 2): [16th within the loop, midi, length in 16ths]
const LEAD: [number, number, number][] = [
  [0, 74, 12], [12, 76, 4], [16, 77, 8], [24, 76, 4], [28, 74, 4],
  [32, 77, 12], [44, 76, 4], [48, 74, 16],
  [64, 79, 12], [76, 77, 4], [80, 76, 8], [88, 74, 8],
  [96, 73, 16], [112, 76, 8], [120, 69, 8],
  [128, 81, 12], [140, 79, 4], [144, 77, 8], [152, 76, 8],
  [160, 82, 12], [172, 81, 4], [176, 79, 16],
  [192, 77, 12], [204, 79, 4], [208, 77, 8], [216, 74, 8],
  [224, 76, 8], [232, 73, 8], [240, 69, 16],
];

export class AssassinMusic {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private drone!: GainNode;
  private droneLP!: BiquadFilterNode;
  private choir!: GainNode;
  private bell!: GainNode;
  private bellDelay!: GainNode;
  private bass!: GainNode;
  private bassIn!: AudioNode;
  private drums!: GainNode;
  private heart!: GainNode;
  private lead!: GainNode;
  private formants: BiquadFilterNode[] = [];
  private lfos: OscillatorNode[] = [];
  private timer = 0;
  private step = 0;
  private next = 0;
  intensity = 0;
  private target = 0;
  private duckAmt = 1;
  playing = false;

  start(intensity = 0) {
    if (!musicAllowed("asn")) return;
    const ctx = SFX.ctx;
    if (!ctx) return;
    this.ctx = ctx;
    if (!this.master || this.master.context !== ctx) this.build(ctx);
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
    const v = this.playing ? TUNE.music * 0.5 * this.duckAmt : 0;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  /** Layer levels for an intensity (also used directly by offline checks). */
  levels(I: number) {
    return {
      drone: 0.9 - 0.25 * I,
      choir: 0.75 - 0.15 * I,
      bell: 0.6,
      bass: I < 0.2 ? 0 : 0.55 + 0.35 * I,
      drums: I < 0.2 ? 0 : 0.5 + 0.5 * I,
      heart: I < 0.2 ? 0.7 : 0,
      lead: I > 0.8 ? 0.55 * (I - 0.8) / 0.2 : 0,
      droneCut: 260 + 520 * I,
    };
  }

  /** Jump straight to an intensity (no ramps). */
  preset(I: number) {
    this.intensity = this.target = I;
    const L = this.levels(I);
    this.drone.gain.value = L.drone; this.choir.gain.value = L.choir; this.bell.gain.value = L.bell;
    this.bass.gain.value = L.bass; this.drums.gain.value = L.drums; this.heart.gain.value = L.heart;
    this.lead.gain.value = L.lead; this.droneLP.frequency.value = L.droneCut;
  }

  build(ctx: AudioContext) {
    for (const o of this.lfos) { try { o.stop(); } catch { /* already gone */ } }
    this.lfos = [];
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(SFX.world);
    const mk = (v: number, dest: AudioNode = this.master) => { const g = ctx.createGain(); g.gain.value = v; g.connect(dest); return g; };
    const send = (from: AudioNode, amt: number) => { const g = ctx.createGain(); g.gain.value = amt; from.connect(g).connect(SFX.verb); };
    const lfo = (rate: number, depth: number, target: AudioParam) => {
      const o = ctx.createOscillator();
      o.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(target);
      o.start();
      this.lfos.push(o);
    };

    // drone: saws through one resonant low-pass that slowly breathes
    this.drone = mk(0);
    this.droneLP = ctx.createBiquadFilter();
    this.droneLP.type = "lowpass";
    this.droneLP.frequency.value = 300;
    this.droneLP.Q.value = 5;
    this.droneLP.connect(this.drone);
    lfo(0.07, 160, this.droneLP.frequency);
    send(this.drone, 0.35);

    // choir: a dark, closed "ooh"
    this.choir = mk(0);
    this.formants = [];
    for (const [f, q, g] of [[340, 5, 2.8], [720, 6, 1.3], [2300, 7, 0.25]] as [number, number, number][]) {
      if (LITE_MODE && f > 2000) continue;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = q;
      const gg = ctx.createGain();
      gg.gain.value = g;
      bp.connect(gg).connect(this.choir);
      this.formants.push(bp);
    }
    send(this.choir, 1.0);

    // bell: soft, dulled, sunk in a long dotted-8th echo
    this.bell = mk(0);
    const bellLP = ctx.createBiquadFilter();
    bellLP.type = "lowpass";
    bellLP.frequency.value = 2600;
    bellLP.connect(this.bell);
    this.bellDelay = ctx.createGain();
    this.bellDelay.gain.value = 0.55;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = S16 * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.5;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1500;
    this.bellDelay.connect(delay);
    delay.connect(tone).connect(fb).connect(delay);
    tone.connect(bellLP);
    (this as any).bellIn = bellLP;
    send(this.bell, 0.6);

    // bass: overdriven, through one low-pass that opens with the fight
    this.bass = mk(0);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const v = i / 256 - 1; curve[i] = Math.tanh(v * 3); }
    shaper.curve = curve;
    const blp = ctx.createBiquadFilter();
    blp.type = "lowpass";
    blp.frequency.value = 700;
    blp.Q.value = 3;
    lfo(0.11, 260, blp.frequency);
    shaper.connect(blp).connect(this.bass);
    this.bassIn = shaper;

    this.drums = mk(0);
    this.heart = mk(0);
    this.lead = mk(0);
    send(this.lead, 0.8);
  }

  private pump() {
    const ctx = this.ctx!;
    const k = 1 - Math.exp(-0.025 * 1.6);
    this.intensity += (this.target - this.intensity) * k;
    const I = this.intensity;
    const t0 = ctx.currentTime;
    const L = this.levels(I);
    const ramp = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t0, 0.2);
    ramp(this.drone, L.drone);
    ramp(this.choir, L.choir);
    ramp(this.bell, L.bell);
    ramp(this.bass, L.bass);
    ramp(this.drums, L.drums);
    ramp(this.heart, L.heart);
    ramp(this.lead, L.lead);
    while (this.next < ctx.currentTime + LOOK) {
      this.schedule(this.step, this.next);
      this.step = (this.step + 1) % LOOP;
      this.next += S16;
    }
  }

  private osc(type: OscillatorType, f: number, t: number, dur: number, peak: number, dest: AudioNode, attack = 0.004, detune = 0) {
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

  /** A held note with a slow swell in and out (pads, drone). */
  private pad(type: OscillatorType, f: number, t: number, dur: number, peak: number, dest: AudioNode, detune = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    const g = ctx.createGain();
    const a = Math.min(1.2, dur * 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + dur - a);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.7);
  }

  schedule(step: number, t: number) {
    const bar = Math.floor(step / 16);     // 16 bars
    const s = step % 16;                   // 16th within the bar
    const ci = Math.floor(bar / 2) % 8;    // two bars per chord
    const chord = CHORDS[ci];
    const root = ROOTS[ci];
    const I = this.intensity;
    const barLen = S16 * 16;

    // drone: D and A, renewed every four bars with overlapping swells
    if (s === 0 && bar % 4 === 0) {
      const dur = barLen * 4;
      for (const [n, v] of [[38, 0.04], [45, 0.022]] as [number, number][]) {
        this.pad("sawtooth", mtof(n), t, dur, v, this.droneLP, 0);
        if (!LITE_MODE) this.pad("sawtooth", mtof(n), t, dur, v * 0.8, this.droneLP, 9);
      }
      this.pad("sine", mtof(26 + 12), t, dur, 0.055, this.drone);
    }

    // choir: the chord held over two bars, low and close
    if (s === 0 && bar % 2 === 0) {
      const notes = LITE_MODE ? [chord[0], chord[1], chord[2]] : [chord[0], chord[1], chord[2], chord[0] + 12];
      for (const n of notes) {
        this.pad("sawtooth", mtof(n), t, barLen * 2, LITE_MODE ? 0.04 : 0.024, this.formants[0], -6);
        this.pad("sawtooth", mtof(n), t, barLen * 2, LITE_MODE ? 0.025 : 0.018, this.formants[1], 6);
      }
    }

    // bell: one note per 8th, two octaves up, ringing into the echo
    if (s % 2 === 0) {
      const e = s / 2;
      // the first bar of each chord is played in full, the second thins out
      const play = bar % 2 === 0 || e % 2 === 0 || I > 0.85;
      if (play) {
        const idx = BELL[e];
        const n = (idx === 3 ? chord[0] + 12 : chord[idx]) + 12;
        const f = mtof(n);
        const bellIn = (this as any).bellIn as AudioNode;
        const v = e === 0 ? 0.05 : 0.034;
        this.osc("sine", f, t, 1.1, v, bellIn, 0.002);
        if (!LITE_MODE) this.osc("triangle", f * 2.01, t, 0.35, v * 0.25, bellIn, 0.001);
        this.osc("sine", f, t, 0.8, v * 0.8, this.bellDelay, 0.002);
      }
    }

    // heartbeat (entrance only): lub-dub, once a bar
    if (s === 0 || s === 3) this.thump(t, s === 0 ? 0.47 : 0.3, this.heart);

    // bass: an overdriven 16th pulse
    if (I >= 0.2) {
      const p = PULSE[s];
      if (p) {
        const n = root + (p === 2 ? 12 : 0);
        const accent = s % 4 === 0 ? 1 : 0.65;
        this.osc("sawtooth", mtof(n), t, S16 * 0.85, 0.143 * accent, this.bassIn, 0.003);
        if (!LITE_MODE) this.osc("square", mtof(n - 12), t, S16 * 0.85, 0.066 * accent, this.bassIn, 0.003);
      }
    }

    // drums: half time, a heavy snare on 3, ticking metal
    if (I >= 0.2) {
      const busy = I > 0.85;
      if (s === 0 || s === 10 || (busy && (s === 3 || s === 14))) this.kick(t, s === 0 ? 1 : 0.8);
      if (s === 8) this.snare(t, 1);
      if (busy && (s === 13 || s === 15) && bar % 2 === 1) this.snare(t, 0.3);
      if (s % 2 === 0 || busy) this.hat(t, s % 4 === 2 ? 0.04 : 0.022);
      if (s === 6 || s === 14) this.tick(t);
      if (bar % 2 === 1 && s >= 12 && s % 2 === 0 && (busy || bar % 4 === 3)) this.tom(t, s === 12 ? 110 : s === 14 ? 82 : 140);
      if (s === 0 && bar % 8 === 0) this.boom(t);
    }

    // lead (phase 2): mournful, in the harmonic minor
    if (I > 0.8) {
      for (const [at, n, len] of LEAD) {
        if (at !== step) continue;
        const dur = len * S16;
        const leadIn = sharedFilter(this.lead, "lowpass", 2000, 1.5);
        for (const det of LITE_MODE ? [0] : [-8, 8]) {
          const o = this.osc("sawtooth", mtof(n), t, dur + 0.15, LITE_MODE ? 0.06 : 0.042, leadIn, 0.09, det);
          const lfo = this.ctx!.createOscillator();
          lfo.frequency.value = 5.2;
          const lg = this.ctx!.createGain();
          lg.gain.setValueAtTime(0, t);
          lg.gain.linearRampToValueAtTime(14, t + dur);
          lfo.connect(lg).connect(o.detune);
          lfo.start(t);
          lfo.stop(t + dur + 0.2);
        }
        if (!LITE_MODE) this.osc("sine", mtof(n - 12), t, dur, 0.03, this.lead, 0.1);
      }
    }
  }

  private noiseHit(t: number, type: BiquadFilterType, f: number, q: number, amp: number, dur: number, dest: AudioNode, verb = 0) {
    const ctx = this.ctx!;
    if (LITE_MODE && !verb) { liteNoise(ctx, t, type, f, q, amp, dur, dest); return; }
    const src = ctx.createBufferSource();
    src.buffer = SFX.noiseBuf;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl).connect(g).connect(dest);
    if (verb) { const sv = ctx.createGain(); sv.gain.value = verb; g.connect(sv).connect(SFX.verb); }
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private thump(t: number, amp: number, dest: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.3);
  }

  private kick(t: number, amp: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.72 * amp, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.45);
    this.noiseHit(t, "lowpass", 1200, 0.7, 0.12 * amp, 0.02, this.drums);
  }

  /** The big, dark snare: low body, wide noise, long tail. */
  private snare(t: number, amp: number) {
    this.noiseHit(t, "bandpass", 1300, 0.5, 0.4 * amp, 0.32, this.drums, 0.9 * amp);
    this.osc("triangle", 150, t, 0.14, 0.22 * amp, this.drums, 0.002);
  }

  private hat(t: number, amp: number) {
    this.noiseHit(t, "highpass", 9000, 0.7, amp, 0.035, this.drums);
  }

  /** A short metallic tick, like a blade leaving its sheath. */
  private tick(t: number) {
    this.noiseHit(t, "bandpass", 3600, 9, 0.13, 0.07, this.drums, LITE_MODE ? 0 : 0.4);
  }

  private tom(t: number, f: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(this.drums);
    const sv = ctx.createGain();
    sv.gain.value = 0.5;
    g.connect(sv).connect(SFX.verb);
    o.start(t);
    o.stop(t + 0.45);
  }

  /** A cinematic sub drop at the top of each section. */
  private boom(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.56, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(g).connect(this.drums);
    const sv = ctx.createGain();
    sv.gain.value = 0.6;
    g.connect(sv).connect(SFX.verb);
    o.start(t);
    o.stop(t + 1.9);
    this.noiseHit(t, "lowpass", 600, 0.7, 0.2, 1.2, this.drums, 0.6);
  }
}

export const ASSASSIN_MUSIC = new AssassinMusic();
