// Stage 3 "The Forgotten Archive": the secret vault where the White Night
// keeps everyone it erased. Galleries of memory capsules, reading shelves to
// climb, security lasers that blink on and off (purple: no parry, time it or
// dash through), and ceiling turrets out of sword reach (send their bullets
// back). Record fragments float along the way; the last one is Dojin's own.
// It ends in the Vault, where the Archivist hangs in his pod.

import { Level, SOLID, ONEWAY, EMPTY, FAKE } from "./level";

export function buildStage3(): Level {
  const W = 256, H = 40;
  const L = new Level(W, H);
  const S = SOLID, O = ONEWAY;
  const floor = (x0: number, x1: number, top: number) => L.fill(x0, top, x1, H - 1, S);
  const ceil = (x0: number, x1: number, bottom: number) => L.fill(x0, 0, x1, bottom, S);
  const shelf = (x0: number, x1: number, y: number) => L.fill(x0, y, x1, y, O);
  L.theme = "archive";

  // S0 through the server door: a quiet antechamber
  floor(0, 30, 30);
  ceil(0, 30, 15);
  L.spawnX = 4 * 16 + 8;
  L.spawnY = 30 * 16;
  L.records.push({ x: 20, y: 27, id: "r-citizen1" });
  L.props.push({ kind: "sign", x: 12, y: 30, variant: 1 });

  // S1 the gallery: two reading shelves, a turret in the vault of the ceiling
  floor(31, 76, 30);
  ceil(31, 76, 11);
  shelf(40, 47, 25);
  shelf(52, 60, 21);
  shelf(64, 71, 25);
  L.checkpoints.push({ x: 33, y: 30 });
  L.records.push({ x: 56, y: 18, id: "r-citizen2" });
  L.props.push({ kind: "barrel", x: 49, y: 30 }, { kind: "barrel", x: 73, y: 30, variant: 2 });

  // S2 the security corridor: three laser doors out of step with each other
  floor(77, 112, 30);
  ceil(77, 112, 21);
  L.checkpoints.push({ x: 79, y: 30 });
  L.gates.push(
    { x: 85, y0: 22, y1: 29, period: 2.4, duty: 0.5, offset: 0 },
    { x: 94, y0: 22, y1: 29, period: 2.4, duty: 0.5, offset: 0.8 },
    { x: 103, y0: 22, y1: 29, period: 1.8, duty: 0.55, offset: 1.2 },
  );
  L.records.push({ x: 109, y: 27, id: "r-citizen3" });
  L.hints.push({ x: 82, y: 25, kind: "dash" });

  // S3 the stacks: climb the reading shelves toward the upper gallery
  floor(113, 120, 27);
  shelf(122, 127, 23);
  shelf(130, 135, 19);
  floor(137, 186, 16);
  ceil(113, 186, 3);
  L.fill(113, 4, 113, 20, S); // the stack's end wall
  L.records.push({ x: 132, y: 16, id: "r-citizen4" });
  // the hidden room behind the stack's end wall: the Forgotten Bazaar.
  // A ledge off the lowest shelf, a crack that leaks violet light, a wall that isn't there.
  L.fill(103, 14, 111, 20, EMPTY);
  L.fill(112, 17, 113, 20, FAKE);
  L.fill(114, 21, 118, 21, ONEWAY);
  L.shops.push({ x: 107, y: 21, kind: "bazaar", id: "s3-bazaar" });
  L.shards.push({ x: 116, y: 19, id: "s3-shard-a" }, { x: 68, y: 23, id: "s3-shard-b" });
  L.decos.push({ kind: "crack", x: 113, y: 18 });
  L.checkpoints.push({ x: 139, y: 16 });

  // S4 the turret hall: a high ceiling bristling with guns, one more laser door
  L.gates.push({ x: 168, y0: 9, y1: 15, period: 2.0, duty: 0.45, offset: 0.3 });
  L.props.push({ kind: "barrel", x: 158, y: 16, variant: 1 }, { kind: "sign", x: 176, y: 16, variant: 0 });
  L.records.push({ x: 183, y: 13, id: "r-truth" });

  // S5 the sorting floor: drop down into an ambush
  floor(187, 217, 28);
  ceil(187, 216, 10);
  L.checkpoints.push({ x: 189, y: 28 });
  L.arenas.push({
    group: 6,
    trigger: 193,
    walls: [{ x: 188, y0: 11, y1: 27 }, { x: 213, y0: 11, y1: 27 }],
    entrance: true,
  });
  L.props.push({ kind: "barrel", x: 199, y: 28, variant: 2 }, { kind: "barrel", x: 206, y: 28 });
  L.checkpoints.push({ x: 215, y: 28 });
  L.shops.push({ x: 216, y: 28, kind: "supply", id: "s3-supply" });

  // S6 the Vault: a tall round chamber; the Archivist hangs at its heart
  L.fill(218, 0, 219, 23, S);
  L.fill(218, 28, 219, H - 1, S);
  floor(220, 251, 28);
  ceil(220, 251, 2);
  L.fill(252, 0, W - 1, H - 1, S);
  shelf(224, 229, 22);
  shelf(242, 247, 22);
  shelf(233, 238, 17);
  L.arenas.push({
    group: 7,
    trigger: 223,
    walls: [{ x: 219, y0: 24, y1: 27 }, { x: 251, y0: 3, y1: 27 }],
    entrance: false,
    boss: true,
  });
  L.boss = { x: 235, y: 28, group: 7, kind: "archivist" };

  L.spawns.push(
    { kind: "rifle", x: 57, y: 21, group: 1 },
    { kind: "turret", x: 62, y: 12, group: 1 },

    { kind: "drone", x: 100, y: 24, group: 2, pattern: "orbPair" },

    { kind: "turret", x: 125, y: 4, group: 3 },
    { kind: "kamikaze", x: 133, y: 10, group: 3 },
    { kind: "burst", x: 146, y: 16, group: 3 },

    { kind: "turret", x: 154, y: 4, group: 4 },
    { kind: "turret", x: 163, y: 4, group: 4 },
    { kind: "heavy", x: 172, y: 16, group: 4, pattern: "slugFan" },
    { kind: "turret", x: 178, y: 4, group: 4 },

    { kind: "blade", x: 203, y: 28, group: 6 },
    { kind: "burst", x: 209, y: 28, group: 6 },
    { kind: "turret", x: 197, y: 11, group: 6 },
    { kind: "turret", x: 207, y: 11, group: 6 },
    { kind: "kamikaze", x: 200, y: 20, group: 6 },
  );

  L.decos.push(
    { kind: "lamp", x: 8, y: 29 },
    { kind: "facesign", x: 24, y: 18, w: 3, h: 5 },
    { kind: "lamp", x: 38, y: 29 },
    { kind: "sign", x: 45, y: 14, w: 4, h: 3 },
    { kind: "lamp", x: 62, y: 29 },
    { kind: "vent", x: 75, y: 29 },
    { kind: "lamp", x: 88, y: 29 },
    { kind: "sign", x: 98, y: 23, w: 3, h: 2 },
    { kind: "lamp", x: 110, y: 29 },
    { kind: "lamp", x: 118, y: 26 },
    { kind: "lamp", x: 141, y: 15 },
    { kind: "sign", x: 150, y: 7, w: 5, h: 3 },
    { kind: "lamp", x: 160, y: 15 },
    { kind: "vent", x: 171, y: 15 },
    { kind: "lamp", x: 180, y: 15 },
    { kind: "lamp", x: 192, y: 27 },
    { kind: "sign", x: 201, y: 15, w: 4, h: 3 },
    { kind: "lamp", x: 211, y: 27 },
  );
  return L;
}
