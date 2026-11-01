// The three shops, painted as facades that sit behind the tiles.
//   forge   철야 정비소: a half-open shutter, furnace glow, an old man in an apron
//   supply  0번 보급함: a battered vending cabinet with a cyan screen and a "0"
//   bazaar  망각시장: a curtained stall, violet lanterns, a hooded collector
// Plus the memory shard pickup.

import { canvas, px } from "./art";

export function paintForge(): HTMLCanvasElement {
  const { c, ctx } = canvas(80, 72);
  const P = (x: number, y: number, w: number, h: number, col: string) => px(ctx, x, y, w, h, col);
  // brick front and the shutter box
  P(0, 8, 80, 64, "#1e1420");
  for (let y = 10; y < 72; y += 5) for (let x = (y / 5) % 2 ? 0 : 6; x < 80; x += 12) P(x, y, 10, 4, "#241826");
  P(6, 14, 68, 58, "#0c0810");
  // furnace glow inside
  const g = ctx.createRadialGradient(56, 60, 2, 56, 60, 40);
  g.addColorStop(0, "rgba(255,150,60,0.9)");
  g.addColorStop(0.4, "rgba(255,90,30,0.35)");
  g.addColorStop(1, "rgba(255,90,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(6, 30, 68, 42);
  P(46, 52, 20, 20, "#2a1810");
  P(49, 55, 14, 10, "#ffb347");
  P(51, 57, 10, 6, "#fff0c0");
  // half-rolled shutter
  P(6, 14, 68, 16, "#3a3240");
  for (let y = 16; y < 30; y += 3) P(6, y, 68, 1, "#2a2430");
  P(6, 29, 68, 2, "#5a5060");
  // tools on the back wall: a sword, gears, coils
  P(14, 34, 2, 26, "#aeb8cc"); P(12, 56, 6, 2, "#6a5a3a");
  P(22, 36, 8, 8, "#4a4050"); P(24, 38, 4, 4, "#1a1420");
  P(33, 34, 5, 12, "#b87333"); for (let y = 35; y < 46; y += 2) P(33, y, 5, 1, "#e09a50");
  // Kang Mansik: white beard, goggles up, leather apron
  P(30, 50, 10, 4, "#d8d4cc");   // hair
  P(31, 53, 8, 6, "#c8a080");    // face
  P(31, 53, 8, 1, "#40e0ff");    // goggles on the brow
  P(31, 58, 8, 4, "#eeeeee");    // beard
  P(28, 62, 14, 10, "#5a3a24");  // apron
  P(26, 62, 2, 7, "#c8a080"); P(42, 62, 2, 7, "#c8a080");
  // sign: amber neon
  P(10, 0, 60, 10, "#120a10");
  P(10, 0, 60, 1, "#ffb347"); P(10, 9, 60, 1, "#ffb347");
  for (const [x, w] of [[14, 6], [22, 4], [28, 8], [38, 4], [44, 6], [52, 3], [57, 9]] as [number, number][]) P(x, 3, w, 4, "#ffcf7a");
  return c;
}

export function paintSupply(): HTMLCanvasElement {
  const { c, ctx } = canvas(36, 60);
  const P = (x: number, y: number, w: number, h: number, col: string) => px(ctx, x, y, w, h, col);
  P(2, 4, 32, 56, "#1a2028");
  P(2, 4, 32, 1, "#3a4a5a"); P(2, 4, 1, 56, "#2a3644");
  P(5, 8, 26, 18, "#05161a");          // screen
  P(6, 9, 24, 16, "#0b3a40");
  P(14, 11, 8, 12, "#6dffc0"); P(16, 13, 4, 8, "#0b3a40"); // the "0"
  for (let y = 10; y < 25; y += 2) P(6, y, 24, 1, "rgba(0,0,0,0.25)");
  P(5, 30, 26, 16, "#0d1218");          // item window
  for (let i = 0; i < 3; i++) { P(7 + i * 8, 33, 6, 10, "#16202a"); P(8 + i * 8, 35, 4, 4, ["#6dffc0", "#9ffcff", "#ffcf7a"][i]); }
  P(5, 49, 26, 6, "#0a0e14"); P(14, 51, 8, 2, "#2a3644"); // slot
  P(27, 28, 3, 2, "#ff4d6d");           // status lamp
  // a hand-painted mark: a little crescent (月痕), the daughter's sign
  ctx.strokeStyle = "#ffcf7a"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(9, 51, 2.5, Math.PI * 0.2, Math.PI * 1.3); ctx.stroke();
  return c;
}

export function paintBazaar(): HTMLCanvasElement {
  const { c, ctx } = canvas(84, 70);
  const P = (x: number, y: number, w: number, h: number, col: string) => px(ctx, x, y, w, h, col);
  // curtains
  P(0, 6, 84, 64, "#140a1c");
  for (let x = 0; x < 84; x += 6) { P(x, 6, 3, 64, "#22102e"); P(x + 3, 6, 1, 64, "#0c0612"); }
  P(10, 16, 64, 54, "#07040c");
  // counter with jars of light (bottled memories)
  P(8, 52, 68, 4, "#3a2440"); P(8, 56, 68, 14, "#1c1024");
  const jar = (x: number, col: string) => { P(x, 42, 8, 10, "rgba(200,180,255,0.18)"); P(x + 1, 45, 6, 6, col); P(x + 2, 41, 4, 2, "#8a6a9a"); };
  jar(14, "#ff4d6d"); jar(26, "#c9a2ff"); jar(52, "#9ffcff"); jar(64, "#ffcf7a");
  // the collector: a deep hood, a white porcelain mask, long fingers
  P(34, 22, 16, 30, "#0a0610");
  P(36, 20, 12, 8, "#0a0610");
  P(38, 26, 8, 9, "#e8e4f0"); P(39, 29, 2, 1, "#07040c"); P(43, 29, 2, 1, "#07040c"); P(41, 33, 2, 1, "#9a90b0");
  P(31, 48, 6, 3, "#c8c0d8"); P(47, 48, 6, 3, "#c8c0d8");
  // lanterns
  for (const x of [6, 74]) {
    P(x, 0, 1, 10, "#3a2440");
    P(x - 3, 10, 7, 9, "#5a2a7a");
    P(x - 2, 11, 5, 7, "#c9a2ff");
  }
  return c;
}

/** A memory shard (◈): a floating amber crystal, 10x12. */
export function paintShard(): HTMLCanvasElement {
  const { c, ctx } = canvas(10, 12);
  const P = (x: number, y: number, w: number, h: number, col: string) => px(ctx, x, y, w, h, col);
  P(4, 0, 2, 12, "#ffcf7a");
  P(3, 2, 4, 8, "#ffcf7a");
  P(2, 4, 6, 4, "#ffcf7a");
  P(1, 5, 8, 2, "#ffe9c2");
  P(4, 2, 1, 6, "#ffffff");
  P(5, 8, 2, 3, "#c8902a");
  return c;
}
