// The Assassin (암살자), stage 2 boss. He lives on the walls and ceiling of
// the shaft and can only be beaten by breaking his posture: slashes glance
// off, only parries count. Each attack is a telegraphed flash-step:
//   aim     he coils on the wall; a sight line and 2 or 4 pips tell you
//   2-set   in, cut-cut ("따닥", 0.13 s apart), out to the far wall
//   4-set   2-set, a breath on the far wall, then cut-cut back the other way
// Parry every cut of a set for a bonus. Break him and he drops; deathblow.
// Two marks. Phase 2: shorter tells, ceiling perches, and the desperation
// move (발악): once his posture is past half, a 危 tell with five pips, then
// five cuts in one breath, blinking from side to side around the hero. Turn
// all five aside and he is all but broken.

import type { World } from "./world";
import { Level } from "../world/level";
import { approach } from "../core/actor";
import { Boss } from "./boss";
import { MOD } from "./loadout";

export const ASN = {
  postureMax: 130,
  parry: 8,
  perfect: 12,
  bonus2: 6,
  bonus4: 16,
  regenDelay: 3,
  regen: 2,
  lead: [0.85, 0.7],     // telegraph per phase
  rushIn: 0.1,
  cut: 0.09,              // the blade is live this long (generous: it is a parry-only boss)
  gap: 0.06,             // between the two cuts of a pair: a double-click "따닥" (~0.15 s apart)
  rushOut: 0.12,
  hold: 0.32,            // breath on the far wall inside a 4-set
  reach: 50,
  offset: 26,            // stops this far short of the hero
  cling: [0.55, 0.95],
  stun: 3.2,
  // 발악 (desperation): phase 2, posture past despAt
  despAt: 0.55,          // fraction of max posture
  despLead: 1.25,        // a longer, unmistakable tell
  despGap: 0.12,         // cut 0.09 + 0.12 = one cut every 0.21 s ("따다다다닥")
  despCuts: 5,
  despCooldown: 2,       // normal sets in between
  bonus5: 20,
};

export type Surface = -1 | 1 | 0; // left wall, right wall, ceiling

export class Assassin extends Boss {
  surface: Surface = 1;
  setSize = 2;
  setI = 0;          // pair index inside the set (0 or 1)
  cutI = 0;          // cut index inside the pair (0 or 1)
  setParried = 0;
  setLanded = false;
  setsDone = 0;      // the timing rings are drawn boldly for the first few sets
  flurry = false;    // the current set is the 발악 flurry
  despCD = 0;        // sets to go before the flurry may come again
  despSeen = false;
  lockX = 0;
  lockY = 0;
  fromX = 0;
  fromY = 0;
  toX = 0;
  toY = 0;
  roomTop: number;
  floorY: number;

  constructor(level: Level, tx: number, ty: number, group: number, arenaMin: number, arenaMax: number, roomTop: number) {
    super(level, tx, ty, group, arenaMin, arenaMax);
    // a man-sized body (the oni's stats are replaced)
    this.w = 18;
    this.h = 46;
    this.floorY = ty * 16;
    this.y = this.floorY - this.h;
    this.x = tx * 16;
    this.hp = this.hpMax = 0; // posture only
    this.postureMax = ASN.postureMax;
    this.roomTop = roomTop;
    this.dropThrough = true;
  }

  get vulnerable() {
    return ["rushIn", "cut", "rushOut", "stagger", "cling", "aim", "hold"].includes(this.state);
  }

  get open() { return false; }

  /** Where to perch on a surface, body centre. */
  perch(surface: Surface, y?: number) {
    const top = this.roomTop + 34, bottom = this.floorY - 40;
    if (surface === 0) return { x: (this.arenaMin + this.arenaMax) / 2 + (Math.random() - 0.5) * 120, y: this.roomTop + 12 };
    return { x: surface < 0 ? this.arenaMin + 11 : this.arenaMax - 11, y: y ?? top + Math.random() * (bottom - top) };
  }

  /** Out of the ceiling/walls before any physics (perches overlap the tiles). */
  unstick() {
    for (let i = 0; i < 64 && this.collideAt(this.x, this.y); i++) this.y++;
    for (let i = 0; i < 32 && this.collideAt(this.x, this.y); i++) this.x += this.cx < (this.arenaMin + this.arenaMax) / 2 ? 1 : -1;
  }

  /** Seconds until each upcoming cut goes live (for the rhythm rings). */
  upcomingCuts(): number[] {
    const period = ASN.cut + (this.flurry ? ASN.despGap : ASN.gap);
    const total = this.flurry ? ASN.despCuts : 2;
    let base = -1, from = 0;
    if (this.state === "aim" || this.state === "hold") base = this.timer + ASN.rushIn;
    else if (this.state === "rushIn") base = this.timer;
    else if (this.state === "cut") { base = this.timer + (period - ASN.cut); from = this.cutI + 1; }
    else if (this.state === "cutGap") { base = this.timer; from = this.cutI; }
    if (base < 0) return [];
    const out: number[] = [];
    for (let i = from; i < total; i++) out.push(base + (i - from) * period);
    return out;
  }

