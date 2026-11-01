// Stage presentation: breakable props, energy walls, tutorial holograms,
// dropship flyover, sky traffic, lightning, rain splashes and the boss
// teaser billboard. Also computes neon light falling on the hero.

import { VIEW_W, VIEW_H, TILE, LITE_MODE, TEST } from "../config";
import { World, Prop } from "../sim/world";
import { Level, SOLID, ONEWAY, Arena } from "../world/level";
import { canvas, px, paintSkyline, PAL } from "../world/art";
import { drawText, textWidth } from "../ui/pixelfont";
import { SFX } from "../audio/sfx";
import { Particles } from "../fx/fx";

interface PropView { img: Phaser.GameObjects.Image; glow?: Phaser.GameObjects.Image; dented: boolean; }
interface Car { x: number; y: number; speed: number; pf: number; img: Phaser.GameObjects.Image; tail: Phaser.GameObjects.Image; }
interface Bolt { pts: { x: number; y: number }[]; t: number; }

export interface LightSrc { x: number; y: number; r: number; g: number; b: number; reach: number; }

export class StageRenderer {
  propViews = new Map<number, PropView>();
  gWall: Phaser.GameObjects.Graphics;
  gSky: Phaser.GameObjects.Graphics;
  gBoard: Phaser.GameObjects.Graphics;
  hints: { img: Phaser.GameObjects.Image; kind: string; x: number; y: number; done: boolean; a: number }[] = [];
  wallT = new Map<number, number>(); // arena group -> time since it closed (<0 while opening)
  cars: Car[] = [];
  blimp: Phaser.GameObjects.Image;
  blimpX = 200;
  ship: Phaser.GameObjects.Image | null = null;
  shipT = -1;
  shipFrom = 0;
  shipTo = 0;
  shipY = 0;
  shipBeam: Phaser.GameObjects.Image;
  lightningT = 6 + Math.random() * 6;
  flash = 0;
  silhouette: Phaser.GameObjects.TileSprite;
  skyFlash: Phaser.GameObjects.Rectangle;
  bolts: Bolt[] = [];
  splashT = 0;
  lights: LightSrc[] = [];
  // teaser billboard
  boardX = 0;
  boardY = 0;
  boardW = 168;
  boardH = 96;
  boardT = -1;
  mask: Phaser.GameObjects.Image | null = null;
  maskGlow: Phaser.GameObjects.Image | null = null;
  boardStatic = 0;

