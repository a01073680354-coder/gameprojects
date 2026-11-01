// The Archivist (기록관), stage 3 boss. Once the operations officer who wrote
// Dojin's orders, now an old man wired into the Archive's core, hanging in a
// glass pod at the top of the Vault. He never fights by hand. His security
// does: ceiling turrets, fans of record-orbs, an erasure beam that sweeps the
// floor, laser grids. Only bullets sent back into the pod hurt him (orbs hurt
// most); a slash glances off the glass. Empty the pod and it crashes to the
// floor, open: deathblow. Two marks.
//   phase 1  fan (orbs), sweep (jump the beam), grid (stand in the gap or dash), turrets
//   phase 2  everything faster, a spiral of bullets, recovery drones, and once,
//            low on strength, 전 기록 소거 (Total Erasure): rings of bullets,
//            sweeps both ways, then one amber core orb. Send it home.

import type { World } from "./world";
import { Level } from "../world/level";
import { Boss } from "./boss";
import { Soldier } from "./soldier";
import { TILE } from "../config";
import { Bullet } from "./bullet";
import { MOD } from "./loadout";

export const ARC = {
  hp: 18,
  hangY: 104,          // pod top above the arena roof line (px from the ceiling)
  drift: 150,          // px each way
  fanWind: 0.7, fans: 3, fanGap: 0.5, fanCount: 5, fanSpread: 34, fanSpeed: 0.6,
  sweepWind: 0.9, sweepSpeed: 300, sweepH: 20,
  gridWind: 0.85, gridOn: 0.8, gridN: 5,
  spiralWind: 0.6, spiral: 2.0,
  stun: 4.2,
  eraseAt: 0.45,       // phase 2: Total Erasure once below this share of hp
  coreSpeed: 0.42,
};

export type ArcMove = "fan" | "sweep" | "grid" | "spiral" | "summon";

export class Archivist extends Boss {
  move: ArcMove = "fan";
  homeX = 0;
  homeY = 0;
  driftT = 0;
  sweepX = 0;
  sweepDir = 1;
  sweeps = 0;
  beams: number[] = [];   // grid beam x positions (px)
  gap = 0;                 // the safe beam index
  erased = false;          // Total Erasure used
  eraseT = 0;
  coreFired = false;
  floorY: number;
  roofY: number;
  lastMoves: ArcMove[] = [];
  riseOnly = false;        // rising after an unpunished fall (no phase change)
  turretsAt: { x: number; y: number }[] = [];

  constructor(level: Level, tx: number, ty: number, group: number, arenaMin: number, arenaMax: number, roofY: number) {
    super(level, tx, ty, group, arenaMin, arenaMax);
    this.w = 40;
    this.h = 40;
    this.floorY = ty * TILE;
    this.roofY = roofY;
    this.hp = this.hpMax = ARC.hp;
    this.postureMax = 999;
    this.homeX = (arenaMin + arenaMax) / 2 - this.w / 2;
    this.homeY = roofY + ARC.hangY;
    this.x = this.homeX;
    this.y = this.homeY;
    this.dropThrough = true;
  }

  get vulnerable() {
    return !["dormant", "intro", "kneel", "rise", "dead"].includes(this.state);
  }
  get open() { return false; }

  /** Is a laser beam (sweep or grid) live? (x0, x1 in px) */
  hazardBands(): { x0: number; x1: number; y0: number; y1: number; live: boolean }[] {
    const out: { x0: number; x1: number; y0: number; y1: number; live: boolean }[] = [];
    if (this.state === "laser" || (this.state === "erase" && this.sweepX > 0)) {
      const x = this.sweepX;
      out.push({ x0: x - 6, x1: x + 6, y0: this.floorY - ARC.sweepH, y1: this.floorY, live: true });
    }
    if (this.state === "grid" || this.state === "laserWind") {
      for (let i = 0; i < this.beams.length; i++) if (i !== this.gap) out.push({ x0: this.beams[i] - 3, x1: this.beams[i] + 3, y0: this.roofY, y1: this.floorY, live: this.state === "grid" });
    }
    return out;
  }
}

// ------------------------------------------------------------------- AI

