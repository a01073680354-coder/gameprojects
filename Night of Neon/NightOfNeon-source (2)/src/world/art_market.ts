// STAGE 2 art: the Undercity Market. Under the overpass: grey concrete
// sweating in the damp, the deck's girders overhead, steel grating where the
// slabs are gone and the rain comes through. Paper lanterns and second-hand
// neon over stalls of noodles and salvaged parts; chalk on the piers. The
// five shadows of the story live here as signs: 연무 의원, 권하린's ration
// board, Eden's poster, the Laplace gate, the one-armed mark.

import { Level, SOLID, ONEWAY, FAKE, MAT } from "./level";
import { TILE, VIEW_H } from "../config";
import { canvas, px, rng, paintSkyline } from "./art";

export const MPAL = {
  ink: "#07060b",
  asph: "#1d1a23", asph2: "#232029", asphDeep: "#100e14", asphHi: "#3b3644", oil: "#15121a",
  wet: "#7c8cb0", wetLo: "#3c4462",
  conc: "#2c2a33", concHi: "#423f4c", concLo: "#1c1a21", concStain: "#24222b",
  deck: "#1b1922", deckLo: "#121017", girder: "#2a2733", girderHi: "#3c3846",
  steel: "#3a404a", steelHi: "#68717e", steelLo: "#1f232a",
  crate: "#4a3524", crateHi: "#634831", crateLo: "#2e2016",
  hazard: "#d8b040", hazardDk: "#2a2410",
  lantern: "#ffb060", neonPink: "#ff4f8a", neonCyan: "#4fe0e0",
  chalk: "#e8e4d8",
};

const FONT = (px: number, weight = "400") => `${weight} ${px}px "Black Han Sans", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif`;

/**
 * Text that stays crisp as pixel art: drawn small, then thresholded, so the
 * letters land on whole pixels like the rest of the world.
 */
export function pixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string,
  align: CanvasTextAlign = "left", cut = 0.45, shadow?: string) {
  const w = Math.ceil(size * text.length * 1.1 + 8), h = Math.ceil(size * 1.6);
  const { c: t, ctx: g } = canvas(w, h);
  g.font = FONT(size);
  g.textBaseline = "top";
  g.fillStyle = "#fff";
  const ax = align === "center" ? w / 2 : align === "right" ? w - 2 : 2;
  g.textAlign = align;
  g.fillText(text, ax, 1);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const [r, gg, b] = hex(color);
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i + 3] > 255 * cut;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = on ? 255 : 0;
  }
  g.putImageData(img, 0, 0);
  const ox = align === "center" ? x - w / 2 : align === "right" ? x - w + 2 : x - 2;
  if (shadow) {
    const { c: s2, ctx: g2 } = canvas(w, h);
    g2.drawImage(t, 0, 0);
    g2.globalCompositeOperation = "source-in";
    g2.fillStyle = shadow;
    g2.fillRect(0, 0, w, h);
    ctx.drawImage(s2, Math.round(ox) + 1, Math.round(y) + 1);
  }
  ctx.drawImage(t, Math.round(ox), Math.round(y));
}

