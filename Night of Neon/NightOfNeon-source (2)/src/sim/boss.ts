// 홍귀 / Crimson Oni: the stage-1 boss. A sword duelist with two lives
// (deathblow marks). Phase 1 is pure swordplay:
//   combo   glint, cut, glint, cut, a long trembling hold, then a cleave
//   iai     red "!" stance, then a dash cut across the arena (parry it)
//   sweep   purple 危: a low cut that cannot be parried (jump it)
//   leap    purple 危: he jumps at you; the landing sends shockwaves both ways
// Being pressed (blocked slashes) earns a fast riposte.
// Phase 2 (the mask cracked) unfolds twin shoulder guns:
//   orbs     two fans of slow orbs: parry them back into him (big posture)
//   missiles three homing missiles: unparryable, cut them down or dash
//   laser    purple 危: a beam sweeps the floor on his side (jump it)
//   and two support drones join once, when he rises.
// Finale 千斬: in phase 2, breaking him (or wounding him badly) makes him leap
// onto the billboard and gather himself; then five iai cuts flash in from
// in front of the hero, each announced by "!": parry all five, in one steady
// rhythm, and he is open for the last deathblow. A hit, or a dodge, breaks the
// chain and the fight goes on.
// Pure logic, stepped by World.

import { TUNE } from "../config";
import { Soldier } from "./soldier";
import type { World } from "./world";
import { Level } from "../world/level";
import { approach } from "../core/actor";
import { Bullet } from "./bullet";

export type BossMove = "combo" | "iai" | "sweep" | "leap" | "orbs" | "missiles" | "laser";
const MOVES: BossMove[] = ["combo", "iai", "sweep", "leap", "orbs", "missiles", "laser"];

export const BOSS = {
  hp: 12,
  postureMax: 160,
  // timings (seconds), phase 2 scales windups by `quick`
  comboWind: [0.5, 0.3],
  delayHold: 0.62,
  strike: 0.13,
  strike3: 0.15,
  comboRecover: 0.85,
  iaiWind: 0.72,
  lunge: 0.26,
  lungeSpeed: 620,
  iaiRecover: 0.9,
  sweepWind: [1.0, 0.85], // per phase; the live values are TUNE.oniSweepTell1/2 (Tab menu)
  sweep: 0.18,
  sweepRecover: 0.75,
  leapWind: 0.4,
  leapFlight: 0.72,
  smashRecover: 1.0,
  waveSpeed: 290,
  stagger: 2.8,
  kneel: 2.4,
  rise: 1.5,
  quick: 0.85,
  reach: 64,
  heavyReach: 72,
  sweepReach: 76,
  sweepHeight: 22,
  smashHalf: 44,
  podWind: 0.55,
  orbFans: 2,
  orbGap: 0.38,
  orbCount: 5,
  orbSpread: 26,
  orbSpeed: 0.62,
  missileWind: 0.5,
  missiles: 3,
  missileGap: 0.16,
  missileSpeed: 150,
  laserWind: 0.85,
  laser: 0.4,
  laserLow: 20, // beam band: from this many px above the floor...
  laserHigh: 8, // ...down to this many
  finaleUp: 0.75,
  finaleCharge: 2.0,
  finaleCooldown: 9,
  chainStrike: 0.12,
  chainGap: 0.14,
  chainReach: 60,
  chainDist: 46,
};

/**
 * The 千斬 chain: five plain cuts, one steady beat. The first gives a little
 * extra time to find the rhythm; the last is the heavy one.
 * (feint / behind are kept as switches for later stages, unused here.)
 */
export const CHAIN: { lead: number; feint?: boolean; behind?: boolean; last?: boolean }[] = [
  { lead: 0.65 },
  { lead: 0.55 },
  { lead: 0.55 },
  { lead: 0.55 },
  { lead: 0.55, last: true },
];

/** Where the shoulder guns fire from (world px). */
export function podMuzzle(s: Soldier) {
  return { x: s.cx - s.facing * 10, y: s.bottom - 96 };
}

