// Stage 1 "Neon Rooftops": no wall-climbing. Every height change is a
// jump (<= 6 tiles), a one-way catwalk, or a drop; gaps need a run-up
// jump, an air dash, or a parry that refunds the dash. Two tunnels under
// tower blocks are barricaded with drum barrels that must be cut open.

import { Level, SOLID, ONEWAY } from "./level";

export function buildStage1(): Level {
  const W = 276, H = 42;
  const L = new Level(W, H);
  const S = SOLID, O = ONEWAY;
  // a rooftop is a building mass from its roof down past the bottom
  const roof = (x0: number, x1: number, top: number) => L.fill(x0, top, x1, H - 1, S);
  const walk = (x0: number, x1: number, y: number) => L.fill(x0, y, x1, y, O);

  // S0 start roof (safe). A tower block sits on it; its ground-floor
  // passage (4 tiles high) is barricaded: the first lesson is the cut.
  roof(0, 22, 30);
  L.fill(12, 0, 17, 25, S);
  L.spawnX = 5 * 16 + 8;
  L.spawnY = 30 * 16;
  // a stack of two drums fills the 4-tile passage: one two-hit combo clears it
  L.props.push({ kind: "barrel", x: 14, y: 30 }, { kind: "barrel", x: 14, y: 28, variant: 1 });
  L.props.push({ kind: "sign", x: 8, y: 30, variant: 0 });
  L.hints.push({ x: 12, y: 27, kind: "slash" });
  // pit x23-28: first jump

  // S1 first contact: one rifleman, a barrel to hide behind
  roof(29, 50, 30);
  L.checkpoints.push({ x: 31, y: 30 });
  L.props.push({ kind: "barrel", x: 39, y: 30, variant: 2 }, { kind: "sign", x: 34, y: 30, variant: 1 });
  L.hints.push({ x: 36, y: 25, kind: "parry" });

  // S2 climb into a crossfire
  roof(51, 55, 27);
  roof(56, 60, 24);
  roof(62, 78, 20);
  walk(66, 71, 15); // billboard catwalk
  L.props.push({ kind: "sign", x: 58, y: 24, variant: 2 }, { kind: "sign", x: 63, y: 20, variant: 0 });

  // S3 the long gap (x79-90) with a drone above it: needs a dash, or a parried orb to get one back
  roof(91, 125, 24);
  L.checkpoints.push({ x: 93, y: 24 });
  L.fill(100, 21, 103, 23, S); // AC unit cover
  walk(107, 112, 19);
  L.props.push({ kind: "barrel", x: 98, y: 24 }, { kind: "sign", x: 96, y: 24, variant: 1 }, { kind: "sign", x: 105, y: 24, variant: 2 });
  L.props.push({ kind: "sign", x: 123, y: 24, variant: 0 });

  // S5 catwalks over the void
  walk(126, 130, 26);
  walk(134, 138, 23);
  walk(142, 146, 26);

  // S6 arena: sealed by energy walls, the squad drops in by dropship
  roof(151, 200, 28);
  L.checkpoints.push({ x: 153, y: 28 });
  L.fill(166, 23, 169, 27, S); // 5 tiles: jumpable cover
  L.fill(194, 0, 198, 23, S); // exit tower, tunnel barricaded
  L.props.push(
    { kind: "barrel", x: 196, y: 28 }, { kind: "barrel", x: 196, y: 26, variant: 2 },
    { kind: "barrel", x: 197, y: 28, variant: 1 }, { kind: "barrel", x: 197, y: 26 },
  );
  L.props.push({ kind: "barrel", x: 176, y: 28, variant: 2 }, { kind: "barrel", x: 177, y: 28 });
  L.props.push({ kind: "sign", x: 156, y: 28, variant: 2 }, { kind: "sign", x: 183, y: 28, variant: 1 });
  L.arenas.push({
    group: 6,
    trigger: 158,
    walls: [{ x: 152, y0: 0, y1: 27 }, { x: 193, y0: 24, y1: 27 }],
    entrance: true,
  });

  // S7 final climb to the heliport
  roof(201, 205, 25);
  walk(208, 212, 21);
  roof(215, W - 1, 17);
  // the billboard above the heliport: it has been watching
  L.teaser = { x: 249, y: 6, trigger: 213 };
  // shops: the Last Forge behind the second rooftop, a Ghost Supply before the heliport
  L.shops.push({ x: 95, y: 24, kind: "forge", id: "s1-forge" }, { x: 227, y: 17, kind: "supply", id: "s1-supply" });
  L.shards.push({ x: 70, y: 13, id: "s1-shard-a" }, { x: 112, y: 17, id: "s1-shard-b" });
  L.checkpoints.push({ x: 224, y: 17 });
  L.props.push({ kind: "sign", x: 203, y: 25, variant: 0 }, { kind: "sign", x: 218, y: 17, variant: 2 });

  // BOSS: 홍귀 on the heliport. Two drop-through ledges to escape onto.
  walk(236, 240, 12);
  walk(259, 263, 12);
  L.arenas.push({
    group: 7,
    trigger: 233,
    walls: [{ x: 230, y0: 0, y1: 16 }, { x: 269, y0: 0, y1: 16 }],
    entrance: false,
    boss: true,
  });
  L.boss = { x: 261, y: 17, group: 7 };

  L.spawns.push(
    { kind: "rifle", x: 45, y: 30, group: 1 },

    { kind: "blade", x: 74, y: 20, group: 2 },
    { kind: "rifle", x: 69, y: 15, group: 2 },

    { kind: "drone", x: 85, y: 14, group: 3, pattern: "orbPair" },

    { kind: "heavy", x: 119, y: 24, group: 4, pattern: "slugFan" },
    { kind: "rifle", x: 110, y: 19, group: 4 },

    { kind: "drone", x: 132, y: 16, group: 5, pattern: "ring8" },
    { kind: "drone", x: 145, y: 17, group: 5, pattern: "spiral" },

    { kind: "blade", x: 162, y: 28, group: 6 },
    { kind: "rifle", x: 167, y: 23, group: 6 },
    { kind: "drone", x: 181, y: 19, group: 6, pattern: "orbPair" },
    { kind: "heavy", x: 187, y: 28, group: 6, pattern: "slug" },
  );

  L.decos.push(
    { kind: "sign", x: 3, y: 22, w: 3, h: 4 },
    { kind: "facesign", x: 13, y: 15, w: 4, h: 7 },
    { kind: "lamp", x: 9, y: 29 },
    { kind: "vent", x: 19, y: 29 },
    { kind: "lamp", x: 36, y: 29 },
    { kind: "antenna", x: 48, y: 29 },
    { kind: "sign", x: 66, y: 10, w: 6, h: 3 },
    { kind: "lamp", x: 63, y: 19 },
    { kind: "vent", x: 76, y: 19 },
    { kind: "sign", x: 95, y: 15, w: 3, h: 5 },
    { kind: "lamp", x: 97, y: 23 },
    { kind: "antenna", x: 105, y: 23 },
    { kind: "lamp", x: 123, y: 23 },
    { kind: "sign", x: 136, y: 9, w: 3, h: 6 },
    { kind: "vent", x: 157, y: 27 },
    { kind: "lamp", x: 174, y: 27 },
    { kind: "sign", x: 184, y: 18, w: 5, h: 3 },
    { kind: "facesign", x: 195, y: 12, w: 3, h: 8 },
    { kind: "antenna", x: 202, y: 24 },
    { kind: "lamp", x: 219, y: 16 },
    { kind: "lamp", x: 232, y: 16 },
    { kind: "lamp", x: 267, y: 16 },
    { kind: "antenna", x: 272, y: 16 },
    { kind: "vent", x: 227, y: 16 },
  );
  return L;
}