export function updateArchivist(w: World, s: Archivist, dt: number) {
  s.hitFlash = Math.max(0, s.hitFlash - dt);
  s.sinceHit += dt;
  s.stateT += dt;
  s.timer -= dt;
  const p = w.player;
  const set = (st: Archivist["state"], t: number) => { s.state = st; s.timer = t; s.stateT = 0; s.hazardDone = false; s.shots = 0; };
  const quick = s.phase === 2 ? 0.8 : 1;
  const hover = (dt2: number) => {
    s.driftT += dt2;
    const tx = s.homeX + Math.sin(s.driftT * 0.45) * ARC.drift;
    const ty = s.homeY + Math.sin(s.driftT * 1.3) * 6;
    s.x += (tx - s.x) * Math.min(1, dt2 * 2.5);
    s.y += (ty - s.y) * Math.min(1, dt2 * 2.5);
    s.vx = s.vy = 0;
  };
  const muzzle = () => ({ x: s.cx, y: s.bottom - 2 });
  const pick = (): ArcMove => {
    const two = s.phase === 2;
    const pool: [ArcMove, number][] = [["fan", 3], ["sweep", 2.2], ["grid", 1.8]];
    if (two) pool.push(["spiral", 2.2]);
    const alive = w.soldiers.filter((o) => o.kind === "kamikaze" && o.alive && o.group === s.group).length;
    if (two && alive === 0) pool.push(["summon", 1]);
    const last = s.lastMoves[s.lastMoves.length - 1];
    const weights = pool.map(([m, wt]) => [m, m === last ? wt * 0.15 : wt] as [ArcMove, number]);
    let r = Math.random() * weights.reduce((a, [, wt]) => a + wt, 0);
    for (const [m, wt] of weights) { if ((r -= wt) <= 0) return m; }
    return "fan";
  };
  const begin = (m: ArcMove) => {
    s.move = m;
    s.lastMoves.push(m);
    if (s.lastMoves.length > 4) s.lastMoves.shift();
    switch (m) {
      case "fan": set("volley", ARC.fanWind * quick); w.ev.archivist(s, "fan"); break;
      case "sweep":
        s.sweepDir = p.cx < (s.arenaMin + s.arenaMax) / 2 ? -1 : 1; // it comes from his far side toward you... then past
        s.sweepX = s.sweepDir > 0 ? s.arenaMin + 4 : s.arenaMax - 4;
        set("laserWind", ARC.sweepWind * quick);
        s.beams = [];
        w.ev.perilous(s, "laser");
        w.ev.archivist(s, "sweepWind");
        break;
      case "grid": {
        const n = ARC.gridN;
        const span = s.arenaMax - s.arenaMin - 40;
        s.beams = Array.from({ length: n }, (_, i) => s.arenaMin + 20 + (span * (i + 0.5)) / n);
        // the safe gap: never the beam the hero stands in
        const near = s.beams.reduce((bi, x, i) => (Math.abs(x - p.cx) < Math.abs(s.beams[bi] - p.cx) ? i : bi), 0);
        s.gap = (near + 1 + Math.floor(Math.random() * (n - 1))) % n;
        set("laserWind", ARC.gridWind * quick);
        w.ev.perilous(s, "laser");
        w.ev.archivist(s, "gridWind");
        break;
      }
      case "spiral": set("volley", ARC.spiralWind); w.ev.archivist(s, "spiral"); break;
      case "summon": set("recover", 1.0); w.ev.archivist(s, "summon"); summon(w, s); break;
    }
  };

  switch (s.state) {
    case "dormant":
      return;
    case "dead":
      s.deadT += dt;
      s.physics(dt);
      return;
    case "intro":
      // the pod lowers out of the dark on its cables
      s.x = s.homeX;
      s.y = s.homeY - 120 * Math.max(0, 1 - s.stateT / 2.4) ** 2;
      if (s.timer <= 0) { set("hang", 1.2); s.driftT = 0; armTurrets(w, s); }
      return;
    case "hang":
      hover(dt);
      if (s.timer <= 0 && !p.dead) {
        if (s.phase === 2 && !s.erased && s.hp <= s.hpMax * ARC.eraseAt) { startErase(w, s); return; }
        begin(pick());
      }
      return;
    case "volley": {
      hover(dt * 0.4);
      if (s.timer > 0) return;
      const m = muzzle();
      const base = Math.atan2(p.cy - 4 - m.y, p.cx - m.x);
      if (s.move === "fan") {
        const n = ARC.fanCount;
        for (let i = 0; i < n; i++) {
          const a = base + ((ARC.fanSpread * Math.PI) / 180) * (i / (n - 1) - 0.5);
          w.fireBoss(s, m.x, m.y, a, ARC.fanSpeed * (i % 2 ? 1 : 0.82) * (s.phase === 2 ? 1.12 : 1), "orb");
        }
        s.shots++;
        if (s.shots >= ARC.fans) set("recover", 0.7 * quick);
        else s.timer = ARC.fanGap * quick;
      } else {
        // spiral: three arms turning, normal bullets, parryable
        const t = s.stateT;
        for (let k = 0; k < 3; k++) w.fireBoss(s, m.x, m.y, t * 2.6 + (k * Math.PI * 2) / 3, 0.62, "normal");
        s.timer = 0.12;
        if (t > ARC.spiralWind + ARC.spiral) set("recover", 0.8);
      }
      return;
    }
    case "laserWind":
      hover(dt * 0.3);
      if (s.timer <= 0) {
        set(s.move === "grid" ? "grid" : "laser", s.move === "grid" ? ARC.gridOn : 9);
        w.ev.archivist(s, s.move === "grid" ? "gridOn" : "sweepOn");
      }
      return;
    case "laser": {
      hover(dt * 0.3);
      s.sweepX += s.sweepDir * ARC.sweepSpeed * (s.phase === 2 ? 1.15 : 1) * dt;
      w.bossHazard(s, s.sweepX - 6, s.floorY - ARC.sweepH, 12, ARC.sweepH);
      if (s.sweepX < s.arenaMin || s.sweepX > s.arenaMax) { s.sweepX = 0; set("recover", 0.6 * quick); }
      return;
    }
    case "grid": {
      hover(dt * 0.3);
      for (let i = 0; i < s.beams.length; i++) if (i !== s.gap) w.bossHazard(s, s.beams[i] - 3, s.roofY, 6, s.floorY - s.roofY);
      if (s.timer <= 0) { s.beams = []; set("recover", 0.6 * quick); }
      return;
    }
    case "erase":
      updateErase(w, s, dt, hover);
      return;
    case "recover":
      hover(dt);
      if (s.timer <= 0) set("hang", (s.phase === 2 ? 0.45 : 0.75) + Math.random() * 0.3);
      return;
    case "stagger": {
      // the pod falls and lies open on the floor
      if (s.stateT <= dt * 1.5) { s.vy = 0; s.beams = []; s.sweepX = 0; }
      s.vy = Math.min(600, s.vy + 1400 * dt);
      s.y = Math.min(s.floorY - s.h, s.y + s.vy * dt);
      if (s.y >= s.floorY - s.h && s.vy > 200) { w.ev.archivist(s, "crash"); s.vy = 0; }
      if (s.timer <= 0) {
        // not finished: the cables haul him back up
        s.hp = Math.ceil(s.hpMax * 0.35);
        set("rise", 1.4);
        s.riseOnly = true;
      }
      return;
    }
    case "kneel":
      s.vy = Math.min(600, s.vy + 1400 * dt);
      s.y = Math.min(s.floorY - s.h, s.y + s.vy * dt);
      if (s.timer <= 0) { set("rise", 1.8); w.ev.bossRise(s); }
      return;
    case "rise": {
      const u = Math.min(1, s.stateT / 1.2);
      s.x += (s.homeX - s.x) * Math.min(1, dt * 3);
      s.y = s.floorY - s.h + (s.homeY - (s.floorY - s.h)) * (1 - (1 - u) ** 3);
      if (s.timer <= 0) {
        if (!s.riseOnly) {
          s.phase = 2;
          s.hp = s.hpMax;
          armTurrets(w, s);
        }
        s.riseOnly = false;
        set("hang", 0.8);
      }
      return;
    }
    default:
      set("hang", 0.6);
  }
}

