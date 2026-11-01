// Headless tests for STAGE 1 (the outskirts) and the common story layer:
// the story order, the save slot, the incinerator drone and its fire, and
// 차승호 (three moves, posture, and a deathblow that only disarms).
import { Level, SOLID } from "../src/world/level";
import { World, WorldEvents } from "../src/sim/world";
import { Chief, CHIEF } from "../src/sim/chief";
import { InputFrame } from "../src/core/input";
import { TILE } from "../src/config";
import { ORDER, FIRST_STAGE, nextAfter, stageKick, displayNo } from "../src/story/manifest";
import { buildOutskirts } from "../src/world/stage_outskirts";
import { STAGES, stageInfo } from "../src/world/stages";
import { SCENES, BARKS, CLEAR_LINES, PROLOGUE } from "../src/story/script";

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
      else if (key === "fire") log.push("fire:" + a[0].owner);
      else log.push(key);
    },
  }) as WorldEvents;
}
const I = (o: Partial<InputFrame> = {}): InputFrame => ({
  x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, parryPressed: false, aimX: 0, aimY: 0, ...o,
});

// ------------------------------------------------------------ story order
{
  check("a new game starts at the outskirts", FIRST_STAGE === 11 && ORDER[0].key === "outskirts", `first=${FIRST_STAGE}`);
  const n = nextAfter(11);
  check("after STAGE 1: the market (STAGE 2), then the rooftops (STAGE 3)",
    n.skipped.length === 0 && n.next?.id === 12 && nextAfter(12).next?.id === 1, `skipped=${n.skipped.map((s) => s.key)} next=${n.next?.key}`);
  check("rooftop → spire → archive keep their order", nextAfter(1).next?.id === 2 && nextAfter(2).next?.id === 3, "");
  check("nothing playable after the archive yet", nextAfter(3).next === null && nextAfter(3).skipped.length === 6, `skipped=${nextAfter(3).skipped.length}`);
  check("display numbers follow the story, not the ids",
    stageKick(11) === "STAGE 1" && stageKick(12) === "STAGE 2" && stageKick(1) === "STAGE 3" && stageKick(2) === "STAGE 4" && stageKick(3) === "STAGE 5" && displayNo(3) === 5,
    `${stageKick(11)} ${stageKick(1)} ${stageKick(2)} ${stageKick(3)}`);
  check("the stage card shows the story number", stageInfo(1).title.kick === "STAGE 3" && stageInfo(11).title.kick === "STAGE 1", stageInfo(1).title.kick);
  check("every playable stage in the order is registered", ORDER.filter((s) => s.id !== null).every((s) => STAGES.some((x) => x.id === s.id)), "");
  check("finish words: subdue / destroy / slay", stageInfo(11).finish === "subdue" && stageInfo(2).finish === "destroy", "");
}

// ------------------------------------------------------------ script
{
  const notes = buildOutskirts().notes.map((n) => n.id);
  check("every note in the house has its lines", notes.every((id) => (SCENES[id]?.length ?? 0) > 0), notes.filter((id) => !SCENES[id]).join() || "all");
  check("차승호 has an entrance and a subdued scene", !!SCENES["s11-cha-intro"] && !!SCENES["s11-cha-down"], "");
  check("the subdued scene names the archive tower (bible 1-08)", SCENES["s11-cha-down"].some((l) => l.text.includes("보관탑")), "");
  check("STAGE 1 barks exist (start, ambush, ambush-clear)", ["s11-start", "s11-ambush", "s11-ambush-clear"].every((k) => !!BARKS[k]), "");
  check("STAGE 1 clear line names the next place", (CLEAR_LINES[11] ?? "").includes("하층"), CLEAR_LINES[11] ?? "");
  const rec = PROLOGUE.filter((p) => p.line?.who === "seo").map((p) => p.line!.text).join(" ");
  check("prologue: '찾으러 오지 마세요' and '그래도 오신다면, 이 좌표를' (recommendation 1)",
    rec.includes("절 찾으러 오지 마세요") && rec.includes("그래도 오신다면, 이 좌표를 따라오세요"), rec.slice(0, 60));
  check("prologue: the unanswered call and the blank name tag (P-01)", PROLOGUE.some((p) => p.shot === "phone") && PROLOGUE.some((p) => p.shot === "photo"), "");
  check("prologue does not lecture on NULL PROTOCOL", !PROLOGUE.some((p) => p.card?.big === "NULL PROTOCOL"), "");
}

