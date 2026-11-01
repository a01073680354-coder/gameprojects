// Combat simulation: player, soldiers, bullets, props and parry resolution.
// Pure logic (no Phaser) so it can be stepped headlessly in tests.

import { REACH, STEP, TUNE, TILE, PROGRESS } from "../config";
import { InputFrame } from "../core/input";
import { approach } from "../core/actor";
import { Level, SOLID, ONEWAY, BREAK, BARRIER, EMPTY, PropDef, Arena } from "../world/level";
import { Player, PW, PH, PlayerEvents } from "../entities/player";
import { Bullet } from "./bullet";
import { Soldier } from "./soldier";
import { Boss, updateBoss, BOSS, inFinale, startFinale, endFinale } from "./boss";
import { Archivist, updateArchivist, archivistHit } from "./archivist";
import { WALLET, MOD, earn } from "./loadout";
import { Assassin, updateAssassin, assassinClash } from "./assassin";
import { Chief, updateChief } from "./chief";
import { Bulwark, updateBulwark, bulwarkBullet, bulwarkAimPoint, bulwarkParried } from "./bulwark";
import { PATTERNS, volleyAngles, BulletKind, BULLET_RADIUS } from "./patterns";

export const LATE_GRACE_FRAMES = 3; // a hit is held this many steps so a slightly late parry still counts

export interface ParryInfo {
  bullet: Bullet;
  perfect: boolean;
  late: boolean;
  assisted: boolean;
  target: Soldier | null;
  dist: number;
  kill: boolean;
  lastOfGroup: boolean;
}

export interface ClashInfo {
  s: Soldier;
  heavy: boolean;
  perfect: boolean;
  late: boolean;
  broke: boolean;
  x: number;
  y: number;
}

let propIds = 1;

export class Prop {
  id = propIds++;
  hp: number;
  broken = false;
  hitFlash = 0;
  wobble = 0;
  dropFrom = 0; // px above its resting place while it falls into a gap
  x: number;
  y: number;
  w: number;
  h: number;
  constructor(public def: PropDef) {
    this.hp = def.kind === "barrel" ? 2 : 1;
    this.w = def.kind === "barrel" ? 16 : 18;
    this.h = def.kind === "barrel" ? 32 : 26;
    this.x = def.x * TILE + (TILE - this.w) / 2;
    this.y = def.y * TILE - this.h;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get solid() { return this.def.kind === "barrel"; }
}

export interface WorldEvents extends PlayerEvents {
  parryStart(): void;
  parryWhiff(): void;
  parry(info: ParryInfo): void;
  shot(s: Soldier, b: Bullet): void;
  alert(s: Soldier): void;
  aimStart(s: Soldier): void;
  aimLock(s: Soldier): void;
  bulletWall(b: Bullet): void;
  soldierHurt(s: Soldier, b: Bullet): void;
  soldierDie(s: Soldier, b: Bullet, lastOfGroup: boolean): void;
  playerHit(fatal: boolean, b: Bullet | null): void;
  dodge(b: Bullet): void;
  heavyBlocked(b: Bullet): void;
  checkpoint(index: number): void;
  pit(fatal: boolean): void;
  stageClear(): void;
  slashStart(combo: number): void;
  meleeHit(s: Soldier, b: Bullet): void;
  guardBlock(s: Soldier, x: number, y: number): void;
  clash(info: ClashInfo): void;
  danger(s: Soldier): void;
  glint(s: Soldier): void;
  postureBreak(s: Soldier): void;
  deathblow(s: Soldier): void;
  ampouleGain(): void;
  kamikazeArm(s: Soldier, quick: boolean): void;
  kamikazeBoom(s: Soldier, hit: boolean, dodged: boolean): void;
  enemySwing(s: Soldier, heavy: boolean): void;
  perilous(s: Soldier, kind: "sweep" | "leap" | "laser" | "flurry" | "flame" | "slam"): void;
  /** STAGE 2's riot machine: vent hit, shield/armor clank, shield shed, ram crash, turn... */
  bulwark?(b: Bulwark, kind: "vent" | "clank" | "armor" | "shed" | "thud" | "crash" | "stopped" | "turned", x: number, y: number): void;
  /** Purple fire catches on the floor (incinerators): it can't be parried. */
  fire?(f: Fire): void;
  bossCharge(s: Soldier, kind: "orbs" | "missiles" | "laser"): void;
  missileCut(b: Bullet): void;
  finale(b: Boss, kind: "start" | "charge" | "warn" | "feint" | "behind" | "last" | "parry" | "win" | "fail", from?: { x: number; y: number }): void;
  bossIntro(b: Boss, long: boolean): void;
  bossSmash(b: Boss): void;
  bossRise(b: Boss): void;
  bossDefeated(b: Boss): void;
  assassin(b: Assassin, kind: "aim" | "drop" | "leap" | "rush" | "hold" | "clean" | "desperate" | "blink"): void;
  archivist(b: Archivist, kind: string): void;
  loadout?(kind: "shield" | "battery"): void;
  shard?(id: string, x: number, y: number): void;
  /** stage 3: a security laser hit or a record fragment read */
  gateZap(x: number, y: number): void;
  record(id: string, x: number, y: number): void;
  propHit(p: Prop, broken: boolean, dx: number, dy: number, byBullet: boolean): void;
  propLand(p: Prop): void;
  arenaStart(a: Arena): void;
  arenaClear(a: Arena): void;
  enterLand(s: Soldier): void;
  teaser(): void;
}

/** A strip of burning floor: warms up (outlined), then burns for `life` s. */
export interface Fire { id: number; x: number; floor: number; w: number; h: number; t: number; warm: number; life: number; owner: number; hit: boolean; }
let fireId = 1;

export class World {
  player: Player;
  fires: Fire[] = [];
  soldiers: Soldier[] = [];
  bullets: Bullet[] = [];
  props: Prop[] = [];
  time = 0;
  checkpoint = -1;
  aimX = 0;
  aimY = 0;
  clearedGroups = new Set<number>();
  brokenProps = new Set<string>(); // survive checkpoint respawns, like cleared encounters
  activeArenas = new Set<number>();
  cleared = false;
  teaserDone = false;
  boss: Boss | null = null;
  /** Recent parry presses (seconds): tells rhythm from mashing. */
  parryPresses: number[] = [];
  bossSeen = false;
  /** stage 3: records already read (they stay read across respawns) */
  recordsTaken = new Set<string>();
  private gateCD: number[] = [];

  constructor(public level: Level, public ev: WorldEvents) {
    this.player = new Player(level, level.spawnX - PW / 2, level.spawnY - PH, ev);
    this.applyLoadout(true);
    this.spawnSoldiers();
    this.spawnProps();
  }

  private propKey(d: PropDef) { return `${d.kind}:${d.x}:${d.y}`; }
  private keyOf(pr: Prop) { return (pr as any).origKey ?? this.propKey(pr.def); }

  spawnProps() {
    for (const d of this.level.props) for (const t of Level.propTiles(d)) this.level.set(t.x, t.y, EMPTY);
    this.props = this.level.props.filter((d) => !this.brokenProps.has(this.propKey(d))).map((d) => new Prop(d));
    for (const p of this.props) for (const t of Level.propTiles(p.def)) this.level.set(t.x, t.y, BREAK);
  }

  spawnSoldiers() {
    this.soldiers = this.level.spawns
      .filter((sp) => !this.clearedGroups.has(sp.group))
      .map((sp) => {
        const s = new Soldier(this.level, sp.kind, sp.x, sp.y, sp.group, sp.facing ?? -1, sp.pattern);
        const hp = this.level.enemyHp[sp.kind];
        if (hp !== undefined) s.hp = hp;
        return s;
      });
    this.boss = null;
    const bd = this.level.boss;
    if (bd && !this.clearedGroups.has(bd.group)) {
      const a = this.level.arenas.find((ar) => ar.group === bd.group);
      const xs = a ? a.walls.map((w) => w.x) : [0, this.level.w];
      const amin = (Math.min(...xs) + 1) * TILE, amax = Math.max(...xs) * TILE;
      if (bd.kind === "assassin") {
        // the shaft's ceiling, found above the middle of the room
        const mid = Math.floor((amin + amax) / 2 / TILE);
        let r = bd.y - 1;
        while (r > 0 && this.level.get(mid, r) !== SOLID) r--;
        this.boss = new Assassin(this.level, bd.x, bd.y, bd.group, amin, amax, (r + 1) * TILE);
      } else if (bd.kind === "archivist") {
        const mid = Math.floor((amin + amax) / 2 / TILE);
        let r = bd.y - 1;
        while (r > 0 && this.level.get(mid, r) !== SOLID) r--;
        this.boss = new Archivist(this.level, bd.x, bd.y, bd.group, amin, amax, (r + 1) * TILE);
      } else if (bd.kind === "chief") {
        this.boss = new Chief(this.level, bd.x, bd.y, bd.group, amin, amax);
      } else if (bd.kind === "bulwark") {
        this.boss = new Bulwark(this.level, bd.x, bd.y, bd.group, amin, amax);
      } else this.boss = new Boss(this.level, bd.x, bd.y, bd.group, amin, amax);
      // the finale perch: on top of the billboard
      this.boss.perchY = this.level.teaser ? this.level.teaser.y * TILE - 4 - this.boss.h : this.boss.y - 200;
      this.soldiers.push(this.boss);
    }
    for (const s of this.soldiers) {
      const a = this.level.arenas.find((ar) => ar.group === s.group);
      if (a?.entrance) s.state = "dormant";
    }
  }

