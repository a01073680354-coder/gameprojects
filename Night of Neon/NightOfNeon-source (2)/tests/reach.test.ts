// Reachability check: can the goal be reached with jumps, dashes and
// catwalks alone (walls disabled)? Uses the real Player physics.
// Barricades are treated as cut open (they need a slash), and a second
// pass proves the goal is NOT reachable while they stand.
import { buildStage1 } from "../src/world/stage1";
import { buildStage2 } from "../src/world/stage2";
import { buildStage3 } from "../src/world/stage3";
import { buildOutskirts } from "../src/world/stage_outskirts";
import { buildMarket } from "../src/world/stage_market";
import { Level, SOLID, ONEWAY, BREAK, EMPTY } from "../src/world/level";
import { Player, PW, PH, PlayerEvents } from "../src/entities/player";
import { InputFrame } from "../src/core/input";
import { STEP, TUNE, TILE, FEATURES } from "../src/config";

const noop: PlayerEvents = { jump() {}, land() {}, dashStart() {}, dashEnd() {}, dashRefill() {}, wallSlide() {}, freeze() {} };
const I = (o: Partial<InputFrame> = {}): InputFrame => ({
  x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, parryPressed: false, aimX: 0, aimY: 0, ...o,
});

function analyse(L: Level, verbose: boolean, noDash = !!process.env.NODASH) {
  interface Seg { id: number; y: number; x0: number; x1: number; oneway: boolean; }
  const segs: Seg[] = [];
  for (let ty = 1; ty < L.h; ty++) {
    let start = -1;
    for (let tx = 0; tx <= L.w; tx++) {
      const t = tx < L.w ? L.get(tx, ty) : 0;
      let ok = (t === SOLID || t === ONEWAY) && tx < L.w;
      if (ok) for (let k = 1; k <= 4; k++) if (L.blocks(tx, ty - k)) ok = false;
      if (ok && start < 0) start = tx;
      if ((!ok || tx === L.w) && start >= 0) {
        segs.push({ id: segs.length, y: ty * TILE, x0: start * TILE, x1: tx * TILE, oneway: L.get(start, ty) === ONEWAY });
        start = -1;
      }
    }
  }
  const segAt = (cx: number, bottom: number) => segs.find((s) => s.y === bottom && cx >= s.x0 - 4 && cx <= s.x1 + 4);

  type Plan = { dir: number; run: boolean; jump: "none" | "full" | "tap" | "drop"; dash?: [number, number, number]; superJump?: boolean };
  const plans: Plan[] = [];
  for (const dir of [-1, 1]) {
    for (const run of [false, true]) {
      plans.push({ dir, run, jump: "none" }, { dir, run, jump: "drop" }, { dir, run, jump: "tap" }, { dir, run, jump: "full" });
      if (noDash) continue;
      for (const f of [6, 14, 22, 30]) for (const [dx, dy] of [[dir, 0], [dir, -1], [0, -1], [dir, 1]]) plans.push({ dir, run, jump: "full", dash: [f, dx, dy] });
      plans.push({ dir, run, jump: "full", superJump: true });
    }
  }

  function simulate(sx: number, seg: Seg, plan: Plan): Seg | null {
    const p = new Player(L, sx - PW / 2, seg.y - PH, noop);
    p.update(I(), STEP);
    if (!p.onGround) return null;
    if (plan.run) p.vx = plan.dir * TUNE.runSpeed;
    let airborne = 0;
    for (let f = 0; f < 200; f++) {
      const o: Partial<InputFrame> = { x: plan.dir, jumpHeld: plan.jump === "full" || (plan.jump === "tap" && f < 4) };
      if (plan.superJump) {
        if (f === 0) { o.dashPressed = true; o.y = 0; }
        if (f === 3) { o.jumpPressed = true; o.jumpHeld = true; }
        if (f > 3) o.jumpHeld = true;
      } else {
        if (f === 0 && plan.jump !== "none" && plan.jump !== "drop") o.jumpPressed = true;
        if (f === 0 && plan.jump === "drop") { o.y = 1; o.jumpPressed = true; }
        if (plan.dash && f === plan.dash[0]) { o.dashPressed = true; o.x = plan.dash[1]; o.y = plan.dash[2]; }
      }
      p.update(I(o), STEP);
      if (!p.onGround) airborne++;
      else if (airborne > 2) return segAt(p.cx, p.bottom) ?? null;
      else if (f > 60 && plan.jump === "none") return segAt(p.cx, p.bottom) ?? null;
      if (p.y > L.pixelH + 24) return null;
    }
    return null;
  }

  const start = segAt(L.spawnX, L.spawnY)!;
  const reached = new Map<number, string>([[start.id, "start"]]);
  const queue = [start];
  while (queue.length) {
    const s = queue.shift()!;
    const samples: number[] = [];
    for (let x = s.x0 + PW; x <= s.x1 - PW; x += 24) samples.push(x);
    samples.push(s.x0 + PW / 2 + 1, s.x1 - PW / 2 - 1);
    for (const x of samples) {
      for (const plan of plans) {
        const r = simulate(x, s, plan);
        if (r && !reached.has(r.id)) {
          reached.set(r.id, `${plan.jump}${plan.dash ? "+dash" : ""}${plan.superJump ? "+super" : ""} from seg ${s.id}`);
          queue.push(r);
        }
      }
    }
  }
  const g = L.goal ?? L.boss!; // the stage ends on the boss heliport
  const goalSeg = segAt(g.x * TILE + 8, g.y * TILE)!;
  if (verbose) {
    for (const s of segs) {
      const how = reached.get(s.id);
      console.log(`${how ? "  ok " : "  -- "} seg ${String(s.id).padStart(2)} y=${s.y / TILE} x=${s.x0 / TILE}..${s.x1 / TILE - 1}${s.oneway ? " (catwalk)" : ""}  ${how ?? "UNREACHED"}`);
    }
  }
  return { ok: reached.has(goalSeg.id), segs: segs.length, reached: reached.size, list: segs.map((s) => ({ y: s.y / TILE, x0: s.x0 / TILE, x1: s.x1 / TILE - 1, ok: reached.has(s.id) })) };
}

