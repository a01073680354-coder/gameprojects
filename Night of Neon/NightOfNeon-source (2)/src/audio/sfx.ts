import { TEST } from "../config";
// Procedural sound effects with WebAudio. No sample files.
// Signal path: voices -> world bus -> lowpass (slow-mo) -> compressor -> out
//                      \-> reverb send -> convolver ---------/
// Music joins the world bus through its own gain (see music.ts).

type Wave = OscillatorType;

export class Sfx {
  ctx: AudioContext | null = null;
  out!: GainNode;
  world!: GainNode;
  lp!: BiquadFilterNode;
  verb!: GainNode;
  noiseBuf!: AudioBuffer;
  pitch = 1; // < 1 during slow motion
  ambience: AudioNode[] = [];
  private charge = new Map<number, { o: OscillatorNode; g: GainNode }>();
  muted = false;
  volume = 0.8;
  listenerX = 0;
  onInit: (() => void) | null = null;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : this.volume;
    comp.connect(this.out).connect(ctx.destination);
    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 18000;
    this.lp.connect(comp);
    this.world = ctx.createGain();
    this.world.connect(this.lp);
    // reverb from a generated impulse response
    const len = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.verb = ctx.createGain();
    this.verb.gain.value = 0.9;
    // test switch: no reverb at all (the convolver is the costliest node in the graph)
    if (TEST.reverb) this.verb.connect(conv).connect(this.lp);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.startAmbience();
    this.onInit?.();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.out.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  /** 0 = normal time, 1 = deep slow motion. */
  setSlow(amount: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.pitch = 1 - 0.45 * amount;
    this.lp.frequency.setTargetAtTime(18000 * Math.pow(0.04, amount), t, 0.05);
  }

  // ------------------------------------------------------------ voices

  now() { return this.ctx!.currentTime; }

  pan(x?: number): AudioNode {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = x === undefined ? 0 : Math.max(-0.8, Math.min(0.8, (x - this.listenerX) / 420));
    p.connect(this.world);
    return p;
  }

  private att(x?: number) {
    if (x === undefined) return 1;
    return Math.max(0.15, 1 - Math.abs(x - this.listenerX) / 800);
  }