// ------------------------------------------------------------ the save slot
async function saveTests() {
  const mem = new Map<string, string>();
  (globalThis as any).window = globalThis;
  (globalThis as any).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
  };
  const { SAVE, LESSONS } = await import("../src/story/save");
  const { CHOICES } = await import("../src/story/state");
  const { WALLET } = await import("../src/sim/loadout");
  check("no save at first", SAVE.peek() === null, "");
  WALLET.chips = 42; WALLET.owned.add("edge"); WALLET.visited.add("forge");
  LESSONS.add("parry"); LESSONS.add("dash");
  CHOICES.seungho_spared = true;
  (globalThis as any).__storySeen = new Set(["s11-cha-intro"]);
  SAVE.write(11, 2);
  const d = SAVE.peek();
  check("a checkpoint writes the stage and checkpoint", d?.stage === 11 && d?.cp === 2, JSON.stringify({ s: d?.stage, cp: d?.cp }));
  // wipe the live state, then restore from the slot
  WALLET.chips = 0; WALLET.owned.clear(); WALLET.visited.clear(); LESSONS.clear(); CHOICES.seungho_spared = null;
  SAVE.restore(SAVE.peek()!);
  check("restore brings back chips, gear and shops visited", WALLET.chips === 42 && WALLET.owned.has("edge") && WALLET.visited.has("forge"), `chips=${WALLET.chips}`);
  check("restore brings back the lessons (never taught twice)", LESSONS.has("parry") && LESSONS.has("dash") && LESSONS.size === 2, [...LESSONS].join());
  check("restore brings back the decisions", CHOICES.seungho_spared === true && CHOICES.final_choice === null, String(CHOICES.seungho_spared));
  check("restore brings back the scenes already seen", (globalThis as any).__storySeen.has("s11-cha-intro"), "");
  mem.set("non.save.v1", JSON.stringify({ stage: 1 }));
  const old = SAVE.peek();
  check("an old, thin save is filled in rather than thrown away", old?.stage === 1 && old.cp === -1 && Array.isArray(old.lessons), JSON.stringify(old).slice(0, 80));
  SAVE.clear();
  check("a new game clears the slot, the lessons and the decisions", SAVE.peek() === null && LESSONS.size === 0 && CHOICES.seungho_spared === null, "");
  mem.set("non.save.v1", "{not json");
  check("a corrupt slot reads as no save", SAVE.peek() === null, "");
}