  private setWalls(a: Arena, on: boolean) {
    for (const w of a.walls) for (let y = w.y0; y <= w.y1; y++) this.level.set(w.x, y, on ? BARRIER : EMPTY);
  }

  respawnPoint() {
    const cp = this.level.checkpoints[this.checkpoint];
    if (cp) return { x: cp.x * TILE + TILE / 2, y: cp.y * TILE };
    return { x: this.level.spawnX, y: this.level.spawnY };
  }

  /** Full restart (R key) or respawn at the last checkpoint after death. */
  /** Max health and ampoule capacity from gear (after a shop, at a stage start). */
  applyLoadout(fill = false) {
    const p = this.player;
    p.maxHp = Math.max(1, 5 + MOD.maxHp());
    p.maxAmpoules = Math.max(0, PROGRESS.ampoules + MOD.ampoules());
    p.hp = fill ? p.maxHp : Math.min(p.hp, p.maxHp);
    p.ampoules = fill ? p.maxAmpoules : Math.min(p.ampoules, p.maxAmpoules);
  }

  /** A fight begins: carried consumables come up. */
  private armFight() {
    const p = this.player;
    if (WALLET.shields > 0 && p.shield <= 0) { WALLET.shields--; p.shield = 1; this.ev.loadout?.("shield"); }
    if (WALLET.batteries > 0) { WALLET.batteries--; p.rapidT = 8; p.grantDash(); this.ev.loadout?.("battery"); }
  }

  reset(full = false) {
    if (full) {
      this.checkpoint = -1;
      this.clearedGroups.clear();
      this.brokenProps.clear();
      this.cleared = false;
      this.teaserDone = false;
      this.bossSeen = false;
    }
    for (const a of this.level.arenas) this.setWalls(a, false);
    this.activeArenas.clear();
    const p = this.player;
    const sp = this.respawnPoint();
    p.x = sp.x - PW / 2;
    p.y = sp.y - PH;
    p.vx = p.vy = 0;
    p.state = "normal";
    p.hp = p.maxHp;
    p.dead = false;
    p.invuln = 1;
    p.hurtTimer = 0;
    p.parryTimer = 0;
    p.parryCooldown = 0;
    p.cancelSlash();
    p.dashes = p.maxDashes;
    p.healT = -1;
    p.ampoules = p.maxAmpoules;
    this.bullets = [];
    this.fires = [];
    this.spawnSoldiers();
    this.spawnProps();
  }

  chest() { return { x: this.player.cx, y: this.player.y + 20 }; }

  step(inp: InputFrame) {
    const p = this.player;
    this.time += STEP;
    this.archiveTick();
    this.fireTick();

    this.aimX = inp.aimX;
    this.aimY = inp.aimY;
    if (inp.parryPressed) {
      this.parryPresses.push(this.time);
      while (this.parryPresses.length && this.time - this.parryPresses[0] > 0.35) this.parryPresses.shift();
    }
    if (inp.parryPressed && p.canParry()) {
      const c = this.chest();
      p.startParry(inp.aimX - c.x, inp.aimY - c.y);
      this.ev.parryStart();
      // late parry against a sword that already connected
      for (const s of this.soldiers) {
        if (s.alive && s.meleeGrace > 0 && this.aimToward(s)) {
          s.meleeGrace = 0;
          this.clash(s, s.heavyPending, false, true);
        }
      }
      // late parry: a bullet already touching us is still deflected
      for (const b of this.bullets) {
        if (b.alive && b.owner === "enemy" && b.heldTimer > 0) {
          b.heldTimer = -1;
          this.deflect(b, false, true);
        }
      }
    }

    if (inp.healPressed) p.tryHeal();

    if (inp.slashPressed) {
      const c = this.chest();
      const n = p.trySlash(inp.aimX - c.x, inp.aimY - c.y);
      if (n) this.ev.slashStart(n);
    }

    p.update(inp, STEP);
    if (p.updateParry(STEP)) {
      // a little early against the Assassin: once per cut, no cooldown, so the
      // next click still counts. Mashing (3+ presses in 0.35 s) is not forgiven.
      const b = this.boss;
      if (b && this.assassinImminent() && !b.forgiven && this.parryPresses.length < 3) {
        b.forgiven = true;
        p.parryCooldown = 0;
      }
      this.ev.parryWhiff();
    }
    const follow = p.updateSlash(STEP, () => {
      const c = this.chest();
      return { x: this.aimX - c.x, y: this.aimY - c.y };
    });
    if (follow) this.ev.slashStart(follow);
    if (p.slashActive) {
      for (const s of this.soldiers) {
        if (!this.hittable(s) || p.slashHitIds.has(s.id)) continue;
        if (this.inSlashArc(s.x, s.y, s.w, s.h)) {
          p.slashHitIds.add(s.id);
          this.slashHit(s);
        }
      }
      // missiles can be cut out of the air
      for (const b of this.bullets) {
        if (!b.alive || b.kind !== "missile" || b.owner !== "enemy") continue;
        if (this.inSlashArc(b.x - 5, b.y - 5, 10, 10)) { b.alive = false; this.ev.missileCut(b); }
      }
      for (const pr of this.props) {
        const key = 100000 + pr.id;
        if (pr.broken || p.slashHitIds.has(key)) continue;
        if (this.inSlashArc(pr.x, pr.y, pr.w, pr.h)) {
          p.slashHitIds.add(key);
          this.damageProp(pr, 1, p.slashAimX, p.slashAimY, false);
        }
      }
    }
    this.checkTriggers();

    for (const s of this.soldiers) this.updateSoldier(s, STEP);
    for (const b of this.bullets) this.updateBullet(b, STEP);
    for (const pr of this.props) {
      pr.hitFlash = Math.max(0, pr.hitFlash - STEP);
      pr.wobble *= Math.pow(0.02, STEP);
      if (pr.dropFrom > 0) {
        pr.dropFrom = Math.max(0, pr.dropFrom - 520 * STEP);
        if (pr.dropFrom === 0) { pr.wobble = 0.8; this.ev.propLand(pr); }
      }
    }
    this.bullets = this.bullets.filter((b) => b.alive);
    this.checkArenas();
  }

  hittable(s: Soldier) {
    if (s instanceof Boss) return s.vulnerable;
    return s.state !== "dead" && s.state !== "dormant" && s.state !== "enter";
  }

  // --------------------------------------------------------------- props

  damageProp(pr: Prop, dmg: number, dx: number, dy: number, byBullet: boolean) {
    if (pr.broken) return;
    pr.hp -= dmg;
    pr.hitFlash = 0.08;
    pr.wobble = 1;
    if (pr.hp <= 0) {
      pr.broken = true;
      this.brokenProps.add(this.keyOf(pr));
      for (const t of Level.propTiles(pr.def)) this.level.set(t.x, t.y, EMPTY);
      this.props = this.props.filter((o) => o !== pr);
    }
    this.ev.propHit(pr, pr.broken, dx, dy, byBullet);
    if (pr.broken) this.settleProps();
  }

  /** Barrels stacked on a broken one drop into the gap. */
  private settleProps() {
    let moved = true;
    while (moved) {
      moved = false;
      for (const pr of this.props) {
        if (pr.def.kind !== "barrel") continue;
        const below = pr.def.y; // first row under the barrel
        if (this.level.get(pr.def.x, below) !== EMPTY) continue;
        let fall = 0;
        while (this.level.get(pr.def.x, below + fall) === EMPTY && below + fall < this.level.h) fall++;
        if (fall <= 0 || below + fall >= this.level.h) continue;
        for (const t of Level.propTiles(pr.def)) this.level.set(t.x, t.y, EMPTY);
        // keep the identity used for "broken" bookkeeping stable across restarts
        const key = this.propKey(pr.def);
        pr.def = { ...pr.def, y: pr.def.y + fall };
        (pr as any).origKey = (pr as any).origKey ?? key;
        pr.y += fall * TILE;
        pr.dropFrom += fall * TILE;
        for (const t of Level.propTiles(pr.def)) this.level.set(t.x, t.y, BREAK);
        moved = true;
      }
    }
  }

  private propAtTile(tx: number, ty: number): Prop | undefined {
    return this.props.find((pr) => Level.propTiles(pr.def).some((t) => t.x === tx && t.y === ty));
  }

