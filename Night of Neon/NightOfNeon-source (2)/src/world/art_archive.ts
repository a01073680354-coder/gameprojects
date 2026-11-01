// Stage 3 art: the Forgotten Archive. Pale stone-and-steel galleries lit by
// cold white strips (the White Night's own light), and behind everything
// endless shelves of glass memory capsules: each holds the faint outline of
// a person somebody decided to forget. Erased cells are dark, tagged red.
// Also the security turret, the record fragment and the Archivist's pod.

import { Level, SOLID, ONEWAY, FAKE } from "./level";
import { TILE } from "../config";
import { canvas, px, rng } from "./art";

export const APAL = {
  deep: "#080b12", block: "#0c1019", panel: "#18202e", panel2: "#1d2636", seam: "#0e131d", rivet: "#334058",
  edge: "#2c3a52", white: "#eef4ff", whiteLo: "#9fb2d0", cyan: "#9ffcff", cyanLo: "#3a8a9a",
  amber: "#ffcf7a", red: "#ff4d6d", ink: "#05070c",
};

// ------------------------------------------------------------------ tiles

export function paintArchiveLevel(level: Level): HTMLCanvasElement {
  const W = level.pixelW, H = level.pixelH;
  const { c, ctx } = canvas(W, H);
  const R = rng(3131);
  const solid = (x: number, y: number) => { const t = level.get(x, y); return t === SOLID || t === FAKE; };
  const open = (x: number, y: number) => !solid(x, y);
  const glow: Array<[number, number, number, number, string]> = [];
  for (let ty = 0; ty < level.h; ty++)
    for (let tx = 0; tx < level.w; tx++) {
      const t0 = level.get(tx, ty);
      const t = t0 === FAKE ? SOLID : t0;
      const x = tx * TILE, y = ty * TILE;
      if (t === SOLID) {
        let near = false;
        for (let oy = -2; oy <= 2 && !near; oy++) for (let ox = -2; ox <= 2; ox++) if (Math.abs(ox) + Math.abs(oy) <= 2 && ty + oy >= 0 && open(tx + ox, ty + oy)) { near = true; break; }
        if (!near) {
          // deep masonry: dark ashlar blocks with a rare cold index light
          px(ctx, x, y, TILE, TILE, APAL.deep);
          if ((tx + ty) % 2 === 0) px(ctx, x + 1, y + 1, TILE - 2, TILE - 2, APAL.block);
          if (R() < 0.03) { ctx.globalAlpha = 0.45; px(ctx, x + 5, y + 7, 6, 1, APAL.cyan); ctx.globalAlpha = 1; }
          continue;
        }
        // dressed stone panel with a steel seam every other tile
        px(ctx, x, y, TILE, TILE, (tx + ty) % 3 === 0 ? APAL.panel2 : APAL.panel);
        px(ctx, x, y, TILE, 1, APAL.seam);
        if (tx % 2 === 0) px(ctx, x, y, 1, TILE, APAL.seam);
        if ((tx * 7 + ty * 3) % 5 === 0) px(ctx, x + 3, y + 5, 10, 1, "#141b28");
        if ((tx + ty) % 4 === 0) px(ctx, x + TILE - 3, y + 3, 1, 1, APAL.rivet);
        const up = open(tx, ty - 1), dn = open(tx, ty + 1), lf = open(tx - 1, ty), rt = open(tx + 1, ty);
        if (up) {
          // the walking edge: a white light strip under frosted glass
          px(ctx, x, y, TILE, 1, APAL.white);
          px(ctx, x, y + 1, TILE, 1, APAL.whiteLo);
          px(ctx, x, y + 2, TILE, 1, APAL.ink);
          px(ctx, x, y + 3, TILE, 2, "#121a27");
          if (tx % 3 === 0) px(ctx, x + 6, y + 3, 4, 1, APAL.cyanLo);
          glow.push([x, y, TILE, 1, APAL.white]);
        }
        if (dn) {
          px(ctx, x, y + TILE - 1, TILE, 1, APAL.ink);
          px(ctx, x, y + TILE - 3, TILE, 2, "#0a0e16");
          if (tx % 5 === 0) { px(ctx, x + 2, y + TILE - 2, 12, 1, APAL.cyan); glow.push([x + 2, y + TILE - 2, 12, 1, APAL.cyan]); }
        }
        if (lf) { px(ctx, x, y, 1, TILE, APAL.ink); px(ctx, x + 1, y, 1, TILE, APAL.edge); }
        if (rt) { px(ctx, x + TILE - 1, y, 1, TILE, APAL.ink); px(ctx, x + TILE - 2, y, 1, TILE, APAL.edge); }
        if ((lf || rt) && !up && !dn && ty % 4 === 0) { px(ctx, x + (lf ? 3 : TILE - 5), y + 4, 2, 8, APAL.amber); glow.push([x + (lf ? 3 : TILE - 5), y + 4, 2, 8, APAL.amber]); }
      } else if (t === ONEWAY) {
        // a reading shelf: thin glass ledge on brass brackets
        const lfw = level.get(tx - 1, ty) !== ONEWAY, rtw = level.get(tx + 1, ty) !== ONEWAY;
        px(ctx, x, y, TILE, 1, APAL.white);
        px(ctx, x, y + 1, TILE, 2, "#5a6c8a");
        px(ctx, x, y + 3, TILE, 1, APAL.ink);
        if (tx % 3 === 0 || lfw || rtw) { px(ctx, x + (rtw ? TILE - 3 : 2), y + 4, 1, 5, "#8a6a3a"); px(ctx, x + (rtw ? TILE - 4 : 1), y + 8, 3, 1, "#8a6a3a"); }
        glow.push([x, y, TILE, 1, APAL.cyan]);
      }
    }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [x, y, w, h, col] of glow) {
    ctx.shadowColor = col;
    ctx.shadowBlur = 7;
    ctx.globalAlpha = 0.3;
    px(ctx, x, y, w, h, col);
  }
  ctx.restore();
  return c;
}

