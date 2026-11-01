// Stage 2 art: the inside of the Neon Spire. Steel deck plates and machine
// blocks for the tiles, and behind everything colossal stacks of servers,
// coolant pipes and cable looms rising out of sight like cliff walls.
// Also the kamikaze drone and the dash hint.

import { Level, SOLID, ONEWAY } from "./level";
import { TILE } from "../config";
import { canvas, px, rng, PAL } from "./art";

export const TPAL = {
  steel: "#1c2030", steel2: "#232838", seam: "#121522", rivet: "#3a4258", edge: "#2e3550",
  trim: "#ffb347", trimHi: "#ffe2a8", trimLo: "#8a5a20",
  cyan: "#2de2e6", cyanHi: "#b8fdff", ink: "#07050f",
  led: ["#2de2e6", "#ff2a6d", "#6dffc0", "#ffb347", "#b967ff"],
};

// ------------------------------------------------------------------ tiles

export function paintTowerLevel(level: Level): HTMLCanvasElement {
  const W = level.pixelW, H = level.pixelH;
  const { c, ctx } = canvas(W, H);
  const R = rng(4242);
  const solid = (x: number, y: number) => level.get(x, y) === SOLID;
  const open = (x: number, y: number) => !solid(x, y);
  const depth = new Uint8Array(level.w * level.h);
  for (let ty = 0; ty < level.h; ty++)
    for (let tx = 0; tx < level.w; tx++) {
      if (!solid(tx, ty)) continue;
      let d = 4;
      for (let r = 1; r <= 3 && d === 4; r++)
        for (let oy = -r; oy <= r; oy++)
          for (let ox = -r; ox <= r; ox++)
            if (Math.abs(ox) + Math.abs(oy) <= r && open(tx + ox, ty + oy) && ty + oy >= 0 && tx + ox >= 0 && tx + ox < level.w) d = Math.min(d, r);
      depth[ty * level.w + tx] = d;
    }
  const glow: Array<[number, number, number, number, string]> = [];
  for (let ty = 0; ty < level.h; ty++)
    for (let tx = 0; tx < level.w; tx++) {
      const t = level.get(tx, ty);
      const x = tx * TILE, y = ty * TILE;
      if (t === SOLID) {
        const d = depth[ty * level.w + tx];
        if (d >= 3) {
          // deep structure: dark machine block with a sparse panel of status LEDs
          px(ctx, x, y, TILE, TILE, "#0d0f18");
          if ((tx + ty * 3) % 5 === 0) px(ctx, x + 2, y + 2, TILE - 4, TILE - 4, "#11141f");
          if (R() < 0.05) {
            const col = TPAL.led[Math.floor(R() * TPAL.led.length)];
            ctx.globalAlpha = 0.5;
            px(ctx, x + 4 + Math.floor(R() * 8), y + 4 + Math.floor(R() * 8), 2, 1, col);
            ctx.globalAlpha = 1;
          }
          continue;
        }
        // steel deck plate with seams and rivets
        px(ctx, x, y, TILE, TILE, d === 2 ? "#161a27" : TPAL.steel);
        px(ctx, x, y, TILE, 1, TPAL.seam);
        px(ctx, x, y, 1, TILE, TPAL.seam);
        px(ctx, x + TILE - 1, y + 1, 1, TILE - 1, TPAL.steel2);
        if ((tx + ty) % 2 === 0) { px(ctx, x + 2, y + 2, 1, 1, TPAL.rivet); px(ctx, x + TILE - 3, y + TILE - 3, 1, 1, TPAL.rivet); }
        if (R() < 0.12) for (let i = 0; i < 3; i++) px(ctx, x + 3, y + 4 + i * 3, 10, 1, "#141826");
        const up = open(tx, ty - 1), dn = open(tx, ty + 1), lf = open(tx - 1, ty), rt = open(tx + 1, ty);
        if (up) {
          // walking surface: amber safety strip and a hazard edge
          px(ctx, x, y, TILE, 1, TPAL.trimHi);
          px(ctx, x, y + 1, TILE, 1, TPAL.trim);
          px(ctx, x, y + 2, TILE, 1, TPAL.trimLo);
          px(ctx, x, y + 3, TILE, 1, TPAL.ink);
          for (let i = 0; i < TILE; i += 4) px(ctx, x + i + ((ty % 2) * 2), y + 4, 2, 2, (tx + i) % 8 < 4 ? "#3a2a10" : "#1a1408");
          glow.push([x, y, TILE, 2, TPAL.trim]);
        }
        if (dn) {
          // ceiling underside: cold strip lights every few tiles
          px(ctx, x, y + TILE - 1, TILE, 1, TPAL.ink);
          px(ctx, x, y + TILE - 3, TILE, 2, "#0b0d16");
          if (tx % 4 === 0) {
            px(ctx, x + 3, y + TILE - 2, 10, 1, TPAL.cyanHi);
            glow.push([x + 3, y + TILE - 2, 10, 1, TPAL.cyan]);
          }
        }
        if (lf) { px(ctx, x, y, 1, TILE, TPAL.ink); px(ctx, x + 1, y, 1, TILE, TPAL.edge); }
        if (rt) { px(ctx, x + TILE - 1, y, 1, TILE, TPAL.ink); px(ctx, x + TILE - 2, y, 1, TILE, TPAL.edge); }
        if (lf && !up && !dn && ty % 3 === 0) px(ctx, x + 2, y + 6, 2, 4, "#ff2a6d");
        if (rt && !up && !dn && ty % 3 === 1) px(ctx, x + TILE - 4, y + 6, 2, 4, "#2de2e6");
      } else if (t === ONEWAY) {
        // mesh catwalk with amber rail
        const lfw = level.get(tx - 1, ty) !== ONEWAY, rtw = level.get(tx + 1, ty) !== ONEWAY;
        px(ctx, x, y - 10, TILE, 1, "#4a3a20");
        if (tx % 2 === 0 || lfw) px(ctx, x + (lfw ? 1 : 0), y - 10, 1, 10, "#4a3a20");
        if (rtw) px(ctx, x + TILE - 2, y - 10, 1, 10, "#4a3a20");
        px(ctx, x, y, TILE, 1, TPAL.trimHi);
        px(ctx, x, y + 1, TILE, 1, TPAL.trim);
        px(ctx, x, y + 2, TILE, 1, TPAL.ink);
        for (let i = 0; i < TILE; i += 2) px(ctx, x + i, y + 3, 1, 4, "#2a2f44");
        px(ctx, x, y + 7, TILE, 1, TPAL.ink);
        if (lfw) px(ctx, x, y, 2, 8, TPAL.ink);
        if (rtw) px(ctx, x + TILE - 2, y, 2, 8, TPAL.ink);
        glow.push([x, y, TILE, 2, TPAL.trim]);
      }
    }
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const [x, y, w, h, col] of glow) {
    ctx.shadowColor = col;
    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.3;
    px(ctx, x, y, w, h, col);
  }
  ctx.restore();
  return c;
}

