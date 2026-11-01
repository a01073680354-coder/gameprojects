import { Actor, approach } from "../core/actor";
import { InputFrame } from "../core/input";
import { TUNE, FEATURES, derivedJump, PROGRESS, HEAL_TIME } from "../config";
import { Level } from "../world/level";

export const PW = 14;
export const PH = 50;

export type PState = "normal" | "dash";

export const SLASH_STARTUP = 0.035;
export const SLASH_ACTIVE = 0.085;
export const SLASH_TOTAL = 0.27;

import { WALLET, MOD, damageTaken } from "../sim/loadout";

export interface PlayerEvents {
  jump(kind: "ground" | "wall" | "super", dir: number): void;
  land(impact: number): void;
  dashStart(dx: number, dy: number): void;
  dashEnd(): void;
  dashRefill(): void;
  wallSlide(side: number): void;
  freeze(sec: number): void;
  heal?(kind: "start" | "done" | "cancel" | "empty"): void;
  /** a hit softened or worsened by gear: shield, grip (absorbed), seal (extra) */
  guard?(kind: "shield" | "grip" | "seal"): void;
}

const UP_CORNER = 5; // px of corner correction when bonking a ceiling edge
const DASH_CORNER = 5; // px of ledge-pop when dashing into a ledge lip
const WALL_JUMP_REACH = 4; // can wall jump this many px away from a wall
const HALF_GRAV_V = 70; // |vy| under which apex hang applies

export class Player extends Actor {
  vx = 0;
  vy = 0;
  facing = 1;
  state: PState = "normal";
  onGround = false;
  wasOnGround = false;

  dashes = 1;
  maxDashes = 1;
  dashTimer = 0;
  dashDirX = 0;
  dashDirY = 0;
  dashCooldown = 0;
  dashRefillCooldown = 0;

  coyoteTimer = 0;
  jumpBufferTimer = 0;
  jumpCutReady = false;
  wallJumpLockTimer = 0;
  wallJumpLockDir = 0;
  dropTimer = 0;

  wallSliding = false;
  wallSide = 0; // -1 wall on left, 1 wall on right
  wallReleaseTimer = 0;

  landTimer = 0;
  lastFallSpeed = 0;

  // combat
  hp = 5;
  maxHp = 5;
  shield = 0;   // hits a one-shot barrier will take
  rapidT = 0;   // high-speed battery: the dash refills at once while this runs
  boostT = 0;   // just parried: the next dash runs longer (capacitor)
  private hadParryHit = false;
  invuln = 0;
  hurtTimer = 0;
  dashIframe = 0;
  dead = false;
  // parry: active window, time since press, whiff penalty, aim direction
  parryTimer = 0;
  parryAge = 99;
  parryCooldown = 0;
  parryHit = false;
  aimX = 1;
  aimY = 0;

  lastIx = 0;
  // melee: time since the cut began (<0 when idle), combo step, queued follow-up
  slashT = -1;
  slashCombo = 0;
  slashQueued = false;
  slashCooldown = 0;
  slashAimX = 1;
  slashAimY = 0;
  slashHitIds = new Set<number>();

  // nano ampoules: a short, interruptible heal
  ampoules = PROGRESS.ampoules;
  maxAmpoules = PROGRESS.ampoules;
  healT = -1;
  perfectCount = 0;

  // visual squash/stretch, eased back to 1 every step
  scaleX = 1;
  scaleY = 1;

  constructor(level: Level, x: number, y: number, public ev: PlayerEvents) {
    super(level, x, y, PW, PH);
  }

  private wallDirWithin(dist: number): number {
    for (let d = 1; d <= dist; d++) {
      if (this.collideAt(this.x + d, this.y)) return 1;
      if (this.collideAt(this.x - d, this.y)) return -1;
    }
    return 0;
  }

  private squash(sx: number, sy: number) {
    const k = TUNE.squash;
    this.scaleX = 1 + (sx - 1) * k;
    this.scaleY = 1 + (sy - 1) * k;
  }

