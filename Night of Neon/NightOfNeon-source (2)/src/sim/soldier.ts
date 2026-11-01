import { Actor } from "../core/actor";
import { Level, SOLID } from "../world/level";
import { TILE } from "../config";

export type SoldierKind = "rifle" | "burst" | "heavy" | "drone" | "blade" | "boss" | "kamikaze" | "turret" | "collector" | "burner";
export type SState = "patrol" | "alert" | "aim" | "fire" | "cooldown" | "search" | "hurt" | "dead"
  // sword fighter states
  | "approach" | "guard" | "windup" | "strike" | "recover" | "heavyWindup" | "lunge" | "recoil" | "stagger" | "block"
  // staged arrival (rappel / fly-in)
  | "dormant" | "enter"
  // boss-only
  | "intro" | "delay" | "backstep" | "sweepWindup" | "sweep" | "leapWindup" | "air" | "smash" | "kneel" | "rise"
  | "volley" | "missile" | "laserWind" | "laser"
  | "finaleUp" | "finaleCharge" | "chainWind" | "chainStrike" | "chainGap"
  // kamikaze drone
  | "charge" | "armed"
  // the assassin
  | "cling" | "aim" | "rushIn" | "cut" | "cutGap" | "rushOut" | "hold"
  // the archivist
  | "hang" | "erase" | "grid"
  // the recovery chief, and the incinerator drone
  | "flameWind" | "flame" | "smashWind" | "subdued"
  // the riot machine
  | "bAim" | "bFire" | "ramWind" | "ram" | "slamWind" | "shed" | "turn";

export interface KindDef {
  hp: number;
  pattern: string;
  telegraphMul: number;
  cooldown: number;
  range: number;
  w: number;
  h: number;
  flying: boolean;
  laser: boolean;      // shows an aiming laser while telegraphing
  turnRate: number;    // aim tracking speed (rad/s)
  shoulderDY: number;  // pivot height above the feet (ground units) / centre offset (drones)
  muzzle: number;      // pivot -> muzzle distance
  walk: number;        // patrol speed
  melee?: boolean;     // sword fighter: no gun, guards and duels
  armored?: boolean;   // slashes only chip it
  /** Melee fighters: first windup (s), and how often they use the "!" lunge. */
  windup?: number;
  heavyChance?: number;
}

export const KINDS: Record<SoldierKind, KindDef> = {
  rifle: { hp: 1, pattern: "single", telegraphMul: 1, cooldown: 1.2, range: 300, w: 18, h: 50, flying: false, laser: true, turnRate: 3.4, shoulderDY: -25, muzzle: 37, walk: 38 },
  burst: { hp: 2, pattern: "burst3", telegraphMul: 0.8, cooldown: 1.7, range: 280, w: 18, h: 50, flying: false, laser: true, turnRate: 3.4, shoulderDY: -25, muzzle: 37, walk: 34 },
  heavy: { hp: 3, pattern: "slugFan", telegraphMul: 1.15, cooldown: 2.1, range: 320, w: 24, h: 52, flying: false, laser: true, turnRate: 2.2, shoulderDY: -26, muzzle: 40, walk: 22, armored: true },
  blade: { hp: 3, pattern: "", telegraphMul: 1, cooldown: 0, range: 240, w: 18, h: 50, flying: false, laser: false, turnRate: 0, shoulderDY: -25, muzzle: 0, walk: 40, melee: true },
  boss: { hp: 12, pattern: "", telegraphMul: 1, cooldown: 0, range: 900, w: 30, h: 74, flying: false, laser: false, turnRate: 0, shoulderDY: -40, muzzle: 0, walk: 0, melee: true },
  kamikaze: { hp: 1, pattern: "", telegraphMul: 1, cooldown: 0, range: 210, w: 16, h: 14, flying: true, laser: false, turnRate: 0, shoulderDY: 0, muzzle: 0, walk: 0 },
  // ceiling turret: bolted in place, a laser sight, three-round bursts; send them back
  turret: { hp: 2, pattern: "burst3", telegraphMul: 1.05, cooldown: 1.5, range: 330, w: 18, h: 14, flying: true, laser: true, turnRate: 2.6, shoulderDY: 0, muzzle: 11, walk: 0 },
  // recovery squad (STAGE 1): hazmat suit and a shock baton; slow, readable, two cuts
  collector: { hp: 2, pattern: "", telegraphMul: 1, cooldown: 0, range: 220, w: 18, h: 50, flying: false, laser: false, turnRate: 0, shoulderDY: -25, muzzle: 0, walk: 34, melee: true, windup: 0.55, heavyChance: 0 },
  // incinerator drone: hovers, then rains purple fire on the floor below (unparryable)
  burner: { hp: 2, pattern: "", telegraphMul: 1, cooldown: 2.4, range: 200, w: 24, h: 18, flying: true, laser: false, turnRate: 0, shoulderDY: 0, muzzle: 0, walk: 0 },
  drone: { hp: 2, pattern: "orbPair", telegraphMul: 0.9, cooldown: 1.8, range: 260, w: 22, h: 16, flying: true, laser: false, turnRate: 4, shoulderDY: 0, muzzle: 9, walk: 0 },
};