  // ------------------------------------------------------- arenas & stage

  private checkArenas() {
    const p = this.player;
    for (const a of this.level.arenas) {
      if (this.clearedGroups.has(a.group)) {
        if (this.activeArenas.has(a.group)) {
          this.activeArenas.delete(a.group);
          this.setWalls(a, false);
          this.ev.arenaClear(a);
        }
        continue;
      }
      const far = Math.max(...a.walls.map((w) => w.x)) * TILE;
      if (!this.activeArenas.has(a.group) && !p.dead && p.cx > a.trigger * TILE && p.cx < far) {
        this.activeArenas.add(a.group);
        this.setWalls(a, true);
        this.armFight();
        if (a.boss && this.boss) {
          const long = !this.bossSeen;
          this.bossSeen = true;
          this.boss.state = "intro";
          this.boss.timer = long ? 4.6 : 1.4;
          this.boss.stateT = 0;
          this.boss.introLong = long;
          this.ev.bossIntro(this.boss, long);
          continue;
        }
        let i = 0;
        for (const s of this.soldiers) {
          if (s.group !== a.group || s.state !== "dormant") continue;
          s.state = "enter";
          s.enterT = 0;
          s.enterDelay = 0.55 + i * 0.4;
          s.enterFromY = s.def.flying ? s.anchorY - 220 : s.anchorY - 300;
          s.y = Math.round(s.enterFromY);
          i++;
        }
        this.ev.arenaStart(a);
      }
    }
  }

  private checkTriggers() {
    const p = this.player;
    if (p.dead) return;
    const L = this.level;
    // checkpoints: touching a beacon activates it (only moving forward)
    L.checkpoints.forEach((cp, i) => {
      if (i <= this.checkpoint) return;
      const cx = cp.x * TILE + TILE / 2, cy = cp.y * TILE;
      if (Math.abs(p.cx - cx) < 16 && p.y < cy) { // anywhere in the column above the beacon
        this.checkpoint = i;
        p.ampoules = p.maxAmpoules;
        this.ev.checkpoint(i);
      }
    });
    // falling out of the world: lose a cell, return to the checkpoint
    if (p.y > L.pixelH + 24) {
      p.hp = Math.max(0, p.hp - 1);
      const fatal = p.hp <= 0;
      if (fatal) {
        p.dead = true;
        p.vx = p.vy = 0;
        p.y = L.pixelH + 200;
      } else {
        const sp = this.respawnPoint();
        p.x = sp.x - PW / 2;
        p.y = sp.y - PH;
        p.vx = p.vy = 0;
        p.invuln = 1.2;
        p.state = "normal";
      }
      this.ev.pit(fatal);
    }
    if (L.teaser && !this.teaserDone && p.cx > L.teaser.trigger * TILE) {
      this.teaserDone = true;
      this.ev.teaser();
    }
    // stage goal
    const g = L.goal;
    if (g && !this.cleared && Math.abs(p.cx - (g.x * TILE + TILE / 2)) < 16 && p.bottom > g.y * TILE - 70 && p.y < g.y * TILE) {
      this.cleared = true;
      this.ev.stageClear();
    }
  }

  // ------------------------------------------------------------- soldiers

  private updateEntrance(s: Soldier, dt: number) {
    if (s.enterDelay > 0) { s.enterDelay -= dt; return; }
    s.enterT += dt;
    const dur = s.def.flying ? 0.9 : 0.8;
    const u = Math.min(1, s.enterT / dur);
    const e = 1 - Math.pow(1 - u, 3);
    s.y = Math.round(s.enterFromY + (s.anchorY - s.enterFromY) * e);
    s.x = s.anchorX;
    const p = this.player;
    s.facing = p.cx >= s.cx ? 1 : -1;
    s.aim = s.facing > 0 ? 0.35 : Math.PI - 0.35;
    if (u >= 1) {
      s.y = s.anchorY;
      s.vy = 0;
      s.seen = true;
      if (s.def.melee) { s.state = "guard"; s.timer = 0.6; }
      else { s.state = "alert"; s.timer = 0.4; }
      this.ev.enterLand(s);
    }
  }

  /** Safe to step this way? Floor right ahead, or a short drop (not a pit). */
  floorAhead(s: Soldier, dir: number): boolean {
    const tx = Math.floor((s.cx + dir * (s.w / 2 + 3)) / TILE);
    const ty = Math.floor((s.bottom + 1) / TILE);
    for (let k = 0; k <= 6; k++) {
      const t = this.level.get(tx, ty + k);
      if (t === SOLID || t === 2 /* one-way */ || t === BREAK) return true;
    }
    return false;
  }

  /** Units that fall out of the world are dead (so encounters can still clear). */
  private fellOut(s: Soldier): boolean {
    if (s.state === "dead" || s.def.flying || s.y < this.level.pixelH + 40) return false;
    s.state = "dead";
    s.deadTime = 99;
    s.vx = s.vy = 0;
    if (!this.soldiers.some((o) => o !== s && o.alive && o.group === s.group)) this.clearedGroups.add(s.group);
    const fb = new Bullet(s.cx, s.cy, 0, 1, "player");
    fb.alive = false;
    this.ev.soldierDie(s, fb, !this.soldiers.some((o) => o.alive && o.group === s.group));
    return true;
  }

  private updateSoldier(s: Soldier, dt: number) {
    if (s.state === "dormant") return;
    if (s instanceof Assassin) { updateAssassin(this, s, dt); return; }
    if (s instanceof Archivist) { updateArchivist(this, s, dt); return; }
    if (s instanceof Chief) { updateChief(this, s, dt); return; }
    if (s instanceof Bulwark) { updateBulwark(this, s, dt); return; }
    if (s instanceof Boss) { updateBoss(this, s, dt); return; }
    if (this.fellOut(s)) return;
    if (s.state === "enter") { this.updateEntrance(s, dt); return; }
    if (s.def.melee) { this.updateBlade(s, dt); return; }
    if (s.kind === "kamikaze") { this.updateKamikaze(s, dt); return; }
    if (s.kind === "burner") { this.updateBurner(s, dt); return; }
    s.hitFlash = Math.max(0, s.hitFlash - dt);
    if (s.state === "dead") {
      s.deadTime += dt;
      s.spin += s.spinV * dt;
      s.spinV *= Math.pow(0.1, dt);
      if (s.vy === 0 && Math.abs(s.vx) < 5) s.spinV *= 0.5;
      s.physics(dt);
      return;
    }
    const p = this.player;
    const tx = p.cx, ty = p.y + 20;
    const engaged = s.state !== "patrol" || this.activeArenas.has(s.group);
    const sees = !p.dead && s.canSee(tx, ty, engaged);
    const toPlayer = Math.atan2(ty - s.shoulder().y, tx - s.shoulder().x);
    const faceP = () => { s.facing = tx >= s.cx ? 1 : -1; };
    const turn = (rate: number) => {
      let d = toPlayer - s.aim;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      s.aim += Math.max(-rate * dt, Math.min(rate * dt, d));
      s.facing = Math.cos(s.aim) >= 0 ? 1 : -1;
    };
    const startAim = () => {
      s.state = "aim";
      s.timer = TUNE.telegraph * s.def.telegraphMul;
      s.aimLocked = false;
      s.lostSight = 0;
      this.ev.aimStart(s);
    };

    switch (s.state) {
      case "patrol": {
        if (sees) {
          s.state = "alert";
          s.timer = 0.35;
          s.vx = 0;
          faceP();
          s.seen = true;
          this.ev.alert(s);
          break;
        }
        if (s.pause > 0) {
          s.pause -= dt;
          s.vx = 0;
        } else {
          s.vx = s.patrolDir * s.def.walk;
          if (s.x <= s.patrolMin && s.patrolDir < 0) { s.patrolDir = 1; s.pause = 1 + Math.random(); }
          if (s.x >= s.patrolMax && s.patrolDir > 0) { s.patrolDir = -1; s.pause = 1 + Math.random(); }
          s.facing = s.patrolDir;
        }
        // rifle held low while patrolling
        if (!s.def.flying) s.aim = s.facing > 0 ? 0.35 : Math.PI - 0.35;
        break;
      }
      case "alert":
        s.vx = 0;
        turn(5);
        s.timer -= dt;
        if (s.timer <= 0) startAim();
        break;
      case "aim":
        s.vx = 0;
        s.timer -= dt;
        if (!s.aimLocked) {
          turn(s.def.turnRate);
          if (s.timer <= 0.2) {
            s.aimLocked = true;
            this.ev.aimLock(s);
          }
        }
        if (!sees) {
          s.lostSight += dt;
          if (s.lostSight > 0.5) { s.state = "search"; s.timer = 1.6; }
        } else s.lostSight = 0;
        if (s.state === "aim" && s.timer <= 0) {
          s.state = "fire";
          s.fireT = 0;
          s.volleyI = 0;
        }
        break;
      case "fire": {
        s.vx = 0;
        const pat = PATTERNS[s.pattern];
        while (s.volleyI < pat.volleys.length && pat.volleys[s.volleyI].at <= s.fireT + 1e-6) {
          const vol = pat.volleys[s.volleyI];
          for (const a of volleyAngles(vol, s.volleyI, s.aim)) this.fire(s, a, vol.speed, vol.kind);
          s.volleyI++;
        }
        s.fireT += dt;
        if (s.volleyI >= pat.volleys.length) { s.state = "cooldown"; s.timer = s.def.cooldown; }
        break;
      }
      case "cooldown":
        s.vx = 0;
        s.timer -= dt;
        if (sees) turn(1.5);
        if (s.timer <= 0) {
          if (sees) startAim();
          else { s.state = "search"; s.timer = 1.6; }
        }
        break;
      case "search":
        s.vx = 0;
        s.timer -= dt;
        if (sees) startAim();
        else if (s.timer <= 0) { s.state = "patrol"; s.pause = 0.6; }
        break;
      case "hurt":
        s.vx = approach(s.vx, 0, 600 * dt);
        s.timer -= dt;
        if (s.timer <= 0) startAim();
        break;
    }
    s.physics(dt);
  }