export function paintArchiveReflections(level: Level): HTMLCanvasElement {
  const { c, ctx } = canvas(level.pixelW, level.pixelH);
  for (let ty = 1; ty < level.h; ty++)
    for (let tx = 0; tx < level.w; tx++) {
      if (level.get(tx, ty) !== SOLID || level.get(tx, ty - 1) === SOLID) continue;
      const g = ctx.createLinearGradient(0, ty * TILE + 5, 0, ty * TILE + 14);
      g.addColorStop(0, "rgba(220,236,255,0.10)");
      g.addColorStop(1, "rgba(220,236,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(tx * TILE, ty * TILE + 5, TILE, 9);
    }
  return c;
}

// ------------------------------------------------------------ background

/** A vault without a ceiling: black above, a pale mist far below, shafts of white light. */
export function paintArchiveSky(w: number, h: number): HTMLCanvasElement {
  const { c, ctx } = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#020307");
  g.addColorStop(0.6, "#070b14");
  g.addColorStop(1, "#121c2c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const R = rng(919);
  for (let i = 0; i < 4; i++) {
    const x = R() * w, sw = 18 + R() * 40;
    const sg = ctx.createLinearGradient(0, 0, 0, h);
    sg.addColorStop(0, "rgba(235,242,255,0.12)");
    sg.addColorStop(1, "rgba(235,242,255,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x + sw, 0); ctx.lineTo(x + sw + 30, h); ctx.lineTo(x - 30, h); ctx.closePath();
    ctx.fill();
  }
  return c;
}

/**
 * Horizontally tiling shelves of memory capsules. Each lit capsule holds a
 * faint head-and-shoulders outline; erased cells are dark with a red tag.
 */
export function paintCapsuleWall(W: number, H: number, seed: number, near: boolean): HTMLCanvasElement {
  const { c, ctx } = canvas(W, H);
  const R = rng(seed);
  const cw = near ? 22 : 13, ch = near ? 34 : 20, gap = near ? 6 : 4;
  const frame = near ? "#121a28" : "#0b1019", rail = near ? "#22304a" : "#151d2e";
  const wrap = (x: number, y: number, w: number, h: number, col: string) => { px(ctx, x, y, w, h, col); if (x + w > W) px(ctx, x - W, y, w, h, col); };
  let x = 0;
  while (x < W) {
    const cols = 2 + Math.floor(R() * 5);
    const bw = cols * (cw + gap) + gap;
    const top = Math.floor(R() * (near ? 50 : 30)) - 20;
    wrap(x, top, bw, H - top, frame);
    wrap(x, top, 1, H - top, rail);
    wrap(x + bw - 1, top, 1, H - top, "#04060a");
    for (let y = top + 10; y < H - ch; y += ch + gap + 4) {
      wrap(x, y + ch + 2, bw, 2, rail);                // shelf
      for (let i = 0; i < cols; i++) {
        const cx = x + gap + i * (cw + gap);
        const erased = R() < 0.16, dim = R() < 0.25;
        wrap(cx, y, cw, ch, "#05080e");
        if (erased) {
          wrap(cx + 1, y + 1, cw - 2, ch - 2, "#0a0c12");
          ctx.globalAlpha = near ? 0.8 : 0.5;
          wrap(cx + cw / 2 - 2, y + 2, 4, 2, APAL.red);    // red tag
          ctx.globalAlpha = 1;
          continue;
        }
        // most capsules glow faintly; a few are lit (someone is reading them)
        const lit = R() < 0.12;
        ctx.globalAlpha = (lit ? 0.32 : dim ? 0.06 : 0.12) * (near ? 1 : 0.6);
        wrap(cx + 1, y + 1, cw - 2, ch - 2, APAL.cyanLo);
        ctx.globalAlpha = (lit ? 0.6 : dim ? 0.12 : 0.24) * (near ? 1 : 0.6);
        // the outline of a person: head and shoulders
        const hx = cx + Math.floor(cw / 2), hy = y + Math.floor(ch * 0.32);
        const hr = near ? 3 : 2;
        wrap(hx - hr, hy - hr, hr * 2, hr * 2, APAL.cyan);
        wrap(hx - hr * 2, hy + hr + 1, hr * 4, near ? 5 : 3, APAL.cyan);
        ctx.globalAlpha = near ? 0.3 : 0.15;
        wrap(cx + 1, y + 1, 1, ch - 2, APAL.white);   // glass glint
        ctx.globalAlpha = 1;
        if (near && R() < 0.3) { ctx.globalAlpha = 0.6; wrap(cx + 2, y + ch - 4, cw - 4, 1, APAL.amber); ctx.globalAlpha = 1; } // index label
      }
    }
    x += bw + (near ? 3 : 2);
  }
  // hanging index cables and a gantry
  for (let y = near ? 110 : 70; y < H; y += near ? 170 : 110) {
    px(ctx, 0, y, W, near ? 4 : 2, near ? "#1a2336" : "#111827");
    for (let gx = 0; gx < W; gx += near ? 14 : 10) px(ctx, gx, y + 1, 1, near ? 2 : 1, rail);
  }
  return c;
}

// --------------------------------------------------------------- sprites

/** Ceiling turret: a 20x10 mount (frame 0) and a 14x5 barrel (frame 1). */
export function paintTurret(): { base: HTMLCanvasElement; gun: HTMLCanvasElement } {
  const b = canvas(20, 12);
  const g = b.ctx;
  px(g, 2, 0, 16, 3, "#2a3348");
  px(g, 0, 0, 20, 1, "#46557a");
  px(g, 4, 3, 12, 6, "#1b2233");
  px(g, 5, 4, 10, 1, "#33405c");
  px(g, 6, 9, 8, 3, "#11161f");
  px(g, 9, 6, 2, 2, APAL.red);
  const n = canvas(14, 5);
  const h = n.ctx;
  px(h, 0, 0, 10, 5, "#2a3348");
  px(h, 0, 0, 10, 1, "#46557a");
  px(h, 10, 1, 4, 3, "#11161f");
  px(h, 2, 2, 6, 1, APAL.cyanLo);
  return { base: b.c, gun: n.c };
}

/** A floating record fragment: a little card of light, 12x14. */
export function paintRecord(): HTMLCanvasElement {
  const { c, ctx } = canvas(12, 14);
  px(ctx, 1, 0, 10, 14, "rgba(159,252,255,0.25)");
  px(ctx, 0, 1, 12, 12, "rgba(159,252,255,0.18)");
  px(ctx, 2, 2, 8, 10, "#0b1a22");
  px(ctx, 3, 3, 6, 1, APAL.cyan);
  px(ctx, 3, 5, 4, 1, APAL.cyan);
  px(ctx, 3, 7, 5, 1, APAL.cyanLo);
  px(ctx, 3, 9, 3, 1, APAL.amber);
  px(ctx, 1, 0, 10, 1, APAL.white);
  return c;
}

/**
 * The Archivist's pod, 64x56: a hanging reliquary of glass and brass, an
 * old man seated inside, cables rising out of the top.
 * frame 0 = sealed, 1 = shield down (cracked), 2 = fallen (open).
 */
export function paintPod(): HTMLCanvasElement {
  const { c, ctx } = canvas(64 * 3, 56);
  for (let f = 0; f < 3; f++) {
    const o = f * 64;
    const P = (x: number, y: number, w: number, h: number, col: string) => px(ctx, o + x, y, w, h, col);
    // cable collar
    P(26, 0, 12, 5, "#1a2130");
    for (let k = 0; k < 4; k++) P(27 + k * 3, 0, 1, 5, "#0a0e16");
    // shell
    P(14, 5, 36, 4, "#8a6a3a");
    P(10, 9, 44, 34, "#141b29");
    P(10, 9, 44, 1, "#c8a060");
    P(12, 11, 40, 28, f === 2 ? "#0a0d14" : "#0c1a22");
    // glass with the man inside: white hair, a high collar, hands on a cane
    if (f !== 2) {
      ctx.globalAlpha = 0.9;
      P(28, 15, 8, 7, "#c8c4b8");      // face
      P(27, 13, 10, 3, "#e8e8f0");     // white hair
      P(29, 18, 2, 1, "#3a3040"); P(33, 18, 2, 1, "#3a3040");
      P(24, 22, 16, 13, "#2a2438");    // robe
      P(30, 22, 4, 13, "#eef4ff");     // high white collar / sash
      P(31, 26, 2, 10, "#8a6a3a");     // cane
      ctx.globalAlpha = 1;
    } else {
      P(24, 26, 16, 12, "#2a2438");
      P(28, 22, 8, 6, "#c8c4b8");
      P(27, 21, 10, 2, "#e8e8f0");
    }
    // glass sheen
    ctx.globalAlpha = f === 0 ? 0.35 : 0.2;
    P(14, 12, 2, 24, "#eef4ff");
    P(46, 14, 1, 18, "#eef4ff");
    ctx.globalAlpha = 1;
    if (f === 1) {
      // cracks
      for (const [x, y, w, h] of [[18, 14, 1, 6], [19, 19, 1, 4], [20, 22, 3, 1], [42, 28, 1, 6], [40, 26, 2, 1]]) P(x, y, w, h, "#eef4ff");
    }
    // base and side vanes
    P(12, 43, 40, 4, "#8a6a3a");
    P(18, 47, 28, 3, "#1a2130");
    P(4, 18, 6, 16, "#1a2130"); P(54, 18, 6, 16, "#1a2130");
    P(5, 20, 4, 1, APAL.cyan); P(55, 20, 4, 1, APAL.cyan);
    P(29, 50, 6, 6, f === 2 ? "#300a10" : APAL.red); // the core eye under the pod
  }
  return c;
}