/** Ceiling turrets come on line (and back on line in phase 2). */
function armTurrets(w: World, s: Archivist) {
  const pos = s.phase === 2
    ? [s.arenaMin + 40, s.arenaMin + 150, s.arenaMax - 150, s.arenaMax - 40]
    : [s.arenaMin + 60, s.arenaMax - 60];
  // the old guns are swapped for new ones
  w.soldiers = w.soldiers.filter((o) => !(o.kind === "turret" && o.group === s.group));
  for (const x of pos) {
    const t = new Soldier(w.level, "turret", Math.floor(x / TILE), Math.floor(s.roofY / TILE), s.group, -1);
    t.state = "alert";
    t.timer = 0.6 + Math.random() * 0.6;
    t.seen = true;
    w.soldiers.push(t);
  }
  w.ev.archivist(s, "turrets");
}

function summon(w: World, s: Archivist) {
  for (const x of [s.cx - 60, s.cx + 60]) {
    const k = new Soldier(w.level, "kamikaze", Math.floor(x / TILE), Math.floor((s.bottom + 20) / TILE), s.group, -1);
    k.seen = true;
    w.soldiers.push(k);
  }
}

// ------------------------------------------------- 전 기록 소거 / Total Erasure

function startErase(w: World, s: Archivist) {
  s.erased = true;
  s.state = "erase";
  s.stateT = 0;
  s.timer = 99;
  s.eraseT = 0;
  s.shots = 0;
  s.coreFired = false;
  s.sweepX = 0;
  s.hazardDone = false;
  w.ev.perilous(s, "laser");
  w.ev.archivist(s, "erase");
}

