// Screen-space HUD: health cells, dash pip, aiming reticle.

import { Player } from "../entities/player";
import { Boss } from "../sim/boss";
import { VIEW_W, VIEW_H, LITE_MODE } from "../config";
import { drawText } from "../ui/pixelfont";

export const BOSS_BAR = { x: 180, y: 334, w: 280 };

export class Hud {
  g: Phaser.GameObjects.Graphics;
  private shown = 5;
  private hurtT = 0;
  private lostIndex = -1;
  private pulse = 0;
  private vialShake = 0;
  private vialGlow = 0;
  alpha = 1;
  gBoss: Phaser.GameObjects.Graphics;
  bossA = 0;
  private trail = 1;
  private shownHp = 1;
  private nameEl: HTMLElement | null;
  private rect: DOMRect | null = null;
  private rectAge = 0;
  private lastNameA = 1;

  constructor(private scene: Phaser.Scene) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(60);
    this.gBoss = scene.add.graphics().setScrollFactor(0).setDepth(60);
    this.nameEl = document.getElementById("bossname");
  }

  /** Boss health, posture and deathblow marks along the bottom of the screen. */
  drawBoss(b: Boss | null, show: boolean, dt: number, time: number) {
    const g = this.gBoss;
    g.clear();
    this.bossA += ((show && b ? 1 : 0) - this.bossA) * (1 - Math.exp(-dt * 5));
    const a = this.bossA * this.alpha;
    this.placeName(a);
    if (!b || a < 0.01) return;
    const { x, y, w } = BOSS_BAR;
    if (b.hpMax <= 0) { this.drawPostureOnly(g, b, a, time); return; }
    const hp = Math.max(0, b.hp / b.hpMax);
    this.shownHp += (hp - this.shownHp) * (1 - Math.exp(-dt * 30));
    if (hp > this.trail) this.trail = hp;
    else this.trail += (hp - this.trail) * (1 - Math.exp(-dt * 2.2));
    // frame
    g.fillStyle(0x07050f, 0.85 * a);
    g.fillRect(x - 2, y - 2, w + 4, 8);
    g.fillStyle(0x2a1020, a);
    g.fillRect(x, y, w, 4);
    g.fillStyle(0xffd0dc, 0.8 * a);
    g.fillRect(x, y, Math.round(w * this.trail), 4);
    g.fillStyle(0xd81e4a, a);
    g.fillRect(x, y, Math.round(w * this.shownHp), 4);
    g.fillStyle(0xff7090, a);
    g.fillRect(x, y, Math.round(w * this.shownHp), 1);
    // posture: grows from the centre, white-hot when broken (the Archivist has none)
    const pw = 200, px = Math.round(VIEW_W / 2 - pw / 2), py = y + 8;
    const bw = b as Boss & { shielded?: boolean; ventHp?: number };
    if (bw.shielded && bw.ventHp !== undefined) {
      // 방벽 behind its shield: no posture yet, only the vent (four amber cells)
      const n = 4, cw = 22, gap = 3, tw = n * cw + (n - 1) * gap, vx0 = Math.round(VIEW_W / 2 - tw / 2);
      for (let i = 0; i < n; i++) {
        const on = i < Math.ceil(bw.ventHp);
        g.fillStyle(0x07050f, 0.8 * a);
        g.fillRect(vx0 + i * (cw + gap) - 1, py - 1, cw + 2, 5);
        g.fillStyle(on ? (Math.floor(time * 3) % 2 && i === Math.ceil(bw.ventHp) - 1 ? 0xffd27a : 0xffb347) : 0x3a2a1a, a);
        g.fillRect(vx0 + i * (cw + gap), py, cw, 3);
      }
    } else if (b.postureMax < 999) {
    const k = b.posture / b.postureMax;
    const broken = b.state === "stagger";
    g.fillStyle(0x07050f, 0.8 * a);
    g.fillRect(px - 1, py - 1, pw + 2, 5);
    const col = broken ? (Math.floor(time * 12) % 2 ? 0xffffff : 0xffb347) : k > 0.75 ? 0xff5a3a : k > 0.45 ? 0xffb347 : 0xf9f871;
    const half = Math.round((pw / 2) * (broken ? 1 : k));
    g.fillStyle(col, a);
    g.fillRect(px + pw / 2 - half, py, half * 2, 3);
    g.fillStyle(0xffffff, 0.7 * a);
    g.fillRect(px + pw / 2, py - 2, 1, 7);
    }
    // deathblow marks
    for (let i = 0; i < 2; i++) {
      const cx = x - 12 - i * 11, cy = y + 1;
      const full = i < b.marks;
      for (let r = -4; r <= 4; r++) {
        const hw = 4 - Math.abs(r);
        g.fillStyle(0x07050f, 0.9 * a);
        g.fillRect(cx - hw - 1, cy + r, hw * 2 + 3, 1);
        g.fillStyle(full ? (r < 0 ? 0xff5a7a : 0xc8143c) : 0x3a2030, a);
        g.fillRect(cx - hw, cy + r, hw * 2 + 1, 1);
      }
    }
  }

  /** A boss with no health, only posture: one wide bar that fills from the centre. */
  private drawPostureOnly(g: Phaser.GameObjects.Graphics, b: Boss, a: number, time: number) {
    const { x, y, w } = BOSS_BAR;
    const k = b.posture / b.postureMax;
    const broken = b.state === "stagger";
    g.fillStyle(0x07050f, 0.85 * a);
    g.fillRect(x - 2, y - 2, w + 4, 9);
    g.fillStyle(0x1e1430, a);
    g.fillRect(x, y, w, 5);
    const col = broken ? (Math.floor(time * 12) % 2 ? 0xffffff : 0xffb347) : k > 0.75 ? 0xff5a3a : k > 0.45 ? 0xffb347 : 0xf9f871;
    const half = Math.round((w / 2) * (broken ? 1 : k));
    g.fillStyle(col, a);
    g.fillRect(x + w / 2 - half, y, half * 2, 5);
    g.fillStyle(0xffffff, 0.35 * a);
    g.fillRect(x + w / 2 - half, y, half * 2, 1);
    // quarter ticks
    for (const q of [0.25, 0.5, 0.75]) {
      g.fillStyle(0xffffff, 0.5 * a);
      g.fillRect(Math.round(x + w / 2 - (w / 2) * q), y - 1, 1, 7);
      g.fillRect(Math.round(x + w / 2 + (w / 2) * q), y - 1, 1, 7);
    }
    for (let i = 0; i < 2; i++) {
      const cx = x - 12 - i * 11, cy = y + 2;
      const full = i < b.marks;
      for (let r = -4; r <= 4; r++) {
        const hw = 4 - Math.abs(r);
        g.fillStyle(0x07050f, 0.9 * a);
        g.fillRect(cx - hw - 1, cy + r, hw * 2 + 3, 1);
        g.fillStyle(full ? (r < 0 ? 0xd9a8ff : 0x8a3fd0) : 0x2a2040, a);
        g.fillRect(cx - hw, cy + r, hw * 2 + 1, 1);
      }
    }
  }

  /** Keep the DOM name label pinned above the bar wherever the canvas sits. */
  private placeName(a: number) {
    const el = this.nameEl;
    if (!el) return;
    if (LITE_MODE) {
      // reading layout every frame forces a reflow; only re-measure now and then
      if (a <= 0.001 && this.lastNameA <= 0.001) return;
      this.lastNameA = a;
      if (--this.rectAge <= 0 || !this.rect) { this.rect = this.scene.game.canvas.getBoundingClientRect(); this.rectAge = 30; }
    }
    const c = LITE_MODE && this.rect ? this.rect : this.scene.game.canvas.getBoundingClientRect();
    const sx = c.width / VIEW_W, sy = c.height / VIEW_H;
    el.style.left = `${c.left + BOSS_BAR.x * sx}px`;
    el.style.top = `${c.top + (BOSS_BAR.y - 3) * sy}px`;
    el.style.fontSize = `${Math.max(12, 10 * sy)}px`;
    el.style.opacity = a.toFixed(3);
  }

  parryPulse() { this.pulse = 1; }
  vialDenied() { this.vialShake = 0.35; }
  vialGained() { this.vialGlow = 1; }

  update(dt: number, p: Player) {
    if (p.hp < this.shown) { this.lostIndex = p.hp; this.hurtT = 0.5; }
    this.shown = p.hp;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.pulse = Math.max(0, this.pulse - dt * 4);
    this.vialShake = Math.max(0, this.vialShake - dt);
    this.vialGlow = Math.max(0, this.vialGlow - dt * 1.5);
  }

  private gW: Phaser.GameObjects.Graphics | null = null;
  private shownChips = 0;
  /** Scrap chips and memory shards, under the health cells. */
  drawWallet(chips: number, shards: number, show: boolean) {
    if (!this.gW) this.gW = (this as any).scene.add.graphics().setScrollFactor(0).setDepth(80);
    const g = this.gW!;
    g.clear();
    if (!show || this.alpha <= 0) return;
    const a = this.alpha;
    this.shownChips += (chips - this.shownChips) * 0.2;
    if (Math.abs(chips - this.shownChips) < 0.5) this.shownChips = chips;
    const x = 14, y = 30;
    // a little circuit chip
    g.fillStyle(0x07050f, 0.8 * a); g.fillRect(x - 2, y - 2, 74, 12);
    g.fillStyle(0xffcf7a, a); g.fillRect(x, y, 7, 7);
    g.fillStyle(0x5a3a10, a); g.fillRect(x + 2, y + 2, 3, 3);
    for (let i = 0; i < 3; i++) { g.fillStyle(0xffcf7a, a); g.fillRect(x + 1 + i * 2, y - 1, 1, 1); g.fillRect(x + 1 + i * 2, y + 7, 1, 1); }
    drawText(g, String(Math.round(this.shownChips)), x + 11, y, 0xffe9c2, a, 1, 0x07050f);
    if (shards > 0) {
      const sx = x + 44;
      g.fillStyle(0xffcf7a, a);
      g.fillRect(sx + 3, y - 1, 1, 9); g.fillRect(sx + 2, y + 1, 3, 5); g.fillRect(sx + 1, y + 2, 5, 3);
      drawText(g, String(shards), sx + 9, y, 0xffcf7a, a, 1, 0x07050f);
    }
  }

  draw(p: Player, mx: number, my: number, _time: number) {
    const g = this.g;
    g.clear();
    g.setAlpha(this.alpha);
    if (this.alpha <= 0) return;
    const x0 = 14, y0 = 12;
    for (let i = 0; i < p.maxHp; i++) {
      const full = i < p.hp;
      const lost = i === this.lostIndex && this.hurtT > 0;
      const jx = lost ? Math.round((Math.random() - 0.5) * 3) : 0;
      const bx = x0 + i * 13 + jx;
      for (let r = 0; r < 12; r++) {
        const sx = bx + Math.floor((11 - r) / 3);
        g.fillStyle(0x07050f, 0.85);
        g.fillRect(sx - 1, y0 + r, 10, 1);
        if (full) {
          g.fillStyle(r < 2 ? 0xd8ffff : r < 9 ? 0x2de2e6 : 0x147a86, 1);
          g.fillRect(sx, y0 + r, 8, 1);
        } else if (lost) {
          g.fillStyle(0xff2a6d, this.hurtT * 2);
          g.fillRect(sx, y0 + r, 8, 1);
        } else {
          g.fillStyle(0x2a2346, 1);
          g.fillRect(sx, y0 + r, 8, 1);
        }
      }
      if (full) {
        g.fillStyle(0xffffff, 0.8);
        g.fillRect(bx + 4, y0 + 2, 3, 1);
      }
    }
    const dx = x0 + p.maxHp * 13 + 6, dy = y0 + 6;
    const ready = p.dashes > 0;
    g.fillStyle(0x07050f, 0.85);
    g.fillRect(dx - 4, dy - 4, 9, 9);
    g.fillStyle(ready ? 0x2de2e6 : 0x3a3166, 1);
    for (let r = -3; r <= 3; r++) {
      const w = 3 - Math.abs(r);
      g.fillRect(dx - w, dy + r, w * 2 + 1, 1);
    }
    if (ready) { g.fillStyle(0xffffff, 0.9); g.fillRect(dx - 1, dy - 2, 1, 1); }

    // nano ampoules (R), with the perfect-parry brew under them
    const vx0 = dx + 12;
    const jx = this.vialShake > 0 ? Math.round(Math.sin(this.vialShake * 60) * 2) : 0;
    for (let i = 0; i < p.maxAmpoules; i++) {
      const x = vx0 + i * 9 + jx, y = y0 + 1;
      const full = i < p.ampoules;
      const using = p.healT >= 0 && i === p.ampoules - 1;
      g.fillStyle(0x07050f, 0.85);
      g.fillRect(x - 1, y - 1, 7, 12);
      g.fillStyle(0x9a9aa8, 1);
      g.fillRect(x + 1, y, 3, 2); // cap
      g.fillStyle(full ? 0x1d5a4a : 0x2a2346, 1);
      g.fillRect(x, y + 2, 5, 8);
      if (full) {
        const lvl = using ? Math.max(0, 1 - p.healT / 0.6) : 1;
        const h = Math.round(7 * lvl);
        g.fillStyle(0x6dffc0, 1);
        g.fillRect(x + 1, y + 9 - h, 3, h);
        g.fillStyle(0xe0fff2, 0.9);
        g.fillRect(x + 1, y + 9 - h, 1, Math.min(h, 3));
      }
      if (this.vialGlow > 0 && i === p.ampoules - 1) {
        g.lineStyle(1, 0xb8ffe0, this.vialGlow);
        g.strokeRect(x - 2.5, y - 2.5, 10, 15);
      }
    }
    if (p.ampoules < p.maxAmpoules && p.perfectCount > 0) {
      const w = p.maxAmpoules * 9 - 3;
      g.fillStyle(0x07050f, 0.85);
      g.fillRect(vx0 - 1, y0 + 13, w + 2, 3);
      g.fillStyle(0x6dffc0, 0.85);
      g.fillRect(vx0, y0 + 14, Math.round((w * p.perfectCount) / 8), 1);
    }

    // reticle
    const cool = p.parryCooldown > 0;
    const active = p.parryTimer > 0;
    const col = cool ? 0xff2a6d : active ? 0xffffff : 0x9ffcff;
    const gap = 3 + Math.round(this.pulse * 4) + (active ? 1 : 0);
    const len = 4;
    const x = Math.round(mx), y = Math.round(my);
    g.fillStyle(0x07050f, 0.7);
    g.fillRect(x - gap - len - 1, y - 1, len + 2, 3);
    g.fillRect(x + gap, y - 1, len + 2, 3);
    g.fillRect(x - 1, y - gap - len - 1, 3, len + 2);
    g.fillRect(x - 1, y + gap, 3, len + 2);
    g.fillStyle(col, cool ? 0.6 : 1);
    g.fillRect(x - gap - len, y, len, 1);
    g.fillRect(x + gap + 1, y, len, 1);
    g.fillRect(x, y - gap - len, 1, len);
    g.fillRect(x, y + gap + 1, 1, len);
    g.fillRect(x, y, 1, 1);
    if (this.pulse > 0) {
      g.lineStyle(1, 0xffffff, this.pulse);
      g.strokeCircle(x + 0.5, y + 0.5, 8 + (1 - this.pulse) * 8);
    }
  }
}
