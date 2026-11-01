import { TILE } from "../config";

// Tile kinds
export const EMPTY = 0;
export const SOLID = 1;
export const ONEWAY = 2;
export const BREAK = 3;   // occupied by a breakable obstacle (drum barrels): blocks actors, not painted
export const BARRIER = 4; // energy wall while an encounter is locked: blocks actors only
export const FAKE = 5;    // looks like wall, walks like air: a secret passage

/** Surface materials (Level.mat). 0 is the ground itself. */
export const MAT = { ground: 0, wood: 1, tin: 2, crate: 3, block: 4, deck: 5, grate: 6 } as const;

export interface Deco {
  kind: string;
  x: number; // tile coords
  y: number;
  w?: number;
  h?: number;
  variant?: number;
}

export interface Spawn {
  kind: "rifle" | "burst" | "heavy" | "drone" | "blade" | "kamikaze" | "turret" | "collector" | "burner";
  pattern?: string;
  x: number; // tile column
  y: number; // tile row of the floor it stands on
  group: number;
  facing?: number;
}

export type PropKind = "barrel" | "sign";

export interface PropDef {
  kind: PropKind;
  x: number; // tile column
  y: number; // tile row of the floor it stands on
  variant?: number;
}

/** An encounter that seals the area and stages its enemies' arrival. */
export interface Arena {
  group: number;
  trigger: number;  // tile column the player must pass
  walls: { x: number; y0: number; y1: number }[];
  entrance: boolean; // enemies arrive by dropship / fly-in
  boss?: boolean;    // the boss fight: scripted entrance, cleared by the final deathblow
}

export interface BossDef {
  x: number; // tile column
  y: number; // floor row
  group: number;
  kind?: "oni" | "assassin" | "archivist" | "chief" | "bulwark";
}

export class Level {
  readonly w: number;
  readonly h: number;
  readonly tiles: Uint8Array;
  /** Surface material per tile, for painters that care (outskirts): see MAT. */
  readonly mat: Uint8Array;
  spawnX = 0;
  spawnY = 0;
  decos: Deco[] = [];
  spawns: Spawn[] = [];
  props: PropDef[] = [];
  arenas: Arena[] = [];
  checkpoints: { x: number; y: number }[] = [];
  goal: { x: number; y: number } | null = null;
  teaser: { x: number; y: number; trigger: number } | null = null;
  hints: { x: number; y: number; kind: string }[] = [];
  boss: BossDef | null = null;
  theme: "rooftop" | "tower" | "archive" | "outskirts" | "market" = "rooftop";
  /** Indoor rooms (tile rects): a back wall is painted inside, and rain fades while you are in one.
   *  "cover" is open-sided shelter (under the overpass): no back wall, the rain still fades. */
  rooms: { x0: number; y0: number; x1: number; y1: number; kind: "house" | "shed" | "cover" }[] = [];
  /** Hidden nooks: painted over like the wall around them until the hero steps inside. */
  secrets: { x0: number; y0: number; x1: number; y1: number }[] = [];
  /** People who live here and do not fight (STAGE 2): tile column, floor row, who, which way they face. */
  npcs: { x: number; y: number; who: string; facing?: number; line?: string; hidden?: boolean }[] = [];
  /** Things to look at (W): tile column, floor row, the story scene to play. */
  notes: { x: number; y: number; id: string; gift?: "ampoule"; label?: string }[] = [];
  /** Where a control is taught: passing column x shows that lesson's key chip (once ever). */
  lessons: { x: number; id: string }[] = [];
  /** Health at the very start of the stage (not after a checkpoint). */
  startHp: number | null = null;
  /** Security lasers: a vertical beam at tile column x, rows y0..y1, on for `duty` of each `period` (s). */
  gates: { x: number; y0: number; y1: number; period: number; duty: number; offset: number }[] = [];
  /** Record fragments: touch to read (tile coords, y = the row it floats in). */
  records: { x: number; y: number; id: string }[] = [];
  /** Memory shards (◈): hidden pickups, kept once found. */
  shards: { x: number; y: number; id: string }[] = [];
  /** Shops: tile column, floor row, which one. */
  shops: { x: number; y: number; kind: "forge" | "supply" | "bazaar"; id: string }[] = [];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.tiles = new Uint8Array(w * h);
    this.mat = new Uint8Array(w * h);
  }

  /** Paint a material onto a tile rect (does not change collision). */
  setMat(x0: number, y0: number, x1: number, y1: number, m: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.mat[y * this.w + x] = m;
  }
  matAt(tx: number, ty: number) { return tx < 0 || ty < 0 || tx >= this.w || ty >= this.h ? 0 : this.mat[ty * this.w + tx]; }

  get pixelW() { return this.w * TILE; }
  get pixelH() { return this.h * TILE; }

  get(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.w) return SOLID; // side walls of the world
    if (ty < 0) return EMPTY;
    if (ty >= this.h) return EMPTY; // pits open into the void
    return this.tiles[ty * this.w + tx];
  }

  set(tx: number, ty: number, v: number) {
    if (tx >= 0 && ty >= 0 && tx < this.w && ty < this.h) this.tiles[ty * this.w + tx] = v;
  }

  fill(x0: number, y0: number, x1: number, y1: number, v: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, v);
  }

  isSolid(tx: number, ty: number) { return this.get(tx, ty) === SOLID; }

  /** Blocks actors: solid ground, intact obstacles, active energy walls. */
  blocks(tx: number, ty: number) {
    const t = this.get(tx, ty);
    return t === SOLID || t === BREAK || t === BARRIER;
  }

  /** Does the pixel rect overlap anything that blocks actors? */
  solidRect(x: number, y: number, w: number, h: number): boolean {
    const tx0 = Math.floor(x / TILE), tx1 = Math.floor((x + w - 1) / TILE);
    const ty0 = Math.floor(y / TILE), ty1 = Math.floor((y + h - 1) / TILE);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) if (this.blocks(tx, ty)) return true;
    return false;
  }

  /** Is there a one-way platform top exactly at pixel row `y` under x..x+w? */
  oneWayTopAt(x: number, y: number, w: number): boolean {
    if (y % TILE !== 0) return false;
    const ty = y / TILE;
    const tx0 = Math.floor(x / TILE), tx1 = Math.floor((x + w - 1) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) if (this.get(tx, ty) === ONEWAY) return true;
    return false;
  }

  /** Tiles a prop occupies (barrels are one tile wide, two tall). */
  static propTiles(p: PropDef): { x: number; y: number }[] {
    if (p.kind !== "barrel") return [];
    return [{ x: p.x, y: p.y - 1 }, { x: p.x, y: p.y - 2 }];
  }
}