  // ------------------------------------------------------- kamikaze drone

  /** Light the fuse: it latches on, blinks faster and faster, and blows. */
  armKamikaze(s: Soldier, fuse: number) {
    if (s.state === "armed" || s.state === "dead") { if (s.state === "armed") s.fuse = Math.min(s.fuse, fuse); return; }
    s.state = "armed";
    s.fuse = s.fuseMax = fuse;
    this.ev.kamikazeArm(s, fuse < 0.5);
  }

  private updateKamikaze(s: Soldier, dt: number) {
    s.hitFlash = Math.max(0, s.hitFlash - dt);
    if (s.state === "dead") { s.deadTime += dt; return; }
    const p = this.player;
    const c = this.chest();
    const dx = c.x - s.cx, dy = c.y - s.cy;
    const dist = Math.hypot(dx, dy);
    s.t += dt;
    const fly = (bump?: () => void) => {
      s.moveX(s.vx * dt, () => { s.vx = 0; bump?.(); });
      s.moveY(s.vy * dt, () => { s.vy = 0; bump?.(); });
    };
    switch (s.state) {
      case "patrol": {
        const tx = s.anchorX + Math.sin(s.t * 0.9) * 18;
        const ty = s.anchorY + Math.sin(s.t * 2.6) * 3;
        s.vx = (tx - s.x) * 4;
        s.vy = (ty - s.y) * 4;
        fly();
        s.facing = s.vx >= 0 ? 1 : -1;
        const aware = this.activeArenas.has(s.group);
        if (!p.dead && (aware || s.canSee(c.x, c.y, true))) {
          s.state = "alert";
          s.timer = 0.45;
          s.seen = true;
          this.ev.alert(s);
        }
        break;
      }
      case "alert":
        // a shudder while it locks on
        s.timer -= dt;
        s.vx = 0;
        s.vy = 0;
        s.facing = dx >= 0 ? 1 : -1;
        s.aim = Math.atan2(dy, dx);
        if (s.timer <= 0) {
          s.state = "charge";
          s.timer = 1.6;
          s.vx = Math.cos(s.aim) * 120;
          s.vy = Math.sin(s.aim) * 120;
        }
        break;
      case "charge": {
        s.timer -= dt;
        // ram: accelerate along a slowly turning heading
        const want = Math.atan2(dy, dx);
        let d = want - s.aim;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        s.aim += Math.max(-2.4 * dt, Math.min(2.4 * dt, d));
        const sp = Math.min(330, Math.hypot(s.vx, s.vy) + 700 * dt);
        s.vx = Math.cos(s.aim) * sp;
        s.vy = Math.sin(s.aim) * sp;
        s.facing = s.vx >= 0 ? 1 : -1;
        let bumped = false;
        fly(() => { bumped = true; });
        if (bumped || dist < 30 || s.timer <= 0) this.armKamikaze(s, 0.8);
        break;
      }
      case "armed": {
        // latched on: it follows a little faster than you can run
        s.fuse -= dt;
        const k = dist > 4 ? 1 / dist : 0;
        const chase = 215;
        s.vx += (dx * k * chase - s.vx) * Math.min(1, 6 * dt);
        s.vy += (dy * k * chase - s.vy) * Math.min(1, 6 * dt);
        fly();
        if (s.fuse <= 0) this.explodeKamikaze(s);
        break;
      }
    }
  }

  static BLAST = 58;

  private explodeKamikaze(s: Soldier) {
    const R = World.BLAST;
    s.state = "dead";
    s.deadTime = 99;
    s.vx = s.vy = 0;
    const p = this.player;
    const c = this.chest();
    let hit = false, dodged = false;
    if (!p.dead && Math.hypot(c.x - s.cx, c.y - s.cy) < R + 6) {
      if (p.dashIframe > 0) dodged = true;
      else if (p.invuln <= 0) {
        hit = true;
        const fatal = p.hurt(s.cx);
        const fb = new Bullet(c.x, c.y, Math.sign(c.x - s.cx) * 10, 0, "enemy");
        fb.alive = false;
        this.ev.kamikazeBoom(s, true, false);
        this.ev.playerHit(fatal, fb);
      }
    }
    if (!hit) this.ev.kamikazeBoom(s, false, dodged);
    if (dodged) p.grantDash();
    // the blast takes everything near it: chains, soldiers, props
    for (const o of this.soldiers) {
      if (o === s || !this.hittable(o) || o instanceof Boss) continue;
      if (Math.hypot(o.cx - s.cx, o.cy - s.cy) > R + Math.max(o.w, o.h) / 2) continue;
      if (o.kind === "kamikaze") { this.armKamikaze(o, 0.15); continue; }
      const fb = new Bullet(s.cx, s.cy, Math.sign(o.cx - s.cx) * 300, -100, "player");
      fb.alive = false;
      fb.damage = 2;
      this.hitSoldier(o, fb);
    }
    for (const pr of [...this.props]) {
      if (Math.hypot(pr.cx - s.cx, pr.cy - s.cy) < R + 12) this.damageProp(pr, 2, Math.sign(pr.cx - s.cx), -0.3, true);
    }
    if (!this.soldiers.some((o) => o !== s && o.alive && o.group === s.group)) this.clearedGroups.add(s.group);
  }

  // ---------------------------------------------------------- sword duel

  /** The Assassin's cuts, and the first cut of 千斬, are judged generously. */
  lenient(s: Soldier): boolean {
    return s instanceof Assassin || (s instanceof Boss && s.chainI === 0 && (s.state === "chainWind" || s.state === "chainStrike"));
  }

  private aimToward(s: Soldier): boolean {
    // the Assassin flashes in from walls and ceiling: any parry faces him
    if (this.lenient(s)) return true;
    const p = this.player;
    const c = this.chest();
    const vx = s.cx - c.x, vy = s.cy - c.y;
    const d = Math.hypot(vx, vy);
    if (d < 20) return true;
    return (vx * p.aimX + vy * p.aimY) / d >= Math.cos((75 * Math.PI) / 180);
  }

  private inSlashArc(x: number, y: number, w: number, h: number): boolean {
    const p = this.player;
    const c = this.chest();
    const nx = Math.max(x, Math.min(c.x, x + w));
    const ny = Math.max(y, Math.min(c.y, y + h));
    const vx = nx - c.x, vy = ny - c.y;
    const d = Math.hypot(vx, vy);
    if (d > REACH.slash) return false;
    if (d < REACH.slashCore) return true;
    return (vx * p.slashAimX + vy * p.slashAimY) / d >= Math.cos((80 * Math.PI) / 180);
  }

