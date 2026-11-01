// STAGE 2 "The Undercity Market" (bible v3, 2-01 .. 2-08). Under the
// overpass, where people without a citizen number still trade in cash and
// scrap. The first stage with people who do not fight: vendors, a queue for
// the power ration, a woman with chalk at the name wall, a child, 강만식 at
// his forge. Then the White Night search squad seals the market, and a
// remote riot machine, '방벽', stands between him and the freight lift.
//   2-01 the stairs down, the shadow market      the power ration queue, a brownout
//   2-02 the name wall                           W: write 백서윤; a wall that isn't (◈)
//   2-03 Ghost Supply 0                          the shop, Seoyun's recording
//   2-04 the Last Forge                          강만식; the Bazaar's shutter, closed
//   2-05 five shadows                            signs only, one each, no lectures
//   2-06 the raid                                one hides him, one gives him away
//   2-07 방벽 at the freight lift                 aim the bullets home: the cooling vent
//   2-08 up                                      Manshik on the radio
// Tile rows: the market floor is row 30; the overpass deck is rows 15-18.

import { Level, SOLID, ONEWAY, FAKE, MAT } from "./level";

export function buildMarket(): Level {
  const W = 268, H = 36;
  const L = new Level(W, H);
  const S = SOLID, O = ONEWAY;
  const ground = (x0: number, x1: number, top = 30) => L.fill(x0, top, x1, H - 1, S);
  const plank = (x0: number, x1: number, y: number) => L.fill(x0, y, x1, y, O);
  L.theme = "market";

  // ------------------------------------------------- 2-01 the stairs down
  // from the edge of the outskirts: a landing in the rain, then concrete steps
  L.fill(0, 18, 5, H - 1, S);
  for (let i = 0; i < 11; i++) L.fill(6 + i * 2, 19 + i, 7 + i * 2, H - 1, S);
  L.spawnX = 3 * 16 + 8;
  L.spawnY = 18 * 16;
  ground(28, W - 1);

  // the overpass deck overhead; where its slabs are missing, a steel grating
  // lets the rain through. The abutments at both ends rise past any jump, so
  // nobody walks the road above.
  L.fill(22, 15, 213, 18, S);
  for (const [x0, x1] of [[22, 63], [70, 149], [158, 213]]) L.rooms.push({ x0, y0: 19, x1, y1: 29, kind: "cover" });
  L.fill(22, 0, 24, 14, S);
  L.fill(211, 0, 213, 14, S);

  // the shadow market: stalls with awnings you can hop on, crates
  L.checkpoints.push({ x: 30, y: 30 });
  plank(32, 38, 26);                  // the noodle stall's awning
  plank(45, 51, 25);                  // the parts stall's awning
  L.fill(52, 28, 53, 29, S);          // crates of salvage
  L.notes.push({ x: 57, y: 30, id: "m-ration", label: "배급표 보기" });

  // ---------------------------------------------------- 2-02 the name wall
  L.notes.push({ x: 80, y: 30, id: "w-namewall", label: "이름 적기" });
  // a shuttered shop; its left wall is not a wall, and behind it, a memory shard
  L.fill(90, 25, 101, 29, S);
  L.fill(91, 26, 94, 29, 0);
  L.fill(90, 26, 90, 29, FAKE);
  L.secrets.push({ x0: 90, y0: 26, x1: 94, y1: 29 });
  L.shards.push({ x: 93, y: 28, id: "s12-shard-a" });

  // --------------------------------------------------- 2-03 Ghost Supply 0
  L.checkpoints.push({ x: 104, y: 30 });
  L.shops.push({ x: 111, y: 30, kind: "supply", id: "s12-supply" });

  // ----------------------------------------------------- 2-04 the Last Forge
  L.fill(116, 28, 117, 29, S);        // a step of scrap
  L.shops.push({ x: 136, y: 30, kind: "forge", id: "s12-forge" });
  L.notes.push({ x: 143, y: 30, id: "m-bazaar", label: "셔터 두드리기" });

  // -------------------------------------------------------- 2-06 the raid
  L.checkpoints.push({ x: 158, y: 30 });
  L.fill(179, 28, 181, 29, S);        // crates
  plank(186, 197, 25);                // a walkway over the shutters
  L.fill(203, 27, 204, 29, S);        // a stack of crates
  L.arenas.push({
    group: 6,
    trigger: 170,
    walls: [{ x: 167, y0: 19, y1: 29 }, { x: 212, y0: 19, y1: 29 }],
    entrance: false,
  });
  L.spawns.push(
    { kind: "rifle", x: 184, y: 30, group: 6 },
    { kind: "drone", x: 178, y: 22, group: 6 },
    { kind: "burst", x: 192, y: 25, group: 6 },
    { kind: "blade", x: 199, y: 30, group: 6 },
    { kind: "drone", x: 196, y: 21, group: 6 },
    { kind: "rifle", x: 204, y: 27, group: 6 },
  );

  // --------------------------------------------- 2-07 the freight yard: 방벽
  L.checkpoints.push({ x: 217, y: 30 });
  plank(223, 229, 25);                // catwalks on both sides
  plank(251, 257, 25);
  plank(237, 243, 21);                // and one high over the middle
  L.arenas.push({
    group: 8,
    trigger: 224,
    walls: [{ x: 221, y0: 8, y1: 29 }, { x: 259, y0: 8, y1: 29 }],
    entrance: false,
    boss: true,
  });
  L.boss = { x: 243, y: 30, group: 8, kind: "bulwark" };
  // the freight lift's shaft beyond
  L.fill(266, 0, W - 1, H - 1, S);

  // what things are made of
  L.setMat(0, 18, 27, H - 1, MAT.block);   // the landing and the steps
  L.setMat(22, 15, 213, 18, MAT.deck);
  L.setMat(64, 15, 69, 18, MAT.grate);
  L.setMat(150, 15, 157, 18, MAT.grate);
  L.setMat(22, 0, 24, 14, MAT.deck);
  L.setMat(211, 0, 213, 14, MAT.deck);
  L.setMat(52, 28, 53, 29, MAT.crate);
  L.setMat(90, 25, 101, 29, MAT.block);
  L.setMat(116, 28, 117, 29, MAT.crate);
  L.setMat(179, 28, 181, 29, MAT.crate);
  L.setMat(203, 27, 204, 29, MAT.crate);
  L.setMat(266, 0, W - 1, H - 1, MAT.block);

  // the people of the market
  L.npcs.push(
    { x: 35, y: 30, who: "noodle", facing: 1, line: "s12-noodle" },
    { x: 49, y: 30, who: "parts", facing: -1, line: "s12-parts" },
    { x: 59, y: 30, who: "queueA", facing: -1, line: "s12-ration" },
    { x: 61, y: 30, who: "queueB", facing: -1 },
    { x: 63, y: 30, who: "queueC", facing: -1 },
    { x: 75, y: 30, who: "chalk", facing: 1, line: "s12-chalk" },
    { x: 85, y: 30, who: "kid", facing: -1 },
    { x: 121, y: 30, who: "edenA", facing: -1, line: "s12-eden" },
    { x: 123, y: 30, who: "edenB", facing: -1 },
    { x: 125, y: 30, who: "edenC", facing: -1 },
    { x: 132, y: 30, who: "kang", facing: 1 },
    { x: 163, y: 30, who: "hider", facing: 1 },
    { x: 175, y: 30, who: "youth", facing: -1 },
  );

  L.decos.push(
    // the stairs in the rain
    { kind: "rail", x: 6, y: 19, w: 22 },
    { kind: "stairsign", x: 4, y: 18 },
    // under the deck: hanging lights, cables, piers
    { kind: "pier", x: 40, y: 19, w: 2 },
    { kind: "pier", x: 112, y: 19, w: 2 },
    { kind: "pier", x: 176, y: 19, w: 2 },
    { kind: "cables", x: 22, y: 19, w: 42 },
    { kind: "cables", x: 70, y: 19, w: 80 },
    { kind: "cables", x: 158, y: 19, w: 56 },
    // 2-01 stalls
    { kind: "noodlestall", x: 32, y: 30, w: 7 },
    { kind: "yeonmu", x: 42, y: 21, w: 5, h: 4 },        // 연무 의원 (2-05)
    { kind: "door", x: 43, y: 30 },
    { kind: "partsstall", x: 45, y: 30, w: 7 },
    { kind: "rationboard", x: 55, y: 20, w: 5, h: 5 },   // 권하린 배급표 (2-05)
    { kind: "lantern", x: 33, y: 19 }, { kind: "lantern", x: 37, y: 19 }, { kind: "lantern", x: 47, y: 19 },
    { kind: "lantern", x: 51, y: 19 }, { kind: "lantern", x: 58, y: 19 },
    { kind: "neon", x: 26, y: 21, w: 3, h: 2, variant: 0 },
    // 2-02 the name wall and the shop that isn't one
    { kind: "namewall", x: 72, y: 19, w: 16, h: 11 },
    { kind: "lantern", x: 79, y: 19 },
    { kind: "crate", x: 86, y: 30 },
    { kind: "shutter", x: 95, y: 26, w: 5, h: 4 },
    { kind: "crack", x: 90, y: 27 },
    // 2-03
    { kind: "terminal", x: 105, y: 30 },
    { kind: "lantern", x: 109, y: 19 },
    // 2-04 Eden's queue and the forge
    { kind: "eden", x: 119, y: 20, w: 6, h: 5 },          // 에덴 광고 (2-05)
    { kind: "anvil", x: 133, y: 30 },
    { kind: "lantern", x: 130, y: 19 }, { kind: "lantern", x: 139, y: 19 },
    { kind: "bazaarshut", x: 141, y: 25, w: 5, h: 5 },
    { kind: "neon", x: 128, y: 21, w: 3, h: 2, variant: 1 },
    // 2-05 the Laplace gate in the rain gap
    { kind: "laplace", x: 151, y: 22, w: 5, h: 8 },       // 라플라스 3.1% 안내 (2-05)
    { kind: "terminal", x: 159, y: 30 },
    // 2-06 shutters, the doorway she hides him in, the one-armed mark
    { kind: "shutter", x: 160, y: 25, w: 2, h: 5 },
    { kind: "doorway", x: 162, y: 25, w: 2, h: 5 },
    { kind: "shutter", x: 170, y: 25, w: 4, h: 5 },
    { kind: "shutter", x: 183, y: 26, w: 3, h: 4 },
    { kind: "shutter", x: 199, y: 26, w: 3, h: 4 },
    { kind: "muyeong", x: 206, y: 20, w: 5, h: 5 },       // 외팔 문양 · 무영은 돌아온다 (2-05)
    { kind: "lantern", x: 166, y: 19 }, { kind: "lantern", x: 190, y: 19 }, { kind: "lantern", x: 206, y: 19 },
    // 2-07 the freight yard, the lift
    { kind: "terminal", x: 218, y: 30 },
    { kind: "floodlight", x: 222, y: 17 }, { kind: "floodlight", x: 257, y: 17 },
    { kind: "lift", x: 259, y: 30, w: 7 },
  );
  return L;
}
