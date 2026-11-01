// 차승호 / The Collector chief: the STAGE 1 mini-boss (bible v3, 1-07).
// An ordinary middle-aged squad leader taking orders through his implant.
// Slow, with long tells, and only three moves, so that the fight teaches
// posture, the red "!" and the purple 危 all at once:
//   baton   two shock-baton cuts, each with a glint (parry both)
//   smash   red "!": an overhead blow; parried, it breaks a great deal of posture
//   flame   purple 危: the incinerator sprays the floor in front of him (jump or dash)
// One deathblow mark. The last blow does not kill: the sword cuts the baton
// and the tank's hose, and he goes down on his knees (bible: "죽이지 않는 첫 인살").

import type { World } from "./world";
import { Level } from "../world/level";
import { Boss } from "./boss";
import { approach } from "../core/actor";
import { Soldier } from "./soldier";

export const CHIEF = {
  hp: 9,
  postureMax: 170,  // a perfect duelist breaks him in ~25 s: long enough to learn the three tells
  batonWind: [0.62, 0.42],
  strike: 0.13,
  batonRecover: 0.75,
  smashWind: 0.95,
  smash: 0.16,
  smashRecover: 0.9,
  flameWind: 1.0,
  flame: 0.5,
  flameRecover: 0.85,
  flameReach: 104,   // px of floor set alight in front of him
  flameLife: 1.1,    // s the floor burns
  reach: 58,
  heavyReach: 64,
  stagger: 3.2,
};

type ChiefMove = "baton" | "smash" | "flame";

export class Chief extends Boss {
  disarmed = false;
  moves: ChiefMove[] = [];

  constructor(level: Level, tx: number, ty: number, group: number, arenaMin: number, arenaMax: number) {
    super(level, tx, ty, group, arenaMin, arenaMax);
    // a man-sized body: heavier than his squad, smaller than the oni
    this.w = 22;
    this.h = 52;
    this.y = ty * 16 - this.h;
    this.x = tx * 16;
    this.anchorY = this.y;
    this.marks = 1;
    this.hp = this.hpMax = CHIEF.hp;
    this.postureMax = CHIEF.postureMax;
    this.dropThrough = true;
  }

  get vulnerable() {
    return !["dormant", "intro", "dead"].includes(this.state);
  }
}