/** Faint mirror sheen on the polished deck plates. */
export function paintTowerReflections(level: Level): HTMLCanvasElement {
  const { c, ctx } = canvas(level.pixelW, level.pixelH);
  for (let ty = 1; ty < level.h; ty++)
    for (let tx = 0; tx < level.w; tx++) {
      if (level.get(tx, ty) !== SOLID || level.get(tx, ty - 1) === SOLID) continue;
      const g = ctx.createLinearGradient(0, ty * TILE + 6, 0, ty * TILE + 14);
      g.addColorStop(0, "rgba(255,179,71,0.10)");
      g.addColorStop(1, "rgba(255,179,71,0)");
      ctx.fillStyle = g;
      ctx.fillRect(tx * TILE, ty * TILE + 6, TILE, 8);
    }
  return c;
}

// ------------------------------------------------------------ background

/** The interior void: near-black at the top, a cold glow far below. */
export function paintTowerSky(w: number, h: number): HTMLCanvasElement {
  const { c, ctx } = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#04050b");
  g.addColorStop(0.55, "#0a0b1a");
  g.addColorStop(1, "#141a30");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // light shafts falling from vents far above
  const R = rng(77);
  for (let i = 0; i < 5; i++) {
    const x = R() * w, sw = 30 + R() * 60;
    const sg = ctx.createLinearGradient(0, 0, 0, h);
    sg.addColorStop(0, "rgba(120,200,255,0.10)");
    sg.addColorStop(1, "rgba(120,200,255,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x + sw, 0); ctx.lineTo(x + sw * 1.6 + 40, h); ctx.lineTo(x - 40, h);
    ctx.closePath();
    ctx.fill();
  }
  return c;
}

/**
 * A seamless (horizontally tiling) wall of towering machines: server stacks,
 * coolant risers and cable looms that run past the top of the frame.
 * `near` layers are bigger, brighter and more detailed.
 */
export function paintMachineWall(W: number, H: number, seed: number, near: boolean): HTMLCanvasElement {
  const { c, ctx } = canvas(W, H);
  const R = rng(seed);
  const body = near ? ["#121626", "#161b2e", "#0f1220"] : ["#0b0e1a", "#0d1020", "#090c16"];
  const rim = near ? "#2a3150" : "#1a2036";
  const wrap = (x: number, y: number, w: number, h: number, col: string) => {
    px(ctx, x, y, w, h, col);
    if (x + w > W) px(ctx, x - W, y, w, h, col);
  };
  let x = 0;
  while (x < W) {
    const kind = R();
    const w = near ? 46 + Math.floor(R() * 70) : 28 + Math.floor(R() * 50);
    const top = Math.floor(R() * (near ? 40 : 20)) - 10; // most run off the top
    const col = body[Math.floor(R() * body.length)];
    if (kind < 0.55) {
      // server stack: a tall cabinet of racks with LED rows
      wrap(x, top, w, H - top, col);
      wrap(x, top, 1, H - top, rim);
      wrap(x + w - 1, top, 1, H - top, "#05060c");
      const unit = near ? 9 : 6;
      for (let y = top + 6; y < H; y += unit) {
        wrap(x + 3, y, w - 6, 1, "#05060c");
        if (R() < 0.85) {
          const n = Math.floor((w - 10) / (near ? 4 : 3));
          for (let i = 0; i < n; i++) {
            if (R() < 0.55) continue;
            const led = TPAL.led[Math.floor(R() * (R() < 0.7 ? 1 : TPAL.led.length))];
            ctx.globalAlpha = near ? 0.75 : 0.45;
            wrap(x + 5 + i * (near ? 4 : 3), y + 2, near ? 2 : 1, 1, led);
            ctx.globalAlpha = 1;
          }
        }
        if (near && R() < 0.06) {
          // a lit drive bay
          ctx.globalAlpha = 0.25;
          wrap(x + 4, y + 1, w - 8, unit - 2, TPAL.cyan);
          ctx.globalAlpha = 1;
        }
      }
    } else if (kind < 0.78) {
      // coolant risers: fat vertical pipes with flange rings
      const n = 2 + Math.floor(R() * 3);
      const pw = Math.floor(w / n);
      for (let i = 0; i < n; i++) {
        const px0 = x + i * pw + 2, pww = pw - 4;
        wrap(px0, top, pww, H - top, col);
        wrap(px0 + 2, top, 2, H - top, rim);
        for (let y = top + 20 + Math.floor(R() * 30); y < H; y += 50 + Math.floor(R() * 40)) {
          wrap(px0 - 1, y, pww + 2, 4, rim);
          wrap(px0 - 1, y + 4, pww + 2, 1, "#05060c");
          if (R() < 0.3) { ctx.globalAlpha = 0.6; wrap(px0 + pww / 2 - 1, y + 1, 2, 2, "#ff2a6d"); ctx.globalAlpha = 1; }
        }
      }
    } else {
      // machine block: a reactor housing with a hologram panel
      const hh = 120 + Math.floor(R() * 160);
      const y0 = H - hh;
      wrap(x, y0, w, hh, col);
      wrap(x, y0, w, 1, rim);
      for (let k = 0; k < 4; k++) wrap(x + 4, y0 + 10 + k * 7, w - 8, 1, "#05060c");
      const sw = Math.min(w - 10, near ? 40 : 24), sh = near ? 22 : 14;
      const sx = x + Math.floor((w - sw) / 2), sy = y0 + 44;
      ctx.globalAlpha = near ? 0.5 : 0.3;
      const hc = R() < 0.5 ? TPAL.cyan : "#ff2a6d";
      wrap(sx, sy, sw, sh, "#05060c");
      for (let k = 0; k < 4; k++) wrap(sx + 2, sy + 3 + k * 4, Math.floor((sw - 4) * (0.3 + R() * 0.7)), 1, hc);
      ctx.globalAlpha = 1;
      // cable loom drooping from the top of the frame
      for (let k = 0; k < 3; k++) {
        const cx = x + 4 + Math.floor(R() * (w - 8));
        for (let y = 0; y < y0; y += 1) {
          const sag = Math.sin((y / y0) * Math.PI) * (6 + k * 3);
          wrap(Math.floor(cx + sag), y, 2, 1, "#07080f");
        }
      }
    }
    x += w + (near ? 2 : 1);
  }
  // a horizontal gantry every so often
  for (let y = near ? 90 : 60; y < H; y += near ? 140 : 90) {
    px(ctx, 0, y, W, near ? 5 : 3, near ? "#1a1f33" : "#11152a");
    px(ctx, 0, y + (near ? 5 : 3), W, 1, "#05060c");
    for (let gx = 0; gx < W; gx += near ? 12 : 9) px(ctx, gx, y + 1, 1, near ? 3 : 1, rim);
  }
  return c;
}

// ------------------------------------------------------------ kamikaze

/** 4 frames, 24x20: an armoured warhead on a whining rotor, one red eye. */
export function paintKamikaze(): HTMLCanvasElement {
  const FW = 24, FH = 20;
  const { c, ctx } = canvas(FW * 4, FH);
  for (let f = 0; f < 4; f++) {
    const ox = f * FW;
    const cx = ox + 12, cy = 11;
    // rotor blur
    const rw = f % 2 ? 14 : 10;
    ctx.globalAlpha = 0.55;
    px(ctx, cx - rw / 2, 2, rw, 1, "#9aa0c0");
    ctx.globalAlpha = 1;
    px(ctx, cx - 1, 3, 2, 3, "#3a4258");
    // body: a dark sphere with a purple hazard band
    for (let y = -6; y <= 6; y++)
      for (let x = -7; x <= 7; x++) {
        if (x * x / 49 + y * y / 36 > 1) continue;
        const t = (-x * 0.5 - y * 0.8) / 7;
        const col = t > 0.45 ? "#5a6280" : t > -0.1 ? "#3a4058" : t > -0.6 ? "#262a3c" : "#171a28";
        px(ctx, cx + x, cy + y, 1, 1, col);
      }
    for (let x = -7; x <= 7; x++) if (x * x / 49 < 0.92) px(ctx, cx + x, cy + 1, 1, 2, (x + f) % 4 < 2 ? "#b967ff" : "#2a1040");
    // nose cone spikes
    px(ctx, cx + 7, cy - 1, 3, 3, "#262a3c");
    px(ctx, cx + 10, cy, 2, 1, "#9aa0c0");
    px(ctx, cx + 4, cy - 6, 2, 1, "#9aa0c0");
    px(ctx, cx + 4, cy + 6, 2, 1, "#9aa0c0");
    // the eye
    px(ctx, cx + 3, cy - 3, 3, 3, "#07050f");
    px(ctx, cx + 4, cy - 2, 2, 1, f % 2 ? "#ff2a6d" : "#ff6a90");
    px(ctx, cx + 4, cy - 3, 1, 1, "#ffe0ea");
    // thruster
    px(ctx, cx - 9, cy - 1, 2, 3, "#3a4258");
    // outline
  }
  // 1px dark outline
  const img = ctx.getImageData(0, 0, FW * 4, FH);
  const out = ctx.createImageData(FW * 4, FH);
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= FW * 4 || y >= FH ? 0 : img.data[(y * FW * 4 + x) * 4 + 3]);
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW * 4; x++) {
      const i = (y * FW * 4 + x) * 4;
      if (a(x, y)) { for (let k = 0; k < 4; k++) out.data[i + k] = img.data[i + k]; continue; }
      if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) { out.data[i] = 7; out.data[i + 1] = 5; out.data[i + 2] = 15; out.data[i + 3] = 255; }
    }
  ctx.putImageData(out, 0, 0);
  return c;
}

/** Dash hint hologram: the SHIFT key and a path straight through a blast. */
export function paintDashHint(): HTMLCanvasElement {
  const { c, ctx } = canvas(52, 30);
  const col = PAL.cyanHi;
  ctx.save();
  ctx.shadowColor = col;
  ctx.shadowBlur = 5;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(1.5, 9.5, 21, 11, 3);
  ctx.stroke();
  // "SHIFT" as an up-arrow glyph on the key
  px(ctx, 11, 12, 2, 6, col);
  px(ctx, 9, 14, 6, 1, col);
  px(ctx, 10, 13, 4, 1, col);
  // the blast
  const bx = 38, by = 15;
  ctx.strokeStyle = "#b967ff";
  ctx.shadowColor = "#b967ff";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(bx + Math.cos(a) * 4, by + Math.sin(a) * 4);
    ctx.lineTo(bx + Math.cos(a) * 9, by + Math.sin(a) * 9);
    ctx.stroke();
  }
  // a dash arrow cutting through it
  ctx.strokeStyle = col;
  ctx.shadowColor = col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(26, 15); ctx.lineTo(50, 15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(46, 11); ctx.lineTo(50, 15); ctx.lineTo(46, 19);
  ctx.stroke();
  ctx.restore();
  return c;
}