  update(inp: InputFrame, dt: number) {
    const { gravity, jumpSpeed } = derivedJump(TUNE);
    if (this.parryHit && !this.hadParryHit) this.boostT = 1.2;
    this.hadParryHit = this.parryHit;
    this.boostT = Math.max(0, this.boostT - dt);
    if (this.rapidT > 0) {
      this.rapidT -= dt;
      if (this.dashes <= 0 && this.state !== "dash") this.refillDash();
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashIframe = Math.max(0, this.dashIframe - dt);
    if (this.hurtTimer > 0 || this.dead) {
      this.hurtTimer = Math.max(0, this.hurtTimer - dt);
      inp = { ...inp, x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false };
    }
    if (this.healT >= 0) {
      // injecting: shuffle slowly, no jumping or dashing
      this.healT += dt;
      inp = { ...inp, x: inp.x * 0.3, y: 0, jumpPressed: false, dashPressed: false };
      if (this.healT >= HEAL_TIME) {
        this.healT = -1;
        this.ampoules--;
        const strong = WALLET.concentrated > 0;
        if (strong) WALLET.concentrated--;
        this.hp = Math.min(this.maxHp, this.hp + PROGRESS.healAmount + (strong ? 2 : 0));
        this.ev.heal?.("done");
      }
    }

    // ---- timers
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.dashRefillCooldown = Math.max(0, this.dashRefillCooldown - dt);
    this.wallJumpLockTimer = Math.max(0, this.wallJumpLockTimer - dt);
    this.landTimer = Math.max(0, this.landTimer - dt);
    this.dropTimer = Math.max(0, this.dropTimer - dt);
    this.dropThrough = this.dropTimer > 0;
    this.jumpBufferTimer = inp.jumpPressed ? TUNE.jumpBuffer : Math.max(0, this.jumpBufferTimer - dt);

    this.wasOnGround = this.onGround;
    this.onGround = this.vy >= 0 && this.groundAt(this.x, this.y);
    if (this.onGround) {
      this.coyoteTimer = TUNE.coyote;
      if (this.state !== "dash" && this.dashRefillCooldown <= 0) this.refillDash();
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    // ease squash back
    const ease = 1 - Math.pow(0.0005, dt);
    this.scaleX += (1 - this.scaleX) * ease;
    this.scaleY += (1 - this.scaleY) * ease;

    if (this.state === "dash") {
      this.updateDash(inp, dt, jumpSpeed);
      return;
    }

    // ---- dash start
    if (inp.dashPressed && this.dashes > 0 && this.dashCooldown <= 0) {
      this.startDash(inp);
      return;
    }

    this.lastIx = inp.x;
    // ---- horizontal
    let accel = this.onGround ? TUNE.groundAccel : TUNE.groundAccel * TUNE.airMult;
    let decel = this.onGround ? TUNE.groundDecel : TUNE.groundDecel * TUNE.airMult;
    let ix = inp.x;
    if (this.wallJumpLockTimer > 0) {
      // steering back toward the wall we just left is dampened, not blocked
      const t = this.wallJumpLockTimer / Math.max(0.001, TUNE.wallJumpLock);
      if (ix === -this.wallJumpLockDir) accel *= 1 - 0.85 * t;
      if (ix === 0) decel *= 0.15;
    }
    if (this.slashT >= 0) {
      accel *= 0.3;
      ix = this.onGround ? 0 : ix;
    }
    const target = ix * TUNE.runSpeed;
    if (Math.abs(this.vx) > TUNE.runSpeed && Math.sign(this.vx) === ix) {
      // over max speed in the held direction: keep momentum, bleed slowly
      this.vx = approach(this.vx, target, decel * 0.25 * dt);
    } else if (ix !== 0) {
      this.vx = approach(this.vx, target, accel * dt);
    } else {
      this.vx = approach(this.vx, 0, decel * dt);
    }

    // ---- wall slide (Hollow Knight style: cling, slide at constant speed)
    const touch = this.collideAt(this.x + 1, this.y) ? 1 : this.collideAt(this.x - 1, this.y) ? -1 : 0;
    if (!FEATURES.wall) {
      this.wallSliding = false;
    } else if (!this.wallSliding) {
      if (!this.onGround && touch !== 0 && ix === touch && this.vy >= -40) {
        this.wallSliding = true;
        this.wallSide = touch;
        this.wallReleaseTimer = 0;
        this.vy = Math.min(this.vy, TUNE.wallSlide * 0.4);
        this.refillDash();
      }
    } else {
      if (this.onGround || touch !== this.wallSide) {
        this.wallSliding = false;
      } else if (ix === -this.wallSide) {
        this.wallReleaseTimer += dt;
        if (this.wallReleaseTimer >= TUNE.wallRelease) this.wallSliding = false;
      } else {
        this.wallReleaseTimer = 0;
      }
    }

    // ---- gravity
    if (this.wallSliding) {
      this.vy = approach(this.vy, TUNE.wallSlide, gravity * 0.6 * dt);
      this.facing = -this.wallSide;
      if (ix === this.wallSide || ix === 0) this.vx = 0;
      this.ev.wallSlide(this.wallSide);
    } else {
      let g = gravity;
      if (Math.abs(this.vy) < HALF_GRAV_V && inp.jumpHeld) g *= TUNE.apexHang;
      if (this.vy > 0) g *= TUNE.fallMult;
      const maxF = inp.y > 0 ? TUNE.maxFall * 1.35 : TUNE.maxFall;
      this.vy = approach(this.vy, maxF, g * dt);
    }

    // variable jump height: releasing jump while rising cuts speed once
    if (this.jumpCutReady && !inp.jumpHeld && this.vy < 0) {
      this.vy *= TUNE.jumpCut;
      this.jumpCutReady = false;
    }
    if (this.vy >= 0) this.jumpCutReady = false;

    // ---- jumping
    if (this.jumpBufferTimer > 0) {
      if (this.coyoteTimer > 0) {
        if (inp.y > 0 && this.onOneWay()) {
          this.dropTimer = 0.15;
          this.dropThrough = true;
          this.jumpBufferTimer = 0;
          this.coyoteTimer = 0;
          this.vy = 60;
        } else {
          this.jump(jumpSpeed, ix);
        }
      } else if (FEATURES.wall) {
        const wd = this.wallSliding ? this.wallSide : this.wallDirWithin(WALL_JUMP_REACH);
        if (wd !== 0) this.wallJump(jumpSpeed, wd);
      }
    }

    if (ix !== 0 && !this.wallSliding && this.parryAge > 0.22 && this.slashT < 0) this.facing = ix;

    this.moveAndCollide(dt);
  }

  private onOneWay(): boolean {
    return !this.collideAt(this.x, this.y + 1) && this.level.oneWayTopAt(this.x, this.y + this.h, this.w);
  }

  grantDash() { this.refillDash(); }

  private refillDash() {
    if (this.dashes < this.maxDashes) {
      this.dashes = this.maxDashes;
      this.ev.dashRefill();
    }
  }

  private jump(jumpSpeed: number, ix: number) {
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.vy = -jumpSpeed;
    this.vx += ix * 40; // small horizontal boost, as in Celeste
    this.jumpCutReady = true;
    this.onGround = false;
    this.squash(0.72, 1.32);
    this.ev.jump("ground", ix);
  }

  private wallJump(jumpSpeed: number, wallDir: number) {
    this.jumpBufferTimer = 0;
    this.wallSliding = false;
    this.vx = -wallDir * TUNE.wallJumpX;
    this.vy = -jumpSpeed * TUNE.wallJumpY;
    this.jumpCutReady = true;
    this.wallJumpLockTimer = TUNE.wallJumpLock;
    this.wallJumpLockDir = -wallDir;
    this.facing = -wallDir;
    this.squash(0.75, 1.28);
    this.ev.jump("wall", -wallDir);
  }

  private startDash(inp: InputFrame) {
    this.dashes--;
    this.state = "dash";
    this.wallSliding = false;
    this.dashTimer = TUNE.dashTime * (this.boostT > 0 ? MOD.dashBoost() : 1);
    this.boostT = 0;
    let dx = inp.x, dy = inp.y;
    if (dx === 0 && dy === 0) dx = this.facing;
    // a downward dash while standing becomes a horizontal one
    if (this.onGround && dy > 0 && dx !== 0) dy = 0;
    const len = Math.hypot(dx, dy);
    this.dashDirX = dx / len;
    this.dashDirY = dy / len;
    this.vx = this.dashDirX * TUNE.dashSpeed;
    this.vy = this.dashDirY * TUNE.dashSpeed;
    if (dx !== 0) this.facing = Math.sign(dx);
    this.jumpCutReady = false;
    this.dashRefillCooldown = 0.1;
    this.dashIframe = TUNE.dashIframes;
    this.squash(1.35, 0.75);
    this.ev.freeze(TUNE.dashFreeze);
    this.ev.dashStart(this.dashDirX, this.dashDirY);
  }

  private updateDash(inp: InputFrame, dt: number, jumpSpeed: number) {
    this.dashTimer -= dt;
    // dash jump (super): jump out of a ground dash keeps the speed
    if (this.jumpBufferTimer > 0 && this.dashDirY >= 0) {
      if (this.onGround || this.coyoteTimer > 0) {
        this.state = "normal";
        this.jumpBufferTimer = 0;
        this.coyoteTimer = 0;
        this.vy = -jumpSpeed * 0.92;
        this.vx = (this.dashDirX !== 0 ? Math.sign(this.dashDirX) : this.facing) * TUNE.superSpeed;
        this.jumpCutReady = true;
        this.squash(0.7, 1.3);
        this.ev.jump("super", Math.sign(this.vx));
        this.ev.dashEnd();
        this.moveAndCollide(dt);
        return;
      }
      const wd = FEATURES.wall ? this.wallDirWithin(WALL_JUMP_REACH) : 0;
      if (wd !== 0) {
        this.state = "normal";
        this.wallJump(jumpSpeed, wd);
        this.ev.dashEnd();
        this.moveAndCollide(dt);
        return;
      }
    }
    if (this.dashTimer <= 0) {
      this.state = "normal";
      const keep = TUNE.dashEndMult;
      this.vx = this.dashDirX * TUNE.dashSpeed * keep;
      this.vy = this.dashDirY < 0 ? this.dashDirY * TUNE.dashSpeed * keep * 0.75 : this.dashDirY * TUNE.dashSpeed * keep;
      this.dashCooldown = 0.12;
      this.ev.dashEnd();
    }
    this.moveAndCollide(dt);
  }

  private moveAndCollide(dt: number) {
    const prevVy = this.vy;
    this.moveX(this.vx * dt, () => {
      // dash into a ledge lip: pop up over it
      if (this.state === "dash" && this.dashDirY <= 0) {
        const dir = Math.sign(this.vx);
        for (let i = 1; i <= DASH_CORNER; i++) {
          if (!this.collideAt(this.x + dir, this.y - i)) {
            this.y -= i;
            this.x += dir;
            return;
          }
        }
      }
      this.vx = 0;
    });
    this.moveY(this.vy * dt, () => {
      if (this.vy < 0) {
        // bonked a ceiling: slide around a nearby corner instead
        for (let i = 1; i <= UP_CORNER; i++) {
          for (const s of [Math.sign(this.vx) || 1, -(Math.sign(this.vx) || 1)]) {
            if (!this.collideAt(this.x + i * s, this.y - 1)) {
              this.x += i * s;
              this.y -= 1;
              return;
            }
          }
        }
        this.vy = 0;
        this.jumpCutReady = false;
      } else {
        if (prevVy > 120) {
          this.landTimer = prevVy > 380 ? 0.1 : 0.05;
          const k = Math.min(1, prevVy / TUNE.maxFall);
          this.squash(1 + 0.4 * k, 1 - 0.32 * k);
          this.ev.land(prevVy);
        }
        this.vy = 0;
      }
    });
    if (this.state === "dash" && this.dashDirY > 0 && this.groundAt(this.x, this.y)) {
      // diagonal-down dash that hits the floor turns into a slide
      this.vy = 0;
    }
  }

  /** Advance parry timers; returns true on the step a swing whiffs. */
  updateParry(dt: number): boolean {
    this.parryCooldown = Math.max(0, this.parryCooldown - dt);
    this.parryAge += dt;
    if (this.parryTimer > 0) {
      this.parryTimer -= dt;
      if (this.parryTimer <= 0 && !this.parryHit) {
        this.parryCooldown = TUNE.parryWhiff;
        return true;
      }
    }
    return false;
  }

  canParry() {
    // a parry that just connected re-arms at once, so quick strings ("따닥") need one click per hit
    return !this.dead && this.hurtTimer <= 0 && this.healT < 0 && this.parryCooldown <= 0 && (this.parryTimer <= 0 || this.parryHit)
      && !this.slashActive && !(this.slashT >= 0 && this.slashT < SLASH_STARTUP);
  }

  /** R: start an ampoule if one is left and it would help. */
  tryHeal(): boolean {
    if (this.dead || this.hurtTimer > 0 || this.healT >= 0 || this.state === "dash" || this.slashT >= 0) return false;
    if (this.ampoules <= 0 || this.hp >= this.maxHp) { this.ev.heal?.("empty"); return false; }
    this.healT = 0;
    this.parryTimer = 0;
    this.ev.heal?.("start");
    return true;
  }

  get slashActive() {
    return this.slashT >= SLASH_STARTUP && this.slashT < SLASH_STARTUP + SLASH_ACTIVE;
  }

  /** Returns 1 or 2 when a cut starts, 0 if the press was queued or ignored. */
  trySlash(ax: number, ay: number): number {
    if (this.dead || this.hurtTimer > 0 || this.state === "dash" || this.healT >= 0) return 0;
    if (this.slashT >= 0) {
      if (this.slashCombo === 1 && this.slashT >= SLASH_STARTUP) this.slashQueued = true;
      return 0;
    }
    if (this.slashCooldown > 0) return 0;
    this.beginSlash(ax, ay, 1);
    return 1;
  }

  private beginSlash(ax: number, ay: number, combo: number) {
    const len = Math.hypot(ax, ay) || 1;
    this.slashAimX = ax / len;
    this.slashAimY = ay / len;
    this.slashT = 0;
    this.slashCombo = combo;
    this.slashQueued = false;
    this.slashHitIds.clear();
    if (Math.abs(this.slashAimX) > 0.15) this.facing = Math.sign(this.slashAimX);
    // a short step into the cut on the ground, a hang in the air
    if (this.onGround) this.vx = this.facing * 110;
    else if (this.vy > -40) this.vy = Math.min(this.vy, -40);
    this.squash(1.15, 0.9);
  }

  /** Advance the cut; returns 2 when the follow-up starts. */
  updateSlash(dt: number, nextAim: () => { x: number; y: number }): number {
    this.slashCooldown = Math.max(0, this.slashCooldown - dt);
    if (this.slashT < 0) return 0;
    this.slashT += dt;
    if (this.slashT >= SLASH_TOTAL) {
      if (this.slashQueued && this.slashCombo === 1) {
        const a = nextAim();
        this.beginSlash(a.x, a.y, 2);
        return 2;
      }
      this.slashCooldown = this.slashCombo === 2 ? 0.2 : 0.06;
      this.slashT = -1;
      this.slashCombo = 0;
    }
    return 0;
  }

  cancelSlash() {
    this.slashT = -1;
    this.slashCombo = 0;
    this.slashQueued = false;
  }

  startParry(ax: number, ay: number) {
    if (this.slashT >= 0) this.cancelSlash(); // parry cancels a cut's recovery
    const len = Math.hypot(ax, ay) || 1;
    this.aimX = ax / len;
    this.aimY = ay / len;
    this.parryTimer = TUNE.parryWindow;
    this.parryAge = 0;
    this.parryHit = false;
    if (Math.abs(this.aimX) > 0.15) this.facing = Math.sign(this.aimX);
  }

  /** Knockback + invulnerability. Returns true if this hit was fatal. */
  hurt(fromX: number): boolean {
    let dmg = 1;
    if (this.shield > 0) { this.shield--; dmg = 0; this.ev.guard?.("shield"); }
    else {
      const r = damageTaken();
      dmg = r.dmg;
      if (r.absorbed) this.ev.guard?.("grip");
      if (r.extra) this.ev.guard?.("seal");
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 1.0;
    if (this.healT >= 0) {
      // the needle is knocked away: that ampoule is spent
      this.healT = -1;
      this.ampoules--;
      this.ev.heal?.("cancel");
    }
    this.hurtTimer = 0.24;
    this.state = "normal";
    this.parryTimer = 0;
    this.cancelSlash();
    const dir = Math.sign(this.cx - fromX) || -this.facing;
    this.vx = dir * 230;
    this.vy = -260;
    this.jumpCutReady = false;
    this.squash(1.25, 0.8);
    if (this.hp <= 0) this.dead = true;
    return this.dead;
  }

  /** Which slash fits the aim: up / fwd / down, relative to facing. */
  get parryDir(): string {
    const a = Math.atan2(this.aimY, Math.abs(this.aimX) < 0.05 ? 0.05 : Math.abs(this.aimX));
    return a < -0.52 ? "up" : a > 0.52 ? "down" : "fwd";
  }

  get anim(): string {
    if (this.dead) return "death";
    if (this.hurtTimer > 0) return "hurt";
    if (this.healT >= 0) return "heal";
    if (this.slashT >= 0) {
      const a = Math.atan2(this.slashAimY, Math.max(0.05, Math.abs(this.slashAimX)));
      const dir = a < -0.52 ? "up" : a > 0.52 ? "down" : "fwd";
      return `slash${this.slashCombo}_${dir}${this.onGround ? "" : "_air"}`;
    }
    if (this.parryAge < 0.19) return `parry_${this.parryDir}${this.onGround ? "" : "_air"}`;
    if (this.state === "dash") return "dash";
    if (this.wallSliding) return "wall";
    if (this.onGround) {
      if (this.landTimer > 0) return "land";
      if (this.lastIx !== 0 && Math.sign(this.vx) === -this.lastIx && Math.abs(this.vx) > 110) return "skid";
      if (Math.abs(this.vx) > 25) return "run";
      return "idle";
    }
    if (this.vy < -110) return "jump";
    if (this.vy < 110) return "apex";
    return "fall";
  }
}