  private slashHit(s: Soldier) {
    const p = this.player;
    const dir = Math.sign(s.cx - p.cx) || p.facing;
    if (s.kind === "kamikaze") {
      // cut down, but it still goes off: knocked away on a short fuse
      s.vx = dir * 280;
      s.vy = -90;
      s.hitFlash = 0.08;
      this.armKamikaze(s, 0.32);
      const fb = this.meleeBullet(s.cx, s.cy, dir, 0);
      this.ev.meleeHit(s, fb);
      this.ev.freeze(0.04);
      return;
    }
    const cx = (p.cx + s.cx) / 2, cy = Math.min(p.y + 20, s.cy);
    if (s instanceof Bulwark && s.shielded) {
      // steel on steel: the shield in front, armour plate everywhere else
      p.vx = -dir * 120;
      this.ev.guardBlock(s, cx, cy);
      this.ev.bulwark?.(s, "armor", cx, cy);
      return;
    }
    if ((s instanceof Assassin || s instanceof Archivist) && s.state !== "stagger") {
      // the blade only glances off him; posture breaks through parries alone
      if (s.state !== "dead") { p.vx = -dir * 110; this.ev.guardBlock(s, cx, cy); }
      return;
    }
    if (s.def.melee && s.state !== "dead") {
      if (s.state === "stagger") {
        this.ev.deathblow(s);
        const fb = this.meleeBullet(cx, cy, dir, 99);
        this.hitSoldier(s, fb);
        return;
      }
      const front = s.facing === -dir;
      const open = s instanceof Boss ? s.open : s.state === "recover" || s.state === "recoil" || s.state === "hurt" || s.state === "patrol";
      if (front && !open) {
        // the blade is in the way
        s.posture = Math.min(s.postureMax, s.posture + (s instanceof Boss ? 8 : 12));
        s.sinceHit = 0;
        s.blocks++;
        if (s.state === "guard" || s.state === "approach" || s.state === "block") { s.state = "block"; s.timer = 0.22; }
        p.vx = -dir * 130;
        this.ev.guardBlock(s, cx, cy);
        if (s.posture >= s.postureMax) this.breakPosture(s);
        return;
      }
    }
    const fb = this.meleeBullet(cx, cy, dir, 1);
    this.hitSoldier(s, fb);
    this.ev.meleeHit(s, fb);
    this.ev.freeze(s.def.armored ? 0.035 : 0.05);
  }

  private meleeBullet(x: number, y: number, dir: number, dmg: number) {
    const p = this.player;
    const b = new Bullet(x, y, (p.slashAimX || dir) * 320, p.slashAimY * 320, "player");
    b.alive = false;
    b.melee = true;
    b.damage = dmg === 1 ? MOD.slash() : dmg;
    return b;
  }

  /** Break the boss's posture even in phase 2 (the finale's reward). */
  forceBreak(s: Boss) {
    s.state = "stagger";
    s.timer = 3.4;
    s.stateT = 0;
    s.meleeGrace = 0;
    s.comboLeft = 0;
    s.posture = s.postureMax;
    this.ev.postureBreak(s);
  }

  private breakPosture(s: Soldier) {
    if (s instanceof Assassin) { this.forceBreak(s); return; }
    // phase 2: he won't simply fall; he goes for the finale first
    if (s instanceof Boss && s.phase === 2 && !s.finaleDone) {
      if (!inFinale(s)) startFinale(this, s);
      return;
    }
    s.state = "stagger";
    s.timer = s instanceof Boss ? 2.8 : 1.9;
    if (s instanceof Boss) { s.stateT = 0; s.meleeGrace = 0; }
    s.comboLeft = 0;
    s.posture = s.postureMax;
    this.ev.postureBreak(s);
  }

  private clash(s: Soldier, heavy: boolean, perfect: boolean, late: boolean) {
    const p = this.player;
    if (s instanceof Assassin) { if (perfect) this.notePerfect(); assassinClash(this, s, perfect, late); return; }
    if (s instanceof Boss) { this.bossClash(s, heavy, perfect, late); return; }
    s.attackHit = true;
    s.meleeGrace = 0;
    s.sinceHit = 0;
    s.posture = Math.min(s.postureMax, s.posture + (heavy ? (perfect ? 85 : 55) : (perfect ? 45 : 30)) * MOD.posture());
    s.vx = -s.facing * (heavy ? 260 : 150);
    p.vx = s.facing * (heavy ? 170 : 90);
    p.parryHit = true;
    p.parryCooldown = 0;
    p.grantDash();
    p.parryTimer = 0; // one click per sword hit
    if (perfect) this.notePerfect();
    const broke = s.posture >= s.postureMax;
    if (broke) {
      s.vx = -s.facing * 90; // stays within reach for the deathblow
      this.breakPosture(s);
    } else { s.state = "recoil"; s.timer = heavy ? 0.55 : 0.35; s.comboLeft = 0; }
    this.ev.clash({ s, heavy, perfect, late, broke, x: (p.cx + s.cx) / 2, y: p.y + 20 });
  }

  /** The boss keeps swinging through a parry: posture fills, the combo goes on. */
  private bossClash(s: Boss, heavy: boolean, perfect: boolean, late: boolean) {
    const p = this.player;
    s.attackHit = true;
    s.meleeGrace = 0;
    s.sinceHit = 0;
    if (s instanceof Bulwark) {
      // the ram turned aside: the machine is shoved back and stalls
      if (!s.shielded) s.posture = Math.min(s.postureMax, s.posture + (perfect ? 60 : 40) * MOD.posture());
      p.vx = s.facing * 200;
      p.parryHit = true;
      p.parryCooldown = 0;
      p.grantDash();
      p.parryTimer = 0;
      if (perfect) this.notePerfect();
      const broke = s.posture >= s.postureMax;
      if (broke) this.breakPosture(s); else bulwarkParried(this, s, perfect);
      this.ev.clash({ s, heavy: true, perfect, late, broke, x: (p.cx + s.cx) / 2, y: p.y + 20 });
      return;
    }
    if (s.state === "chainStrike") {
      // a 千斬 cut turned aside
      s.chainParried = s.chainI + 1;
      p.vx = s.facing * 120;
      s.vx = -s.facing * 60;
      p.parryHit = true;
      p.parryCooldown = 0;
      p.parryTimer = 0;
      p.grantDash();
      if (perfect) this.notePerfect();
      this.ev.clash({ s, heavy: !!s.strong, perfect, late, broke: false, x: (p.cx + s.cx) / 2, y: p.y + 20 });
      this.ev.finale(s, "parry");
      return;
    }
    const amt = heavy ? (perfect ? 70 : 45) : s.strong ? (perfect ? 42 : 28) : (perfect ? 30 : 20);
    s.posture = Math.min(s.postureMax, s.posture + amt * MOD.posture());
    s.vx = -s.facing * (heavy ? 140 : 70);
    p.vx = s.facing * (heavy ? 190 : s.strong ? 140 : 90);
    p.parryHit = true;
    p.parryCooldown = 0;
    p.grantDash();
    p.parryTimer = 0;
    if (perfect) this.notePerfect();
    const broke = s.posture >= s.postureMax;
    if (broke) this.breakPosture(s);
    else if (heavy) { s.state = "recoil"; s.timer = 0.6; s.stateT = 0; }
    this.ev.clash({ s, heavy: heavy || s.strong, perfect, late, broke, x: (p.cx + s.cx) / 2, y: p.y + 20 });
  }

  /** Unparryable boss attacks (low sweep, smash): jump or dash through. */
  bossHazard(s: Boss, x: number, y: number, w: number, h: number) {
    if (s.hazardDone) return;
    const p = this.player;
    if (p.dead) return;
    if (!(x < p.x + p.w - 2 && x + w > p.x + 2 && y < p.y + p.h - 2 && y + h > p.y + 4)) return;
    s.hazardDone = true;
    const fb = new Bullet(p.cx, Math.max(p.y + 20, y + 4), s.facing * 10, 0, "enemy", s.id);
    fb.alive = false;
    fb.melee = true;
    if (p.dashIframe > 0 || p.invuln > 0) { if (p.dashIframe > 0) this.ev.dodge(fb); return; }
    if (p.parryTimer > 0) this.ev.heavyBlocked(fb); // the blade can't stop this one
    const fatal = p.hurt(s.cx);
    this.ev.playerHit(fatal, fb);
  }

  // ------------------------------------------------------ stage 3 security

  /** 0 = off, 1 = about to fire (warning), 2 = live. */
  gateState(i: number): 0 | 1 | 2 {
    const g = this.level.gates[i];
    const ph = (((this.time + g.offset) % g.period) + g.period) % g.period;
    const on = g.duty * g.period;
    if (ph < on) return 2;
    return ph > g.period - 0.4 ? 1 : 0;
  }

  // ------------------------------------------------------ purple fire

  /** The floor (px) under a point: the first solid or one-way top below it. */
  floorBelow(x: number, y: number): number | null {
    const tx = Math.floor(x / TILE);
    for (let ty = Math.max(0, Math.floor(y / TILE)); ty < this.level.h; ty++) {
      const t = this.level.get(tx, ty);
      if (t === SOLID || t === ONEWAY || t === BREAK) return ty * TILE;
    }
    return null;
  }

  /** Set a strip of floor alight: `warm` s of warning outline, then it burns. */
  addFire(x: number, floor: number, w: number, life: number, owner: number, warm = 0.08) {
    const f: Fire = { id: fireId++, x, floor, w, h: 22, t: 0, warm, life, owner, hit: false };
    this.fires.push(f);
    this.ev.fire?.(f);
    return f;
  }

