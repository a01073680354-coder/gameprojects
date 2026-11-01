// Headless tests for the kamikaze drone: lock-on, ram, fuse, blast, dash dodge.
import { Level, SOLID } from "../src/world/level";
import { World, WorldEvents } from "../src/sim/world";
import { InputFrame } from "../src/core/input";

let fails = 0;
function check(name: string, ok: boolean, info: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — ${info}`);
  if (!ok) fails++;
}
function makeEv(log: string[]): WorldEvents {
  return new Proxy({}, {
    get: (_t, key: string) => (...a: any[]) => {
      if (key === "kamikazeBoom") log.push(a[1] ? "boomHit" : a[2] ? "boomDodged" : "boom");
      else log.push(key);
    },
  }) as WorldEvents;
}
const I = (o: Partial<InputFrame> = {}): InputFrame => ({
  x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, parryPressed: false, aimX: 0, aimY: 0, ...o,
});
function setup(extra: Level["spawns"] = []) {
  const L = new Level(80, 30);
  L.fill(0, 28, 79, 29, SOLID);
  L.spawnX = 20 * 16 + 8;
  L.spawnY = 28 * 16;
  L.spawns = [{ kind: "kamikaze", x: 30, y: 25, group: 1 }, ...extra];
  const log: string[] = [];
  const w = new World(L, makeEv(log));
  w.player.invuln = 0;
  return { w, log, k: w.soldiers[0] };
}

// 1. it sees you, locks, rams, latches and blows
{
  const { w, log, k } = setup();
  const seen: string[] = [];
  for (let i = 0; i < 400 && k.alive; i++) { w.step(I()); if (seen[seen.length - 1] !== k.state) seen.push(k.state); }
  check("lock -> ram -> armed -> blast hurts a hero who stands there", seen.join(">").endsWith("alert>charge>armed>dead") && log.includes("boomHit") && w.player.hp === 4,
    `${seen.join(">")} hp=${w.player.hp}`);
}
// 2. running away doesn't save you
{
  const { w, log, k } = setup();
  for (let i = 0; i < 400 && k.alive; i++) w.step(I({ x: k.state === "armed" ? -1 : 0 }));
  check("outrunning an armed one fails", log.includes("boomHit"), `log=${log.filter((e) => e.startsWith("boom")).join(",")}`);
}
// 3. dashing through the blast is the answer
{
  const { w, log, k } = setup();
  let dashed = false;
  for (let i = 0; i < 400 && k.alive; i++) {
    const o: Partial<InputFrame> = {};
    if (k.state === "armed" && k.fuse < 0.07 && !dashed) { dashed = true; o.dashPressed = true; o.x = 1; }
    w.step(I(o));
  }
  check("a dash timed with the blast threads it", log.includes("boomDodged") && w.player.hp === 5, `hp=${w.player.hp} ${log.filter((e) => e.startsWith("boom")).join(",")}`);
}
// 4. a slash downs it, but it still goes off (knocked away, short fuse)
{
  const { w, log, k } = setup();
  let cut = false;
  for (let i = 0; i < 400 && k.alive; i++) {
    const near = k.state === "charge" && Math.hypot(k.cx - w.player.cx, k.cy - (w.player.y + 20)) < 50;
    if (near && !cut) { cut = true; w.step(I({ slashPressed: true, aimX: k.cx, aimY: k.cy })); continue; }
    w.step(I({ aimX: k.cx, aimY: k.cy }));
    if (cut && k.state === "armed") { check("cut: short fuse", k.fuseMax < 0.5 && Math.abs(k.vx) > 50, `fuse=${k.fuseMax} vx=${k.vx.toFixed(0)}`); cut = false; }
  }
  check("...and it blows where it was knocked", log.includes("kamikazeArm") && log.some((e) => e.startsWith("boom")), log.filter((e) => e.startsWith("boom")).join(","));
}
// 5. the blast chains into other drones and hurts soldiers
{
  const { w, log, k } = setup([{ kind: "kamikaze", x: 32, y: 25, group: 2 }, { kind: "rifle", x: 31, y: 28, group: 3 }]);
  w.player.invuln = 999;
  const other = w.soldiers[1], rifle = w.soldiers[2];
  w.armKamikaze(k, 0.05);
  for (let i = 0; i < 60; i++) w.step(I());
  check("blasts chain and kill bystanders", !other.alive && !rifle.alive && log.filter((e) => e.startsWith("boom")).length === 2, `other=${other.state} rifle=${rifle.state}`);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
