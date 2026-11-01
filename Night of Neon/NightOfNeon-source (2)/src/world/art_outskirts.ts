// STAGE 1 art: the Outskirts. Where the city's light runs out: shacks of
// tin and old planks on wet ground, laundry lines and leaning poles, and far
// off across the rain the neon city with the Spire's white light. Warm bulbs
// inside; outside, cold rain and the orange of the squad's incinerators.
// Also the furniture of Doj-in's house, the recovery truck and the
// incinerator drone.

import { Level, SOLID, ONEWAY, MAT } from "./level";
import { TILE, VIEW_H } from "../config";
import { canvas, px, rng, paintSkyline } from "./art";

export const OPAL = {
  ink: "#06040a",
  dirt: "#221a25", dirt2: "#2a2030", dirtDeep: "#120d16", dirtHi: "#463a4c", mud: "#19121c",
  wet: "#7c8cb0", wetLo: "#3c4462", grass: "#253128", grassHi: "#3a4a38",
  wood: "#2c201b", woodSeam: "#170f0c", woodHi: "#3d2c24", woodLo: "#221812",
  tin: "#353b44", tinLo: "#262a31", tinHi: "#5d6672", rust: "#5a3324", rust2: "#7a4628",
  crate: "#4a3524", crateHi: "#634831", crateLo: "#2e2016",
  block: "#2a2731", blockHi: "#3b3744", blockLo: "#1b1921",
  plank: "#5e4636", plankHi: "#7d6050", plankLo: "#3a281e",
  warm: "#ffc070", warmLo: "#a8602a", teal: "#4fd8d0", orange: "#ff8a3a",
};

// ------------------------------------------------------------------ tiles

export function paintOutskirtsLevel(level: Level): HTMLCanvasElement {
  const W = level.pixelW, H = level.pixelH;
  const { c, ctx } = canvas(W, H);
  const R = rng(4417);
  const solid = (x: number, y: number) => level.get(x, y) === SOLID;
  const open = (x: number, y: number) => !solid(x, y);

  // back walls of the rooms first: the house and the shed
  for (const r of level.rooms) paintRoomWall(ctx, level, r, R);

  for (let ty = 0; ty < level.h; ty++)
    for (let tx = 0; tx < level.w; tx++) {
      const t = level.get(tx, ty);
      const x = tx * TILE, y = ty * TILE;
      if (t === SOLID) {
        const m = level.matAt(tx, ty);
        const up = open(tx, ty - 1) && ty > 0, dn = open(tx, ty + 1), lf = open(tx - 1, ty), rt = open(tx + 1, ty);
        if (m === MAT.ground) paintGround(ctx, level, tx, ty, x, y, up, lf, rt, R);
        else if (m === MAT.wood) paintWood(ctx, tx, ty, x, y, up, dn, lf, rt);
        else if (m === MAT.tin) paintTin(ctx, tx, ty, x, y, up, dn, lf, rt, R);
        else if (m === MAT.crate) paintCrate(ctx, tx, ty, x, y, up, lf, rt);
        else paintBlock(ctx, tx, ty, x, y, up, dn, lf, rt);
      } else if (t === ONEWAY) {
        const lfw = level.get(tx - 1, ty) !== ONEWAY, rtw = level.get(tx + 1, ty) !== ONEWAY;
        px(ctx, x, y, TILE, 1, OPAL.plankHi);
        px(ctx, x, y + 1, TILE, 3, OPAL.plank);
        px(ctx, x, y + 4, TILE, 1, OPAL.plankLo);
        px(ctx, x, y + 5, TILE, 1, OPAL.ink);
        if (tx % 2 === 0) px(ctx, x + 7, y + 1, 1, 3, OPAL.plankLo); // board ends
        if (tx % 3 === 0) px(ctx, x + 3, y + 2, 1, 1, "#9a8070");
        // posts and cross-braces underneath
        if (lfw || rtw || tx % 4 === 0) {
          const sx = rtw ? x + TILE - 3 : x + 1;
          px(ctx, sx, y + 6, 2, 10, OPAL.woodLo);
          px(ctx, sx, y + 6, 1, 10, OPAL.wood);
        }
        if (lfw) px(ctx, x, y, 1, 5, OPAL.ink);
        if (rtw) px(ctx, x + TILE - 1, y, 1, 5, OPAL.ink);
      }
    }
  return c;
}

