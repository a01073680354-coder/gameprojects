// 방벽, the riot machine (STAGE 2 boss): painted as parts so the renderer can
// move them. Drawn facing right; the renderer flips it.
//   hull    72x58 frames: 0-3 the treads rolling, 4 the shield gone (bare
//           mounts, the vent glowing), 5 wrecked
//   gun     the roof turret's barrel, pivot at its left end
//   shield  the front plate, 14x58
// Sim box: 60x50 standing on the frame's bottom row, centred.

import { canvas, px } from "./art";

const C = {
  ink: "#07060b",
  rubber: "#18181e", rubberHi: "#2c2c34", wheel: "#4a4e58", wheelHi: "#7a808c",
  steel: "#3a3e48", steelHi: "#5a606c", steelLo: "#22252c",
  armor: "#b4b8c2", armorHi: "#dfe2e8", armorLo: "#7c808c", armorDk: "#555a66",
  hazard: "#f2c43a", hazardDk: "#1a1410",
  eye: "#ff7040", eyeHi: "#ffd0a0",
  vent: "#0e0c12", ventSlat: "#3a3e48",
};

export const BUL_FRAME = { w: 72, h: 58 };

function hull(ctx: CanvasRenderingContext2D, o: number, f: number, mode: "whole" | "bare" | "wreck") {
  const wreck = mode === "wreck";
  const A = wreck ? { b: "#2a2830", hi: "#3a3840", lo: "#1c1a20", dk: "#141218" } : { b: C.armor, hi: C.armorHi, lo: C.armorLo, dk: C.armorDk };
  // ---- running gear: a long loop of links over five road wheels
  px(ctx, o + 4, 44, 64, 13, C.rubber);
  px(ctx, o + 3, 46, 1, 9, C.rubber); px(ctx, o + 68, 46, 1, 9, C.rubber);
  for (let x = 0; x < 64; x += 4) {
    const lx = o + 4 + ((x + f) % 64);
    px(ctx, lx, 56, 2, 1, C.rubberHi);
    px(ctx, lx, 44, 2, 1, C.rubberHi);
  }
  for (let i = 0; i < 5; i++) {
    const cx = o + 12 + i * 12, cy = 51;
    ctx.fillStyle = C.wheel; ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, Math.PI * 2); ctx.fill();
    const a = (f / 4) * Math.PI / 2 + i;
    px(ctx, Math.round(cx + Math.cos(a) * 3), Math.round(cy + Math.sin(a) * 3), 1, 1, C.wheelHi);
  }
  px(ctx, o + 4, 57, 64, 1, C.ink);
  // side skirts over the upper run of the tread, bolted, chevrons at the nose
  px(ctx, o + 5, 38, 62, 8, wreck ? "#1e1e24" : C.steel);
  px(ctx, o + 5, 38, 62, 1, wreck ? "#2a2a30" : C.steelHi);
  px(ctx, o + 5, 45, 62, 1, C.ink);
  for (let x = 9; x < 64; x += 8) px(ctx, o + x, 41, 1, 1, C.steelLo);
  if (!wreck) for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) { px(ctx, o + 52 + k * 5 + j, 39 + j, 2, 1, C.hazard); px(ctx, o + 52 + k * 5 + j - 1, 39 + j, 1, 1, C.hazardDk); }
  // the plough at the front, low and mean
  ctx.fillStyle = wreck ? "#1a1a20" : C.steelLo;
  ctx.beginPath(); ctx.moveTo(o + 64, 40); ctx.lineTo(o + 71, 46); ctx.lineTo(o + 71, 56); ctx.lineTo(o + 64, 56); ctx.closePath(); ctx.fill();
  px(ctx, o + 66, 42, 1, 13, wreck ? "#2a2a30" : C.steel);
  // ---- the hull: a rear engine deck (with the vent) and a sloped front cab
  px(ctx, o + 7, 22, 58, 16, A.b);
  px(ctx, o + 7, 22, 58, 1, A.hi);
  px(ctx, o + 7, 37, 58, 1, A.dk);
  px(ctx, o + 7, 22, 1, 16, C.ink);
  // the cab rises over the front two thirds; a glacis slopes to the nose
  ctx.fillStyle = A.b;
  ctx.beginPath();
  ctx.moveTo(o + 30, 22); ctx.lineTo(o + 33, 9); ctx.lineTo(o + 56, 9); ctx.lineTo(o + 66, 20); ctx.lineTo(o + 66, 22); ctx.closePath(); ctx.fill();
  px(ctx, o + 33, 9, 23, 1, A.hi);
  for (let i = 0; i < 11; i++) px(ctx, o + 56 + i, 9 + i, 1, 1, A.hi);
  for (let i = 0; i < 13; i++) px(ctx, o + 30 + Math.round(i * 3 / 13), 22 - i, 1, 1, A.lo);
  if (!wreck) {
    // panel lines, the White Night mark, a unit number, the camera eye
    px(ctx, o + 8, 30, 56, 1, A.lo);
    px(ctx, o + 44, 10, 1, 12, A.lo);
    ctx.strokeStyle = "#eef2f8"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(o + 50, 16, 3.5, 0, Math.PI * 2); ctx.stroke();
    px(ctx, o + 49, 15, 2, 2, "#eef2f8");
    for (const [x, w2] of [[12, 3], [16, 1], [18, 3], [22, 3]] as [number, number][]) px(ctx, o + x, 32, w2, 3, C.armorDk); // "B-02"
    px(ctx, o + 59, 15, 5, 5, C.ink); px(ctx, o + 60, 16, 3, 3, C.eye); px(ctx, o + 61, 16, 1, 1, C.eyeHi);
    for (const [bx, by] of [[10, 25], [20, 25], [36, 25], [52, 25], [60, 25], [36, 12], [40, 12]]) px(ctx, o + bx, by, 1, 1, C.armorDk);
    // a strobe on each roof corner: amber, alternating
    px(ctx, o + 34, 7, 3, 2, f % 2 ? "#ffb347" : "#6a4a20");
    px(ctx, o + 53, 7, 3, 2, f % 2 ? "#6a4a20" : "#ffb347");
  } else {
    // scorched, a plate torn open, wiring hanging out
    px(ctx, o + 44, 12, 12, 9, C.ink);
    for (let i = 0; i < 4; i++) px(ctx, o + 46 + i * 3, 20, 1, 4 + i, ["#c84030", "#3a6ac8", "#d8b040", "#8a8a90"][i]);
    ctx.globalAlpha = 0.55; px(ctx, o + 10, 23, 30, 14, "#0e0c12"); ctx.globalAlpha = 1;
  }
  // ---- the vent: a radiator on the rear deck, angled back and up. It always
  // glows a little from inside: the one warm thing on a cold machine.
  const vx = o + 8, vy = 10;
  px(ctx, vx, vy, 21, 12, wreck ? "#120f14" : "#1a1214");
  if (!wreck) {
    const hot = mode === "bare" ? 0.95 : 0.35;
    ctx.globalAlpha = hot;
    px(ctx, vx + 2, vy + 3, 17, 7, "#ff7a2a");
    px(ctx, vx + 4, vy + 4, 13, 4, "#ffc070");
    ctx.globalAlpha = 1;
  }
  for (let k = 0; k < 7; k++) { px(ctx, vx + 1 + k * 3, vy + 1, 2, 10, wreck ? "#1e1c22" : C.steel); px(ctx, vx + 1 + k * 3, vy + 1, 1, 10, wreck ? "#2a2830" : C.steelHi); }
  px(ctx, vx - 1, vy - 1, 23, 1, C.ink); px(ctx, vx - 1, vy + 12, 23, 1, C.ink); px(ctx, vx - 1, vy, 1, 12, C.ink); px(ctx, vx + 21, vy, 1, 12, C.ink);
  // the exhaust stacks behind it, sooty
  px(ctx, o + 9, 2, 3, 8, wreck ? "#1a1a20" : C.steelLo); px(ctx, o + 13, 4, 3, 6, wreck ? "#1a1a20" : C.steelLo);
  px(ctx, o + 9, 2, 3, 1, "#0a080c"); px(ctx, o + 13, 4, 3, 1, "#0a080c");
  // the turret ring on the cab roof, the antenna with its red light
  px(ctx, o + 40, 6, 12, 3, wreck ? "#1e1e24" : C.steel);
  px(ctx, o + 40, 6, 12, 1, C.steelHi);
  px(ctx, o + 31, 0, 1, 9, C.steelLo);
  px(ctx, o + 30, 0, 3, 2, wreck ? "#2a1010" : "#ff3040");
  // where the shield mounts on the nose
  px(ctx, o + 64, 12, 4, 4, C.steelLo); px(ctx, o + 64, 30, 4, 4, C.steelLo);
  if (mode !== "whole") { px(ctx, o + 65, 13, 3, 2, "#ff8a3a"); px(ctx, o + 65, 31, 3, 2, "#ff8a3a"); } // sheared bolts, still hot
}

