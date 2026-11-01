// Stage 2 "Neon Spire": inside the tower. Ceilings press down, machine walls
// rise behind everything, and the new threat is the kamikaze drone: it
// sees you, screams "!", rams you and blows. Only a dash goes through the
// blast. The climb ends in a sealed shaft where the Assassin waits on the
// walls.

import { Level, SOLID, ONEWAY } from "./level";

export function buildStage2(): Level {
  const W = 252, H = 40;
  const L = new Level(W, H);
  const S = SOLID, O = ONEWAY;
  const floor = (x0: number, x1: number, top: number) => L.fill(x0, top, x1, H - 1, S);
  const ceil = (x0: number, x1: number, bottom: number) => L.fill(x0, 0, x1, bottom, S);
  const walk = (x0: number, x1: number, y: number) => L.fill(x0, y, x1, y, O);
  L.theme = "tower";

  // S0 arrival hall: a tall bay where the service lift lets you out
  floor(0, 34, 30);
  ceil(0, 34, 15);
  L.spawnX = 4 * 16 + 8;
  L.spawnY = 30 * 16;
  L.props.push({ kind: "barrel", x: 12, y: 30, variant: 1 }, { kind: "sign", x: 16, y: 30, variant: 1 });
  L.hints.push({ x: 27, y: 25, kind: "dash" });

  // S1 service corridor: the first kamikaze, alone, in a straight line
  floor(35, 62, 30);
  ceil(35, 62, 20);
  L.checkpoints.push({ x: 37, y: 30 });
  L.props.push({ kind: "barrel", x: 58, y: 30, variant: 2 });

  // S2 machine hall: a lift pit, two catwalks, a crossfire
  ceil(63, 100, 6);
  floor(63, 69, 30);
  floor(76, 100, 30); // pit x70-75
  walk(80, 86, 25);
  walk(88, 94, 20);
  L.props.push({ kind: "sign", x: 79, y: 30, variant: 0 }, { kind: "barrel", x: 90, y: 30 });

  // S3 the climb toward the server floor
  floor(101, 106, 27);
  floor(107, 112, 24);
  walk(113, 118, 20);
  ceil(101, 118, 6);
  floor(119, 172, 17);
  ceil(119, 145, 8);
  L.checkpoints.push({ x: 121, y: 17 });
  L.props.push({ kind: "barrel", x: 131, y: 17, variant: 1 }, { kind: "sign", x: 127, y: 17, variant: 2 });

  // S4 server corridor: low ceiling, cover, drones coming down the line
  ceil(146, 172, 10);
  L.props.push({ kind: "barrel", x: 151, y: 17 }, { kind: "barrel", x: 159, y: 17, variant: 2 }, { kind: "sign", x: 167, y: 17, variant: 0 });

  // S5 drop into the coolant bay: an ambush
  floor(173, 178, 22);
  ceil(173, 178, 10);
  floor(179, 216, 28);
  ceil(179, 216, 12);
  L.checkpoints.push({ x: 181, y: 28 });
  L.arenas.push({
    group: 6,
    trigger: 186,
    walls: [{ x: 180, y0: 13, y1: 27 }, { x: 209, y0: 13, y1: 27 }],
    entrance: true,
  });
  L.props.push({ kind: "barrel", x: 192, y: 28, variant: 1 }, { kind: "barrel", x: 200, y: 28 });
  L.checkpoints.push({ x: 213, y: 28 });
  L.shops.push({ x: 210, y: 28, kind: "supply", id: "s2-supply" });
  L.shards.push({ x: 91, y: 18, id: "s2-shard-a" }, { x: 115, y: 18, id: "s2-shard-b" });

  // S6 the shaft: sheer walls for the Assassin to cling to
  L.fill(217, 0, 218, 23, S); // left wall, a door at the bottom (rows 24-27)
  L.fill(217, 28, 218, H - 1, S); // threshold
  floor(219, 249, 28);
  ceil(219, 249, 7);
  L.fill(250, 0, W - 1, H - 1, S);
  L.arenas.push({
    group: 7,
    trigger: 221,
    walls: [{ x: 218, y0: 24, y1: 27 }, { x: 249, y0: 8, y1: 27 }],
    entrance: false,
    boss: true,
  });
  L.boss = { x: 240, y: 28, group: 7, kind: "assassin" };

  L.spawns.push(
    { kind: "kamikaze", x: 50, y: 25, group: 1 },

    { kind: "rifle", x: 91, y: 20, group: 2 },
    { kind: "kamikaze", x: 84, y: 18, group: 2 },
    { kind: "kamikaze", x: 97, y: 22, group: 2 },
    { kind: "heavy", x: 96, y: 30, group: 2, pattern: "slug" },

    { kind: "drone", x: 110, y: 12, group: 3, pattern: "orbPair" },
    { kind: "kamikaze", x: 125, y: 12, group: 3 },

    { kind: "blade", x: 137, y: 17, group: 4 },
    { kind: "kamikaze", x: 142, y: 12, group: 4 },

    { kind: "burst", x: 163, y: 17, group: 5 },
    { kind: "kamikaze", x: 155, y: 13, group: 5 },
    { kind: "kamikaze", x: 169, y: 13, group: 5 },

    { kind: "blade", x: 196, y: 28, group: 6 },
    { kind: "rifle", x: 205, y: 28, group: 6 },
    { kind: "kamikaze", x: 189, y: 19, group: 6 },
    { kind: "kamikaze", x: 196, y: 16, group: 6 },
    { kind: "kamikaze", x: 203, y: 19, group: 6 },
  );

  L.decos.push(
    { kind: "sign", x: 6, y: 20, w: 4, h: 3 },
    { kind: "lamp", x: 9, y: 29 },
    { kind: "vent", x: 21, y: 29 },
    { kind: "facesign", x: 29, y: 17, w: 3, h: 6 },
    { kind: "lamp", x: 44, y: 29 },
    { kind: "sign", x: 53, y: 22, w: 3, h: 2 },
    { kind: "lamp", x: 66, y: 29 },
    { kind: "sign", x: 83, y: 9, w: 5, h: 3 },
    { kind: "vent", x: 98, y: 29 },
    { kind: "lamp", x: 104, y: 26 },
    { kind: "sign", x: 124, y: 10, w: 3, h: 3 },
    { kind: "lamp", x: 134, y: 16 },
    { kind: "vent", x: 143, y: 16 },
    { kind: "lamp", x: 150, y: 16 },
    { kind: "sign", x: 160, y: 12, w: 4, h: 2 },
    { kind: "lamp", x: 170, y: 16 },
    { kind: "lamp", x: 184, y: 27 },
    { kind: "sign", x: 193, y: 15, w: 5, h: 3 },
    { kind: "vent", x: 206, y: 27 },
    { kind: "lamp", x: 214, y: 27 },
    { kind: "facesign", x: 232, y: 10, w: 4, h: 7 },
  );
  return L;
}