  tone(type: Wave, f0: number, f1: number, dur: number, gain: number, dest: AudioNode, opts: { at?: number; attack?: number; verb?: number; detune?: number; abs?: number } = {}) {
    const ctx = this.ctx!;
    const t = opts.abs ?? this.now() + (opts.at ?? 0);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0 * this.pitch, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * this.pitch), t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    if (opts.verb) {
      const s = ctx.createGain();
      s.gain.value = opts.verb;
      g.connect(s).connect(this.verb);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur: number, gain: number, dest: AudioNode, filter: { type: BiquadFilterType; f0: number; f1?: number; q?: number }, opts: { at?: number; attack?: number; verb?: number; abs?: number } = {}) {
    const ctx = this.ctx!;
    const t = opts.abs ?? this.now() + (opts.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = this.pitch;
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.setValueAtTime(filter.f0 * this.pitch, t);
    if (filter.f1) f.frequency.exponentialRampToValueAtTime(filter.f1 * this.pitch, t + dur);
    f.Q.value = filter.q ?? 0.8;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    if (opts.verb) {
      const s = ctx.createGain();
      s.gain.value = opts.verb;
      g.connect(s).connect(this.verb);
    }
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  ok() { return !!this.ctx && !this.muted && TEST.sfx; }

  /**
   * Ringing blade partials. Each mode is a detuned pair (beating gives the
   * wavering "~"), starting ~3% sharp and settling within 40 ms ("ch-yang").
   */
  private ring(f0: number, ratios: number[], gains: number[], decays: number[], amp: number, verb: number, dest: AudioNode, at = 0) {
    const ctx = this.ctx!;
    const t = this.now() + at;
    ratios.forEach((r, i) => {
      for (const det of [-1, 1]) {
        const f = f0 * r * this.pitch + det * (2.2 + i * 0.9);
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(f * 1.03, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
        const g = ctx.createGain();
        const peak = gains[i] * amp * (det < 0 ? 1 : 0.7);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
        g.gain.exponentialRampToValueAtTime(peak * 0.45, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decays[i]);
        o.connect(g).connect(dest);
        const sv = ctx.createGain();
        sv.gain.value = verb;
        g.connect(sv).connect(this.verb);
        o.start(t);
        o.stop(t + decays[i] + 0.05);
      }
    });
  }

  // ------------------------------------------------------------- sounds

  /** Bullet parried: a bright "ching~" of steel on steel. */
  parry(perfect: boolean, x?: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.noise(0.022, 1.3, d, { type: "bandpass", f0: 6500, q: 0.9 });
    this.noise(0.09, 0.5, d, { type: "bandpass", f0: 7000, f1: 2600, q: 2.5 });
    const f0 = perfect ? 1760 : 1480;
    const k = perfect ? 1.45 : 1;
    this.ring(f0, [1, 1.33, 1.78, 2.42, 3.07, 4.1], [0.2, 0.15, 0.12, 0.09, 0.06, 0.04],
      [1.3 * k, 1.05 * k, 0.85 * k, 0.65 * k, 0.45 * k, 0.32 * k], perfect ? 2.0 : 1.7, perfect ? 0.5 : 0.3, d);
    // mid-body clank and a firm thump: the weight of the bullet being turned
    this.tone("triangle", 660, 560, 0.14, 0.24, d);
    this.tone("sine", 160, 50, 0.16, 0.7, d);
    if (perfect) {
      this.ring(2637, [1, 1.5], [0.06, 0.035], [1.8, 1.4], 1, 0.9, d, 0.015);
      this.tone("sine", 70, 38, 0.4, 0.45, d);
    }
  }

  /** Sword against sword: heavier double strike "chang-ng~". */
  clash(heavy: boolean, perfect: boolean, x?: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    for (const at of [0, 0.028]) {
      this.noise(0.03, at ? 0.55 : 1.0, d, { type: "bandpass", f0: 5200, q: 0.8 }, { at });
    }
    this.noise(0.14, 0.45, d, { type: "bandpass", f0: 6000, f1: 1800, q: 2 });
    const f0 = heavy ? 1180 : 1320;
    const k = heavy ? 1.6 : 1.2;
    this.ring(f0, [1, 1.29, 1.71, 2.33, 2.95, 3.9], [0.24, 0.18, 0.14, 0.1, 0.07, 0.05],
      [1.6 * k, 1.3 * k, 1.0 * k, 0.8 * k, 0.55 * k, 0.4 * k], heavy ? 1.4 : 1.15, 0.55, d);
    this.ring(f0 * 1.06, [1, 1.71], [0.1, 0.06], [0.9 * k, 0.6 * k], 1, 0.4, d, 0.028);
    this.tone("triangle", 520, 430, 0.16, 0.2, d);
    this.tone("sine", heavy ? 90 : 120, 40, heavy ? 0.5 : 0.25, heavy ? 0.8 : 0.5, d);
    if (perfect) this.ring(2793, [1, 1.5], [0.06, 0.035], [2.0, 1.5], 1, 0.9, d, 0.02);
  }

  /** Player slash: whoosh. */
  slash(combo: number) {
    if (!this.ok()) return;
    const d = this.pan();
    this.noise(0.13, 1.6, d, { type: "bandpass", f0: combo > 1 ? 1100 : 800, f1: combo > 1 ? 4200 : 3000, q: 1.2 }, { attack: 0.012 });
    this.tone("triangle", combo > 1 ? 1500 : 2200, combo > 1 ? 2600 : 900, 0.09, 0.05, d);
  }

  slashHit(x: number, armored: boolean) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.noise(0.06, 0.5, d, { type: "bandpass", f0: armored ? 2500 : 1400, q: 1.2 });
    this.tone("sine", armored ? 400 : 220, 70, 0.12, 0.45, d);
    if (armored) this.ring(1900, [1, 1.6], [0.06, 0.04], [0.35, 0.25], 1, 0.15, d);
  }

  /** Enemy blocked the player's slash with its blade. */
  guardBlock(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.noise(0.02, 0.6, d, { type: "bandpass", f0: 5000, q: 1 });
    this.ring(1240, [1, 1.41, 2.2], [0.12, 0.08, 0.05], [0.55, 0.4, 0.3], 1, 0.2, d);
    this.tone("triangle", 480, 400, 0.1, 0.15, d);
  }

  /** Red "!" before a heavy sword attack: a sharp rising warning. */
  danger(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.tone("sawtooth", 880, 1760, 0.18, 0.06, d);
    this.tone("square", 1760, 1760, 0.12, 0.05, d, { at: 0.12 });
    this.noise(0.25, 0.15, d, { type: "bandpass", f0: 3000, f1: 8000, q: 3 }, { at: 0.05 });
  }

  /** Blade glint before a quick enemy strike. */
  glint(x: number) {
    if (!this.ok()) return;
    this.tone("sine", 3500, 4200, 0.12, 0.05 * this.att(x), this.pan(x), { verb: 0.4 });
  }

  /** Posture broken. */
  postureBreak(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.ring(880, [1, 1.5, 2.1], [0.12, 0.08, 0.05], [1.2, 0.9, 0.6], 1, 0.6, d);
    this.tone("sine", 60, 35, 0.7, 0.7, d);
    this.noise(0.4, 0.3, d, { type: "lowpass", f0: 3000, f1: 300 }, { verb: 0.3 });
  }

  /** Enemy blade cutting the air (heavy = the iai lunge). */
  enemySwing(x: number, heavy: boolean) {
    if (!this.ok()) return;
    const d = this.pan(x);
    const a = this.att(x);
    this.noise(heavy ? 0.22 : 0.12, (heavy ? 1.2 : 0.7) * a, d, { type: "bandpass", f0: heavy ? 500 : 900, f1: heavy ? 3800 : 3200, q: 1.3 }, { attack: 0.01 });
    if (heavy) this.tone("sawtooth", 140, 60, 0.18, 0.12 * a, d);
  }

  swish() {
    if (!this.ok()) return;
    this.noise(0.13, 0.22, this.pan(), { type: "bandpass", f0: 700, f1: 3200, q: 1.4 }, { attack: 0.02 });
  }

  shot(kind: string, x: number, bullet: string = "normal") {
    if (!this.ok()) return;
    const d = this.pan(x);
    const a = this.att(x);
    if (bullet === "heavy") {
      this.tone("sine", 90, 30, 0.45, 0.8 * a, d);
      this.noise(0.3, 0.6 * a, d, { type: "lowpass", f0: 700, f1: 200 }, { verb: 0.25 });
      this.tone("sawtooth", 220, 110, 0.25, 0.08 * a, d);
      return;
    }
    if (bullet === "missile") {
      this.noise(0.5, 0.35 * a, d, { type: "bandpass", f0: 900, f1: 2600, q: 1.2 }, { attack: 0.02 });
      this.tone("sawtooth", 140, 320, 0.3, 0.06 * a, d);
      this.tone("sine", 70, 40, 0.2, 0.4 * a, d);
      return;
    }
    if (bullet === "orb") {
      this.tone("triangle", 520, 260, 0.18, 0.12 * a, d);
      this.tone("sine", 1040, 700, 0.12, 0.05 * a, d);
      return;
    }
    const hi = kind === "burst" ? 1.25 : 1;
    this.noise(0.09, 0.8 * a, d, { type: "bandpass", f0: 1600 * hi, q: 0.9 });
    this.noise(0.22, 0.35 * a, d, { type: "lowpass", f0: 900 }, { verb: 0.12 });
    this.tone("sine", 150 * hi, 45, 0.14, 0.6 * a, d);
    this.tone("square", 3200, 1200, 0.025, 0.05 * a, d);
  }

  wallHit(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    const a = this.att(x);
    this.noise(0.035, 0.22 * a, d, { type: "highpass", f0: 3500 });
    this.tone("triangle", 1100, 380, 0.05, 0.08 * a, d);
  }

  soldierHurt(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.tone("square", 220, 80, 0.12, 0.14, d);
    this.noise(0.08, 0.3, d, { type: "bandpass", f0: 1200, q: 2 });
    this.tone("sine", 500, 160, 0.1, 0.2, d);
  }

  soldierDie(x: number, big: boolean) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.noise(0.25, 0.5, d, { type: "bandpass", f0: 900, f1: 300, q: 1.2 }, { verb: 0.2 });
    this.tone("sawtooth", 420, 50, 0.3, 0.12, d);
    this.tone("sine", 880, 110, 0.45, 0.1, d, { at: 0.05 });
    for (let i = 0; i < 5; i++) this.noise(0.02, 0.18, d, { type: "highpass", f0: 5000 }, { at: 0.04 + i * 0.035 + Math.random() * 0.02 });
    if (big) this.tone("sine", 60, 30, 0.6, 0.6, d);
  }

  playerHurt() {
    if (!this.ok()) return;
    const d = this.pan();
    this.tone("sine", 140, 40, 0.3, 0.7, d);
    this.noise(0.18, 0.4, d, { type: "lowpass", f0: 1200 });
    this.tone("sawtooth", 110, 70, 0.22, 0.12, d, { detune: -20 });
  }

  dash() {
    if (!this.ok()) return;
    this.noise(0.2, 0.28, this.pan(), { type: "bandpass", f0: 380, f1: 3600, q: 1.1 }, { attack: 0.01 });
  }

  jump() {
    if (!this.ok()) return;
    this.noise(0.06, 0.08, this.pan(), { type: "bandpass", f0: 1400, q: 1.5 });
  }

  land(k: number) {
    if (!this.ok()) return;
    this.tone("sine", 110, 40, 0.1, 0.15 + 0.3 * k, this.pan());
    this.noise(0.06, 0.08 + 0.12 * k, this.pan(), { type: "lowpass", f0: 700 });
  }

  alert(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.tone("square", 1320, 1320, 0.07, 0.06, d);
    this.tone("square", 1760, 1760, 0.09, 0.06, d, { at: 0.08 });
  }

  aimStart(id: number, x: number, dur: number) {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    this.aimStop(id);
    const o = ctx.createOscillator();
    o.type = "sine";
    const t = this.now();
    o.frequency.setValueAtTime(380 * this.pitch, t);
    o.frequency.exponentialRampToValueAtTime(1500 * this.pitch, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035 * this.att(x), t + dur * 0.9);
    o.connect(g).connect(this.pan(x));
    o.start(t);
    o.stop(t + dur + 0.3);
    this.charge.set(id, { o, g });
  }

  aimLock(_id: number, x: number) {
    if (!this.ok()) return;
    this.tone("sine", 2700, 2700, 0.07, 0.07 * this.att(x), this.pan(x));
  }

  aimStop(id: number) {
    const c = this.charge.get(id);
    if (c && this.ctx) {
      try {
        c.g.gain.cancelScheduledValues(this.now());
        c.g.gain.setTargetAtTime(0.0001, this.now(), 0.01);
        c.o.stop(this.now() + 0.05);
      } catch { /* already stopped */ }
    }
    this.charge.delete(id);
  }

  heavyClank(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.tone("square", 180, 120, 0.12, 0.18, d);
    this.noise(0.08, 0.4, d, { type: "bandpass", f0: 500, q: 2 });
    this.tone("sine", 330, 300, 0.25, 0.08, d);
  }

  dodge() {
    if (!this.ok()) return;
    const d = this.pan();
    this.noise(0.12, 0.18, d, { type: "highpass", f0: 3000 }, { attack: 0.01 });
    this.tone("sine", 1760, 2640, 0.12, 0.05, d, { verb: 0.3 });
  }

  checkpoint() {
    if (!this.ok()) return;
    const d = this.pan();
    [523, 659, 784, 1047].forEach((f, i) => this.tone("triangle", f, f, 0.35, 0.08, d, { at: i * 0.07, verb: 0.4 }));
  }

  pit() {
    if (!this.ok()) return;
    this.noise(0.4, 0.3, this.pan(), { type: "bandpass", f0: 2000, f1: 200, q: 1 }, { attack: 0.02 });
    this.tone("sine", 300, 60, 0.4, 0.2, this.pan());
  }

  stageClear() {
    if (!this.ok()) return;
    const d = this.pan();
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => {
      this.tone("triangle", f, f, 0.6, 0.09, d, { at: i * 0.09, verb: 0.5 });
      this.tone("sine", f * 2, f * 2, 0.4, 0.03, d, { at: i * 0.09 + 0.02, verb: 0.6 });
    });
    this.tone("sine", 65, 40, 1.2, 0.5, d, { at: 0.5 });
  }

