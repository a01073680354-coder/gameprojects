// Headless tests for the Assassin: walls, telegraphed 2/4 sets, posture-only.
import { buildStage2 } from "../src/world/stage2";
import { World, WorldEvents } from "../src/sim/world";
import { Assassin, ASN } from "../src/sim/assassin";
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
      if (key === "clash") log.push("clash");
      else if (key === "assassin") log.push("asn:" + a[1]);
      else log.push(key);
    },
  }) as WorldEvents;
}
const I = (o: Partial<InputFrame> = {}): InputFrame => ({
  x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, parryPressed: false, aimX: 0, aimY: 0, ...o,
});
function setup() {
  const L = buildStage2();
  L.spawns = [];
  L.spawnX = 224 * TILE;
  L.spawnY = 28 * TILE;
  const log: string[] = [];
  const w = new World(L, makeEv(log));
  const b = w.boss as Assassin;
  for (let i = 0; i < 30 && b.state === "dormant"; i++) w.step(I({ x: 1 }));
  for (let i = 0; i < 400 && b.state === "intro"; i++) w.step(I());
  w.player.invuln = 0;
  return { w, log, b };
}
const aim = (b: Assassin) => ({ aimX: b.cx, aimY: b.cy });
/** Parries each cut on its beat: one click per cut. */
function duelist(w: World, b: Assassin): Partial<InputFrame> {
  const now = (b.state === "rushIn" && b.timer < 0.03) || (b.state === "cutGap" && b.timer < 0.03);
  // aim at where he will be (the locked stop point)
  return { parryPressed: now && w.player.canParry(), aimX: b.state === "rushIn" ? b.toX : b.cx, aimY: b.state === "rushIn" ? b.toY : b.cy };
}

