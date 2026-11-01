// 방벽 (THE BULWARK): STAGE 2's boss (bible v3, 2-07). A remote riot
// machine parked across the freight lift. Nobody is inside, so it is
// destroyed, not subdued. It teaches aiming a parry, ahead of the Archivist.
//
//   shield   A tall plate on its front stops swords and bullets alike.
//   vent     The cooling grille on its back-top corner is the weak point.
//            Only sent-back bullets hurt it: get behind the machine, or
//            above it on a catwalk, and parry its rounds home.
//   burst    The turret on its roof swivels freely: a laser sight, then
//            three metal rounds (parryable). From behind, they come at you
//            over its back, and the vent is right there.
//   ram      Red "!": it drives forward behind the shield. Parry it to stop
//            it dead, or jump it and land behind it.
//   slam     Purple 危: the shield hammers the floor and a shockwave runs
//            out both ways along it. Jump it.
//   turn     It is heavy: turning to face you takes over a second.
//
// When the vent goes, the shield drops off and the hull is open: the sword
// bites, parried rounds break its posture, and the deathblow shuts it down.

import type { World } from "./world";
import { Level } from "../world/level";
import { Boss } from "./boss";
import { approach } from "../core/actor";
import { Soldier } from "./soldier";
import { Bullet } from "./bullet";
import { MOD } from "./loadout";

export const BUL = {
  ventHp: 4,          // a perfect parry counts twice
  hp: 20,
  postureMax: 190,
  turn: 1.15,
  creep: 34,
  aimWind: [0.85, 0.62],   // shielded / open
  shots: [3, 4],
  shotGap: 0.17,
  shotSpeed: 0.95,
  fireRecover: 0.8,
  ramWind: 0.85,
  ramSpeed: 330,
  ram: 0.72,
  ramRecover: 1.0,
  ramStun: 1.3,       // stopped dead by a parry
  slamWind: 0.95,
  slamRecover: 1.05,
  waveSpeed: 270,
  shed: 1.7,          // the shield falls away; it shudders, open
  stagger: 3.0,
  ramReach: 44,
  // body and parts, relative to the hull rect
  shieldOver: 10,     // the plate stands this much higher than the hull
};

export type BulMove = "burst" | "ram" | "slam" | "turn";

export class Bulwark extends Boss {
  ventHp = BUL.ventHp;
  shielded = true;
  moves: BulMove[] = [];
  /** Moves chosen in a row with the player behind it: at the third it always turns. */
  behindN = 0;
  shot = 0;
  gunAim = Math.PI;       // radians, world space
  turnFrom = 1;           // facing before a turn
  shieldDrop: { x: number; y: number; vx: number; vy: number; rot: number; vr: number; rest: boolean } | null = null;
  heat = 0;               // 0..1, the vent glows hotter as it is hit

  constructor(level: Level, tx: number, ty: number, group: number, arenaMin: number, arenaMax: number) {
    super(level, tx, ty, group, arenaMin, arenaMax);
    this.w = 60;
    this.h = 50;
    this.x = tx * 16 - this.w / 2;
    this.y = ty * 16 - this.h;
    this.anchorY = this.y;
    this.marks = 1;
    this.hp = this.hpMax = BUL.hp;
    this.postureMax = BUL.postureMax;
    this.facing = -1;
    this.gunAim = Math.PI;
    this.dropThrough = true;
  }

  get vulnerable() {
    return !["dormant", "intro", "dead", "shed"].includes(this.state);
  }
  /** With the shield gone there is nothing to parry a sword with: every cut lands. */
  get open() { return !this.shielded; }