  droneDie(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.noise(0.5, 0.6, d, { type: "lowpass", f0: 4000, f1: 300 }, { verb: 0.3 });
    this.tone("sawtooth", 900, 60, 0.5, 0.1, d);
    this.tone("sine", 70, 30, 0.6, 0.6, d, { at: 0.05 });
  }

  // -------------------------------------------------------- props & stage

  /** Steel drum: first cut dents it (hollow bong), second cleaves it. */
  barrel(x: number, broken: boolean) {
    if (!this.ok()) return;
    const d = this.pan(x);
    // hollow drum body resonance
    this.tone("sine", 196, 150, broken ? 0.5 : 0.35, 0.5, d, { verb: 0.2 });
    this.tone("sine", 311, 260, broken ? 0.4 : 0.3, 0.22, d);
    this.tone("triangle", 523, 470, 0.22, 0.1, d);
    this.noise(0.05, 0.6, d, { type: "bandpass", f0: 3200, q: 0.9 });
    if (broken) {
      // shearing metal + the halves clattering down
      this.noise(0.22, 0.55, d, { type: "bandpass", f0: 5000, f1: 1500, q: 2.5 });
      this.tone("sawtooth", 1400, 380, 0.18, 0.06, d);
      for (const [at, f] of [[0.28, 240], [0.42, 300], [0.53, 210]] as [number, number][]) {
        this.tone("sine", f, f * 0.8, 0.14, 0.25, d, { at });
        this.noise(0.04, 0.25, d, { type: "bandpass", f0: 2200, q: 1.5 }, { at });
      }
    }
  }