function paintGround(ctx: CanvasRenderingContext2D, level: Level, tx: number, ty: number, x: number, y: number, up: boolean, lf: boolean, rt: boolean, R: () => number) {
  // depth below the surface
  let d = 0;
  while (d < 4 && level.get(tx, ty - d - 1) === SOLID && level.matAt(tx, ty - d - 1) === MAT.ground) d++;
  const deep = d >= 3;
  px(ctx, x, y, TILE, TILE, deep ? OPAL.dirtDeep : d === 2 ? OPAL.mud : OPAL.dirt);
  if (!deep) {
    // packed earth with pebbles and old concrete scraps
    for (let i = 0; i < 3; i++) if (R() < 0.6) px(ctx, x + Math.floor(R() * 14), y + Math.floor(R() * 14), 2, 1, d === 0 ? OPAL.dirt2 : OPAL.dirt);
    if (R() < 0.25) px(ctx, x + Math.floor(R() * 12), y + 6 + Math.floor(R() * 7), 3, 2, "#2f2834");
    if (R() < 0.12) px(ctx, x + Math.floor(R() * 12), y + 4 + Math.floor(R() * 8), 1, 1, "#5a4e60");
  } else if (R() < 0.05) px(ctx, x + 4, y + 7, 5, 2, "#1a141e");
  if (up) {
    // the wet surface: a cold rain sheen on top of dark mud, the odd tuft of weeds
    px(ctx, x, y, TILE, 1, OPAL.wet);
    px(ctx, x, y + 1, TILE, 1, OPAL.wetLo);
    px(ctx, x, y + 2, TILE, 2, OPAL.mud);
    px(ctx, x, y + 4, TILE, 1, OPAL.dirtHi);
    if (R() < 0.3) {
      const gx = x + 2 + Math.floor(R() * 10);
      px(ctx, gx, y - 2, 1, 2, OPAL.grass);
      px(ctx, gx + 1, y - 3, 1, 3, OPAL.grassHi);
      px(ctx, gx + 2, y - 1, 1, 1, OPAL.grass);
    }
    if (R() < 0.2) px(ctx, x + Math.floor(R() * 10), y + 1, 4, 1, "#9aa8cc"); // a glint of a puddle
  }
  if (lf) { px(ctx, x, y, 1, TILE, OPAL.ink); px(ctx, x + 1, y, 1, TILE, OPAL.dirtHi); }
  if (rt) { px(ctx, x + TILE - 1, y, 1, TILE, OPAL.ink); px(ctx, x + TILE - 2, y, 1, TILE, "#33293a"); }
}

function paintWood(ctx: CanvasRenderingContext2D, tx: number, ty: number, x: number, y: number, up: boolean, dn: boolean, lf: boolean, rt: boolean) {
  // vertical boards, nailed, weathered
  px(ctx, x, y, TILE, TILE, OPAL.wood);
  for (let k = 0; k < TILE; k += 4) {
    px(ctx, x + k, y, 1, TILE, OPAL.woodSeam);
    if ((tx + k + ty) % 3 === 0) px(ctx, x + k + 1, y, 1, TILE, OPAL.woodHi);
  }
  if (ty % 3 === 0) { px(ctx, x + 2, y + 3, 1, 1, "#8a8a90"); px(ctx, x + 10, y + 3, 1, 1, "#8a8a90"); }
  if ((tx * 3 + ty) % 7 === 0) px(ctx, x + 5, y + 8, 2, 4, OPAL.woodLo); // a knot
  if (up) { px(ctx, x, y, TILE, 2, OPAL.woodHi); px(ctx, x, y + 2, TILE, 1, OPAL.ink); }
  if (dn) px(ctx, x, y + TILE - 1, TILE, 1, OPAL.ink);
  if (lf) px(ctx, x, y, 1, TILE, OPAL.ink);
  if (rt) px(ctx, x + TILE - 1, y, 1, TILE, OPAL.ink);
}

function paintTin(ctx: CanvasRenderingContext2D, tx: number, ty: number, x: number, y: number, up: boolean, dn: boolean, lf: boolean, rt: boolean, R: () => number) {
  // corrugated sheet: ridges every 3 px, rust bleeding down from the seams
  px(ctx, x, y, TILE, TILE, OPAL.tin);
  for (let k = 0; k < TILE; k += 3) { px(ctx, x + k, y, 1, TILE, OPAL.tinLo); px(ctx, x + k + 1, y, 1, TILE, "#40474f"); }
  if (ty % 2 === 0) px(ctx, x, y + 15, TILE, 1, OPAL.tinLo); // sheet overlap
  if (R() < 0.35) {
    const rx = x + Math.floor(R() * 12), ry = y + Math.floor(R() * 6);
    px(ctx, rx, ry, 3, 4 + Math.floor(R() * 6), OPAL.rust);
    px(ctx, rx + 1, ry, 1, 3, OPAL.rust2);
  }
  if (up) {
    // the roof edge: a bent lip, rain running off it
    px(ctx, x, y, TILE, 1, OPAL.tinHi);
    px(ctx, x, y + 1, TILE, 1, "#7a8592");
    px(ctx, x, y + 2, TILE, 1, OPAL.ink);
    if ((tx + ty) % 2 === 0) px(ctx, x + 4, y + 3, 1, 2, "#9aa6b8");
  }
  if (dn) { px(ctx, x, y + TILE - 2, TILE, 1, "#1a1d22"); px(ctx, x, y + TILE - 1, TILE, 1, OPAL.ink); }
  if (lf) { px(ctx, x, y, 1, TILE, OPAL.ink); px(ctx, x + 1, y, 1, TILE, OPAL.tinHi); }
  if (rt) px(ctx, x + TILE - 1, y, 1, TILE, OPAL.ink);
}