// 1. entrance
{
  const { b } = setup();
  check("he ends the entrance clinging to the right wall", b.state === "cling" && b.surface === 1 && Math.abs(b.cx - (b.arenaMax - 11)) < 2, `${b.state} surface=${b.surface} cx=${b.cx.toFixed(0)}`);
}
// 1b. the drop from the ceiling really reaches the floor, and a break on the ceiling falls too
{
  const L = buildStage2();
  L.spawns = [];
  L.spawnX = 224 * TILE;
  L.spawnY = 28 * TILE;
  const log: string[] = [];
  const w = new World(L, makeEv(log));
  const b = w.boss as Assassin;
  for (let i = 0; i < 30 && b.state === "dormant"; i++) w.step(I({ x: 1 }));
  let floored = false;
  for (let i = 0; i < 400 && b.state === "intro"; i++) { w.step(I()); if (b.bottom >= b.floorY - 1) floored = true; }
  check("the entrance drop lands on the floor", floored, `bottom=${b.bottom} floor=${b.floorY}`);
  b.surface = 0;
  const q = b.perch(0);
  b.placeCentre(q.x, q.y);
  b.state = "cling";
  w.forceBreak(b);
  for (let i = 0; i < 90; i++) w.step(I());
  check("broken on the ceiling, he falls to the floor", b.bottom >= b.floorY - 1, `bottom=${b.bottom}`);
}
// 2. a 2-set: two cuts 0.13 s apart, both parried
{
  const { w, log, b } = setup();
  const orig = Math.random;
  Math.random = () => 0.9; // 2-set
  const times: number[] = [];
  for (let i = 0; i < 300 && !log.includes("asn:clean"); i++) {
    const n = log.length;
    w.step(I(duelist(w, b)));
    if (log.slice(n).includes("clash")) times.push(w.time);
  }
  Math.random = orig;
  const gap = times.length === 2 ? times[1] - times[0] : -1;
  check("2-set: 따닥, both cuts parried", times.length === 2 && gap > 0.1 && gap < 0.18 && log.includes("asn:clean") && w.player.hp === 5,
    `parries=${times.length} gap=${gap.toFixed(3)}s hp=${w.player.hp}`);
  check("aim telegraph comes first", log.indexOf("asn:aim") >= 0 && log.indexOf("asn:aim") < log.indexOf("clash"), "");
}
// 3. a 4-set: second pair comes from the other side
{
  const { w, log, b } = setup();
  const orig = Math.random;
  Math.random = () => 0.1; // 4-set
  const sides: number[] = [];
  for (let i = 0; i < 400 && !log.includes("asn:clean"); i++) {
    const n = log.length;
    w.step(I(duelist(w, b)));
    if (log.slice(n).includes("clash")) sides.push(Math.sign(b.cx - w.player.cx));
  }
  Math.random = orig;
  check("4-set: 따닥 · 따닥 from both sides", sides.length === 4 && sides[0] === sides[1] && sides[2] === sides[3] && sides[0] !== sides[2] && b.posture >= 4 * ASN.parry + ASN.bonus4,
    `sides=${sides.join(",")} posture=${b.posture.toFixed(0)}`);
}
// 3b. forgiving judgement: aim the wrong way, click a little late, or a little early
{
  for (const mode of ["away", "late", "early"] as const) {
    const { w, log, b } = setup();
    const orig = Math.random;
    Math.random = () => 0.9; // 2-set
    let cutStart = -1, pressed = 0, earlyDone = false;
    for (let i = 0; i < 300 && !log.includes("asn:clean") && !log.includes("playerHit"); i++) {
      const o: any = {};
      const p = w.player;
      if (mode === "away") {
        // aim at the far side of the room, press on the beat
        o.aimX = p.cx + (b.cx > p.cx ? -300 : 300); o.aimY = p.cy;
        o.parryPressed = ((b.state === "rushIn" && b.timer < 0.03) || (b.state === "cutGap" && b.timer < 0.03)) && p.canParry();
      } else if (mode === "late") {
        // press 4 frames after each cut goes live (after it has already reached you)
        if (b.state === "cut" && cutStart < 0) cutStart = i;
        if (b.state !== "cut") cutStart = -1;
        o.parryPressed = cutStart >= 0 && i - cutStart === 4;
        o.aimX = b.cx; o.aimY = b.cy;
      } else {
        // an early nervous click 0.2 s before the first cut, then the real ones on the beat
        if (b.state === "aim" && b.timer < 0.2 && !earlyDone) { o.parryPressed = true; earlyDone = true; }
        else o.parryPressed = ((b.state === "rushIn" && b.timer < 0.03) || (b.state === "cutGap" && b.timer < 0.03)) && p.canParry();
        o.aimX = b.cx; o.aimY = b.cy;
      }
      if (o.parryPressed) pressed++;
      w.step(I(o));
    }
    Math.random = orig;
    const clashes = log.filter((e) => e === "clash").length;
    check(`forgiving parry (${mode})`, clashes === 2 && !log.includes("playerHit"), `clashes=${clashes} hit=${log.includes("playerHit")} presses=${pressed}`);
  }
}
// 4. mashing doesn't work
{
  const { w, log, b } = setup();
  const orig = Math.random;
  Math.random = () => 0.9;
  for (let i = 0; i < 300 && !log.includes("playerHit") && !log.includes("asn:clean"); i++) w.step(I({ parryPressed: i % 3 === 0, ...aim(b) }));
  Math.random = orig;
  check("mashing parry gets you cut", log.includes("playerHit"), `clashes=${log.filter((e) => e === "clash").length}`);
}
// 5. slashes glance off
{
  const { w, log, b } = setup();
  const orig = Math.random;
  Math.random = () => 0.9;
  let slashed = false;
  w.player.invuln = 999;
  for (let i = 0; i < 300 && !slashed; i++) {
    if (b.state === "cut") { w.step(I({ slashPressed: true, ...aim(b) })); slashed = log.includes("guardBlock"); continue; }
    w.step(I(aim(b)));
  }
  Math.random = orig;
  check("a slash glances off and adds nothing", slashed && b.posture === 0, `posture=${b.posture}`);
}
// 6. the whole fight with perfect parries: two breaks, two deathblows
{
  const { w, log, b } = setup();
  let t = 0;
  for (; t < 60 * 180 && b.alive; t++) {
    w.player.invuln = 0;
    w.player.hp = 5;
    const o = duelist(w, b);
    if (b.state === "stagger" && b.vy === 0) {
      const dx = b.cx - w.player.cx;
      if (Math.abs(dx) > 26) o.x = Math.sign(dx);
      else { o.slashPressed = true; o.aimX = b.cx; o.aimY = b.cy; }
    }
    w.step(I(o));
  }
  const hits = log.filter((e) => e === "playerHit").length;
  check("break him twice with parries alone", !b.alive && log.filter((e) => e === "deathblow").length === 2 && log.includes("bossDefeated"),
    `t=${(t / 60).toFixed(1)}s state=${b.state} marks=${b.marks} hits taken=${hits}`);
}