  /** Neon sign shattering: glass + a dying tube buzz. */
  signBreak(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.noise(0.05, 0.7, d, { type: "highpass", f0: 4500 });
    for (let i = 0; i < 7; i++) {
      const at = 0.02 + i * 0.03 + Math.random() * 0.03;
      this.tone("sine", 3000 + Math.random() * 3500, 2500 + Math.random() * 2000, 0.07, 0.05, d, { at });
    }
    this.noise(0.25, 0.22, d, { type: "highpass", f0: 6000 }, { at: 0.05 });
    // tube flicker-out: a buzzing tone that falls and cuts
    this.tone("sawtooth", 120, 60, 0.35, 0.06, d, { at: 0.02 });
    this.tone("square", 240, 120, 0.12, 0.03, d, { at: 0.18 });
  }

  /** Energy wall slamming shut / dissolving. */
  barrier(on: boolean) {
    if (!this.ok()) return;
    const d = this.pan();
    if (on) {
      this.tone("sawtooth", 80, 220, 0.35, 0.18, d, { verb: 0.3 });
      this.tone("square", 440, 880, 0.2, 0.05, d, { at: 0.05 });
      this.noise(0.4, 0.3, d, { type: "bandpass", f0: 800, f1: 4000, q: 3 }, { verb: 0.3 });
      this.tone("sine", 55, 40, 0.6, 0.6, d, { at: 0.1 });
    } else {
      this.tone("sawtooth", 220, 70, 0.5, 0.14, d, { verb: 0.3 });
      this.noise(0.6, 0.25, d, { type: "bandpass", f0: 4000, f1: 500, q: 2 }, { verb: 0.4 });
      [784, 988, 1175].forEach((f, i) => this.tone("triangle", f, f, 0.5, 0.06, d, { at: 0.1 + i * 0.08, verb: 0.5 }));
    }
  }

