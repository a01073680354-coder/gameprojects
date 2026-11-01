// Lightweight pixel particle system, trauma-based screen shake, afterimages,
// and tumbling debris sprites (cut barrel halves, sign frames).

import { TUNE, LITE_MODE, TEST } from "../config";
import { Level } from "../world/level";

interface P {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  size: number; size1: number;
  color: number; alpha: number;
  grav: number; drag: number;
  add: boolean;
  stretch: boolean; // draw as a streak along velocity
}

export interface BurstOpts {
  count: number;
  speed: [number, number];
  angle: [number, number]; // degrees, 0 = right, 90 = down
  life: [number, number];
  size?: [number, number];
  sizeEnd?: number;
  colors: number[];
  alpha?: number;
  grav?: number;
  drag?: number;
  add?: boolean;
  stretch?: boolean;
  spreadX?: number;
  spreadY?: number;
}

export class Particles {
  private list: P[] = [];
  gNormal: Phaser.GameObjects.Graphics;
  gAdd: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, depth: number) {
    this.gNormal = scene.add.graphics().setDepth(depth);
    this.gAdd = scene.add.graphics().setDepth(depth + 1).setBlendMode(Phaser.BlendModes.ADD);
  }

  burst(x: number, y: number, o: BurstOpts) {
    if (!TEST.particles) return;
    // lite build: fewer particles per burst, and a hard ceiling
    const count = LITE_MODE ? Math.min(Math.ceil(o.count * 0.6), Math.max(0, 260 - this.list.length)) : o.count;
    for (let i = 0; i < count; i++) {
      const a = ((o.angle[0] + Math.random() * (o.angle[1] - o.angle[0])) * Math.PI) / 180;
      const s = o.speed[0] + Math.random() * (o.speed[1] - o.speed[0]);
      const life = o.life[0] + Math.random() * (o.life[1] - o.life[0]);
      const size = o.size ? o.size[0] + Math.random() * (o.size[1] - o.size[0]) : 2;
      this.list.push({
        x: x + (Math.random() - 0.5) * (o.spreadX ?? 0),
        y: y + (Math.random() - 0.5) * (o.spreadY ?? 0),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life, max: life,
        size, size1: o.sizeEnd ?? size,
        color: o.colors[Math.floor(Math.random() * o.colors.length)],
        alpha: o.alpha ?? 1,
        grav: o.grav ?? 0, drag: o.drag ?? 0,
        add: o.add ?? false, stretch: o.stretch ?? false,
      });
    }
  }

  update(dt: number) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l[i] = l[l.length - 1]; l.pop(); continue; }
      p.vy += p.grav * dt;
      const d = Math.pow(1 - Math.min(0.99, p.drag), dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  draw() {
    this.gNormal.clear();
    this.gAdd.clear();
    for (const p of this.list) {
      const t = p.life / p.max;
      const g = p.add ? this.gAdd : this.gNormal;
      const s = Math.max(1, Math.round(p.size1 + (p.size - p.size1) * t));
      g.fillStyle(p.color, p.alpha * Math.min(1, t * 1.6));
      if (p.stretch) {
        const sp = Math.hypot(p.vx, p.vy);
        const len = Math.min(10, sp * 0.02 + 1);
        const nx = sp > 0 ? p.vx / sp : 0, ny = sp > 0 ? p.vy / sp : 0;
        if (LITE_MODE) {
          // one rectangle along the dominant axis instead of a pixel trail
          const L = Math.round(len);
          if (Math.abs(nx) >= Math.abs(ny)) g.fillRect(Math.round(nx > 0 ? p.x - L : p.x), Math.round(p.y - ny * L * 0.5), L, s);
          else g.fillRect(Math.round(p.x - nx * L * 0.5), Math.round(ny > 0 ? p.y - L : p.y), s, L);
        } else for (let k = 0; k < len; k++)
          g.fillRect(Math.round(p.x - nx * k), Math.round(p.y - ny * k), s, s);
      } else {
        g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      }
    }
  }
}