// ------------------------------------------------------------ the incinerator drone
function flat(w = 70) {
  const L = new Level(w, 30);
  L.fill(0, 28, w - 1, 29, SOLID);
  L.spawnX = 20 * TILE + 8;
  L.spawnY = 28 * TILE;
  L.theme = "outskirts";
  return L;
}
{
  const L = flat();
  L.spawns.push({ kind: "burner", x: 24, y: 24, group: 0 });
  const log: string[] = [];
  const w = new World(L, makeEv(log));
  const s = w.soldiers.find((o) => o.kind === "burner")!;
  let warned = false, fired = false, t = 0;
  for (; t < 60 * 8 && !fired; t++) {
    w.player.invuln = 999;
    w.step(I());
    if (log.includes("peril:flame")) warned = true;
    if (log.some((e) => e.startsWith("fire:"))) fired = true;
  }
  check("burner: warns with a purple 危, then sets the floor alight", warned && fired, `t=${(t / 60).toFixed(1)}s state=${s.state}`);
  const f = w.fires[0];
  check("the fire lies on the floor under it", !!f && f.floor === 28 * TILE && f.owner === s.id, f ? `floor=${f.floor / TILE} w=${f.w}` : "none");
}
{
  // standing in it hurts once; parrying does not help
  const L = flat();
  const w = new World(L, makeEv([]));
  const log: string[] = [];
  (w as any).ev = makeEv(log);
  for (let i = 0; i < 40; i++) w.step(I()); // settle on the floor
  w.player.invuln = 0;
  w.step(I({ parryPressed: true, aimX: w.player.cx + 40, aimY: w.player.cy }));
  w.addFire(w.player.cx - 30, 28 * TILE, 60, 1.0, 99, 0.02);
  for (let i = 0; i < 70; i++) w.step(I());
  const hits = log.filter((e) => e === "playerHit").length;
  check("fire: hurts once, and a parry can't turn it", hits === 1 && log.includes("heavyBlocked"), `hits=${hits}`);
}
{
  const L = flat();
  const w = new World(L, makeEv([]));
  const log: string[] = [];
  (w as any).ev = makeEv(log);
  w.player.invuln = 0;
  w.player.x = 10 * TILE;
  w.addFire(12 * TILE, 28 * TILE, 64, 1.0, 99, 0.3);
  // dash through the strip while it burns
  for (let i = 0; i < 22; i++) w.step(I());
  w.step(I({ x: 1, dashPressed: true }));
  for (let i = 0; i < 16; i++) w.step(I({ x: 1 }));
  check("fire: a dash goes through it (dodge, no hit)", !log.includes("playerHit") && log.includes("dodge") && w.player.x > 16 * TILE, `x=${(w.player.x / TILE).toFixed(1)} log=${log.join(",")}`);
}
{
  const L = flat();
  const w = new World(L, makeEv([]));
  const log: string[] = [];
  (w as any).ev = makeEv(log);
  w.player.invuln = 0;
  w.player.x = 8 * TILE;
  w.addFire(12 * TILE, 28 * TILE, 64, 1.2, 99, 0.3);
  for (let i = 0; i < 18; i++) w.step(I());
  // a running jump over it
  let k = 0;
  for (; k < 90; k++) w.step(I({ x: 1, jumpPressed: k === 4, jumpHeld: k < 30 }));
  check("fire: a running jump clears it", !log.includes("playerHit") && w.player.x > 16 * TILE, `x=${(w.player.x / TILE).toFixed(1)}`);
}

