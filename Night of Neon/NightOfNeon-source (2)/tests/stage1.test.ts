// STAGE 1 is light: a place to learn the hands and the world (user, Nov 1).
// Its sword/baton squad swings once per attack, never lunges, never hurries.
import { World, WorldEvents } from "../src/sim/world";
import { buildOutskirts } from "../src/world/stage_outskirts";
import { buildMarket } from "../src/world/stage_market";
import { InputFrame } from "../src/core/input";
import { Soldier } from "../src/sim/soldier";

let fails = 0;
function check(name: string, ok: boolean, info: string) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — ${info}`); if (!ok) fails++; }
const I = (o: Partial<InputFrame> = {}): InputFrame => ({ x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, parryPressed: false, aimX: 0, aimY: 0, ...o });

/** One collector squaring up to the hero: what it does over `sec` seconds. */
function duel(gentle: boolean, sec: number, setup?: (w: World, s: Soldier) => void) {
  const log: string[] = [];
  const ev = new Proxy({}, {
    get: (_t, k: string) => (s: Soldier, heavy?: boolean) => {
      if (k === "enemySwing") log.push(heavy ? "lunge" : "swing");
      if (k === "glint") log.push(`glint@${s.timer.toFixed(2)}`);
      if (k === "danger") log.push("danger");
    },
  }) as WorldEvents;
  const L = buildOutskirts();
  L.gentleMelee = gentle;
  L.spawns = [{ kind: "collector", x: 47, y: 30, group: 99 }];
  L.arenas = [];
  const w = new World(L, ev);
  const s = w.soldiers.find((o) => o.kind === "collector")!;
  const p = w.player;
  p.x = s.x - 36; p.y = s.bottom - p.h;
  s.state = "guard"; s.timer = 0.1; s.facing = -1; s.seen = true;
  setup?.(w, s);
  const strikes: number[] = []; // swings per attack, closed by each recovery
  let n = 0;
  for (let t = 0; t < sec * 60; t++) {
    p.invuln = 9; p.hp = p.maxHp; // a dummy that stands and watches
    const before = log.length;
    const st = s.state;
    w.step(I());
    n += log.slice(before).filter((e) => e === "swing" || e === "lunge").length;
    if (st !== "recover" && s.state === "recover") { strikes.push(n); n = 0; }
  }
  return { log, strikes };
}

{
  check("the outskirts are built as a gentle stage", buildOutskirts().gentleMelee === true, "");
  check("later stages are not", buildMarket().gentleMelee === false, "");
}
{
  const g = duel(true, 12);
  check("STAGE 1: every attack is a single swing", g.strikes.length >= 3 && g.strikes.every((k) => k === 1), `swings per attack: ${g.strikes.join(",")}`);
  check("STAGE 1: never the red ! lunge", !g.log.includes("lunge") && !g.log.includes("danger"), "");
}
{
  const c = duel(false, 12);
  check("control: the same collector elsewhere swings twice", c.strikes.length >= 3 && c.strikes.every((k) => k === 2), `swings per attack: ${c.strikes.join(",")}`);
}
{
  // pressed (two cuts blocked): the riposte keeps the collector's usual windup in STAGE 1
  const r = duel(true, 1.2, (_w, s) => { s.blocks = 2; s.timer = 9; });
  const first = r.log.find((e) => e.startsWith("glint@"));
  check("STAGE 1: a riposte is one swing at the usual, readable pace", first === "glint@0.55" && r.strikes[0] === 1, `${first} swings=${r.strikes[0]}`);
  const h = duel(false, 1.2, (_w, s) => { s.blocks = 2; s.timer = 9; });
  check("control: elsewhere the riposte is hurried", h.log.find((e) => e.startsWith("glint@")) === "glint@0.20", String(h.log.find((e) => e.startsWith("glint@"))));
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