const open = buildStage1();
for (const p of open.props) for (const t of Level.propTiles(p)) open.set(t.x, t.y, EMPTY);
const a = analyse(open, true);
console.log(`walls enabled: ${FEATURES.wall}; barricades cut: ${a.reached}/${a.segs} surfaces reached`);

const shut = buildStage1();
for (const p of shut.props) for (const t of Level.propTiles(p)) shut.set(t.x, t.y, BREAK);
const b = analyse(shut, false);
console.log(`barricades intact: ${b.reached}/${b.segs} surfaces reached, goal ${b.ok ? "reachable (barrels do not block!)" : "blocked as intended"}`);

const two = buildStage2();
for (const p of two.props) for (const t of Level.propTiles(p)) two.set(t.x, t.y, EMPTY);
const c2 = analyse(two, !!process.env.V2);
console.log(`stage 2: ${c2.reached}/${c2.segs} surfaces reached, boss shaft ${c2.ok ? "reachable" : "NOT REACHABLE"}`);

const three = buildStage3();
for (const p of three.props) for (const t of Level.propTiles(p)) three.set(t.x, t.y, EMPTY);
const c3 = analyse(three, !!process.env.V3);
console.log(`stage 3: ${c3.reached}/${c3.segs} surfaces reached, the Vault ${c3.ok ? "reachable" : "NOT REACHABLE"}`);

// STAGE 1 (the outskirts): reachable; the barred door needs cutting; the ditch needs a dash
const out = buildOutskirts();
for (const p of out.props) for (const t of Level.propTiles(p)) out.set(t.x, t.y, EMPTY);
const o1 = analyse(out, !!process.env.V11);
console.log(`outskirts: ${o1.reached}/${o1.segs} surfaces reached, 차승호's yard ${o1.ok ? "reachable" : "NOT REACHABLE"}`);
const outShut = buildOutskirts();
for (const p of outShut.props) for (const t of Level.propTiles(p)) outShut.set(t.x, t.y, BREAK);
const o2 = analyse(outShut, false);
console.log(`outskirts, door barred: yard ${o2.ok ? "reachable (the door does not block!)" : "blocked as intended"}`);
const outNoDash = buildOutskirts();
for (const p of outNoDash.props) for (const t of Level.propTiles(p)) outNoDash.set(t.x, t.y, EMPTY);
const o3 = analyse(outNoDash, false, true);
console.log(`outskirts without dashing: yard ${o3.ok ? "reachable (the ditch does not teach the dash!)" : "blocked as intended (the ditch needs a dash)"}`);

// STAGE 2 (the market): the freight yard is reachable, and so are all three catwalks
const mk = buildMarket();
const m1 = analyse(mk, !!process.env.V12);
console.log(`market: ${m1.reached}/${m1.segs} surfaces reached, the freight yard ${m1.ok ? "reachable" : "NOT REACHABLE"}`);
const deckWalk = m1.list.filter((s) => s.y <= 15 && s.ok);
const catwalks = m1.list.filter((s) => s.x0 >= 222 && s.x1 <= 258 && s.y < 30);
console.log(`market: the overpass deck ${deckWalk.length ? "CAN be walked (skips the stage!)" : "is out of reach"}; boss catwalks reached ${catwalks.filter((s) => s.ok).length}/${catwalks.length}`);

const ok = a.ok && !b.ok && c2.ok && c3.ok && o1.ok && !o2.ok && !o3.ok && m1.ok && !deckWalk.length && catwalks.every((s) => s.ok);
console.log(ok ? "\nGOAL REACHABLE (and barricades are required cuts)" : "\nREACHABILITY CHECK FAILED");
process.exit(ok ? 0 : 1);