  /** The shield plate (world px), on the front face. */
  shieldRect() {
    const w = 10, y = this.y - BUL.shieldOver, h = this.h + BUL.shieldOver - 2;
    return { x: this.facing > 0 ? this.x + this.w - 5 : this.x - 5, y, w, h };
  }
  /** The cooling vent: the back-top corner, open to shots from behind or above. */
  ventRect() {
    // the radiator on the rear deck (painted at x 8..29, y 10..22 of the 72x58 frame)
    const w = 24, h = 14;
    return { x: this.facing > 0 ? this.x + 1 : this.x + this.w - w - 1, y: this.y + 1, w, h };
  }
  ventCenter() {
    const r = this.ventRect();
    return { x: r.x + r.w / 2, y: r.y + 5 };
  }
  /** The turret pivot on the roof, toward the front. */
  gunPivot() { return { x: this.cx + this.facing * 10, y: this.y - 1 }; }
  muzzlePt() {
    const p = this.gunPivot();
    return { x: p.x + Math.cos(this.gunAim) * 22, y: p.y + Math.sin(this.gunAim) * 22 };
  }
}

/** Where aim assist should steer a sent-back bullet. */
export function bulwarkAimPoint(s: Bulwark) {
  if (s.shielded) return s.ventCenter();
  return { x: s.cx, y: s.cy - 4 };
}

const hits = (b: Bullet, r: { x: number; y: number; w: number; h: number }, pad = 1) =>
  b.x + b.radius + pad > r.x && b.x - b.radius - pad < r.x + r.w && b.y + b.radius + pad > r.y && b.y - b.radius - pad < r.y + r.h;

/**
 * A bullet of ours against the machine. Returns true if the bullet was used up
 * (it struck something), false if it missed it altogether.
 */
export function bulwarkBullet(w: World, s: Bulwark, b: Bullet): boolean {
  if (!w.hittable(s)) return false;
  if (s.shielded) {
    const v = s.ventRect();
    // the grille faces back and up: shots from behind, or falling onto it
    const fromBehind = b.vx * s.facing > 40;
    const fromAbove = b.vy > 60;
    if (hits(b, v, 2) && (fromBehind || fromAbove)) {
      const dmg = (b.perfect ? 2 : 1) * (MOD.reflect() > 1.2 ? 1.5 : 1);
      s.ventHp = Math.max(0, s.ventHp - dmg);
      s.heat = Math.min(1, s.heat + 0.3);
      s.hitFlash = 0.08;
      s.sinceHit = 0;
      w.ev.bulwark?.(s, "vent", b.x, b.y);
      if (s.ventHp <= 0) shed(w, s);
      return true;
    }
    if (hits(b, s.shieldRect())) { w.ev.bulwark?.(s, "clank", b.x, b.y); return true; }
    if (hits(b, { x: s.x, y: s.y, w: s.w, h: s.h })) { w.ev.bulwark?.(s, "armor", b.x, b.y); return true; }
    return false;
  }
  return false; // open: handled like any boss by the world
}

/** The vent burst: the shield comes away and falls; the hull is open. */
function shed(w: World, s: Bulwark) {
  s.shielded = false;
  s.state = "shed";
  s.timer = BUL.shed;
  s.stateT = 0;
  s.vx = 0;
  s.posture = 0;
  const r = s.shieldRect();
  s.shieldDrop = { x: r.x + r.w / 2, y: r.y + r.h / 2, vx: s.facing * 70, vy: -140, rot: 0, vr: s.facing * 1.6, rest: false };
  w.bullets = w.bullets.filter((o) => o.owner !== "enemy");
  w.ev.bulwark?.(s, "shed", s.cx, s.cy);
}

