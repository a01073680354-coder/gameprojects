// Save and continue. One slot in this browser's storage, written at every
// checkpoint and stage clear. It holds where the hero is, what he carries,
// which story scenes and lessons he has already seen, and his decisions.
// If storage is blocked (private mode, a sandboxed preview) the game simply
// runs without it, as it always did.

import { WALLET } from "../sim/loadout";
import { CHOICES, CHOICE_KEYS, Choices } from "./state";

const KEY = "non.save.v1";
const VERSION = 1;

export interface SaveData {
  v: number;
  stage: number;
  cp: number;
  at: number;                 // when it was written (ms)
  wallet: {
    chips: number; shards: number; owned: string[]; curses: string[]; curse: string | null;
    concentrated: number; shields: number; batteries: number;
    bought: Record<string, number>; shardsTaken: string[]; visited: string[];
  };
  seen: string[];             // story scenes and lines already shown
  lessons: string[];          // controls already taught
  choices: Partial<Choices>;
}

/** Controls already taught (never taught twice, bible p.12). */
export const LESSONS: Set<string> = ((window as any).__lessons ??= new Set<string>());

function storySeen(): Set<string> { return ((window as any).__storySeen ??= new Set<string>()); }

function read(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    if (!d || typeof d.stage !== "number") return null;
    return migrate(d);
  } catch { return null; }
}

/** Older saves gain the fields added since; nothing is thrown away. */
function migrate(d: SaveData): SaveData {
  d.v ??= 1;
  d.cp ??= -1;
  d.seen ??= [];
  d.lessons ??= [];
  d.choices ??= {};
  d.wallet ??= { chips: 0, shards: 0, owned: [], curses: [], curse: null, concentrated: 0, shields: 0, batteries: 0, bought: {}, shardsTaken: [], visited: [] };
  return d;
}

export const SAVE = {
  /** The saved game, if any. */
  peek(): SaveData | null { return read(); },

  /** Write the current state: called at checkpoints and stage clears. */
  write(stage: number, cp: number) {
    const w = WALLET;
    const choices: Partial<Choices> = {};
    for (const k of CHOICE_KEYS) if (CHOICES[k] !== null) (choices as any)[k] = CHOICES[k];
    const d: SaveData = {
      v: VERSION, stage, cp, at: Date.now(),
      wallet: {
        chips: w.chips, shards: w.shards, owned: [...w.owned], curses: [...w.curses], curse: w.curse,
        concentrated: w.concentrated, shields: w.shields, batteries: w.batteries,
        bought: { ...w.bought }, shardsTaken: [...w.shardsTaken], visited: [...w.visited],
      },
      seen: [...storySeen()],
      lessons: [...LESSONS],
      choices,
    };
    try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; }
  },

  /** Put a saved game back into the live state. */
  restore(d: SaveData) {
    const w = WALLET, s = d.wallet;
    w.chips = s.chips; w.shards = s.shards;
    w.owned = new Set(s.owned); w.curses = new Set(s.curses); w.curse = s.curse;
    w.concentrated = s.concentrated; w.shields = s.shields; w.batteries = s.batteries;
    w.bought = { ...s.bought }; w.shardsTaken = new Set(s.shardsTaken); w.visited = new Set(s.visited);
    const seen = storySeen();
    for (const k of d.seen) seen.add(k);
    for (const k of d.lessons) LESSONS.add(k);
    for (const k of CHOICE_KEYS) (CHOICES as any)[k] = (d.choices as any)[k] ?? null;
  },

  /** A new game: forget the slot and everything carried. */
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* storage off */ }
    LESSONS.clear();
    for (const k of CHOICE_KEYS) (CHOICES as any)[k] = null;
  },
};