  private fireTick() {
    if (!this.fires.length) return;
    const p = this.player;
    for (const f of this.fires) {
      f.t += STEP;
      if (f.hit || f.t < f.warm || f.t > f.warm + f.life || p.dead) continue;
      // jumped clear, or not in the strip
      if (p.x + p.w - 3 < f.x || p.x + 3 > f.x + f.w) continue;
      if (p.y + p.h < f.floor - f.h + 4 || p.y > f.floor) continue;
      const fb = new Bullet(p.cx, p.y + p.h - 8, Math.sign(p.cx - (f.x + f.w / 2)) * 10 || 10, 0, "enemy", f.owner);
      fb.alive = false;
      fb.melee = true;
      if (p.dashIframe > 0 || p.invuln > 0) { if (p.dashIframe > 0) { f.hit = true; this.ev.dodge(fb); } continue; }
      f.hit = true;
      if (p.parryTimer > 0) this.ev.heavyBlocked(fb); // the blade can't turn fire aside
      const fatal = p.hurt(f.x + f.w / 2);
      this.ev.playerHit(fatal, fb);
    }
    this.fires = this.fires.filter((f) => f.t <= f.warm + f.life);
  }

  /**
   * Incinerator drone: hovers over its post, drifts above the hero, warns
   * (purple 危), then sprays the floor below with fire. Close enough to cut down.
   */
  private updateBurner(s: Soldier, dt: number) {
    s.hitFlash = Math.max(0, s.hitFlash - dt);
    if (s.state === "dead") {
      s.deadTime += dt;
      s.spin += s.spinV * dt;
      s.vy = Math.min(s.vy + 900 * dt, 500);
      s.moveX(s.vx * dt, () => { s.vx = 0; });
      s.moveY(s.vy * dt, () => { s.vy = 0; s.vx *= 0.5; });
      return;
    }
    const p = this.player;
    s.t += dt;
    const aware = this.activeArenas.has(s.group) || s.seen;
    const sees = !p.dead && (aware || s.canSee(p.cx, p.y + 20, true));
    s.timer -= dt;
    const home = s.anchorX, lim = 72;
    let tx = home + Math.sin(s.t * 0.7) * 18;
    if (sees && s.state !== "flame") tx = Math.max(home - lim, Math.min(home + lim, p.cx - s.w / 2));
    const ty = s.anchorY + Math.sin(s.t * 2.2) * 2;
    const follow = s.state === "flameWind" ? 0.6 : 2.4; // it slows to aim
    s.vx = (tx - s.x) * follow;
    s.vy = (ty - s.y) * 4;
    s.moveX(s.vx * dt, () => { s.vx = 0; });
    s.moveY(s.vy * dt, () => { s.vy = 0; });
    s.facing = p.cx >= s.cx ? 1 : -1;
    switch (s.state) {
      case "patrol":
        if (sees) { s.state = "alert"; s.timer = 0.5; s.seen = true; this.ev.alert(s); }
        break;
      case "alert":
      case "cooldown":
      case "hurt":
        if (s.timer <= 0 && sees && Math.abs(p.cx - s.cx) < 120) {
          s.state = "flameWind";
          s.timer = 0.9;
          this.ev.perilous(s, "flame");
        }
        break;
      case "flameWind":
        if (s.timer <= 0) {
          s.state = "flame";
          s.timer = 0.35;
          const floor = this.floorBelow(s.cx, s.bottom + 2);
          if (floor !== null) this.addFire(s.cx - 34, floor, 68, 1.0, s.id);
        }
        break;
      case "flame":
        if (s.timer <= 0) { s.state = "cooldown"; s.timer = s.def.cooldown; }
        break;
    }
  }

  private archiveTick() {
    const p = this.player;
    if (p.dead) return;
    const L = this.level;
    for (let i = 0; i < L.gates.length; i++) {
      this.gateCD[i] = Math.max(0, (this.gateCD[i] ?? 0) - STEP);
      if (this.gateState(i) !== 2 || this.gateCD[i] > 0) continue;
      const g = L.gates[i];
      const x = g.x * TILE + TILE / 2, y0 = g.y0 * TILE, y1 = (g.y1 + 1) * TILE;
      if (!(x - 3 < p.x + p.w - 2 && x + 3 > p.x + 2 && y0 < p.y + p.h - 2 && y1 > p.y + 4)) continue;
      this.gateCD[i] = 0.7;
      const fb = new Bullet(p.cx, p.y + 20, 0, 0, "enemy");
      fb.alive = false;
      fb.melee = true;
      if (p.dashIframe > 0 || p.invuln > 0) { if (p.dashIframe > 0) this.ev.dodge(fb); continue; }
      this.ev.gateZap(x, p.y + 20);
      const fatal = p.hurt(x);
      this.ev.playerHit(fatal, fb);
    }
    const c = this.chest();
    for (const r of L.shards) {
      if (WALLET.shardsTaken.has(r.id)) continue;
      const rx = r.x * TILE + 8, ry = r.y * TILE + 8;
      if (Math.abs(rx - c.x) < 14 && Math.abs(ry - c.y) < 24) { earn(0, 1, r.id); this.ev.shard?.(r.id, rx, ry); }
    }
    for (const r of L.records) {
      if (this.recordsTaken.has(r.id)) continue;
      const rx = r.x * TILE + 8, ry = r.y * TILE + 8;
      if (Math.abs(rx - c.x) < 16 && Math.abs(ry - c.y) < 26) {
        this.recordsTaken.add(r.id);
        this.ev.record(r.id, rx, ry);
      }
    }
  }

  /** Enemy sword is live this step: parry it, dodge it, or take it. */
  enemyStrike(s: Soldier, heavy: boolean, reachOverride?: number) {
    if (s.attackHit) return;
    const p = this.player;
    if (p.dead) return;
    const reach = reachOverride ?? (heavy ? 50 : 44);
    const rx = s.facing > 0 ? s.cx : s.cx - reach;
    const ry = s.y + 4, rw = reach, rh = s.h - 6;
    const over = (pad: number) => rx - pad < p.x + p.w && rx + rw + pad > p.x && ry - pad < p.y + p.h && ry + rh + pad > p.y;
    const asn = this.lenient(s);
    if (p.parryTimer > 0 && over(asn ? REACH.parryPadWide : REACH.parryPad) && this.aimToward(s)) {
      this.clash(s, heavy, p.parryAge <= TUNE.perfectWindow * MOD.perfect(), false);
      return;
    }
    if (!over(0)) return;
    s.attackHit = true;
    if (p.dashIframe > 0 || p.invuln > 0) {
      if (p.dashIframe > 0) {
        const fb = new Bullet(p.cx, p.y + 20, 0, 0, "enemy");
        fb.alive = false;
        this.ev.dodge(fb);
      }
      return;
    }
    // a slightly late click still turns a lenient cut (twice the usual grace)
    s.meleeGrace = asn ? LATE_GRACE_FRAMES * 2 : LATE_GRACE_FRAMES;
    s.heavyPending = heavy;
  }

  /** An Assassin cut is about to land (used to forgive a too-early parry). */
  assassinImminent(): boolean {
    const s = this.boss;
    if (s && !(s instanceof Assassin)) {
      // 千斬's first cut: a slightly early click is forgiven too
      return s.chainI === 0 && ((s.state === "chainWind" && s.timer < 0.22) || (s.state === "chainStrike" && !s.attackHit));
    }
    if (!(s instanceof Assassin)) return false;
    return (s.state === "aim" && s.timer < 0.22) || s.state === "rushIn" || s.state === "cutGap" || (s.state === "hold" && s.timer < 0.22) || (s.state === "cut" && !s.attackHit);
  }

  meleeLands(s: Soldier) {
    const p = this.player;
    if (s instanceof Boss && s.state === "chainStrike") endFinale(this, s, false);
    if (p.dead || p.invuln > 0) return;
    const fatal = p.hurt(s.cx);
    if (s.heavyPending) p.vx *= 1.6;
    const fb = new Bullet(p.cx, p.y + 20, -s.facing * 10, 0, "enemy");
    fb.alive = false;
    fb.melee = true;
    this.ev.playerHit(fatal, fb);
  }

