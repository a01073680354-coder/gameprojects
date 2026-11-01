// STAGE 1 "The Outskirts" (bible v3, 1-01 .. 1-08): the same night the
// prologue ends. A White Night recovery squad has come to burn what is left
// of Seoyun. Every basic control is taught on the way, by her things and by
// the squad, never by a paused tutorial window.
//   1-01 her loft room       move, jump, heal (her ampoules)
//   1-02 the barred door     slash, combo
//   1-03 the yard            parry, send bullets back
//   1-04 the burning shed    purple 危 (incinerator drone), dash, parry refills the dash
//   1-05 the shanty alley    drop through planks, the first checkpoint (a terminal)
//   1-06 the truck lot       a sealed fight, scrap chips
//   1-07 차승호               posture, the red "!", the deathblow that only disarms
// Tile rows: the ground is row 30 throughout; 16 px tiles.

import { Level, SOLID, ONEWAY, EMPTY, MAT } from "./level";

export function buildOutskirts(): Level {
  const W = 236, H = 40;
  const L = new Level(W, H);
  const S = SOLID, O = ONEWAY;
  const ground = (x0: number, x1: number, top = 30) => L.fill(x0, top, x1, H - 1, S);
  const plank = (x0: number, x1: number, y: number) => L.fill(x0, y, x1, y, O);
  L.theme = "outskirts";

  // ---------------------------------------------------------- 1-01 the house
  ground(0, 35);
  L.fill(0, 14, 1, 29, S);            // the back wall of the house
  L.fill(0, 14, 35, 15, S);           // the roof
  plank(2, 20, 23);                   // the loft floor: Seoyun's room
  L.fill(11, 21, 12, 22, S);          // a trunk to step over (the first jump)
  L.fill(34, 16, 35, 25, S);          // the front wall above the door
  L.rooms.push({ x0: 2, y0: 16, x1: 33, y1: 29, kind: "house" });
  L.spawnX = 4 * 16 + 8;
  L.spawnY = 23 * 16;
  L.startHp = 3;                      // an old body: the first thing he reaches for is her medicine
  L.notes.push(
    { x: 7, y: 23, id: "n-bench" },
    { x: 15, y: 23, id: "n-ampoule", gift: "ampoule" },
    { x: 18, y: 23, id: "n-photo" },
    { x: 26, y: 30, id: "n-note" },
    { x: 31, y: 30, id: "n-report" },
  );
  L.lessons.push({ x: 3, id: "move" }, { x: 8, id: "jump" }, { x: 14, id: "heal" });

  // ------------------------------------------------------- 1-02 the door
  // the squad stacked two drums in the doorway: one combo opens it
  L.props.push({ kind: "barrel", x: 34, y: 30, variant: 0 }, { kind: "barrel", x: 34, y: 28, variant: 2 });
  L.lessons.push({ x: 27, id: "slash" });

  // ------------------------------------------------------- 1-03 the yard
  ground(36, 99);
  L.checkpoints.push({ x: 38, y: 30 });
  L.fill(60, 28, 63, 29, S);          // a stack of Seoyun's crates; the rifleman stands on it
  L.props.push({ kind: "barrel", x: 54, y: 30, variant: 1 });
  L.lessons.push({ x: 41, id: "parry" });

  // -------------------------------------------------- 1-04 the burning shed
  L.fill(72, 20, 98, 21, S);          // shed roof
  L.fill(72, 22, 72, 25, S);          // left wall, door below
  L.fill(98, 22, 98, 25, S);          // right wall, door below
  L.rooms.push({ x0: 73, y0: 22, x1: 97, y1: 29, kind: "shed" });
  L.notes.push({ x: 81, y: 30, id: "n-notebook" });
  L.lessons.push({ x: 75, id: "peril" });
  // the ditch: too wide to jump, easy to dash; climb back out on the left
  L.fill(100, 30, 111, H - 1, EMPTY);
  L.fill(100, 37, 111, H - 1, S);
  L.fill(100, 34, 101, 36, S);        // a step to climb back
  L.lessons.push({ x: 95, id: "dash" });

  // ---------------------------------------------------- 1-05 the alley
  ground(112, 235);
  L.checkpoints.push({ x: 114, y: 30 }); // the undercity emergency terminal
  L.notes.push({ x: 116, y: 30, id: "n-terminal" });
  L.fill(118, 24, 124, 29, S);        // shack A: climb onto its tin roof
  plank(125, 136, 24);                // a plank walk... that ends at a wall
  L.fill(137, 12, 143, 25, S);        // house B above its passage
  L.lessons.push({ x: 128, id: "drop" });
  L.fill(150, 26, 156, 29, S);        // shack C: the rifleman's roof

  // --------------------------------------------------- 1-06 the truck lot
  L.checkpoints.push({ x: 160, y: 30 });
  L.fill(181, 27, 183, 29, S);        // crates off the truck's tailgate
  L.arenas.push({
    group: 4,
    trigger: 166,
    walls: [{ x: 162, y0: 14, y1: 29 }, { x: 197, y0: 14, y1: 29 }],
    entrance: false,
  });

  // ------------------------------------------------- 1-07 the main yard: 차승호
  L.checkpoints.push({ x: 200, y: 30 });
  plank(207, 211, 25);                // a carport roof to escape onto
  L.arenas.push({
    group: 7,
    trigger: 205,
    walls: [{ x: 202, y0: 10, y1: 29 }, { x: 233, y0: 10, y1: 29 }],
    entrance: false,
    boss: true,
  });
  L.boss = { x: 224, y: 30, group: 7, kind: "chief" };
  L.fill(234, 0, W - 1, H - 1, S);    // the stairs down to the undercity begin past here

  L.spawns.push(
    { kind: "collector", x: 47, y: 30, group: 1 },
    { kind: "rifle", x: 62, y: 28, group: 1 },

    { kind: "burner", x: 86, y: 26, group: 2 },

    { kind: "collector", x: 147, y: 30, group: 3 },
    { kind: "rifle", x: 153, y: 26, group: 3 },

    { kind: "collector", x: 174, y: 30, group: 4 },
    { kind: "burner", x: 177, y: 26, group: 4 },
    { kind: "rifle", x: 182, y: 27, group: 4 },
    { kind: "collector", x: 190, y: 30, group: 4 },
  );

  // what each structure is made of (painting only)
  L.setMat(0, 14, 1, 29, MAT.wood);
  L.setMat(0, 14, 35, 15, MAT.tin);
  L.setMat(11, 21, 12, 22, MAT.crate);
  L.setMat(34, 16, 35, 25, MAT.wood);
  L.setMat(60, 28, 63, 29, MAT.crate);
  L.setMat(72, 20, 98, 21, MAT.tin);
  L.setMat(72, 22, 72, 25, MAT.wood);
  L.setMat(98, 22, 98, 25, MAT.wood);
  L.setMat(100, 34, 101, 36, MAT.block);
  L.setMat(118, 24, 124, 29, MAT.tin);
  L.setMat(137, 12, 143, 25, MAT.block);
  L.setMat(150, 26, 156, 29, MAT.tin);
  L.setMat(181, 27, 183, 29, MAT.crate);
  L.setMat(234, 0, W - 1, H - 1, MAT.block);

  L.decos.push(
    // the house: loft and ground floor
    { kind: "bed", x: 3, y: 23 },
    { kind: "bench", x: 6, y: 23 },
    { kind: "shelf", x: 9, y: 18 },
    { kind: "window", x: 14, y: 17, w: 2, h: 3 },
    { kind: "medbox", x: 15, y: 23 },
    { kind: "frame", x: 18, y: 19 },
    { kind: "stove", x: 4, y: 30 },
    { kind: "table", x: 12, y: 30 },
    { kind: "window", x: 20, y: 25, w: 2, h: 2 },
    { kind: "coat", x: 25, y: 30 },
    { kind: "paper", x: 31, y: 27 },
    { kind: "tape", x: 34, y: 26, h: 4 },
    { kind: "bulb", x: 9, y: 16 },
    { kind: "bulb", x: 24, y: 24 },
    // outside: the yard
    { kind: "pole", x: 40, y: 30 },
    { kind: "crates", x: 49, y: 30 },
    { kind: "fence", x: 56, y: 30, w: 4 },
    { kind: "pole", x: 67, y: 30 },
    // the shed burning
    { kind: "fire", x: 77, y: 30, w: 3 },
    { kind: "bench", x: 80, y: 30 },
    { kind: "fire", x: 83, y: 30, w: 2 },
    { kind: "fire", x: 92, y: 30, w: 3 },
    { kind: "fire", x: 85, y: 20, w: 4 },
    // the alley
    { kind: "terminal", x: 115, y: 30 },
    { kind: "pole", x: 117, y: 30 },
    { kind: "laundry", x: 127, y: 19, w: 8 },
    { kind: "neighbor", x: 138, y: 18, w: 2, h: 3 },
    { kind: "window", x: 141, y: 19, w: 2, h: 2 },
    { kind: "pole", x: 146, y: 30 },
    // the truck lot
    { kind: "truck", x: 168, y: 30 },
    { kind: "beaconlight", x: 175, y: 21 },
    { kind: "pole", x: 193, y: 30 },
    // the main yard, and the way down
    { kind: "pole", x: 214, y: 30 },
    { kind: "fence", x: 226, y: 30, w: 6 },
    { kind: "stairsign", x: 231, y: 24 },
  );
  return L;
}