  placeCentre(x: number, y: number) {
    this.x = Math.round(x - this.w / 2);
    this.y = Math.round(y - this.h / 2);
  }
}

// ------------------------------------------------------------------- AI

export function updateAssassin(w: World, s: Assassin, dt: number) {
  s.hitFlash = Math.max(0, s.hitFlash - dt);
  s.sinceHit += dt;
  s.stateT += dt;
  const p = w.player;
  const c = w.chest();
  const set = (st: Assassin["state"], t: number) => { s.state = st; s.timer = t; s.stateT = 0; s.attackHit = false; };
  const lerpTo = (u: number) => {
    const e = 1 - Math.pow(1 - Math.min(1, u), 3);
    s.placeCentre(s.fromX + (s.toX - s.fromX) * e, s.fromY + (s.toY - s.fromY) * e);
  };
  const phaseK = s.phase === 2 ? 1 : 0;

  if (s.state === "dead") {
    s.deadT += dt;
    s.vx = approach(s.vx, 0, 400 * dt);
    s.physics(dt);
    return;
  }
  if (s.sinceHit > ASN.regenDelay && s.state !== "stagger") s.posture = Math.max(0, s.posture - ASN.regen * dt);
  if (s.meleeGrace > 0) {
    s.meleeGrace--;
    if (s.meleeGrace === 0) { if (!s.setLanded) w.meleeLands(s); s.setLanded = true; }
  }
  s.timer -= dt;

  /** Lock onto the hero's chest and pick the stop point for this pair. */
  const lockPair = () => {
    s.lockX = c.x;
    s.lockY = c.y;
    const fromLeft = s.surface === 0 ? s.cx < c.x : s.surface < 0;
    const dir = fromLeft ? 1 : -1;
    s.fromX = s.cx;
    s.fromY = s.cy;
    s.toX = Math.max(s.arenaMin + 10, Math.min(s.arenaMax - 10, s.lockX - dir * ASN.offset));
    s.toY = Math.min(s.floorY - s.h / 2, s.lockY);
    s.facing = dir;
  };
  const startAim = () => {
    s.setI = 0;
    s.setParried = 0;
    s.setLanded = false;
    s.flurry = s.phase === 2 && s.despCD <= 0 && s.posture >= s.postureMax * ASN.despAt;
    if (s.flurry) {
      s.setSize = ASN.despCuts;
      s.despCD = ASN.despCooldown + 1;
      s.despSeen = true;
      set("aim", ASN.despLead);
      w.ev.perilous(s, "flurry");
      w.ev.assassin(s, "desperate");
      return;
    }
    s.setSize = Math.random() < (s.phase === 2 ? 0.55 : 0.4) ? 4 : 2;
    set("aim", ASN.lead[phaseK]);
    w.ev.assassin(s, "aim");
  };
  /** The flurry: blink to the hero's other side for the next cut. */
  const blink = () => {
    const side = s.cutI % 2 === 0 ? -s.facing : s.facing; // alternate around him
    s.fromX = s.cx; s.fromY = s.cy;
    s.toX = Math.max(s.arenaMin + 10, Math.min(s.arenaMax - 10, c.x + side * ASN.offset));
    s.toY = Math.min(s.floorY - s.h / 2, c.y);
  };

  switch (s.state) {
    case "dormant":
      return;
    case "intro": {
      // perched on the ceiling, a drop to the floor, then up onto a wall
      const T = s.introLong ? [1.9, 3.3] : [0, 0.6];
      if (s.stateT < T[0]) {
        s.surface = 0;
        s.placeCentre((s.arenaMin + s.arenaMax) / 2 + 60, s.roomTop + 12);
      } else if (s.stateT < T[1]) {
        if (s.surface === 0) { s.surface = -1 as Surface; s.vy = 0; s.vx = 0; s.unstick(); w.ev.assassin(s, "drop"); }
        s.physics(dt);
        s.facing = p.cx >= s.cx ? 1 : -1;
      } else {
        if (s.surface !== 1) {
          s.surface = 1;
          s.fromX = s.cx; s.fromY = s.cy;
          const q = s.perch(1, s.floorY - 110);
          s.toX = q.x; s.toY = q.y;
          w.ev.assassin(s, "leap");
        }
        lerpTo((s.stateT - T[1]) / 0.3);
      }
      if (s.timer <= 0) { s.surface = 1; const q = s.perch(1, s.floorY - 110); s.placeCentre(q.x, q.y); set("cling", 0.6); }
      return;
    }
    case "cling":
      s.vx = s.vy = 0;
      s.facing = s.surface === 0 ? (p.cx >= s.cx ? 1 : -1) : (s.surface < 0 ? 1 : -1);
      if (!p.dead && s.timer <= 0) startAim();
      return;
    case "aim":
      // the tell: watch the pips
      if (s.timer <= 0) {
        lockPair();
        s.cutI = 0;
        set("rushIn", ASN.rushIn);
        w.ev.assassin(s, "rush");
      }
      return;
    case "rushIn":
      lerpTo(s.stateT / ASN.rushIn);
      if (s.timer <= 0) { s.placeCentre(s.toX, s.toY); set("cut", ASN.cut); s.forgiven = false; w.ev.enemySwing(s, false); }
      return;
    case "cut":
      if (!s.setLanded) w.enemyStrike(s, false, ASN.reach);
      if (s.timer <= 0 && s.meleeGrace <= 0) {
        if (s.flurry && s.cutI < ASN.despCuts - 1) {
          s.cutI++;
          blink();
          s.timer = ASN.despGap; s.state = "cutGap"; s.stateT = 0;
          w.ev.assassin(s, "blink");
          return;
        }
        if (!s.flurry && s.cutI === 0) { s.cutI = 1; s.timer = ASN.gap; s.state = "cutGap"; s.stateT = 0; return; }
        // pair done: out to the far surface
        const target: Surface = s.surface === 0 ? (s.facing > 0 ? 1 : -1) : (s.surface < 0 ? 1 : -1);
        const ceiling = s.phase === 2 && Math.random() < 0.25;
        s.surface = ceiling ? 0 : target;
        const q = s.perch(s.surface);
        s.fromX = s.cx; s.fromY = s.cy; s.toX = q.x; s.toY = q.y;
        set("rushOut", ASN.rushOut);
      }
      return;
    case "cutGap":
      if (s.stateT <= dt * 1.5) s.forgiven = false;
      if (s.flurry) {
        lerpTo(s.stateT / (ASN.despGap * 0.7));
        s.facing = c.x >= s.cx ? 1 : -1;
      }
      if (s.timer <= 0) {
        if (s.flurry) { s.placeCentre(s.toX, s.toY); s.facing = c.x >= s.cx ? 1 : -1; }
        set("cut", ASN.cut);
        w.ev.enemySwing(s, s.flurry && s.cutI === ASN.despCuts - 1);
      }
      return;
    case "rushOut":
      lerpTo(s.stateT / ASN.rushOut);
      if (s.timer <= 0) {
        s.placeCentre(s.toX, s.toY);
        s.setI++;
        if (!s.flurry && s.setI < s.setSize / 2) { set("hold", ASN.hold); w.ev.assassin(s, "hold"); return; }
        if (s.setI < 90) { s.setsDone++; if (s.despCD > 0) s.despCD--; }
        // the set is over: reward a clean defence
        if (s.setParried >= s.setSize && s.setI < 90) {
          s.posture = Math.min(s.postureMax, s.posture + (s.flurry ? ASN.bonus5 : s.setSize === 4 ? ASN.bonus4 : ASN.bonus2));
          s.sinceHit = 0;
          w.ev.assassin(s, "clean");
          if (s.posture >= s.postureMax) { w.forceBreak(s); s.timer = ASN.stun + 1; return; }
        }
        set("cling", ASN.cling[0] + Math.random() * (ASN.cling[1] - ASN.cling[0]) - phaseK * 0.15);
      }
      return;
    case "hold":
      s.facing = s.surface < 0 ? 1 : -1;
      if (s.timer <= 0) { lockPair(); s.cutI = 0; set("rushIn", ASN.rushIn); w.ev.assassin(s, "rush"); }
      return;
    case "stagger":
      // broken: he drops from wherever he was and lies stunned
      if (s.stateT <= dt * 1.5) s.unstick();
      s.physics(dt);
      s.vx = approach(s.vx, 0, 300 * dt);
      if (s.timer <= 0) {
        s.posture = s.postureMax * 0.3;
        s.surface = Math.random() < 0.5 ? -1 : 1;
        const q = s.perch(s.surface);
        s.fromX = s.cx; s.fromY = s.cy; s.toX = q.x; s.toY = q.y;
        set("rushOut", 0.25);
        s.setI = 99;
        s.setParried = 0;
      }
      return;
    case "kneel":
      if (s.stateT <= dt * 1.5) s.unstick();
      s.physics(dt);
      if (s.timer <= 0) { set("rise", 1.2); w.ev.bossRise(s); }
      return;
    case "rise":
      if (s.timer <= 0) {
        s.phase = 2;
        s.posture = 0;
        s.surface = 1;
        const q = s.perch(1);
        s.fromX = s.cx; s.fromY = s.cy; s.toX = q.x; s.toY = q.y;
        set("rushOut", 0.25);
        s.setI = 99;
        s.setParried = 0;
      }
      return;
    default:
      set("cling", 0.5);
  }
}

/** A cut turned aside: posture only, the set goes on. */
export function assassinClash(w: World, s: Assassin, perfect: boolean, late: boolean) {
  const p = w.player;
  s.attackHit = true;
  s.meleeGrace = 0;
  s.sinceHit = 0;
  s.setParried++;
  s.posture = Math.min(s.postureMax, s.posture + (perfect ? ASN.perfect : ASN.parry) * MOD.posture());
  p.vx = s.facing * 70;
  p.parryHit = true;
  p.parryCooldown = 0;
  p.parryTimer = 0;
  p.grantDash();
  const broke = s.posture >= s.postureMax;
  w.ev.clash({ s, heavy: false, perfect, late, broke, x: (p.cx + s.cx) / 2, y: p.y + 20 });
  if (broke) w.forceBreak(s);
}