export function updateBulwark(w: World, s: Bulwark, dt: number) {
  s.hitFlash = Math.max(0, s.hitFlash - dt);
  s.sinceHit += dt;
  s.stateT += dt;
  s.heat = Math.max(s.shielded ? 0 : 0.6, s.heat - dt * 0.12);
  const p = w.player;
  const pc = { x: p.cx, y: p.y + 20 };
  const dx = p.cx - s.cx;
  const dist = Math.abs(dx);
  const behind = dx * s.facing < -8;
  const onFloor = Math.abs(p.bottom - s.bottom) < 10;
  const set = (st: Soldier["state"], t: number) => {
    s.state = st; s.timer = t; s.stateT = 0; s.attackHit = false; s.hazardDone = false; s.glinted = false;
  };
  const step = (v: number) => (w.floorAhead(s, s.facing) ? s.facing * v : 0);
  // the shield falling away
  const d = s.shieldDrop;
  if (d && !d.rest) {
    d.vy += 900 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
    if (d.y > s.bottom - 5) { d.y = s.bottom - 5; if (Math.abs(d.vy) > 140) { d.vy *= -0.3; d.vx *= 0.5; d.vr *= 0.4; w.ev.bulwark?.(s, "thud", d.x, d.y); } else { d.rest = true; d.rot = Math.PI / 2 * Math.sign(d.rot || 1); } }
  }

  if (s.state === "dead") {
    s.deadT += dt;
    s.vx = approach(s.vx, 0, 600 * dt);
    s.physics(dt);
    return;
  }
  // posture only counts once the hull is open; it settles when left alone
  if (s.shielded) s.posture = 0;
  else if (s.sinceHit > 1.6 && s.state !== "stagger") s.posture = Math.max(0, s.posture - 9 * dt);
  if (s.meleeGrace > 0) {
    s.meleeGrace--;
    if (s.meleeGrace === 0) w.meleeLands(s);
  }
  s.timer -= dt;
  const open = !s.shielded;
  const k = open ? 0.85 : 1;

  // the turret tracks its target (during the aim) or settles forward
  const trackGun = (rate: number) => {
    const g = s.gunPivot();
    let want = Math.atan2(pc.y - g.y, pc.x - g.x);
    // never down through its own roof
    if (Math.sin(want) > 0.35) want = Math.atan2(0.35, Math.cos(want) >= 0 ? 0.94 : -0.94);
    let da = want - s.gunAim;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    s.gunAim += Math.max(-rate * dt, Math.min(rate * dt, da));
  };

  const choose = () => {
    const wt: Record<BulMove, number> = { burst: 3, ram: 0, slam: 0, turn: 0 };
    if (behind) wt.turn = dist < 200 ? 2.2 : 1.4;
    // a learnable rhythm: it gives you two moves at its back, never a third
    s.behindN = behind ? s.behindN + 1 : 0;
    if (behind && s.behindN >= 3) { wt.burst = wt.ram = wt.slam = 0; wt.turn = 1; }
    if (!behind && onFloor && dist > 70 && dist < 300) wt.ram = 3;
    if (onFloor && dist < 230) wt.slam = 2.2;
    const h = s.moves;
    const last = h[h.length - 1];
    if (last && wt[last] > 0 && wt.turn !== 1) wt[last] *= 0.45;
    if (last && h[h.length - 2] === last && last !== "turn") wt[last] = 0;
    let total = 0;
    for (const key in wt) total += wt[key as BulMove];
    if (total <= 0) wt.burst = total = 1;
    let r = Math.random() * total;
    let m: BulMove = "burst";
    for (const key of ["burst", "ram", "slam", "turn"] as BulMove[]) { r -= wt[key]; if (r <= 0) { m = key; break; } }
    h.push(m);
    if (h.length > 6) h.shift();
    if (m === "turn") { s.behindN = 0; s.turnFrom = s.facing; set("turn", BUL.turn * k); return; }
    if (m === "ram") { set("ramWind", BUL.ramWind * k); w.ev.danger(s); return; }
    if (m === "slam") { set("slamWind", BUL.slamWind * k); w.ev.perilous(s, "slam"); return; }
    s.shot = 0;
    set("bAim", BUL.aimWind[open ? 1 : 0]);
    w.ev.aimStart(s);
  };

  switch (s.state) {
    case "dormant":
      return;
    case "intro":
      s.vx = 0;
      trackGun(1.5);
      if (s.timer <= 0) set("guard", 0.6);
      break;
    case "guard": {
      // keep a working distance: creep in when far, back off when crowded
      const want = dist > 220 ? BUL.creep : dist < 90 && !behind ? -BUL.creep * 0.7 : 0;
      s.vx = approach(s.vx, behind ? 0 : (w.floorAhead(s, Math.sign(want) * s.facing || s.facing) ? s.facing * want : 0), 300 * dt);
      trackGun(1.8);
      if (p.dead) break;
      if (s.timer <= 0) choose();
      break;
    }
    case "turn":
      // a heavy, grinding pivot: the back stays exposed the whole time
      s.vx = approach(s.vx, 0, 600 * dt);
      if (s.timer <= 0) {
        s.facing = dx >= 0 ? 1 : -1;
        s.gunAim = s.facing > 0 ? 0 : Math.PI;
        w.ev.bulwark?.(s, "turned", s.cx, s.bottom);
        set("guard", 0.35);
      }
      break;

    // burst: laser sight, then three (four) metal rounds
    case "bAim":
      s.vx = approach(s.vx, 0, 600 * dt);
      trackGun(s.timer > 0.25 ? 3.2 : 0.8);
      if (s.timer <= 0) { set("bFire", 0); w.ev.aimLock(s); }
      break;
    case "bFire":
      trackGun(0.9);
      if (s.timer <= 0) {
        const m = s.muzzlePt();
        w.fireBoss(s, m.x, m.y, s.gunAim, BUL.shotSpeed, "normal");
        s.shot++;
        s.timer = BUL.shotGap;
        if (s.shot >= BUL.shots[open ? 1 : 0]) set("recover", BUL.fireRecover * k);
      }
      break;

    // ram: the red "!"
    case "ramWind":
      s.vx = approach(s.vx, -s.facing * 30, 400 * dt);   // it rocks back on its treads
      if (s.timer <= 0) { set("ram", BUL.ram); s.strong = true; w.ev.enemySwing(s, true); }
      break;
    case "ram": {
      const v = step(BUL.ramSpeed);
      s.vx = v;
      w.enemyStrike(s, true, BUL.ramReach);
      // stops at the arena's edge or when it has run its course
      if (s.timer <= 0 || v === 0 || s.x <= s.arenaMin + 4 || s.x + s.w >= s.arenaMax - 4) {
        s.strong = false;
        s.vx = 0;
        if (v === 0 || s.x <= s.arenaMin + 4 || s.x + s.w >= s.arenaMax - 4) w.ev.bulwark?.(s, "crash", s.cx + s.facing * s.w / 2, s.cy);
        set("recover", BUL.ramRecover * k);
      }
      break;
    }

    // slam: the purple 危, shockwaves both ways
    case "slamWind":
      s.vx = approach(s.vx, 0, 800 * dt);
      if (s.timer <= 0) {
        for (const dir of [-1, 1]) {
          const b = new Bullet(s.cx + dir * (s.w / 2 + 6), s.bottom - 7, dir * BUL.waveSpeed, 0, "enemy", s.id);
          b.kind = "wave";
          b.radius = 7;
          w.bullets.push(b);
        }
        w.ev.bossSmash(s);
        set("recover", BUL.slamRecover * k);
      }
      break;

    case "recoil":
      // a parried ram: shoved back, stunned for a moment
      s.vx = approach(s.vx, 0, 500 * dt);
      if (s.timer <= 0) set("guard", 0.4);
      break;
    case "recover":
    case "hurt":
      s.vx = approach(s.vx, 0, 700 * dt);
      trackGun(1.2);
      if (s.timer <= 0) set("guard", 0.5 + Math.random() * 0.4);
      break;
    case "shed":
      s.vx = approach(s.vx, 0, 900 * dt);
      if (s.timer <= 0) set("guard", 0.4);
      break;
    case "stagger":
      s.vx = approach(s.vx, 0, 500 * dt);
      if (s.timer <= 0) { s.posture = s.postureMax * 0.45; if (s.hp <= 0) s.hp = 2; set("guard", 0.5); }
      break;
    default:
      set("guard", 0.4);
  }
  s.physics(dt);
}

/** The world calls this when a parry turns its ram. */
export function bulwarkParried(w: World, s: Bulwark, perfect: boolean) {
  s.strong = false;
  s.state = "recoil";
  s.timer = BUL.ramStun * (perfect ? 1.25 : 1);
  s.stateT = 0;
  s.vx = -s.facing * (perfect ? 220 : 160);
  w.ev.bulwark?.(s, "stopped", s.cx + s.facing * s.w / 2, s.cy);
}