export class Boss extends Soldier {
  phase = 1;
  marks = 2;
  hpMax = BOSS.hp;
  hit = 0;          // strike index inside the combo (0, 1, 2)
  strong = false;   // the current strike is the heavy third / a riposte
  pending: BossMove | null = null;
  want = 70;        // approach distance for the pending move
  history: BossMove[] = [];
  stateT = 0;       // seconds in the current state (animation)
  glinted = false;
  forgiven = false;  // one early parry forgiven (Assassin cuts, 千斬's first cut)
  leapTX = 0;
  arenaMin: number;
  arenaMax: number;
  hazardDone = false;
  deadT = 0;
  introLong = false;
  shots = 0;        // volleys/missiles fired in the current gun move
  addsCalled = false;
  // finale
  finaleDone = false;
  finaleCD = 0;
  chainI = 0;
  chainParried = 0;
  chainSide = 1;
  perchX = 0;
  perchY = 0;
  upFrom = { x: 0, y: 0 };

  constructor(level: Level, tx: number, ty: number, group: number, arenaMin: number, arenaMax: number) {
    super(level, "boss", tx, ty, group, -1);
    this.hp = this.hpMax;
    this.postureMax = BOSS.postureMax;
    this.arenaMin = arenaMin;
    this.arenaMax = arenaMax;
    this.state = "dormant";
    this.dropThrough = true; // ledges are the hero's refuge; he never stands on them
  }

  /** Can the hero's sword or bullets touch him right now? */
  get vulnerable() {
    return !["dormant", "intro", "kneel", "rise", "dead", "finaleUp", "finaleCharge", "chainWind", "chainStrike"].includes(this.state);
  }

  /** Slashes land instead of being blocked (from the front). */
  get open() {
    return ["recover", "recoil", "hurt", "backstep"].includes(this.state);
  }
}

// ------------------------------------------------------------------- AI