export function updateChief(w: World, s: Chief, dt: number) {
  s.hitFlash = Math.max(0, s.hitFlash - dt);
  s.sinceHit += dt;
  s.stateT += dt;
  const p = w.player;
  const dx = p.cx - s.cx;
  const dist = Math.abs(dx);
  const set = (st: Soldier["state"], t: number) => {
    s.state = st; s.timer = t; s.stateT = 0; s.attackHit = false; s.hazardDone = false; s.glinted = false;
  };
  const face = () => { if (Math.abs(dx) > 2) s.facing = dx > 0 ? 1 : -1; };
  const step = (v: number) => (w.floorAhead(s, s.facing) ? s.facing * v : 0);

  if (s.state === "dead") {
    // subdued: on his knees, where he fell
    s.deadT += dt;
    s.vx = approach(s.vx, 0, 900 * dt);
    s.physics(dt);
    return;
  }
  if (s.sinceHit > 1.5 && s.state !== "stagger") s.posture = Math.max(0, s.posture - 10 * dt);
  if (s.meleeGrace > 0) {
    s.meleeGrace--;
    if (s.meleeGrace === 0) w.meleeLands(s);
  }
  s.timer -= dt;

  const baton = (riposte = false) => {
    face();
    s.hit = riposte ? 1 : 0;
    set("windup", riposte ? 0.3 : CHIEF.batonWind[0]);
    w.ev.glint(s);
  };
  const smash = () => { face(); set("smashWind", CHIEF.smashWind); w.ev.danger(s); };
  const flame = () => { face(); set("flameWind", CHIEF.flameWind); w.ev.perilous(s, "flame"); };
  const choose = () => {
    // the same thing never three times running; the flame waits for a little distance
    const wt: Record<ChiefMove, number> = dist > 120
      ? { baton: 1, smash: 1, flame: 4 }
      : dist > 70 ? { baton: 3, smash: 2.5, flame: 2 } : { baton: 4, smash: 2.5, flame: 1.2 };
    const h = s.moves;
    const last = h[h.length - 1];
    if (last) wt[last] *= 0.4;
    if (last && h[h.length - 2] === last) wt[last] = 0;
    let total = 0;
    for (const k in wt) total += wt[k as ChiefMove];
    let r = Math.random() * total;
    let m: ChiefMove = "baton";
    for (const k of ["baton", "smash", "flame"] as ChiefMove[]) { r -= wt[k]; if (r <= 0) { m = k; break; } }
    h.push(m);
    if (h.length > 6) h.shift();
    if ((m === "baton" || m === "smash") && dist > 76) { s.pending = m as any; s.want = 56; set("approach", 2.2); return; }
    if (m === "baton") baton(); else if (m === "smash") smash(); else flame();
  };

  switch (s.state) {
    case "dormant":
      return;
    case "intro":
      s.vx = 0;
      face();
      if (s.timer <= 0) set("guard", 0.9);
      break;
    case "guard": {
      face();
      const wantV = dist < 40 && w.floorAhead(s, -s.facing) ? -s.facing * 50 : dist > 120 ? s.facing * 45 : 0;
      s.vx = approach(s.vx, wantV, 400 * dt);
      if (p.dead) break;
      if (s.blocks >= 3) { s.blocks = 0; baton(true); break; }
      if (s.timer <= 0) choose();
      break;
    }
    case "approach":
      face();
      s.vx = step(80);
      if (dist <= s.want || s.timer <= 0) {
        s.vx = 0;
        if (s.pending === ("smash" as any)) smash(); else baton();
        s.pending = null;
      }
      break;
    case "block":
      s.vx = approach(s.vx, 0, 900 * dt);
      if (s.timer <= 0) set("guard", 0.35);
      break;

    // baton: two cuts
    case "windup":
      s.vx = approach(s.vx, 0, 800 * dt);
      if (s.timer <= 0) { set("strike", CHIEF.strike); s.vx = step(200); s.swing = s.hit; w.ev.enemySwing(s, false); }
      break;
    case "strike":
      s.vx = approach(s.vx, 0, 900 * dt);
      w.enemyStrike(s, false, CHIEF.reach);
      if (s.timer <= 0) {
        if (s.hit >= 1) set("recover", CHIEF.batonRecover);
        else { s.hit = 1; face(); set("windup", CHIEF.batonWind[1]); w.ev.glint(s); }
      }
      break;

    // smash: the red "!"
    case "smashWind":
      s.vx = approach(s.vx, 0, 800 * dt);
      if (s.timer <= 0) { set("smash", CHIEF.smash); s.strong = true; s.vx = step(260); w.ev.enemySwing(s, true); }
      break;
    case "smash":
      s.vx = approach(s.vx, 0, 1100 * dt);
      w.enemyStrike(s, true, CHIEF.heavyReach);
      if (s.timer <= 0) { s.strong = false; set("recover", CHIEF.smashRecover); }
      break;

    // flame: the purple 危
    case "flameWind":
      s.vx = approach(s.vx, 0, 800 * dt);
      if (s.timer <= 0) {
        set("flame", CHIEF.flame);
        const x0 = s.facing > 0 ? s.cx + 4 : s.cx - 4 - CHIEF.flameReach;
        w.addFire(x0, s.bottom, CHIEF.flameReach, CHIEF.flameLife, s.id);
        w.ev.enemySwing(s, true);
      }
      break;
    case "flame":
      s.vx = 0;
      if (s.timer <= 0) set("recover", CHIEF.flameRecover);
      break;

    case "recover":
    case "recoil":
    case "hurt":
      s.vx = approach(s.vx, 0, 700 * dt);
      if (s.timer <= 0) set("guard", 0.45 + Math.random() * 0.4);
      break;
    case "stagger":
      s.vx = approach(s.vx, 0, 500 * dt);
      if (s.timer <= 0) {
        s.posture = s.postureMax * 0.5;
        if (s.hp <= 0) s.hp = 2;
        set("guard", 0.5);
      }
      break;
  }
  s.physics(dt);
}
