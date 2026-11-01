// The prologue (bible v3, P-01/P-02): painted shots (the city, a phone that
// will not connect, a records terminal, a photo with a blank name tag, the
// tape recorder, the sword) drawn live on a 640x360 pixel canvas, with
// subtitles. It plays itself; a click (or Enter / Space) moves on sooner, Esc
// or the skip button ends it. Runs before STAGE 1 (the outskirts, in the same
// house), and again from the Tab menu.

import { SFX } from "../audio/sfx";
import { PROLOGUE, PrologueStep, Shot, SPEAKERS } from "../story/script";

const W = 640, H = 360;
const CPS = 26;

/** Small deterministic RNG so the skyline is the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

interface Bldg { x: number; w: number; h: number; win: { x: number; y: number; c: string }[]; sign?: { x: number; y: number; w: number; h: number; c: string } }

function skyline(seed: number, n: number, minH: number, maxH: number, winP: number, signP: number): Bldg[] {
  const r = rng(seed);
  const out: Bldg[] = [];
  let x = -40;
  const cols = ["#ff2a6d", "#2de2e6", "#f9f871", "#b967ff"];
  for (let i = 0; i < n && x < W * 2.2; i++) {
    const w = 18 + Math.floor(r() * 46), h = minH + Math.floor(r() * (maxH - minH));
    const win: Bldg["win"] = [];
    for (let yy = 6; yy < h - 4; yy += 6) for (let xx = 3; xx < w - 3; xx += 5) if (r() < winP) win.push({ x: xx, y: yy, c: cols[Math.floor(r() * 3)] });
    const b: Bldg = { x, w, h, win };
    if (r() < signP) b.sign = { x: 2 + Math.floor(r() * (w - 10)), y: 8 + Math.floor(r() * 30), w: 4 + Math.floor(r() * 5), h: 10 + Math.floor(r() * 18), c: cols[Math.floor(r() * 4)] };
    out.push(b);
    x += w + Math.floor(r() * 6);
  }
  return out;
}

class Prologue {
  active = false;
  private root!: HTMLDivElement;
  private cv!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private sub!: HTMLDivElement;
  private subName!: HTMLDivElement;
  private subText!: HTMLDivElement;
  private ui!: HTMLDivElement;
  private card!: HTMLDivElement;
  private far = skyline(7, 80, 40, 150, 0.22, 0.12);
  private near = skyline(31, 60, 70, 190, 0.08, 0.35);
  private drops = Array.from({ length: 150 }, (_, i) => { const r = rng(100 + i); return { x: r() * W, y: r() * H, v: 380 + r() * 260, l: 6 + r() * 10 }; });
  private glass = Array.from({ length: 26 }, (_, i) => { const r = rng(300 + i); return { x: r(), y: r(), v: 0.03 + r() * 0.09 }; });

  private layers = new Map<string, HTMLCanvasElement>();
  private step = -1;
  private shot: Shot = "black";
  private shotT = 0;
  private stepT = 0;
  private fade = 1;      // black overlay alpha
  private flash = 0;     // lightning
  private deny = 0;
  private playing = false;
  private unsheathe = -1;
  private typingDone = true;
  private typedAt = 0;
  private raf = 0;
  private last = 0;
  private finishType: (() => void) | null = null;
  private onEnd: (() => void) | null = null;
  private waitReady: () => boolean = () => true;
  private ending = -1;

  private build() {
    if (this.root) return;
    const r = document.createElement("div");
    r.id = "prologue";
    r.hidden = true;
    r.innerHTML = `
      <div class="pr-frame">
        <canvas width="${W}" height="${H}" aria-hidden="true"></canvas>
        <div class="pr-ui" aria-hidden="true"></div>
        <div class="pr-card" aria-hidden="true"><b></b><small></small></div>
        <div class="pr-sub" role="status" aria-live="polite"><div class="st-name"></div><div class="st-text"></div></div>
      </div>
      <div class="pr-hint">클릭 · Enter: 다음</div>
      <button type="button" class="st-skip">건너뛰기 <span>Esc</span></button>`;
    document.body.appendChild(r);
    this.root = r;
    this.cv = r.querySelector("canvas")!;
    this.g = this.cv.getContext("2d")!;
    this.sub = r.querySelector(".pr-sub")!;
    this.subName = r.querySelector(".pr-sub .st-name")!;
    this.subText = r.querySelector(".pr-sub .st-text")!;
    this.ui = r.querySelector(".pr-ui")!;
    this.card = r.querySelector(".pr-card")!;
    r.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest(".st-skip")) return;
      e.preventDefault();
      this.next(true);
    });
    r.querySelector(".st-skip")!.addEventListener("click", (e) => { e.stopPropagation(); this.end(); });
    window.addEventListener("keydown", (e) => {
      if (!this.active) return;
      if (e.code === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); this.end(); return; }
      if (e.code === "Enter" || e.code === "Space" || e.code === "NumpadEnter") { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.next(true); return; }
      if (e.code !== "KeyM") e.stopImmediatePropagation();
    }, true);
  }

  /** Plays the prologue; `ready` holds the first shot until the game has loaded. */
  play(onEnd: () => void, ready: () => boolean = () => true) {
    this.build();
    this.onEnd = onEnd;
    this.waitReady = ready;
    this.active = true;
    this.ending = -1;
    this.root.hidden = false;
    this.root.classList.remove("out");
    this.step = -1;
    this.fade = 1;
    this.playing = false;
    this.unsheathe = -1;
    this.subText.textContent = "";
    this.sub.classList.remove("on");
    SFX.prologuePad(true);
    this.last = performance.now();
    this.next(false);
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private end() {
    if (!this.active || this.ending >= 0) return;
    if (!this.waitReady()) { setTimeout(() => this.end(), 200); return; }
    this.ending = 0;
    this.finishType = null;
    SFX.prologuePad(false);
    SFX.tapeHiss(false);
    this.sub.classList.remove("on");
    this.root.classList.add("out");
    setTimeout(() => {
      this.active = false;
      cancelAnimationFrame(this.raf);
      this.root.hidden = true;
      const cb = this.onEnd;
      this.onEnd = null;
      cb?.();
    }, 650);
  }

  private next(user: boolean) {
    if (this.ending >= 0) return;
    if (user && !this.typingDone) { this.finishType?.(); return; }
    if (this.step === 0 && !this.waitReady()) return; // still loading the game behind us
    if (user) SFX.storyCue("advance");
    this.step++;
    if (this.step >= PROLOGUE.length) { this.end(); return; }
    const s = PROLOGUE[this.step];
    this.stepT = 0;
    if (s.shot !== this.shot) {
      this.shot = s.shot;
      this.shotT = 0;
      this.fade = Math.max(this.fade, 1);
    }
    if (s.cue === "thunder") this.flash = 1;
    if (s.cue === "deny") this.deny = 1;
    if (s.cue === "tapeIn") this.playing = true;
    if (s.cue === "tapeOut" || s.cue === "tapeCut") this.playing = false;
    if (s.cue === "unsheathe") this.unsheathe = 0;
    if (s.cue) SFX.storyCue(s.cue);
    this.showUi(s);
    this.showCard(s);
    this.showLine(s);
  }

  private showUi(s: PrologueStep) {
    const lines = s.ui ?? [];
    this.ui.dataset.shot = s.shot;
    this.ui.innerHTML = lines.map((l, i) => `<div class="${i === 0 ? "h" : ""}">${l.replace(/</g, "&lt;") || "&nbsp;"}</div>`).join("") + (lines.length && s.shot === "terminal" ? `<span class="cur">▌</span>` : "");
    this.ui.classList.toggle("on", lines.length > 0);
    this.ui.classList.toggle("deny", s.cue === "deny" || lines.some((l) => l.includes("결과 없음")));
  }

  private showCard(s: PrologueStep) {
    const on = !!s.card;
    if (on) {
      (this.card.querySelector("b") as HTMLElement).textContent = s.card!.big;
      (this.card.querySelector("small") as HTMLElement).textContent = s.card!.small ?? "";
    }
    this.card.classList.toggle("on", on);
  }

  private showLine(s: PrologueStep) {
    if (!s.line) {
      this.sub.classList.remove("on");
      this.typingDone = true;
      this.typedAt = 0;
      return;
    }
    const ln = s.line;
    const sp = SPEAKERS[ln.who];
    this.subName.textContent = sp.name ? (sp.tag ? `${sp.name} · ${sp.tag}` : sp.name) : "";
    this.subName.style.color = sp.color;
    this.subName.hidden = !sp.name;
    this.sub.dataset.who = ln.who;
    this.sub.classList.add("on");
    this.subText.textContent = "";
    this.typingDone = false;
    const chars = Array.from(ln.text);
    let i = 0, acc = 0, wait = 0.15, blips = 0;
    const done = () => { this.subText.textContent = ln.text; this.typingDone = true; this.typedAt = this.stepT; this.finishType = null; };
    this.finishType = done;
    (this as any).typeTick = (dt: number) => {
      if (this.typingDone) return;
      if (wait > 0) { wait -= dt; return; }
      acc += dt;
      while (acc >= 1 / CPS && i < chars.length) {
        acc -= 1 / CPS;
        const ch = chars[i++];
        this.subText.textContent += ch;
        if (ch.trim() && blips++ % 2 === 0) SFX.voice(ln.who, i);
        if (ch === "…") { wait = 0.25; break; }
        if (ch === "." || ch === "?" || ch === "!") { wait = 0.18; break; }
        if (ch === ",") { wait = 0.09; break; }
      }
      if (i >= chars.length) done();
    };
  }

  private frame(now: number) {
    if (!this.active) return;
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const s = PROLOGUE[this.step];
    // the very first black shot waits for the game to finish loading
    const ready = this.waitReady();
    const holdForLoad = this.step === 0 && !ready;
    if (!holdForLoad) this.stepT += dt;
    this.shotT += dt;
    (this as any).typeTick?.(dt);
    this.fade = Math.max(0, this.fade - dt / 0.8);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.deny = Math.max(0, this.deny - dt * 1.2);
    if (this.unsheathe >= 0) this.unsheathe += dt;
    if (s && this.ending < 0) {
      const len = s.line ? Array.from(s.line.text).length : 0;
      const read = s.line ? 1.5 + len * 0.055 : 0;
      const need = Math.max(s.hold ?? 0, read);
      const doneAt = s.line ? (this.typingDone ? this.typedAt + read * 0.6 : Infinity) : need;
      if (!holdForLoad && this.stepT >= Math.max(s.hold ?? 0, doneAt)) this.next(false);
    }
    this.draw(now / 1000);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- drawing

  private draw(time: number) {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    switch (this.shot) {
      case "black": g.fillStyle = "#000"; g.fillRect(0, 0, W, H); break;
      case "city": this.drawCity(time); break;
      case "phone": this.drawPhone(time); break;
      case "terminal": this.drawTerminal(time); break;
      case "photo": this.drawPhoto(time); break;
      case "recorder": this.drawRecorder(time); break;
      case "sword": this.drawSword(time); break;
    }
    if (this.flash > 0 && this.shot !== "black") {
      g.fillStyle = `rgba(220,230,255,${this.flash * this.flash * 0.55})`;
      g.fillRect(0, 0, W, H);
    }
    // film grain + vignette
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.7)");
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
    if (this.fade > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, this.fade)})`; g.fillRect(0, 0, W, H); }
  }

  private rain(time: number, alpha: number, slant = 0.18, speed = 1) {
    const g = this.g;
    g.fillStyle = `rgba(160,180,230,${alpha})`;
    for (const d of this.drops) {
      const y = (d.y + time * d.v * speed) % (H + 20) - 10;
      const x = (d.x + time * d.v * slant * speed) % W;
      for (let k = 0; k < d.l; k += 2) g.fillRect(Math.round(x - k * slant), Math.round(y - k), 1, 2);
    }
  }

  private drawCity(time: number) {
    const g = this.g;
    const t = this.shotT;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#04020a");
    sky.addColorStop(0.55, "#170926");
    sky.addColorStop(0.85, "#3a1040");
    sky.addColorStop(1, "#1a0820");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // the Neon Spire: white light at the top ("white night")
    const sx = 418 - t * 1.5, top = 22;
    const beam = g.createLinearGradient(sx, 0, sx, top);
    beam.addColorStop(0, "rgba(255,255,255,0)");
    beam.addColorStop(1, `rgba(235,240,255,${0.18 + 0.05 * Math.sin(time * 1.3)})`);
    g.fillStyle = beam;
    g.fillRect(sx - 3, 0, 6, top);
    const halo = g.createRadialGradient(sx, top + 6, 2, sx, top + 6, 70);
    halo.addColorStop(0, "rgba(240,244,255,0.55)");
    halo.addColorStop(1, "rgba(240,244,255,0)");
    g.fillStyle = halo;
    g.fillRect(sx - 80, top - 70, 160, 150);
    g.fillStyle = "#0c0716";
    g.beginPath();
    g.moveTo(sx - 3, top); g.lineTo(sx + 3, top); g.lineTo(sx + 16, H); g.lineTo(sx - 16, H); g.closePath();
    g.fill();
    g.fillStyle = "#f2f4ff";
    g.fillRect(sx - 2, top, 4, 4);
    for (let y = top + 18; y < H; y += 11) {
      const half = 3 + (y - top) * 0.04;
      g.fillStyle = `rgba(143,232,255,${0.25 + 0.2 * Math.sin(time * 2 + y)})`;
      g.fillRect(Math.round(sx - half + 2), y, Math.round(half * 2 - 4), 1);
    }
    // far skyline, then near: buildings and windows are painted once, signs flicker live
    const layer = (bs: Bldg[], off: number, base: string, winA: number, scale: number) => {
      const key = base + scale;
      let cv = this.layers.get(key);
      if (!cv) {
        cv = document.createElement("canvas");
        cv.width = Math.ceil(W * 2.4); cv.height = H;
        const c = cv.getContext("2d")!;
        for (const b of bs) {
          const y = H - b.h * scale;
          c.fillStyle = base;
          c.fillRect(b.x + 40, Math.round(y), b.w, H);
          c.globalAlpha = winA;
          for (const w of b.win) { c.fillStyle = w.c; c.fillRect(b.x + 40 + w.x, Math.round(y + w.y * scale), 2, 1); }
          c.globalAlpha = 1;
        }
        this.layers.set(key, cv);
      }
      g.drawImage(cv, Math.round(-40 - off), 0);
      for (const b of bs) {
        const x = Math.round(b.x - off);
        if (x > W || x + b.w < 0) continue;
        const y = H - b.h * scale;
        if (b.sign) {
          const on = Math.sin(time * 3 + b.x) > -0.8;
          g.fillStyle = b.sign.c;
          g.globalAlpha = on ? 0.9 : 0.25;
          g.fillRect(x + b.sign.x, Math.round(y + b.sign.y), b.sign.w, b.sign.h);
          g.globalAlpha = on ? 0.18 : 0.05;
          g.fillRect(x + b.sign.x - 4, Math.round(y + b.sign.y - 4), b.sign.w + 8, b.sign.h + 8);
          g.globalAlpha = 1;
        }
      }
    };
    layer(this.far, 60 + t * 4, "#140b22", 0.55, 1);
    const fog = g.createLinearGradient(0, H * 0.55, 0, H);
    fog.addColorStop(0, "rgba(255,42,109,0)");
    fog.addColorStop(1, "rgba(255,42,109,0.16)");
    g.fillStyle = fog;
    g.fillRect(0, H * 0.55, W, H * 0.45);
    layer(this.near, 120 + t * 9, "#07040f", 0.75, 1.15);
    this.rain(time, 0.35);
  }

  private drawTerminal(time: number) {
    const g = this.g;
    g.fillStyle = "#030409";
    g.fillRect(0, 0, W, H);
    // rain on a window behind the monitor
    g.globalAlpha = 0.5;
    this.rain(time, 0.18, 0.05, 0.6);
    g.globalAlpha = 1;
    // monitor
    const x0 = 120, y0 = 46, w = 400, h = 236;
    g.fillStyle = "#14121c"; g.fillRect(x0 - 14, y0 - 14, w + 28, h + 28);
    g.fillStyle = "#1e1b2a"; g.fillRect(x0 - 14, y0 - 14, w + 28, 2);
    g.fillStyle = "#0a0910"; g.fillRect(x0 + w / 2 - 30, y0 + h + 14, 60, 30);
    g.fillRect(x0 + w / 2 - 70, y0 + h + 42, 140, 6);
    const scr = g.createRadialGradient(x0 + w / 2, y0 + h / 2, 10, x0 + w / 2, y0 + h / 2, w * 0.7);
    const red = this.deny;
    scr.addColorStop(0, red > 0 ? `rgb(${30 + 60 * red},${20},${24})` : "#0b2228");
    scr.addColorStop(1, "#03080a");
    g.fillStyle = scr;
    g.fillRect(x0, y0, w, h);
    // the White Night mark, top-left of the screen
    g.strokeStyle = "rgba(230,240,255,0.8)";
    g.lineWidth = 1;
    g.beginPath(); g.arc(x0 + 26, y0 + 24, 9, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "rgba(230,240,255,0.9)";
    g.beginPath(); g.arc(x0 + 26, y0 + 24, 4, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(159,252,255,0.35)";
    g.fillRect(x0 + 44, y0 + 23, w - 64, 1);
    // scanlines + flicker
    g.fillStyle = `rgba(0,0,0,${0.25 + 0.05 * Math.sin(time * 50)})`;
    for (let y = y0; y < y0 + h; y += 2) g.fillRect(x0, y, w, 1);
    // light spill onto the desk
    const spill = g.createLinearGradient(0, y0 + h, 0, H);
    spill.addColorStop(0, red > 0 ? "rgba(255,60,80,0.12)" : "rgba(80,220,255,0.10)");
    spill.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = spill;
    g.fillRect(0, y0 + h + 10, W, H);
  }

  private drawRecorder(time: number) {
    const g = this.g;
    const t = this.shotT;
    g.fillStyle = "#05030a";
    g.fillRect(0, 0, W, H);
    // window: city lights out of focus, water running down the glass
    const wx = 40, wy = 40, ww = 220, wh = 180;
    g.fillStyle = "#0d0818"; g.fillRect(wx, wy, ww, wh);
    const bok = [["#ff2a6d", 0.2, 0.3], ["#2de2e6", 0.6, 0.55], ["#f9f871", 0.35, 0.75], ["#b967ff", 0.8, 0.25], ["#ff2a6d", 0.7, 0.8], ["#2de2e6", 0.15, 0.65]] as [string, number, number][];
    for (const [c, bx, by] of bok) {
      const x = wx + bx * ww + Math.sin(time * 0.3 + bx * 9) * 4, y = wy + by * wh;
      const gr = g.createRadialGradient(x, y, 1, x, y, 26);
      gr.addColorStop(0, c + "88");
      gr.addColorStop(1, c + "00");
      g.fillStyle = gr;
      g.fillRect(x - 26, y - 26, 52, 52);
    }
    g.fillStyle = "rgba(200,215,255,0.35)";
    for (const d of this.glass) {
      const y = wy + ((d.y + time * d.v) % 1) * wh;
      const x = wx + d.x * ww;
      g.fillRect(Math.round(x), Math.round(y), 2, 3);
      g.fillStyle = "rgba(200,215,255,0.12)";
      g.fillRect(Math.round(x), Math.round(y - 14), 1, 14);
      g.fillStyle = "rgba(200,215,255,0.35)";
    }
    g.fillStyle = "#120c1c";
    g.fillRect(wx - 6, wy - 6, ww + 12, 6); g.fillRect(wx - 6, wy + wh, ww + 12, 6);
    g.fillRect(wx - 6, wy, 6, wh); g.fillRect(wx + ww, wy, 6, wh); g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
    // window light falling across the table
    g.fillStyle = "rgba(120,110,200,0.06)";
    g.beginPath(); g.moveTo(wx, wy + wh); g.lineTo(wx + ww, wy + wh); g.lineTo(W, 300); g.lineTo(200, 300); g.closePath(); g.fill();
    // table
    g.fillStyle = "#100a16"; g.fillRect(0, 286, W, H - 286);
    g.fillStyle = "#2a2036"; g.fillRect(0, 286, W, 2);
    // the recorder
    const rx = 330, ry = 196, rw = 236, rh = 92;
    g.fillStyle = "#000"; g.globalAlpha = 0.5; g.fillRect(rx + 6, ry + rh, rw, 6); g.globalAlpha = 1;
    g.fillStyle = "#2a2430"; g.fillRect(rx, ry, rw, rh);
    g.fillStyle = "#4a4058"; g.fillRect(rx, ry, rw, 2); g.fillRect(rx, ry, 2, rh);
    g.fillStyle = "#18141e"; g.fillRect(rx + 2, ry + rh - 2, rw - 2, 2);
    // keys
    for (let i = 0; i < 5; i++) {
      const down = this.playing && i === 1;
      g.fillStyle = i === 4 ? "#6a2030" : "#3c3448";
      g.fillRect(rx + 16 + i * 26, ry - (down ? 3 : 7), 20, down ? 3 : 7);
    }
    // cassette window
    g.fillStyle = "#0c0a10"; g.fillRect(rx + 30, ry + 16, 150, 58);
    g.fillStyle = "#3a2a20"; g.fillRect(rx + 50, ry + 54, 110, 4); // tape
    const spin = this.playing ? time * 5 : 0;
    for (const [cx, cy] of [[rx + 70, ry + 44], [rx + 140, ry + 44]]) {
      g.fillStyle = "#d8d0c0"; g.beginPath(); g.arc(cx, cy, 16, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#1a1418"; g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#1a1418"; g.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        const a = spin + (k * Math.PI * 2) / 3;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6); g.lineTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14); g.stroke();
      }
    }
    // speaker grille, LED, level meter
    g.fillStyle = "#18141e";
    for (let y = ry + 18; y < ry + 74; y += 5) for (let x = rx + 192; x < rx + 224; x += 5) g.fillRect(x, y, 3, 3);
    const led = this.playing && Math.floor(time * 2) % 2 === 0;
    g.fillStyle = led ? "#ff3040" : "#40141a";
    g.fillRect(rx + 196, ry + 80, 6, 4);
    if (led) { g.fillStyle = "rgba(255,48,64,0.25)"; g.fillRect(rx + 190, ry + 74, 18, 16); }
    const lvl = this.playing ? Math.abs(Math.sin(time * 9) * Math.sin(time * 3.7)) : 0;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i < lvl * 8 ? (i > 5 ? "#ff6f91" : "#6dffc0") : "#202028";
      g.fillRect(rx + 40 + i * 9, ry + 80, 7, 4);
    }
    // the little moon she scratched into the casing, catching the window light
    if (this.step > PROLOGUE.findIndex((p) => p.shot === "recorder")) {
      const k = Math.min(1, t / 1.5);
      g.strokeStyle = `rgba(235,240,255,${0.35 + 0.35 * k})`;
      g.lineWidth = 1;
      g.beginPath(); g.arc(rx + rw - 16, ry + 12, 5, Math.PI * 0.25, Math.PI * 1.25); g.stroke();
      g.beginPath(); g.arc(rx + rw - 14, ry + 11, 4, Math.PI * 0.25, Math.PI * 1.25); g.stroke();
    }
    this.rain(time, 0.05, 0.1, 0.5);
  }

  /** P-01: a dark room, rain on the window, an old handset calling nobody. */
  private drawPhone(time: number) {
    const g = this.g;
    const t = this.shotT;
    g.fillStyle = "#04030a";
    g.fillRect(0, 0, W, H);
    // the window: a dim city glow and water running down
    const wx = 360, wy = 30, ww = 230, wh = 190;
    const sky = g.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, "#0a0716"); sky.addColorStop(1, "#24102e");
    g.fillStyle = sky; g.fillRect(wx, wy, ww, wh);
    for (const [c, bx, by] of [["#ff2a6d", 0.3, 0.8], ["#2de2e6", 0.7, 0.7], ["#b967ff", 0.5, 0.9]] as [string, number, number][]) {
      const x = wx + bx * ww, y = wy + by * wh;
      const gr = g.createRadialGradient(x, y, 1, x, y, 40);
      gr.addColorStop(0, c + "55"); gr.addColorStop(1, c + "00");
      g.fillStyle = gr; g.fillRect(x - 40, y - 40, 80, 80);
    }
    g.fillStyle = "rgba(200,215,255,0.3)";
    for (const d of this.glass) {
      const y = wy + ((d.y + time * d.v) % 1) * wh, x = wx + d.x * ww;
      g.fillRect(Math.round(x), Math.round(y), 2, 3);
      g.fillStyle = "rgba(200,215,255,0.1)"; g.fillRect(Math.round(x), Math.round(y - 12), 1, 12); g.fillStyle = "rgba(200,215,255,0.3)";
    }
    g.fillStyle = "#120c1c";
    g.fillRect(wx - 6, wy - 6, ww + 12, 6); g.fillRect(wx - 6, wy + wh, ww + 12, 6);
    g.fillRect(wx - 6, wy, 6, wh); g.fillRect(wx + ww, wy, 6, wh); g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
    // a low table, a cup gone cold, the handset
    g.fillStyle = "#0e0914"; g.fillRect(0, 270, W, H - 270);
    g.fillStyle = "#261d32"; g.fillRect(0, 270, W, 2);
    g.fillStyle = "#1e1826"; g.fillRect(470, 250, 22, 20); g.fillStyle = "#2c2436"; g.fillRect(470, 250, 22, 2); g.fillRect(492, 255, 5, 9);
    const px = 150, py = 150, pw = 200, ph = 110;
    g.fillStyle = "#000"; g.globalAlpha = 0.5; g.fillRect(px + 8, py + ph, pw, 8); g.globalAlpha = 1;
    g.fillStyle = "#1c1824"; g.fillRect(px, py, pw, ph);
    g.fillStyle = "#3a3246"; g.fillRect(px, py, pw, 2);
    // the receiver lying across the top
    g.fillStyle = "#2a2434"; g.fillRect(px + 10, py - 22, pw - 20, 18);
    g.fillRect(px + 4, py - 26, 30, 26); g.fillRect(px + pw - 34, py - 26, 30, 26);
    g.fillStyle = "#3e364a"; g.fillRect(px + 10, py - 22, pw - 20, 2);
    // keypad
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      g.fillStyle = "#2c2638"; g.fillRect(px + 116 + c * 22, py + 16 + r * 22, 16, 14);
      g.fillStyle = "#3c3448"; g.fillRect(px + 116 + c * 22, py + 16 + r * 22, 16, 2);
    }
    // the little screen: green while it rings, red when it gives up
    const step = PROLOGUE[this.step];
    const failed = step?.cue === "deny" || (step?.ui?.[2] ?? "").includes("연결할 수");
    const blink = failed ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(time * 3));
    g.fillStyle = failed ? `rgba(120,20,36,${blink})` : `rgba(20,90,70,${blink})`;
    g.fillRect(px + 14, py + 16, 90, 40);
    g.fillStyle = failed ? "rgba(255,111,145,0.9)" : "rgba(109,255,192,0.9)";
    for (let i = 0; i < 4; i++) g.fillRect(px + 20 + i * 12, py + 44, 8, 2);
    const spill = g.createRadialGradient(px + 60, py + 36, 4, px + 60, py + 36, 120);
    spill.addColorStop(0, failed ? "rgba(255,60,90,0.16)" : "rgba(80,255,190,0.14)");
    spill.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = spill; g.fillRect(px - 60, py - 84, 240, 240);
    // his hand, resting by it
    const hy = 268 - Math.min(1, t / 3) * 4;
    g.fillStyle = "#3a2c2a"; g.fillRect(px + pw + 20, hy - 14, 54, 14);
    g.fillStyle = "#4a3a36"; g.fillRect(px + pw + 20, hy - 14, 54, 2);
    for (let i = 0; i < 4; i++) g.fillRect(px + pw + 18 - i * 0, hy - 12 + i * 3, 6, 2);
    this.rain(time, 0.04, 0.1, 0.5);
  }

  /** A framed photo: two faces, a digital tag with one name and one blank. */
  private drawPhoto(time: number) {
    const g = this.g;
    const t = this.shotT;
    g.fillStyle = "#05030a";
    g.fillRect(0, 0, W, H);
    // lamp light from above
    const lamp = g.createRadialGradient(320, 40, 10, 320, 160, 330);
    lamp.addColorStop(0, "rgba(255,200,140,0.16)"); lamp.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = lamp; g.fillRect(0, 0, W, H);
    const zoom = 1 + Math.min(1, t / 9) * 0.06;
    g.save();
    g.translate(320, 170); g.scale(zoom, zoom); g.translate(-320, -170);
    // frame
    const fx = 196, fy = 46, fw = 248, fh = 206;
    g.fillStyle = "#2a1e18"; g.fillRect(fx - 12, fy - 12, fw + 24, fh + 24);
    g.fillStyle = "#4a3426"; g.fillRect(fx - 12, fy - 12, fw + 24, 3);
    g.fillStyle = "#1a120e"; g.fillRect(fx - 4, fy - 4, fw + 8, fh + 8);
    // the print: a summer evening by the old house, faded
    const ph = g.createLinearGradient(0, fy, 0, fy + fh);
    ph.addColorStop(0, "#c88a66"); ph.addColorStop(0.55, "#8a5a5a"); ph.addColorStop(1, "#3a2a34");
    g.fillStyle = ph; g.fillRect(fx, fy, fw, fh);
    g.fillStyle = "rgba(40,24,30,0.65)"; g.fillRect(fx, fy + 120, fw, fh - 120);
    g.fillStyle = "#4a3038"; g.fillRect(fx + 160, fy + 54, 70, 70); // the house behind
    g.fillStyle = "#5a3a40"; g.beginPath(); g.moveTo(fx + 154, fy + 56); g.lineTo(fx + 195, fy + 30); g.lineTo(fx + 236, fy + 56); g.closePath(); g.fill();
    g.fillStyle = "#e8c070"; g.fillRect(fx + 176, fy + 74, 12, 12);
    // two figures: a tall older man, a young woman leaning on his arm
    const fig = (x: number, y: number, w: number, h: number, body: string, hair: string) => {
      g.fillStyle = body; g.fillRect(x, y + 18, w, h - 18);
      g.fillStyle = "#d8a888"; g.fillRect(x + w / 2 - 7, y + 2, 14, 16);
      g.fillStyle = hair; g.fillRect(x + w / 2 - 8, y, 16, 6);
    };
    fig(fx + 58, fy + 62, 34, 120, "#2c2a3a", "#c8c8d0");
    fig(fx + 100, fy + 78, 28, 104, "#6a3a48", "#2a1a1a");
    g.fillStyle = "#2a1a1a"; g.fillRect(fx + 106, fy + 84, 4, 26); g.fillRect(fx + 118, fy + 84, 4, 22); // her hair down
    // fading, as if bleached
    g.fillStyle = "rgba(255,240,220,0.12)"; g.fillRect(fx, fy, fw, fh);
    g.strokeStyle = "rgba(255,255,255,0.08)"; g.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
    // the digital tag strip below: one name, one blank that blinks
    const ty = fy + fh + 22;
    g.fillStyle = "#0a1418"; g.fillRect(fx, ty, fw, 26);
    g.fillStyle = "rgba(159,252,255,0.35)"; g.fillRect(fx, ty, fw, 1);
    g.fillStyle = "#9ffcff";
    // "백도진" stands in as three blocks of light; the second tag is empty
    for (let i = 0; i < 3; i++) g.fillRect(fx + 40 + i * 12, ty + 9, 9, 9);
    const on = Math.floor(time * 1.6) % 2 === 0;
    g.strokeStyle = on ? "rgba(255,111,145,0.85)" : "rgba(255,111,145,0.3)";
    g.setLineDash([3, 2]); g.strokeRect(fx + 140.5, ty + 7.5, 64, 12); g.setLineDash([]);
    g.fillStyle = "rgba(159,252,255,0.25)"; g.fillRect(fx + 60, ty - 30, 1, 30); g.fillRect(fx + 172, ty - 46, 1, 46);
    g.restore();
    this.rain(time, 0.03, 0.1, 0.4);
  }

  private drawSword(time: number) {
    const g = this.g;
    g.fillStyle = "#020104";
    g.fillRect(0, 0, W, H);
    // a slow, cold light from the left, with lightning
    const lit = 0.25 + 0.75 * Math.max(this.flash, 0.35 + 0.1 * Math.sin(time * 0.7));
    const lg = g.createRadialGradient(140, 120, 10, 260, 220, 420);
    lg.addColorStop(0, `rgba(90,100,170,${0.22 * lit})`);
    lg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);
    // cloth
    g.fillStyle = `rgba(70,20,30,${0.9})`;
    g.beginPath(); g.moveTo(70, 250); g.lineTo(600, 210); g.lineTo(620, 236); g.lineTo(80, 284); g.closePath(); g.fill();
    g.fillStyle = "rgba(120,40,50,0.5)";
    g.beginPath(); g.moveTo(70, 250); g.lineTo(600, 210); g.lineTo(602, 214); g.lineTo(72, 254); g.closePath(); g.fill();
    // the sword along a gentle diagonal: handle on the right
    const ax = 110, ay = 252, bx = 560, by = 214; // tip end .. pommel end
    const ux = (bx - ax), uy = (by - ay);
    const len = Math.hypot(ux, uy), dx = ux / len, dy = uy / len, nx = -dy, ny = dx;
    const at = (u: number, v = 0) => [ax + dx * u + nx * v, ay + dy * u + ny * v];
    const quad = (u0: number, u1: number, v0: number, v1: number, c: string) => {
      const p = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
      g.fillStyle = c;
      g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (const q of p.slice(1)) g.lineTo(q[0], q[1]); g.closePath(); g.fill();
    };
    const hilt = 360; // where the guard sits along the sword
    const out = this.unsheathe < 0 ? 0 : Math.min(1, Math.max(0, (this.unsheathe - 0.25) / 0.9));
    const slide = out * 110; // the blade drawn this far out of the scabbard, toward the hilt side
    // scabbard (lacquered black, with a faint crimson sheen), slides left as the blade comes out
    quad(0 - slide, hilt - 8 - slide, -6, 6, "#0c0a10");
    quad(0 - slide, hilt - 8 - slide, -6, -4, `rgba(120,30,50,${0.6 * lit})`);
    quad(40 - slide, 52 - slide, -7, 7, "#6a5a3a");
    // the bare blade between scabbard mouth and guard
    if (slide > 0) {
      quad(hilt - 8 - slide, hilt - 6, -4, 4, "#aeb8cc");
      quad(hilt - 8 - slide, hilt - 6, -4, -2, "#e8eef8");
      // a glint running along it
      const gl = (this.unsheathe - 1.2) / 0.6;
      if (gl > 0 && gl < 1) {
        const u = hilt - 8 - slide + gl * (slide + 2);
        const [gx, gy] = at(u, -2);
        const gr = g.createRadialGradient(gx, gy, 0, gx, gy, 18);
        gr.addColorStop(0, "rgba(255,255,255,0.95)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr;
        g.fillRect(gx - 18, gy - 18, 36, 36);
      }
    }
    // guard, the deflector box the daughter fitted, the wrapped grip
    quad(hilt - 6, hilt + 2, -12, 12, "#3a3428");
    quad(hilt - 6, hilt + 2, -12, -10, `rgba(200,180,120,${0.6 * lit})`);
    quad(hilt + 2, hilt + 22, -5, 5, "#1c2a30");
    const pulse = 0.4 + 0.6 * Math.abs(Math.sin(time * 2.2));
    quad(hilt + 8, hilt + 14, -2, 2, `rgba(45,226,230,${0.5 + 0.5 * pulse})`);
    for (let u = hilt + 22; u < len - 6; u += 8) { quad(u, u + 4, -5, 5, "#2a1c18"); quad(u + 4, u + 8, -5, 5, "#4a3426"); }
    quad(len - 6, len, -6, 6, "#3a3428");
    // the moon-scar: a crescent mark on the guard glows faintly
    const [mx, my] = at(hilt - 2, 0);
    g.strokeStyle = `rgba(230,235,255,${0.3 + 0.4 * lit})`;
    g.lineWidth = 1;
    g.beginPath(); g.arc(mx, my, 5, Math.PI * 0.2, Math.PI * 1.2); g.stroke();
    this.rain(time, 0.04, 0.1, 0.4);
  }
}

export const PROLOGUE_UI = new Prologue();