function hex(c: string): [number, number, number] {
  const v = c.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

// ------------------------------------------------------------------ tiles

export function paintMarketLevel(level: Level): HTMLCanvasElement {
  const W = level.pixelW, H = level.pixelH;
  const { c, ctx } = canvas(W, H);
  const R = rng(5011);
  const solid = (x: number, y: number) => { const t = level.get(x, y); return t === SOLID || t === FAKE; };
  const open = (x: number, y: number) => !solid(x, y);
  const covered = (tx: number, ty: number) => level.rooms.some((r) => tx >= r.x0 && tx <= r.x1 && ty >= r.y0 - 1 && ty <= r.y1 + 1);

  for (let ty = 0; ty < level.h; ty++)
    for (let tx = 0; tx < level.w; tx++) {
      const t = level.get(tx, ty);
      const x = tx * TILE, y = ty * TILE;
      if (t === SOLID || t === FAKE) {
        const m = level.matAt(tx, ty);
        const up = open(tx, ty - 1) && ty > 0, dn = open(tx, ty + 1), lf = open(tx - 1, ty), rt = open(tx + 1, ty);
        if (m === MAT.ground) paintAsphalt(ctx, level, tx, ty, x, y, up, lf, rt, covered(tx, ty), R);
        else if (m === MAT.deck) paintDeck(ctx, level, tx, ty, x, y, up, dn, lf, rt, R);
        else if (m === MAT.grate) paintGrate(ctx, tx, ty, x, y, up, dn);
        else if (m === MAT.crate) paintCrate(ctx, tx, ty, x, y, up, lf, rt);
        else paintConcrete(ctx, tx, ty, x, y, up, dn, lf, rt, tx < 28 && ty >= 18, R);
      } else if (t === ONEWAY) {
        const lfw = level.get(tx - 1, ty) !== ONEWAY, rtw = level.get(tx + 1, ty) !== ONEWAY;
        if (tx < 60) paintAwning(ctx, tx, x, y, lfw, rtw, tx < 40 ? 0 : 1);
        else paintCatwalk(ctx, tx, x, y, lfw, rtw);
      }
    }
  return c;
}

function paintAsphalt(ctx: CanvasRenderingContext2D, level: Level, tx: number, ty: number, x: number, y: number, up: boolean, lf: boolean, rt: boolean, dry: boolean, R: () => number) {
  let d = 0;
  while (d < 4 && level.get(tx, ty - d - 1) === SOLID && level.matAt(tx, ty - d - 1) === MAT.ground) d++;
  px(ctx, x, y, TILE, TILE, d >= 3 ? MPAL.asphDeep : d === 2 ? "#16131b" : MPAL.asph);
  if (d < 3) {
    for (let i = 0; i < 4; i++) if (R() < 0.55) px(ctx, x + Math.floor(R() * 15), y + Math.floor(R() * 15), 1, 1, R() < 0.5 ? MPAL.asph2 : "#2a2631");
    if (d === 1 && R() < 0.2) px(ctx, x + Math.floor(R() * 10), y + 3 + Math.floor(R() * 8), 5, 1, "#1a1720"); // a crack
  }
  if (up) {
    // the market floor: worn asphalt under the deck, rain-slick where the sky is open
    px(ctx, x, y, TILE, 1, dry ? "#4a4452" : MPAL.wet);
    px(ctx, x, y + 1, TILE, 1, dry ? "#2d2935" : MPAL.wetLo);
    px(ctx, x, y + 2, TILE, 2, MPAL.asph2);
    px(ctx, x, y + 4, TILE, 1, MPAL.asphHi);
    if (dry && R() < 0.22) { // oil stains, a cigarette end
      ctx.globalAlpha = 0.6;
      px(ctx, x + Math.floor(R() * 8), y + 1, 6 + Math.floor(R() * 4), 1, MPAL.oil);
      ctx.globalAlpha = 1;
    }
    if (!dry && R() < 0.25) px(ctx, x + Math.floor(R() * 10), y + 1, 4, 1, "#a8b8e0"); // a puddle glint
    if (tx % 23 === 7) { // a drain grate
      px(ctx, x + 3, y + 1, 10, 3, "#0d0b10");
      for (let k = 0; k < 10; k += 2) px(ctx, x + 3 + k, y + 1, 1, 3, "#3a3542");
    }
  }
  if (lf) { px(ctx, x, y, 1, TILE, MPAL.ink); px(ctx, x + 1, y, 1, TILE, MPAL.asphHi); }
  if (rt) { px(ctx, x + TILE - 1, y, 1, TILE, MPAL.ink); px(ctx, x + TILE - 2, y, 1, TILE, "#2a2631"); }
}

function paintConcrete(ctx: CanvasRenderingContext2D, tx: number, ty: number, x: number, y: number, up: boolean, dn: boolean, lf: boolean, rt: boolean, stairs: boolean, R: () => number) {
  // poured concrete: formwork seams, rust weeping from bolts, chips at the edges
  px(ctx, x, y, TILE, TILE, MPAL.conc);
  if (ty % 3 === 0) px(ctx, x, y, TILE, 1, MPAL.concLo);
  if (tx % 4 === 0) px(ctx, x, y, 1, TILE, MPAL.concStain);
  if (R() < 0.3) px(ctx, x + Math.floor(R() * 13), y + Math.floor(R() * 13), 2, 2, MPAL.concStain);
  if ((tx * 7 + ty * 3) % 11 === 0) { px(ctx, x + 6, y + 4, 1, 1, "#6a4a3a"); px(ctx, x + 6, y + 5, 1, 6, "#3a2a24"); }
  if (up) {
    px(ctx, x, y, TILE, 1, MPAL.concHi);
    px(ctx, x, y + 1, TILE, 1, "#34313c");
    if (stairs) {
      // a worn yellow nosing on each step, the paint half gone
      for (let k = 0; k < TILE; k += 2) if ((tx * 5 + k) % 7 !== 0) px(ctx, x + k, y + 1, 2, 2, (k / 2) % 2 ? MPAL.hazard : "#a88a34");
      px(ctx, x, y + 3, TILE, 1, MPAL.ink);
    }
  }
  if (dn) px(ctx, x, y + TILE - 1, TILE, 1, MPAL.ink);
  if (lf) { px(ctx, x, y, 1, TILE, MPAL.ink); px(ctx, x + 1, y, 1, TILE, MPAL.concHi); }
  if (rt) px(ctx, x + TILE - 1, y, 1, TILE, MPAL.ink);
}

function paintDeck(ctx: CanvasRenderingContext2D, level: Level, tx: number, ty: number, x: number, y: number, up: boolean, dn: boolean, lf: boolean, rt: boolean, R: () => number) {
  const abut = ty < 15;
  px(ctx, x, y, TILE, TILE, abut ? MPAL.conc : MPAL.deck);
  if (abut) {
    // the abutment: tall poured panels, a band of soot from the road above
    if (ty % 4 === 0) px(ctx, x, y, TILE, 1, MPAL.concLo);
    if (tx % 3 === 0) px(ctx, x + 8, y, 1, TILE, MPAL.concStain);
    if (R() < 0.15) px(ctx, x + 3, y + 5, 4, 7, "#26232c");
    if (up) { px(ctx, x, y, TILE, 2, MPAL.concHi); px(ctx, x, y + 2, TILE, 1, MPAL.ink); }
  } else {
    // the deck in section: the road on top, slab, and the girders' flanges below
    if (up) {
      px(ctx, x, y, TILE, 1, "#5a5666");
      px(ctx, x, y + 1, TILE, 2, "#26232d");
      if (tx % 2 === 0) px(ctx, x + 2, y - 5, 2, 5, "#3a3746"); // guardrail posts
      px(ctx, x, y - 4, TILE, 1, "#4a4656");
    }
    if (ty === 16) for (let k = 0; k < TILE; k += 4) px(ctx, x + k, y + 6, 2, 1, MPAL.deckLo);
    if (dn) {
      // the underside: a dripline, stalactites of lime, the girder flanges
      px(ctx, x, y + TILE - 3, TILE, 2, MPAL.deckLo);
      px(ctx, x, y + TILE - 1, TILE, 1, MPAL.ink);
      if (R() < 0.3) { px(ctx, x + Math.floor(R() * 14), y + TILE, 1, 2 + Math.floor(R() * 3), "#2e2c36"); }
      if (tx % 6 === 0) {
        // an I-beam under the slab
        px(ctx, x - 2, y + TILE, 14, 2, MPAL.girder);
        px(ctx, x - 2, y + TILE, 14, 1, MPAL.girderHi);
        px(ctx, x + 4, y + TILE + 2, 2, 3, MPAL.girder);
        px(ctx, x - 1, y + TILE + 5, 12, 2, MPAL.girder);
        px(ctx, x - 1, y + TILE + 7, 12, 1, MPAL.ink);
      }
    }
  }
  if (lf) px(ctx, x, y, 1, TILE, MPAL.ink);
  if (rt) px(ctx, x + TILE - 1, y, 1, TILE, MPAL.ink);
}

function paintGrate(ctx: CanvasRenderingContext2D, tx: number, ty: number, x: number, y: number, up: boolean, dn: boolean) {
  // steel grating where the slab fell: night sky and rain beyond the bars
  px(ctx, x, y, TILE, TILE, "#0d0c16");
  ctx.globalAlpha = 0.5;
  px(ctx, x, y, TILE, TILE, "#1a1830");
  ctx.globalAlpha = 1;
  for (let k = 0; k < TILE; k += 4) { px(ctx, x + k, y, 1, TILE, MPAL.steelLo); px(ctx, x, y + k, TILE, 1, MPAL.steelLo); }
  for (let k = 1; k < TILE; k += 4) px(ctx, x + k, y, 1, TILE, MPAL.steel);
  if (ty === 15) { px(ctx, x, y, TILE, 2, MPAL.steelHi); px(ctx, x, y + 2, TILE, 1, MPAL.ink); }
  if (dn) {
    px(ctx, x, y + TILE - 2, TILE, 2, MPAL.steel);
    px(ctx, x, y + TILE - 1, TILE, 1, MPAL.ink);
    if (tx % 2 === 0) { ctx.globalAlpha = 0.5; px(ctx, x + 7, y + TILE, 1, 3, "#8aa0d0"); ctx.globalAlpha = 1; } // drips
  }
}

function paintCrate(ctx: CanvasRenderingContext2D, tx: number, ty: number, x: number, y: number, up: boolean, lf: boolean, rt: boolean) {
  px(ctx, x, y, TILE, TILE, MPAL.crate);
  for (let k = 0; k < TILE; k += 5) px(ctx, x, y + k, TILE, 1, MPAL.crateLo);
  px(ctx, x, y, 2, TILE, MPAL.crateLo);
  px(ctx, x + TILE - 2, y, 2, TILE, MPAL.crateLo);
  if ((tx + ty) % 2 === 0) { ctx.globalAlpha = 0.6; for (let i = 0; i < TILE - 4; i++) px(ctx, x + 2 + i, y + 2 + Math.floor(i * 0.8), 1, 1, MPAL.crateHi); ctx.globalAlpha = 1; }
  if ((tx * 3 + ty) % 4 === 1) { px(ctx, x + 4, y + 5, 8, 4, "#c8c0a0"); px(ctx, x + 5, y + 6, 6, 1, "#5a5040"); } // a stencilled label
  if (up) { px(ctx, x, y, TILE, 1, MPAL.crateHi); px(ctx, x, y + 1, TILE, 1, "#7a5a3c"); }
  if (lf) px(ctx, x, y, 1, TILE, MPAL.ink);
  if (rt) px(ctx, x + TILE - 1, y, 1, TILE, MPAL.ink);
}

/** A stall's canvas awning: stripes, a scalloped hem, a frame pole at each end. */
function paintAwning(ctx: CanvasRenderingContext2D, tx: number, x: number, y: number, lf: boolean, rt: boolean, scheme: number) {
  const [a, b] = scheme === 0 ? ["#a83a34", "#d8c8a8"] : ["#2f6a70", "#9ab0a8"];
  for (let k = 0; k < TILE; k++) {
    const stripe = Math.floor((x + k) / 5) % 2 === 0;
    px(ctx, x + k, y, 1, 4, stripe ? a : b);
    const hem = 4 + (((x + k) % 8) < 4 ? 1 : 0);
    px(ctx, x + k, y + 4, 1, hem - 4 + 1, stripe ? a : b);
  }
  px(ctx, x, y, TILE, 1, "#f0e0c8");
  ctx.globalAlpha = 0.35;
  px(ctx, x, y + 3, TILE, 2, "#000");
  ctx.globalAlpha = 1;
  px(ctx, x, y + 6, TILE, 1, MPAL.ink);
  if (lf) { px(ctx, x, y, 1, 7, MPAL.ink); px(ctx, x + 1, y + 7, 2, 9, "#3a3540"); }
  if (rt) { px(ctx, x + TILE - 1, y, 1, 7, MPAL.ink); px(ctx, x + TILE - 3, y + 7, 2, 9, "#3a3540"); }
}

/** Steel walkways and catwalks: open grating, a rail, posts. */
function paintCatwalk(ctx: CanvasRenderingContext2D, tx: number, x: number, y: number, lf: boolean, rt: boolean) {
  px(ctx, x, y, TILE, 1, MPAL.steelHi);
  px(ctx, x, y + 1, TILE, 3, MPAL.steel);
  for (let k = 0; k < TILE; k += 3) px(ctx, x + k, y + 1, 1, 3, MPAL.steelLo);
  px(ctx, x, y + 4, TILE, 1, MPAL.ink);
  // the handrail, waist high
  px(ctx, x, y - 12, TILE, 1, "#59616e");
  if (tx % 2 === 0 || lf || rt) px(ctx, lf ? x : rt ? x + TILE - 2 : x + 7, y - 12, 1, 12, "#454c57");
  if (lf || rt || tx % 4 === 0) px(ctx, lf ? x + 1 : rt ? x + TILE - 3 : x + 7, y + 5, 2, 11, MPAL.steelLo);
  if (lf) px(ctx, x, y, 1, 5, MPAL.ink);
  if (rt) px(ctx, x + TILE - 1, y, 1, 5, MPAL.ink);
}

/** Neon and lantern light pooled on the floor, and rain sheen where the sky is open. */
export function paintMarketReflections(level: Level): HTMLCanvasElement {
  const { c, ctx } = canvas(level.pixelW, level.pixelH);
  const R = rng(91);
  const floorY = (tx: number) => { for (let ty = 19; ty < level.h; ty++) if (level.get(tx, ty) === SOLID) return ty * TILE; return -1; };
  const pools: [number, string, number][] = [];
  for (const d of level.decos) {
    if (d.kind === "lantern") pools.push([d.x * TILE + 4, "#ffb060", 0.22]);
    if (d.kind === "neon") pools.push([d.x * TILE + ((d.w ?? 3) * TILE) / 2, d.variant ? "#4fe0e0" : "#ff4f8a", 0.3]);
    if (d.kind === "eden") pools.push([d.x * TILE + 48, "#ffc8e0", 0.25]);
    if (d.kind === "yeonmu") pools.push([d.x * TILE + 32, "#7fe0d0", 0.25]);
    if (d.kind === "laplace") pools.push([d.x * TILE + 40, "#6ad8c8", 0.28]);
  }
  for (const [x, col, a] of pools) {
    const fy = floorY(Math.floor(x / TILE));
    if (fy < 0) continue;
    for (let i = 0; i < 9; i++) {
      const w = 6 + Math.floor(R() * 16);
      ctx.globalAlpha = a * (1 - i / 10);
      px(ctx, Math.round(x - w / 2 + (R() - 0.5) * 30), fy + 1 + Math.floor(i / 3), w, 1, col);
    }
  }
  ctx.globalAlpha = 1;
  const inside = (tx: number) => level.rooms.some((r) => tx >= r.x0 && tx <= r.x1);
  for (let tx = 0; tx < level.w; tx++) {
    if (inside(tx)) continue;
    const fy = floorY(tx);
    if (fy < 0 || R() > 0.5) continue;
    const w = 4 + Math.floor(R() * 10);
    ctx.globalAlpha = 0.12 + R() * 0.12;
    px(ctx, tx * TILE + Math.floor(R() * (TILE - 4)), fy + 2, w, 1, "#b8c8ff");
  }
  ctx.globalAlpha = 1;
  return c;
}

// ---------------------------------------------------------- backgrounds

export function paintMarketSky(w: number, h: number): HTMLCanvasElement {
  const { c, ctx } = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#06050c");
  g.addColorStop(0.5, "#141022");
  g.addColorStop(0.8, "#2a1630");
  g.addColorStop(1, "#40202e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const R = rng(23);
  for (let i = 0; i < 22; i++) {
    const cx = R() * w, cy = h * (0.1 + R() * 0.5), rw = 50 + R() * 120, rh = 8 + R() * 18;
    ctx.globalAlpha = 0.16 + R() * 0.16;
    ctx.fillStyle = R() < 0.3 ? "#2a1e3c" : "#160f24";
    ctx.beginPath(); ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const hg = ctx.createRadialGradient(w * 0.5, h * 1.1, 10, w * 0.5, h * 1.1, w * 0.75);
  hg.addColorStop(0, "rgba(255,140,120,0.32)");
  hg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/** The far layer: the upper city's towers, seen past the overpass. */
export function paintUpperCity(W: number): HTMLCanvasElement {
  return paintSkyline(W, 73, {
    minTop: 60, maxTop: 190, minW: 26, maxW: 64, body: "#120d1e", rim: "#221a34",
    winCols: ["#ff6f91", "#4fd8d0", "#f9c871", "#8a6ae0"], winChance: 0.08, signs: 6, antenna: true,
  });
}

/** The mid layer: the lower city packed under the roads, lit windows and hanging signs. */
export function paintUndercity(W: number): HTMLCanvasElement {
  const H = VIEW_H + 120;
  const { c, ctx } = canvas(W, H);
  const R = rng(311);
  let x = 0;
  while (x < W) {
    const w = 30 + Math.floor(R() * 60);
    const top = 170 + Math.floor(R() * 90);
    px(ctx, x, top, w, H - top, "#0e0b15");
    px(ctx, x, top, w, 1, "#241c30");
    // balconies and a stack of add-on rooms
    if (R() < 0.6) { const bw = Math.floor(w * 0.6); px(ctx, x + 4, top - 18, bw, 18, "#0e0b15"); px(ctx, x + 4, top - 18, bw, 1, "#241c30"); }
    for (let yy = top + 8; yy < H - 20; yy += 11) for (let xx = x + 4; xx < x + w - 6; xx += 8) {
      if (R() > 0.22) continue;
      const col = R() < 0.6 ? "#ffb060" : R() < 0.5 ? "#6ab8e8" : "#ff6f91";
      ctx.globalAlpha = 0.5; px(ctx, xx, yy, 4, 4, col);
      ctx.globalAlpha = 0.1; px(ctx, xx - 3, yy - 3, 10, 10, col); ctx.globalAlpha = 1;
    }
    // a vertical sign, sometimes
    if (R() < 0.35) {
      const sx = x + Math.floor(R() * (w - 8)), sy = top + 10 + Math.floor(R() * 30);
      const col = ["#ff4f8a", "#4fe0e0", "#f9c871"][Math.floor(R() * 3)];
      ctx.globalAlpha = 0.55; px(ctx, sx, sy, 6, 26, col);
      ctx.globalAlpha = 0.12; px(ctx, sx - 5, sy - 5, 16, 36, col); ctx.globalAlpha = 1;
      for (let k = 0; k < 4; k++) px(ctx, sx + 1, sy + 3 + k * 6, 4, 3, "#140e18");
    }
    x += w + Math.floor(R() * 3);
  }
  // pipes and cables strung across
  ctx.strokeStyle = "#1a1424";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const y = 150 + R() * 80, a = R() * W, b = a + 80 + R() * 160;
    ctx.beginPath(); ctx.moveTo(a, y); ctx.quadraticCurveTo((a + b) / 2, y + 20, b, y); ctx.stroke();
  }
  return c;
}

// ---------------------------------------------------------- decorations

const KOREAN_NAMES = (() => {
  const fam = "김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉사부황";
  const giv = "민서지현우준영수진하윤아은호재성혜연희정훈태동경미선주원상철석빈환규나리소";
  const R = rng(1204);
  const out: string[] = [];
  for (let i = 0; i < 140; i++) {
    const f = fam[Math.floor(R() * fam.length)];
    const a = giv[Math.floor(R() * giv.length)], b = giv[Math.floor(R() * giv.length)];
    out.push(R() < 0.12 ? f + a : f + a + b);
  }
  return out;
})();

/** Set dressing for the market, by deco kind. Returns null for kinds drawn elsewhere. */
export function paintMarketDeco(kind: string, w = 1, h = 1, variant = 0): HTMLCanvasElement | null {
  const T = TILE;
  switch (kind) {
    case "pier": {
      // a concrete pier holding the deck up
      const W = w * T, H = 11 * T;
      const { c, ctx } = canvas(W + 8, H);
      px(ctx, 4, 0, W, H, "#25232c");
      px(ctx, 4, 0, 2, H, "#34313c");
      px(ctx, W + 2, 0, 2, H, "#18161d");
      for (let y = 10; y < H; y += 26) px(ctx, 4, y, W, 1, "#1c1a21");
      px(ctx, 0, 0, W + 8, 6, "#2c2a33"); px(ctx, 0, 6, W + 8, 1, MPAL.ink); // capital
      ctx.globalAlpha = 0.5; for (let i = 0; i < 6; i++) px(ctx, 8 + (i * 7) % (W - 6), 20 + i * 23, 3, 9, "#1a181f"); ctx.globalAlpha = 1;
      return c;
    }
    case "pierTall": {
      const W = w * T, H = 30 * T;
      const { c, ctx } = canvas(W, H);
      px(ctx, 0, 0, W, H, "#201e27");
      px(ctx, 0, 0, 2, H, "#2e2b36");
      for (let y = 0; y < H; y += 40) px(ctx, 0, y, W, 1, "#16141b");
      for (let y = 30; y < H; y += 80) { px(ctx, 6, y, W - 12, 3, "#3a3542"); px(ctx, 6, y + 3, W - 12, 1, MPAL.ink); }
      return c;
    }
    case "cables": {
      // bundles of cable slung from the girders, drooping between hangers
      const W = w * T;
      const { c, ctx } = canvas(W, 30);
      const R = rng(W + 7);
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = ["#0e0c12", "#1c1622", "#2a1c20"][k];
        ctx.lineWidth = k === 0 ? 2 : 1;
        let x0 = Math.floor(R() * 20);
        while (x0 < W) {
          const span = 60 + Math.floor(R() * 80), sag = 6 + R() * 12;
          ctx.beginPath(); ctx.moveTo(x0, 2 + k * 2); ctx.quadraticCurveTo(x0 + span / 2, 2 + k * 2 + sag * 2, x0 + span, 2 + k * 2); ctx.stroke();
          x0 += span;
        }
      }
      return c;
    }
    case "rail": {
      // the stair's handrail, stepping down with the stairs (2 tiles per step)
      const W = w * T;
      const { c, ctx } = canvas(W, (w / 2 + 2) * T);
      for (let i = 0; i < w / 2; i++) {
        const x = i * 2 * T, y = i * T;
        px(ctx, x + 2, y + 2, 1, 14, "#4a4656");
      }
      ctx.strokeStyle = "#6a6676"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(W, (w / 2) * T + 2); ctx.stroke();
      return c;
    }
    case "noodlestall": {
      // a noodle cart: a steaming pot, bowls, a red lantern with "국수"
      const W = w * T, H = 64;
      const { c, ctx } = canvas(W, H);
      px(ctx, 6, 40, W - 12, 24, "#3a2a22"); px(ctx, 6, 40, W - 12, 2, "#5a4232"); px(ctx, 6, 62, W - 12, 2, MPAL.ink);
      for (let x = 10; x < W - 12; x += 7) px(ctx, x, 44, 1, 18, "#2a1e18");
      px(ctx, 4, 36, W - 8, 4, "#6a5040"); px(ctx, 4, 36, W - 8, 1, "#8a6a50");
      // the pot and its steam
      px(ctx, 16, 24, 22, 12, "#7a7e88"); px(ctx, 16, 24, 22, 2, "#a8acb4"); px(ctx, 14, 26, 2, 4, "#5a5e68"); px(ctx, 38, 26, 2, 4, "#5a5e68");
      for (let i = 0; i < 4; i++) { px(ctx, 50 + i * 9, 32, 7, 4, "#e8e4d8"); px(ctx, 51 + i * 9, 32, 5, 1, "#c84a30"); }
      px(ctx, 70, 30, 14, 6, "#2a2a32"); px(ctx, 71, 31, 3, 3, "#c8a040"); // a tin of chopsticks, a ladle
      // the sign
      px(ctx, W - 30, 4, 22, 18, "#a83a34"); px(ctx, W - 30, 4, 22, 1, "#d8584c");
      pixelText(ctx, "국수", W - 19, 6, 11, "#ffe8c8", "center", 0.45, "#5a1a14");
      return c;
    }
    case "partsstall": {
      // salvaged parts: a table of circuit boards, CRTs, a scale; "부품 삽니다"
      const W = w * T, H = 64;
      const { c, ctx } = canvas(W, H);
      px(ctx, 4, 42, W - 8, 4, "#3a3a44"); px(ctx, 4, 42, W - 8, 1, "#5a5a66");
      px(ctx, 8, 46, 2, 18, "#2a2a32"); px(ctx, W - 10, 46, 2, 18, "#2a2a32");
      for (let i = 0; i < 5; i++) { px(ctx, 10 + i * 18, 36, 14, 6, ["#2a4a40", "#3a3040", "#2a3a4a", "#404030", "#2a4a40"][i]); for (let k = 0; k < 4; k++) px(ctx, 11 + i * 18 + k * 3, 37, 1, 1, "#c8a040"); }
      // two CRTs, one alive
      px(ctx, 20, 16, 22, 18, "#2a2830"); px(ctx, 23, 19, 16, 12, "#0c1418"); px(ctx, 24, 20, 14, 10, "#1a4a48");
      ctx.globalAlpha = 0.6; for (let y = 20; y < 30; y += 2) px(ctx, 24, y, 14, 1, "#2a6a68"); ctx.globalAlpha = 1;
      px(ctx, 48, 20, 18, 14, "#2a2830"); px(ctx, 51, 22, 12, 10, "#0a0a0e");
      px(ctx, 76, 26, 14, 10, "#6a6e78"); px(ctx, 80, 22, 6, 4, "#8a8e98"); // a scale
      px(ctx, 4, 0, 62, 15, "#1c2a30"); px(ctx, 4, 0, 62, 1, "#3a5a60");
      pixelText(ctx, "부품 삽니다", 35, 1, 11, "#9ff0e8", "center", 0.42);
      return c;
    }
    case "yeonmu": {
      // 연무 의원: a lightbox over a clinic door, a green cross; what it promises, small
      const W = w * T, H = h * T;
      const { c, ctx } = canvas(W, H);
      px(ctx, 0, 0, W, H, "#0e1a1c"); px(ctx, 1, 1, W - 2, H - 2, "#d8f0ea");
      px(ctx, 2, 2, W - 4, H - 4, "#c8e8e0");
      px(ctx, 8, 6, 4, 12, "#2fb88a"); px(ctx, 4, 10, 12, 4, "#2fb88a");
      pixelText(ctx, "연무 의원", W / 2 + 8, 5, 12, "#183c3a", "center");
      px(ctx, 6, 24, W - 12, 1, "#9ad0c4");
      pixelText(ctx, "팔다리 교체", W / 2, 28, 9, "#2a5a54", "center", 0.5);
      pixelText(ctx, "기억 보존", W / 2, 40, 9, "#2a5a54", "center", 0.5);
      px(ctx, 6, H - 10, W - 12, 6, "#2fb88a");
      pixelText(ctx, "24시", W / 2, H - 11, 7, "#e8fff8", "center", 0.55);
      return c;
    }
    case "door": {
      const { c, ctx } = canvas(28, 44);
      px(ctx, 0, 0, 28, 44, "#1c2a2c"); px(ctx, 2, 2, 24, 42, "#12201f");
      px(ctx, 4, 4, 20, 16, "#3a6a64"); ctx.globalAlpha = 0.5; px(ctx, 4, 4, 20, 16, "#9ae0d0"); ctx.globalAlpha = 1;
      px(ctx, 20, 26, 2, 4, "#8a9aa0");
      return c;
    }
    case "rationboard": {
      // 권하린's ration table, chalked by hand on a board bolted to the pier
      const W = w * T, H = h * T;
      const { c, ctx } = canvas(W, H);
      px(ctx, 0, 0, W, H, "#3a2e22"); px(ctx, 2, 2, W - 4, H - 4, "#1e2a24");
      pixelText(ctx, "전력 배급표", W / 2, 4, 10, "#f0ead8", "center");
      px(ctx, 5, 17, W - 10, 1, "#8a9a8a");
      const rows = [["1구역", "18-20"], ["2구역", "20-22"], ["3구역", "22-24"]];
      rows.forEach(([a1, b1], i) => {
        const col = i === 2 ? "#ffd27a" : "#d8d8c8";
        pixelText(ctx, a1, 6, 21 + i * 12, 9, col, "left", 0.5);
        pixelText(ctx, b1, W - 6, 21 + i * 12, 9, col, "right", 0.5);
      });
      // today's cut, scored through and rewritten
      px(ctx, 44, 51, 30, 1, "#ff6f61");
      pixelText(ctx, "-2시간", W - 6, 55, 8, "#ff8a70", "right", 0.5);
      pixelText(ctx, "권하린", 6, H - 13, 9, "#a8b8a8", "left", 0.5);
      return c;
    }
    case "lantern": {
      const { c, ctx } = canvas(10, 30);
      px(ctx, 4, 0, 1, 14, "#2a2630");
      px(ctx, 1, 14, 8, 11, "#d8582c"); px(ctx, 2, 15, 6, 9, "#ff9a50"); px(ctx, 3, 16, 4, 7, "#ffd090");
      px(ctx, 1, 14, 8, 1, "#3a1a10"); px(ctx, 1, 24, 8, 1, "#3a1a10"); px(ctx, 4, 25, 1, 3, "#c8402a");
      return c;
    }
    case "neon": {
      // second-hand neon: a pink 약 cross, or a cyan 수리
      const W = w * T, H = h * T;
      const { c, ctx } = canvas(W, H);
      px(ctx, 0, 0, W, H, "#0c0a12"); px(ctx, 0, 0, W, 1, "#2a2434");
      const col = variant ? MPAL.neonCyan : MPAL.neonPink;
      pixelText(ctx, variant ? "수리" : "약국", W / 2, 4, 14, col, "center", 0.4);
      return c;
    }
    case "namewall": {
      // the name wall: a pier face covered in chalk, names on names; blank near the middle
      const W = w * T, H = h * T;
      const { c, ctx } = canvas(W, H);
      px(ctx, 0, 0, W, H, "#26242d");
      px(ctx, 0, 0, W, 6, "#2c2a33"); px(ctx, 0, 6, W, 1, MPAL.ink);
      for (let y = 30; y < H; y += 34) px(ctx, 0, y, W, 1, "#1e1c24");
      const R = rng(222);
      let i = 0;
      for (let y = 12; y < H - 12; y += 12) {
        let x = 4 + Math.floor(R() * 10);
        while (x < W - 24) {
          // the clear patch where he writes (near the middle, at chest height)
          const free = x > W / 2 - 34 && x < W / 2 + 14 && y > H - 74 && y < H - 40;
          if (!free) {
            const n = KOREAN_NAMES[i++ % KOREAN_NAMES.length];
            const a = 0.35 + R() * 0.45;
            ctx.globalAlpha = a;
            pixelText(ctx, n, x, y + Math.floor(R() * 3), 8, R() < 0.12 ? "#f0c8c8" : R() < 0.1 ? "#c8e0f0" : MPAL.chalk, "left", 0.55);
            ctx.globalAlpha = 1;
          }
          x += 30 + Math.floor(R() * 14);
        }
      }
      // smudges where names were wiped and written over
      ctx.globalAlpha = 0.25;
      for (let k = 0; k < 10; k++) px(ctx, Math.floor(R() * (W - 30)), 12 + Math.floor(R() * (H - 30)), 20 + Math.floor(R() * 20), 6, "#8a8890");
      ctx.globalAlpha = 1;
      return c;
    }
    case "namewritten": {
      // his chalk: 백서윤, fresh and bright
      const { c, ctx } = canvas(48, 16);
      pixelText(ctx, "백서윤", 24, 1, 11, "#fffaf0", "center", 0.42);
      return c;
    }
    case "crate": {
      const { c, ctx } = canvas(16, 12);
      px(ctx, 0, 0, 16, 12, MPAL.crate); px(ctx, 0, 0, 16, 1, MPAL.crateHi); px(ctx, 0, 6, 16, 1, MPAL.crateLo);
      px(ctx, 0, 0, 1, 12, MPAL.ink); px(ctx, 15, 0, 1, 12, MPAL.ink); px(ctx, 0, 11, 16, 1, MPAL.ink);
      return c;
    }
    case "shutter": {
      // a rolled-down shop shutter: slats, a padlock, old graffiti
      const W = w * T, H = h * T;
      const { c, ctx } = canvas(W, H);
      px(ctx, 0, 0, W, H, "#3a3e46");
      for (let y = 4; y < H; y += 3) px(ctx, 0, y, W, 1, "#262a31");
      px(ctx, 0, 0, W, 4, "#22252c"); px(ctx, 0, 3, W, 1, "#4a505a");
      px(ctx, 0, 0, 1, H, MPAL.ink); px(ctx, W - 1, 0, 1, H, MPAL.ink);
      px(ctx, W / 2 - 2, H - 7, 4, 5, "#b8a050"); px(ctx, W / 2 - 1, H - 9, 2, 2, "#8a8a90");
      const R = rng(W * 31 + H);
      ctx.globalAlpha = 0.55;
      for (let k = 0; k < 3; k++) px(ctx, Math.floor(R() * (W - 14)), 8 + Math.floor(R() * (H - 20)), 8 + Math.floor(R() * 10), 3, ["#c8406a", "#40a8a0", "#e8d8a0"][k]);
      ctx.globalAlpha = 1;
      return c;
    }
    case "doorway": {
      // an open shop door: warm light, a curtain of plastic strips
      const W = w * T, H = h * T;
      const { c, ctx } = canvas(W, H);
      px(ctx, 0, 0, W, H, "#2a2026");
      px(ctx, 2, 2, W - 4, H - 2, "#ffb870");
      const g = ctx.createLinearGradient(0, 2, 0, H);
      g.addColorStop(0, "rgba(255,230,180,0.6)"); g.addColorStop(1, "rgba(160,80,40,0.4)");
      ctx.fillStyle = g; ctx.fillRect(2, 2, W - 4, H - 2);
      ctx.globalAlpha = 0.45; for (let x = 3; x < W - 3; x += 3) px(ctx, x, 2, 1, H - 6, "#fff4e0"); ctx.globalAlpha = 1;
      return c;
    }
    case "eden": {
      // Eden's poster: a soft dusk, a long table laid for a family. "아픔 없는 저녁"
      const W = w * T, H = h * T;
      const { c, ctx } = canvas(W, H);
      px(ctx, 0, 0, W, H, "#e8e0e8");
      const g = ctx.createLinearGradient(0, 2, 0, H - 2);
      g.addColorStop(0, "#f6c8d8"); g.addColorStop(0.55, "#f8e0c8"); g.addColorStop(1, "#c8b8e8");
      ctx.fillStyle = g; ctx.fillRect(2, 2, W - 4, H - 4);
      ctx.fillStyle = "rgba(255,240,200,0.9)"; ctx.beginPath(); ctx.arc(W - 22, 26, 9, 0, Math.PI * 2); ctx.fill();
      px(ctx, 10, H - 26, W - 24, 3, "#8a6a7a");
      for (let i = 0; i < 4; i++) { px(ctx, 14 + i * 16, H - 36, 6, 10, "#6a4a6a"); px(ctx, 15 + i * 16, H - 40, 4, 4, "#e8c8b8"); }
      pixelText(ctx, "에덴", 8, 5, 18, "#ffffff", "left", 0.4, "#b07090");
      pixelText(ctx, "아픔 없는 저녁", 9, 27, 9, "#7a4a6a", "left", 0.5);
      pixelText(ctx, "백야 메디컬 · 입소 상담", W - 6, H - 12, 7, "#8a6a8a", "right", 0.55);
      return c;
    }
    case "anvil": {
      // 강만식's corner: an anvil on a stump, a quench bucket, tongs
      const { c, ctx } = canvas(40, 26);
      px(ctx, 6, 14, 14, 12, "#3a2a20"); px(ctx, 6, 14, 14, 1, "#5a4232");
      px(ctx, 2, 6, 24, 5, "#4a4e58"); px(ctx, 2, 6, 24, 1, "#7a808c"); px(ctx, 0, 7, 3, 3, "#4a4e58"); px(ctx, 9, 11, 10, 3, "#3a3e48");
      px(ctx, 28, 16, 10, 10, "#3a3e48"); px(ctx, 29, 16, 8, 2, "#5a7a8a"); // the bucket
      px(ctx, 24, 2, 1, 12, "#6a6e78"); px(ctx, 26, 2, 1, 12, "#6a6e78");
      return c;
    }
    case "bazaarshut": {
      // the Forgotten Bazaar: a shutter with a violet eye, closed. "망각시장 · 휴업"
      const W = w * T, H = h * T;
      const { c, ctx } = canvas(W, H);
      px(ctx, 0, 0, W, H, "#2a2436");
      for (let y = 4; y < H; y += 3) px(ctx, 0, y, W, 1, "#1c1826");
      px(ctx, 0, 0, W, 4, "#16121e");
      ctx.strokeStyle = "#b967ff"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(W / 2, 26, 14, 8, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#d8b0ff"; ctx.beginPath(); ctx.arc(W / 2, 26, 3, 0, Math.PI * 2); ctx.fill();
      pixelText(ctx, "망각시장", W / 2, 44, 10, "#d8b0ff", "center", 0.45);
      pixelText(ctx, "휴업", W / 2, 58, 8, "#8a70b0", "center", 0.5);
      return c;
    }
    case "laplace": {
      // the Laplace gate: a scanner arch, a cold sign. "범죄 지수 3.1% 이상 출입 제한"
      const W = w * T, H = h * T;
      const { c, ctx } = canvas(W, H);
      px(ctx, 0, 0, 8, H, "#2a3036"); px(ctx, W - 8, 0, 8, H, "#2a3036");
      px(ctx, 0, 0, W, 10, "#2a3036"); px(ctx, 0, 0, W, 1, "#4a5660");
      px(ctx, 2, 12, 4, H - 14, "#16302e"); px(ctx, W - 6, 12, 4, H - 14, "#16302e");
      for (let y = 14; y < H - 4; y += 6) { px(ctx, 3, y, 2, 3, "#3ad8c0"); px(ctx, W - 5, y, 2, 3, "#3ad8c0"); }
      px(ctx, 10, 14, W - 20, 30, "#0c1a1a"); px(ctx, 10, 14, W - 20, 1, "#3a6a64");
      pixelText(ctx, "라플라스 예측 치안", W / 2, 16, 7, "#6ad8c8", "center", 0.55);
      pixelText(ctx, "범죄 지수 3.1%", W / 2, 25, 9, "#ffffff", "center", 0.45);
      pixelText(ctx, "이상 출입 제한", W / 2, 35, 8, "#ff8a8a", "center", 0.5);
      return c;
    }
    case "muyeong": {
      // the one-armed mark: a figure with one arm and a sword, sprayed; "무영은 돌아온다"
      const W = w * T, H = h * T;
      const { c, ctx } = canvas(W, H);
      const red = "#d8403a", white = "#e8e0d0";
      ctx.globalAlpha = 0.9;
      px(ctx, 34, 8, 8, 8, red);                 // head
      px(ctx, 32, 16, 12, 22, red);              // body
      px(ctx, 44, 18, 14, 3, red);               // the one arm
      px(ctx, 56, 4, 2, 30, white);              // the sword raised
      px(ctx, 28, 18, 4, 2, "#6a2420");          // a stump where the other was
      px(ctx, 32, 38, 4, 10, red); px(ctx, 40, 38, 4, 10, red);
      for (let k = 0; k < 6; k++) px(ctx, 30 + k * 3, 48 + (k % 2), 1, 3 + (k % 3), red); // drips
      ctx.globalAlpha = 1;
      pixelText(ctx, "무영은", 4, 52, 10, white, "left", 0.4);
      pixelText(ctx, "돌아온다", 4, 64, 10, white, "left", 0.4);
      return c;
    }
    case "floodlight": {
      const { c, ctx } = canvas(20, 13 * T);
      px(ctx, 9, 8, 2, 13 * T - 8, "#2a2e36");
      px(ctx, 2, 0, 16, 8, "#3a3e48"); px(ctx, 4, 6, 12, 3, "#f8f0d8");
      return c;
    }
    case "lift": {
      // the freight lift: a steel cage, hazard stripes, "화물 승강기"
      const W = w * T, H = 12 * T;
      const { c, ctx } = canvas(W, H);
      px(ctx, 0, 0, 4, H, "#3a3e46"); px(ctx, W - 4, 0, 4, H, "#3a3e46");
      for (let y = 0; y < H; y += 18) { ctx.strokeStyle = "#2a2e36"; ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(W - 4, y + 18); ctx.moveTo(W - 4, y); ctx.lineTo(4, y + 18); ctx.stroke(); }
      px(ctx, 0, H - 8, W, 8, "#2a2e36");
      for (let x = 0; x < W; x += 8) px(ctx, x, H - 8, 4, 3, MPAL.hazard);
      px(ctx, 10, 30, W - 20, 14, "#1a1e24"); px(ctx, 10, 30, W - 20, 1, "#4a505a");
      pixelText(ctx, "화물 승강기", W / 2, 32, 9, "#f2c43a", "center", 0.45);
      return c;
    }
    case "stairsign": {
      const { c, ctx } = canvas(44, 40);
      px(ctx, 20, 14, 3, 26, "#2a2630");
      px(ctx, 0, 0, 44, 16, "#3a3028"); px(ctx, 0, 0, 44, 1, "#5a4a3a");
      pixelText(ctx, "하층 시장", 22, 2, 9, "#f2c43a", "center", 0.45);
      return c;
    }
    case "terminal": {
      // an undercity emergency terminal (checkpoint); a scrawl beside it
      const { c, ctx } = canvas(40, 44);
      px(ctx, 14, 6, 14, 38, "#26303a"); px(ctx, 14, 6, 14, 1, "#3e4a58");
      px(ctx, 16, 10, 10, 8, "#0a1a1c"); px(ctx, 17, 11, 8, 6, "#1a6a68");
      px(ctx, 17, 22, 3, 2, "#9a9aa4"); px(ctx, 22, 22, 3, 2, "#9a9aa4"); px(ctx, 17, 26, 8, 2, "#9a9aa4");
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 9; i++) px(ctx, 2 + i * 4, 30 + (i % 2), 3, 1, "#e8e4d8");
      ctx.globalAlpha = 1;
      return c;
    }
    default:
      return null;
  }
}

/** A hidden nook, painted as the wall in front of it (fades when he steps inside). */
export function paintSecretCover(wT: number, hT: number): HTMLCanvasElement {
  const { c, ctx } = canvas(wT * TILE, hT * TILE);
  const R = rng(wT * 13 + hT);
  for (let ty = 0; ty < hT; ty++) for (let tx = 0; tx < wT; tx++) paintConcrete(ctx, tx, ty + 26, tx * TILE, ty * TILE, false, false, false, false, false, R);
  return c;
}