  constructor(private scene: Phaser.Scene, private level: Level, private fx: Particles) {
    const T = scene.textures;
    if (!T.exists("silFar")) {
      T.addCanvas("silFar", paintSkyline(1024, 11, {
        minTop: 150, maxTop: 250, minW: 24, maxW: 60, body: "#ffffff", rim: "#ffffff",
        winCols: ["#fff"], winChance: 0.07, signs: 0, antenna: true, silhouette: true,
      }));
    }
    this.silhouette = scene.add.tileSprite(0, 0, VIEW_W, VIEW_H + 120, "silFar").setOrigin(0).setScrollFactor(0).setDepth(-89.5)
      .setTint(0xb8a0ff).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.skyFlash = scene.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x9c88ff, 1).setOrigin(0).setScrollFactor(0).setDepth(-95).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.gSky = scene.add.graphics().setScrollFactor(0).setDepth(-94).setBlendMode(Phaser.BlendModes.ADD);
    this.indoor = level.theme !== "rooftop" && level.theme !== "outskirts";
    this.blimp = scene.add.image(0, 70, "blimp").setScrollFactor(0).setDepth(-86).setAlpha(0.85).setVisible(!this.indoor);
    for (let i = 0; i < 7; i++) {
      const pf = 0.22 + Math.random() * 0.25;
      const key = `car${i % 3}`;
      const img = scene.add.image(0, 0, key).setScrollFactor(0).setDepth(pf < 0.32 ? -84 : -75).setScale(pf < 0.32 ? 0.75 : 1);
      const tail = scene.add.image(0, 0, i % 2 ? "glowPink" : "glowCyan").setScrollFactor(0).setDepth(img.depth - 0.1).setBlendMode(Phaser.BlendModes.ADD).setScale(0.35).setAlpha(0.6);
      const speed = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 70);
      if (speed < 0) img.setFlipX(true);
      this.cars.push({ x: Math.random() * (VIEW_W + 300), y: 40 + Math.random() * 120, speed, pf, img, tail });
      if (this.indoor) { img.setVisible(false); tail.setVisible(false); }
    }
    this.gWall = scene.add.graphics().setDepth(11).setBlendMode(Phaser.BlendModes.ADD);
    this.shipBeam = scene.add.image(0, 0, "beam").setOrigin(0.5, 0).setDepth(-2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setVisible(false);
    for (const h of level.hints) {
      const img = scene.add.image(h.x * TILE + 8, h.y * TILE, `hint_${h.kind}`).setDepth(13).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.hints.push({ img, kind: h.kind, x: h.x * TILE + 8, y: h.y * TILE, done: false, a: 0 });
    }
    // teaser billboard (world space, behind the tiles)
    this.gBoard = scene.add.graphics().setDepth(-6.5);
    if (level.teaser) {
      this.boardX = level.teaser.x * TILE + 8 - this.boardW / 2;
      this.boardY = level.teaser.y * TILE;
      this.mask = scene.add.image(this.boardX + this.boardW / 2, this.boardY + this.boardH / 2 - 2, "bossMask").setDepth(-6.4).setVisible(false).setScale(1.15);
      this.maskGlow = scene.add.image(this.boardX + this.boardW / 2, this.boardY + this.boardH / 2, "glowPink").setDepth(-6.45).setBlendMode(Phaser.BlendModes.ADD).setScale(2.2).setVisible(false);
    }
    this.collectLights();
  }

  /** Static neon sources used to tint the hero as he walks past. */
  private collectLights() {
    const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const add = (x: number, y: number, col: string, reach: number) => {
      const [r, g, b] = hex(col);
      this.lights.push({ x, y, r, g, b, reach });
    };
    let seed = 3;
    for (const d of this.level.decos) {
      if (d.kind === "lamp") add(d.x * TILE + 8, (d.y + 1) * TILE - 54, PAL.amber, 80);
      if (d.kind === "sign") { add(d.x * TILE + ((d.w ?? 3) * TILE) / 2, d.y * TILE + ((d.h ?? 3) * TILE) / 2, [PAL.pink, PAL.cyan, PAL.purple][(seed++ + 1) % 3], 110); }
      if (d.kind === "facesign") add(d.x * TILE + ((d.w ?? 3) * TILE) / 2, d.y * TILE + ((d.h ?? 3) * TILE) / 2, seed++ % 2 ? PAL.cyan : PAL.pink, 120);
      // the outskirts: bare bulbs, a lit window, the emergency terminal, fires
      if (d.kind === "bulb") add(d.x * TILE + 3, d.y * TILE + 16, "#ffcf8a", 70);
      if (d.kind === "neighbor") add(d.x * TILE + ((d.w ?? 2) * TILE) / 2, d.y * TILE + ((d.h ?? 3) * TILE) / 2, "#ffb060", 70);
      if (d.kind === "terminal") add(d.x * TILE + 21, d.y * TILE - 30, PAL.cyan, 60);
      if (d.kind === "fire") add(d.x * TILE + ((d.w ?? 2) * TILE) / 2, d.y * TILE - 14, "#ff8a2a", 90);
      // the market: lanterns, second-hand neon, the lightboxes
      if (d.kind === "lantern") add(d.x * TILE + 5, d.y * TILE + 20, "#ffb060", 70);
      if (d.kind === "neon") add(d.x * TILE + ((d.w ?? 3) * TILE) / 2, d.y * TILE + 16, d.variant ? PAL.cyan : PAL.pink, 90);
      if (d.kind === "eden") add(d.x * TILE + 48, d.y * TILE + 40, "#ffc0d8", 100);
      if (d.kind === "yeonmu") add(d.x * TILE + 40, d.y * TILE + 32, "#7fe0d0", 90);
      if (d.kind === "laplace") add(d.x * TILE + 40, d.y * TILE + 30, "#6ad8c8", 90);
      if (d.kind === "doorway") add(d.x * TILE + 16, d.y * TILE + 60, "#ffb870", 80);
    }
  }

  // ---------------------------------------------------------------- props

  syncProps(world: World, time: number) {
    const live = new Set<number>();
    for (const pr of world.props) {
      live.add(pr.id);
      let v = this.propViews.get(pr.id);
      const variant = pr.def.variant ?? 0;
      if (!v) {
        const key = pr.def.kind === "barrel" ? `barrel${variant % 3}` : `stand${variant % 3}`;
        const img = this.scene.add.image(0, 0, key).setDepth(pr.def.kind === "barrel" ? 8 : 7).setOrigin(0.5, 1);
        let glow: Phaser.GameObjects.Image | undefined;
        if (pr.def.kind === "sign") {
          const gk = ["glowPink", "glowCyan", "glowAmber"][variant % 3];
          glow = this.scene.add.image(0, 0, gk).setDepth(6.9).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0.35);
        }
        v = { img, glow, dented: false };
        this.propViews.set(pr.id, v);
      }
      if (pr.def.kind === "barrel" && pr.hp === 1 && !v.dented) {
        v.dented = true;
        v.img.setTexture(`barrel${variant % 3}_dent`);
      }
      const wob = pr.wobble * Math.sin(time * 45) * 0.1;
      v.img.setPosition(Math.round(pr.cx), Math.round(pr.y + pr.h - pr.dropFrom)).setRotation(wob);
      if (pr.hitFlash > 0) v.img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else v.img.clearTint();
      if (v.glow) {
        const flick = Math.sin(time * 3 + pr.id) > 0.97 ? 0.1 : 0.35;
        v.glow.setPosition(pr.cx, pr.y + 9).setAlpha(flick);
      }
    }
    for (const [id, v] of this.propViews) {
      if (!live.has(id)) {
        v.img.destroy();
        v.glow?.destroy();
        this.propViews.delete(id);
      }
    }
  }

  clearProps() {
    for (const v of this.propViews.values()) { v.img.destroy(); v.glow?.destroy(); }
    this.propViews.clear();
  }

  // ------------------------------------------------------------- arenas

  wallOn(a: Arena) { this.wallT.set(a.group, 0); }
  wallOff(a: Arena) { this.wallT.set(a.group, -0.5); }
  resetWalls() { this.wallT.clear(); }

  private drawWalls(world: World, dt: number, time: number) {
    const g = this.gWall;
    g.clear();
    for (const a of this.level.arenas) {
      if (!this.wallT.has(a.group)) continue;
      let t = this.wallT.get(a.group)!;
      const closing = t >= 0;
      t += dt;
      this.wallT.set(a.group, t);
      if (!closing && t >= 0) { this.wallT.delete(a.group); continue; }
      // grow up from the floor when closing; shrink and flicker when opening
      const k = closing ? Math.min(1, t / 0.35) : Math.max(0, -t / 0.5);
      for (const w of a.walls) {
        const x = w.x * TILE + 8;
        const yb = (w.y1 + 1) * TILE;
        const top = w.y0 * TILE;
        const yt = yb - (yb - top) * k;
        const flick = closing ? 0.85 + 0.15 * Math.sin(time * 37 + w.x) : (Math.random() < 0.5 ? 0.3 : 0.8);
        // core beam + soft edges
        g.fillStyle(0xff2a6d, 0.18 * flick);
        g.fillRect(x - 6, yt, 12, yb - yt);
        g.fillStyle(0xff4f8b, 0.35 * flick);
        g.fillRect(x - 3, yt, 6, yb - yt);
        g.fillStyle(0xffd0e0, 0.9 * flick);
        g.fillRect(x - 1, yt, 2, yb - yt);
        // rising scan bands
        for (let y = yb - ((time * 90) % 24); y > yt; y -= 24) {
          g.fillStyle(0xffffff, 0.35 * flick);
          g.fillRect(x - 5, Math.round(y), 10, 1);
        }
        // hex warning glyphs
        for (let y = yb - 20; y > yt + 10; y -= 48) {
          g.fillStyle(0xff2a6d, 0.6 * flick);
          g.fillRect(x - 4, Math.round(y), 8, 1);
          g.fillRect(x - 4, Math.round(y) + 6, 8, 1);
          g.fillRect(x - 1, Math.round(y) + 1, 2, 5);
        }
        // emitter at the base
        g.fillStyle(0xffffff, 1);
        g.fillRect(x - 4, yb - 2, 8, 2);
        if (closing && Math.random() < 0.3) {
          this.fx.burst(x, yt + Math.random() * (yb - yt), {
            count: 1, speed: [20, 60], angle: [0, 360], life: [0.2, 0.4], size: [1, 1], colors: [0xff9cc2, 0xffffff], add: true,
          });
        }
      }
    }
  }

  // ------------------------------------------------------------ dropship

  flyover(fromX: number, toX: number, y: number, dur: number) {
    if (!this.ship) this.ship = this.scene.add.image(0, 0, "dropship").setDepth(-3);
    this.ship.setVisible(true);
    this.shipT = 0;
    this.shipFrom = fromX;
    this.shipTo = toX;
    this.shipY = y;
    this.shipDur = dur;
    this.shipBeam.setVisible(true);
    SFX.flyover(dur);
  }
  private shipDur = 3;

  private updateShip(dt: number, time: number) {
    if (this.shipT < 0 || !this.ship) return;
    this.shipT += dt;
    const u = this.shipT / this.shipDur;
    if (u >= 1) { this.ship.setVisible(false); this.shipBeam.setVisible(false); this.shipT = -1; return; }
    // fast in, hover over the arena, fast out
    const e = u < 0.3 ? (u / 0.3) * 0.45 : u < 0.7 ? 0.45 + ((u - 0.3) / 0.4) * 0.1 : 0.55 + ((u - 0.7) / 0.3) * 0.45;
    const x = this.shipFrom + (this.shipTo - this.shipFrom) * (e * e * (3 - 2 * e) * 0.5 + e * 0.5);
    const y = this.shipY + Math.sin(time * 2) * 3;
    this.ship.setPosition(Math.round(x), Math.round(y));
    const hover = u > 0.25 && u < 0.75;
    this.shipBeam.setPosition(x, y + 20).setAlpha(hover ? 0.32 + 0.06 * Math.sin(time * 20) : 0.08).setScale(1.2, 1);
  }

  // ------------------------------------------------------------ the sky

  indoor = false;

  private updateSky(dt: number, cam: Phaser.Cameras.Scene2D.Camera, time: number) {
    if (this.indoor) { this.updateIndoor(dt, cam, time); return; }
    // traffic: wraps in parallax space
    const span = VIEW_W + 300;
    for (const c of this.cars) {
      c.x += c.speed * dt;
      let sx = (c.x - cam.scrollX * c.pf) % span;
      if (sx < 0) sx += span;
      sx -= 150;
      const sy = c.y - cam.scrollY * c.pf * 0.4 + Math.sin(time * 1.3 + c.y) * 2;
      c.img.setPosition(Math.round(sx), Math.round(sy));
      c.tail.setPosition(Math.round(sx - Math.sign(c.speed) * 13), Math.round(sy + 1));
    }
    this.blimpX += 6 * dt;
    let bx = (this.blimpX - cam.scrollX * 0.06) % (VIEW_W + 400);
    if (bx < 0) bx += VIEW_W + 400;
    this.blimp.setPosition(Math.round(bx - 200), Math.round(64 - cam.scrollY * 0.03));

    // lightning
    this.lightningT -= dt;
    if (this.lightningT <= 0) {
      this.lightningT = 9 + Math.random() * 10;
      this.strike();
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    const f = this.flash;
    const flicker = f > 0.6 ? 1 : f > 0.4 ? 0.25 : f > 0.2 ? 0.8 : f;
    this.skyFlash.setAlpha(0.22 * flicker * Math.min(1, f * 2));
    this.silhouette.setAlpha(0.34 * flicker * Math.min(1, f * 2));
    this.silhouette.tilePositionX = cam.scrollX * 0.08;
    this.silhouette.y = Math.round(10 - cam.scrollY * 0.06);
    const g = this.gSky;
    g.clear();
    for (const b of this.bolts) {
      b.t += dt;
      const a = b.t < 0.05 ? 1 : b.t < 0.09 ? 0.2 : b.t < 0.14 ? 0.9 : Math.max(0, 1 - (b.t - 0.14) / 0.15);
      for (let i = 1; i < b.pts.length; i++) {
        const p0 = b.pts[i - 1], p1 = b.pts[i];
        const n = Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y));
        for (let k = 0; k < n; k++) {
          const x = Math.round(p0.x + ((p1.x - p0.x) * k) / n), y = Math.round(p0.y + ((p1.y - p0.y) * k) / n);
          g.fillStyle(0xe8e0ff, a);
          g.fillRect(x, y, 1, 1);
          g.fillStyle(0x9c88ff, a * 0.4);
          g.fillRect(x - 1, y, 3, 1);
        }
      }
    }
    this.bolts = this.bolts.filter((b) => b.t < 0.3);
  }

  /** Inside the tower: no sky; now and then a power surge flickers the machine walls. */
  private updateIndoor(dt: number, _cam: Phaser.Cameras.Scene2D.Camera, _time: number) {
    this.lightningT -= dt;
    if (this.lightningT <= 0) {
      this.lightningT = 7 + Math.random() * 9;
      this.flash = 0.7;
      SFX.thunder(0.9);
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    const f = this.flash;
    const flicker = f > 0.5 ? 1 : f > 0.35 ? 0.2 : f > 0.15 ? 0.7 : f;
    this.skyFlash.setFillStyle(this.level.theme === "archive" ? 0xeef4ff : 0x2de2e6, 1).setAlpha(0.1 * flicker);
    this.silhouette.setAlpha(0);
    this.gSky.clear();
  }

  strike() {
    if (!TEST.sky) return;
    this.flash = 1;
    const x0 = 60 + Math.random() * (VIEW_W - 120);
    const pts = [{ x: x0, y: -4 }];
    let x = x0, y = -4;
    const end = 90 + Math.random() * 80;
    while (y < end) {
      x += (Math.random() - 0.5) * 22;
      y += 6 + Math.random() * 10;
      pts.push({ x, y });
    }
    this.bolts.push({ pts, t: 0 });
    SFX.thunder(Math.random() * 0.7);
  }

  /** Raindrops bursting on roofs in view. */
  private splashes(dt: number, cam: Phaser.Cameras.Scene2D.Camera) {
    this.splashT -= dt;
    while (this.splashT <= 0) {
      this.splashT += 0.035;
      const wx = cam.scrollX + Math.random() * VIEW_W;
      const tx = Math.floor(wx / TILE);
      const ty0 = Math.max(0, Math.floor(cam.scrollY / TILE));
      for (let ty = ty0; ty < ty0 + 24; ty++) {
        const t = this.level.get(tx, ty);
        if ((t === SOLID || t === ONEWAY) && this.level.get(tx, ty - 1) !== SOLID) {
          this.fx.burst(wx, ty * TILE, {
            count: 2, speed: [20, 55], angle: [215, 325], life: [0.12, 0.25], size: [1, 1],
            colors: [0xb8c8ff, 0x8a9ad8], alpha: 0.55, grav: 400,
          });
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------- hero light

  /** Additive tint for the hero from nearby neon (0xRRGGBB, small values). */
  heroLight(x: number, y: number, extra: LightSrc[]): number {
    let r = 0, g = 0, b = 0;
    for (const l of [...this.lights, ...extra]) {
      const d = Math.hypot(l.x - x, l.y - y);
      if (d > l.reach) continue;
      const k = Math.pow(1 - d / l.reach, 1.6);
      r += l.r * k; g += l.g * k; b += l.b * k;
    }
    const scale = 0.16;
    const cl = (v: number) => Math.min(48, Math.round(v * scale));
    return (cl(r) << 16) | (cl(g) << 8) | cl(b);
  }

  // ------------------------------------------------------------ hints

  doneHint(kind: string) {
    for (const h of this.hints) if (h.kind === kind) h.done = true;
  }

  private updateHints(dt: number, px: number, time: number) {
    for (const h of this.hints) {
      const near = Math.abs(px - h.x) < 150 && px < h.x + 60;
      const want = near && !h.done ? 1 : 0;
      h.a += (want - h.a) * (1 - Math.exp(-dt * 6));
      const flick = Math.random() < 0.03 ? 0.4 : 1;
      h.img.setAlpha(h.a * 0.95 * flick).setPosition(h.x, Math.round(h.y + Math.sin(time * 2.2) * 2));
    }
  }

  // ------------------------------------------------------------ teaser

  startTeaser() { this.boardT = 0; }

  private drawBoard(dt: number, time: number, cam?: Phaser.Cameras.Scene2D.Camera) {
    if (!this.level.teaser) return;
    const g = this.gBoard;
    g.clear();
    if (LITE_MODE && cam) {
      // off screen: keep the clock running, skip the drawing
      const v = cam.worldView;
      if (this.boardX + this.boardW < v.x - 8 || this.boardX > v.right + 8 || this.boardY > v.bottom || this.boardY + this.boardH < v.y - 8) {
        if (this.boardT >= 0) this.boardT += dt;
        if (this.mask) this.mask.setVisible(false);
        if (this.maskGlow) this.maskGlow.setVisible(false);
        return;
      }
    }
    const X = this.boardX, Y = this.boardY, W = this.boardW, H = this.boardH;
    // frame and legs
    g.fillStyle(0x07050f, 1);
    g.fillRect(X - 4, Y - 4, W + 8, H + 8);
    g.fillStyle(0x2a2346, 1);
    const floor = (this.level.goal?.y ?? 17) * TILE;
    g.fillRect(X + 18, Y + H + 4, 6, floor - (Y + H + 4));
    g.fillRect(X + W - 24, Y + H + 4, 6, floor - (Y + H + 4));
    g.fillRect(X - 2, Y - 2, W + 4, 1);
    let t = this.boardT;
    if (t >= 0) this.boardT += dt;
    // phases: idle ad -> static -> mask -> static -> dark
    const phase = t < 0 ? "ad" : t < 0.6 ? "static" : t < 3.2 ? "mask" : t < 3.7 ? "static" : "dark";
    if (this.mask) this.mask.setVisible(phase === "mask");
    if (this.maskGlow) this.maskGlow.setVisible(phase === "mask").setAlpha(0.35 + 0.15 * Math.sin(time * 6));
    if (phase === "ad") {
      g.fillStyle(0x0c0818, 1);
      g.fillRect(X, Y, W, H);
      // scrolling glyph ad
      const off = Math.floor(time * 30) % 24;
      for (let row = 0; row < 4; row++) {
        const col = [0xff2a6d, 0x2de2e6, 0xb967ff, 0xf9f871][row];
        g.fillStyle(col, 0.85);
        for (let k = -1; k < 8; k++) {
          const gx = X + 8 + k * 24 - off * (row % 2 ? -1 : 1) + (row % 2 ? -24 : 0);
          if (gx < X + 2 || gx > X + W - 18) continue;
          const gy = Y + 10 + row * 21;
          g.fillRect(gx, gy, 14, 2);
          g.fillRect(gx + ((k + row) % 3) * 5, gy, 2, 12);
          g.fillRect(gx, gy + 10, 14, 2);
        }
      }
      drawText(g, "NIGHT OF NEON", X + Math.round(W / 2 - textWidth("NIGHT OF NEON") / 2), Y + H - 11, 0xffffff, 0.7);
    } else if (phase === "static") {
      g.fillStyle(0x101018, 1);
      g.fillRect(X, Y, W, H);
      for (let i = 0; i < 140; i++) {
        const sx = X + Math.floor(Math.random() * (W - 6)), sy = Y + Math.floor(Math.random() * H);
        g.fillStyle(Math.random() < 0.5 ? 0xffffff : 0x606070, Math.random());
        g.fillRect(sx, sy, 2 + Math.floor(Math.random() * 6), 1);
      }
    } else if (phase === "mask") {
      const k = (t - 0.6) / 2.6;
      g.fillStyle(0x140308, 1);
      g.fillRect(X, Y, W, H);
      // red scanlines over the face
      for (let y = Y; y < Y + H; y += 3) {
        g.fillStyle(0xff2a6d, 0.06 + 0.04 * Math.sin(time * 9 + y));
        g.fillRect(X, y, W, 1);
      }
      // horizontal tearing
      if (Math.random() < 0.25 && this.mask) this.mask.x = X + W / 2 + (Math.random() - 0.5) * 8;
      else if (this.mask) this.mask.x = X + W / 2;
      if (k > 0.35) {
        const msg = "I SEE YOU";
        const a = Math.min(1, (k - 0.35) * 4) * (Math.random() < 0.08 ? 0.3 : 1);
        drawText(g, msg, X + Math.round(W / 2 - textWidth(msg) / 2), Y + H - 12, 0xff2a6d, a, 1, 0x000000);
      }
    } else {
      g.fillStyle(0x07050c, 1);
      g.fillRect(X, Y, W, H);
      if (Math.floor(time * 2) % 2) drawText(g, "NO SIGNAL", X + Math.round(W / 2 - textWidth("NO SIGNAL") / 2), Y + H / 2 - 3, 0x505060, 1);
    }
  }

  // ------------------------------------------------------------ update

  update(world: World, cam: Phaser.Cameras.Scene2D.Camera, dt: number, simDt: number, time: number) {
    this.syncProps(world, time);
    this.drawWalls(world, dt, time);
    this.updateShip(dt, time);
    this.updateSky(dt, cam, time);
    this.updateHints(dt, world.player.cx, time);
    this.drawBoard(dt, time, cam);
    if (simDt > 0 && !this.indoor) this.splashes(simDt, cam);
  }
}

// ---------------------------------------------------------------- textures

/** Searchlight cone under the dropship. */
export function paintBeam(): HTMLCanvasElement {
  const { c, ctx } = canvas(120, 220);
  const g = ctx.createLinearGradient(0, 0, 0, 220);
  g.addColorStop(0, "rgba(220,240,255,0.7)");
  g.addColorStop(1, "rgba(220,240,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(52, 0); ctx.lineTo(68, 0); ctx.lineTo(120, 220); ctx.lineTo(0, 220);
  ctx.closePath();
  ctx.fill();
  return c;
}

/** The thing on the billboard: a horned cyber-oni helm with burning eyes. 80x64. */
export function paintBossMask(): HTMLCanvasElement {
  const { c, ctx } = canvas(80, 64);
  const dark = "#3a0c16", mid = "#6a1626", hi = "#b0304a", red = "#ff2a6d", hot = "#ffe0ea";
  // horns
  ctx.fillStyle = mid;
  ctx.beginPath(); ctx.moveTo(14, 30); ctx.lineTo(2, 2); ctx.lineTo(24, 22); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(66, 30); ctx.lineTo(78, 2); ctx.lineTo(56, 22); ctx.closePath(); ctx.fill();
  ctx.fillStyle = hi;
  ctx.beginPath(); ctx.moveTo(6, 8); ctx.lineTo(18, 24); ctx.lineTo(14, 26); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(74, 8); ctx.lineTo(62, 24); ctx.lineTo(66, 26); ctx.closePath(); ctx.fill();
  // helm dome + face plate
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.ellipse(40, 30, 26, 24, 0, Math.PI, 0); ctx.fill();
  ctx.fillRect(14, 30, 52, 14);
  ctx.beginPath(); ctx.moveTo(14, 44); ctx.lineTo(40, 62); ctx.lineTo(66, 44); ctx.closePath(); ctx.fill();
  ctx.fillStyle = mid;
  ctx.fillRect(18, 14, 44, 2);
  px(ctx, 38, 8, 4, 22, mid);
  // brow ridge and eye slits
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.moveTo(18, 30); ctx.lineTo(36, 34); ctx.lineTo(36, 38); ctx.lineTo(20, 35); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(62, 30); ctx.lineTo(44, 34); ctx.lineTo(44, 38); ctx.lineTo(60, 35); ctx.closePath(); ctx.fill();
  ctx.save();
  ctx.shadowColor = red;
  ctx.shadowBlur = 8;
  ctx.fillStyle = red;
  ctx.beginPath(); ctx.moveTo(21, 32); ctx.lineTo(34, 35); ctx.lineTo(34, 36); ctx.lineTo(22, 34); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(59, 32); ctx.lineTo(46, 35); ctx.lineTo(46, 36); ctx.lineTo(58, 34); ctx.closePath(); ctx.fill();
  ctx.fillStyle = hot;
  px(ctx, 29, 34, 3, 1, hot);
  px(ctx, 48, 34, 3, 1, hot);
  ctx.restore();
  // fanged mouth grille
  for (let i = 0; i < 6; i++) {
    px(ctx, 27 + i * 5, 46, 3, 6 - Math.abs(i - 2.5), "#000");
    px(ctx, 27 + i * 5, 46, 3, 1, red);
  }
  return c;
}
