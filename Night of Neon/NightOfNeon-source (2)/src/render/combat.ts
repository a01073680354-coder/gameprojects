// Draws soldiers, rifles, laser sights, bullets, slashes, cuts and popups.

import { TILE, TUNE, TEST } from "../config";
import { World } from "../sim/world";
import { Soldier } from "../sim/soldier";
import { Boss, BOSS, podMuzzle } from "../sim/boss";
import { Assassin, ASN } from "../sim/assassin";
import { Archivist, ARC } from "../sim/archivist";
import { Chief } from "../sim/chief";
import { Bulwark, BUL } from "../sim/bulwark";
import { Bullet } from "../sim/bullet";
import { SOLID } from "../world/level";
import { drawText, textWidth } from "../ui/pixelfont";
import { PATTERNS } from "../sim/patterns";

declare const SOLDIER_META: {
  anims: Record<string, Record<string, { start: number; end: number; fps: number; loop: boolean }>>;
  shoulder: [number, number];
  armPivot: [number, number];
  armPivots: Record<string, [number, number]>;
};
declare const BLADE_ANIMS: Record<string, { start: number; end: number; fps: number; loop: boolean }>;
declare const ASSASSIN_ANIMS: Record<string, { start: number; end: number; fps: number; loop: boolean; ox: number; oy: number }>;
declare const BOSS_ANIMS: Record<string, { start: number; end: number; fps: number; loop: boolean }>;
declare const CHIEF_ANIMS: Record<string, { start: number; end: number; fps: number; loop: boolean }>;

// 危 ("peril"), 11x11, drawn over the boss before an unparryable attack
const KI = [
  "...XX......",
  "..XXXXXXX..",
  ".XX....XX..",
  "XXXXXXXXXXX",
  ".X.........",
  ".X.XXXXXXX.",
  ".X.X.....X.",
  ".X.X..XXXX.",
  "X..X.......",
  "X..X.....XX",
  "X...XXXXXX.",
];

const DANGER = 0xb967ff;

interface SView {
  body: Phaser.GameObjects.Sprite;
  arm: Phaser.GameObjects.Image;
  animKey: string;
  animT: number;
  lastState: string;
  lieAngle: number;
  pod?: Phaser.GameObjects.Image;
}

interface Ring { x: number; y: number; t: number; max: number; r0: number; r1: number; color: number; w: number; }
interface Popup { text: string; x: number; y: number; t: number; max: number; color: number; outline: number; scale: number; }
interface Flash { x: number; y: number; t: number; color: number; }

export class CombatRenderer {
  views = new Map<number, SView>();
  gRope: Phaser.GameObjects.Graphics;
  gLaser: Phaser.GameObjects.Graphics;
  gBullet: Phaser.GameObjects.Graphics;
  gBulletAdd: Phaser.GameObjects.Graphics;
  gSlash: Phaser.GameObjects.Graphics;
  gFx: Phaser.GameObjects.Graphics;
  gText: Phaser.GameObjects.Graphics;
  glowPool: Phaser.GameObjects.Image[] = [];
  glowUsed = 0;
  lights: { x: number; y: number; t: number; color: string; r: number }[] = [];
  lightPool: Phaser.GameObjects.Image[] = [];

  slash = { t: 99, angle: 0, hit: false, perfect: false, flash: 0 };
  cut = { t: 99, angle: 0, combo: 1, facing: 1, hit: 0 };
  rings: Ring[] = [];
  popups: Popup[] = [];
  flashes: Flash[] = [];
  alerts = new Map<number, number>();
  dangers = new Map<number, number>();
  glints: { id: number; t: number }[] = [];
  perils = new Map<number, number>();

  constructor(private scene: Phaser.Scene) {
    this.gRope = scene.add.graphics().setDepth(10.3);
    this.gLaser = scene.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.gBullet = scene.add.graphics().setDepth(30);
    this.gBulletAdd = scene.add.graphics().setDepth(31).setBlendMode(Phaser.BlendModes.ADD);
    this.gSlash = scene.add.graphics().setDepth(12).setBlendMode(Phaser.BlendModes.ADD);
    this.gFx = scene.add.graphics().setDepth(32).setBlendMode(Phaser.BlendModes.ADD);
    this.gText = scene.add.graphics().setDepth(45);
  }

  // ------------------------------------------------------------ triggers

  startSlash(aimX: number, aimY: number) {
    this.slash = { t: 0, angle: Math.atan2(aimY, aimX), hit: false, perfect: false, flash: 0 };
  }
  slashHit(perfect: boolean) {
    this.slash.t = Math.max(this.slash.t, 0.05); // full crescent on the impact frame
    this.slash.hit = true;
    this.slash.perfect = perfect;
    this.slash.flash = 1;
  }
  ring(x: number, y: number, color: number, r1 = 26, max = 0.2, w = 2) {
    this.rings.push({ x, y, t: 0, max, r0: 3, r1, color, w });
  }
  popup(text: string, x: number, y: number, color: number, outline: number, scale = 1, max = 0.8) {
    this.popups.push({ text, x, y, t: 0, max, color, outline, scale });
  }
  muzzle(x: number, y: number, color: number) {
    this.flashes.push({ x, y, t: 0, color });
  }
  /** A brief point light (muzzle flashes, impacts) that also tints nearby sprites. */
  light(x: number, y: number, color: "amber" | "cyan" | "pink" | "purple" | "white", r = 1) {
    if (!TEST.glow) return;
    const key = { amber: "glowAmber", cyan: "glowCyan", pink: "glowPink", purple: "glowPurple", white: "glowWhite" }[color];
    this.lights.push({ x, y, t: 0, color: key, r });
  }
  alert(s: Soldier) { if (!s.def.melee) this.alerts.set(s.id, 0); }
  startCut(aimX: number, aimY: number, combo: number, facing: number) {
    this.cut = { t: 0, angle: Math.atan2(aimY, aimX), combo, facing, hit: 0 };
  }
  cutHit() { this.cut.hit = 1; }
  clearPopups() { this.popups = []; }
  danger(s: Soldier) { this.dangers.set(s.id, 0); }
  glint(s: Soldier) { this.glints.push({ id: s.id, t: 0 }); }
  peril(s: Soldier) { this.perils.set(s.id, 0); }

  // --------------------------------------------------------------- steps

