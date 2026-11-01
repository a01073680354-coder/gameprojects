// Headless tests for 방벽, STAGE 2's riot machine: the shield stops swords
// and bullets from the front, the cooling vent on its back-top corner takes
// only sent-back bullets (from behind or from above), then the shield drops,
// the hull opens, and it is destroyed with a deathblow.
import { Level, SOLID, ONEWAY } from "../src/world/level";
import { World, WorldEvents } from "../src/sim/world";
import { Bulwark, BUL } from "../src/sim/bulwark";
import { Bullet } from "../src/sim/bullet";
import { InputFrame } from "../src/core/input";
import { TILE } from "../src/config";
import { buildMarket } from "../src/world/stage_market";

let fails = 0;
function check(name: string, ok: boolean, info: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — ${info}`);
  if (!ok) fails++;
}
function makeEv(log: string[]): WorldEvents {
  return new Proxy({}, {
    get: (_t, key: string) => (...a: any[]) => {
      if (key === "clash") log.push(a[0].heavy ? "clashH" : "clash");
      else if (key === "perilous") log.push("peril:" + a[1]);
      else if (key === "bulwark") log.push("bul:" + a[1]);
      else log.push(key);
    },
  }) as WorldEvents;
}
const I = (o: Partial<InputFrame> = {}): InputFrame => ({
  x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, parryPressed: false, aimX: 0, aimY: 0, ...o,
});

/** A yard like the real one: floor row 28, catwalks at row 23 on both sides, one at row 19 in the middle. */
function yard() {
  const L = new Level(64, 30);
  L.fill(0, 28, 63, 29, SOLID);
  L.fill(10, 23, 16, 23, ONEWAY);
  L.fill(38, 23, 44, 23, ONEWAY);
  L.fill(24, 19, 30, 19, ONEWAY);
  L.spawnX = 7 * TILE + 8;
  L.spawnY = 28 * TILE;
  L.arenas.push({ group: 8, trigger: 9, walls: [{ x: 8, y0: 0, y1: 27 }, { x: 46, y0: 0, y1: 27 }], entrance: false, boss: true });
  L.boss = { x: 30, y: 28, group: 8, kind: "bulwark" };
  const log: string[] = [];
  const w = new World(L, makeEv(log));
  const b = w.boss as Bulwark;
  for (let i = 0; i < 80 && b.state === "dormant"; i++) w.step(I({ x: 1 }));
  for (let i = 0; i < 400 && b.state === "intro"; i++) w.step(I());
  return { w, log, b };
}
/** One of our bullets, already sent back, flying from (x, y) at a target. */
function shot(w: World, x: number, y: number, tx: number, ty: number, perfect = false) {
  const d = Math.hypot(tx - x, ty - y);
  const u = new Bullet(x, y, ((tx - x) / d) * 520, ((ty - y) / d) * 520, "player");
  u.reflected = true;
  u.perfect = perfect;
  w.bullets.push(u);
  for (let i = 0; i < 40 && u.alive; i++) w.step(I());
  return u;
}
const freeze = (b: Bulwark) => { b.state = "recover"; b.timer = 99; b.vx = 0; };

// 1. who it is
{
  const { b } = yard();
  check("방벽 is a Bulwark: shielded, one deathblow mark, the vent intact", b instanceof Bulwark && b.shielded && b.marks === 1 && b.ventHp === BUL.ventHp, `state=${b.state}`);
  check("it stands facing the way you came", b.facing === -1 && b.state !== "intro", `facing=${b.facing} state=${b.state}`);
}

// 2. the shield and the vent
{
  const { w, b, log } = yard();
  freeze(b);
  const v = b.ventCenter();
  // from the front, at the floor: aiming at the vent only finds the shield
  shot(w, b.x - 90, b.bottom - 30, v.x, v.y);
  check("from the front, a bullet aimed at the vent hits the shield", b.ventHp === BUL.ventHp && log.includes("bul:clank"), `vent=${b.ventHp} log=${log.filter((e) => e.startsWith("bul")).join()}`);
  // from behind, at the floor
  shot(w, b.x + b.w + 80, b.bottom - 30, v.x, v.y);
  check("from behind, the same shot goes into the vent", b.ventHp === BUL.ventHp - 1 && log.includes("bul:vent"), `vent=${b.ventHp}`);
  // from above, on the high catwalk in front
  shot(w, b.x - 30, 19 * TILE - 22, v.x, v.y);
  check("from the high catwalk in front, dropping onto the vent works too", b.ventHp === BUL.ventHp - 2, `vent=${b.ventHp}`);
  // the body (low, from behind) is armour
  shot(w, b.x + b.w + 80, b.bottom - 8, b.cx, b.bottom - 10);
  check("the hull is armour while the shield is up", b.ventHp === BUL.ventHp - 2 && log.includes("bul:armor") && b.hp === BUL.hp, `hp=${b.hp}`);
  // a perfect parry counts twice and finishes it
  shot(w, b.x + b.w + 80, b.bottom - 30, v.x, v.y, true);
  check("a perfect shot counts twice: the vent bursts, the shield drops", !b.shielded && b.state === "shed" && log.includes("bul:shed"), `vent=${b.ventHp} state=${b.state}`);
  for (let i = 0; i < 120; i++) w.step(I());
  check("the shield falls to the floor and stays there", !!b.shieldDrop?.rest && Math.abs(b.shieldDrop.y - (b.bottom - 5)) < 1, JSON.stringify(b.shieldDrop && { y: Math.round(b.shieldDrop.y), rest: b.shieldDrop.rest }));
}

// 3. swords
{
  const { w, b, log } = yard();
  freeze(b);
  w.player.x = b.x - 26;
  w.player.facing = 1;
  for (let i = 0; i < 30; i++) w.step(I({ slashPressed: i % 10 === 0, aimX: b.cx, aimY: b.cy }));
  check("while shielded, the sword only rings off it", b.hp === BUL.hp && log.includes("guardBlock"), `hp=${b.hp}`);
  b.shielded = false; b.state = "recover"; b.timer = 99;
  const n = log.length;
  for (let i = 0; i < 30; i++) w.step(I({ slashPressed: i % 10 === 0, aimX: b.cx, aimY: b.cy }));
  check("open, every cut lands", b.hp < BUL.hp && log.slice(n).includes("meleeHit"), `hp=${b.hp}`);
}

// 4. its moves
{
  const { w, b, log } = yard();
  const seen = new Set<string>();
  for (let i = 0; i < 60 * 50; i++) {
    w.player.invuln = 999;
    // in front on the floor, then behind it, then up on a catwalk
    const ph = Math.floor(i / 600) % 3;
    if (ph === 0) { w.player.x = b.x - 120; w.player.y = 28 * TILE - w.player.h; }
    if (ph === 1) { w.player.x = b.x + b.w + 60; w.player.y = 28 * TILE - w.player.h; }
    if (ph === 2) { w.player.x = 12 * TILE; w.player.y = 23 * TILE - w.player.h; }
    w.player.vx = w.player.vy = 0;
    w.step(I());
    seen.add(b.state);
  }
  check("burst: a laser sight, then rounds", seen.has("bAim") && seen.has("bFire") && log.includes("aimStart") && log.includes("shot"), [...seen].join(","));
  check("ram: a red ! then a charge", seen.has("ramWind") && seen.has("ram") && log.includes("danger"), "");
  check("slam: a purple 危 and shockwaves", seen.has("slamWind") && log.includes("peril:slam") && log.includes("bossSmash"), "");
  check("with you behind it, it turns (slowly)", seen.has("turn") && log.includes("bul:turned"), "");
}
{
  // the turret swivels: from behind, its rounds come back over its own back
  const { w, b } = yard();
  w.player.x = b.x + b.w + 70;
  let fired: Bullet | null = null;
  const orig = Math.random;
  Math.random = () => 0.01; // always "burst"
  for (let i = 0; i < 60 * 6 && !fired; i++) {
    w.player.invuln = 999;
    w.step(I());
    fired = w.bullets.find((o) => o.owner === "enemy" && o.kind === "normal") ?? null;
  }
  Math.random = orig;
  check("facing away, it still fires at you over its back", !!fired && fired.vx > 0 && b.facing === -1, fired ? `vx=${fired.vx.toFixed(0)} facing=${b.facing}` : "no shot");
}

// 5. the ram: parried, it stops dead; jumped, you are behind it
{
  const { w, b, log } = yard();
  const orig = Math.random;
  Math.random = () => 0.5;
  w.player.x = b.x - 150;
  b.moves = ["burst", "slam"];
  let stopped = false;
  for (let i = 0; i < 60 * 12 && !stopped; i++) {
    w.player.invuln = 999;
    const near = b.state === "ram" && Math.abs(b.cx - w.player.cx) < 80 && w.player.parryTimer <= 0;
    w.step(I({ parryPressed: near, aimX: b.cx, aimY: b.cy }));
    if (log.includes("bul:stopped")) stopped = true;
  }
  Math.random = orig;
  check("a parried ram: heavy clash, shoved back, stalled", stopped && log.includes("clashH") && b.state === "recoil", `state=${b.state}`);
}

// 6. the whole fight, played the intended way
{
  const { w, b, log } = yard();
  let t = 0, ventDown = -1;
  for (; t < 60 * 180 && b.state !== "dead"; t++) {
    w.player.invuln = 999;
    const p = w.player;
    const o: Partial<InputFrame> = {};
    if (b.shielded) {
      // stay behind it on the floor; parry its rounds into the vent
      const want = b.facing < 0 ? b.x + b.w + 60 : b.x - 60;
      if (Math.abs(p.cx - want) > 12) o.x = Math.sign(want - p.cx);
      const v = b.ventCenter();
      o.aimX = v.x; o.aimY = v.y;
      const near = w.bullets.some((u) => u.owner === "enemy" && u.alive && u.kind === "normal" && Math.hypot(u.x - p.cx, u.y - (p.y + 20)) < 46);
      o.parryPressed = near && p.parryTimer <= 0;
      if (b.state === "slamWind" && b.timer < 0.12) { o.jumpPressed = true; o.jumpHeld = true; }
    } else {
      if (ventDown < 0) ventDown = t;
      const dx = b.cx - p.cx;
      if (Math.abs(dx) > 40) o.x = Math.sign(dx);
      o.aimX = b.cx; o.aimY = b.cy;
      o.slashPressed = t % 14 === 0;
      if (b.state === "slamWind" && b.timer < 0.12) { o.jumpPressed = true; o.jumpHeld = true; }
      if (b.state === "ram" && Math.abs(dx) < 80 && p.parryTimer <= 0) o.parryPressed = true;
    }
    w.step(I(o));
  }
  check("parried home into the vent, the shield drops", ventDown > 0, `vent down at ${(ventDown / 60).toFixed(0)}s`);
  check("then cut down and destroyed with a deathblow", b.state === "dead" && log.includes("deathblow") && log.includes("bossDefeated"), `t=${(t / 60).toFixed(0)}s state=${b.state} hp=${b.hp}`);
  check("a sensible length for a second-stage boss (25-120 s for a strong player)", t / 60 > 25 && t / 60 < 120, `${(t / 60).toFixed(0)}s`);
}

// 7. the real yard
{
  const L = buildMarket();
  check("the market ends at 방벽", L.boss?.kind === "bulwark", String(L.boss?.kind));
  const a = L.arenas.find((x) => x.boss)!;
  const width = (Math.max(...a.walls.map((x) => x.x)) - Math.min(...a.walls.map((x) => x.x))) * TILE;
  check("its yard fits on one screen", width <= 640, `${width}px`);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