export function updateBoss(w: World, s: Boss, dt: number) {
  s.hitFlash = Math.max(0, s.hitFlash - dt);
  s.sinceHit += dt;
  s.stateT += dt;
  const p = w.player;
  const dx = p.cx - s.cx;
  const dist = Math.abs(dx);
  const k = s.phase === 2 ? BOSS.quick : 1;
  const set = (st: Soldier["state"], t: number) => {
    s.state = st;
    s.timer = t;
    s.stateT = 0;
    s.attackHit = false;
    s.hazardDone = false;
    s.glinted = false;
  };
  const face = () => { if (Math.abs(dx) > 2) s.facing = dx > 0 ? 1 : -1; };
  const step = (v: number) => (w.floorAhead(s, s.facing) ? s.facing * v : 0);

  if (s.state === "dead") {
    s.deadT += dt;
    s.vx = approach(s.vx, 0, 400 * dt);
    s.physics(dt);
    return;
  }

  s.finaleCD = Math.max(0, s.finaleCD - dt);
  // posture recovers when he isn't pressed; slower as he is wounded
  const busy = s.state === "stagger" || s.state === "kneel" || s.state === "rise" || inFinale(s);
  if (s.sinceHit > 1.5 && !busy) s.posture = Math.max(0, s.posture - (4 + 14 * (s.hp / s.hpMax)) * dt);
  if (s.meleeGrace > 0) {
    s.meleeGrace--;
    if (s.meleeGrace === 0) w.meleeLands(s);
  }
  s.timer -= dt;

  const startCombo = (riposte = false) => {
    face();
    s.hit = riposte ? 2 : 0;
    s.strong = riposte;
    set("windup", riposte ? 0.22 : BOSS.comboWind[0] * k);
    w.ev.glint(s);
  };
  const startIai = (wind = BOSS.iaiWind) => {
    face();
    set("heavyWindup", wind * k);
    w.ev.danger(s);
  };
  const startSweep = () => {
    face();
    set("sweepWindup", s.phase === 2 ? TUNE.oniSweepTell2 : TUNE.oniSweepTell1);
    w.ev.perilous(s, "sweep");
  };
  const startLeap = () => {
    face();
    set("leapWindup", BOSS.leapWind * k);
    w.ev.perilous(s, "leap");
  };
  const begin = (m: BossMove) => {
    s.pending = null;
    if (m === "combo") startCombo();
    else if (m === "iai") {
      if (dist < 70) { face(); set("backstep", 0.3); s.vx = -s.facing * 300; s.vy = -240; }
      else startIai();
    } else if (m === "sweep") startSweep();
    else if (m === "leap") startLeap();
    else startGuns(m);
  };
  const startGuns = (m: "orbs" | "missiles" | "laser") => {
    face();
    s.shots = 0;
    if (m === "orbs") { set("volley", BOSS.podWind * k); w.ev.bossCharge(s, "orbs"); }
    else if (m === "missiles") { set("missile", BOSS.missileWind * k); w.ev.bossCharge(s, "missiles"); }
    else { set("laserWind", BOSS.laserWind * k); w.ev.perilous(s, "laser"); }
  };
  const choose = () => {
    // badly wounded in phase 2: the finale
    if (s.phase === 2 && !s.finaleDone && s.finaleCD <= 0 && s.hp <= s.hpMax * 0.34) { startFinale(w, s); return; }
    // on a ledge out of reach: come down on him from above (or shoot him off it)
    const elevated = p.bottom < s.bottom - 40;
    const two = s.phase === 2;
    const z = { orbs: 0, missiles: 0, laser: 0 };
    const wt: Record<BossMove, number> = elevated
      ? { combo: 0, iai: 0, sweep: 0, leap: 1, ...(two ? { orbs: 1, missiles: 1, laser: 0 } : z) }
      : dist > 170
      ? { combo: 1, iai: 4, sweep: 0, leap: 4, ...(two ? { orbs: 3.5, missiles: 3, laser: 2 } : z) }
      : dist > 90 ? { combo: 3, iai: 3, sweep: 2, leap: 1.5, ...(two ? { orbs: 2.5, missiles: 1.5, laser: 1.5 } : z) }
      : { combo: 5, iai: 1.2, sweep: 3, leap: 1, ...(two ? { orbs: 1, missiles: 0.6, laser: 1.2 } : z) };
    const h = s.history;
    const last = h[h.length - 1];
    if (!elevated) {
      if (last) wt[last] *= 0.35;
      if (last && h[h.length - 2] === last) wt[last] = 0;
    }
    let total = 0;
    for (const m in wt) total += wt[m as BossMove];
    let r = Math.random() * total;
    let m: BossMove = "combo";
    for (const key of MOVES) {
      r -= wt[key];
      if (r <= 0) { m = key; break; }
    }
    h.push(m);
    if (h.length > 6) h.shift();
    // close in first for the short-range moves
    if (m === "combo" && dist > 84) { s.pending = m; s.want = 66; set("approach", 2); return; }
    if (m === "sweep" && dist > 100) { s.pending = m; s.want = 80; set("approach", 2); return; }
    begin(m);
  };

  switch (s.state) {
    case "dormant":
      return;
    case "intro":
      s.vx = 0;
      face();
      if (s.timer <= 0) set("guard", 0.7);
      break;
    case "guard": {
      face();
      // keep a duelist's distance
      const wantV = dist < 44 && w.floorAhead(s, -s.facing) ? -s.facing * 60 : dist > 130 ? s.facing * 55 : 0;
      s.vx = approach(s.vx, wantV, 500 * dt);
      if (p.dead) break;
      if (s.blocks >= 3) { s.blocks = 0; startCombo(true); break; }
      if (s.timer <= 0) choose();
      break;
    }
    case "approach":
      face();
      s.vx = step(110);
      if (dist <= s.want || s.timer <= 0) {
        s.vx = 0;
        const m = s.pending ?? "combo";
        if (s.timer <= 0 && dist > s.want + 30) begin(Math.random() < 0.5 ? "iai" : "leap");
        else begin(m);
      }
      break;
    case "block":
      s.vx = approach(s.vx, 0, 900 * dt);
      if (s.timer <= 0) set("guard", 0.25);
      break;

    // ---------------------------------------------------------- combo
    case "windup":
      s.vx = approach(s.vx, 0, 800 * dt);
      if (s.timer <= 0) {
        set("strike", BOSS.strike);
        s.vx = step(s.strong ? 280 : 240);
        w.ev.enemySwing(s, false);
      }
      break;
    case "delay":
      // the long, trembling hold before the third cut: patience is the answer
      s.vx = approach(s.vx, 0, 800 * dt);
      if (!s.glinted && s.timer < 0.16) { s.glinted = true; w.ev.glint(s); }
      if (s.timer <= 0) {
        set("strike", BOSS.strike3);
        s.vx = step(300);
        w.ev.enemySwing(s, true);
      }
      break;
    case "strike":
      s.vx = approach(s.vx, 0, 900 * dt);
      w.enemyStrike(s, false, BOSS.reach);
      if (s.timer <= 0) {
        if (s.strong || s.hit >= 2) {
          // phase 2: the cleave can flow straight into an iai dash
          if (s.phase === 2 && !s.strong && Math.random() < 0.4) { s.strong = false; startIai(0.5); break; }
          s.strong = false;
          set("recover", s.hit >= 2 ? BOSS.comboRecover : 0.6);
        } else {
          s.hit++;
          face();
          if (s.hit === 1) { set("windup", BOSS.comboWind[1] * k); w.ev.glint(s); }
          else { s.strong = true; set("delay", BOSS.delayHold * (s.phase === 2 ? 1.15 : 1)); }
        }
      }
      break;

    // ------------------------------------------------------------ iai
    case "backstep":
      if (s.vy === 0 && s.stateT > 0.12) s.vx = approach(s.vx, 0, 1600 * dt);
      if (s.timer <= 0) startIai(0.6);
      break;
    case "heavyWindup":
      s.vx = approach(s.vx, -s.facing * 20, 600 * dt);
      if (s.timer <= 0) {
        set("lunge", BOSS.lunge);
        // the dash covers the gap: it ends a sword's length past where you stand
        const reachV = (Math.abs(p.cx - s.cx) + 20) / BOSS.lunge;
        s.vx = step(Math.max(420, Math.min(BOSS.lungeSpeed * 1.4, reachV)));
        w.ev.enemySwing(s, true);
      }
      break;
    case "lunge":
      if (!w.floorAhead(s, s.facing)) s.vx = 0;
      w.enemyStrike(s, true, BOSS.heavyReach);
      if (s.timer <= 0) { set("recover", BOSS.iaiRecover); s.vx = s.facing * 70; }
      break;

    // ---------------------------------------------------------- sweep
    case "sweepWindup":
      s.vx = approach(s.vx, 0, 800 * dt);
      if (s.timer <= 0) {
        set("sweep", BOSS.sweep);
        s.vx = step(300);
        w.ev.enemySwing(s, true);
      }
      break;
    case "sweep": {
      s.vx = approach(s.vx, 0, 1000 * dt);
      const x0 = s.facing > 0 ? s.cx - 10 : s.cx - BOSS.sweepReach;
      w.bossHazard(s, x0, s.bottom - BOSS.sweepHeight, BOSS.sweepReach + 10, BOSS.sweepHeight);
      if (s.timer <= 0) set("recover", BOSS.sweepRecover);
      break;
    }

    // ----------------------------------------------------------- leap
    case "leapWindup":
      s.vx = approach(s.vx, 0, 800 * dt);
      if (s.timer <= 0) {
        const lead = p.cx + p.vx * 0.25;
        s.leapTX = Math.max(s.arenaMin + 24, Math.min(s.arenaMax - 24, lead));
        const T = BOSS.leapFlight;
        set("air", 2);
        s.vy = -(1600 * T) / 2;
        s.vx = (s.leapTX - s.cx) / T;
        w.ev.enemySwing(s, false);
      }
      break;
    case "air":
      // the falling cut: unparryable, like the landing
      if (s.vy > 0 && s.stateT > 0.2) w.bossHazard(s, s.cx - 26, s.bottom - 30, 52, 44);
      if (s.stateT > 0.15 && s.vy === 0) {
        s.hazardDone = false;
        set("smash", 0.32);
        s.vx = 0;
        w.bossHazard(s, s.cx - BOSS.smashHalf, s.bottom - 64, BOSS.smashHalf * 2, 64);
        for (const dir of [-1, 1]) {
          const b = new Bullet(s.cx + dir * 20, s.bottom - 7, dir * BOSS.waveSpeed, 0, "enemy", s.id);
          b.kind = "wave";
          b.radius = 7;
          w.bullets.push(b);
        }
        w.ev.bossSmash(s);
      } else if (s.timer <= 0) set("recover", 0.5);
      break;
    case "smash":
      if (s.timer <= 0) set("recover", BOSS.smashRecover);
      break;

    // ----------------------------------------------------- shoulder guns
    case "volley": {
      // charge, then fans of parryable orbs aimed at the hero
      s.vx = approach(s.vx, 0, 800 * dt);
      face();
      if (s.timer <= 0) {
        const m = podMuzzle(s);
        const base = Math.atan2(p.cy - 6 - m.y, p.cx - m.x);
        const n = BOSS.orbCount;
        for (let i = 0; i < n; i++) {
          const a = base + ((BOSS.orbSpread * Math.PI) / 180) * (i / (n - 1) - 0.5) * (s.shots % 2 ? -1 : 1);
          // alternate speeds: the fan lands in two beats, parry each
          w.fireBoss(s, m.x, m.y, a, BOSS.orbSpeed * (i % 2 ? 1 : 0.8), "orb");
        }
        s.shots++;
        if (s.shots >= BOSS.orbFans) set("recover", 0.55);
        else s.timer = BOSS.orbGap;
      }
      break;
    }
    case "missile": {
      s.vx = approach(s.vx, 0, 800 * dt);
      if (s.timer <= 0) {
        const m = podMuzzle(s);
        // launched upward, they turn and hunt
        const a = -Math.PI / 2 + s.facing * (0.35 + s.shots * 0.3);
        w.fireBoss(s, m.x, m.y, a, BOSS.missileSpeed, "missile");
        s.shots++;
        if (s.shots >= BOSS.missiles) set("recover", 0.7);
        else s.timer = BOSS.missileGap;
      }
      break;
    }
    case "laserWind":
      s.vx = approach(s.vx, 0, 800 * dt);
      if (s.timer <= 0) { set("laser", BOSS.laser); w.ev.bossCharge(s, "laser"); }
      break;
    case "laser": {
      const x0 = s.facing > 0 ? s.cx : s.arenaMin;
      const x1 = s.facing > 0 ? s.arenaMax : s.cx;
      w.bossHazard(s, x0, s.bottom - BOSS.laserLow, x1 - x0, BOSS.laserLow - BOSS.laserHigh);
      if (s.timer <= 0) set("recover", 0.7);
      break;
    }

    // ---------------------------------------------------------- finale
    case "finaleUp": {
      // a great leap onto the billboard
      const u = Math.min(1, s.stateT / BOSS.finaleUp);
      const e = u * u * (3 - 2 * u);
      s.x = Math.round(s.upFrom.x + (s.perchX - s.upFrom.x) * e);
      s.y = Math.round(s.upFrom.y + (s.perchY - s.upFrom.y) * e - Math.sin(u * Math.PI) * 60);
      s.vx = s.vy = 0;
      if (u >= 1) { set("finaleCharge", BOSS.finaleCharge); w.ev.finale(s, "charge"); }
      return;
    }
    case "finaleCharge":
      s.vx = s.vy = 0;
      face();
      if (s.timer <= 0) { s.chainI = 0; s.chainParried = 0; s.forgiven = false; chainNext(w, s); }
      return;
    case "chainWind": {
      s.vx = 0;
      const c = CHAIN[s.chainI];
      if (c.feint && !s.glinted && s.stateT > 0.42) { s.glinted = true; w.ev.glint(s); } // the false tell
      if (s.timer <= 0) {
        set("chainStrike", BOSS.chainStrike);
        s.strong = !!c.last;
        s.vx = s.facing * 160;
        w.ev.enemySwing(s, true);
      }
      break;
    }
    case "chainStrike":
      s.vx = approach(s.vx, 0, 1200 * dt);
      w.enemyStrike(s, false, BOSS.chainReach);
      if (s.timer <= 0 && s.meleeGrace <= 0) {
        const parried = s.chainParried > s.chainI;
        if (!parried) { endFinale(w, s, false); break; }
        if (CHAIN[s.chainI].last) {
          // all five turned aside: he is wide open
          s.finaleDone = true;
          s.strong = false;
          w.ev.finale(s, "win");
          w.forceBreak(s);
          break;
        }
        s.chainI++;
        set("chainGap", BOSS.chainGap);
      }
      break;
    case "chainGap":
      s.vx = approach(s.vx, 0, 1200 * dt);
      if (s.timer <= 0) chainNext(w, s);
      break;

    // ------------------------------------------------- being on the back foot
    case "recover":
    case "recoil":
    case "hurt":
      s.vx = approach(s.vx, 0, 700 * dt);
      if (s.timer <= 0) set("guard", 0.35 + Math.random() * 0.35);
      break;
    case "stagger":
      s.vx = approach(s.vx, 0, 500 * dt);
      if (s.timer <= 0) {
        s.posture = s.postureMax * 0.5;
        if (s.hp <= 0) s.hp = 3;
        set("guard", 0.4);
      }
      break;
    case "kneel":
      s.vx = approach(s.vx, 0, 600 * dt);
      if (s.timer <= 0) {
        set("rise", BOSS.rise);
        w.ev.bossRise(s);
      }
      break;
    case "rise":
      s.vx = 0;
      if (s.timer <= 0) {
        s.phase = 2;
        s.hp = s.hpMax;
        s.posture = 0;
        s.history = [];
        set("guard", 0.5);
        if (!s.addsCalled) { s.addsCalled = true; w.callAdds(s); }
      }
      break;
  }
  s.physics(dt);
}