let nextId = 1;

export class Soldier extends Actor {
  id = nextId++;
  def: KindDef;
  hp: number;
  vx = 0;
  vy = 0;
  facing = 1;
  state: SState = "patrol";
  timer = 0;
  aim = 0; // radians, world space
  aimLocked = false;
  fireT = 0;
  volleyI = 0;
  pattern: string;
  lostSight = 0;
  patrolMin: number;
  patrolMax: number;
  patrolDir = 1;
  pause = 0;
  seen = false;
  deadTime = 0;
  spin = 0;
  spinV = 0;
  hitFlash = 0;
  t = Math.random() * 10;
  anchorX: number;
  anchorY: number;
  // sword fighter
  posture = 0;
  postureMax = 88; // 3 normal clashes, or a perfect "!" parry + one more hit
  comboLeft = 0;
  attackHit = false;
  meleeGrace = 0;
  sinceHit = 9;
  blocks = 0;
  heavyPending = false;
  swing = 0; // counts strikes inside a combo (picks the animation)
  // kamikaze
  fuse = 0;
  fuseMax = 0;
  // staged arrival
  enterT = 0;
  enterDelay = 0;
  enterFromY = 0;

  constructor(level: Level, public kind: SoldierKind, tx: number, ty: number, public group: number, facing = -1, pattern?: string) {
    const def = KINDS[kind];
    super(level, tx * TILE + (TILE - def.w) / 2, def.flying ? ty * TILE + (TILE - def.h) / 2 : ty * TILE - def.h, def.w, def.h);
    this.def = def;
    this.hp = def.hp;
    this.pattern = pattern ?? def.pattern;
    this.facing = facing;
    this.aim = facing > 0 ? 0 : Math.PI;
    this.anchorX = this.x;
    this.anchorY = this.y;
    let lo = tx, hi = tx;
    if (!def.flying) {
      // patrol range: walk until a wall or a ledge, at most 4 tiles each way
      const row = ty;
      const open = (c: number) => level.get(c, row) === SOLID && !level.blocks(c, row - 1) && !level.blocks(c, row - 2);
      while (lo > tx - 4 && open(lo - 1)) lo--;
      while (hi < tx + 4 && open(hi + 1)) hi++;
    }
    this.patrolMin = lo * TILE + 2;
    this.patrolMax = (hi + 1) * TILE - def.w - 2;
    this.pause = 0.5 + Math.random();
  }

  get alive() { return this.state !== "dead"; }
  /** Present in the world and able to act or be hit. */
  get active() { return this.state !== "dead" && this.state !== "dormant"; }

  /** Weapon pivot: shoulder for soldiers, body centre for drones. */
  shoulder() {
    if (this.def.flying) return { x: this.cx, y: this.cy };
    return { x: this.cx - this.facing, y: this.bottom + this.def.shoulderDY };
  }

  muzzle() {
    const s = this.shoulder();
    return { x: s.x + Math.cos(this.aim) * this.def.muzzle, y: s.y + Math.sin(this.aim) * this.def.muzzle };
  }

  eye() {
    if (this.def.flying) return { x: this.cx, y: this.cy };
    return { x: this.cx + 6 * this.facing, y: this.y + 14 };
  }

  static los(level: Level, x0: number, y0: number, x1: number, y1: number): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.ceil(d / 4);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (level.get(Math.floor(x / TILE), Math.floor(y / TILE)) === SOLID) return false;
    }
    return true;
  }

  canSee(px: number, py: number, alerted: boolean): boolean {
    const e = this.eye();
    const dx = px - e.x, dy = py - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.def.range) return false;
    if (!alerted && !this.def.flying && dist > 70) {
      if (Math.sign(dx) !== this.facing) return false;
      if (Math.abs(dy) > Math.abs(dx) * 1.2 + 30) return false;
    }
    return Soldier.los(this.level, e.x, e.y, px, py);
  }

  physics(dt: number) {
    if (this.kind === "turret" && this.state !== "dead") { this.vx = this.vy = 0; return; } // bolted to the ceiling
    if (this.def.flying && this.state !== "dead") {
      // hover around the anchor with a gentle bob; drift while patrolling
      this.t += dt;
      const drift = this.state === "patrol" ? Math.sin(this.t * 0.7) * 22 : 0;
      const tx = this.anchorX + drift;
      const ty = this.anchorY + Math.sin(this.t * 2.4) * 3;
      this.vx = (tx - this.x) * 4;
      this.vy = (ty - this.y) * 4;
      this.moveX(this.vx * dt, () => { this.vx = 0; });
      this.moveY(this.vy * dt, () => { this.vy = 0; });
      return;
    }
    this.vy = Math.min(this.vy + 1600 * dt, 600);
    this.moveX(this.vx * dt, () => { this.vx = 0; });
    this.moveY(this.vy * dt, () => {
      if (this.state === "dead" && this.vy > 120) this.vy *= -0.25;
      else this.vy = 0;
      if (this.state === "dead") this.vx *= 0.6;
    });
  }
}