  private updateBlade(s: Soldier, dt: number) {
    s.hitFlash = Math.max(0, s.hitFlash - dt);
    s.sinceHit += dt;
    if (s.state === "dead") {
      s.deadTime += dt;
      s.physics(dt);
      return;
    }
    const p = this.player;
    const dx = p.cx - s.cx;
    const dist = Math.abs(dx);
    const aware = this.activeArenas.has(s.group);
    const engaged = s.state !== "patrol" || aware;
    const sees = !p.dead && (aware || s.canSee(p.cx, p.y + 20, engaged));
    const face = () => { if (Math.abs(dx) > 2) s.facing = dx > 0 ? 1 : -1; };
    const guard = (t?: number) => { s.state = "guard"; s.timer = t ?? 0.45 + Math.random() * 0.7; };
    const quick = (windup: number, hits: number) => {
      face();
      s.state = "windup"; s.timer = windup; s.comboLeft = hits - 1; s.attackHit = false; s.swing = 0;
      this.ev.glint(s);
    };
    const heavy = () => {
      face();
      s.state = "heavyWindup"; s.timer = 0.62; s.attackHit = false;
      this.ev.danger(s);
    };
    if (s.sinceHit > 1.2 && s.state !== "stagger") s.posture = Math.max(0, s.posture - 14 * dt);
    if (s.meleeGrace > 0) {
      s.meleeGrace--;
      if (s.meleeGrace === 0) this.meleeLands(s);
    }
    s.timer -= dt;
    switch (s.state) {
      case "patrol":
        if (sees) { s.state = "approach"; s.seen = true; s.lostSight = 0; face(); this.ev.alert(s); break; }
        if (s.pause > 0) { s.pause -= dt; s.vx = 0; }
        else {
          s.vx = s.patrolDir * s.def.walk;
          if (s.x <= s.patrolMin && s.patrolDir < 0) { s.patrolDir = 1; s.pause = 1 + Math.random(); }
          if (s.x >= s.patrolMax && s.patrolDir > 0) { s.patrolDir = -1; s.pause = 1 + Math.random(); }
          s.facing = s.patrolDir;
        }
        break;
      case "approach":
        face();
        if (!sees) { s.lostSight += dt; if (s.lostSight > 2.5) { s.state = "patrol"; s.vx = 0; } }
        else s.lostSight = 0;
        if (dist > 44) {
          s.vx = this.floorAhead(s, s.facing) ? s.facing * 95 : 0;
          // vault low cover (up to ~5 tiles) that stands between us
          const grounded = s.groundAt(s.x, s.y);
          if (grounded && s.collideAt(s.x + s.facing * 2, s.y)) { s.vy = -600; s.vx = s.facing * 110; }
        } else if (Math.abs(p.cy - s.cy) < 40) { s.vx = 0; guard(0.35); }
        else s.vx = 0; // he's above/below us: wait for him
        break;
      case "guard":
        face();
        s.vx = approach(s.vx, dist < 24 && this.floorAhead(s, -s.facing) ? -s.facing * 70 : 0, 600 * dt);
        if (dist > 72) { s.state = "approach"; break; }
        if (s.blocks >= 2) { s.blocks = 0; quick(0.2, 1); break; } // riposte after being pressed
        if (s.timer <= 0 && !p.dead) {
          if (dist < 84 && Math.random() < (s.def.heavyChance ?? 0.4)) heavy();
          else quick(s.def.windup ?? 0.4, 2);
        }
        break;
      case "block":
        s.vx = approach(s.vx, 0, 900 * dt);
        if (s.timer <= 0) guard(0.3);
        break;
      case "windup":
        s.vx = approach(s.vx, 0, 800 * dt);
        if (s.timer <= 0) {
          s.state = "strike"; s.timer = 0.12; s.attackHit = false;
          s.vx = this.floorAhead(s, s.facing) ? s.facing * 240 : 0; // snap step into the cut
          this.ev.enemySwing(s, false);
        }
        break;
      case "strike":
        s.vx = approach(s.vx, 0, 900 * dt);
        this.enemyStrike(s, false);
        if (s.timer <= 0) {
          if (s.comboLeft > 0) { s.comboLeft--; s.swing++; face(); s.state = "windup"; s.timer = (s.def.windup ?? 0.4) * 0.6; s.attackHit = false; this.ev.glint(s); }
          else { s.state = "recover"; s.timer = 0.45; }
        }
        break;
      case "heavyWindup":
        s.vx = approach(s.vx, -s.facing * 25, 600 * dt);
        if (s.timer <= 0) {
          s.state = "lunge"; s.timer = 0.2; s.attackHit = false;
          s.vx = this.floorAhead(s, s.facing) ? s.facing * 500 : 0;
          this.ev.enemySwing(s, true);
        }
        break;
      case "lunge":
        if (!this.floorAhead(s, s.facing)) s.vx = 0; // never lunge off a roof
        this.enemyStrike(s, true);
        if (s.timer <= 0) { s.state = "recover"; s.timer = 0.75; s.vx = s.facing * 80; }
        break;
      case "recover":
      case "recoil":
      case "hurt":
        s.vx = approach(s.vx, 0, 700 * dt);
        if (s.timer <= 0) guard(0.3);
        break;
      case "stagger":
        s.vx = approach(s.vx, 0, 500 * dt);
        if (s.timer <= 0) { s.posture = s.postureMax * 0.4; guard(0.5); }
        break;
    }
    s.physics(dt);
  }

  /** Boss guns: orbs (parryable) and homing missiles. */
  fireBoss(s: Boss, x: number, y: number, a: number, speed: number, kind: BulletKind) {
    const sp = kind === "missile" ? speed : TUNE.bulletSpeed * speed;
    const b = new Bullet(x, y, Math.cos(a) * sp, Math.sin(a) * sp, "enemy", s.id);
    b.kind = kind;
    b.radius = BULLET_RADIUS[kind];
    this.bullets.push(b);
    this.ev.shot(s, b);
  }

  /** Two drones fly in to back him up when the second phase begins. */
  callAdds(s: Boss) {
    const y = Math.floor((s.bottom - 150) / TILE);
    let i = 0;
    for (const x of [s.arenaMin + 90, s.arenaMax - 90]) {
      const d = new Soldier(this.level, "drone", Math.floor(x / TILE), y, s.group, x < s.cx ? 1 : -1, "orbPair");
      d.state = "enter";
      d.enterT = 0;
      d.enterDelay = 0.3 + i * 0.35;
      d.enterFromY = d.anchorY - 220;
      d.y = Math.round(d.enterFromY);
      this.soldiers.push(d);
      i++;
    }
  }

  private fire(s: Soldier, a: number, speedMul: number, kind: BulletKind) {
    const m = s.muzzle();
    const sp = TUNE.bulletSpeed * speedMul;
    const b = new Bullet(m.x, m.y, Math.cos(a) * sp, Math.sin(a) * sp, "enemy", s.id);
    b.kind = kind;
    b.radius = BULLET_RADIUS[kind];
    if (this.level.get(Math.floor(m.x / TILE), Math.floor(m.y / TILE)) === SOLID) b.alive = false;
    this.bullets.push(b);
    this.ev.shot(s, b);
  }

  // -------------------------------------------------------------- bullets

  private inParryZone(b: Bullet): boolean {
    const p = this.player;
    const c = this.chest();
    const dx = b.x - c.x, dy = b.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d > TUNE.parryRange) return false;
    if (d < REACH.parryCore) return true; // overlapping the body: always parryable
    const cos = (dx * p.aimX + dy * p.aimY) / d;
    return cos >= Math.cos((65 * Math.PI) / 180);
  }

  private hitsRect(b: Bullet, x: number, y: number, w: number, h: number, r = 2) {
    return b.x + r > x && b.x - r < x + w && b.y + r > y && b.y - r < y + h;
  }

  private updateBullet(b: Bullet, dt: number) {
    if (!b.alive) return;
    const p = this.player;
    if (b.heldTimer > 0) {
      b.heldTimer--;
      if (b.heldTimer === 0) {
        b.alive = false;
        if (!p.dead && p.invuln <= 0) {
          const fatal = p.hurt(b.x);
          this.ev.playerHit(fatal, b);
        }
      }
      return;
    }
    b.age += dt;
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 14) b.trail.shift();
    if (b.age > 6) { b.alive = false; return; }

