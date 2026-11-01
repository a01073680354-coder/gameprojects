import { LITE_MODE } from "../config";
// Procedural cyberpunk art: tiles, parallax city, decorations, props.
// Everything is painted at 1:1 game pixels onto 2D canvases.

import { TILE, VIEW_H } from "../config";
import { Level, SOLID, ONEWAY } from "./level";

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PAL = {
  ink: "#07050f",
  base: "#1b1630",
  base2: "#211b3a",
  seam: "#130f24",
  edge: "#3a3166",
  edgeHi: "#5a4d93",
  cyan: "#2de2e6",
  cyanHi: "#b8fdff",
  cyanLo: "#147a86",
  pink: "#ff2a6d",
  pinkHi: "#ff9cc2",
  purple: "#b967ff",
  yellow: "#f9f871",
  amber: "#ffb347",
};

export function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  // lite: paint on a software canvas. These are painted once and then
  // uploaded; a GPU canvas would defer the work (blurred glows included) and
  // stall the main thread when the pixels are first read back.
  const ctx = (LITE_MODE ? c.getContext("2d", { willReadFrequently: true }) : c.getContext("2d"))!;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

export function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
}

// ---------------------------------------------------------------- tiles

export function paintLevel(level: Level): HTMLCanvasElement {
  const W = level.pixelW, H = level.pixelH;
  const { c, ctx } = canvas(W, H);
  const R = rng(1337);
  const solid = (x: number, y: number) => level.get(x, y) === SOLID;
  const empty = (x: number, y: number) => level.get(x, y) !== SOLID;

  // depth from nearest open tile, used to turn big masses into building facades
  const depth = new Uint8Array(level.w * level.h);
  for (let ty = 0; ty < level.h; ty++)
    for (let tx = 0; tx < level.w; tx++) {
      if (!solid(tx, ty)) continue;
      let d = 4;
      for (let r = 1; r <= 3 && d === 4; r++)
        for (let oy = -r; oy <= r; oy++)
          for (let ox = -r; ox <= r; ox++)
            if (Math.abs(ox) + Math.abs(oy) <= r && empty(tx + ox, ty + oy) && ty + oy >= 0 && tx + ox >= 0 && tx + ox < level.w)
              d = Math.min(d, r);
      depth[ty * level.w + tx] = d;
    }

  const glowLines: Array<[number, number, number, number, string]> = [];

  for (let ty = 0; ty < level.h; ty++) {
    for (let tx = 0; tx < level.w; tx++) {
      const t = level.get(tx, ty);
      const x = tx * TILE, y = ty * TILE;
      if (t === SOLID) {
        const d = depth[ty * level.w + tx];
        const deep = d >= 3;
        px(ctx, x, y, TILE, TILE, deep ? "#120e22" : d === 2 ? "#17122a" : PAL.base);
        if (!deep) {
          if (tx % 2 === 0) px(ctx, x, y, 1, TILE, PAL.seam);
          if (ty % 2 === 0) px(ctx, x, y, TILE, 1, PAL.seam);
          px(ctx, x + TILE - 1, y + 1, 1, TILE - 1, PAL.base2);
          if (R() < 0.5) {
            px(ctx, x + 2, y + 2, 1, 1, PAL.edge);
            px(ctx, x + TILE - 3, y + 2, 1, 1, PAL.edge);
          }
          if (R() < 0.08) for (let i = 0; i < 3; i++) px(ctx, x + 4, y + 5 + i * 2, 8, 1, PAL.ink);
        } else {
          // facade: a window grid, almost all dark, a few dim lights
          for (let wy = 0; wy < 2; wy++)
            for (let wx = 0; wx < 2; wx++) {
              const r = R();
              const lit = r < 0.03;
              const col = lit ? (r < 0.012 ? "#ff2a6d" : r < 0.022 ? "#2de2e6" : "#f9c871") : r < 0.5 ? "#18122c" : "#110d20";
              ctx.globalAlpha = lit ? 0.28 : 1;
              px(ctx, x + 3 + wx * 7, y + 3 + wy * 7, 4, 5, col);
              ctx.globalAlpha = 1;
            }
        }

        const up = empty(tx, ty - 1), dn = empty(tx, ty + 1);
        const lf = empty(tx - 1, ty), rt = empty(tx + 1, ty);
        // neon light spilling down from an exposed top edge 1-2 tiles above
        const litAbove = empty(tx, ty - 1) ? 0 : empty(tx, ty - 2) ? 1 : empty(tx, ty - 3) ? 2 : -1;
        if (litAbove >= 0) {
          const grd = ctx.createLinearGradient(0, y, 0, y + TILE);
          const a0 = [0.16, 0.07, 0.025][litAbove], a1 = [0.07, 0.025, 0][litAbove];
          grd.addColorStop(0, `rgba(45,226,230,${a0})`);
          grd.addColorStop(1, `rgba(45,226,230,${a1})`);
          ctx.fillStyle = grd;
          ctx.fillRect(x, y, TILE, TILE);
        }
        if (lf) { ctx.globalAlpha = 0.25; px(ctx, x + 2, y, 1, TILE, "#6a5fb0"); ctx.globalAlpha = 1; }
        if (rt) { ctx.globalAlpha = 0.25; px(ctx, x + TILE - 3, y, 1, TILE, "#6a5fb0"); ctx.globalAlpha = 1; }
        if (lf) { px(ctx, x, y, 1, TILE, PAL.ink); px(ctx, x + 1, y, 1, TILE, PAL.edge); }
        if (rt) { px(ctx, x + TILE - 1, y, 1, TILE, PAL.ink); px(ctx, x + TILE - 2, y, 1, TILE, PAL.edge); }
        if (dn) {
          px(ctx, x, y + TILE - 1, TILE, 1, PAL.ink);
          px(ctx, x, y + TILE - 3, TILE, 2, "#0f0b1c");
          if ((tx + ty) % 2 === 0) px(ctx, x + 7, y + TILE - 2, 2, 1, PAL.pink);
        }
        if (up) {
          // neon-trimmed top surface, slick with rain
          px(ctx, x, y, TILE, 1, PAL.cyanHi);
          px(ctx, x, y + 1, TILE, 1, PAL.cyan);
          px(ctx, x, y + 2, TILE, 1, PAL.cyanLo);
          px(ctx, x, y + 3, TILE, 1, PAL.ink);
          px(ctx, x, y + 4, TILE, 1, PAL.edgeHi);
          if (lf || rt) {
            for (let i = 0; i < 4; i++) {
              const sx = lf ? x + 2 + i * 3 : x + TILE - 5 - i * 3;
              px(ctx, sx, y + 5, 2, 2, i % 2 ? PAL.ink : PAL.yellow);
            }
          }
          glowLines.push([x, y, TILE, 2, PAL.cyan]);
          if (lf) { px(ctx, x, y, 2, 3, PAL.cyanHi); }
          if (rt) { px(ctx, x + TILE - 2, y, 2, 3, PAL.cyanHi); }
        }
        if (up && lf) px(ctx, x, y, 1, 1, PAL.ink);
        if (up && rt) px(ctx, x + TILE - 1, y, 1, 1, PAL.ink);
      } else if (t === ONEWAY) {
        // grated catwalk: bright magenta deck edge, open grating, railing
        const lfw = level.get(tx - 1, ty) !== ONEWAY;
        const rtw = level.get(tx + 1, ty) !== ONEWAY;
        px(ctx, x, y - 9, TILE, 1, "#3a3160");
        if (tx % 2 === 0 || lfw) px(ctx, x + (lfw ? 1 : 0), y - 9, 1, 9, "#3a3160");
        if (rtw) px(ctx, x + TILE - 2, y - 9, 1, 9, "#3a3160");
        px(ctx, x, y, TILE, 1, "#ffd0e4");
        px(ctx, x, y + 1, TILE, 1, PAL.pink);
        px(ctx, x, y + 2, TILE, 1, "#7a1f4a");
        px(ctx, x, y + 3, TILE, 1, PAL.ink);
        for (let i = 0; i < TILE; i += 4) {
          px(ctx, x + i, y + 4, 3, 3, "#4a416f");
          px(ctx, x + i, y + 4, 3, 1, "#6a5f99");
        }
        px(ctx, x, y + 7, TILE, 1, PAL.ink);
        for (let i = 0; i < 4; i++) px(ctx, x + ((tx % 2) ? 12 - i * 3 : i * 3) + 1, y + 8 + i, 3, 1, "#2a2346");
        if (lfw) { px(ctx, x, y, 2, 8, PAL.ink); px(ctx, x + 1, y + 1, 1, 6, "#ffd0e4"); }
        if (rtw) { px(ctx, x + TILE - 2, y, 2, 8, PAL.ink); px(ctx, x + TILE - 2, y + 1, 1, 6, "#ffd0e4"); }
        glowLines.push([x, y, TILE, 2, PAL.pink]);
      }
    }
  }

  // neon glow pass: draw the bright lines again with blur so light spills
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [x, y, w, h, col] of glowLines) {
    ctx.shadowColor = col;
    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.35;
    px(ctx, x, y, w, h, col);
  }
  ctx.restore();
  return c;
}