// --------------------------------------------------------------- finale

export function inFinale(s: Boss) {
  return s.state === "finaleUp" || s.state === "finaleCharge" || s.state === "chainWind" || s.state === "chainStrike" || s.state === "chainGap";
}

export function startFinale(w: World, s: Boss) {
  s.state = "finaleUp";
  s.timer = BOSS.finaleUp;
  s.stateT = 0;
  s.attackHit = false;
  s.meleeGrace = 0;
  s.upFrom = { x: s.x, y: s.y };
  s.perchX = Math.round((s.arenaMin + s.arenaMax) / 2 - s.w / 2);
  s.posture = 0;
  w.bullets = w.bullets.filter((b) => b.owner !== "enemy");
  w.ev.finale(s, "start");
}

/** Flash in beside the hero (or behind him) for the next cut. */
function chainNext(w: World, s: Boss) {
  const p = w.player;
  const c = CHAIN[s.chainI];
  const front = p.facing || 1;
  const side = c.behind ? -front : front;
  const from = { x: s.cx, y: s.cy };
  const floor = s.anchorY;
  let x = p.cx + side * BOSS.chainDist - s.w / 2;
  x = Math.max(s.arenaMin + 2, Math.min(s.arenaMax - s.w - 2, x));
  s.x = Math.round(x);
  s.y = floor;
  s.vx = s.vy = 0;
  s.chainSide = side;
  s.facing = p.cx >= s.cx ? 1 : -1;
  s.state = "chainWind";
  s.timer = c.lead;
  s.stateT = 0;
  s.attackHit = false;
  s.glinted = false;
  s.meleeGrace = 0;
  w.ev.finale(s, c.behind ? "behind" : c.feint ? "feint" : c.last ? "last" : "warn", from);
  w.ev.danger(s);
}

/** The chain broke: he drops back into the fight, to try again later. */
export function endFinale(w: World, s: Boss, _won: boolean) {
  s.state = "recover";
  s.timer = 0.9;
  s.stateT = 0;
  s.strong = false;
  s.finaleCD = BOSS.finaleCooldown;
  s.posture = s.postureMax * 0.3;
  if (s.hp <= 0) s.hp = 3;
  w.ev.finale(s, "fail");
}
