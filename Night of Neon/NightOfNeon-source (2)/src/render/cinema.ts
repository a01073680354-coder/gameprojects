// Time scale and cinematic moments: bullet-cam on (some) parry kills,
// a short slow-down on clearing an encounter, sword-duel beats, scripted
// letterboxed scenes (intro, dropship, teaser) and the death sequence.
// All timing here is in real seconds.

import { VIEW_W, VIEW_H, TUNE } from "../config";
import { Bullet } from "../sim/bullet";
import { ParryInfo } from "../sim/world";
import { SFX } from "../audio/sfx";

type Mode = "none" | "bullet" | "recover" | "finale" | "death" | "duel" | "scene";

export class Cinema {
  mode: Mode = "none";
  timeScale = 1;
  private target = 1;
  private t = 0;
  letter = 0;
  dim = 0;
  flash = 0;
  flashColor = 0xffffff;
  fade = 0; // black fade for death/reset
  bullet: Bullet | null = null;
  private lastCine = -999;
  private lastFinale = -999;
  private clock = 0;
  private onDeathDone: (() => void) | null = null;
  private deathStage = 0;
  private duelDur = 0.4;
  private sceneDur = 0;

  private gBars: Phaser.GameObjects.Graphics;
  private dimRect: Phaser.GameObjects.Rectangle;
  private flashRect: Phaser.GameObjects.Rectangle;
  private fadeRect: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    this.dimRect = scene.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x05030c, 1).setOrigin(0).setScrollFactor(0).setDepth(8.9).setAlpha(0);
    this.gBars = scene.add.graphics().setScrollFactor(0).setDepth(70);
    this.flashRect = scene.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xffffff, 1).setOrigin(0).setScrollFactor(0).setDepth(75).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.fadeRect = scene.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x000000, 1).setOrigin(0).setScrollFactor(0).setDepth(90).setAlpha(0);
  }

  get busy() { return this.mode !== "none"; }

  flashOnce(color: number, amount: number) {
    this.flashColor = color;
    this.flash = Math.max(this.flash, amount);
  }

  /** Decide whether this parry earns a bullet-cam. Rare by design. */
  considerParry(info: ParryInfo): boolean {
    if (this.mode !== "none" || !info.kill || !info.target || info.dist < 90) return false;
    if (this.clock - this.lastCine < TUNE.cineCooldown) return false;
    // encounter climax always; perfect kills often; ordinary kills rarely
    const want = info.lastOfGroup || Math.random() < (info.perfect ? 0.6 : TUNE.cineChance);
    if (!want) return false;
    this.mode = "bullet";
    this.t = 0;
    this.bullet = info.bullet;
    info.bullet.cinematic = true;
    // bullet should take ~0.9-1.6 s of real time to arrive
    const travel = info.dist / info.bullet.speed;
    const wantReal = Math.min(1.6, Math.max(0.9, info.dist / 190));
    this.target = Math.min(0.4, Math.max(0.08, travel / wantReal));
    this.lastCine = this.clock;
    SFX.cineIn();
    return true;
  }

  /** The cinematic bullet connected. */
  impact() {
    if (this.mode !== "bullet") return;
    this.flashOnce(0xffffff, 0.5);
    SFX.impact();
    this.mode = "recover";
    this.t = 0;
    this.bullet = null;
  }

  /** Short letterboxed slow-down for sword moments (deathblow, big clash). */
  duel(scale: number, dur: number, force = false): boolean {
    if (this.mode !== "none" && !(force && this.mode !== "death")) return false;
    if (!force && this.clock - this.lastCine < TUNE.cineCooldown) return false;
    this.mode = "duel";
    this.t = 0;
    this.target = scale;
    this.duelDur = dur;
    this.lastCine = this.clock;
    return true;
  }

  /** Letterboxed scripted moment at normal speed (camera driven by the scene). */
  scene(dur: number) {
    if (this.mode === "death") return;
    this.mode = "scene";
    this.t = 0;
    this.target = 1;
    this.sceneDur = dur;
  }

  endScene() {
    if (this.mode === "scene") { this.mode = "recover"; this.t = 0; }
  }

  finale(): boolean {
    if (this.mode !== "none" || this.clock - this.lastFinale < 3) return false;
    this.mode = "finale";
    this.t = 0;
    this.target = 0.3;
    this.lastFinale = this.clock;
    SFX.finale();
    return true;
  }

  death(done: () => void) {
    this.mode = "death";
    this.t = 0;
    this.target = 0.25;
    this.bullet = null;
    this.deathStage = 0;
    this.onDeathDone = done;
    this.flashOnce(0xff2a6d, 0.6);
  }

  update(dt: number) {
    this.clock += dt;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 3.2);
    let letterT = 0, dimT = 0;
    switch (this.mode) {
      case "none":
        this.target = 1;
        break;
      case "bullet":
        letterT = 1;
        dimT = 0.45;
        if (this.t > 3 || (this.bullet && !this.bullet.alive)) { this.mode = "recover"; this.t = 0; this.bullet = null; }
        break;
      case "recover":
        this.target = 1;
        if (this.t > 0.45) this.mode = "none";
        break;
      case "duel":
        letterT = 0.7;
        dimT = 0.3;
        if (this.t > this.duelDur) { this.mode = "recover"; this.t = 0; }
        break;
      case "scene":
        letterT = 1;
        this.target = 1;
        if (this.t > this.sceneDur) { this.mode = "recover"; this.t = 0; }
        break;
      case "finale":
        dimT = 0.15;
        if (this.t > 0.55) { this.mode = "recover"; this.t = 0; }
        break;
      case "death":
        dimT = 0.3;
        if (this.deathStage === 0 && this.t > 0.9) { this.deathStage = 1; this.t = 0; }
        if (this.deathStage === 1) {
          this.fade = Math.min(1, this.t / 0.4);
          if (this.t > 0.5) {
            this.deathStage = 2;
            this.t = 0;
            this.onDeathDone?.();
            this.timeScale = 1;
            this.target = 1;
          }
        }
        if (this.deathStage === 2) {
          this.fade = Math.max(0, 1 - this.t / 0.5);
          dimT = 0;
          if (this.t > 0.5) { this.mode = "none"; this.fade = 0; }
        }
        break;
    }
    // ease the time scale: fast into slow-mo, gentler back out
    const k = this.target < this.timeScale ? 18 : 5;
    this.timeScale += (this.target - this.timeScale) * (1 - Math.exp(-dt * k));
    if (Math.abs(this.timeScale - this.target) < 0.003) this.timeScale = this.target;
    this.letter += (letterT - this.letter) * (1 - Math.exp(-dt * 10));
    this.dim += (dimT - this.dim) * (1 - Math.exp(-dt * 10));
    SFX.setSlow(Math.max(0, Math.min(1, (1 - this.timeScale) / 0.88)));
  }

  /** Fade from black (stage intro). */
  fadeIn(from = 1) { this.fade = from; }

  draw(dt = 0) {
    if (this.mode !== "death" && this.fade > 0) this.fade = Math.max(0, this.fade - dt * 1.2);
    const h = Math.round(this.letter * 26);
    const g = this.gBars;
    g.clear();
    if (h > 0) {
      g.fillStyle(0x000000, 1);
      g.fillRect(0, 0, VIEW_W, h);
      g.fillRect(0, VIEW_H - h, VIEW_W, h);
      g.fillStyle(0x2de2e6, 0.5 * this.letter);
      g.fillRect(0, h, VIEW_W, 1);
      g.fillRect(0, VIEW_H - h - 1, VIEW_W, 1);
    }
    this.dimRect.setAlpha(this.dim);
    this.flashRect.setFillStyle(this.flashColor, 1).setAlpha(this.flash * 0.6);
    this.fadeRect.setAlpha(this.fade);
  }
}
