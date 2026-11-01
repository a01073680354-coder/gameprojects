// Headless tests for stage 3: laser doors, record fragments, turrets, and the
// Archivist (bullets sent back are the only thing that hurts him).
import { buildStage3 } from "../src/world/stage3";
import { World, WorldEvents } from "../src/sim/world";
import { Archivist, ARC } from "../src/sim/archivist";
import { Bullet } from "../src/sim/bullet";
import { InputFrame } from "../src/core/input";
import { TILE } from "../src/config";

let fails = 0;
function check(name: string, ok: boolean, info: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — ${info}`);
  if (!ok) fails++;
}
function makeEv(log: string[]): WorldEvents {
  return new Proxy({}, {
    get: (_t, key: string) => (...a: any[]) => {
      if (key === "archivist") log.push("arc:" + a[1]);
      else if (key === "record") log.push("rec:" + a[0]);
      else log.push(key);
    },
  }) as WorldEvents;
}
const I = (o: Partial<InputFrame> = {}): InputFrame => ({
  x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, parryPressed: false, aimX: 0, aimY: 0, ...o,
});
function at(tx: number, ty: number) {
  const L = buildStage3();
  L.spawns = [];
  L.spawnX = tx * TILE + 8;
  L.spawnY = ty * TILE;
  const log: string[] = [];
  const w = new World(L, makeEv(log));
  return { w, log, L };
}
function vault() {
  const r = at(226, 28);
  const b = r.w.boss as Archivist;
  for (let i = 0; i < 30 && b.state === "dormant"; i++) r.w.step(I({ x: 1 }));
  for (let i = 0; i < 400 && b.state === "intro"; i++) r.w.step(I());
  return { ...r, b };
}
/** A reflected bullet flying straight into the pod. */
function shoot(w: World, b: Archivist, kind: Bullet["kind"] = "normal", perfect = false) {
  const x = b.cx, y = b.bottom + 30;
  const u = new Bullet(x, y, 0, -500, "player");
  u.kind = kind;
  u.perfect = perfect;
  u.reflected = true;
  u.radius = kind === "orb" ? 5 : 2;
  w.bullets.push(u);
  for (let i = 0; i < 12 && u.alive; i++) w.step(I());
  return u;
}

// 1. laser doors: live ones hurt, dashing through them doesn't
{
  const { w, log, L } = at(84, 30);
  const g = L.gates[0];
  let hit = false;
  for (let i = 0; i < 60 * 3 && !hit; i++) {
    w.player.x = g.x * TILE + 8 - w.player.w / 2;
    w.step(I());
    hit = log.includes("gateZap");
  }
  check("a live laser door zaps you", hit && log.includes("playerHit"), `state=${w.gateState(0)}`);
}
{
  const { w, log, L } = at(84, 30);
  const g = L.gates[0];
  // wait for it to be live, then dash through
  for (let i = 0; i < 60 * 3 && w.gateState(0) !== 1; i++) w.step(I());
  for (let i = 0; i < 60 && w.gateState(0) !== 2; i++) w.step(I());
  w.player.x = g.x * TILE - 20;
  w.player.invuln = 0;
  w.step(I({ x: 1, dashPressed: true }));
  for (let i = 0; i < 14; i++) w.step(I({ x: 1 }));
  check("a dash goes through a live door", !log.includes("gateZap") && w.player.x > g.x * TILE + 8, `x=${(w.player.x / TILE).toFixed(1)} log=${log.filter((e) => e === "gateZap" || e === "dodge").join(",")}`);
}
// 2. record fragments: read once
{
  const { w, log } = at(18, 30);
  for (let i = 0; i < 80; i++) w.step(I({ x: 1 }));
  for (let i = 0; i < 80; i++) w.step(I({ x: -1 }));
  check("walking into a record reads it, once", log.filter((e) => e === "rec:r-citizen1").length === 1, log.filter((e) => e.startsWith("rec:")).join(","));
}
// 3. the pod lowers, the turrets come on line
{
  const { w, log, b } = vault();
  const turrets = w.soldiers.filter((s) => s.kind === "turret" && s.alive);
  check("the Archivist lowers into the vault and arms two turrets", b.state === "hang" && turrets.length === 2 && log.includes("arc:turrets"), `state=${b.state} turrets=${turrets.length}`);
  check("he hangs out of sword reach", b.bottom < w.player.y - 60, `pod bottom=${b.bottom} hero top=${w.player.y}`);
}
// 4. only bullets sent back hurt him; orbs hurt more; a slash glances
{
  const { w, log, b } = vault();
  const hp0 = b.hp;
  shoot(w, b, "normal");
  const afterNormal = b.hp;
  shoot(w, b, "orb");
  check("a reflected bullet chips the pod, an orb twice as much", hp0 - afterNormal === 1 && afterNormal - b.hp === 2, `hp ${hp0}→${afterNormal}→${b.hp}`);
  const hp1 = b.hp;
  (w as any).slashHit(b);
  check("a slash on the glass glances off", b.hp === hp1 && log.includes("guardBlock"), `hp=${b.hp}`);
}
// 5. empty the pod: it crashes; a deathblow takes a mark and starts phase 2
{
  const { w, log, b } = vault();
  w.player.invuln = 999;
  b.hp = 1;
  shoot(w, b, "normal");
  let landed = false;
  for (let i = 0; i < 90; i++) { w.step(I()); if (b.bottom >= b.floorY - 1) landed = true; }
  check("emptied, the pod falls and lies open", b.state === "stagger" && landed, `state=${b.state} bottom=${b.bottom} floor=${b.floorY}`);
  w.player.x = b.cx - 30;
  w.player.y = b.floorY - w.player.h;
  (w as any).slashHit(b);
  check("...a deathblow takes the first mark", b.marks === 1 && b.state === "kneel" && log.includes("deathblow"), `marks=${b.marks} state=${b.state}`);
  for (let i = 0; i < 60 * 6 && !(b.phase === 2 && b.state === "hang"); i++) w.step(I());
  const turrets = w.soldiers.filter((s) => s.kind === "turret" && s.alive).length;
  check("phase 2: back up, full strength, more turrets", b.phase === 2 && b.hp === b.hpMax && turrets >= 4, `phase=${b.phase} hp=${b.hp} turrets=${turrets}`);
}
// 6. the erasure sweep: stand still and it gets you
{
  const { w, log, b } = vault();
  w.player.invuln = 0;
  const orig = Math.random;
  Math.random = () => 0.55; // fan 3, sweep 2.2 ... -> sweep
  b.state = "hang"; b.timer = 0; b.lastMoves = [];
  for (let i = 0; i < 60 * 5 && !log.includes("playerHit"); i++) { w.player.hp = 9; w.step(I()); }
  Math.random = orig;
  check("the floor sweep hits a hero who stays on the ground", log.includes("arc:sweepWind") && log.includes("playerHit"), log.filter((e) => e.startsWith("arc:")).slice(0, 5).join(","));
}
// 7. the grid: the gap is safe
{
  const { w, log, b } = vault();
  w.player.invuln = 0;
  const orig = Math.random;
  Math.random = () => 0.85; // -> grid
  b.state = "hang"; b.timer = 0; b.lastMoves = [];
  w.step(I());
  Math.random = orig;
  const gx = b.beams[b.gap];
  let hit = false;
  for (let i = 0; i < 60 * 2.5; i++) { w.player.x = gx - w.player.w / 2; w.player.hp = 9; w.step(I()); if (log.includes("playerHit")) hit = true; }
  check("standing in the grid's gap is safe", log.includes("arc:gridWind") && log.includes("arc:gridOn") && !hit, `gap=${b.gap} beams=${b.beams.length}`);
}
// 8. Total Erasure: once, low in phase 2; its core orb sent home nearly ends it
{
  const { w, log, b } = vault();
  w.player.invuln = 999;
  b.phase = 2; b.marks = 1;
  b.hp = Math.floor(b.hpMax * ARC.eraseAt) - 1;
  b.state = "hang"; b.timer = 0;
  let core: Bullet | undefined;
  for (let i = 0; i < 60 * 10 && !core; i++) {
    w.step(I());
    core = w.bullets.find((u) => (u as any).core);
  }
  check("phase 2, low: 전 기록 소거, ending in a core orb", log.includes("arc:erase") && log.filter((e) => e === "arc:ring").length === 3 && !!core, log.filter((e) => e.startsWith("arc:")).join(","));
  const hp0 = b.hp;
  if (core) { core.alive = false; shoot(w, b, "orb"); }
  const big = new Bullet(b.cx, b.bottom + 30, 0, -500, "player");
  (big as any).core = true; big.kind = "orb"; big.radius = 8;
  w.bullets.push(big);
  for (let i = 0; i < 12; i++) w.step(I());
  check("the core orb reflected into the pod breaks him", b.state === "stagger", `hp ${hp0}→${b.hp} state=${b.state}`);
}
// 9. turrets die to their own bullets
{
  const { w, b } = vault();
  const t = w.soldiers.find((s) => s.kind === "turret")!;
  for (let k = 0; k < 2; k++) {
    const u = new Bullet(t.cx, t.cy + 40, 0, -500, "player");
    u.reflected = true;
    w.bullets.push(u);
    for (let i = 0; i < 10; i++) w.step(I());
  }
  check("two reflected bullets take a turret down", !t.alive, `hp=${t.hp} state=${t.state}`);
  void b;
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