function paintCrate(ctx: CanvasRenderingContext2D, tx: number, ty: number, x: number, y: number, up: boolean, lf: boolean, rt: boolean) {
  px(ctx, x, y, TILE, TILE, OPAL.crate);
  for (let k = 0; k < TILE; k += 5) px(ctx, x, y + k, TILE, 1, OPAL.crateLo);
  px(ctx, x, y, 2, TILE, OPAL.crateLo);
  px(ctx, x + TILE - 2, y, 2, TILE, OPAL.crateLo);
  if ((tx + ty) % 2 === 0) { ctx.globalAlpha = 0.6; for (let i = 0; i < TILE - 4; i++) px(ctx, x + 2 + i, y + 2 + Math.floor(i * 0.8), 1, 1, OPAL.crateHi); ctx.globalAlpha = 1; }
  if (up) { px(ctx, x, y, TILE, 1, OPAL.crateHi); px(ctx, x, y + 1, TILE, 1, "#7a5a3c"); }
  if (lf) px(ctx, x, y, 1, TILE, OPAL.ink);
  if (rt) px(ctx, x + TILE - 1, y, 1, TILE, OPAL.ink);
}

function paintBlock(ctx: CanvasRenderingContext2D, tx: number, ty: number, x: number, y: number, up: boolean, dn: boolean, lf: boolean, rt: boolean) {
  // cinder blocks, staggered rows
  px(ctx, x, y, TILE, TILE, OPAL.block);
  const off = ty % 2 === 0 ? 0 : 8;
  px(ctx, x, y + 7, TILE, 1, OPAL.blockLo);
  px(ctx, x, y + 15, TILE, 1, OPAL.blockLo);
  px(ctx, x + ((off + 4) % 16), y, 1, 7, OPAL.blockLo);
  px(ctx, x + ((off + 12) % 16), y + 8, 1, 7, OPAL.blockLo);
  px(ctx, x + 1, y + 1, 5, 1, OPAL.blockHi);
  if ((tx + ty * 5) % 9 === 0) px(ctx, x + 9, y + 3, 4, 2, "#232028");
  if (up) { px(ctx, x, y, TILE, 1, "#5a5666"); px(ctx, x, y + 1, TILE, 1, OPAL.ink); }
  if (dn) px(ctx, x, y + TILE - 1, TILE, 1, OPAL.ink);
  if (lf) px(ctx, x, y, 1, TILE, OPAL.ink);
  if (rt) px(ctx, x + TILE - 1, y, 1, TILE, OPAL.ink);
}

