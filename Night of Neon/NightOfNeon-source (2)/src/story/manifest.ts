// The story order (bible v3, p.39): which stage comes after which, and the
// number the player sees. Code-side stage ids never change (rooftop = 1,
// spire = 2, archive = 3); new stages take new ids. "Next stage" is the next
// entry in this list, never id + 1. Entries with no id are not built yet.

export interface StoryStage {
  key: string;
  /** Code-side stage id, or null while the stage is still to be made. */
  id: number | null;
  ko: string;
  en: string;
}

export const ORDER: StoryStage[] = [
  { key: "outskirts", id: 11, ko: "빗속의 외곽", en: "The Outskirts" },
  { key: "market", id: 12, ko: "하층 시장", en: "The Undercity Market" },
  { key: "rooftop", id: 1, ko: "비 내리는 옥상", en: "Neon Rooftops" },
  { key: "spire", id: 2, ko: "탑의 심장부", en: "Neon Spire" },
  { key: "archive", id: 3, ko: "잊혀진 기록관", en: "The Forgotten Archive" },
  { key: "ward", id: null, ko: "침묵의 병동", en: "The Silent Ward" },
  { key: "rail", id: null, ko: "하층 선로", en: "The Undercity Rail" },
  { key: "eden", id: null, ko: "에덴", en: "Eden" },
  { key: "laplace", id: null, ko: "라플라스", en: "Laplace" },
  { key: "bridge", id: null, ko: "최후의 전선", en: "The Last Front" },
  { key: "finale", id: null, ko: "백야의 끝", en: "The End of White Night" },
];

/** Where a new game starts. */
export const FIRST_STAGE = ORDER.find((s) => s.id !== null)!.id!;

function indexOf(id: number) { return ORDER.findIndex((s) => s.id === id); }

/** "STAGE 3", or "FINAL" for the last one. */
export function stageKick(id: number): string {
  const i = indexOf(id);
  if (i < 0) return `STAGE ${id}`;
  return ORDER[i].key === "finale" ? "FINAL" : `STAGE ${i + 1}`;
}

/** The number shown to the player (1-based story position). */
export function displayNo(id: number): number { return indexOf(id) + 1; }

/**
 * What comes after this stage: the stages still to be made that are skipped
 * on the way (shown as "in production" cards), and the next playable one.
 */
export function nextAfter(id: number): { skipped: StoryStage[]; next: StoryStage | null } {
  const i = indexOf(id);
  const skipped: StoryStage[] = [];
  for (let k = i + 1; k < ORDER.length; k++) {
    if (ORDER[k].id !== null) return { skipped, next: ORDER[k] };
    skipped.push(ORDER[k]);
  }
  return { skipped, next: null };
}

/** Playable stages in story order (for the Tab menu). */
export function playable(): StoryStage[] { return ORDER.filter((s) => s.id !== null); }