/** Trauma-based shake (Squirrel Eiserloh, "Juicing Your Cameras With Math"). */
export class Shake {
  trauma = 0;
  private t = 0;
  ox = 0;
  oy = 0;
  add(amount: number) {
    if (!TEST.shake) return;
    this.trauma = Math.min(1, this.trauma + amount * TUNE.shake);
  }
  update(dt: number) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const k = this.trauma * this.trauma;
    const max = 9;
    const n = (f: number, o: number) => Math.sin(this.t * f + o) * 0.6 + Math.sin(this.t * f * 2.3 + o * 1.7) * 0.4;
    this.ox = Math.round(max * k * n(37, 0.3));
    this.oy = Math.round(max * k * n(41, 2.1));
  }
}

export class Afterimages {
  private pool: Phaser.GameObjects.Image[] = [];
  private live: { img: Phaser.GameObjects.Image; life: number; max: number; alpha: number }[] = [];
  constructor(private scene: Phaser.Scene, private depth: number) {}

  spawn(src: Phaser.GameObjects.Sprite, color: number, life = 0.22, alpha = 0.7) {
    if (!TEST.after) return;
    const img = this.pool.pop() ?? this.scene.add.image(0, 0, src.texture.key);
    img.setTexture(src.texture.key, src.frame.name)
      .setPosition(src.x, src.y)
      .setOrigin(src.originX, src.originY)
      .setFlipX(src.flipX)
      .setScale(src.scaleX, src.scaleY)
      .setRotation(src.rotation)
      .setDepth(this.depth)
      .setVisible(true)
      .setAlpha(alpha)
      .setTint(color)
      .setTintMode(Phaser.TintModes.FILL)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.live.push({ img, life, max: life, alpha });
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const a = this.live[i];
      a.life -= dt;
      if (a.life <= 0) {
        a.img.setVisible(false);
        this.pool.push(a.img);
        this.live.splice(i, 1);
        continue;
      }
      a.img.setAlpha((a.life / a.max) * a.alpha);
    }
  }
}

interface Chunk {
  img: Phaser.GameObjects.Image;
  x: number; y: number; vx: number; vy: number; rot: number; vr: number;
  life: number; resting: boolean;
}

/** Sprite debris with simple tile collision: bounces, slides, settles, fades. */
export class Debris {
  private list: Chunk[] = [];
  constructor(private scene: Phaser.Scene, private level: Level, private depth: number) {}

  spawn(key: string, x: number, y: number, vx: number, vy: number, vr: number, life = 6) {
    const img = this.scene.add.image(x, y, key).setDepth(this.depth);
    this.list.push({ img, x, y, vx, vy, rot: 0, vr, life, resting: false });
  }

  clear() {
    for (const c of this.list) c.img.destroy();
    this.list = [];
  }

  update(dt: number) {
    const L = this.level;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      c.life -= dt;
      if (c.life <= 0) { c.img.destroy(); this.list.splice(i, 1); continue; }
      if (!c.resting) {
        c.vy = Math.min(700, c.vy + 1500 * dt);
        const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
        const half = Math.min(c.img.height, c.img.width) / 2 - 1;
        const blockedAt = (x: number, y: number) => L.blocks(Math.floor(x / 16), Math.floor(y / 16));
        if (blockedAt(nx, ny + half)) {
          if (c.vy > 160) { c.vy *= -0.32; c.vx *= 0.6; c.vr *= 0.5; }
          else {
            c.vy = 0; c.vx *= 0.8; c.vr *= 0.8;
            if (Math.abs(c.vx) < 8) c.resting = true;
          }
          c.y = Math.floor((ny + half) / 16) * 16 - half;
        } else c.y = ny;
        if (blockedAt(nx + Math.sign(c.vx) * half, c.y)) c.vx *= -0.4;
        else c.x = nx;
        c.rot += c.vr * dt;
        // lie flat-ish when settling
        if (c.resting) {
          const q = Math.round(c.rot / (Math.PI / 2)) * (Math.PI / 2);
          c.rot += (q - c.rot) * 0.3;
        }
        if (c.y > L.pixelH + 100) c.life = 0;
      }
      c.img.setPosition(Math.round(c.x), Math.round(c.y)).setRotation(c.rot).setAlpha(Math.min(1, c.life));
    }
  }
}