/** The hull sheet: six 72x58 frames in a row. */
export function paintBulwarkHull(): HTMLCanvasElement {
  const { w, h } = BUL_FRAME;
  const { c, ctx } = canvas(w * 6, h);
  for (let f = 0; f < 4; f++) hull(ctx, f * w, f, "whole");
  hull(ctx, 4 * w, 0, "bare");
  hull(ctx, 5 * w, 0, "wreck");
  return c;
}

/** The roof gun: a stubby suppression barrel, drawn pointing right from its pivot. */
export function paintBulwarkGun(): HTMLCanvasElement {
  const { c, ctx } = canvas(28, 9);
  px(ctx, 0, 1, 10, 7, C.steel); px(ctx, 0, 1, 10, 1, C.steelHi);
  px(ctx, 9, 3, 17, 3, C.steelLo); px(ctx, 9, 3, 17, 1, C.steelHi);
  px(ctx, 24, 2, 4, 5, C.steel); px(ctx, 27, 3, 1, 3, C.ink);
  px(ctx, 3, 3, 3, 3, "#ff7040");
  return c;
}

/** The riot shield: a tall steel plate with a vision slit and hazard chevrons. */
export function paintBulwarkShield(): HTMLCanvasElement {
  const { c, ctx } = canvas(14, 58);
  px(ctx, 0, 0, 14, 58, C.armorDk);
  px(ctx, 1, 1, 12, 56, C.armor);
  px(ctx, 1, 1, 12, 1, C.armorHi);
  px(ctx, 12, 1, 1, 56, C.armorLo);
  px(ctx, 3, 8, 8, 2, C.ink);                       // the vision slit
  px(ctx, 4, 8, 3, 1, "#ff7040");
  for (let y = 40; y < 56; y += 6) { for (let k = 0; k < 4; k++) { px(ctx, 2 + k, y + k, 2, 1, C.hazard); px(ctx, 9 - k, y + k, 2, 1, C.hazard); } }
  ctx.globalAlpha = 0.4;                           // scratches and old paint hits
  px(ctx, 4, 18, 6, 1, "#ffffff"); px(ctx, 3, 26, 2, 4, "#c84040"); px(ctx, 8, 30, 1, 6, "#ffffff");
  ctx.globalAlpha = 1;
  return c;
}