/** Inside a room: the wall behind the actors. */
function paintRoomWall(ctx: CanvasRenderingContext2D, level: Level, r: Level["rooms"][0], R: () => number) {
  const x0 = r.x0 * TILE, y0 = r.y0 * TILE, x1 = (r.x1 + 1) * TILE, y1 = (r.y1 + 1) * TILE;
  if (r.kind === "house") {
    // upstairs: bare boards under the roof; downstairs: old striped wallpaper over a wainscot
    let loft = -1;
    for (let ty = r.y0; ty <= r.y1; ty++) if (level.get(r.x0 + 2, ty) === ONEWAY) { loft = ty; break; }
    const split = loft >= 0 ? (loft + 1) * TILE : y0;
    for (let y = y0; y < split; y++) for (let x = x0; x < x1; x += 4) {
      const col = (x / 4 + Math.floor(y / 40)) % 5 === 0 ? "#1c1416" : "#211819";
      px(ctx, x, y, 4, 1, col);
      if (x % 8 === 0) px(ctx, x, y, 1, 1, "#140e10");
    }
    for (let x = x0; x < x1; x++) {
      const stripe = Math.floor((x - x0) / 6) % 2 === 0;
      px(ctx, x, split, 1, y1 - split, stripe ? "#1c2427" : "#20292c");
      if (x % 12 === 3) for (let y = split + 6; y < y1 - 20; y += 12) px(ctx, x, y, 2, 2, "#2a3538"); // a small faded pattern
    }
    // wainscot and skirting board
    px(ctx, x0, y1 - 18, x1 - x0, 18, "#231a17");
    for (let x = x0; x < x1; x += 5) px(ctx, x, y1 - 18, 1, 18, "#1a1210");
    px(ctx, x0, y1 - 19, x1 - x0, 1, "#3a2a22");
    px(ctx, x0, y1 - 3, x1 - x0, 3, "#140e0c");
    // damp stains under the ceiling
    for (let i = 0; i < 6; i++) {
      const sx = x0 + Math.floor(R() * (x1 - x0 - 30));
      ctx.globalAlpha = 0.25;
      px(ctx, sx, split + 1, 18 + Math.floor(R() * 20), 3 + Math.floor(R() * 6), "#0f1314");
      ctx.globalAlpha = 1;
    }
  } else {
    // the shed: rough planks, a pegboard of tools, soot climbing the wall
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x += 5) px(ctx, x, y, 5, 1, (x / 5) % 3 === 0 ? "#1a1310" : "#1d1512");
    for (let x = x0; x < x1; x += 5) px(ctx, x, y0, 1, y1 - y0, "#0f0a08");
    const pg = x0 + 3 * TILE;
    px(ctx, pg, y0 + 2 * TILE, 5 * TILE, 3 * TILE, "#241c16");
    for (let yy = y0 + 2 * TILE + 3; yy < y0 + 5 * TILE; yy += 6) for (let xx = pg + 3; xx < pg + 5 * TILE; xx += 6) px(ctx, xx, yy, 1, 1, "#120d0a");
    // tool silhouettes: a saw, a wrench, a coil of cable
    px(ctx, pg + 10, y0 + 2 * TILE + 8, 22, 6, "#0d0a09");
    px(ctx, pg + 40, y0 + 2 * TILE + 6, 3, 18, "#0d0a09");
    px(ctx, pg + 38, y0 + 2 * TILE + 5, 7, 4, "#0d0a09");
    ctx.strokeStyle = "#0d0a09";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pg + 62, y0 + 2 * TILE + 20, 8, 0, Math.PI * 2); ctx.stroke();
    // soot
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "rgba(0,0,0,0.7)");
    g.addColorStop(0.5, "rgba(0,0,0,0.2)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  // a little shadow under the ceiling
  const sh = ctx.createLinearGradient(0, y0, 0, y0 + 24);
  sh.addColorStop(0, "rgba(0,0,0,0.55)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(x0, y0, x1 - x0, 24);
}

/** Rain on the ground outside: a soft sheen, broken where the roofs are. */
export function paintOutskirtsReflections(level: Level): HTMLCanvasElement {
  const { c, ctx } = canvas(level.pixelW, level.pixelH);
  const R = rng(77);
  const inside = (tx: number, ty: number) => level.rooms.some((r) => tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1 + 1);
  for (let ty = 1; ty < level.h; ty++)
    for (let tx = 0; tx < level.w; tx++) {
      if (level.get(tx, ty) !== SOLID || level.get(tx, ty - 1) === SOLID || inside(tx, ty)) continue;
      if (level.matAt(tx, ty) !== MAT.ground) continue;
      const x = tx * TILE, y = ty * TILE;
      if (R() < 0.5) {
        const w = 4 + Math.floor(R() * 10);
        ctx.globalAlpha = 0.14 + R() * 0.12;
        px(ctx, x + Math.floor(R() * (TILE - w)), y + 2 + Math.floor(R() * 2), w, 1, R() < 0.25 ? "#ffb070" : "#b8c8ff");
      }
    }
  ctx.globalAlpha = 1;
  return c;
}

// ---------------------------------------------------------- backgrounds

export function paintOutskirtsSky(w: number, h: number): HTMLCanvasElement {
  const { c, ctx } = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#05040b");
  g.addColorStop(0.4, "#0e0b1e");
  g.addColorStop(0.72, "#1f1430");
  g.addColorStop(1, "#3a1a34");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // low rain clouds lit from below by the city
  const R = rng(19);
  for (let i = 0; i < 26; i++) {
    const cx = R() * w, cy = h * (0.12 + R() * 0.45), rw = 60 + R() * 140, rh = 10 + R() * 22;
    ctx.globalAlpha = 0.18 + R() * 0.18;
    ctx.fillStyle = R() < 0.3 ? "#2a1e3c" : "#160f24";
    ctx.beginPath(); ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#ff9a6a";
    ctx.beginPath(); ctx.ellipse(cx, cy + rh * 0.6, rw * 0.8, rh * 0.25, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // the city glow on the horizon
  const hg = ctx.createRadialGradient(w * 0.62, h * 1.05, 10, w * 0.62, h * 1.05, w * 0.7);
  hg.addColorStop(0, "rgba(255,120,150,0.35)");
  hg.addColorStop(0.5, "rgba(140,60,140,0.15)");
  hg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, w, h);
  // the Neon Spire, far away: a thin dark needle with white light at the top
  const sx = Math.round(w * 0.78), top = Math.round(h * 0.22);
  const halo = ctx.createRadialGradient(sx, top, 1, sx, top, 60);
  halo.addColorStop(0, "rgba(240,244,255,0.5)");
  halo.addColorStop(1, "rgba(240,244,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(sx - 60, top - 60, 120, 120);
  ctx.fillStyle = "#0a0714";
  ctx.beginPath(); ctx.moveTo(sx - 1, top); ctx.lineTo(sx + 1, top); ctx.lineTo(sx + 9, h); ctx.lineTo(sx - 9, h); ctx.closePath(); ctx.fill();
  px(ctx, sx - 1, top - 1, 3, 3, "#f2f4ff");
  for (let y = top + 10; y < h; y += 9) { ctx.globalAlpha = 0.35; px(ctx, sx - 1, y, 3, 1, "#8fe8ff"); }
  ctx.globalAlpha = 1;
  return c;
}

/** The far layer: the city across the rain, low and blurred by distance. */
export function paintDistantCity(W: number): HTMLCanvasElement {
  return paintSkyline(W, 61, {
    minTop: 200, maxTop: 290, minW: 18, maxW: 46, body: "#130d20", rim: "#1f1630",
    winCols: ["#ff6f91", "#4fd8d0", "#f9c871"], winChance: 0.05, signs: 3, antenna: true,
  });
}

/** The mid layer: the shanty town itself, poles, water tanks and wires. */
export function paintShanty(W: number, seed: number, near: boolean): HTMLCanvasElement {
  const H = VIEW_H + 120;
  const { c, ctx } = canvas(W, H);
  const R = rng(seed);
  const body = near ? "#0c0911" : "#120e19";
  const rim = near ? "#2a2232" : "#241c2e";
  const base = near ? 250 : 220;
  let x = 0;
  const poles: number[] = [];
  while (x < W) {
    const w = 26 + Math.floor(R() * 44);
    const top = base + Math.floor(R() * 50) - (R() < 0.2 ? 30 : 0);
    // a shack: a slanted tin roof, sometimes a second storey
    ctx.fillStyle = body;
    ctx.beginPath();
    const slope = (R() < 0.5 ? -1 : 1) * (3 + Math.floor(R() * 6));
    ctx.moveTo(x, top + Math.max(0, slope)); ctx.lineTo(x + w, top + Math.max(0, -slope)); ctx.lineTo(x + w, H); ctx.lineTo(x, H); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rim; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, top + Math.max(0, slope) + 0.5); ctx.lineTo(x + w, top + Math.max(0, -slope) + 0.5); ctx.stroke();
    if (R() < 0.4) {
      const tw = 10 + Math.floor(R() * 8), tx = x + Math.floor(R() * (w - tw));
      px(ctx, tx, top - 14, tw, 12, body);       // a water tank on legs
      px(ctx, tx, top - 14, tw, 1, rim);
      px(ctx, tx + 2, top - 2, 1, 4, body); px(ctx, tx + tw - 3, top - 2, 1, 4, body);
    }
    // warm windows, few, and one blue screen-light
    for (let k = 0; k < 3; k++) if (R() < (near ? 0.35 : 0.5)) {
      const wx = x + 4 + Math.floor(R() * (w - 10)), wy = top + 12 + Math.floor(R() * 40);
      const col = R() < 0.15 ? "#6ab8e8" : R() < 0.5 ? "#ffb060" : "#d88a40";
      ctx.globalAlpha = near ? 0.55 : 0.4;
      px(ctx, wx, wy, 4, 3, col);
      ctx.globalAlpha = 0.12;
      px(ctx, wx - 3, wy - 3, 10, 9, col);
      ctx.globalAlpha = 1;
    }
    if (R() < 0.5) poles.push(x + Math.floor(R() * w));
    x += w + Math.floor(R() * 4);
  }
  // utility poles with sagging wires between them
  for (const p of poles) {
    const top = base - 60 - Math.floor(R() * 30);
    px(ctx, p, top, 2, H - top, body);
    px(ctx, p - 6, top + 4, 14, 1, body);
  }
  ctx.strokeStyle = near ? "#1c1624" : "#1f1829";
  ctx.lineWidth = 1;
  for (let i = 0; i + 1 < poles.length; i++) {
    const a = poles[i], b = poles[i + 1];
    if (b - a > 260) continue;
    const ya = base - 56, yb = base - 56;
    ctx.beginPath(); ctx.moveTo(a, ya); ctx.quadraticCurveTo((a + b) / 2, ya + 18, b, yb); ctx.stroke();
  }
  return c;
}

// ---------------------------------------------------------- decorations

/** Furniture and set dressing, by deco kind. Returns null for kinds drawn elsewhere. */
export function paintOutskirtsDeco(kind: string, w = 1, h = 1): HTMLCanvasElement | null {
  switch (kind) {
    case "bed": {
      const { c, ctx } = canvas(48, 22);
      px(ctx, 0, 10, 48, 8, "#2a1e1a"); px(ctx, 0, 10, 48, 1, "#3e2c24");
      px(ctx, 2, 6, 44, 5, "#4a5664"); px(ctx, 2, 6, 44, 1, "#6a7888");   // a blanket, pale
      px(ctx, 3, 3, 12, 4, "#8a8a92"); px(ctx, 3, 3, 12, 1, "#b0b0b8");   // pillow
      px(ctx, 0, 0, 3, 22, "#2a1e1a"); px(ctx, 45, 6, 3, 16, "#2a1e1a");
      px(ctx, 2, 18, 2, 4, "#1a1210"); px(ctx, 44, 18, 2, 4, "#1a1210");
      return c;
    }
    case "bench": {
      // a workbench: soldering iron, a lamp, parts trays; the scorch mark on its edge
      const { c, ctx } = canvas(48, 30);
      px(ctx, 0, 12, 48, 4, "#4a3628"); px(ctx, 0, 12, 48, 1, "#6a5040");
      px(ctx, 2, 16, 3, 14, "#2a1e16"); px(ctx, 43, 16, 3, 14, "#2a1e16");
      px(ctx, 2, 24, 44, 2, "#2a1e16");
      px(ctx, 30, 13, 6, 2, "#140c08");                                    // "여길 또 태웠군"
      px(ctx, 6, 8, 10, 4, "#2a3a44"); px(ctx, 7, 9, 8, 2, "#4fd8d0");      // a small scope screen
      px(ctx, 20, 9, 8, 3, "#3a3a44"); px(ctx, 21, 8, 2, 1, "#ff6f91");     // parts tray
      px(ctx, 38, 2, 1, 10, "#5a5a66"); px(ctx, 36, 1, 6, 2, "#8a8a96");   // lamp
      ctx.globalAlpha = 0.25; px(ctx, 32, 3, 12, 9, "#ffd890"); ctx.globalAlpha = 1;
      return c;
    }
    case "shelf": {
      const { c, ctx } = canvas(36, 30);
      for (const y of [8, 20]) { px(ctx, 0, y, 36, 2, "#3a2a20"); px(ctx, 0, y + 2, 36, 1, "#140c08"); }
      const books = ["#5a3a44", "#3a4a5a", "#4a4a30", "#2a4a40", "#5a4a3a"];
      for (let i = 0; i < 7; i++) px(ctx, 2 + i * 4, 1 + (i % 3), 3, 7 - (i % 3), books[i % 5]);
      px(ctx, 4, 14, 10, 6, "#2a2a32"); px(ctx, 5, 15, 8, 2, "#6a7a8a");  // an old radio
      px(ctx, 22, 16, 6, 4, "#6a5a40");                                    // a tin
      return c;
    }
    case "window": {
      // a window on the rain: dark glass, city bokeh, water running down
      const W = w * TILE, H = h * TILE;
      const { c, ctx } = canvas(W, H);
      px(ctx, 0, 0, W, H, "#2a1e1a");
      px(ctx, 2, 2, W - 4, H - 4, "#0c0a18");
      const R = rng(W * 13 + H);
      for (let i = 0; i < 5; i++) { ctx.globalAlpha = 0.35; px(ctx, 3 + Math.floor(R() * (W - 8)), 3 + Math.floor(R() * (H - 8)), 2, 2, ["#ff6f91", "#4fd8d0", "#ffb060"][i % 3]); }
      ctx.globalAlpha = 0.4;
      for (let i = 0; i < 6; i++) px(ctx, 3 + Math.floor(R() * (W - 6)), 3 + Math.floor(R() * (H - 10)), 1, 4 + Math.floor(R() * 6), "#a8b8e0");
      ctx.globalAlpha = 1;
      px(ctx, Math.floor(W / 2) - 1, 2, 2, H - 4, "#2a1e1a");
      px(ctx, 0, H - 3, W, 3, "#3a2a22");
      return c;
    }
    case "medbox": {
      // "아버지 비상용": a small white case with a green cross
      const { c, ctx } = canvas(16, 12);
      px(ctx, 0, 2, 16, 10, "#c8ccd0"); px(ctx, 0, 2, 16, 1, "#ffffff"); px(ctx, 0, 11, 16, 1, "#7a7e86");
      px(ctx, 6, 0, 4, 2, "#8a8e96");
      px(ctx, 7, 4, 2, 6, "#2fd88a"); px(ctx, 5, 6, 6, 2, "#2fd88a");
      return c;
    }
    case "frame": {
      // the photo: three young men, faces too small to read
      const { c, ctx } = canvas(20, 16);
      px(ctx, 0, 0, 20, 16, "#5a4632"); px(ctx, 0, 0, 20, 1, "#7a6248");
      px(ctx, 2, 2, 16, 12, "#2a2a2e");
      ctx.globalAlpha = 0.9;
      for (const [fx, col] of [[4, "#8a8a8e"], [9, "#a0a0a4"], [14, "#7a7a7e"]] as [number, string][]) {
        px(ctx, fx, 5, 2, 2, col); px(ctx, fx - 1, 7, 4, 6, "#4a4a52");
      }
      px(ctx, 12, 8, 1, 5, "#c0c0c8"); // one of them carries a sword
      ctx.globalAlpha = 1;
      return c;
    }
    case "stove": {
      const { c, ctx } = canvas(32, 28);
      px(ctx, 0, 6, 32, 22, "#3a3a40"); px(ctx, 0, 6, 32, 1, "#5a5a62");
      px(ctx, 3, 12, 12, 10, "#1a1a1e"); px(ctx, 18, 12, 11, 10, "#1a1a1e");
      px(ctx, 4, 2, 8, 4, "#2a2a30"); px(ctx, 5, 1, 6, 1, "#6a6a72"); // a kettle
      px(ctx, 22, 3, 6, 3, "#4a3a2a");
      return c;
    }
    case "table": {
      const { c, ctx } = canvas(48, 22);
      px(ctx, 0, 8, 48, 3, "#4a3628"); px(ctx, 0, 8, 48, 1, "#6a5040");
      px(ctx, 3, 11, 3, 11, "#2a1e16"); px(ctx, 42, 11, 3, 11, "#2a1e16");
      px(ctx, 10, 4, 6, 4, "#d8d8d8"); px(ctx, 11, 5, 4, 2, "#8a5a3a");      // two cups
      px(ctx, 22, 4, 6, 4, "#d8d8d8"); px(ctx, 23, 5, 4, 2, "#5a3a2a");
      px(ctx, 32, 6, 10, 2, "#c8c0a0");                                    // a newspaper
      px(ctx, -2, 12, 10, 10, "#2a1e16"); px(ctx, 40, 12, 10, 10, "#2a1e16"); // chairs
      return c;
    }
    case "coat": {
      const { c, ctx } = canvas(16, 44);
      px(ctx, 7, 0, 2, 44, "#2a1e16"); px(ctx, 3, 40, 10, 4, "#2a1e16");
      px(ctx, 3, 4, 10, 2, "#3a2a20");
      px(ctx, 2, 6, 12, 20, "#2a2e3a"); px(ctx, 2, 6, 12, 1, "#3a4050");    // an old coat
      px(ctx, 6, 6, 4, 4, "#8a2a30");                                       // a red scarf: hers
      return c;
    }
    case "paper": {
      // the recovery order taped to the inside of the door
      const { c, ctx } = canvas(12, 16);
      px(ctx, 0, 0, 12, 16, "#d8d4c8"); px(ctx, 0, 15, 12, 1, "#9a968a");
      px(ctx, 2, 2, 8, 2, "#c83a3a");
      for (let y = 6; y < 14; y += 2) px(ctx, 2, y, 8 - (y % 4), 1, "#5a5a60");
      return c;
    }
    case "tape": {
      // yellow-black seal tape crossing the doorway
      const H = h * TILE;
      const { c, ctx } = canvas(32, H);
      ctx.save();
      ctx.translate(16, H / 2);
      for (const a of [0.55, -0.55]) {
        ctx.save(); ctx.rotate(a);
        for (let i = -H; i < H; i += 6) { px(ctx, i, -2, 3, 4, "#f2c43a"); px(ctx, i + 3, -2, 3, 4, "#1a1410"); }
        ctx.restore();
      }
      ctx.restore();
      return c;
    }
    case "pole": {
      const { c, ctx } = canvas(24, 120);
      px(ctx, 11, 0, 3, 120, "#1e1a22"); px(ctx, 11, 0, 1, 120, "#2e2834");
      px(ctx, 0, 8, 24, 2, "#1e1a22"); px(ctx, 2, 6, 2, 2, "#3a3440"); px(ctx, 20, 6, 2, 2, "#3a3440");
      px(ctx, 14, 30, 6, 8, "#2a2630"); px(ctx, 15, 31, 2, 1, "#ff6f40");    // a transformer, one red lamp
      return c;
    }
    case "crates": {
      // Seoyun's boxes, half-dragged out, labelled with a recovery code
      const { c, ctx } = canvas(40, 26);
      for (const [x, y, ww, hh] of [[0, 10, 18, 16], [18, 14, 20, 12], [6, 0, 14, 10]]) {
        px(ctx, x, y, ww, hh, "#6a5a48"); px(ctx, x, y, ww, 1, "#8a7a64"); px(ctx, x, y + Math.floor(hh / 2), ww, 1, "#4a3e32");
        px(ctx, x + 2, y + 2, 6, 3, "#f2c43a");
      }
      return c;
    }
    case "fence": {
      const W = w * TILE;
      const { c, ctx } = canvas(W, 30);
      px(ctx, 0, 8, W, 2, "#3a3440"); px(ctx, 0, 20, W, 2, "#3a3440");
      for (let x = 0; x < W; x += 4) { px(ctx, x, 6, 1, 24, "#2a2630"); for (let y = 8; y < 24; y += 4) px(ctx, x + ((y / 4) % 2), y, 1, 1, "#4a4450"); }
      for (let x = 0; x < W; x += 16) px(ctx, x, 2, 2, 28, "#1e1a22");
      return c;
    }
    case "terminal": {
      // an undercity emergency terminal: the checkpoint; graffiti beside it
      const { c, ctx } = canvas(40, 44);
      px(ctx, 14, 6, 14, 38, "#26303a"); px(ctx, 14, 6, 14, 1, "#3e4a58");
      px(ctx, 16, 10, 10, 8, "#0a1a1c"); px(ctx, 17, 11, 8, 6, "#1a6a68");
      px(ctx, 17, 22, 3, 2, "#9a9aa4"); px(ctx, 22, 22, 3, 2, "#9a9aa4"); px(ctx, 17, 26, 8, 2, "#9a9aa4");
      // "여기서는 잊지 않는다" as a scrawl in white paint
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 9; i++) px(ctx, 2 + i * 4, 30 + (i % 2), 3, 1, "#e8e4d8");
      for (let i = 0; i < 6; i++) px(ctx, 4 + i * 5, 34 + ((i + 1) % 2), 3, 1, "#e8e4d8");
      ctx.globalAlpha = 1;
      return c;
    }
    case "laundry": {
      const W = w * TILE;
      const { c, ctx } = canvas(W, 26);
      ctx.strokeStyle = "#3a3440"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.quadraticCurveTo(W / 2, 8, W, 2); ctx.stroke();
      const cols = ["#5a3a44", "#3a4a5a", "#6a6a5a", "#4a5a4a"];
      for (let i = 0, x = 6; x < W - 10; i++, x += 14 + (i % 3) * 4) {
        const y = 2 + Math.round(6 * Math.sin((x / W) * Math.PI));
        px(ctx, x, y, 8 + (i % 2) * 3, 10 + (i % 3) * 4, cols[i % 4]);
        px(ctx, x, y, 8 + (i % 2) * 3, 1, "#8a8a92");
      }
      return c;
    }
    case "neighbor": {
      // a lit window; behind the curtain, an old woman's shape
      const W = w * TILE, H = h * TILE;
      const { c, ctx } = canvas(W, H);
      px(ctx, 0, 0, W, H, "#2a2630");
      px(ctx, 2, 2, W - 4, H - 4, "#ffcf8a");
      const g = ctx.createLinearGradient(0, 2, 0, H - 2);
      g.addColorStop(0, "rgba(255,240,200,0.6)"); g.addColorStop(1, "rgba(200,120,60,0.3)");
      ctx.fillStyle = g; ctx.fillRect(2, 2, W - 4, H - 4);
      px(ctx, 10, 12, 8, 7, "#5a3a2a"); px(ctx, 8, 19, 12, 20, "#5a3a2a"); // silhouette
      px(ctx, 2, 2, 5, H - 4, "#c08a5a"); px(ctx, W - 7, 2, 5, H - 4, "#c08a5a"); // curtains
      px(ctx, Math.floor(W / 2), 2, 1, H - 4, "#2a2630");
      return c;
    }
    case "truck": {
      // the recovery truck: a white box van with the White Night mark, orange beacons
      const { c, ctx } = canvas(176, 84);
      px(ctx, 0, 8, 120, 62, "#c8ccd4"); px(ctx, 0, 8, 120, 2, "#e8ecf2"); px(ctx, 0, 66, 120, 4, "#7a7e88");
      for (let x = 10; x < 120; x += 22) px(ctx, x, 10, 1, 56, "#a8acb4");
      ctx.strokeStyle = "#3a3e48"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(60, 36, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#3a3e48"; ctx.beginPath(); ctx.arc(60, 36, 5, 0, Math.PI * 2); ctx.fill();
      px(ctx, 76, 32, 34, 3, "#3a3e48"); px(ctx, 76, 38, 24, 2, "#6a6e78");
      px(ctx, 6, 50, 40, 6, "#f2c43a"); for (let x = 6; x < 46; x += 8) px(ctx, x, 50, 4, 6, "#1a1410");
      px(ctx, 120, 26, 46, 44, "#b8bcc4"); px(ctx, 120, 26, 46, 2, "#d8dce4");    // cab
      px(ctx, 140, 30, 22, 16, "#1a2230"); px(ctx, 141, 31, 8, 4, "#5a6a80");
      px(ctx, 166, 54, 8, 10, "#3a3e48"); px(ctx, 168, 56, 4, 4, "#ffe0a0");
      for (const wx of [24, 96, 142]) { ctx.fillStyle = "#121014"; ctx.beginPath(); ctx.arc(wx, 72, 11, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#4a4650"; ctx.beginPath(); ctx.arc(wx, 72, 4, 0, Math.PI * 2); ctx.fill(); }
      px(ctx, 128, 20, 12, 6, "#ff8a3a"); px(ctx, 150, 20, 12, 6, "#ff8a3a");
      return c;
    }
    case "stairsign": {
      // a hand-painted arrow down: 하층
      const { c, ctx } = canvas(28, 40);
      px(ctx, 12, 14, 3, 26, "#2a2630");
      px(ctx, 0, 0, 28, 14, "#3a3028"); px(ctx, 0, 0, 28, 1, "#5a4a3a");
      px(ctx, 6, 3, 2, 7, "#f2c43a"); px(ctx, 4, 8, 6, 2, "#f2c43a"); px(ctx, 5, 10, 4, 1, "#f2c43a");
      for (let i = 0; i < 3; i++) px(ctx, 13 + i * 4, 4, 3, 6, "#e8e4d8");
      return c;
    }
    case "bulb": {
      const { c, ctx } = canvas(8, 20);
      px(ctx, 3, 0, 1, 14, "#2a2630");
      px(ctx, 2, 14, 3, 4, "#ffe2a8"); px(ctx, 2, 14, 3, 1, "#fff6dc");
      return c;
    }
    default:
      return null;
  }
}

/** The incinerator drone: 3 frames of 32x24 (flame vents glow on the 3rd). */
export function paintBurner(): HTMLCanvasElement {
  const { c, ctx } = canvas(96, 24);
  for (let f = 0; f < 3; f++) {
    const o = f * 32;
    // rotor arms
    const blur = f === 1;
    px(ctx, o + 1, 4, 10, 1, blur ? "#6a6470" : "#3a3440");
    px(ctx, o + 21, 4, 10, 1, blur ? "#3a3440" : "#6a6470");
    px(ctx, o + 5, 3, 2, 3, "#2a2630"); px(ctx, o + 25, 3, 2, 3, "#2a2630");
    // body: a squat white-and-yellow tank with a nozzle underneath
    px(ctx, o + 8, 6, 16, 10, "#c8ccd4"); px(ctx, o + 8, 6, 16, 1, "#e8ecf2"); px(ctx, o + 8, 15, 16, 1, "#6a6e78");
    px(ctx, o + 7, 8, 1, 6, "#06040a"); px(ctx, o + 24, 8, 1, 6, "#06040a");
    px(ctx, o + 10, 10, 12, 2, "#f2c43a"); for (let x = 10; x < 22; x += 4) px(ctx, o + x, 10, 2, 2, "#1a1410");
    px(ctx, o + 14, 16, 4, 4, "#3a3440"); px(ctx, o + 13, 20, 6, 2, "#2a2630");
    px(ctx, o + 20, 7, 2, 2, "#ff6f40"); // eye
    if (f === 2) { px(ctx, o + 14, 22, 4, 2, "#e8c8ff"); ctx.globalAlpha = 0.5; px(ctx, o + 12, 21, 8, 3, "#b967ff"); ctx.globalAlpha = 1; }
  }
  return c;
}