/** Wet-roof reflections: stretched, faded neon smears under every lit top edge. */
export function paintReflections(level: Level): HTMLCanvasElement {
  const { c, ctx } = canvas(level.pixelW, level.pixelH);
  const R = rng(99);
  for (let ty = 1; ty < level.h; ty++) {
    for (let tx = 0; tx < level.w; tx++) {
      if (level.get(tx, ty) !== SOLID || level.get(tx, ty - 1) === SOLID) continue;
      const x = tx * TILE, y = ty * TILE + 5;
      // puddle sheen: a few horizontal highlight dashes
      if (R() < 0.45) {
        const w = 3 + Math.floor(R() * 9);
        ctx.globalAlpha = 0.18 + R() * 0.12;
        px(ctx, x + Math.floor(R() * (TILE - w)), y + 1 + Math.floor(R() * 3), w, 1, R() < 0.3 ? PAL.pinkHi : PAL.cyanHi);
      }
    }
  }
  ctx.globalAlpha = 1;
  return c;
}

// ---------------------------------------------------------- backgrounds

export function paintSky(w: number, h: number): HTMLCanvasElement {
  const { c, ctx } = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#07040f");
  g.addColorStop(0.45, "#160a2c");
  g.addColorStop(0.75, "#3a0f45");
  g.addColorStop(1, "#6a1a5a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const R = rng(7);
  for (let i = 0; i < 70; i++) {
    const y = R() * h * 0.5;
    ctx.globalAlpha = 0.25 + R() * 0.5 * (1 - y / (h * 0.5));
    px(ctx, Math.floor(R() * w), Math.floor(y), 1, 1, R() < 0.2 ? "#ffc8f0" : "#cfd8ff");
  }
  ctx.globalAlpha = 1;
  const mx = w * 0.72, my = h * 0.26, mr = 46;
  const mg = ctx.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 2.6);
  mg.addColorStop(0, "rgba(255,120,200,0.35)");
  mg.addColorStop(1, "rgba(255,120,200,0)");
  ctx.fillStyle = mg;
  ctx.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.clip();
  const mf = ctx.createLinearGradient(0, my - mr, 0, my + mr);
  mf.addColorStop(0, "#ffd6ef");
  mf.addColorStop(1, "#ff6fb5");
  ctx.fillStyle = mf;
  ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
  for (let y = my - mr; y < my + mr; y += 3) {
    ctx.globalAlpha = 0.18 + 0.25 * ((y - (my - mr)) / (2 * mr));
    px(ctx, mx - mr, Math.floor(y), mr * 2, 1, "#5a1450");
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  for (let i = 0; i < 4; i++) {
    ctx.globalAlpha = 0.08;
    px(ctx, 0, Math.floor(h * (0.62 + i * 0.07)), w, 8 + i * 4, "#ff4fa3");
  }
  ctx.globalAlpha = 1;
  return c;
}

interface Bldg { x: number; w: number; top: number; }

function wrapRect(ctx: CanvasRenderingContext2D, W: number, x: number, y: number, w: number, h: number, col: string) {
  px(ctx, x, y, w, h, col);
  if (x + w > W) px(ctx, x - W, y, w, h, col);
  if (x < 0) px(ctx, x + W, y, w, h, col);
}

/** A horizontally tileable skyline layer. `silhouette` returns only the shapes (for lightning). */
export function paintSkyline(W: number, seed: number, opts: {
  minTop: number; maxTop: number; minW: number; maxW: number;
  body: string; rim: string; winCols: string[]; winChance: number; signs: number;
  antenna: boolean; silhouette?: boolean;
}): HTMLCanvasElement {
  const H = VIEW_H + 120;
  const { c, ctx } = canvas(W, H);
  const R = rng(seed);
  const bs: Bldg[] = [];
  let x = 0;
  while (x < W) {
    const w = Math.floor(opts.minW + R() * (opts.maxW - opts.minW));
    const top = Math.floor(opts.minTop + R() * (opts.maxTop - opts.minTop));
    bs.push({ x, w, top });
    x += w + Math.floor(R() * 6) - 2;
  }
  const sil = !!opts.silhouette;
  for (const b of bs) {
    wrapRect(ctx, W, b.x, b.top, b.w, H - b.top, opts.body);
    if (!sil) {
      wrapRect(ctx, W, b.x, b.top, b.w, 1, opts.rim);
      wrapRect(ctx, W, b.x, b.top, 1, H - b.top, opts.rim);
    }
    if (R() < 0.5) {
      const sw = Math.floor(b.w * (0.3 + R() * 0.4));
      const sx = b.x + Math.floor((b.w - sw) / 2);
      const sh = 6 + Math.floor(R() * 14);
      wrapRect(ctx, W, sx, b.top - sh, sw, sh, opts.body);
      if (!sil) wrapRect(ctx, W, sx, b.top - sh, sw, 1, opts.rim);
    }
    if (opts.antenna && R() < 0.45) {
      const ax = b.x + 2 + Math.floor(R() * (b.w - 4));
      const ah = 10 + Math.floor(R() * 26);
      wrapRect(ctx, W, ax, b.top - ah, 1, ah, sil ? opts.body : opts.rim);
      if (!sil) wrapRect(ctx, W, ax - 1, b.top - ah - 1, 3, 2, PAL.pink);
    }
    if (sil) { for (let wy = b.top + 4; wy < H - 4; wy += 5) for (let wx = b.x + 3; wx < b.x + b.w - 3; wx += 4) R(), R(), R(); continue; }
    for (let wy = b.top + 4; wy < H - 4; wy += 5) {
      for (let wx = b.x + 3; wx < b.x + b.w - 3; wx += 4) {
        if (R() < opts.winChance) {
          ctx.globalAlpha = 0.35 + R() * 0.5;
          wrapRect(ctx, W, wx, wy, 2, 2, opts.winCols[Math.floor(R() * opts.winCols.length)]);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  if (sil) return c;
  for (let i = 0; i < opts.signs; i++) {
    const b = bs[Math.floor(R() * bs.length)];
    const col = [PAL.pink, PAL.cyan, PAL.purple, PAL.yellow][Math.floor(R() * 4)];
    const vertical = R() < 0.6;
    const sw = vertical ? 7 : 18 + Math.floor(R() * 14);
    const sh = vertical ? 22 + Math.floor(R() * 24) : 8;
    const sx = b.x + Math.floor(R() * Math.max(1, b.w - sw));
    const sy = b.top + 6 + Math.floor(R() * 40);
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 10;
    ctx.globalAlpha = 0.9;
    wrapRect(ctx, W, sx, sy, sw, sh, "#0b0716");
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    const n = vertical ? Math.floor(sh / 7) : Math.floor(sw / 6);
    for (let k = 0; k < n; k++) {
      const gx = vertical ? sx + 2 : sx + 2 + k * 6;
      const gy = vertical ? sy + 2 + k * 7 : sy + 2;
      const strokes = 2 + Math.floor(R() * 3);
      for (let s = 0; s < strokes; s++) {
        if (R() < 0.5) wrapRect(ctx, W, gx, gy + Math.floor(R() * 4), 3, 1, col);
        else wrapRect(ctx, W, gx + Math.floor(R() * 3), gy, 1, 4, col);
      }
    }
    ctx.restore();
  }
  return c;
}

// ---------------------------------------------------------- decorations

export function paintLamp(): HTMLCanvasElement {
  const { c, ctx } = canvas(24, 64);
  px(ctx, 11, 8, 2, 56, "#2a2346");
  px(ctx, 11, 8, 1, 56, "#3e3566");
  px(ctx, 9, 60, 6, 4, "#2a2346");
  px(ctx, 6, 6, 12, 3, "#2a2346");
  px(ctx, 5, 9, 14, 1, PAL.ink);
  ctx.save();
  ctx.shadowColor = PAL.amber;
  ctx.shadowBlur = 8;
  px(ctx, 7, 9, 10, 2, "#ffe2a8");
  ctx.restore();
  return c;
}

export function paintLightCone(): HTMLCanvasElement {
  const { c, ctx } = canvas(96, 120);
  const g = ctx.createLinearGradient(0, 0, 0, 120);
  g.addColorStop(0, "rgba(255,190,110,0.45)");
  g.addColorStop(1, "rgba(255,190,110,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(42, 0);
  ctx.lineTo(54, 0);
  ctx.lineTo(96, 120);
  ctx.lineTo(0, 120);
  ctx.closePath();
  ctx.fill();
  return c;
}

export function paintSign(wT: number, hT: number, seed: number): { c: HTMLCanvasElement; color: string } {
  const W = wT * TILE, H = hT * TILE;
  const { c, ctx } = canvas(W + 16, H + 16);
  const R = rng(seed);
  const color = [PAL.pink, PAL.cyan, PAL.purple][seed % 3];
  const o = 8;
  px(ctx, o, o, W, H, "#0b0716");
  px(ctx, o + 2, o + H, 2, 8, "#2a2346");
  px(ctx, o + W - 4, o + H, 2, 8, "#2a2346");
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = color;
  ctx.strokeRect(o + 1.5, o + 1.5, W - 3, H - 3);
  const vertical = H > W;
  const cell = 12;
  const n = vertical ? Math.floor((H - 6) / cell) : Math.floor((W - 6) / cell);
  for (let k = 0; k < n; k++) {
    const gx = o + (vertical ? Math.floor((W - 9) / 2) : 4 + k * cell);
    const gy = o + (vertical ? 4 + k * cell : Math.floor((H - 9) / 2));
    const strokes = 3 + Math.floor(R() * 3);
    for (let s = 0; s < strokes; s++) {
      if (R() < 0.5) px(ctx, gx, gy + Math.floor(R() * 8), 9, 1, color);
      else px(ctx, gx + Math.floor(R() * 8), gy, 1, 9, color);
    }
  }
  ctx.restore();
  return { c, color };
}

export function paintVent(): HTMLCanvasElement {
  const { c, ctx } = canvas(32, 22);
  px(ctx, 0, 2, 32, 20, PAL.ink);
  px(ctx, 1, 3, 30, 18, "#2a2346");
  px(ctx, 1, 3, 30, 1, "#4a416f");
  for (let i = 0; i < 6; i++) px(ctx, 4, 6 + i * 2, 13, 1, PAL.ink);
  ctx.beginPath();
  ctx.fillStyle = PAL.ink;
  ctx.arc(24, 12, 5, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, 23, 8, 2, 8, "#4a416f");
  px(ctx, 20, 11, 8, 2, "#4a416f");
  px(ctx, 2, 0, 3, 2, "#2a2346");
  px(ctx, 27, 0, 3, 2, "#2a2346");
  return c;
}

export function paintAntenna(): HTMLCanvasElement {
  const { c, ctx } = canvas(16, 48);
  px(ctx, 7, 4, 2, 44, "#2a2346");
  px(ctx, 3, 14, 10, 1, "#2a2346");
  px(ctx, 4, 24, 8, 1, "#2a2346");
  px(ctx, 2, 44, 12, 4, "#2a2346");
  return c;
}

export function paintSoftGlow(size: number, rgb: string): HTMLCanvasElement {
  const { c, ctx } = canvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.35, `rgba(${rgb},0.35)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

// ---------------------------------------------------------- stage objects

/** Checkpoint beacon: a slim pylon with a lamp head. 16x48. */
export function paintBeacon(): HTMLCanvasElement {
  const { c, ctx } = canvas(16, 48);
  px(ctx, 6, 10, 4, 38, PAL.ink);
  px(ctx, 7, 10, 2, 38, "#2a2346");
  px(ctx, 7, 10, 1, 38, "#3e3566");
  for (let y = 16; y < 44; y += 6) px(ctx, 6, y, 4, 1, "#4a416f");
  px(ctx, 3, 44, 10, 4, PAL.ink);
  px(ctx, 4, 44, 8, 3, "#2a2346");
  px(ctx, 3, 2, 10, 9, PAL.ink);
  px(ctx, 4, 3, 8, 7, "#cfd8ff");
  px(ctx, 5, 4, 2, 2, "#ffffff");
  return c;
}

/** Exit gate: a neon torii. 64x72. */
export function paintGate(): HTMLCanvasElement {
  const { c, ctx } = canvas(64, 72);
  ctx.save();
  ctx.shadowColor = PAL.pink;
  ctx.shadowBlur = 8;
  const red = "#ff2a6d", hi = "#ff9cc2", dk = "#8a1040";
  for (const x of [12, 46]) {
    px(ctx, x - 1, 14, 8, 58, PAL.ink);
    px(ctx, x, 14, 6, 58, red);
    px(ctx, x, 14, 2, 58, hi);
    px(ctx, x + 5, 14, 1, 58, dk);
    px(ctx, x - 2, 66, 10, 6, "#2a2346");
  }
  px(ctx, 0, 4, 64, 7, PAL.ink);
  px(ctx, 1, 5, 62, 5, red);
  px(ctx, 1, 5, 62, 1, hi);
  px(ctx, 0, 2, 4, 3, red);
  px(ctx, 60, 2, 4, 3, red);
  px(ctx, 6, 18, 52, 5, PAL.ink);
  px(ctx, 7, 19, 50, 3, red);
  px(ctx, 7, 19, 50, 1, hi);
  px(ctx, 28, 10, 8, 10, PAL.ink);
  px(ctx, 29, 11, 6, 8, "#1a0f20");
  px(ctx, 31, 12, 2, 1, PAL.cyan);
  px(ctx, 30, 14, 4, 1, PAL.cyan);
  px(ctx, 31, 16, 2, 2, PAL.cyan);
  ctx.restore();
  return c;
}

/** A big neon panel bolted to a tower's face (drawn in front of the tiles). */
export function paintFaceSign(wT: number, hT: number, seed: number): { c: HTMLCanvasElement; color: string } {
  const W = wT * TILE, H = hT * TILE;
  const { c, ctx } = canvas(W + 12, H + 12);
  const R = rng(seed * 7 + 3);
  const color = seed % 2 ? PAL.cyan : PAL.pink;
  const o = 6;
  px(ctx, o - 2, o - 2, W + 4, H + 4, PAL.ink);
  px(ctx, o, o, W, H, "#0c0818");
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(o + 2, o + 2, W - 4, H - 4);
  const cell = 14;
  const n = Math.floor((H - 10) / cell);
  for (let k = 0; k < n; k++) {
    const gx = o + Math.floor((W - 11) / 2), gy = o + 6 + k * cell;
    const strokes = 3 + Math.floor(R() * 3);
    for (let s = 0; s < strokes; s++) {
      if (R() < 0.5) px(ctx, gx, gy + Math.floor(R() * 10), 11, 2, color);
      else px(ctx, gx + Math.floor(R() * 10), gy, 2, 11, color);
    }
  }
  ctx.restore();
  // brackets
  px(ctx, 0, o + 6, o, 3, "#2a2346");
  px(ctx, 0, o + H - 9, o, 3, "#2a2346");
  return { c, color };
}

// ----------------------------------------------------------- breakables

const BARREL_COLS = [
  { hi: "#ff8a5c", bs: "#d8492c", sh: "#8a2414", dk: "#4a1208", band: "#2a1a1a", label: PAL.yellow },  // red hazard drum
  { hi: "#7fd8e8", bs: "#2f8aa8", sh: "#1c4e66", dk: "#0e2a38", band: "#14141c", label: PAL.pink },    // coolant drum
  { hi: "#c8c27a", bs: "#8a8240", sh: "#504a1e", dk: "#2a260e", band: "#18160e", label: PAL.cyan },    // olive drum
];

/** Drum barrel 18x32 plus cut halves (top and bottom). */
export function paintBarrel(variant: number): { whole: HTMLCanvasElement; top: HTMLCanvasElement; bottom: HTMLCanvasElement; dent: HTMLCanvasElement } {
  const k = BARREL_COLS[variant % BARREL_COLS.length];
  const draw = (dented: boolean) => {
    const { c, ctx } = canvas(18, 32);
    px(ctx, 1, 1, 16, 31, PAL.ink);
    px(ctx, 0, 3, 18, 27, PAL.ink);
    for (let y = 2; y < 31; y++) {
      for (let x = 1; x < 17; x++) {
        const t = (x - 1) / 15;
        const col = t < 0.18 ? k.dk : t < 0.4 ? k.sh : t < 0.72 ? k.bs : t < 0.86 ? k.hi : k.bs;
        px(ctx, x, y, 1, 1, col);
      }
    }
    // rolling hoops and lid
    for (const y of [2, 10, 21, 29]) px(ctx, 1, y, 16, 2, k.band);
    px(ctx, 2, 1, 14, 1, k.hi);
    px(ctx, 12, 3, 2, 1, "#ffffff");
    // hazard label
    px(ctx, 5, 13, 8, 6, PAL.ink);
    px(ctx, 6, 14, 6, 4, k.label);
    px(ctx, 8, 14, 2, 3, PAL.ink);
    px(ctx, 8, 17, 2, 1, k.label);
    if (dented) {
      // crumpled gash with bright scraped metal
      for (let i = 0; i < 9; i++) px(ctx, 3 + i, 8 + Math.round(i * 0.6), 2, 1, i % 2 ? "#ffffff" : "#d8d8e0");
      px(ctx, 4, 9, 9, 3, k.dk);
      for (let i = 0; i < 9; i++) px(ctx, 3 + i, 12 + Math.round(i * 0.6), 1, 1, "#ffe0a0");
    }
    return c;
  };
  const whole = draw(false), dent = draw(true);
  const split = (topHalf: boolean) => {
    const { c, ctx } = canvas(18, 32);
    ctx.save();
    ctx.beginPath();
    // diagonal cut line from (0,12) to (18,19)
    if (topHalf) { ctx.moveTo(0, 0); ctx.lineTo(18, 0); ctx.lineTo(18, 19); ctx.lineTo(0, 12); }
    else { ctx.moveTo(0, 12); ctx.lineTo(18, 19); ctx.lineTo(18, 32); ctx.lineTo(0, 32); }
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(dent, 0, 0);
    ctx.restore();
    // glowing hot edge along the cut
    for (let x = 0; x < 18; x++) {
      const y = Math.round(12 + (x / 18) * 7) + (topHalf ? -1 : 0);
      px(ctx, x, y, 1, 1, "#fff2c8");
    }
    return c;
  };
  return { whole, dent, top: split(true), bottom: split(false) };
}

const SIGN_COLS = [PAL.pink, PAL.cyan, PAL.yellow];

/** Standing neon A-board 22x28 and its broken frame. */
export function paintStandSign(variant: number): { whole: HTMLCanvasElement; broken: HTMLCanvasElement; color: string } {
  const col = SIGN_COLS[variant % SIGN_COLS.length];
  const R = rng(variant * 31 + 5);
  const glyphs: [number, number, number, number][] = [];
  for (let k = 0; k < 2; k++) {
    const gy = 6 + k * 7;
    const n = 3 + Math.floor(R() * 2);
    for (let s = 0; s < n; s++) glyphs.push(R() < 0.5 ? [5 + Math.floor(R() * 2), gy + Math.floor(R() * 5), 12, 1] : [5 + Math.floor(R() * 11), gy, 1, 5]);
  }
  const draw = (broken: boolean) => {
    const { c, ctx } = canvas(22, 28);
    // legs
    px(ctx, 3, 20, 2, 8, "#2a2346");
    px(ctx, 17, 20, 2, 8, "#2a2346");
    px(ctx, 3, 27, 16, 1, PAL.ink);
    // board
    px(ctx, 1, 1, 20, 21, PAL.ink);
    px(ctx, 2, 2, 18, 19, broken ? "#0a0612" : "#120a20");
    if (!broken) {
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 6;
      ctx.strokeStyle = col;
      ctx.strokeRect(3.5, 3.5, 15, 15);
      for (const [x, y, w, h] of glyphs) px(ctx, x, y, w, h, col);
      ctx.restore();
    } else {
      // dead tubes and a smashed hole
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = col;
      ctx.strokeRect(3.5, 3.5, 15, 15);
      ctx.globalAlpha = 1;
      px(ctx, 7, 6, 8, 9, PAL.ink);
      px(ctx, 6, 8, 2, 4, PAL.ink);
      px(ctx, 14, 7, 2, 6, PAL.ink);
      px(ctx, 9, 15, 4, 2, PAL.ink);
    }
    return c;
  };
  return { whole: draw(false), broken: draw(true), color: col };
}

/** Holographic tutorial prompt: a mouse with one button lit and a motion glyph. 40x30. */
export function paintHint(kind: "slash" | "parry"): HTMLCanvasElement {
  const { c, ctx } = canvas(40, 30);
  const col = kind === "slash" ? PAL.pinkHi : PAL.cyanHi;
  ctx.save();
  ctx.shadowColor = col;
  ctx.shadowBlur = 5;
  // mouse body
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(2.5, 4.5, 13, 20, 6);
  ctx.stroke();
  px(ctx, 9, 5, 1, 7, col);
  // lit button
  ctx.globalAlpha = 0.9;
  if (kind === "slash") px(ctx, 4, 6, 5, 6, col);
  else px(ctx, 10, 6, 5, 6, col);
  ctx.globalAlpha = 1;
  // glyph: a crescent cut, or a deflection chevron
  if (kind === "slash") {
    ctx.beginPath();
    ctx.arc(26, 22, 12, -Math.PI * 0.95, -Math.PI * 0.25);
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(36, 8); ctx.lineTo(24, 14); ctx.lineTo(36, 20);
    ctx.stroke();
    px(ctx, 20, 13, 3, 3, col);
  }
  ctx.restore();
  return c;
}

// ------------------------------------------------------- sky traffic

/** Hover car: 28x10, lit windows and tail light. */
export function paintCar(seed: number): HTMLCanvasElement {
  const { c, ctx } = canvas(28, 10);
  const R = rng(seed);
  const body = ["#1c1630", "#241a3a", "#16121e"][seed % 3];
  px(ctx, 3, 3, 22, 5, body);
  px(ctx, 7, 1, 13, 3, body);
  px(ctx, 9, 2, 4, 1, "#7ff6ff");
  px(ctx, 14, 2, 4, 1, "#7ff6ff");
  px(ctx, 24, 4, 3, 2, "#fff2c8"); // headlight (car faces right)
  px(ctx, 1, 5, 2, 2, "#ff2a6d"); // tail light
  px(ctx, 5, 8, 18, 1, R() < 0.5 ? "#2de2e6" : "#b967ff"); // underglow strip
  return c;
}

/** Advertising blimp for the far layer: 120x40 with a holo screen. */
export function paintBlimp(): HTMLCanvasElement {
  const { c, ctx } = canvas(120, 44);
  ctx.fillStyle = "#1a1230";
  ctx.beginPath();
  ctx.ellipse(60, 18, 56, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#231a3e";
  ctx.beginPath();
  ctx.ellipse(60, 14, 50, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  px(ctx, 2, 12, 8, 2, "#1a1230");
  px(ctx, 0, 8, 6, 12, "#1a1230");
  px(ctx, 48, 32, 24, 6, "#140e24");
  px(ctx, 52, 34, 3, 2, "#f9f871");
  // holo panel along the flank (lit by the engine with a blend)
  px(ctx, 26, 13, 68, 11, "#0b0716");
  ctx.save();
  ctx.shadowColor = PAL.cyan;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = PAL.cyan;
  ctx.strokeRect(26.5, 13.5, 67, 10);
  const R = rng(4);
  for (let k = 0; k < 9; k++) {
    const gx = 29 + k * 7;
    for (let s = 0; s < 3; s++) {
      if (R() < 0.5) px(ctx, gx, 15 + Math.floor(R() * 6), 5, 1, k % 3 ? PAL.cyan : PAL.pink);
      else px(ctx, gx + Math.floor(R() * 5), 15, 1, 7, k % 3 ? PAL.cyan : PAL.pink);
    }
  }
  ctx.restore();
  px(ctx, 112, 18, 2, 2, "#ff2a6d");
  return c;
}

/** Dropship silhouette for the arena entrance: 160x48, lights added by the engine. */
export function paintDropship(): HTMLCanvasElement {
  const { c, ctx } = canvas(160, 52);
  ctx.fillStyle = "#0c0918";
  ctx.beginPath();
  ctx.moveTo(4, 22); ctx.lineTo(30, 10); ctx.lineTo(120, 8); ctx.lineTo(156, 20);
  ctx.lineTo(150, 30); ctx.lineTo(112, 36); ctx.lineTo(40, 36); ctx.lineTo(10, 30);
  ctx.closePath();
  ctx.fill();
  // engine pods
  px(ctx, 24, 30, 26, 10, "#100c1e");
  px(ctx, 110, 30, 26, 10, "#100c1e");
  px(ctx, 26, 40, 22, 2, "#7ff6ff");
  px(ctx, 112, 40, 22, 2, "#7ff6ff");
  // hull detail
  px(ctx, 40, 14, 70, 1, "#2a2346");
  px(ctx, 50, 22, 50, 8, "#16122a");
  for (let i = 0; i < 6; i++) px(ctx, 54 + i * 8, 24, 4, 2, "#ff2a6d");
  px(ctx, 140, 18, 6, 3, "#ffe2a8");
  px(ctx, 6, 22, 3, 3, "#ff2a6d");
  // open bay and rope anchor
  px(ctx, 64, 36, 30, 4, "#06040c");
  return c;
}