// ------------------------------------------------------------ 차승호
function yard() {
  const L = flat(60);
  L.spawnX = 12 * TILE + 8;
  L.arenas.push({ group: 7, trigger: 14, walls: [{ x: 6, y0: 0, y1: 27 }, { x: 50, y0: 0, y1: 27 }], entrance: false, boss: true });
  L.boss = { x: 30, y: 28, group: 7, kind: "chief" };
  const log: string[] = [];
  const w = new World(L, makeEv(log));
  const b = w.boss as Chief;
  for (let i = 0; i < 60 && b.state === "dormant"; i++) w.step(I({ x: 1 }));
  for (let i = 0; i < 400 && b.state === "intro"; i++) w.step(I());
  return { w, log, b };
}
/** Parries each baton cut and the red "!" just before it lands; hops the fire. */
function duelist(w: World, b: Chief): Partial<InputFrame> {
  const near = Math.abs(b.cx - w.player.cx) < 120;
  const parry = near && (((b.state === "windup" || b.state === "smashWind") && b.timer < 0.04));
  const o: Partial<InputFrame> = { parryPressed: parry, aimX: b.cx, aimY: b.cy };
  if (b.state === "flameWind" && b.timer < 0.2 && w.player.parryTimer <= 0) { o.x = -b.facing; o.dashPressed = b.timer < 0.05; }
  return o;
}
{
  const { w, b, log } = yard();
  check("차승호 is a Chief with one deathblow mark", b instanceof Chief && b.marks === 1 && b.hp === CHIEF.hp, `marks=${b.marks} hp=${b.hp}`);
  // all three moves show up over a long stretch
  const seen = new Set<string>();
  for (let i = 0; i < 60 * 40; i++) {
    w.player.invuln = 999;
    w.player.x = b.x + (i % 600 < 300 ? -60 : -150); // sometimes close, sometimes far
    w.step(I());
    seen.add(b.state);
  }
  check("three moves: baton (windup/strike), red ! smash, purple flame",
    seen.has("windup") && seen.has("strike") && seen.has("smashWind") && seen.has("smash") && seen.has("flameWind") && seen.has("flame"),
    [...seen].join(","));
  check("the smash is flagged with a red !, the flame with a purple 危", log.includes("danger") && log.includes("peril:flame"), "");
  check("the flame sets the floor alight, owned by him", log.includes(`fire:${b.id}`), "");
}
{
  const { w, b } = yard();
  // never the same move three times running
  let worst = 0;
  for (let i = 0; i < 60 * 60; i++) {
    w.player.invuln = 999;
    w.player.x = b.x - 70;
    w.step(I());
  }
  for (let i = 2; i < b.moves.length; i++) if (b.moves[i] === b.moves[i - 1] && b.moves[i] === b.moves[i - 2]) worst++;
  check("no move three times in a row", worst === 0, b.moves.join(","));
}
{
  const { w, b, log } = yard();
  // a parried smash breaks a great deal of posture
  const orig = Math.random;
  Math.random = () => 0.5;
  w.player.x = b.x - 50;
  let gain = 0, clashed = false;
  for (let i = 0; i < 60 * 10 && !clashed; i++) {
    w.player.invuln = 999;
    const was = b.state, pb = b.posture, n = log.length;
    w.step(I(duelist(w, b)));
    if (was === "smash" && log.slice(n).includes("clashH")) { clashed = true; gain = b.posture - pb; }
  }
  Math.random = orig;
  check("a parried smash: a heavy clash and a big posture hit", clashed && gain >= 40, `gain=${gain.toFixed(0)} state=${b.state}`);
}
{
  // the whole fight: parry him down, then the deathblow that does not kill
  const { w, b, log } = yard();
  let t = 0;
  for (; t < 60 * 120 && b.state !== "dead"; t++) {
    w.player.invuln = 999;
    const o = duelist(w, b);
    if (b.state === "stagger") {
      const dx = b.cx - w.player.cx;
      if (Math.abs(dx) > 28) o.x = Math.sign(dx); else o.slashPressed = true;
    } else if (b.state === "guard" || b.state === "recover") {
      // press in and cut while he recovers
      const dx = b.cx - w.player.cx;
      if (Math.abs(dx) > 40) o.x = Math.sign(dx);
      else if (b.state === "recover") o.slashPressed = t % 12 === 0;
    }
    w.step(I(o));
  }
  check("parried and cut down to a deathblow", b.state === "dead" && log.includes("deathblow") && log.includes("bossDefeated"), `t=${(t / 60).toFixed(0)}s state=${b.state} hp=${b.hp} posture=${b.posture.toFixed(0)}`);
  const y0 = b.y;
  for (let i = 0; i < 120; i++) w.step(I());
  check("subdued, not killed: he stays where he knelt (no fall, no spin)", Math.abs(b.y - y0) < 2 && w.soldiers.includes(b), `dy=${(b.y - y0).toFixed(1)}`);
  check("the arena opens after", !w.activeArenas.has(7), "");
}
{
  // his fire goes when he goes down (the scene clears world.fires; the sim stops making more)
  const { w, b } = yard();
  b.state = "dead";
  const n = w.fires.length;
  for (let i = 0; i < 120; i++) w.step(I());
  check("a subdued chief makes no more fire", w.fires.length <= n, `fires=${w.fires.length}`);
}

// ------------------------------------------------------------ the level itself
{
  const L = buildOutskirts();
  check("starts hurt (an old body; her medicine upstairs)", L.startHp === 3 && L.notes.some((n) => n.gift === "ampoule"), `startHp=${L.startHp}`);
  check("the lesson list covers every basic control", ["move", "jump", "heal", "slash", "parry", "peril", "dash", "drop"].every((id) => L.lessons.some((l) => l.id === id)), L.lessons.map((l) => l.id).join());
  check("a checkpoint at the emergency terminal", L.checkpoints.some((c) => c.x === 114), L.checkpoints.map((c) => c.x).join());
  check("the boss is 차승호", L.boss?.kind === "chief", String(L.boss?.kind));
}

saveTests().then(() => {
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
});