  /** Advance sim-time animations (frozen during hit-stop). */
  step(dt: number, world: World) {
    this.slash.t += dt;
    this.slash.flash = Math.max(0, this.slash.flash - dt * 6);
    this.cut.t += dt;
    this.cut.hit = Math.max(0, this.cut.hit - dt * 5);
    for (const [id, t] of this.dangers) { if (t > 0.9) this.dangers.delete(id); else this.dangers.set(id, t + dt); }
    for (const [id, t] of this.perils) { if (t > 0.9) this.perils.delete(id); else this.perils.set(id, t + dt); }
    for (const gl of this.glints) gl.t += dt;
    this.glints = this.glints.filter((g) => g.t < 0.2);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < 0.07);
    for (const [id, t] of this.alerts) {
      if (t > 0.9) this.alerts.delete(id);
      else this.alerts.set(id, t + dt);
    }
    for (const s of world.soldiers) {
      const v = this.views.get(s.id);
      if (v) v.animT += dt;
    }
  }

  /** Real-time effects keep moving during hit-stop so impacts read. */
  realStep(dt: number) {
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.max);
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < p.max);
    for (const l of this.lights) l.t += dt;
    this.lights = this.lights.filter((l) => l.t < 0.12);
  }

  // -------------------------------------------------------------- render

  private view(s: Soldier): SView {
    let v = this.views.get(s.id);
    if (!v) {
      const drone = s.kind === "drone";
      const boss = s.kind === "boss";
      const kami = s.kind === "kamikaze";
      const asn = s instanceof Assassin;
      const arc = s instanceof Archivist;
      const tur = s.kind === "turret";
      const chief = s instanceof Chief;
      const bul = s instanceof Bulwark;
      const burner = s.kind === "burner";
      const tex = bul ? "bulwark" : chief ? "chief" : burner ? "burner" : arc ? "pod" : tur ? "turret" : asn ? "assassin" : kami ? "kamikaze" : boss ? "boss" : drone ? "drone"
        : s.kind === "collector" ? "grunt" : s.def.melee ? "blade" : `soldier_${s.kind}`;
      const body = this.scene.add.sprite(0, 0, tex, 0).setDepth(boss ? 10.4 : 10.5);
      const arm = this.scene.add.image(0, 0, bul ? "bulwarkGun" : tur ? "turretGun" : arc ? "glowPurple" : kami || burner ? "glowPurple" : drone ? "glowPink" : s.def.melee ? "glowPink" : `arm_${s.kind}`).setDepth(tur ? 10.45 : 10.6);
      if (tur) arm.setOrigin(0.15, 0.5);
      else if (bul) arm.setOrigin(0.12, 0.5).setDepth(10.45);
      else if (drone || boss || kami || burner) {
        arm.setBlendMode(Phaser.BlendModes.ADD).setScale(boss ? 0.3 : 0.22);
      } else if (!s.def.melee) {
        const [px, py] = SOLDIER_META.armPivots?.[s.kind] ?? SOLDIER_META.armPivot;
        arm.setOrigin(px / arm.width, py / arm.height);
      }
      v = { body, arm, animKey: "idle", animT: 0, lastState: "", lieAngle: 0 };
      if (bul) v.pod = this.scene.add.image(0, 0, "bulwarkShield").setDepth(10.6);
      else if (boss) v.pod = this.scene.add.image(0, 0, "glowPurple").setDepth(10.7).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.views.set(s.id, v);
    }
    return v;
  }

  clearViews() {
    for (const v of this.views.values()) { v.body.destroy(); v.arm.destroy(); v.pod?.destroy(); }
    this.views.clear();
    this.alerts.clear();
    this.dangers.clear();
    this.perils.clear();
  }

  draw(world: World, time: number, cinematic: Bullet | null) {
    this.gRope.clear();
    // units removed from the world (swapped turrets) take their sprites with them
    if (this.views.size > world.soldiers.length) {
      const ids = new Set(world.soldiers.map((s) => s.id));
      for (const [id, v] of this.views) if (!ids.has(id)) { v.body.destroy(); v.arm.destroy(); v.pod?.destroy(); this.views.delete(id); }
    }
    this.drawSoldiers(world, time);
    this.drawLasers(world, time);
    this.drawBullets(world, time, cinematic);
    this.drawSlash(world);
    this.drawCut(world);
    this.drawFx(world, time);
    this.drawLights();
    this.drawText(world, time);
  }

  /** Hide or show a unit that is still waiting to arrive; draws its rope. */
  private staged(s: Soldier, v: SView): boolean {
    if (s.state === "dormant" || (s.state === "enter" && s.enterDelay > 0)) {
      v.body.setVisible(false);
      v.arm.setVisible(false);
      return true;
    }
    v.body.setVisible(true);
    if (s.state === "enter" && !s.def.flying) {
      const g = this.gRope;
      const top = s.enterFromY - 120;
      const x = Math.round(s.cx);
      g.fillStyle(0x07050f, 1);
      g.fillRect(x - 1, Math.round(top), 3, Math.round(s.y + 8 - top));
      g.fillStyle(0x4a416f, 1);
      g.fillRect(x, Math.round(top), 1, Math.round(s.y + 8 - top));
    }
    return false;
  }

  private drawSoldiers(world: World, time: number) {
    for (const s of world.soldiers) {
      const v = this.view(s);
      if (this.staged(s, v)) continue;
      if (s instanceof Archivist) { this.drawArchivist(s, v, time); continue; }
      if (s.kind === "turret") { this.drawTurret(s, v); continue; }
      if (s instanceof Assassin) { this.drawAssassin(s, v, time); continue; }
      if (s instanceof Chief) { this.drawChief(s, v, time); continue; }
      if (s instanceof Bulwark) { this.drawBulwark(s, v, time); continue; }
      if (s instanceof Boss) { this.drawBoss(s, v, time); continue; }
      if (s.kind === "burner") { this.drawBurner(s, v, time); continue; }
      if (s.kind === "kamikaze") { this.drawKamikaze(s, v, time); continue; }
      if (s.kind === "drone") { this.drawDrone(s, v, time); continue; }
      if (s.def.melee) { this.drawBladeUnit(s, v, time); continue; }
      const anims = SOLDIER_META.anims[s.kind];
      let key = "idle";
      if (s.state === "dead") key = "dead";
      else if (s.state === "hurt") key = "hurt";
      else if (s.state === "patrol" && Math.abs(s.vx) > 1) key = "walk";
      else if (s.state === "aim" || s.state === "fire" || s.state === "alert") key = "aim";
      if (key !== v.animKey) { v.animKey = key; v.animT = 0; }
      const a = anims[key];
      const len = a.end - a.start + 1;
      let fi = Math.floor(v.animT * a.fps);
      fi = a.loop ? fi % len : Math.min(fi, len - 1);
      v.body.setFrame(a.start + fi);
      const left = s.facing < 0;
      v.body.setFlipX(left);

      if (s.state === "dead") {
        const grounded = s.vy === 0;
        const dir = Math.sign(s.spinV || s.vx || 1);
        if (grounded && s.deadTime > 0.15) v.lieAngle += ((dir * Math.PI) / 2 - v.lieAngle) * 0.25;
        else v.lieAngle = s.spin;
        v.body.setOrigin(0.45, 0.72);
        const lying = Math.abs(Math.sin(v.lieAngle));
        v.body.setPosition(Math.round(s.cx), Math.round(s.bottom - 17 + lying * 6));
        v.body.setRotation(v.lieAngle);
        v.body.setAlpha(s.deadTime > 7 ? Math.max(0, 1 - (s.deadTime - 7)) : 1);
        v.arm.setVisible(false);
      } else {
        const rappel = s.state === "enter";
        v.body.setRotation(rappel ? Math.sin(time * 6 + s.id) * 0.05 : 0).setAlpha(1);
        v.body.setOrigin((left ? 36 : 28) / 64, 62 / 64);
        v.body.setPosition(Math.round(s.cx), Math.round(s.bottom));
        const sh = s.shoulder();
        v.arm.setVisible(true);
        v.arm.setPosition(Math.round(sh.x), Math.round(sh.y));
        v.arm.setRotation(rappel ? (s.facing > 0 ? 1.2 : Math.PI - 1.2) : s.aim);
        v.arm.setScale(1, Math.cos(s.aim) < 0 ? -1 : 1);
      }
      if (s.hitFlash > 0) {
        v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        v.arm.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      } else {
        v.body.clearTint();
        v.arm.clearTint();
      }
      v.lastState = s.state;
    }
  }

  private drawBladeUnit(s: Soldier, v: SView, time: number) {
    const map: Record<string, string> = {
      patrol: Math.abs(s.vx) > 1 ? "walk" : "guard", approach: "walk", guard: "guard", block: "block",
      windup: "windup", strike: "strike", heavyWindup: "heavy", lunge: "lunge", recover: "recover",
      recoil: "recoil", stagger: "stagger", hurt: "hurt", dead: "dead", enter: "recoil",
    };
    let key = map[s.state] ?? "guard";
    if (key === "strike" && s.swing % 2 === 1) key = "strike2";
    if (key !== v.animKey) { v.animKey = key; v.animT = 0; }
    const a = BLADE_ANIMS[key];
    const len = a.end - a.start + 1;
    let fi = Math.floor(v.animT * a.fps);
    fi = a.loop ? fi % len : Math.min(fi, len - 1);
    v.body.setFrame(a.start + fi);
    const left = s.facing < 0;
    v.body.setFlipX(left).setRotation(0);
    v.body.setOrigin((left ? 50 : 46) / 96, 78 / 80);
    // squash & stretch: coil down while winding up, snap long on the cut
    let sx = 1, sy = 1;
    if (s.state === "windup") { const k = Math.min(1, v.animT / 0.25); sx = 1 + 0.06 * k; sy = 1 - 0.07 * k; }
    else if (s.state === "heavyWindup") { const k = Math.min(1, v.animT / 0.2); sx = 1 + 0.08 * k + Math.sin(time * 40) * 0.006; sy = 1 - 0.09 * k; }
    else if (s.state === "strike" || s.state === "lunge") {
      const k = Math.max(0, 1 - v.animT / (s.state === "lunge" ? 0.18 : 0.11));
      const amt = s.state === "lunge" ? 0.16 : 0.1;
      sx = 1 + amt * k; sy = 1 - amt * 0.6 * k;
    }
    v.body.setScale(sx, sy);
    v.body.setPosition(Math.round(s.cx), Math.round(s.bottom));
    v.body.setAlpha(s.state === "dead" && s.deadTime > 7 ? Math.max(0, 1 - (s.deadTime - 7)) : 1);
    v.arm.setVisible(false);
    if (s.hitFlash > 0) v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (s.state === "heavyWindup") v.body.setTint(Math.floor(time * 20) % 2 ? 0x601020 : 0x300810).setTintMode(Phaser.TintModes.ADD);
    else if (s.state === "stagger") v.body.setTint(Math.floor(time * 10) % 2 ? 0x403010 : 0x000000).setTintMode(Phaser.TintModes.ADD);
    else v.body.clearTint();
  }

  /** The Assassin: clings to walls and ceiling, flash-steps in for paired cuts. */
  private drawAssassin(s: Assassin, v: SView, time: number) {
    let key = "stand";
    let rot = 0;
    let flip = s.facing < 0;
    const st = s.state;
    const onSurface = (aim: boolean) => {
      if (s.surface === 0) { key = aim ? "ceilAim" : "ceil"; flip = s.facing < 0; }
      else { key = aim ? "clingAim" : "cling"; flip = s.surface > 0; } // drawn for the left wall
    };
    if (st === "intro") {
      const T = s.introLong ? 1.9 : 0;
      if (s.stateT < T) onSurface(false);
      else if (s.surface === -1) key = s.vy !== 0 ? "fall" : "land";
      else key = "dash";
    } else if (st === "cling" || st === "hold") onSurface(st === "hold");
    else if (st === "aim") onSurface(true);
    else if (st === "rushIn" || st === "rushOut") {
      key = "dash";
      const dx = s.toX - s.fromX, dy = s.toY - s.fromY;
      flip = dx < 0;
      rot = Math.atan2(dy, Math.abs(dx)) * (flip ? -1 : 1);
    } else if (st === "cut") key = s.cutI === 0 ? "cut1" : "cut2";
    else if (st === "cutGap") key = "cut1";
    else if (st === "stagger" || st === "kneel") key = s.vy !== 0 && st === "stagger" ? "fall" : "stun";
    else if (st === "rise") key = "stand";
    else if (st === "dead") key = s.deadT < 0.6 ? "stun" : "dead";
    const animId = key + (st === "cut" ? s.cutI : "");
    if (animId !== v.animKey) { v.animKey = animId; v.animT = 0; }
    const a = ASSASSIN_ANIMS[key];
    const len = a.end - a.start + 1;
    let fi = Math.floor(v.animT * a.fps);
    fi = a.loop ? fi % len : Math.min(fi, len - 1);
    v.body.setFrame(a.start + fi).setVisible(true).setAlpha(1);
    v.body.setFlipX(flip).setRotation(rot);
    // floor poses stand on the feet; surface and dash poses are centred
    const centred = a.oy < 60;
    v.body.setOrigin((flip ? 96 - a.ox : a.ox) / 96, a.oy / 96);
    v.body.setPosition(Math.round(s.cx), Math.round(centred ? s.cy : s.bottom));
    const tremble = st === "aim" ? Math.sin(time * 60) * 0.6 : 0;
    if (tremble) v.body.x += Math.round(tremble);
    v.body.setScale(st === "rushIn" || st === "rushOut" ? 1.12 : 1, st === "rushIn" || st === "rushOut" ? 0.9 : 1);
    if (s.hitFlash > 0) v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (st === "aim" && s.flurry) v.body.setTint(Math.floor(time * 24) % 2 ? 0x701018 : 0x380810).setTintMode(Phaser.TintModes.ADD);
    else if (st === "aim") v.body.setTint(Math.floor(time * 20) % 2 ? 0x3a1460 : 0x1a0830).setTintMode(Phaser.TintModes.ADD);
    else if (s.flurry && (st === "cut" || st === "cutGap")) v.body.setTint(0x40080c).setTintMode(Phaser.TintModes.ADD);
    else if (st === "stagger") v.body.setTint(Math.floor(time * 10) % 2 ? 0x403010 : 0x000000).setTintMode(Phaser.TintModes.ADD);
    else v.body.clearTint();
    // visor glow
    const alive = st !== "dead";
    const rage = s.flurry && (st === "aim" || st === "rushIn" || st === "cut" || st === "cutGap");
    v.arm.setVisible(alive).setTexture(rage ? "glowPink" : "glowPurple");
    // a violet backlight keeps him readable against the machine walls
    if (alive) v.arm.setPosition(Math.round(s.cx), Math.round(s.cy - (centred ? 0 : 6))).setScale(st === "aim" ? (rage ? 1.4 : 1.1) : 0.8).setAlpha(st === "aim" ? (rage ? 0.95 : 0.75) : rage ? 0.6 : 0.42);
  }

  /** The tell: a sight line to where he will strike, and one pip per cut. */
  /**
   * Rhythm rings: one ring per incoming cut shrinks onto the hero's chest and
   * closes exactly when that cut lands. "Click when the ring hits you."
   */
  private drawAssassinRings(world: World, time: number) {
    const s = world.boss;
    if (!(s instanceof Assassin)) return;
    const times = s.upcomingCuts();
    const live = s.state === "cut" && !s.attackHit;
    if (!times.length && !live) return;
    const g = this.gFx;
    const p = world.player;
    const cx = p.cx, cy = p.y + 20;
    const bold = s.setsDone < 4 || s.flurry ? 1 : 0.5;
    const hue = s.flurry ? 0xff3a2a : 0xff2a6d;
    const LEAD = 0.6;
    // the target ring: where the shrinking rings land
    g.lineStyle(1, live ? 0xffffff : 0xff9cc2, (live ? 0.95 : 0.55) * bold);
    g.strokeCircle(cx, cy, 9);
    if (live) { g.lineStyle(2, 0xffffff, 0.8 * bold); g.strokeCircle(cx, cy, 12); }
    for (const t of times) {
      if (t > LEAD || t < 0) continue;
      const u = t / LEAD;
      const r = 9 + 70 * u;
      const a = (1 - u * 0.6) * bold;
      g.lineStyle(u < 0.15 ? 3 : 2, u < 0.15 ? 0xffffff : hue, a);
      g.strokeCircle(cx, cy, r);
    }
  }

  private drawAssassinTell(world: World, time: number) {
    this.drawAssassinRings(world, time);
    const s = world.boss;
    if (!(s instanceof Assassin) || (s.state !== "aim" && s.state !== "hold")) return;
    const g = this.gText;
    const p = world.player;
    const tx = p.cx, ty = p.y + 20;
    const k = s.state === "aim" ? Math.min(1, s.stateT / 0.25) : 1;
    // dotted sight line, marching toward the hero
    const dx = tx - s.cx, dy = ty - s.cy, d = Math.hypot(dx, dy) || 1;
    const off = (time * 220) % 8;
    for (let i = off; i < d * k; i += 8) {
      const x = s.cx + (dx / d) * i, y = s.cy + (dy / d) * i;
      g.fillStyle(0x07050f, 0.6);
      g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 6, 3);
      g.fillStyle(0xd9a8ff, 0.95);
      g.fillRect(Math.round(x), Math.round(y), 4, 1);
    }
    // a reticle on the hero
    const r = Math.round(12 - 5 * k);
    g.lineStyle(1, Math.floor(time * 16) % 2 ? 0xffffff : 0xb967ff, 0.9);
    g.strokeRect(Math.round(tx - r), Math.round(ty - r), r * 2, r * 2);
    // pips: how many cuts are coming (the ones already spent are hollow)
    const n = s.setSize;
    const done = s.state === "hold" ? 2 : 0;
    const step = s.flurry ? 8 : 9, gapX = n === 4 ? 5 : 0;
    const px0 = Math.round(s.cx - (n * step - 3 + gapX) / 2), py = Math.round(s.surface === 0 && s.state !== "hold" ? s.y + s.h + 10 : s.y - 18); // under him when he hangs from the ceiling
    for (let i = 0; i < n; i++) {
      const x = px0 + i * step + (i >= 2 ? gapX : 0);
      const lit = i >= done;
      g.fillStyle(0x07050f, 0.9);
      g.fillRect(x - 1, py - 1, 8, 8);
      const blink = Math.floor(time * (s.flurry ? 20 : 12)) % 2;
      g.fillStyle(lit ? (blink ? (s.flurry ? 0xff3a2a : 0xff2a6d) : 0xffffff) : 0x3a2a4a, 1);
      g.fillRect(x, py, 6, 6);
      if (lit) { g.fillStyle(0xffffff, 0.8); g.fillRect(x + 1, py + 1, 2, 1); }
    }
  }

  private drawBoss(s: Boss, v: SView, time: number) {
    const map: Record<string, string> = {
      guard: "guard", approach: "walk", windup: "windup", delay: "delay", recover: "recover",
      heavyWindup: "heavy", lunge: "lunge", sweepWindup: "sweepWind", sweep: "sweep", leapWindup: "leapWind",
      smash: "smash", block: "block", recoil: "recoil", backstep: "recoil", stagger: "stagger", hurt: "hurt",
      kneel: "kneel", rise: "intro", intro: "intro",
      volley: "brace", missile: "brace", laserWind: "brace", laser: "brace",
      finaleUp: "air", finaleCharge: "heavy", chainWind: "heavy", chainGap: "recover",
    };
    let key = map[s.state] ?? "guard";
    if (s.state === "strike") key = s.hit === 0 ? "strike" : s.hit === 1 ? "strike2" : "strike3";
    if (s.state === "chainStrike") key = s.strong ? "strike3" : "lunge";
    if (s.state === "air") key = s.vy < 60 ? "air" : "fall";
    if (s.state === "dead") key = s.deadT < 0.9 ? "kneel" : "dead";
    if (s.marks < 2) key += "_b"; // the mask is cracked after the first deathblow
    const animId = key + (s.state === "strike" ? s.hit : "");
    if (animId !== v.animKey) { v.animKey = animId; v.animT = 0; }
    const a = BOSS_ANIMS[key];
    const len = a.end - a.start + 1;
    let fi = Math.floor(v.animT * a.fps);
    fi = a.loop ? fi % len : Math.min(fi, len - 1);
    v.body.setFrame(a.start + fi);
    const left = s.facing < 0;
    v.body.setFlipX(left).setRotation(0).setAlpha(1);
    v.body.setOrigin((left ? 90 : 70) / 160, 122 / 128);
    // the long entrance: hidden until he drops out of the dropship
    let dropY = 0;
    if (s.state === "intro" && s.introLong) {
      const t = s.stateT - 1.55;
      if (t < 0) { v.body.setVisible(false); v.arm.setVisible(false); return; }
      dropY = t < 0.35 ? -320 * Math.pow(1 - t / 0.35, 2) : 0;
    }
    v.body.setPosition(Math.round(s.cx), Math.round(s.bottom + dropY));
    let sx = 1, sy = 1;
    const st = s.stateT;
    if (s.state === "windup" || s.state === "delay") { const k = Math.min(1, st / 0.25); sx = 1 + 0.05 * k; sy = 1 - 0.05 * k; }
    else if (s.state === "heavyWindup" || s.state === "sweepWindup" || s.state === "leapWindup") {
      const k = Math.min(1, st / 0.2); sx = 1 + 0.07 * k + Math.sin(time * 40) * 0.005; sy = 1 - 0.08 * k;
    } else if (s.state === "strike" || s.state === "lunge" || s.state === "sweep") {
      const k = Math.max(0, 1 - st / (s.state === "lunge" ? 0.2 : 0.12));
      const amt = s.state === "lunge" ? 0.14 : 0.09;
      sx = 1 + amt * k; sy = 1 - amt * 0.6 * k;
    } else if (s.state === "smash") { const k = Math.max(0, 1 - st / 0.15); sx = 1 + 0.12 * k; sy = 1 - 0.1 * k; }
    else if (s.state === "air") { sx = 0.95; sy = 1.05; }
    v.body.setScale(sx, sy);
    if (s.hitFlash > 0) v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (s.state === "finaleCharge") v.body.setTint(Math.floor(time * 12) % 2 ? 0x701028 : 0x400818).setTintMode(Phaser.TintModes.ADD);
    else if (s.state === "heavyWindup" || s.state === "chainWind") v.body.setTint(Math.floor(time * 20) % 2 ? 0x601020 : 0x300810).setTintMode(Phaser.TintModes.ADD);
    else if (s.state === "sweepWindup" || s.state === "leapWindup" || s.state === "laserWind") v.body.setTint(Math.floor(time * 20) % 2 ? 0x40146a : 0x200830).setTintMode(Phaser.TintModes.ADD);
    else if (s.state === "stagger") v.body.setTint(Math.floor(time * 10) % 2 ? 0x403010 : 0x000000).setTintMode(Phaser.TintModes.ADD);
    else v.body.clearTint();
    // reactor glow in the breastplate
    const alive = s.state !== "dead" || s.deadT < 0.9;
    v.arm.setVisible(alive);
    if (alive) {
      const pulse = 0.5 + 0.25 * Math.sin(time * (s.phase === 2 ? 9 : 4));
      v.arm.setPosition(Math.round(s.cx + s.facing * 6), Math.round(s.bottom + dropY - 63 + (sy < 1 ? 4 : 0))).setAlpha(pulse).setScale(s.phase === 2 ? 0.42 : 0.3);
    }
  }

  /** 차승호: the recovery chief. Kneels, disarmed, when it is over. */
  private drawChief(s: Chief, v: SView, time: number) {
    const st = s.state;
    const map: Record<string, string> = {
      dormant: "guard", intro: "guard", guard: "guard", approach: "walk", block: "block",
      windup: "windup", strike: s.swing % 2 === 1 ? "strike2" : "strike", recover: "recover",
      smashWind: "heavy", smash: "smash", flameWind: "flamewind", flame: "flame",
      recoil: "recoil", hurt: "hurt", stagger: "stagger", dead: "kneel",
    };
    let key = map[st] ?? "guard";
    if (st === "guard" && Math.abs(s.vx) > 8) key = "walk";
    if (key !== v.animKey) { v.animKey = key; v.animT = 0; }
    const a = CHIEF_ANIMS[key];
    const len = a.end - a.start + 1;
    let fi = Math.floor(v.animT * a.fps);
    fi = a.loop ? fi % len : Math.min(fi, len - 1);
    const left = s.facing < 0;
    v.body.setVisible(true).setFrame(a.start + fi).setFlipX(left).setRotation(0).setAlpha(1);
    v.body.setOrigin((left ? 50 : 46) / 96, 78 / 80);
    let sx = 1, sy = 1;
    if (st === "smashWind") { const k = Math.min(1, v.animT / 0.3); sx = 1 - 0.04 * k; sy = 1 + 0.05 * k; }
    else if (st === "flameWind") sx = 1 + Math.sin(time * 40) * 0.006;
    else if (st === "smash" || st === "strike") { const k = Math.max(0, 1 - v.animT / 0.12); sx = 1 + 0.1 * k; sy = 1 - 0.06 * k; }
    v.body.setScale(sx, sy).setPosition(Math.round(s.cx), Math.round(s.bottom));
    if (s.hitFlash > 0) v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (st === "smashWind") v.body.setTint(Math.floor(time * 20) % 2 ? 0x601020 : 0x300810).setTintMode(Phaser.TintModes.ADD);
    else if (st === "flameWind") v.body.setTint(Math.floor(time * 18) % 2 ? 0x3a1460 : 0x1a0830).setTintMode(Phaser.TintModes.ADD);
    else if (st === "stagger") v.body.setTint(Math.floor(time * 10) % 2 ? 0x403010 : 0x000000).setTintMode(Phaser.TintModes.ADD);
    else v.body.clearTint();
    // the visor's hot reflection
    const alive = st !== "dead";
    v.arm.setVisible(alive);
    if (alive) v.arm.setTexture(st === "flameWind" || st === "flame" ? "glowPurple" : "glowAmber")
      .setPosition(Math.round(s.cx + s.facing * 7), Math.round(s.y + 10)).setScale(0.18).setAlpha(0.7);
  }

  /**
   * 방벽: the hull (treads rolling with its speed), the roof gun on its pivot,
   * the shield plate on the nose (or lying on the floor once it is shed), and
   * the vent's glow, hotter as it is hit.
   */
  private drawBulwark(s: Bulwark, v: SView, time: number) {
    const st = s.state;
    const left = s.facing < 0;
    const dead = st === "dead";
    // which way the treads roll: animate with ground speed (and grind while turning)
    const roll = Math.abs(s.vx) > 2 || st === "turn" || st === "ramWind";
    const tf = roll ? Math.floor(v.animT * (st === "ram" ? 24 : 10)) % 4 : 0;
    const frame = dead ? 5 : s.shielded ? tf : 4;
    // turning: squash to show the pivot
    let sx = 1;
    if (st === "turn") sx = Math.max(0.15, Math.abs(Math.cos((s.stateT / (BUL.turn * (s.shielded ? 1 : 0.85))) * Math.PI)));
    const flip = st === "turn" && s.stateT > (BUL.turn * (s.shielded ? 1 : 0.85)) / 2 ? !left : left;
    const shake = st === "ramWind" ? Math.sin(time * 70) * 1 : st === "shed" ? Math.sin(time * 50) * 1.5 : st === "slamWind" ? Math.sin(time * 60) * 0.8 : 0;
    const lift = st === "slamWind" ? -Math.min(6, s.stateT * 10) : 0;
    v.body.setVisible(true).setFrame(frame).setOrigin(0.5, 1).setFlipX(flip).setRotation(0).setAlpha(1)
      .setScale(sx, 1).setPosition(Math.round(s.cx + shake), Math.round(s.bottom));
    if (s.hitFlash > 0) v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (st === "ramWind") v.body.setTint(Math.floor(time * 20) % 2 ? 0x601020 : 0x300810).setTintMode(Phaser.TintModes.ADD);
    else if (st === "slamWind") v.body.setTint(Math.floor(time * 18) % 2 ? 0x3a1460 : 0x1a0830).setTintMode(Phaser.TintModes.ADD);
    else if (st === "stagger") v.body.setTint(Math.floor(time * 10) % 2 ? 0x403010 : 0x000000).setTintMode(Phaser.TintModes.ADD);
    else v.body.clearTint();
    // the roof gun: it swings to its aim (pivot over the cab)
    const g = s.gunPivot();
    const aiming = st === "bAim" || st === "bFire";
    v.arm.setVisible(!dead && st !== "turn").setTexture("bulwarkGun").setPosition(Math.round(g.x), Math.round(g.y + 1))
      .setRotation(s.gunAim).setFlipY(Math.cos(s.gunAim) < 0).setScale(1);
    if (aiming && s.state === "bFire") v.arm.setTint(0xff9a60).setTintMode(Phaser.TintModes.ADD); else v.arm.clearTint();
    // the shield: on the nose, raised for the slam; or fallen on the floor
    if (!v.pod) v.pod = this.scene.add.image(0, 0, "bulwarkShield").setDepth(10.6);
    if (s.shielded && st !== "turn") {
      const r = s.shieldRect();
      v.pod.setVisible(true).setOrigin(0.5, 1).setRotation(0).setFlipX(left)
        .setPosition(Math.round(r.x + r.w / 2 + shake), Math.round(r.y + r.h + lift));
      if (s.hitFlash > 0) v.pod.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL); else v.pod.clearTint();
    } else if (s.shieldDrop) {
      const d = s.shieldDrop;
      v.pod.setVisible(true).setOrigin(0.5, 0.5).setRotation(d.rot).setFlipX(false).setPosition(Math.round(d.x), Math.round(d.y)).clearTint();
    } else v.pod.setVisible(s.shielded && st !== "turn");
    // the vent glows: a warm hint always, white-hot as it fails
    if (!dead) {
      const c = s.ventCenter();
      const hot = s.shielded ? 0.25 + 0.5 * (1 - s.ventHp / BUL.ventHp) : 0.6;
      this.glow(c.x, c.y, "glowAmber", 0.32 + 0.1 * hot, hot * (0.75 + 0.25 * Math.sin(time * (6 + 10 * hot))));
      // the camera eye on the nose, red while it aims
      const ex = s.cx + s.facing * 26, ey = s.y + 7;
      this.glow(ex, ey, aiming ? "glowPink" : "glowAmber", aiming ? 0.22 : 0.12, aiming ? 0.9 : 0.5);
      // the antenna's light, blinking
      if (Math.floor(time * 2) % 2 === 0) this.glow(s.cx - s.facing * 4, s.y - 8, "glowPink", 0.1, 0.8);
    }
  }

  /** Incinerator drone: rotors, a yellow tank, the nozzle glows violet before it sprays. */
  private drawBurner(s: Soldier, v: SView, time: number) {
    const dead = s.state === "dead";
    v.body.setVisible(!(dead && s.deadTime > 3));
    const warm = s.state === "flameWind" || s.state === "flame";
    v.body.setFrame(warm && Math.floor(time * 16) % 2 === 0 ? 2 : Math.floor(time * 20) % 2).setOrigin(0.5, 0.5);
    v.body.setPosition(Math.round(s.cx), Math.round(s.cy + (s.state === "flameWind" ? Math.sin(time * 70) : 0)));
    v.body.setRotation(dead ? s.spin : Math.max(-0.25, Math.min(0.25, s.vx * 0.004))).setFlipX(s.facing < 0);
    v.body.setAlpha(dead && s.deadTime > 2 ? Math.max(0, 1 - (s.deadTime - 2)) : 1);
    if (s.hitFlash > 0) v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else v.body.clearTint();
    v.arm.setVisible(!dead).setPosition(Math.round(s.cx), Math.round(s.cy + 10))
      .setScale(warm ? 0.5 + 0.15 * Math.sin(time * 30) : 0.16).setAlpha(warm ? 0.95 : 0.4);
  }

  /** Kamikaze: shudders on lock, points down its run, blinks faster and faster once armed. */
  private drawKamikaze(s: Soldier, v: SView, time: number) {
    if (s.state === "dead") { v.body.setVisible(false); v.arm.setVisible(false); return; }
    v.body.setVisible(true).setFrame(Math.floor(time * 24) % 4).setOrigin(0.5, 11 / 20);
    let x = s.cx, y = s.cy, rot = 0;
    let flip = s.facing < 0;
    if (s.state === "alert") { x += Math.sin(time * 80) * 1.2; y += Math.cos(time * 70) * 0.8; }
    if (s.state === "charge" || s.state === "alert") {
      // nose along the heading
      flip = false;
      rot = s.aim;
      if (Math.cos(rot) < 0) { flip = true; rot = rot - Math.PI; }
      v.body.setFlipY(false);
    } else rot = Math.max(-0.3, Math.min(0.3, s.vx * 0.003));
    v.body.setFlipX(flip).setRotation(rot).setPosition(Math.round(x), Math.round(y));
    let scale = 1;
    let on = false;
    if (s.state === "armed") {
      const k = s.fuseMax > 0 ? 1 - s.fuse / s.fuseMax : 1;
      const rate = 5 + 26 * k * k;
      on = Math.floor(time * rate) % 2 === 0;
      scale = 1 + 0.25 * k;
    }
    v.body.setScale(scale);
    if (s.hitFlash > 0 || (s.state === "armed" && on)) v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (s.state === "armed") v.body.setTint(0xff2040).setTintMode(Phaser.TintModes.MULTIPLY);
    else v.body.clearTint();
    // eye / thruster glow
    const charging = s.state === "charge";
    const gx = charging ? s.cx - Math.cos(s.aim) * 10 : s.cx + s.facing * 4;
    const gy = charging ? s.cy - Math.sin(s.aim) * 10 : s.cy - 2;
    v.arm.setVisible(true).setPosition(Math.round(gx), Math.round(gy))
      .setTexture(s.state === "armed" ? "glowPink" : "glowPurple")
      .setScale(s.state === "armed" ? (on ? 0.9 : 0.5) : charging ? 0.45 : s.state === "alert" ? 0.35 : 0.18)
      .setAlpha(s.state === "patrol" ? 0.5 : 0.9);
  }

  /** Ceiling turret: a bolted mount and a barrel that tracks the hero. */
  private drawTurret(s: Soldier, v: SView) {
    const dead = s.state === "dead";
    v.body.setOrigin(0.5, 0).setPosition(Math.round(s.cx), Math.round(s.y - 2));
    if (dead) {
      v.body.setRotation(s.spin * 0.5).setAlpha(s.deadTime > 5 ? Math.max(0, 1 - (s.deadTime - 5)) : 1);
      v.arm.setVisible(false);
    } else {
      v.body.setRotation(0).setAlpha(1);
      v.arm.setVisible(true).setPosition(Math.round(s.cx), Math.round(s.y + 8)).setRotation(s.aim).setFlipY(Math.cos(s.aim) < 0);
    }
    if (s.hitFlash > 0) v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (s.state === "aim") v.body.setTint(0x401018).setTintMode(Phaser.TintModes.ADD);
    else v.body.clearTint();
  }

  /** The Archivist: the pod on its cables, the core eye beneath it. */
  private drawArchivist(s: Archivist, v: SView, time: number) {
    const down = s.state === "stagger" || s.state === "kneel" || s.state === "dead";
    v.body.setFrame(down ? 2 : s.phase === 2 ? 1 : 0).setOrigin(0.5, 0.46).setVisible(true);
    const sway = down ? 0 : Math.sin(time * 1.1) * 0.03;
    v.body.setPosition(Math.round(s.cx), Math.round(s.cy)).setRotation(sway).setFlipX(false);
    v.body.setAlpha(s.state === "dead" && s.deadT > 6 ? Math.max(0, 1 - (s.deadT - 6)) : 1);
    if (s.hitFlash > 0) v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (s.state === "erase") v.body.setTint(Math.floor(time * 16) % 2 ? 0x302018 : 0x100808).setTintMode(Phaser.TintModes.ADD);
    else v.body.clearTint();
    // cables up into the dark (slack when he has fallen)
    const g = this.gRope;
    const top = s.roofY;
    for (const off of [-9, -3, 4, 10]) {
      const x0 = s.cx + off * 1.6, y0 = top;
      const x1 = s.cx + off * 0.5, y1 = s.y + 2;
      const slack = down ? 40 : 6;
      const n = 14;
      g.fillStyle(0x07050f, 1);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const x = x0 + (x1 - x0) * u + Math.sin(u * Math.PI) * slack * (off < 0 ? -1 : 1) * 0.5;
        const y = y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * slack;
        g.fillRect(Math.round(x), Math.round(y), 2, Math.ceil((y1 - y0) / n) + 1);
      }
    }
    // a cold halo behind the pod keeps it the centre of the room
    if (!v.pod) v.pod = this.scene.add.image(0, 0, "glowCyan").setDepth(10.2).setBlendMode(Phaser.BlendModes.ADD);
    v.pod.setDepth(10.2).setVisible(!down && s.state !== "dead").setTexture("glowCyan").setPosition(Math.round(s.cx), Math.round(s.cy)).setScale(1.3 + 0.05 * Math.sin(time * 2)).setAlpha(0.28);
    // the core eye: brightens while he charges
    const charging = s.state === "volley" || s.state === "laserWind" || s.state === "erase";
    const alive = s.state !== "dead";
    v.arm.setVisible(alive).setTexture(s.state === "erase" ? "glowAmber" : charging ? "glowPink" : "glowCyan")
      .setPosition(Math.round(s.cx), Math.round(s.bottom + 3))
      .setScale(charging ? 0.5 + 0.08 * Math.sin(time * 30) : 0.32).setAlpha(down ? 0.2 : charging ? 0.95 : 0.55);
  }

  /** Laser doors (stage 3) and the Archivist's beams. */
  private drawSecurity(world: World, time: number) {
    const g = this.gLaser;
    const beam = (x: number, y0: number, y1: number, state: 0 | 1 | 2, wide = 3) => {
      x = Math.round(x);
      if (state === 2) {
        const j = Math.sin(time * 80) > 0 ? 1 : 0;
        g.fillStyle(0x7a2fc0, 0.35); g.fillRect(x - wide - 2, y0, wide * 2 + 4, y1 - y0);
        g.fillStyle(0xb967ff, 0.85); g.fillRect(x - wide + j, y0, wide * 2 - 1, y1 - y0);
        g.fillStyle(0xffffff, 0.9); g.fillRect(x, y0, 1, y1 - y0);
      } else if (state === 1) {
        if (Math.floor(time * 24) % 2 === 0) { g.fillStyle(0xb967ff, 0.55); g.fillRect(x, y0, 1, y1 - y0); }
      } else {
        g.fillStyle(0xb967ff, 0.12);
        for (let y = y0; y < y1; y += 6) g.fillRect(x, y, 1, 2);
      }
    };
    const L = world.level;
    for (let i = 0; i < L.gates.length; i++) {
      const gt = L.gates[i];
      const x = gt.x * TILE + TILE / 2, y0 = gt.y0 * TILE, y1 = (gt.y1 + 1) * TILE;
      beam(x, y0, y1, world.gateState(i));
      // emitters
      g.fillStyle(0x6a4a9a, 1); g.fillRect(x - 4, y0, 8, 3); g.fillRect(x - 4, y1 - 3, 8, 3);
    }
    const b = world.boss;
    if (!(b instanceof Archivist)) return;
    const floor = b.floorY;
    if (b.state === "laserWind" && b.move === "sweep") {
      // the sight line along the floor, and where the beam will start
      const k = Math.min(1, b.stateT / (ARC.sweepWind * 0.8));
      const on = Math.floor(time * (10 + 20 * k)) % 2 === 0;
      g.fillStyle(0xb967ff, on ? 0.3 + 0.5 * k : 0.12);
      g.fillRect(b.arenaMin, floor - Math.round(ARC.sweepH / 2), b.arenaMax - b.arenaMin, 1);
      beam(b.sweepX, floor - ARC.sweepH - 6, floor, 1, 4);
    }
    if (b.sweepX > 0 && (b.state === "laser" || b.state === "erase")) {
      g.fillStyle(0x7a2fc0, 0.25);
      g.fillRect(Math.round(b.sweepX - 30 * b.sweepDir), floor - ARC.sweepH, Math.round(30), ARC.sweepH);
      beam(b.sweepX, floor - ARC.sweepH, floor, 2, 5);
    }
    if (b.beams.length && (b.state === "laserWind" || b.state === "grid")) {
      for (let i = 0; i < b.beams.length; i++) {
        if (i === b.gap) {
          // the safe lane: a pale column of light
          g.fillStyle(0x9ffcff, 0.12 + 0.06 * Math.sin(time * 8));
          g.fillRect(Math.round(b.beams[i] - 10), b.roofY, 20, floor - b.roofY);
          continue;
        }
        beam(b.beams[i], b.roofY, floor, b.state === "grid" ? 2 : 1);
      }
    }
  }

  private drawDrone(s: Soldier, v: SView, time: number) {
    const dead = s.state === "dead";
    v.body.setFrame(dead ? 4 : Math.floor(time * 18) % 4);
    v.body.setOrigin(0.5, 17 / 32);
    v.body.setPosition(Math.round(s.cx), Math.round(s.cy));
    if (dead) {
      v.body.setRotation(s.spin * 0.6);
      v.body.setAlpha(s.deadTime > 5 ? Math.max(0, 1 - (s.deadTime - 5)) : 1);
      v.arm.setVisible(false);
    } else {
      v.body.setRotation(Math.max(-0.25, Math.min(0.25, s.vx * 0.004))).setAlpha(1);
      const charging = s.state === "aim";
      const ex = s.cx + Math.cos(s.aim) * 2, ey = s.cy + 1 + Math.sin(s.aim) * 1.5;
      v.arm.setVisible(true).setPosition(Math.round(ex), Math.round(ey));
      const pulse = charging ? 0.35 + 0.25 * Math.sin(time * 30) : 0.18;
      v.arm.setScale(charging ? 0.32 : 0.2).setAlpha(Math.min(1, pulse * 2.2));
    }
    if (s.hitFlash > 0) v.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else v.body.clearTint();
  }

  private rayEnd(world: World, x: number, y: number, ang: number, max: number) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const p = world.player;
    for (let d = 0; d < max; d += 2) {
      const px = x + dx * d, py = y + dy * d;
      const t = world.level.get(Math.floor(px / TILE), Math.floor(py / TILE));
      if (t === SOLID || t === 3) return d;
      if (!p.dead && px > p.x && px < p.x + p.w && py > p.y && py < p.y + p.h) return d;
    }
    return max;
  }

  private drawLasers(world: World, time: number) {
    const g = this.gLaser;
    g.clear();
    this.drawSecurity(world, time);
    for (const s of world.soldiers) {
      if (!(s instanceof Boss) || s instanceof Archivist || s instanceof Bulwark) continue;
      const v = this.views.get(s.id);
      // shoulder guns glow while they charge
      if (v?.pod) {
        const charging = s.state === "volley" || s.state === "missile" || s.state === "laserWind" || s.state === "laser";
        const m = podMuzzle(s);
        v.pod.setVisible(charging && s.phase === 2).setPosition(m.x, m.y)
          .setTexture(s.state === "volley" ? "glowPink" : "glowPurple")
          .setScale(0.25 + 0.15 * Math.min(1, s.stateT / 0.4) + 0.04 * Math.sin(time * 40)).setAlpha(0.9);
      }
      const floor = s.bottom;
      const yb = floor - Math.round((BOSS.laserLow + BOSS.laserHigh) / 2);
      const x0 = s.facing > 0 ? s.cx : s.arenaMin, x1 = s.facing > 0 ? s.arenaMax : s.cx;
      if (s.state === "laserWind") {
        // a thin flickering sight line along the floor
        const k = Math.min(1, s.stateT / (BOSS.laserWind * 0.8));
        const on = Math.floor(time * (10 + 20 * k)) % 2 === 0;
        g.fillStyle(0xb967ff, on ? 0.35 + 0.5 * k : 0.15);
        g.fillRect(Math.round(x0), yb, Math.round(x1 - x0), 1);
        g.fillStyle(0xb967ff, 0.12 * k);
        g.fillRect(Math.round(x0), floor - BOSS.laserLow, Math.round(x1 - x0), BOSS.laserLow - BOSS.laserHigh);
      } else if (s.state === "laser") {
        const k = 1 - s.stateT / BOSS.laser;
        const h = BOSS.laserLow - BOSS.laserHigh;
        const jitter = Math.sin(time * 90) > 0 ? 1 : 0;
        g.fillStyle(0x7a2fc0, 0.5 * k);
        g.fillRect(Math.round(x0), floor - BOSS.laserLow - 3, Math.round(x1 - x0), h + 6);
        g.fillStyle(0xb967ff, 0.85 * k);
        g.fillRect(Math.round(x0), floor - BOSS.laserLow + jitter, Math.round(x1 - x0), h - jitter);
        g.fillStyle(0xffffff, k);
        g.fillRect(Math.round(x0), yb - 1, Math.round(x1 - x0), 3);
      }
    }
    for (const s of world.soldiers) {
      if (!(s instanceof Bulwark) || s.state !== "bAim") continue;
      // the turret's laser sight: thin and wandering, then still and blinking
      const m = s.muzzlePt();
      const len = this.rayEnd(world, m.x, m.y, s.gunAim, 520);
      const total = BUL.aimWind[s.shielded ? 0 : 1];
      const prog = 1 - Math.max(0, s.timer) / total;
      const locked = s.timer < 0.25;
      const alpha = locked ? (Math.floor(time * 30) % 2 ? 0.95 : 0.35) : 0.2 + 0.4 * prog;
      const dx = Math.cos(s.gunAim), dy = Math.sin(s.gunAim);
      g.fillStyle(0xffb347, alpha);
      for (let d = 0; d < len; d += 1) g.fillRect(Math.round(m.x + dx * d), Math.round(m.y + dy * d), 1, locked ? 2 : 1);
      g.fillStyle(0xffffff, alpha);
      g.fillRect(Math.round(m.x + dx * len) - 1, Math.round(m.y + dy * len) - 1, 3, 3);
    }
    for (const s of world.soldiers) {
      if (s.state !== "aim") continue;
      const danger = PATTERNS[s.pattern]?.danger;
      if (!s.def.laser) {
        const total = TUNE.telegraph * s.def.telegraphMul;
        const prog = 1 - Math.max(0, s.timer) / total;
        const r = 26 - 20 * prog;
        g.lineStyle(1, 0xff2a6d, 0.3 + 0.6 * prog);
        g.strokeCircle(Math.round(s.cx) + 0.5, Math.round(s.cy + 1) + 0.5, r);
        if (s.aimLocked) {
          g.lineStyle(1, 0xffffff, Math.floor(time * 30) % 2 ? 0.9 : 0.3);
          g.strokeCircle(Math.round(s.cx) + 0.5, Math.round(s.cy + 1) + 0.5, r + 3);
        }
        continue;
      }
      const m = s.muzzle();
      const len = this.rayEnd(world, m.x, m.y, s.aim, 520);
      const col = danger ? DANGER : s.kind === "burst" ? 0xffb347 : 0xff2a6d;
      const total = TUNE.telegraph * s.def.telegraphMul;
      const prog = 1 - Math.max(0, s.timer) / total;
      let alpha = 0.18 + 0.35 * prog;
      let w = danger ? 2 : 1;
      if (s.aimLocked) {
        const blink = Math.floor(time * 30) % 2 === 0;
        alpha = blink ? 0.95 : 0.35;
        w = 2;
      }
      const dx = Math.cos(s.aim), dy = Math.sin(s.aim);
      g.fillStyle(col, alpha);
      for (let d = 0; d < len; d += 1) {
        const x = Math.round(m.x + dx * d), y = Math.round(m.y + dy * d);
        g.fillRect(x, y, 1, 1);
        if (w > 1) g.fillRect(x, y + (Math.abs(dy) < 0.7 ? 1 : 0), 1, 1);
      }
      const ex = m.x + dx * len, ey = m.y + dy * len;
      g.fillStyle(col, Math.min(1, alpha + 0.2));
      g.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 3, 3);
      g.fillStyle(0xffffff, alpha);
      g.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 1, 2, 2);
    }
  }

  private glow(x: number, y: number, key: string, scale: number, alpha: number) {
    if (!TEST.glow) return;
    let img = this.glowPool[this.glowUsed];
    if (!img) {
      img = this.scene.add.image(0, 0, key).setDepth(29).setBlendMode(Phaser.BlendModes.ADD);
      this.glowPool.push(img);
    }
    this.glowUsed++;
    img.setTexture(key).setPosition(x, y).setScale(scale).setAlpha(alpha).setVisible(true);
  }

  private drawLights() {
    let i = 0;
    for (const l of this.lights) {
      let img = this.lightPool[i];
      if (!img) {
        img = this.scene.add.image(0, 0, l.color).setDepth(8.5).setBlendMode(Phaser.BlendModes.ADD);
        this.lightPool.push(img);
      }
      const k = 1 - l.t / 0.12;
      img.setTexture(l.color).setPosition(l.x, l.y).setScale(2.2 * l.r).setAlpha(0.38 * k).setVisible(true);
      i++;
    }
    for (; i < this.lightPool.length; i++) this.lightPool[i].setVisible(false);
  }

  private drawBullets(world: World, time: number, cinematic: Bullet | null) {
    const g = this.gBullet, ga = this.gBulletAdd;
    g.clear();
    ga.clear();
    this.glowUsed = 0;
    for (const b of world.bullets) {
      if (!b.alive || b.heldTimer > 0) continue;
      const enemy = b.owner === "enemy";
      const cine = b === cinematic;
      if (enemy && b.kind === "heavy") { this.drawHeavy(b, time); continue; }
      if (enemy && b.kind === "orb") { this.drawOrb(b, time); continue; }
      if (b.kind === "wave") { this.drawWave(b, time); continue; }
      if (enemy && b.kind === "missile") { this.drawMissile(b, time); continue; }
      const core = enemy ? 0xfff0c0 : b.perfect ? 0xffffff : 0xe8ffff;
      const mid = enemy ? 0xff8a2a : b.perfect ? 0x9ffcff : 0x2de2e6;
      const tail = enemy ? 0xff3d1f : b.perfect ? 0x2de2e6 : 0x1a8a9a;
      const tr = b.trail;
      const n = tr.length;
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1);
        const p0 = tr[i];
        const p1 = i + 1 < n ? tr[i + 1] : { x: b.x, y: b.y };
        const steps = Math.max(1, Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y)));
        ga.fillStyle(t > 0.6 ? mid : tail, t * (enemy ? 0.55 : 0.75) * (cine ? 1.2 : 1));
        const wTrail = enemy ? 1 : b.perfect || cine ? 2 : 1;
        for (let k = 0; k < steps; k++) {
          const x = p0.x + ((p1.x - p0.x) * k) / steps, y = p0.y + ((p1.y - p0.y) * k) / steps;
          ga.fillRect(Math.round(x), Math.round(y), wTrail, wTrail);
        }
      }
      const bx = Math.round(b.x), by = Math.round(b.y);
      const big = b.perfect || cine;
      g.fillStyle(mid, 1);
      g.fillRect(bx - 2, by - 1, 5, 3);
      g.fillRect(bx - 1, by - 2, 3, 5);
      g.fillStyle(core, 1);
      g.fillRect(bx - 1, by - 1, 3, 3);
      if (big) {
        g.fillStyle(core, 0.9);
        g.fillRect(bx - 3, by, 7, 1);
        g.fillRect(bx, by - 3, 1, 7);
      }
      this.glow(bx, by, enemy ? "glowAmber" : "glowCyan", big ? 0.75 : 0.42, enemy ? 0.7 : 0.85);
      if (cine) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 40);
        this.glow(bx, by, "glowCyan", 1.4 + pulse * 0.3, 0.5);
      }
    }
    for (let i = this.glowUsed; i < this.glowPool.length; i++) this.glowPool[i].setVisible(false);
  }

  /** Unparryable slug: violet, spiked, spinning, with a heavy trail. */
  private drawHeavy(b: Bullet, time: number) {
    const g = this.gBullet, ga = this.gBulletAdd;
    const n = b.trail.length;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      ga.fillStyle(t > 0.5 ? 0xb967ff : 0x5a1f9a, t * 0.7);
      const q = b.trail[i];
      ga.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 3, 3);
    }
    const x = Math.round(b.x), y = Math.round(b.y);
    const spin = Math.floor(time * 16) % 2;
    g.fillStyle(0x07050f, 1);
    g.fillRect(x - 4, y - 3, 9, 7);
    g.fillRect(x - 3, y - 4, 7, 9);
    g.fillStyle(0x7a2fc0, 1);
    g.fillRect(x - 3, y - 2, 7, 5);
    g.fillRect(x - 2, y - 3, 5, 7);
    g.fillStyle(0xe8c8ff, 1);
    g.fillRect(x - 1, y - 1, 3, 3);
    g.fillStyle(0xd9a8ff, 1);
    if (spin) { g.fillRect(x, y - 6, 1, 2); g.fillRect(x, y + 5, 1, 2); g.fillRect(x - 6, y, 2, 1); g.fillRect(x + 5, y, 2, 1); }
    else { g.fillRect(x - 5, y - 5, 2, 2); g.fillRect(x + 4, y - 5, 2, 2); g.fillRect(x - 5, y + 4, 2, 2); g.fillRect(x + 4, y + 4, 2, 2); }
    this.glow(x, y, "glowPurple", 0.7, 0.85);
  }

  /** Homing missile: dark body, hot nose, purple exhaust (purple = can't parry). */
  private drawMissile(b: Bullet, time: number) {
    const g = this.gBullet, ga = this.gBulletAdd;
    const n = b.trail.length;
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);
      const q = b.trail[i];
      ga.fillStyle(t > 0.6 ? 0xe8c8ff : 0x7a2fc0, t * 0.75);
      ga.fillRect(Math.round(q.x) - 1, Math.round(q.y) - 1, 2 + (t > 0.7 ? 1 : 0), 2 + (t > 0.7 ? 1 : 0));
    }
    const sp = b.speed || 1;
    const ux = b.vx / sp, uy = b.vy / sp;
    for (let k = -4; k <= 3; k++) {
      const x = Math.round(b.x + ux * k), y = Math.round(b.y + uy * k);
      g.fillStyle(0x07050f, 1);
      g.fillRect(x - 2, y - 2, 4, 4);
    }
    for (let k = -3; k <= 2; k++) {
      const x = Math.round(b.x + ux * k), y = Math.round(b.y + uy * k);
      g.fillStyle(k >= 1 ? 0xff4f8b : 0x5a5a72, 1);
      g.fillRect(x - 1, y - 1, 2, 2);
    }
    g.fillStyle(Math.floor(time * 20) % 2 ? 0xffffff : 0xffd0e0, 1);
    g.fillRect(Math.round(b.x + ux * 3) - 1, Math.round(b.y + uy * 3) - 1, 2, 2);
    this.glow(b.x - ux * 4, b.y - uy * 4, "glowPurple", 0.5, 0.8);
  }

  /** Boss shockwave: a wall of crimson force rolling along the roof. */
  private drawWave(b: Bullet, time: number) {
    const g = this.gBullet, ga = this.gBulletAdd;
    const x = Math.round(b.x), base = Math.round(b.y + 7);
    const dir = Math.sign(b.vx) || 1;
    // a leaning crest of force: tall at the front, trailing embers behind
    for (let i = 0; i < 12; i++) {
      const cx = x - dir * i * 3;
      const h = Math.round((22 - i * 1.7) * (0.85 + 0.15 * Math.sin(time * 40 + i * 1.3)));
      if (h <= 0) continue;
      g.fillStyle(0x07050f, 0.6);
      g.fillRect(cx - 1, base - h - 1, 4, h + 1);
      ga.fillStyle(i < 2 ? 0xffe0ea : i < 5 ? 0xff2a6d : 0x8a1040, 1 - i * 0.07);
      ga.fillRect(cx, base - h, 3, h);
    }
    g.fillStyle(0xffffff, 1);
    g.fillRect(x + dir, base - 20, 2, 20);
    g.fillStyle(0xffd0dc, 1);
    g.fillRect(x + dir * 3, base - 12, 1, 12);
    this.glow(x, base - 10, "glowPink", 1.1, 0.9);
  }

  /** Slow drone orb: big, soft, parryable. */
  private drawOrb(b: Bullet, time: number) {
    const g = this.gBullet, ga = this.gBulletAdd;
    const x = Math.round(b.x), y = Math.round(b.y);
    const pulse = Math.floor(time * 12) % 2;
    ga.fillStyle(0xff2a6d, 0.35);
    ga.fillRect(x - 5, y - 3, 11, 7);
    ga.fillRect(x - 3, y - 5, 7, 11);
    g.fillStyle(0xff4f8b, 1);
    g.fillRect(x - 3, y - 2, 7, 5);
    g.fillRect(x - 2, y - 3, 5, 7);
    g.fillStyle(pulse ? 0xffffff : 0xffd0e0, 1);
    g.fillRect(x - 1, y - 1, 3, 3);
    this.glow(x, y, "glowPink", 0.75, 0.8);
  }

  private drawSlash(world: World) {
    const g = this.gSlash;
    g.clear();
    const s = this.slash;
    const life = 0.17;
    if (s.t > life && s.flash <= 0) return;
    const p = world.player;
    const cx = p.cx, cy = p.y + 20;
    const reveal = Math.min(1, s.t / 0.05);
    const fade = s.t < 0.06 ? 1 : Math.max(0, 1 - (s.t - 0.06) / (life - 0.06));
    const bright = Math.max(fade, s.flash);
    const span = (75 * Math.PI) / 180;
    const r0 = 28, r1 = s.hit ? 47 : 43; // 1.3x reach
    const a0 = s.angle - span, a1 = s.angle - span + 2 * span * reveal;
    const outer = s.perfect ? 0xffffff : 0x2de2e6;
    const inner = s.perfect ? 0x9ffcff : 0xd8ffff;
    for (let a = a0; a <= a1; a += 1 / r1) {
      const u = (a - (s.angle - span)) / (2 * span);
      const thick = Math.sin(Math.PI * u);
      const rIn = r1 - (r1 - r0) * thick;
      const cos = Math.cos(a), sin = Math.sin(a);
      for (let r = rIn; r <= r1; r += 1) {
        const edge = r > r1 - 2;
        g.fillStyle(edge ? inner : outer, bright * (edge ? 0.95 : 0.35 + 0.4 * u));
        g.fillRect(Math.round(cx + cos * r), Math.round(cy + sin * r), 1, 1);
      }
    }
    if (s.flash > 0) {
      g.fillStyle(0xffffff, s.flash * 0.5);
      const a = s.angle;
      for (let r = r0; r <= r1 + 4; r++) g.fillRect(Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy + Math.sin(a) * r) - 1, 3, 3);
    }
  }

  /** Player's offensive cut: white core, magenta edge, sweeps with the combo. */
  private drawCut(world: World) {
    const c = this.cut;
    const life = 0.16;
    if (c.t > life) return;
    const g = this.gSlash;
    const p = world.player;
    const cx = p.cx, cy = p.y + 20;
    const f = c.facing;
    const deg = Math.PI / 180;
    const from = c.angle + (c.combo === 1 ? -100 : 95) * deg * f;
    const to = c.angle + (c.combo === 1 ? 45 : -50) * deg * f;
    const reveal = Math.min(1, c.t / 0.045);
    const fade = c.t < 0.05 ? 1 : Math.max(0, 1 - (c.t - 0.05) / (life - 0.05));
    const r0 = 23, r1 = 52 + c.hit * 4; // 1.3x reach
    const steps = Math.ceil(Math.abs(to - from) * r1);
    for (let i = 0; i <= steps * reveal; i++) {
      const u = i / steps;
      const a = from + (to - from) * u;
      const thick = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 0.8) * (r1 - r0);
      const cos = Math.cos(a), sin = Math.sin(a);
      for (let r = r1 - thick; r <= r1; r += 1) {
        const edge = r > r1 - 2;
        const col = edge ? 0xffffff : u > 0.6 ? 0xff6fb5 : 0xb967ff;
        g.fillStyle(col, fade * (edge ? 1 : 0.25 + 0.5 * u));
        g.fillRect(Math.round(cx + cos * r), Math.round(cy + sin * r), 1, 1);
      }
    }
  }

  private drawFx(world?: World, time = 0) {
    const g = this.gFx;
    g.clear();
    // blast radius of an armed kamikaze: get out of the circle, or dash through it
    if (world) for (const s of world.soldiers) {
      if (s.kind !== "kamikaze" || s.state !== "armed") continue;
      const k = s.fuseMax > 0 ? 1 - s.fuse / s.fuseMax : 1;
      const R = 58;
      const segs = 28;
      const on = Math.floor(time * (5 + 26 * k * k)) % 2 === 0;
      g.lineStyle(1, on ? 0xffffff : 0xb967ff, 0.25 + 0.55 * k);
      for (let i = 0; i < segs; i += 2) {
        const a0 = (i / segs) * Math.PI * 2 + time * 1.5, a1 = ((i + 1) / segs) * Math.PI * 2 + time * 1.5;
        g.beginPath();
        g.arc(s.cx, s.cy, R, a0, a1);
        g.strokePath();
      }
    }
    if (world) this.drawFires(world, time);
    for (const r of this.rings) {
      const t = r.t / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - t, 3));
      g.lineStyle(Math.max(1, Math.round(r.w * (1 - t) + 0.5)), r.color, 1 - t);
      g.strokeCircle(r.x, r.y, rad);
    }
    for (const f of this.flashes) {
      const a = 1 - f.t / 0.07;
      g.fillStyle(0xffffff, a);
      g.fillRect(Math.round(f.x) - 2, Math.round(f.y) - 1, 5, 3);
      g.fillStyle(f.color, a * 0.8);
      g.fillRect(Math.round(f.x) - 4, Math.round(f.y), 9, 1);
      g.fillRect(Math.round(f.x), Math.round(f.y) - 3, 1, 7);
    }
  }

  /** Purple fire on the floor: first a flickering outline, then the flames. */
  private drawFires(world: World, time: number) {
    const g = this.gFx;
    for (const f of world.fires) {
      const x0 = Math.round(f.x), y0 = f.floor;
      if (f.t < f.warm) {
        const on = Math.floor(time * 30) % 2 === 0;
        g.fillStyle(on ? 0xb967ff : 0xe8c8ff, 0.7);
        g.fillRect(x0, y0 - 2, f.w, 2);
        continue;
      }
      const age = f.t - f.warm;
      const fade = age > f.life - 0.3 ? Math.max(0, (f.life - age) / 0.3) : 1;
      const grow = Math.min(1, age / 0.12);
      for (let x = 0; x < f.w; x += 3) {
        const n = Math.sin(x * 0.9 + time * 18) * 0.5 + Math.sin(x * 0.37 - time * 11) * 0.5;
        const hgt = (10 + 10 * (0.5 + 0.5 * n)) * grow * fade;
        g.fillStyle(0x6a1aa8, 0.55 * fade);
        g.fillRect(x0 + x, Math.round(y0 - hgt - 2), 3, Math.round(hgt + 2));
        g.fillStyle(0xb967ff, 0.75 * fade);
        g.fillRect(x0 + x, Math.round(y0 - hgt * 0.7), 3, Math.round(hgt * 0.7));
        g.fillStyle(0xf0e0ff, 0.85 * fade);
        g.fillRect(x0 + x + 1, Math.round(y0 - hgt * 0.35), 1, Math.round(hgt * 0.35));
      }
    }
  }

  private drawText(world: World, time: number) {
    const g = this.gText;
    g.clear();
    this.drawAssassinTell(world, time);
    for (const [id, t] of this.alerts) {
      const s = world.soldiers.find((o) => o.id === id);
      if (!s || !s.alive) continue;
      const bounce = t < 0.15 ? -6 * (t / 0.15) : t < 0.25 ? -6 + 6 * ((t - 0.15) / 0.1) : 0;
      const a = t > 0.7 ? 1 - (t - 0.7) / 0.2 : 1;
      drawText(g, "!", Math.round(s.cx - 5), Math.round(s.y - 22 + bounce), s.kind === "burst" ? 0xffb347 : 0xff2a6d, a, 2, 0x07050f);
    }
    for (const [id, t] of this.dangers) {
      const s = world.soldiers.find((o) => o.id === id);
      if (!s || !s.alive) continue;
      const pop = t < 0.08 ? 1 + (1 - t / 0.08) : 1;
      const on = Math.floor(time * 16) % 2 === 0 || t < 0.3;
      const sc = Math.round(3 * pop);
      drawText(g, "!", Math.round(s.cx - 2.5 * sc), Math.round(s.y - 30 - (sc - 3) * 4), on ? 0xff2a6d : 0xffffff, t > 0.7 ? 1 - (t - 0.7) / 0.2 : 1, sc, 0x07050f);
    }
    for (const [id, t] of this.perils) {
      const s = world.soldiers.find((o) => o.id === id);
      if (!s || !s.alive) continue;
      const pop = t < 0.08 ? 1 + (1 - t / 0.08) : 1;
      const sc = Math.round(2 * pop);
      const a = t > 0.7 ? 1 - (t - 0.7) / 0.2 : 1;
      const on = Math.floor(time * 14) % 2 === 0 || t < 0.3;
      const w = 11 * sc, x0 = Math.round(s.cx - w / 2), y0 = Math.round(s.y - (s instanceof Assassin ? 46 : 34) - (sc - 2) * 6);
      for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) {
        if (KI[r][c] !== "X") continue;
        g.fillStyle(0x07050f, a);
        g.fillRect(x0 + c * sc - 1, y0 + r * sc - 1, sc + 2, sc + 2);
      }
      for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) {
        if (KI[r][c] !== "X") continue;
        g.fillStyle(on ? 0xb967ff : 0xffffff, a);
        g.fillRect(x0 + c * sc, y0 + r * sc, sc, sc);
      }
    }
    // where the leaping oni will come down
    for (const s of world.soldiers) {
      if (!(s instanceof Boss) || s.state !== "air") continue;
      const floor = s.anchorY + s.h;
      const k = Math.min(1, s.stateT / 0.6);
      const w = Math.round(20 + 30 * k);
      g.fillStyle(0x07050f, 0.35 + 0.3 * k);
      g.fillRect(Math.round(s.leapTX - w / 2), floor - 2, w, 2);
      g.fillRect(Math.round(s.leapTX - w / 2) + 3, floor - 3, w - 6, 1);
      g.fillStyle(0xb967ff, 0.5 + 0.5 * (Math.floor(time * 16) % 2));
      g.fillRect(Math.round(s.leapTX - w / 2), floor - 1, 3, 1);
      g.fillRect(Math.round(s.leapTX + w / 2) - 3, floor - 1, 3, 1);
    }
    for (const gl of this.glints) {
      const s = world.soldiers.find((o) => o.id === gl.id);
      if (!s || !s.alive) continue;
      const big = s instanceof Boss && !(s instanceof Chief);
      const x = Math.round(s.cx - s.facing * (big ? 6 : 14)), y = Math.round(s.y + (big ? -14 : 2));
      const k = 1 - gl.t / 0.2, len = Math.round(2 + 6 * k);
      g.fillStyle(0xffffff, k);
      g.fillRect(x - len, y, len * 2 + 1, 1);
      g.fillRect(x, y - len, 1, len * 2 + 1);
      g.fillRect(x - 1, y - 1, 3, 3);
    }
    // posture gauge over engaged sword fighters
    for (const s of world.soldiers) {
      if (!s.def.melee || s instanceof Boss || !s.alive || s.state === "dormant" || s.state === "enter" || (s.posture <= 0 && s.state === "patrol")) continue;
      const w = 26, x = Math.round(s.cx - w / 2), y = Math.round(s.y - 12);
      const k = s.posture / s.postureMax;
      const broken = s.state === "stagger";
      g.fillStyle(0x07050f, 0.85);
      g.fillRect(x - 1, y - 1, w + 2, 5);
      g.fillStyle(0x2a2346, 1);
      g.fillRect(x, y, w, 3);
      const col = broken ? (Math.floor(time * 12) % 2 ? 0xffffff : 0xff2a6d) : k > 0.75 ? 0xff5a3a : k > 0.4 ? 0xffb347 : 0xf9f871;
      const half = Math.round((w / 2) * (broken ? 1 : k));
      g.fillStyle(col, 1);
      g.fillRect(x, y, half, 3);
      g.fillRect(x + w - half, y, half, 3);
      g.fillStyle(0xffffff, 0.6);
      g.fillRect(x + w / 2, y - 1, 1, 5);
    }
    for (const p of this.popups) {
      const t = p.t / p.max;
      const rise = -Math.round(10 * (1 - Math.pow(1 - t, 2)));
      const a = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      const sc = p.scale;
      const pop = p.t < 0.06 ? 1 : 0;
      drawText(g, p.text, Math.round(p.x - textWidth(p.text, sc) / 2), Math.round(p.y + rise - pop), p.color, a, sc, p.outline);
    }
  }
}