    const n = Math.max(1, Math.ceil((b.speed * dt) / 3));
    for (let i = 0; i < n && b.alive; i++) {
      b.x += (b.vx * dt) / n;
      b.y += (b.vy * dt) / n;
      if (b.x < 0 || b.y < 0 || b.x > this.level.pixelW || b.y > this.level.pixelH) { b.alive = false; break; }
      const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE);
      const tile = this.level.get(tx, ty);
      if (b.kind === "missile" && b.owner === "enemy" && b.age < 1.8 && i === 0) {
        // homing: turn toward the hero's chest at a limited rate
        const c = this.chest();
        const want = Math.atan2(c.y - b.y, c.x - b.x);
        let cur = Math.atan2(b.vy, b.vx);
        let dA = want - cur;
        while (dA > Math.PI) dA -= Math.PI * 2;
        while (dA < -Math.PI) dA += Math.PI * 2;
        cur += Math.max(-2.6 * dt, Math.min(2.6 * dt, dA));
        const sp = Math.min(260, b.speed + 120 * dt);
        b.vx = Math.cos(cur) * sp;
        b.vy = Math.sin(cur) * sp;
      }
      if (b.kind === "missile" && tile === BARRIER) { b.alive = false; this.ev.bulletWall(b); break; }
      if (b.kind === "wave") {
        // shockwaves run along the floor and die at walls and edges
        const under = this.level.get(tx, Math.floor((b.y + 9) / TILE));
        if (tile === BARRIER || tile === SOLID || under === EMPTY || b.age > 2.2) { b.alive = false; this.ev.bulletWall(b); break; }
      }
      if (tile === SOLID) {
        b.alive = false;
        this.ev.bulletWall(b);
        break;
      }
      if (tile === BREAK) {
        // barrels are cover: they stop enemy fire and are smashed by ours
        const pr = this.propAtTile(tx, ty);
        b.alive = false;
        if (pr && b.owner === "player") {
          const sp = b.speed || 1;
          this.damageProp(pr, b.damage, b.vx / sp, b.vy / sp, true);
        } else this.ev.bulletWall(b);
        break;
      }
      if (b.owner === "enemy") {
        if (p.parryTimer > 0 && !p.dead && this.inParryZone(b)) {
          if (b.kind !== "heavy" && b.kind !== "wave" && b.kind !== "missile") {
            this.deflect(b, p.parryAge <= TUNE.perfectWindow * MOD.perfect(), false);
            break;
          } else if (!b.clanked) {
            b.clanked = true; // the blade bounces off: tell the player this one must be dodged
            this.ev.heavyBlocked(b);
          }
        }
        const r = b.radius;
        if (!p.dead && this.hitsRect(b, p.x + 2, p.y + 4, p.w - 4, p.h - 6, r)) {
          if (p.dashIframe > 0 || p.invuln > 0) {
            if (p.dashIframe > 0 && !b.grazed) { b.grazed = true; this.ev.dodge(b); }
            continue;
          }
          if (b.kind === "heavy" || b.kind === "wave" || b.kind === "missile") {
            // unparryable: lands immediately, no late-parry grace
            b.alive = false;
            const fatal = p.hurt(b.x);
            this.ev.playerHit(fatal, b);
            break;
          }
          b.heldTimer = LATE_GRACE_FRAMES;
          break;
        }
      } else {
        for (const pr of this.props) {
          if (pr.solid || pr.broken || b.hitIds.has(100000 + pr.id)) continue;
          if (this.hitsRect(b, pr.x, pr.y, pr.w, pr.h, b.radius)) {
            // signs shatter but do not stop the shot
            b.hitIds.add(100000 + pr.id);
            const sp = b.speed || 1;
            this.damageProp(pr, 1, b.vx / sp, b.vy / sp, true);
          }
        }
        for (const s of this.soldiers) {
          if (!this.hittable(s) || b.hitIds.has(s.id)) continue;
          // the riot machine: a shield in front, a vent behind (it judges its own hits)
          if (s instanceof Bulwark && s.shielded) {
            if (bulwarkBullet(this, s, b)) { b.alive = false; break; }
            continue;
          }
          if (this.hitsRect(b, s.x, s.y + (s.def.flying ? 0 : 4), s.w, s.h - (s.def.flying ? 0 : 4), b.radius + 1)) {
            this.hitSoldier(s, b);
            if (b.pierce > 0) { b.pierce--; b.hitIds.add(s.id); }
            else { b.alive = false; }
            break;
          }
        }
      }
    }
  }

  deflect(b: Bullet, perfect: boolean, late: boolean) {
    const p = this.player;
    let dx = p.aimX, dy = p.aimY;
    // gentle aim assist toward a visible soldier near the aim line
    let best: Soldier | null = null;
    let bestA = (TUNE.assistDeg * Math.PI) / 180;
    for (const s of this.soldiers) {
      if (!this.hittable(s)) continue;
      const tp = s instanceof Bulwark ? bulwarkAimPoint(s) : { x: s.cx, y: s.cy - 4 };
      const vx = tp.x - b.x, vy = tp.y - b.y;
      const d = Math.hypot(vx, vy);
      if (d > 700 || d < 1) continue;
      const a = Math.acos(Math.max(-1, Math.min(1, (vx * dx + vy * dy) / d)));
      if (a < bestA && Soldier.los(this.level, b.x, b.y, tp.x, tp.y)) {
        bestA = a;
        best = s;
      }
    }
    if (best) {
      const tp = best instanceof Bulwark ? bulwarkAimPoint(best) : { x: best.cx, y: best.cy - 4 };
      const vx = tp.x - b.x, vy = tp.y - b.y;
      const d = Math.hypot(vx, vy);
      dx = vx / d;
      dy = vy / d;
    }
    const sp = Math.max(420, b.speed * TUNE.reflectMult) * (perfect ? 1.3 : 1);
    b.owner = "player";
    b.reflected = true;
    b.perfect = perfect;
    b.damage = (perfect ? 2 : 1) * MOD.reflect();
    b.pierce = perfect ? 1 : 0;
    b.vx = dx * sp;
    b.vy = dy * sp;
    b.trail = [];
    p.parryHit = true;
    p.parryCooldown = 0;
    p.grantDash();
    if (perfect) this.notePerfect();
    const pred = this.predict(b);
    this.ev.parry({ bullet: b, perfect, late, assisted: !!best, ...pred });
  }

  /** Perfect parries slowly brew a fresh ampoule. */
  private notePerfect() {
    const p = this.player;
    if (p.ampoules >= p.maxAmpoules) { p.perfectCount = 0; return; }
    p.perfectCount++;
    if (p.perfectCount >= PROGRESS.perfectsPerCharge) {
      p.perfectCount = 0;
      p.ampoules++;
      this.ev.ampouleGain();
    }
  }

  /** Where will this player bullet first land? */
  predict(b: Bullet): { target: Soldier | null; dist: number; kill: boolean; lastOfGroup: boolean } {
    const sp = b.speed || 1;
    const ux = b.vx / sp, uy = b.vy / sp;
    for (let d = 0; d < 900; d += 3) {
      const x = b.x + ux * d, y = b.y + uy * d;
      const t = this.level.get(Math.floor(x / TILE), Math.floor(y / TILE));
      if (t === SOLID || t === BREAK) break;
      for (const s of this.soldiers) {
        if (!this.hittable(s)) continue;
        if (x + 3 > s.x && x - 3 < s.x + s.w && y + 3 > s.y + 4 && y - 3 < s.y + s.h) {
          const kill = !(s instanceof Boss) && s.hp <= b.damage;
          const others = this.soldiers.filter((o) => o !== s && o.alive && o.group === s.group).length;
          return { target: s, dist: d, kill, lastOfGroup: kill && others === 0 };
        }
      }
    }
    return { target: null, dist: 0, kill: false, lastOfGroup: false };
  }

  private bossHit(s: Boss, b: Bullet) {
    if (s instanceof Archivist && b.damage < 99) { if (!b.melee) archivistHit(this, s, b); return; }
    s.hitFlash = 0.07;
    s.sinceHit = 0;
    if (b.damage >= 99) {
      // deathblow: one mark gone
      s.marks--;
      s.meleeGrace = 0;
      s.posture = 0;
      s.stateT = 0;
      if (s.marks > 0) {
        s.state = "kneel";
        s.timer = 2.4;
        s.hp = 0;
        this.bullets = this.bullets.filter((o) => o.owner !== "enemy");
      } else {
        s.state = "dead";
        s.hp = 0;
        s.deadT = 0;
        s.vx = Math.sign(b.vx || 1) * 60;
        this.clearedGroups.add(s.group);
        this.bullets = [];
        // his drones fall with him
        for (const o of this.soldiers) {
          if (o === s || o.group !== s.group || !o.alive) continue;
          o.state = "dead"; o.deadTime = 0; o.vy = -120; o.spinV = 6;
        }
        this.ev.bossDefeated(s);
      }
      return;
    }
    s.hp = Math.max(0, s.hp - b.damage);
    s.posture = Math.min(s.postureMax, s.posture + (b.melee ? 6 : b.perfect ? 34 : 22));
    if (!b.melee) this.ev.soldierHurt(s, b);
    if (s.hp <= 0 || s.posture >= s.postureMax) this.breakPosture(s);
  }

  private hitSoldier(s: Soldier, b: Bullet) {
    if (s instanceof Boss) { this.bossHit(s, b); return; }
    if (s.kind === "kamikaze") {
      // shot: knocked back, short fuse
      s.hitFlash = 0.07;
      s.vx = (Math.sign(b.vx) || 1) * 200;
      s.vy = Math.sign(b.vy) * 100;
      this.armKamikaze(s, 0.25);
      return;
    }
    s.hp -= b.damage;
    s.hitFlash = 0.07;
    const dir = Math.sign(b.vx) || 1;
    if (s.hp <= 0) {
      s.state = "dead";
      if (!this.soldiers.some((o) => o !== s && o.alive && o.group === s.group)) this.clearedGroups.add(s.group);
      s.vx = dir * (b.perfect ? 300 : 220);
      s.vy = -260;
      s.spinV = dir * 7;
      s.deadTime = 0;
      const last = !this.soldiers.some((o) => o.alive && o.group === s.group);
      this.ev.soldierDie(s, b, last);
    } else {
      s.state = "hurt";
      s.timer = 0.45;
      s.vx = dir * 140;
      s.aimLocked = false;
      this.ev.soldierHurt(s, b);
    }
  }
}

export { BARRIER };
