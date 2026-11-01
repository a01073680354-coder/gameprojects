// Headless movement tests: runs the real Player code against small levels.
import { Level, SOLID, ONEWAY } from "../src/world/level";
import { Player, PW, PH, PlayerEvents } from "../src/entities/player";
import { InputFrame } from "../src/core/input";
import { STEP, TUNE, FEATURES, derivedJump } from "../src/config";

const noop: PlayerEvents = {
  jump() {}, land() {}, dashStart() {}, dashEnd() {}, dashRefill() {}, wallSlide() {}, freeze() {},
};
const I = (o: Partial<InputFrame> = {}): InputFrame => ({
  x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, parryPressed: false, aimX: 0, aimY: 0, ...o,
});

function room(w = 40, h = 30) {
  const L = new Level(w, h);
  L.fill(0, h - 2, w - 1, h - 1, SOLID);
  return L;
}
function spawn(L: Level, tx: number, floorTy: number) {
  return new Player(L, tx * 16, floorTy * 16 - PH, noop);
}
function settle(p: Player, n = 10) { for (let i = 0; i < n; i++) p.update(I(), STEP); }

let fails = 0;
function check(name: string, ok: boolean, info: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — ${info}`);
  if (!ok) fails++;
}

// 1. full jump height
{
  const L = room(); const p = spawn(L, 10, 28); settle(p);
  const y0 = p.y; let minY = y0, frames = 0, apexF = 0;
  p.update(I({ jumpPressed: true, jumpHeld: true }), STEP);
  for (let i = 0; i < 120; i++) { p.update(I({ jumpHeld: true }), STEP); frames++; if (p.y < minY) { minY = p.y; apexF = frames; } }
  const h = y0 - minY;
  check("full jump height", Math.abs(h - TUNE.jumpHeight) < TUNE.jumpHeight * 0.15, `${h}px (target ${TUNE.jumpHeight}), apex at ${(apexF / 60).toFixed(2)}s`);
}
// 2. tap jump is much lower
{
  const L = room(); const p = spawn(L, 10, 28); settle(p);
  const y0 = p.y; let minY = y0;
  p.update(I({ jumpPressed: true, jumpHeld: true }), STEP);
  for (let i = 0; i < 4; i++) p.update(I({ jumpHeld: true }), STEP);
  for (let i = 0; i < 90; i++) { p.update(I(), STEP); minY = Math.min(minY, p.y); }
  const h = y0 - minY;
  check("tap jump lower", h < TUNE.jumpHeight * 0.6 && h > 12, `${h}px`);
}
// 3. coyote time: walk off a ledge, jump 4 frames later
{
  const L = room(); L.fill(0, 20, 12, 21, SOLID);
  const p = spawn(L, 10, 20); settle(p);
  let fell = 0;
  for (let i = 0; i < 120 && fell < 4; i++) { p.update(I({ x: 1 }), STEP); if (!p.onGround && p.x > 12 * 16 - 2) fell++; }
  const yBefore = p.y;
  p.update(I({ x: 1, jumpPressed: true, jumpHeld: true }), STEP);
  check("coyote jump", p.vy < -100, `vy after jump ${p.vy.toFixed(0)}, y ${yBefore}->${p.y}`);
}
// 4. jump buffer: press jump 5 frames before landing
{
  const L = room(); const p = spawn(L, 10, 28); settle(p);
  p.y -= 60;
  let pressed = false, jumped = false;
  for (let i = 0; i < 120; i++) {
    const distToFloor = 28 * 16 - (p.y + PH);
    const press = !pressed && distToFloor > 0 && distToFloor < p.vy * STEP * 5;
    if (press) pressed = true;
    p.update(I({ jumpPressed: press, jumpHeld: pressed }), STEP);
    if (pressed && p.vy < -200) { jumped = true; break; }
  }
  check("jump buffer", pressed && jumped, `pressed=${pressed} jumped=${jumped}`);
}
// 5. walls are parked: holding into a wall while falling neither slides nor wall-jumps
if (!FEATURES.wall) {
  const L = room(); L.fill(20, 0, 21, 27, SOLID);
  const kinds: string[] = [];
  const ev = { ...noop, jump: (k: string) => { kinds.push(k); } };
  const p = new Player(L, 20 * 16 - PW - 1, 28 * 16 - PH - 200, ev as PlayerEvents);
  let everSlid = false;
  for (let i = 0; i < 40; i++) { p.update(I({ x: 1, jumpPressed: i % 6 === 0, jumpHeld: true }), STEP); everSlid ||= p.wallSliding; }
  check("walls disabled: no slide, no wall jump", !everSlid && !kinds.includes("wall"), `slid=${everSlid} jumps=${kinds.join(",") || "none"}`);
}
// 6. dash distance
{
  const L = room(80, 30); const p = spawn(L, 5, 28); settle(p);
  const x0 = p.x;
  p.update(I({ x: 1, dashPressed: true }), STEP);
  for (let i = 0; i < 30; i++) p.update(I(), STEP);
  check("ground dash distance", p.x - x0 > 100 && p.x - x0 < 220, `${p.x - x0}px`);
}
// 7. air dash refills only on ground
{
  const L = room(80, 30); const p = spawn(L, 5, 28); settle(p);
  p.update(I({ jumpPressed: true, jumpHeld: true }), STEP);
  for (let i = 0; i < 10; i++) p.update(I({ jumpHeld: true }), STEP);
  p.update(I({ x: 1, dashPressed: true }), STEP);
  for (let i = 0; i < 12; i++) p.update(I(), STEP);
  const xA = p.x;
  p.update(I({ x: 1, dashPressed: true }), STEP);
  for (let i = 0; i < 5; i++) p.update(I(), STEP);
  check("no second air dash", p.state !== "dash" && p.dashes === 0, `state=${p.state} dashes=${p.dashes} moved ${p.x - xA}`);
  for (let i = 0; i < 90; i++) p.update(I(), STEP);
  check("dash refilled on landing", p.dashes === 1, `dashes=${p.dashes}`);
}
// 8. dash jump keeps speed
{
  const L = room(120, 30); const p = spawn(L, 5, 28); settle(p);
  p.update(I({ x: 1, dashPressed: true }), STEP);
  for (let i = 0; i < 3; i++) p.update(I({ x: 1 }), STEP);
  p.update(I({ x: 1, jumpPressed: true, jumpHeld: true }), STEP);
  check("dash jump (super)", p.vx >= TUNE.superSpeed - 1 && p.vy < 0, `vx=${p.vx.toFixed(0)} vy=${p.vy.toFixed(0)}`);
}
// 9. one-way: land on it, then drop through with down+jump; jump up through from below
{
  const L = room(); L.fill(5, 20, 15, 20, ONEWAY);
  const p = spawn(L, 10, 20); p.y -= 40;
  for (let i = 0; i < 60; i++) p.update(I(), STEP);
  const onTop = p.bottom === 20 * 16 && p.onGround;
  p.update(I({ y: 1, jumpPressed: true, jumpHeld: true }), STEP);
  for (let i = 0; i < 30; i++) p.update(I({ y: 1 }), STEP);
  check("one-way land + drop", onTop && p.bottom > 20 * 16 + 8, `onTop=${onTop} bottom=${p.bottom}`);
  const L2 = room(); L2.fill(5, 24, 15, 24, ONEWAY);
  const q = spawn(L2, 10, 28); settle(q);
  q.update(I({ jumpPressed: true, jumpHeld: true }), STEP);
  for (let i = 0; i < 80; i++) q.update(I({ jumpHeld: true }), STEP);
  check("one-way jump up through", q.bottom === 24 * 16, `bottom=${q.bottom}`);
}
// 10. corner correction: ceiling edge 3px over the head
{
  const L = room(); L.fill(0, 22, 9, 22, SOLID);
  const p = spawn(L, 10, 28); settle(p);
  p.x = 160 - 3;
  p.update(I({ jumpPressed: true, jumpHeld: true }), STEP);
  let minY = p.y;
  for (let i = 0; i < 40; i++) { p.update(I({ jumpHeld: true }), STEP); minY = Math.min(minY, p.y); }
  check("ceiling corner correction", minY < 22 * 16, `x=${p.x} minY=${minY} (ceiling bottom ${23 * 16})`);
}

const d = derivedJump(TUNE);
console.log(`\ngravity ${d.gravity.toFixed(0)} px/s², jump speed ${d.jumpSpeed.toFixed(0)} px/s`);
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
