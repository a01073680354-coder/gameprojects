// Money that a death takes back, and normal enemies growing tougher by stage.
import { World, WorldEvents } from "../src/sim/world";
import { WALLET, MOD, earn, commitEarnings, forfeitEarnings } from "../src/sim/loadout";
import { Bullet } from "../src/sim/bullet";
import { Soldier } from "../src/sim/soldier";
import { STAGES, buildStage, hitsHp } from "../src/world/stages";

let fails = 0;
function check(name: string, ok: boolean, info: string) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — ${info}`); if (!ok) fails++; }
const ev = new Proxy({}, { get: () => () => {} }) as WorldEvents;
const fresh = () => {
  WALLET.chips = 0; WALLET.shards = 0; WALLET.shardsTaken.clear();
  WALLET.owned.clear(); WALLET.curse = null; commitEarnings();
};

// ------------------------------------------------------- death takes back earnings
fresh();
{
  WALLET.chips = 100; WALLET.shards = 1;
  earn(30); earn(8, 1, "s12-shard-a");
  const lost = forfeitEarnings();
  check("death takes back chips and shards earned since the checkpoint", WALLET.chips === 100 && WALLET.shards === 1 && lost.chips === 38 && lost.shards === 1, `chips=${WALLET.chips} shards=${WALLET.shards}`);
  check("a found shard goes back to its place", !WALLET.shardsTaken.has("s12-shard-a"), "");
  check("a second death takes nothing more", forfeitEarnings().chips === 0 && WALLET.chips === 100, "");
}
fresh();
{
  WALLET.chips = 50;
  earn(20); commitEarnings(); earn(5);
  forfeitEarnings();
  check("a checkpoint keeps what was earned before it", WALLET.chips === 70, `chips=${WALLET.chips}`);
}
fresh();
{
  WALLET.chips = 10;
  earn(40);
  WALLET.chips -= 45; // spent at a shop after the checkpoint
  forfeitEarnings();
  check("spending is never undone, chips never go negative", WALLET.chips === 0, `chips=${WALLET.chips}`);
}
fresh();
{
  WALLET.chips = 10;
  WALLET.chips += 60; WALLET.shards += 2; // boss reward: paid directly
  earn(7);
  forfeitEarnings();
  check("boss rewards are not taken back", WALLET.chips === 70 && WALLET.shards === 2, `chips=${WALLET.chips} shards=${WALLET.shards}`);
}

// ------------------------------------------------------- the shard pickup in the world
fresh();
{
  const st = STAGES.find((s) => s.id === 12)!;
  const L = st.build();
  L.spawns = [];
  L.shards = [{ x: 10, y: 10, id: "test-shard" }];
  const w = new World(L, ev);
  w.player.x = 10 * 16 + 8 - w.player.w / 2;
  w.player.y = 10 * 16 + 8 - 20;
  (w as any).archiveTick();
  check("a shard picked up in the world counts as earned", WALLET.shards === 1 && WALLET.shardsTaken.has("test-shard"), `shards=${WALLET.shards}`);
  forfeitEarnings();
  check("…and a death puts it back", WALLET.shards === 0 && !WALLET.shardsTaken.has("test-shard"), "");
}

// ------------------------------------------------------- a cleared encounter keeps its pay
fresh();
{
  const w = new World(buildStage(12), ev);
  const a = w.level.arenas.find((ar) => !ar.boss)!;
  w.activeArenas.add(a.group);
  earn(16);
  (w as any).checkArenas(); // still fighting
  forfeitEarnings();
  check("mid-encounter, a death still takes the pay", WALLET.chips === 0, `chips=${WALLET.chips}`);
  earn(16);
  w.clearedGroups.add(a.group);
  (w as any).checkArenas(); // the last one falls: the walls open
  forfeitEarnings();
  check("once the encounter is cleared, a death no longer takes its pay", WALLET.chips === 16 && !w.activeArenas.has(a.group), `chips=${WALLET.chips}`);
}

// ------------------------------------------------------- enemy health by stage
/** Hits to bring a soldier down through the real World code. */
function hitsToKill(w: World, s: Soldier, damage: () => Bullet): number {
  const hp0 = s.hp, st0 = s.state;
  let n = 0;
  while (s.alive && n < 50) { (w as any).hitSoldier(s, damage()); n++; }
  s.hp = hp0; s.state = st0;
  return n;
}
const cut = (w: World) => () => (w as any).meleeBullet(0, 0, 1, 1) as Bullet;
const sent = () => { const b = new Bullet(0, 0, 300, 0, "player"); b.damage = MOD.reflect(); return b; };

check("hitsHp: n hits with no gear", [2, 3, 4, 5, 6].every((n) => Math.ceil(hitsHp(n)) === n), [2, 3, 4, 5, 6].map((n) => hitsHp(n).toFixed(2)).join(" "));
check("STAGE 1 (the outskirts) keeps its built health", !STAGES.find((s) => s.id === 11)!.hits, "");
check("no stage makes the rifleman tougher", STAGES.every((s) => !s.hits?.rifle), "");

for (const st of STAGES) {
  fresh();
  const w = new World(buildStage(st.id), ev);
  const kinds = new Map<string, Soldier>();
  for (const s of w.soldiers) if (s.kind !== "kamikaze" && !kinds.has(s.kind)) kinds.set(s.kind, s);
  const tag = st.title.kick;
  const rifle = kinds.get("rifle");
  if (rifle) check(`${tag}: one plain sent-back bullet drops a rifleman`, hitsToKill(w, rifle, sent) === 1, `hp=${rifle.hp}`);
  for (const [kind, s] of kinds) {
    const want = st.hits?.[kind as keyof typeof st.hits];
    if (!want) continue;
    const base = hitsToKill(w, s, cut(w));
    const baseShot = hitsToKill(w, s, sent);
    WALLET.owned.add("edge"); WALLET.owned.add("coil");
    const edge = hitsToKill(w, s, cut(w));
    const coil = hitsToKill(w, s, sent);
    WALLET.owned.clear();
    check(`${tag} ${kind}: ${want} hits bare, one fewer with 예리한 날 / 자기장 코일`,
      base === want && baseShot === want && edge === want - 1 && coil === want - 1,
      `hp=${s.hp.toFixed(2)} cut ${base}→${edge}, shot ${baseShot}→${coil}`);
  }
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
