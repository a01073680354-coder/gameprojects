// Headless boss tests: entrance, parryable combo, posture break and
// deathblow, unparryable sweep, leap shockwaves, phase change and defeat.
import { Level, SOLID, BARRIER, ONEWAY } from "../src/world/level";
import { World, WorldEvents } from "../src/sim/world";
import { CHAIN, Boss, BOSS } from "../src/sim/boss";
import { InputFrame } from "../src/core/input";
import { TILE, TUNE } from "../src/config";
import { LATE_GRACE_FRAMES } from "../src/sim/world";

let fails = 0;
function check(name: string, ok: boolean, info: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — ${info}`);
  if (!ok) fails++;
}

function makeEv(log: string[]): WorldEvents {
  const n = (k: string) => () => { log.push(k); };
  const ev: any = new Proxy({}, {
    get: (_t, key: string) => {
      if (key === "clash") return (c: any) => log.push(c.heavy ? "clashH" : "clash");
      if (key === "perilous") return (_s: any, k: string) => log.push("peril:" + k);
      if (key === "playerHit") return () => log.push("pHit");
      return n(key);
    },
  });
  return ev as WorldEvents;
}

const I = (o: Partial<InputFrame> = {}): InputFrame => ({
  x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, parryPressed: false, aimX: 0, aimY: 0, ...o,
});

function arena() {
  const L = new Level(60, 30);
  L.fill(0, 28, 59, 29, SOLID);
  L.spawnX = 12 * 16 + 8;
  L.spawnY = 28 * 16;
  L.arenas.push({ group: 7, trigger: 14, walls: [{ x: 6, y0: 0, y1: 27 }, { x: 50, y0: 0, y1: 27 }], entrance: false, boss: true });
  L.boss = { x: 30, y: 28, group: 7 };
  return L;
}

function setup() {
  const log: string[] = [];
  const w = new World(arena(), makeEv(log));
  return { w, log, b: w.boss! };
}

/** Walk in and sit through the intro. */
function enter(w: World, b: Boss) {
  for (let i = 0; i < 60 && b.state === "dormant"; i++) w.step(I({ x: 1 }));
  for (let i = 0; i < 400 && b.state === "intro"; i++) w.step(I());
}

const aimAt = (b: Boss) => ({ aimX: b.cx, aimY: b.cy });
/** A good duelist: parries each live strike just before it lands. */
function duelist(w: World, b: Boss): Partial<InputFrame> {
  const winding = ((b.state === "windup" || b.state === "delay" || b.state === "chainWind") && b.timer < 0.04)
    || (b.state === "heavyWindup" && b.timer < 0.04 && Math.abs(b.cx - w.player.cx) < 110)
    || (b.state === "lunge" && Math.abs(b.cx - w.player.cx) < 105 && w.player.parryTimer <= 0);
  return { parryPressed: winding, ...aimAt(b) };
}

// 1. entrance
{
  const { w, log, b } = setup();
  check("boss waits dormant", b.state === "dormant" && w.soldiers.includes(b), b.state);
  for (let i = 0; i < 60 && b.state === "dormant"; i++) w.step(I({ x: 1 }));
  const walls = w.level.get(6, 20) === BARRIER && w.level.get(50, 20) === BARRIER;
  check("arena seals and the intro starts", b.state === "intro" && log.includes("bossIntro") && walls, `state=${b.state} walls=${walls}`);
  check("boss can't be hurt during the intro", !w.hittable(b), String(w.hittable(b)));
}

// 2. the combo is three parryable cuts, the third after a long hold
{
  const { w, log, b } = setup();
  enter(w, b);
  w.player.invuln = 999;
  const orig = Math.random;
  Math.random = () => 0.01; // always "combo"
  const seen: string[] = [];
  let clashes = 0;
  for (let i = 0; i < 600 && b.state !== "recover"; i++) {
    const before = log.length;
    w.step(I(duelist(w, b)));
    if (seen[seen.length - 1] !== b.state) seen.push(b.state);
    clashes += log.slice(before).filter((e) => e === "clash" || e === "clashH").length;
  }
  Math.random = orig;
  check("combo: windup/strike x2, a delayed hold, then the cleave", seen.includes("delay") && clashes === 3 && b.state === "recover",
    `clashes=${clashes} states=${seen.join(">")}`);
  check("parries fill his posture but don't stop the combo", b.posture > 50 && b.posture < BOSS.postureMax, `posture=${b.posture.toFixed(0)}`);
}

// 3. mistiming the delayed hit gets you cut
{
  const { w, log, b } = setup();
  enter(w, b);
  w.player.invuln = 0;
  const orig = Math.random;
  Math.random = () => 0.01;
  let hit = false;
  for (let i = 0; i < 600 && !hit && b.state !== "recover"; i++) {
    // parry the first two on time, then panic-press as soon as the hold starts
    const early = b.state === "delay" && b.stateT < 0.05;
    const press = b.state === "delay" ? early : duelist(w, b).parryPressed;
    w.step(I({ parryPressed: press, ...aimAt(b) }));
    hit = log.includes("pHit");
  }
  Math.random = orig;
  check("the delayed third punishes an early parry", hit, `hp=${w.player.hp}`);
}

// 4. sweep: parrying doesn't help, jumping does
{
  for (const jump of [false, true]) {
    const { w, log, b } = setup();
    enter(w, b);
    w.player.invuln = 0;
    const orig = Math.random;
    Math.random = () => 0.75; // close range -> "sweep" (combo 5, iai 1.2, sweep 3, leap 1)
    w.player.x = b.x - 60;
    let started = false, done = false, acted = false;
    for (let i = 0; i < 400 && !done; i++) {
      const o: Partial<InputFrame> = { ...aimAt(b) };
      if (b.state === "sweepWindup") {
        started = true;
        if (b.timer < 0.12 && !acted) { acted = true; if (jump) { o.jumpPressed = true; o.jumpHeld = true; } else o.parryPressed = true; }
      }
      if (jump && b.state === "sweep") o.jumpHeld = true;
      w.step(I(o));
      if (started && b.state === "recover") done = true;
    }
    Math.random = orig;
    const hit = log.includes("pHit");
    check(jump ? "sweep: jumping over it is safe" : "sweep: it cannot be parried",
      started && done && (jump ? !hit : hit && log.includes("peril:sweep")), `started=${started} hit=${hit} hp=${w.player.hp}`);
  }
}

// 5. leap: the landing throws shockwaves both ways; stand still and get hit
{
  const { w, log, b } = setup();
  enter(w, b);
  w.player.invuln = 0;
  const orig = Math.random;
  Math.random = () => 0.99; // far range -> leap is last in the table
  w.player.x = 12 * 16;
  b.x = 44 * 16;
  let waves = 0, landed = false;
  for (let i = 0; i < 400; i++) {
    w.step(I(aimAt(b)));
    if (log.includes("bossSmash")) landed = true;
    waves = Math.max(waves, w.bullets.filter((o) => o.kind === "wave").length);
    if (landed && b.state === "recover") break;
  }
  Math.random = orig;
  check("leap lands with two shockwaves", landed && waves === 2 && log.includes("peril:leap"), `landed=${landed} waves=${waves}`);
  check("he lands where you stood (and it hurts)", log.includes("pHit") && Math.abs(b.cx - w.player.cx) < 120, `dx=${(b.cx - w.player.cx).toFixed(0)}`);
}

// 6. iai: telegraphed red "!", parried as a heavy clash
{
  const { w, log, b } = setup();
  enter(w, b);
  w.player.invuln = 999;
  const orig = Math.random;
  Math.random = () => 0.3; // mid range -> combo 3 / iai 3 ... 0.3*9.5 = 2.85 -> combo; use far range instead
  w.player.x = 14 * 16;
  b.x = 30 * 16;
  Math.random = () => 0.4; // far: combo 1, iai 4, sweep 0, leap 4 -> 0.4*9 = 3.6 -> iai
  let clashed = false, before = 0;
  for (let i = 0; i < 400 && !clashed; i++) {
    const was = b.state, n = log.length, pb = b.posture;
    w.step(I(duelist(w, b)));
    if (was === "lunge" && log.slice(n).includes("clashH")) { clashed = log.includes("danger"); before = b.posture - pb; }
  }
  Math.random = orig;
  check("iai dash: danger, then a heavy clash", clashed && before >= 45, `state=${b.state} posture gain=${before.toFixed(0)}`);
}

// 7. the whole fight: parry to a break, deathblow, phase two, deathblow, defeat
{
  const { w, log, b } = setup();
  enter(w, b);
  w.player.invuln = 999;
  let phase2 = false, t = 0;
  for (; t < 60 * 120 && b.alive; t++) {
    w.player.invuln = 999;
    const o = duelist(w, b);
    if (b.state === "stagger") {
      // close in and finish it
      const dx = b.cx - w.player.cx;
      if (Math.abs(dx) > 30) o.x = Math.sign(dx);
      else o.slashPressed = true;
    }
    // hop the unparryables
    if ((b.state === "sweepWindup" && b.timer < 0.12) || (b.state === "air" && b.vy > 0)) { o.jumpPressed = true; o.jumpHeld = true; }
    w.step(I(o));
    if (b.phase === 2) phase2 = true;
  }
  const blows = log.filter((e) => e === "deathblow").length;
  check("two deathblows: phase two, then defeat", phase2 && blows === 2 && !b.alive && log.includes("bossDefeated"),
    `phase2=${phase2} deathblows=${blows} state=${b.state} t=${(t / 60).toFixed(1)}s marks=${b.marks}`);
  for (let i = 0; i < 5; i++) w.step(I());
  check("defeat clears the arena", w.clearedGroups.has(7) && w.level.get(6, 20) !== BARRIER, `walls=${w.level.get(6, 20)}`);
}

// 8. dying resets the boss but the second entrance is short
{
  const { w, b } = setup();
  enter(w, b);
  w.reset(false);
  const b2 = w.boss!;
  check("respawn brings a fresh boss", b2 !== b && b2.state === "dormant" && b2.marks === 2, b2.state);
  for (let i = 0; i < 60 && b2.state === "dormant"; i++) w.step(I({ x: 1 }));
  check("second entrance is short", b2.state === "intro" && b2.timer < 2, `timer=${b2.timer.toFixed(2)}`);
}

// 9. camping on a ledge: he never stands on it, and comes down on you
{
  const { w, log, b } = setup();
  w.level.fill(18, 23, 24, 23, ONEWAY);
  enter(w, b);
  w.player.invuln = 0;
  w.player.x = 20 * 16;
  w.player.y = 23 * 16 - w.player.h;
  w.player.vy = 0;
  let onLedge = false;
  for (let i = 0; i < 600 && !log.includes("pHit"); i++) {
    w.step(I(aimAt(b)));
    if (b.bottom < 28 * 16 - 20 && b.vy === 0 && b.state !== "air") onLedge = true;
  }
  check("ledge campers get leapt on", log.includes("pHit") && log.includes("peril:leap"), `hp=${w.player.hp}`);
  check("he never stands on ledges", !onLedge, String(onLedge));
}

// ---------------------------------------------------------------- phase 2
function phase2() {
  const r = setup();
  enter(r.w, r.b);
  r.b.phase = 2;
  r.b.marks = 1;
  r.b.addsCalled = true;
  return r;
}
// 10. orbs come back as posture damage
{
  const { w, b, log } = phase2();
  w.player.invuln = 999;
  w.player.x = 14 * 16;
  b.x = 36 * 16;
  const orig = Math.random;
  Math.random = () => 0.55; // far: combo 1, iai 4, sweep 0, leap 4, orbs 3.5 ... -> orbs
  let orbs = 0, maxPosture = 0;
  for (let i = 0; i < 300; i++) {
    const c = w.chest();
    const near = w.bullets.some((o) => o.alive && o.owner === "enemy" && o.kind === "orb" && Math.hypot(o.x - c.x, o.y - c.y) < 34);
    w.step(I({ parryPressed: near && w.player.canParry(), aimX: b.cx, aimY: b.cy - 10 }));
    orbs = Math.max(orbs, w.bullets.filter((o) => o.kind === "orb").length);
    maxPosture = Math.max(maxPosture, b.posture);
  }
  Math.random = orig;
  console.log("   parries", log.filter((e) => e === "parry" || e === "perfect").length, "hurt", log.filter((e) => e === "soldierHurt").length, "walls", log.filter((e) => e === "bulletWall").length);
  check("phase 2: orb fans, parried back into him", orbs >= 5 && maxPosture >= 40, `orbs=${orbs} posture=${maxPosture.toFixed(0)}`);
}
// 11. missiles home in, can't be parried, but can be cut
{
  const { w, log, b } = phase2();
  w.player.invuln = 0;
  w.player.x = 14 * 16;
  b.x = 36 * 16;
  const orig = Math.random;
  Math.random = () => 0.72; // far -> missiles
  let cut = 0, launched = 0;
  for (let i = 0; i < 400; i++) {
    const c = w.chest();
    const m = w.bullets.find((o) => o.alive && o.kind === "missile" && Math.hypot(o.x - c.x, o.y - c.y) < 40);
    w.step(I({ slashPressed: !!m, aimX: m ? m.x : b.cx, aimY: m ? m.y : b.cy }));
    launched = Math.max(launched, w.bullets.filter((o) => o.kind === "missile").length);
    cut = log.filter((e) => e === "missileCut").length;
    if (launched && !w.bullets.some((o) => o.kind === "missile")) break;
  }
  Math.random = orig;
  check("missiles home and can be cut down", launched === 3 && cut >= 2, `launched=${launched} cut=${cut} hp=${w.player.hp}`);
}
// 12. the floor laser: jump it
{
  for (const jump of [false, true]) {
    const { w, log, b } = phase2();
    w.player.invuln = 0;
    w.player.x = 16 * 16;
    b.x = 34 * 16;
    const orig = Math.random;
    Math.random = () => 0.97; // far -> laser (last)
    let fired = false, acted = false;
    for (let i = 0; i < 300; i++) {
      const o: Partial<InputFrame> = {};
      if (b.state === "laserWind" && b.timer < 0.12 && !acted) { acted = true; if (jump) { o.jumpPressed = true; o.jumpHeld = true; } }
      if (acted && jump) o.jumpHeld = true;
      w.step(I(o));
      if (b.state === "laser") fired = true;
      if (fired && b.state === "recover") break;
    }
    Math.random = orig;
    const hit = log.includes("pHit");
    check(jump ? "laser: jumping clears it" : "laser: standing in it hurts", fired && log.includes("peril:laser") && (jump ? !hit : hit), `fired=${fired} hit=${hit}`);
  }
}
// 13. rising into phase 2 calls two drones, once
{
  const { w, b } = setup();
  enter(w, b);
  w.player.invuln = 999;
  (w as any).breakPosture(b);
  w.player.x = b.x - 30;
  w.player.facing = 1;
  w.step(I({ slashPressed: true, aimX: b.cx, aimY: b.cy }));
  for (let i = 0; i < 60 * 6 && b.phase !== 2; i++) w.step(I());
  for (let i = 0; i < 150; i++) w.step(I());
  const drones = w.soldiers.filter((o) => o.kind === "drone");
  check("phase 2 brings two drones", b.phase === 2 && b.marks === 1 && drones.length === 2 && drones.every((d) => d.state !== "enter"), `phase=${b.phase} drones=${drones.map((d) => d.state).join(",")}`);
}

// 14. the finale: breaking him in phase 2 sends him to the billboard
{
  const { w, log, b } = phase2();
  w.player.invuln = 999;
  (w as any).breakPosture(b);
  check("phase 2 break starts the finale instead", b.state === "finaleUp" && log.includes("finale"), b.state);
  let parries = 0, won = false, perchSeen = false;
  for (let i = 0; i < 60 * 10 && !won; i++) {
    w.player.invuln = 999;
    if (b.state === "finaleCharge" && b.y < b.anchorY - 100) perchSeen = true;
    const before = log.length;
    w.step(I(duelist(w, b)));
    parries += log.slice(before).filter((e) => e === "clash" || e === "clashH").length;
    won = b.state === "stagger";
  }
  check("five rhythm parries open him up", perchSeen && won && parries === 5, `parries=${parries} state=${b.state} perch=${perchSeen}`);
  w.player.x = b.facing > 0 ? b.x + b.w + 4 : b.x - w.player.w - 4;
  w.player.facing = b.cx > w.player.cx ? 1 : -1;
  w.step(I({ slashPressed: true, aimX: b.cx, aimY: b.cy }));
  for (let i = 0; i < 20; i++) w.step(I());
  check("...and the last deathblow ends it", !b.alive && log.includes("bossDefeated"), b.state);
}
// 15. the chain is five plain cuts: always in front, one steady beat
{
  const { w, b } = phase2();
  w.player.invuln = 999;
  (w as any).breakPosture(b);
  const leads: number[] = []; let allFront = true; let lastI = -1;
  for (let i = 0; i < 60 * 10 && b.state !== "stagger"; i++) {
    w.step(I(duelist(w, b)));
    if (b.state === "chainWind" && b.chainI !== lastI) {
      lastI = b.chainI; leads.push(b.timer);
      if (Math.sign(b.cx - w.player.cx) !== (w.player.facing || 1)) allFront = false;
    }
  }
  const steady = leads.slice(1).every((l) => Math.abs(l - leads[1]) < 0.02);
  check("千斬: five cuts, all from the front, steady beat", leads.length === 5 && allFront && steady && CHAIN.every((c) => !c.feint && !c.behind), `leads=${leads.map((l) => l.toFixed(2)).join(",")} front=${allFront}`);
}
// 16. a missed beat still breaks the chain
{
  const { w, log, b } = phase2();
  w.player.invuln = 0;
  (w as any).breakPosture(b);
  let broke = false;
  for (let i = 0; i < 60 * 10 && !broke; i++) {
    const o = duelist(w, b);
    if (b.chainI === 2) o.parryPressed = false;
    w.step(I(o));
    broke = b.state === "recover";
  }
  check("missing one beat breaks the chain", broke && b.finaleCD > 0 && !b.finaleDone, `state=${b.state}`);
}

// 17. the sweep's tell: 1.0 s in phase 1, 0.85 s in phase 2 (TUNE.oniSweepTell1/2)
{
  for (const ph of [1, 2]) {
    const { w, b } = ph === 1 ? (() => { const r = setup(); enter(r.w, r.b); return r; })() : phase2();
    w.player.invuln = 999;
    const orig = Math.random;
    Math.random = () => 0.75;
    w.player.x = b.x - 60;
    let f = 0, seen = false;
    for (let i = 0; i < 600; i++) {
      w.step(I(aimAt(b)));
      if (b.state === "sweepWindup") { seen = true; f++; } else if (seen) break;
    }
    Math.random = orig;
    const want = ph === 2 ? TUNE.oniSweepTell2 : TUNE.oniSweepTell1;
    if (Math.abs(want - (ph === 2 ? 0.85 : 1.0)) > 1e-9) check("sweep defaults", false, String(want));
    check(`sweep tell lasts ${want.toFixed(2)} s in phase ${ph}`, seen && Math.abs(f / 60 - want) < 0.03, `measured=${(f / 60).toFixed(3)}s`);
  }
}
// 18. 千斬: the first cut is judged generously, the rest as before
function chainTo(cut: number, style: "away" | "early" | "late") {
  const { w, log, b } = phase2();
  w.player.invuln = 0;
  w.player.hp = 9;
  (w as any).breakPosture(b);
  let early = false, lateArmed = false, since = 0;
  for (let i = 0; i < 60 * 12; i++) {
    const o = duelist(w, b);
    if (b.chainI === cut && (b.state === "chainWind" || b.state === "chainStrike")) {
      if (style === "away") o.aimX = w.player.cx - (b.cx - w.player.cx) * 3;
      if (style === "early") {
        if (b.state === "chainWind" && b.timer < 0.2 && b.timer > 0.17 && !early) { early = true; o.parryPressed = true; }
      }
      if (style === "late") {
        o.parryPressed = false;
        // press one step after the normal late grace would have run out
        if (b.meleeGrace > 0 || since > 0) since++;
        if (since === LATE_GRACE_FRAMES + 1 && !lateArmed) { lateArmed = true; o.parryPressed = true; }
      }
    }
    const n = log.length;
    w.step(I(o));
    if (b.chainI > cut || log.slice(n).includes("pHit") || b.state === "recover") break;
  }
  return { ok: b.chainI > cut && !log.includes("pHit"), info: `chainI=${b.chainI} state=${b.state} hit=${log.includes("pHit")}` };
}
for (const style of ["away", "early", "late"] as const) {
  const first = chainTo(0, style), second = chainTo(1, style);
  check(`千斬 cut 1 forgives a parry that is ${style}`, first.ok, first.info);
  check(`...cut 2 does not (${style})`, !second.ok, second.info);
}

void TILE;
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