  /** Dropship flyover: a rising, passing engine roar. */
  flyover(dur: number) {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = this.now();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(300, t);
    f.frequency.linearRampToValueAtTime(1600, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(250, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-0.8, t);
    p.pan.linearRampToValueAtTime(0.8, t + dur);
    src.connect(f).connect(g).connect(p).connect(this.world);
    src.start(t);
    src.stop(t + dur + 0.1);
    this.tone("sawtooth", 70, 55, dur, 0.06, this.pan(), { attack: dur * 0.4 });
  }

  /** Rope zip as a soldier rappels down. */
  rappel(x: number) {
    if (!this.ok()) return;
    this.noise(0.6, 0.12, this.pan(x), { type: "bandpass", f0: 1800, f1: 900, q: 4 }, { attack: 0.05 });
  }

  enterLand(x: number) {
    if (!this.ok()) return;
    this.tone("sine", 120, 45, 0.18, 0.4, this.pan(x));
    this.noise(0.08, 0.25, this.pan(x), { type: "lowpass", f0: 900 });
  }

  thunder(dist: number) {
    if (!this.ok()) return;
    const d = this.pan();
    const at = 0.15 + dist * 0.9;
    this.noise(0.12, 0.2, d, { type: "highpass", f0: 2500 }, { at: 0.02 }); // the crack
    this.noise(2.4, 0.5 * (1 - dist * 0.5), d, { type: "lowpass", f0: 400, f1: 80, q: 0.7 }, { at, attack: 0.3, verb: 0.6 });
    this.tone("sine", 45, 30, 2.0, 0.3 * (1 - dist * 0.5), d, { at, attack: 0.4 });
  }

  /** Corrupted broadcast for the boss teaser. */
  glitchVoice() {
    if (!this.ok()) return;
    const d = this.pan();
    for (let i = 0; i < 14; i++) {
      const at = i * 0.09 + Math.random() * 0.04;
      this.tone("square", 80 + Math.random() * 60, 60 + Math.random() * 40, 0.08, 0.08, d, { at });
      this.noise(0.05, 0.25, d, { type: "bandpass", f0: 800 + Math.random() * 3000, q: 6 }, { at });
    }
    this.tone("sawtooth", 55, 41, 1.6, 0.18, d, { at: 0.3, attack: 0.2, verb: 0.5 });
    this.tone("sawtooth", 58, 43, 1.6, 0.12, d, { at: 0.3, attack: 0.2, detune: 12 });
    this.tone("sine", 33, 28, 2.0, 0.6, d, { at: 0.35, attack: 0.1 });
  }

  hint() {
    if (!this.ok()) return;
    const d = this.pan();
    this.tone("triangle", 1568, 1568, 0.2, 0.04, d, { verb: 0.4 });
    this.tone("triangle", 2093, 2093, 0.25, 0.03, d, { at: 0.06, verb: 0.4 });
  }

  cineIn() {
    if (!this.ok()) return;
    const d = this.pan();
    this.tone("sine", 55, 32, 1.2, 0.5, d);
    this.noise(0.7, 0.25, d, { type: "lowpass", f0: 5000, f1: 220, q: 2 }, { attack: 0.03, verb: 0.3 });
    this.tone("sine", 62, 40, 0.16, 0.45, d, { at: 0.25 });
    this.tone("sine", 58, 38, 0.18, 0.35, d, { at: 0.47 });
  }

  impact() {
    if (!this.ok()) return;
    const d = this.pan();
    this.noise(0.4, 0.8, d, { type: "lowpass", f0: 3500, f1: 400 }, { verb: 0.5 });
    this.tone("sine", 48, 28, 0.9, 0.8, d);
    this.tone("sine", 1318, 1300, 1.6, 0.08, d, { verb: 0.9 });
    this.tone("triangle", 660, 640, 1.2, 0.06, d, { verb: 0.7 });
  }

  finale() {
    if (!this.ok()) return;
    const d = this.pan();
    this.tone("sine", 65, 30, 0.9, 0.55, d);
    this.noise(0.5, 0.2, d, { type: "lowpass", f0: 2500, f1: 200 }, { verb: 0.4 });
  }

  // ------------------------------------------------------------ assassin

  assassin(kind: "aim" | "rush" | "clean" | "draw" | "drip" | "desperate" | "blink", x?: number, n = 2) {
    if (!this.ok()) return;
    const d = this.pan(x);
    switch (kind) {
      case "aim":
        // one bright "ting" per cut that is coming: the count is the tell
        for (let i = 0; i < n; i++) {
          const at = i * 0.075 + (i >= 2 ? 0.08 : 0);
          this.ring(2350, [1, 2.76], [0.08, 0.03], [0.35, 0.2], 1, 0.5, d, at);
        }
        this.tone("sine", 70, 50, 0.35, 0.35, d);
        break;
      case "desperate":
        // a low groan of steel, then five fast, rising tings: one per cut
        this.tone("sawtooth", 82, 62, 0.9, 0.16, d, { attack: 0.02 });
        this.tone("sine", 41, 36, 1.0, 0.55, d);
        this.noise(0.8, 0.3, d, { type: "bandpass", f0: 5000, f1: 1500, q: 5 }, { attack: 0.05, verb: 0.5 });
        for (let i = 0; i < n; i++) this.ring(2100 + i * 160, [1, 2.76], [0.07, 0.025], [0.3, 0.16], 1, 0.6, d, 0.45 + i * 0.06);
        break;
      case "blink":
        this.noise(0.05, 0.55, d, { type: "bandpass", f0: 5000, f1: 2200, q: 2 }, { attack: 0.002 });
        break;
      case "rush":
        this.noise(0.09, 0.9, d, { type: "bandpass", f0: 1400, f1: 6000, q: 1.4 }, { attack: 0.005 });
        this.tone("sine", 900, 2400, 0.06, 0.05, d);
        break;
      case "clean":
        this.ring(1760, [1, 1.5, 2.0], [0.1, 0.06, 0.04], [1.0, 0.8, 0.6], 1, 0.8, d);
        break;
      case "draw":
        // a long blade drawn slowly from its sheath
        this.noise(0.7, 0.35, d, { type: "bandpass", f0: 3000, f1: 9000, q: 6 }, { attack: 0.3 });
        this.ring(1318, [1, 1.5, 2.24], [0.12, 0.06, 0.04], [2.0, 1.4, 1.0], 1, 0.9, d, 0.7);
        break;
      case "drip":
        for (let i = 0; i < 3; i++) this.tone("sine", 1900 - i * 200, 900, 0.08, 0.06, d, { at: i * 0.6, verb: 0.9 });
        break;
    }
  }

  // ---------------------------------------------------------------- story

  /** A soft "voice" blip per typed character; each speaker has its own colour. */
  voice(who: string, i: number) {
    if (!this.ok()) return;
    const d = this.world;
    const j = (k: number) => 1 + (((i * 7919) % 13) / 13 - 0.5) * k; // a little pitch wander
    switch (who) {
      case "doj": this.tone("triangle", 118 * j(0.12), 110, 0.05, 0.05, d); break;
      case "oni": this.tone("sawtooth", 196 * j(0.1), 180, 0.035, 0.018, d); this.tone("sine", 98, 96, 0.04, 0.03, d); break;
      case "seo": this.tone("triangle", 330 * j(0.1), 320, 0.04, 0.03, d); break;
      case "null": this.tone("square", 60, 58, 0.03, 0.02, d); if (i % 4 === 0) this.tone("sine", 2400, 2380, 0.02, 0.012, d); break;
      case "sys": case "pa": { const f = (who === "sys" ? 880 : 660) * (i % 2 ? 1 : 1.5); this.tone("sine", f, f, 0.03, 0.014, d); break; }
      case "radio": this.noise(0.025, 0.05, d, { type: "bandpass", f0: 1800, q: 2.5 }); break;
      case "ad": this.tone("sine", 990 * j(0.05), 980, 0.03, 0.012, d); break;
      case "arc": this.tone("triangle", 150 * j(0.08), 140, 0.06, 0.035, d); break;
      case "rec": this.noise(0.015, 0.035, d, { type: "bandpass", f0: 5200, q: 6 }); break;
      default: break; // narration is silent
    }
  }

  private hiss: { src: AudioBufferSourceNode; g: GainNode } | null = null;
  /** Tape hiss under a recording. */
  tapeHiss(on: boolean) {
    if (!this.ctx) return;
    const t = this.now();
    if (on && !this.hiss && this.ok()) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = 4200; f.Q.value = 0.6;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 0.2);
      src.connect(f).connect(g).connect(this.world);
      src.start();
      this.hiss = { src, g };
    } else if (!on && this.hiss) {
      const h = this.hiss;
      this.hiss = null;
      h.g.gain.setTargetAtTime(0.0001, t, 0.08);
      h.src.stop(t + 0.5);
    }
  }

  private pad: { nodes: OscillatorNode[]; g: GainNode } | null = null;
  /** The prologue's low drone. */
  prologuePad(on: boolean) {
    if (!this.ctx) return;
    const t = this.now();
    if (on && !this.pad && this.ok()) {
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 3);
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 420; lp.Q.value = 3;
      lp.connect(g).connect(this.world);
      const sv = this.ctx.createGain(); sv.gain.value = 0.4; g.connect(sv).connect(this.verb);
      const nodes: OscillatorNode[] = [];
      for (const [f, det] of [[36.7, -6], [36.7, 6], [55, 0], [87.3, 3]] as [number, number][]) {
        const o = this.ctx.createOscillator();
        o.type = "sawtooth"; o.frequency.value = f; o.detune.value = det;
        o.connect(lp); o.start(); nodes.push(o);
      }
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.08;
      const lg = this.ctx.createGain(); lg.gain.value = 180;
      lfo.connect(lg).connect(lp.frequency); lfo.start(); nodes.push(lfo);
      this.pad = { nodes, g };
    } else if (!on && this.pad) {
      const p = this.pad;
      this.pad = null;
      p.g.gain.setTargetAtTime(0.0001, t, 0.6);
      for (const o of p.nodes) o.stop(t + 3);
    }
  }

  storyCue(kind: "thunder" | "beep" | "deny" | "tapeIn" | "tapeOut" | "tapeCut" | "unsheathe" | "advance" | "ring" | "page") {
    if (!this.ok()) return;
    const d = this.world;
    switch (kind) {
      case "thunder": this.thunder(0.3); break;
      case "beep": for (let i = 0; i < 3; i++) this.tone("square", 1320, 1320, 0.05, 0.02, d, { at: i * 0.32 }); break;
      case "deny": this.tone("square", 440, 440, 0.12, 0.03, d); this.tone("square", 330, 330, 0.22, 0.03, d, { at: 0.14 }); break;
      case "tapeIn":
        this.noise(0.05, 0.25, d, { type: "lowpass", f0: 900 });
        this.tone("square", 70, 60, 0.06, 0.08, d);
        this.tapeHiss(true);
        break;
      case "tapeOut":
        this.noise(0.05, 0.25, d, { type: "lowpass", f0: 900 });
        this.tone("square", 60, 50, 0.06, 0.08, d);
        this.tapeHiss(false);
        break;
      case "unsheathe":
        this.noise(0.9, 0.3, d, { type: "bandpass", f0: 2500, f1: 8000, q: 6 }, { attack: 0.35 });
        this.ring(1175, [1, 1.5, 2.24], [0.1, 0.05, 0.03], [2.2, 1.6, 1.1], 1, 0.9, d, 0.85);
        break;
      case "advance": this.tone("sine", 1760, 1760, 0.03, 0.01, d); break;
      case "ring":
        // an old handset calling out into nothing: two bursts of a 400/450 Hz burr
        for (let i = 0; i < 2; i++) {
          this.tone("sine", 400, 400, 0.38, 0.035, d, { at: i * 0.55, attack: 0.01 });
          this.tone("sine", 450, 450, 0.38, 0.035, d, { at: i * 0.55, attack: 0.01 });
        }
        break;
      case "tapeCut":
        // the tape stops mid-word: a snap, then nothing
        this.tone("sawtooth", 180, 40, 0.12, 0.08, d);
        this.noise(0.04, 0.35, d, { type: "lowpass", f0: 1400 });
        this.tapeHiss(false);
        break;
      case "page":
        this.noise(0.18, 0.08, d, { type: "bandpass", f0: 3200, f1: 1800, q: 1.2 }, { attack: 0.03 });
        this.noise(0.12, 0.05, d, { type: "highpass", f0: 5000 }, { at: 0.12, attack: 0.02 });
        break;
    }
  }

  /** The incinerator: a whoosh of ignition, then the roar of the floor catching. */
  flame(x: number, big = false) {
    if (!this.ok()) return;
    const d = this.pan(x);
    const a = this.att(x);
    this.noise(0.25, 0.3 * a, d, { type: "bandpass", f0: 600, f1: 2400, q: 1.2 }, { attack: 0.04 });
    this.noise(big ? 1.1 : 0.8, (big ? 0.38 : 0.26) * a, d, { type: "lowpass", f0: 900, f1: 300, q: 0.7 }, { at: 0.08, attack: 0.08, verb: 0.2 });
    this.tone("sine", 70, 45, 0.6, 0.3 * a, d, { at: 0.05 });
  }

  /** 방벽, the riot machine: waking, turning on its treads, its vent hit, the shield coming off. */
  bulwark(kind: "wake" | "turn" | "vent" | "shed", x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    const a = this.att(x);
    switch (kind) {
      case "wake":
        this.tone("sawtooth", 40, 90, 1.2, 0.12 * a, d, { attack: 0.4 });
        this.noise(1.0, 0.18 * a, d, { type: "bandpass", f0: 300, f1: 900, q: 2 }, { attack: 0.3 });
        this.tone("square", 880, 880, 0.08, 0.04, d, { at: 1.0 });
        this.tone("square", 1320, 1320, 0.08, 0.04, d, { at: 1.12 });
        break;
      case "turn":
        this.noise(0.5, 0.2 * a, d, { type: "bandpass", f0: 180, f1: 120, q: 3 });
        this.tone("sawtooth", 60, 45, 0.5, 0.1 * a, d);
        break;
      case "vent":
        this.noise(0.5, 0.32 * a, d, { type: "highpass", f0: 2200, f1: 900 }, { attack: 0.005, verb: 0.2 });
        this.tone("square", 260, 140, 0.16, 0.08 * a, d);
        break;
      case "shed":
        this.noise(1.2, 0.4 * a, d, { type: "highpass", f0: 3000, f1: 600 }, { attack: 0.01, verb: 0.3 });
        this.ring(330, [1, 2.6, 4.1], [0.2, 0.08, 0.05], [1.4, 0.9, 0.5], 1, 0.7, d);
        this.tone("sine", 70, 40, 0.8, 0.5 * a, d, { at: 0.35 });
        break;
    }
  }

  /** A hammer on an anvil, a little way off. */
  clink(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    const a = this.att(x) * 0.6;
    this.ring(1568, [1, 2.4, 3.7], [0.05 * a, 0.02 * a, 0.012 * a], [0.5, 0.3, 0.2], 1, 0.4, d);
    this.noise(0.04, 0.05 * a, d, { type: "bandpass", f0: 4000, q: 2 });
  }

  /** The power cut: everything electric sags and dies (on), then comes back (off). */
  brownout(on: boolean) {
    if (!this.ok()) return;
    const d = this.pan();
    if (on) {
      this.tone("sawtooth", 120, 40, 0.6, 0.06, d, { attack: 0.01 });
      this.noise(0.25, 0.08, d, { type: "bandpass", f0: 1200, q: 3 });
    } else {
      this.tone("sawtooth", 40, 120, 0.4, 0.05, d, { attack: 0.2 });
      this.tone("square", 60, 60, 0.05, 0.04, d, { at: 0.35 });
    }
  }

  /** Chalk on concrete. */
  chalk() {
    if (!this.ok()) return;
    const d = this.pan();
    for (let i = 0; i < 3; i++) this.noise(0.14, 0.12, d, { type: "bandpass", f0: 3000 + i * 400, f1: 2200, q: 4 }, { at: i * 0.22, attack: 0.02 });
  }

  /** The search squad's siren: two wails. */
  siren() {
    if (!this.ok()) return;
    const d = this.pan();
    for (let i = 0; i < 2; i++) {
      this.tone("triangle", 600, 950, 0.7, 0.05, d, { at: i * 1.4, attack: 0.2, verb: 0.3 });
      this.tone("triangle", 950, 600, 0.7, 0.05, d, { at: i * 1.4 + 0.7, attack: 0.05, verb: 0.3 });
    }
  }

  /** The first deathblow that does not kill: steel through a baton and a hose. */
  subdue(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.ring(880, [1, 2.4, 3.9], [0.16, 0.07, 0.04], [1.2, 0.7, 0.4], 1, 0.6, d);
    this.noise(0.5, 0.35, d, { type: "highpass", f0: 2500, f1: 900 }, { at: 0.12, attack: 0.01 }); // the hose venting
    this.tone("square", 140, 60, 0.18, 0.12, d, { at: 0.02 });
  }

  // ------------------------------------------------------------- kamikaze

  kamikaze(kind: "lock" | "go" | "beep" | "arm" | "boom" | "dodge", x?: number, hi = 0) {
    if (!this.ok()) return;
    const d = this.pan(x);
    const a = this.att(x);
    if (kind === "lock") {
      this.tone("square", 600, 1400, 0.4, 0.05 * a, d, { attack: 0.05 });
      this.tone("sine", 1200, 2400, 0.4, 0.04 * a, d, { attack: 0.05 });
    } else if (kind === "go") {
      this.noise(0.6, 0.45 * a, d, { type: "bandpass", f0: 700, f1: 2400, q: 1.4 }, { attack: 0.03 });
      this.tone("sawtooth", 160, 420, 0.5, 0.07 * a, d);
    } else if (kind === "arm") {
      this.tone("square", 1760, 1760, 0.06, 0.08 * a, d);
      this.tone("square", 2349, 2349, 0.06, 0.06 * a, d, { at: 0.07 });
    } else if (kind === "beep") {
      this.tone("square", 1980 + hi * 400, 1980 + hi * 400, 0.045, (0.07 + hi * 0.05) * a, d);
    } else if (kind === "boom") {
      this.tone("sine", 90, 28, 0.9, 1.0 * a, d);
      this.noise(0.8, 1.0 * a, d, { type: "lowpass", f0: 5000, f1: 200, q: 0.8 }, { verb: 0.5 });
      this.noise(0.12, 0.6 * a, d, { type: "highpass", f0: 3000 });
      for (let i = 0; i < 5; i++) this.noise(0.05, 0.2 * a, d, { type: "bandpass", f0: 1500 + Math.random() * 2500, q: 3 }, { at: 0.1 + i * 0.07 });
    } else {
      // threading the blast
      this.noise(0.25, 0.4, d, { type: "bandpass", f0: 4000, f1: 1200, q: 2 });
      this.tone("triangle", 1568, 2093, 0.3, 0.08, d, { verb: 0.6 });
      this.tone("triangle", 2637, 2637, 0.4, 0.05, d, { at: 0.08, verb: 0.7 });
    }
  }

  // ------------------------------------------------------------- healing

  heal(kind: "start" | "done" | "cancel" | "empty" | "gain") {
    if (!this.ok()) return;
    const d = this.pan();
    if (kind === "start") {
      // snap the cap, then a pressurised hiss
      this.tone("square", 2400, 1800, 0.03, 0.06, d);
      this.noise(0.45, 0.16, d, { type: "bandpass", f0: 5200, f1: 2600, q: 2 }, { at: 0.12, attack: 0.04 });
      this.tone("sine", 660, 990, 0.5, 0.05, d, { at: 0.12, attack: 0.15, verb: 0.4 });
    } else if (kind === "done") {
      for (const [f, at] of [[1047, 0], [1319, 0.06], [1568, 0.12], [2093, 0.18]] as [number, number][]) {
        this.tone("triangle", f, f, 0.5, 0.07, d, { at, verb: 0.6 });
      }
      this.tone("sine", 196, 392, 0.4, 0.2, d);
    } else if (kind === "cancel") {
      this.noise(0.12, 0.5, d, { type: "highpass", f0: 3500 });
      for (let i = 0; i < 5; i++) this.tone("sine", 3000 + Math.random() * 2500, 2600, 0.08, 0.04, d, { at: 0.02 + i * 0.025 });
    } else if (kind === "empty") {
      this.tone("square", 220, 180, 0.06, 0.06, d);
      this.tone("square", 180, 150, 0.06, 0.05, d, { at: 0.08 });
    } else {
      this.tone("triangle", 1568, 1568, 0.3, 0.06, d, { verb: 0.5 });
      this.tone("triangle", 2349, 2349, 0.4, 0.05, d, { at: 0.08, verb: 0.6 });
    }
  }

  // ------------------------------------------------------------- boss

  /** Perilous attack warning (危): a dark gong under a hissing blade. */
  perilous(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.ring(196, [1, 2.76, 5.4], [0.35, 0.12, 0.05], [1.4, 0.8, 0.4], 1.1, 0.7, d);
    this.tone("sawtooth", 98, 92, 0.5, 0.12, d, { attack: 0.005 });
    this.noise(0.35, 0.28, d, { type: "bandpass", f0: 2500, f1: 7000, q: 4 }, { at: 0.04 });
    this.tone("sine", 55, 40, 0.6, 0.6, d);
  }

  /** Shoulder guns spinning up (orbs, missiles) or the laser firing. */
  bossCharge(x: number, kind: "orbs" | "missiles" | "laser") {
    if (!this.ok()) return;
    const d = this.pan(x);
    if (kind === "laser") {
      this.tone("sawtooth", 110, 108, 0.45, 0.18, d);
      this.tone("square", 220, 218, 0.45, 0.06, d, { detune: 15 });
      this.noise(0.45, 0.5, d, { type: "bandpass", f0: 1800, q: 0.8 }, { verb: 0.3 });
      this.tone("sine", 60, 40, 0.5, 0.6, d);
      return;
    }
    this.tone("sawtooth", 200, kind === "orbs" ? 900 : 600, 0.5, 0.06, d, { attack: 0.3 });
    this.tone("square", 400, kind === "orbs" ? 1800 : 1200, 0.5, 0.025, d, { attack: 0.3 });
    this.noise(0.12, 0.2, d, { type: "highpass", f0: 4000 }, { at: 0.02 });
  }

  missileCut(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.ring(1700, [1, 1.5], [0.08, 0.05], [0.4, 0.3], 1, 0.2, d);
    this.noise(0.35, 0.7, d, { type: "lowpass", f0: 3000, f1: 300 }, { verb: 0.3 });
    this.tone("sine", 80, 40, 0.3, 0.5, d);
  }

  /** The oni lands: rubble and a deep boom. */
  bossLand(x: number, big = true) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.tone("sine", big ? 70 : 90, 26, big ? 1.1 : 0.6, big ? 1.0 : 0.8, d);
    this.noise(big ? 0.9 : 0.5, big ? 0.9 : 0.6, d, { type: "lowpass", f0: 2400, f1: 160, q: 1 }, { verb: 0.6 });
    for (let i = 0; i < 6; i++) this.noise(0.05, 0.25, d, { type: "bandpass", f0: 900 + Math.random() * 1800, q: 3 }, { at: 0.08 + i * 0.06 + Math.random() * 0.04 });
  }

  /** Distorted war cry through the mask. */
  roar(x: number, dur = 1.4) {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const d = this.pan(x);
    const t = this.now();
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const v = i / 128 - 1; curve[i] = Math.tanh(v * 6); }
    shaper.curve = curve;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.linearRampToValueAtTime(900, t + dur * 0.35);
    bp.frequency.linearRampToValueAtTime(300, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.12);
    g.gain.setValueAtTime(0.32, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    shaper.connect(bp).connect(g).connect(d);
    const sv = ctx.createGain();
    sv.gain.value = 0.6;
    g.connect(sv).connect(this.verb);
    for (const [f, det] of [[72, 0], [72.6, 9], [108, -5]] as [number, number][]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * this.pitch, t);
      o.frequency.linearRampToValueAtTime(f * 1.25 * this.pitch, t + dur * 0.3);
      o.frequency.linearRampToValueAtTime(f * 0.8 * this.pitch, t + dur);
      o.detune.value = det;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 23;
      const lg = ctx.createGain();
      lg.gain.value = 9;
      lfo.connect(lg).connect(o.frequency);
      o.connect(shaper);
      o.start(t); lfo.start(t);
      o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    }
    this.noise(dur, 0.25, d, { type: "bandpass", f0: 1200, f1: 500, q: 2 }, { attack: 0.08 });
  }

  /** Smash shockwave rolling along the roof. */
  shockwave(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.noise(0.8, 0.5, d, { type: "lowpass", f0: 900, f1: 120, q: 2 }, { attack: 0.02 });
    this.tone("sawtooth", 60, 34, 0.7, 0.14, d);
  }

  /** The final deathblow lands. */
  bossDown(x: number) {
    if (!this.ok()) return;
    const d = this.pan(x);
    this.ring(880, [1, 1.5, 2.0, 3.0], [0.2, 0.12, 0.08, 0.05], [3.0, 2.4, 1.8, 1.2], 1.2, 1.0, d);
    this.tone("sine", 45, 22, 2.4, 1.0, d);
    this.noise(1.6, 0.5, d, { type: "lowpass", f0: 4000, f1: 120 }, { verb: 0.8 });
  }

  // rain + distant city hum, very quiet
  private startAmbience() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 500;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.value = 0.045;
    src.connect(hp).connect(lp).connect(g).connect(this.world);
    src.start();
    const hum = ctx.createOscillator();
    hum.type = "sawtooth";
    hum.frequency.value = 55;
    const hum2 = ctx.createOscillator();
    hum2.type = "sawtooth";
    hum2.frequency.value = 55.4;
    const hl = ctx.createBiquadFilter();
    hl.type = "lowpass";
    hl.frequency.value = 160;
    const hg = ctx.createGain();
    hg.gain.value = 0.02;
    hum.connect(hl);
    hum2.connect(hl);
    hl.connect(hg).connect(this.world);
    hum.start();
    hum2.start();
    this.ambience.push(src, hum, hum2);
  }
}

export const SFX = new Sfx();