// 7. 발악: phase 2 past half posture → a 危 tell, then five fast cuts, all parryable
function desperate() {
  const r = setup();
  r.b.phase = 2;
  r.b.posture = r.b.postureMax * ASN.despAt + 1;
  r.b.sinceHit = 0;
  r.b.state = "cling"; r.b.timer = 0.05;
  return r;
}
{
  const { w, log, b } = desperate();
  for (let i = 0; i < 60 && b.state !== "aim"; i++) { b.sinceHit = 0; w.step(I()); }
  const rings = b.upcomingCuts();
  check("past half posture in phase 2, the next set is the 발악 flurry",
    b.flurry && b.setSize === 5 && log.includes("perilous") && log.includes("asn:desperate") && rings.length === 5,
    `flurry=${b.flurry} size=${b.setSize} rings=${rings.length}`);
  const startPosture = b.posture;
  const cuts: number[] = [];
  let t = 0, clashes = 0;
  for (; t < 400 && b.state !== "cling" && b.state !== "stagger"; t++) {
    b.sinceHit = 0;
    const n = log.length;
    w.step(I(duelist(w, b)));
    for (const e of log.slice(n)) { if (e === "enemySwing") cuts.push(t); if (e === "clash") clashes++; }
  }
  const gaps = cuts.slice(1).map((c, i) => (c - cuts[i]) / 60);
  check("five cuts, one every ~0.21 s", cuts.length === 5 && gaps.every((g) => Math.abs(g - (ASN.cut + ASN.despGap)) < 0.04),
    `cuts=${cuts.length} gaps=${gaps.map((g) => g.toFixed(2)).join(",")}`);
  check("all five turned aside: posture surges (or he breaks)", clashes === 5 && !log.includes("playerHit") && (b.state === "stagger" || b.posture >= startPosture + 50),
    `clashes=${clashes} posture ${startPosture.toFixed(0)}→${b.posture.toFixed(0)} state=${b.state}`);
}
// 8. standing still through the flurry costs one hit, not five; and it doesn't come twice in a row
{
  const { w, log, b } = desperate();
  for (let i = 0; i < 60 && b.state !== "aim"; i++) { b.sinceHit = 0; w.step(I()); }
  w.player.hp = 9;
  for (let t = 0; t < 400 && b.state !== "cling"; t++) { b.sinceHit = 0; w.step(I()); }
  const hits = log.filter((e) => e === "playerHit").length;
  check("a missed flurry lands once", hits === 1, `hits=${hits}`);
  b.posture = b.postureMax * 0.8;
  w.player.invuln = 999;
  let again = false;
  for (let t = 0; t < 120 && b.state !== "aim"; t++) { b.sinceHit = 0; w.step(I()); }
  again = b.flurry;
  check("...and the next set is a normal one (cooldown)", b.state === "aim" && !again && b.despCD > 0, `state=${b.state} flurry=${again} cd=${b.despCD}`);
}
// 9. phase 1 never flurries
{
  const { w, b } = setup();
  b.posture = b.postureMax * 0.9;
  for (let t = 0; t < 120 && b.state !== "aim"; t++) { b.sinceHit = 0; w.step(I()); }
  check("no 발악 in phase 1", b.state === "aim" && !b.flurry, `state=${b.state} flurry=${b.flurry}`);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
