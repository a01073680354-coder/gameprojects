// Headless combat tests: parry timing, reflection, soldiers, duels, props, arenas.
import { Level, SOLID, BREAK, BARRIER, EMPTY } from "../src/world/level";
import { World, WorldEvents, ParryInfo } from "../src/sim/world";
import { Bullet } from "../src/sim/bullet";
import { InputFrame } from "../src/core/input";
import { STEP, TUNE } from "../src/config";

let fails = 0;
function check(name: string, ok: boolean, info: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — ${info}`);
  if (!ok) fails++;
}

function makeEv(log: string[], parries: ParryInfo[] = []): WorldEvents {
  const n = (k: string) => () => { log.push(k); };
  return {
    jump: n("jump"), land: n("land"), dashStart: n("dash"), dashEnd: n("dashEnd"), dashRefill: n("refill"),
    wallSlide: n("wall"), freeze: n("freeze"),
    parryStart: n("parryStart"), parryWhiff: n("whiff"),
    parry: (i) => { log.push(i.perfect ? "perfect" : "parry"); parries.push(i); },
    shot: n("shot"), alert: n("alert"), aimStart: n("aimStart"), aimLock: n("aimLock"),
    bulletWall: n("wall"), soldierHurt: n("sHurt"), soldierDie: n("sDie"), playerHit: n("pHit"),
    dodge: n("dodge"), heavyBlocked: n("clank"), checkpoint: n("cp"), pit: n("pit"), stageClear: n("clear"),
    slashStart: (c) => { log.push("slash" + c); }, meleeHit: n("mHit"), guardBlock: n("block"),
    clash: (c) => { log.push(c.heavy ? "clashH" : "clash"); }, danger: n("danger"), glint: n("glint"),
    postureBreak: n("break"), deathblow: n("deathblow"), enemySwing: n("eSwing"), ampouleGain: n("ampoule"),
    perilous: (_s, k) => { log.push("peril:" + k); }, bossIntro: n("bossIntro"), bossSmash: n("smash"), bossRise: n("rise"), bossDefeated: n("bossDown"),
    propHit: (_p, broken) => { log.push(broken ? "propBreak" : "propDent"); },
    propLand: n("propLand"),
    arenaStart: n("arenaStart"), arenaClear: n("arenaClear"), enterLand: n("enterLand"), teaser: n("teaser"),
  };
}

function room(spawns: Level["spawns"] = []) {
  const L = new Level(80, 30);
  L.fill(0, 28, 79, 29, SOLID);
  L.spawnX = 20 * 16 + 8;
  L.spawnY = 28 * 16;
  L.spawns = spawns;
  return L;
}

const I = (o: Partial<InputFrame> = {}): InputFrame => ({
  x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, parryPressed: false, aimX: 0, aimY: 0, ...o,
});

function setup(spawns: Level["spawns"] = [], L?: Level) {
  const log: string[] = [];
  const parries: ParryInfo[] = [];
  const w = new World(L ?? room(spawns), makeEv(log, parries));
  w.player.invuln = 0;
  for (let i = 0; i < 5; i++) w.step(I());
  w.player.invuln = 0;
  return { w, log, parries };
}

function incoming(w: World, d: number, speed = 270) {
  const c = w.chest();
  const b = new Bullet(c.x + d, c.y, -speed, 0, "enemy");
  w.bullets.push(b);
  return b;
}

// 1. unparried bullet hurts after the late grace
{
  const { w, log } = setup();
  incoming(w, 60);
  for (let i = 0; i < 40; i++) w.step(I());
  check("unparried bullet hurts", w.player.hp === 4 && log.includes("pHit"), `hp=${w.player.hp}`);
}

// 2. parry window: press at frame 0, bullet enters the zone at frame k
{
  const results: string[] = [];
  const winF = Math.round(TUNE.parryWindow * 60);
  let okAll = true;
  for (let k = 1; k <= winF + 3; k++) {
    const { w, log } = setup();
    const c = w.chest();
    const speed = 270, perFrame = speed * STEP;
    incoming(w, TUNE.parryRange + perFrame * (k - 0.5));
    w.step(I({ parryPressed: true, aimX: c.x + 100, aimY: c.y }));
    for (let i = 0; i < 30; i++) w.step(I({ aimX: c.x + 100, aimY: c.y }));
    const res = log.includes("perfect") ? "P" : log.includes("parry") ? "p" : log.includes("pHit") ? "x" : "?";
    results.push(res);
    const expectHit = k <= winF;
    if (expectHit !== (res === "p" || res === "P")) okAll = false;
  }
  check("parry window frames", okAll, `frames 1..${winF + 3}: ${results.join("")} (P perfect, p parry, x hit; window ${winF}f)`);
  const perfF = results.filter((r) => r === "P").length;
  check("perfect window", perfF === Math.round(TUNE.perfectWindow * 60), `${perfF} perfect frames`);
}

// 3. whiff penalty
{
  const { w, log } = setup();
  const c = w.chest();
  w.step(I({ parryPressed: true, aimX: c.x + 100, aimY: c.y }));
  for (let i = 0; i < 12; i++) w.step(I());
  const blocked = !w.player.canParry();
  for (let i = 0; i < 20; i++) w.step(I());
  const freed = w.player.canParry();
  check("whiff penalty", log.includes("whiff") && blocked && freed, `blockedAt12=${blocked} freedAt32=${freed}`);
}

// 4. late grace
for (const late of [2, 4]) {
  const { w, log } = setup();
  const c = w.chest();
  const b = incoming(w, 10, 270);
  let f = 0;
  while (b.heldTimer <= 0 && f < 20) { w.step(I()); f++; }
  for (let i = 1; i < late; i++) w.step(I());
  w.step(I({ parryPressed: true, aimX: c.x + 100, aimY: c.y }));
  for (let i = 0; i < 10; i++) w.step(I());
  const parried = log.includes("parry") && w.player.hp === 5;
  check(`late parry ${late} frames after contact`, late <= 3 ? parried : !parried, `parried=${parried} hp=${w.player.hp}`);
}

// 5. aim assist: soldier 10° off the aim line is targeted, 30° is not
for (const deg of [10, 30]) {
  const { w, parries } = setup([{ kind: "rifle", x: 50, y: 28, group: 1, facing: -1 }]);
  const s = w.soldiers[0];
  s.state = "cooldown"; s.timer = 99;
  const c = w.chest();
  const tx = s.cx, ty = s.cy - 4;
  const base = Math.atan2(ty - c.y, tx - c.x);
  const a = base - (deg * Math.PI) / 180;
  incoming(w, 30);
  w.step(I({ parryPressed: true, aimX: c.x + Math.cos(a) * 200, aimY: c.y + Math.sin(a) * 200 }));
  for (let i = 0; i < 4; i++) w.step(I());
  const info = parries[0];
  const targeted = !!info && info.target === s;
  check(`aim assist ${deg}°`, deg < TUNE.assistDeg ? targeted : !targeted, `assisted=${info?.assisted} target=${!!info?.target}`);
}

// 6. reflected bullet kills a rifleman
{
  const { w, log } = setup([{ kind: "rifle", x: 40, y: 28, group: 1 }, { kind: "burst", x: 60, y: 28, group: 2 }]);
  for (const s of w.soldiers) { s.state = "cooldown"; s.timer = 99; }
  const r = w.soldiers[0];
  incoming(w, TUNE.parryRange + 270 * STEP * 5.5);
  w.step(I({ parryPressed: true, aimX: r.cx, aimY: r.cy }));
  for (let i = 0; i < 90; i++) { w.step(I()); for (const s of w.soldiers) if (s.alive) { s.state = "cooldown"; s.timer = 99; } }
  check("reflect kills rifleman", !r.alive && log.includes("sDie"), `alive=${r.alive}`);
  const bu = w.soldiers[1];
  check("other soldier untouched", bu.alive && bu.hp === 2, `hp=${bu.hp}`);
}

// 7. predicted kill + last of group flag
{
  const { w, parries } = setup([{ kind: "rifle", x: 45, y: 28, group: 3 }]);
  w.soldiers[0].state = "cooldown"; w.soldiers[0].timer = 99;
  incoming(w, TUNE.parryRange - 2);
  w.step(I({ parryPressed: true, aimX: w.soldiers[0].cx, aimY: w.soldiers[0].cy }));
  const p = parries[0];
  check("kill prediction", !!p && p.kill && p.lastOfGroup && p.dist > 300, `kill=${p?.kill} last=${p?.lastOfGroup} dist=${p?.dist}`);
}

// 8. soldier sees, telegraphs, fires; wall blocks sight
{
  const { w, log } = setup([{ kind: "rifle", x: 34, y: 28, group: 1, facing: -1 }]);
  let firedAt = -1;
  for (let i = 0; i < 180; i++) { w.step(I()); if (firedAt < 0 && log.includes("shot")) firedAt = i; }
  check("soldier alert → telegraph → shot", log.indexOf("alert") >= 0 && log.indexOf("aimLock") > log.indexOf("aimStart") && firedAt > 0,
    `fired at ${(firedAt / 60).toFixed(2)}s`);
  const L = room([{ kind: "rifle", x: 34, y: 28, group: 1, facing: -1 }]);
  L.fill(27, 10, 28, 27, SOLID);
  const log2: string[] = [];
  const w2 = new World(L, makeEv(log2));
  for (let i = 0; i < 180; i++) w2.step(I());
  check("wall blocks sight", !log2.includes("alert"), `events: ${[...new Set(log2)].join(",")}`);
}

// 9. parry refunds the dash
{
  const { w } = setup();
  w.player.dashes = 0;
  const c = w.chest();
  incoming(w, 20);
  w.step(I({ parryPressed: true, aimX: c.x + 100, aimY: c.y }));
  check("parry refills dash", w.player.dashes === 1, `dashes=${w.player.dashes}`);
}

// 10. heavy slugs cannot be parried
{
  const { w, log } = setup();
  const c = w.chest();
  const b = incoming(w, TUNE.parryRange + 4);
  b.kind = "heavy"; b.radius = 4;
  w.step(I({ parryPressed: true, aimX: c.x + 100, aimY: c.y }));
  for (let i = 0; i < 30; i++) w.step(I({ aimX: c.x + 100, aimY: c.y }));
  check("heavy slug ignores parry", log.includes("clank") && !log.includes("parry") && w.player.hp === 4, `hp=${w.player.hp}`);
}

// 11. dash i-frames let a bullet pass through
{
  const { w, log } = setup();
  incoming(w, 40);
  w.step(I({ dashPressed: true, x: 1 }));
  for (let i = 0; i < 40; i++) w.step(I());
  check("dash dodges through a bullet", log.includes("dodge") && w.player.hp === 5, `hp=${w.player.hp}`);
  const { w: w2 } = setup();
  const bh = incoming(w2, 40); bh.kind = "heavy"; bh.radius = 4;
  w2.step(I({ dashPressed: true, x: 1 }));
  for (let i = 0; i < 40; i++) w2.step(I());
  check("dash also dodges heavy slugs", w2.player.hp === 5, `hp=${w2.player.hp}`);
}

// 12. patterns fire the right number of bullets
for (const [pat, n] of [["spread3", 3], ["ring8", 8], ["burst3", 3], ["slugFan", 4]] as [string, number][]) {
  const { w } = setup([{ kind: "drone", x: 40, y: 20, group: 1, pattern: pat }]);
  const s = w.soldiers[0];
  s.state = "fire"; s.fireT = 0; s.volleyI = 0;
  let shots = 0;
  for (let i = 0; i < 70; i++) { const before = w.bullets.length; w.step(I()); shots += Math.max(0, w.bullets.length - before); if (s.state !== "fire") break; }
  check(`pattern ${pat}`, shots === n, `${shots} bullets`);
}

// 13. pits cost one cell and return you to the last checkpoint
{
  const L = room();
  L.fill(30, 28, 34, 29, 0);
  L.checkpoints.push({ x: 25, y: 28 });
  const log: string[] = [];
  const w = new World(L, makeEv(log));
  for (let i = 0; i < 5; i++) w.step(I());
  w.player.x = 25 * 16;
  for (let i = 0; i < 200 && !log.includes("pit"); i++) w.step(I({ x: 1 }));
  check("checkpoint activates", log.includes("cp") && w.checkpoint === 0, `checkpoint=${w.checkpoint}`);
  check("pit: -1 hp, back at checkpoint", log.includes("pit") && w.player.hp === 4 && Math.abs(w.player.cx - (25 * 16 + 8)) < 2, `hp=${w.player.hp} x=${w.player.cx}`);
}

// 14. cleared encounters stay cleared after a checkpoint respawn
{
  const { w } = setup([{ kind: "rifle", x: 40, y: 28, group: 1 }, { kind: "rifle", x: 60, y: 28, group: 2 }]);
  const r = w.soldiers[0];
  r.state = "cooldown"; r.timer = 99; w.soldiers[1].state = "cooldown"; w.soldiers[1].timer = 99;
  incoming(w, TUNE.parryRange + 270 * STEP * 5.5);
  w.step(I({ parryPressed: true, aimX: r.cx, aimY: r.cy }));
  for (let i = 0; i < 60; i++) w.step(I());
  w.reset(false);
  check("cleared group stays dead", w.soldiers.length === 1 && w.soldiers[0].group === 2, `groups after respawn: ${w.soldiers.map((s) => s.group).join(",")}`);
  w.reset(true);
  check("full restart restores everyone", w.soldiers.length === 2, `${w.soldiers.length}`);
}

// ---------------------------------------------------------------- melee

// 15. slash kills a rifleman, combo reaches a second cut
{
  const { w, log } = setup([{ kind: "rifle", x: 22, y: 28, group: 1 }]);
  const r = w.soldiers[0];
  r.state = "cooldown"; r.timer = 99;
  w.step(I({ slashPressed: true, aimX: r.cx, aimY: r.cy }));
  for (let i = 0; i < 6; i++) w.step(I({ aimX: r.cx, aimY: r.cy, slashPressed: i === 4 }));
  for (let i = 0; i < 30; i++) w.step(I({ aimX: r.cx, aimY: r.cy }));
  check("slash kills rifleman", !r.alive && log.includes("sDie"), `alive=${r.alive}`);
  check("slash combo second cut", log.includes("slash1") && log.includes("slash2"), log.filter((e) => e.startsWith("slash")).join(","));
}
// 16. armored heavy needs three cuts
{
  const { w } = setup([{ kind: "heavy", x: 22, y: 28, group: 1 }]);
  const h = w.soldiers[0];
  let cuts = 0;
  for (let k = 0; k < 6 && h.alive; k++) {
    h.state = "cooldown"; h.timer = 99;
    w.step(I({ slashPressed: true, aimX: h.cx, aimY: h.cy }));
    cuts++;
    for (let i = 0; i < 40; i++) { w.step(I({ aimX: h.cx, aimY: h.cy })); if (h.alive) { h.state = "cooldown"; h.timer = 99; } }
    w.player.x = h.x - 20;
  }
  check("heavy dies to 3 cuts", !h.alive && cuts === 3, `cuts=${cuts} alive=${h.alive}`);
}

function duel(extra: Partial<Level["spawns"][0]> = {}) {
  const st = setup([{ kind: "blade", x: 24, y: 28, group: 1, facing: -1, ...extra }]);
  return { ...st, b: st.w.soldiers[0] };
}
// 17. blade guards a frontal slash
{
  const { w, log, b } = duel();
  for (let i = 0; i < 120 && b.state !== "guard"; i++) w.step(I());
  w.step(I({ slashPressed: true, aimX: b.cx, aimY: b.cy }));
  for (let i = 0; i < 8; i++) w.step(I({ aimX: b.cx, aimY: b.cy }));
  check("blade blocks a frontal cut", log.includes("block") && b.hp === 3, `state=${b.state} hp=${b.hp}`);
}
// 18. unparried quick strike hurts; parried one clashes and builds posture
{
  const orig = Math.random;
  Math.random = () => 0.9;
  const { w, log } = duel();
  for (let i = 0; i < 300 && !log.includes("pHit"); i++) w.step(I());
  check("blade quick strike lands", log.includes("glint") && log.includes("pHit"), `hp=${w.player.hp}`);
  const d2 = duel();
  let parried = false;
  for (let i = 0; i < 400 && !parried; i++) {
    const s2 = d2.b;
    const press = (s2.state === "windup" && s2.timer < 0.05) || (s2.state === "heavyWindup" && s2.timer < 0.05);
    d2.w.step(I({ parryPressed: press, aimX: s2.cx, aimY: s2.cy }));
    parried = d2.log.includes("clash") || d2.log.includes("clashH");
  }
  check("parry clashes with the sword", parried && d2.b.posture > 0 && d2.w.player.hp === 5, `posture=${d2.b.posture.toFixed(0)} hp=${d2.w.player.hp}`);
  Math.random = orig;
}
// 19. "!" heavy lunge: telegraphed, parryable
{
  const orig = Math.random;
  Math.random = () => 0.1;
  const { w, log, b } = duel();
  let clashed = false;
  for (let i = 0; i < 400 && !clashed; i++) {
    w.step(I({ parryPressed: b.state === "lunge", aimX: b.cx, aimY: b.cy }));
    clashed = log.includes("clashH");
  }
  Math.random = orig;
  check("heavy '!' attack is telegraphed and parryable", log.includes("danger") && clashed, `events=${[...new Set(log)].join(",")}`);
}
// 20. posture break -> deathblow
{
  const { w, log, b } = duel();
  b.posture = 95;
  let broke = false;
  for (let i = 0; i < 400 && !broke; i++) {
    const press = ((b.state === "windup" || b.state === "heavyWindup") && b.timer < 0.05) || b.state === "lunge";
    w.step(I({ parryPressed: press, aimX: b.cx, aimY: b.cy }));
    broke = log.includes("break");
  }
  for (let i = 0; i < 30 && Math.abs(w.player.cx - b.cx) > 30; i++) w.step(I({ x: Math.sign(b.cx - w.player.cx) }));
  w.step(I({ slashPressed: true, aimX: b.cx, aimY: b.cy }));
  for (let i = 0; i < 20; i++) w.step(I({ aimX: b.cx, aimY: b.cy }));
  check("posture break then deathblow", broke && log.includes("deathblow") && !b.alive, `broke=${broke} alive=${b.alive}`);
}
// 21. punish window: a cut during recovery deals damage
{
  const orig = Math.random;
  Math.random = () => 0.9;
  const { w, log, b } = duel();
  for (let i = 0; i < 400 && b.state !== "recover"; i++) w.step(I());
  w.player.invuln = 5;
  w.step(I({ slashPressed: true, aimX: b.cx, aimY: b.cy }));
  for (let i = 0; i < 10; i++) w.step(I({ aimX: b.cx, aimY: b.cy }));
  check("cut during recovery hurts the blade", b.hp === 2 && log.includes("mHit"), `hp=${b.hp}`);
  Math.random = orig;
}

// ---------------------------------------------------------------- props

function propRoom() {
  const L = room();
  L.props.push({ kind: "barrel", x: 22, y: 28 }, { kind: "sign", x: 18, y: 28 });
  return L;
}
// 22. barrels block movement until cut twice; signs break in one hit
{
  const { w, log } = setup([], propRoom());
  const L = w.level;
  check("barrel tiles block", L.get(22, 27) === BREAK && L.get(22, 26) === BREAK, `tiles ${L.get(22, 27)},${L.get(22, 26)}`);
  for (let i = 0; i < 60; i++) w.step(I({ x: 1 }));
  const stopped = w.player.x + w.player.w <= 22 * 16;
  check("barrel stops the player", stopped, `player right edge ${w.player.x + w.player.w}, barrel at ${22 * 16}`);
  const bar = w.props.find((p) => p.def.kind === "barrel")!;
  w.step(I({ slashPressed: true, aimX: bar.cx, aimY: bar.cy }));
  for (let i = 0; i < 6; i++) w.step(I({ aimX: bar.cx, aimY: bar.cy, slashPressed: i === 4 }));
  for (let i = 0; i < 30; i++) w.step(I({ aimX: bar.cx, aimY: bar.cy }));
  check("two-hit combo cleaves the barrel", log.includes("propDent") && log.includes("propBreak") && L.get(22, 27) === EMPTY, `events ${log.filter((e) => e.startsWith("prop")).join(",")}`);
  for (let i = 0; i < 60; i++) w.step(I({ x: 1 }));
  check("path is open after the cut", w.player.x > 23 * 16, `x=${w.player.x}`);
}
{
  const { w, log } = setup([], propRoom());
  w.player.x = 17 * 16;
  for (let i = 0; i < 5; i++) w.step(I());
  const s = w.props.find((p) => p.def.kind === "sign")!;
  w.step(I({ slashPressed: true, aimX: s.cx + 10, aimY: s.cy }));
  for (let i = 0; i < 20; i++) w.step(I({ aimX: s.cx + 10, aimY: s.cy }));
  check("sign breaks in one cut", log.filter((e) => e === "propBreak").length === 1 && !w.props.includes(s), `events ${log.filter((e) => e.startsWith("prop")).join(",")}`);
}
// 23. barrels are cover: enemy bullets stop, reflected bullets smash them
{
  const { w, log } = setup([], propRoom());
  const bar = w.props.find((p) => p.def.kind === "barrel")!;
  const eb = new Bullet(bar.cx + 40, bar.cy, -300, 0, "enemy");
  w.bullets.push(eb);
  for (let i = 0; i < 20; i++) w.step(I());
  check("enemy fire stops at a barrel", !eb.alive && bar.hp === 2 && log.includes("wall"), `hp=${bar.hp}`);
  const pb = new Bullet(bar.cx - 40, bar.cy, 420, 0, "player");
  pb.damage = 2;
  w.bullets.push(pb);
  for (let i = 0; i < 20; i++) w.step(I());
  check("a perfect reflected shot smashes a barrel", log.includes("propBreak"), `events ${log.filter((e) => e.startsWith("prop")).join(",")}`);
}
// 24. broken props stay broken across a checkpoint respawn, return on full restart
{
  const { w } = setup([], propRoom());
  const bar = w.props.find((p) => p.def.kind === "barrel")!;
  w.damageProp(bar, 2, 1, 0, false);
  w.reset(false);
  check("broken barrel stays broken", !w.props.some((p) => p.def.kind === "barrel") && w.level.get(22, 27) === EMPTY, `props ${w.props.length}`);
  w.reset(true);
  check("full restart rebuilds the barrel", w.props.some((p) => p.def.kind === "barrel") && w.level.get(22, 27) === BREAK, `props ${w.props.length}`);
}

// ---------------------------------------------------------------- arena

// 25. arena: walls seal on entry, squad drops in, walls open when cleared
{
  const L = room([{ kind: "rifle", x: 40, y: 28, group: 7 }]);
  L.arenas.push({ group: 7, trigger: 30, walls: [{ x: 26, y0: 10, y1: 27 }, { x: 50, y0: 10, y1: 27 }], entrance: true });
  const { w, log } = setup([], L);
  const s = w.soldiers[0];
  check("arena squad waits hidden", s.state === "dormant" && !w.hittable(s), `state=${s.state}`);
  w.player.x = 31 * 16;
  w.step(I());
  check("walls close on entry", log.includes("arenaStart") && w.level.get(26, 20) === BARRIER && w.level.get(50, 20) === BARRIER, `tile=${w.level.get(26, 20)}`);
  for (let i = 0; i < 40; i++) w.step(I({ x: -1 }));
  check("energy wall holds the player in", w.player.x >= 27 * 16, `x=${w.player.x}`);
  let landed = false;
  for (let i = 0; i < 200 && !landed; i++) { w.step(I()); landed = log.includes("enterLand"); }
  check("soldier rappels in and lands on his post", landed && Math.abs(s.y - s.anchorY) < 1 && w.hittable(s), `y=${s.y} anchor=${s.anchorY} state=${s.state}`);
  s.hp = 1;
  const pb = new Bullet(s.cx - 30, s.cy, 400, 0, "player");
  w.bullets.push(pb);
  for (let i = 0; i < 20; i++) w.step(I());
  check("walls open when the squad is down", log.includes("arenaClear") && w.level.get(26, 20) === EMPTY, `tile=${w.level.get(26, 20)}`);
}

// 26. a stacked barrel drops when the one under it breaks; broken state survives respawn
{
  const L = room();
  L.props.push({ kind: "barrel", x: 22, y: 28 }, { kind: "barrel", x: 22, y: 26, variant: 1 });
  const { w, log } = setup([], L);
  const [lower, upper] = [w.props[0], w.props[1]];
  w.damageProp(lower, 2, 1, 0, false);
  check("upper barrel takes the gap", upper.def.y === 28 && w.level.get(22, 27) === BREAK && w.level.get(22, 25) === EMPTY, `upper.y=${upper.def.y}`);
  for (let i = 0; i < 30; i++) w.step(I());
  check("it lands with a thud", log.includes("propLand") && upper.dropFrom === 0, `dropFrom=${upper.dropFrom}`);
  w.damageProp(upper, 2, 1, 0, false);
  w.reset(false);
  check("both stay broken after respawn", w.props.length === 0, `props ${w.props.length}`);
}

// 27. a sword fighter will not chase you off a roof; one that falls out still counts as dead
{
  const L = new Level(80, 30);
  L.fill(0, 28, 30, 29, SOLID);   // his roof ends at x=30
  L.fill(36, 28, 79, 29, SOLID);  // ours starts at x=36
  L.spawnX = 40 * 16; L.spawnY = 28 * 16;
  L.spawns = [{ kind: "blade", x: 26, y: 28, group: 1, facing: 1 }];
  const { w } = setup([], L);
  const b = w.soldiers[0];
  for (let i = 0; i < 400; i++) w.step(I());
  check("blade stops at the roof edge", b.alive && b.y < 28 * 16 && b.x + b.w <= 31 * 16 + 2, `x=${(b.x / 16).toFixed(1)} y=${b.y} state=${b.state}`);
  const L2 = room([{ kind: "rifle", x: 40, y: 28, group: 4 }]);
  const { w: w2, log } = setup([], L2);
  w2.soldiers[0].y = L2.pixelH + 60;
  w2.step(I());
  check("soldier lost to a pit counts as killed", !w2.soldiers[0].alive && log.includes("sDie") && w2.clearedGroups.has(4), `alive=${w2.soldiers[0].alive}`);
}

// 28. in a sealed arena the sword fighter hunts you down, vaulting the cover in between
{
  const L = room([{ kind: "blade", x: 30, y: 28, group: 5, facing: 1 }]);
  L.fill(36, 23, 39, 27, SOLID); // 5-tile cover block
  L.arenas.push({ group: 5, trigger: 26, walls: [{ x: 24, y0: 10, y1: 27 }, { x: 60, y0: 10, y1: 27 }], entrance: false });
  L.spawnX = 46 * 16;
  const { w } = setup([], L);
  w.player.invuln = 999;
  const b = w.soldiers[0];
  let crossed = false;
  for (let i = 0; i < 600 && !crossed; i++) { w.step(I()); crossed = b.cx > 40 * 16; }
  check("blade vaults cover to reach you", crossed, `blade x=${(b.x / 16).toFixed(1)} state=${b.state}`);
}

// ---------------------------------------------------------------- healing
{
  const { w, log } = setup();
  const p = w.player;
  p.hp = 2;
  const amp = p.ampoules;
  w.step(I({ healPressed: true }));
  const started = p.healT >= 0;
  for (let i = 0; i < 40; i++) w.step(I());
  check("ampoule heals 2 cells after the channel", started && p.hp === 4 && p.ampoules === amp - 1, `hp=${p.hp} amp=${p.ampoules}`);
  w.step(I({ healPressed: true }));
  for (let i = 0; i < 40; i++) w.step(I());
  check("second ampoule (2 carried at first)", p.hp === 5 && p.ampoules === 0, `hp=${p.hp} amp=${p.ampoules}`);
  p.hp = 3;
  log.length = 0;
  w.step(I({ healPressed: true }));
  check("no ampoules left: nothing happens", p.healT < 0 && p.hp === 3, `healT=${p.healT}`);
}
{
  const { w } = setup();
  const p = w.player;
  p.hp = 3;
  w.step(I({ healPressed: true }));
  incoming(w, 30, 400);
  for (let i = 0; i < 40; i++) w.step(I());
  check("getting hit mid-heal spills the ampoule", p.hp === 2 && p.ampoules === 1 && p.healT < 0, `hp=${p.hp} amp=${p.ampoules}`);
}
{
  const { w, log } = setup();
  const p = w.player;
  p.ampoules = 0;
  for (let k = 0; k < 8; k++) {
    const c = w.chest();
    w.bullets.push(new Bullet(c.x + 14, c.y, -200, 0, "enemy"));
    w.step(I({ parryPressed: true, aimX: c.x + 100, aimY: c.y }));
    for (let i = 0; i < 20; i++) w.step(I());
  }
  check("8 perfect parries brew an ampoule", p.ampoules === 1 && log.includes("ampoule"), `amp=${p.ampoules} count=${p.perfectCount}`);
}
// ---------------------------------------------------------- parry re-arm
{
  const { w } = setup();
  const p = w.player;
  const c = w.chest();
  w.bullets.push(new Bullet(c.x + 14, c.y, -200, 0, "enemy"));
  w.step(I({ parryPressed: true, aimX: c.x + 100, aimY: c.y }));
  check("a parry that connected re-arms at once", p.parryHit && p.canParry(), `timer=${p.parryTimer.toFixed(3)} hit=${p.parryHit}`);
  w.step(I({ parryPressed: true, aimX: c.x + 100, aimY: c.y }));
  for (let i = 0; i < 12; i++) w.step(I());
  check("...but a second press that whiffs is still punished", p.parryCooldown > 0 || !p.canParry(), `cool=${p.parryCooldown.toFixed(3)}`);
}

// reach: 1.3x the original (slash 46 -> 60 px, bullet parry 40 -> 52 px)
{
  const w = new World(room(), makeEv([]));
  for (let i = 0; i < 10; i++) w.step(I());
  const p = w.player, c = w.chest();
  p.slashAimX = 1; p.slashAimY = 0;
  const arc = (dx: number) => (w as any).inSlashArc(c.x + dx, c.y - 4, 8, 8) as boolean;
  check("slash reaches 58 px (was 46)", arc(58) && arc(50), `58=${arc(58)} 50=${arc(50)}`);
  check("...but not 63 px", !arc(63), `63=${arc(63)}`);
  p.aimX = 1; p.aimY = 0;
  const zone = (dx: number) => { const b = new Bullet(c.x + dx, c.y, -100, 0, "enemy"); return (w as any).inParryZone(b) as boolean; };
  check("bullet parry reaches 50 px (was 40)", zone(50) && !zone(56) && TUNE.parryRange === 52, `50=${zone(50)} 56=${zone(56)} range=${TUNE.parryRange}`);
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