function updateErase(w: World, s: Archivist, dt: number, hover: (d: number) => void) {
  const p = w.player;
  s.eraseT += dt;
  const t = s.eraseT;
  // rise to the centre of the vault and hold
  s.x += (s.homeX - s.x) * Math.min(1, dt * 2);
  s.y += (s.homeY - 10 - s.y) * Math.min(1, dt * 2);
  void hover;
  const m = { x: s.cx, y: s.bottom - 2 };
  // 1.2 - 4.4 s: three rings, each with a gap toward the hero's back
  if (t > 1.2 && t < 4.4) {
    const ring = Math.floor((t - 1.2) / 1.05);
    if (ring >= s.shots && ring < 3) {
      s.shots = ring + 1;
      const n = 18;
      const off = ring * 0.17;
      for (let i = 0; i < n; i++) w.fireBoss(s, m.x, m.y, off + (i / n) * Math.PI * 2, 0.5, "normal");
      w.ev.archivist(s, "ring");
    }
  }
  // 4.6 s: an erasure sweep from wall to wall (and back in 6.4)
  if (t > 4.6 && t < 6.2) {
    if (s.sweepX === 0) { s.sweepDir = 1; s.sweepX = s.arenaMin + 4; s.hazardDone = false; w.ev.archivist(s, "sweepOn"); }
    s.sweepX += ARC.sweepSpeed * 1.25 * dt;
    w.bossHazard(s, s.sweepX - 6, s.floorY - ARC.sweepH, 12, ARC.sweepH);
    if (s.sweepX > s.arenaMax) s.sweepX = -1;
  }
  if (t > 6.4 && t < 8.0) {
    if (s.sweepX <= 0 && s.sweepDir > 0) { s.sweepDir = -1; s.sweepX = s.arenaMax - 4; s.hazardDone = false; w.ev.archivist(s, "sweepOn"); }
    if (s.sweepX > 0) {
      s.sweepX -= ARC.sweepSpeed * 1.25 * dt;
      w.bossHazard(s, s.sweepX - 6, s.floorY - ARC.sweepH, 12, ARC.sweepH);
      if (s.sweepX < s.arenaMin) s.sweepX = 0;
    }
  }
  // 8.3 s: the core orb. Reflect it into the pod.
  if (t > 8.3 && !s.coreFired) {
    s.coreFired = true;
    const a = Math.atan2(p.cy - 4 - m.y, p.cx - m.x);
    w.fireBoss(s, m.x, m.y, a, ARC.coreSpeed, "orb");
    const core = w.bullets[w.bullets.length - 1] as Bullet & { core?: boolean };
    core.core = true;
    core.radius = 8;
    w.ev.archivist(s, "core");
  }
  if (t > 11) { s.sweepX = 0; s.state = "recover"; s.timer = 0.8; s.stateT = 0; }
}

/** A bullet sent back into the pod. */
export function archivistHit(w: World, s: Archivist, b: Bullet) {
  if (s.state === "stagger" || s.state === "kneel" || s.state === "rise") return;
  const core = (b as Bullet & { core?: boolean }).core;
  const dmg = core ? 8 : (b.kind === "orb" ? 2 : 1) * (b.perfect ? 1.5 : 1) * MOD.reflect();
  s.hp = Math.max(0, s.hp - dmg);
  s.hitFlash = 0.08;
  s.sinceHit = 0;
  w.ev.archivist(s, core ? "coreHit" : "hit");
  if (s.hp <= 0) {
    s.state = "stagger";
    s.timer = ARC.stun;
    s.stateT = 0;
    s.vy = 0;
    s.beams = [];
    s.sweepX = 0;
    // his guns go quiet while he is down
    w.bullets = w.bullets.filter((o) => o.owner !== "enemy");
    w.ev.postureBreak(s);
  }
}
