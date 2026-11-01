import { Level } from "../world/level";

// Celeste/TowerFall-style actor: integer position, sub-pixel remainder,
// moves one pixel at a time and never overlaps solids.
// (Maddy Thorson, "Celeste & TowerFall Physics")

export type CollideFn = () => void;

export class Actor {
  x: number; // top-left of hitbox, integer pixels
  y: number;
  w: number;
  h: number;
  rx = 0;
  ry = 0;
  dropThrough = false; // ignore one-way platforms this step

  constructor(public level: Level, x: number, y: number, w: number, h: number) {
    this.x = x; this.y = y; this.w = w; this.h = h;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get bottom() { return this.y + this.h; }

  collideAt(x: number, y: number): boolean {
    return this.level.solidRect(x, y, this.w, this.h);
  }

  /** Solid below, counting one-way platforms we are standing on. */
  groundAt(x: number, y: number): boolean {
    if (this.collideAt(x, y + 1)) return true;
    if (!this.dropThrough && this.level.oneWayTopAt(x, y + this.h, this.w)) return true;
    return false;
  }

  moveX(amount: number, onCollide?: CollideFn) {
    this.rx += amount;
    let move = Math.round(this.rx);
    if (move === 0) return;
    this.rx -= move;
    const sign = Math.sign(move);
    while (move !== 0) {
      if (!this.collideAt(this.x + sign, this.y)) {
        this.x += sign;
        move -= sign;
      } else {
        this.rx = 0;
        onCollide?.();
        return;
      }
    }
  }

  moveY(amount: number, onCollide?: CollideFn) {
    this.ry += amount;
    let move = Math.round(this.ry);
    if (move === 0) return;
    this.ry -= move;
    const sign = Math.sign(move);
    while (move !== 0) {
      const blocked =
        this.collideAt(this.x, this.y + sign) ||
        (sign > 0 && !this.dropThrough && this.level.oneWayTopAt(this.x, this.y + this.h, this.w));
      if (!blocked) {
        this.y += sign;
        move -= sign;
      } else {
        this.ry = 0;
        onCollide?.();
        return;
      }
    }
  }
}

export function approach(v: number, target: number, amount: number) {
  return v < target ? Math.min(v + amount, target) : Math.max(v - amount, target);
}
