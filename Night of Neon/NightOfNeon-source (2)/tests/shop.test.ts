// Gear from the shops changes the numbers it promises, and nothing else.
import { buildStage1 } from "../src/world/stage1";
import { World, WorldEvents } from "../src/sim/world";
import { WALLET, MOD, damageTaken } from "../src/sim/loadout";
import { Bullet } from "../src/sim/bullet";
import { InputFrame } from "../src/core/input";
import { TUNE } from "../src/config";

let fails = 0;
function check(name: string, ok: boolean, info: string) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — ${info}`); if (!ok) fails++; }
const ev = new Proxy({}, { get: () => () => {} }) as WorldEvents;
const I = (o: Partial<InputFrame> = {}): InputFrame => ({ x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, parryPressed: false, aimX: 0, aimY: 0, ...o });
const fresh = () => { WALLET.owned.clear(); WALLET.curse = null; WALLET.gripBank = WALLET.sealBank = 0; WALLET.shields = WALLET.batteries = WALLET.concentrated = 0; };

fresh();
check("no gear: everything at x1", MOD.slash() === 1 && MOD.reflect() === 1 && MOD.posture() === 1 && MOD.perfect() === 1 && MOD.maxHp() === 0, "");
WALLET.owned.add("edge"); WALLET.owned.add("coil");
{
  const L = buildStage1(); L.spawns = [];
  const w = new World(L, ev);
  const b = (w as any).meleeBullet(0, 0, 1, 1) as Bullet;
  check("예리한 날: slash damage x1.1", Math.abs(b.damage - 1.1) < 1e-9, String(b.damage));
  const u = new Bullet(w.player.cx + 10, w.player.y + 20, -100, 0, "enemy");
  w.bullets.push(u);
  (w as any).deflect(u, false, false);
  check("자기장 코일: reflected bullets x1.15", Math.abs(u.damage - 1.15) < 1e-9, String(u.damage));
}
fresh(); WALLET.owned.add("grip");
{
  let absorbed = 0;
  for (let i = 0; i < 20; i++) if (damageTaken().absorbed) absorbed++;
  check("충격 흡수 손잡이: 2 of 20 hits absorbed (-10%)", absorbed === 2, String(absorbed));
}
fresh(); WALLET.curse = "seal";
{
  let extra = 0;
  for (let i = 0; i < 20; i++) if (damageTaken().extra) extra++;
  check("처형인의 인장: 3 of 20 hits hurt double (+15%)", extra === 3 && MOD.posture() === 1.25, `extra=${extra}`);
}
fresh(); WALLET.curse = "manual";
{
  const L = buildStage1(); L.spawns = [];
  const w = new World(L, ev);
  check("무명의 교본: perfect window x1.6, two cells less", MOD.perfect() === 1.6 && w.player.maxHp === 3 && w.player.hp === 3, `max=${w.player.maxHp}`);
}
fresh(); WALLET.curse = "backflow";
{
  const L = buildStage1(); L.spawns = [];
  const w = new World(L, ev);
  check("역류 코어: one ampoule less", w.player.maxAmpoules === 1 && MOD.reflect() === 1.35, `amp=${w.player.maxAmpoules}`);
}
fresh(); WALLET.owned.add("capacitor");
{
  const L = buildStage1(); L.spawns = [];
  const w = new World(L, ev);
  for (let i = 0; i < 10; i++) w.step(I());
  const p = w.player;
  p.parryHit = true;
  w.step(I());
  w.step(I({ x: 1, dashPressed: true }));
  check("축전 장치: a dash right after a parry runs 20% longer", Math.abs(p.dashTimer - TUNE.dashTime * 1.2) < STEPS(), `timer=${p.dashTimer.toFixed(3)} base=${TUNE.dashTime}`);
}
function STEPS() { return 1 / 60 + 1e-6; }
fresh(); WALLET.shields = 1; WALLET.batteries = 1;
{
  const L = buildStage1(); L.spawns = [];
  const w = new World(L, ev);
  (w as any).armFight();
  const p = w.player;
  const hp = p.hp;
  p.hurt(p.cx + 10);
  check("보호막 + 고속 축전지: the first hit is blocked, the dash refills", p.hp === hp && p.rapidT > 7 && WALLET.shields === 0 && WALLET.batteries === 0, `hp ${hp}→${p.hp} rapid=${p.rapidT}`);
}
fresh();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
process.exit(fails ? 1 : 0);
