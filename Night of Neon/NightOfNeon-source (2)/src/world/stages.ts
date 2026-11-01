// Stage registry: how to build each stage and how to present it.

import { Level } from "./level";
import { buildStage1 } from "./stage1";
import { buildStage2 } from "./stage2";
import { buildStage3 } from "./stage3";
import { buildOutskirts } from "./stage_outskirts";
import { buildMarket } from "./stage_market";
import { stageKick } from "../story/manifest";

export interface StageInfo {
  id: number;
  build: () => Level;
  title: { kick: string; name: string; ko: string };
  boss: { ko: string; kanji: string; en: string; sub: string };
  music: "rooftop" | "tower" | "archive" | "outskirts" | "market";
  /** How the boss fight ends: a person is subdued, a machine destroyed (bible p.5). */
  finish: "subdue" | "destroy" | "slay";
}

// Code-side ids never change; the "STAGE n" the player sees comes from the
// story order (story/manifest.ts).
export const STAGES: StageInfo[] = [
  {
    id: 11,
    build: buildOutskirts,
    title: { kick: "STAGE 1", name: "The Outskirts", ko: "빗속의 외곽" },
    boss: { ko: "회수반장 · 차승호", kanji: "回收", en: "THE COLLECTOR", sub: "차승호 — 백야 회수부대 반장" },
    music: "outskirts",
    finish: "subdue",
  },
  {
    id: 12,
    build: buildMarket,
    title: { kick: "STAGE 2", name: "The Undercity Market", ko: "하층 시장" },
    boss: { ko: "원격 진압 장갑 · 방벽", kanji: "防壁", en: "THE BULWARK", sub: "방벽 — 백야 수색대 원격 진압 장갑" },
    music: "market",
    finish: "destroy",
  },
  {
    id: 1,
    build: buildStage1,
    title: { kick: "STAGE 3", name: "Neon Rooftops", ko: "비 내리는 옥상" },
    boss: { ko: "홍귀 · 류건", kanji: "紅鬼", en: "CRIMSON ONI", sub: "홍귀 · 류건 — 백야 처형부대 지휘관" },
    music: "rooftop",
    finish: "slay",
  },
  {
    id: 2,
    build: buildStage2,
    title: { kick: "STAGE 4", name: "Neon Spire", ko: "탑의 심장부" },
    boss: { ko: "암살자", kanji: "暗殺者", en: "ASSASSIN", sub: "암살자 · NULL-00 — 영점 프로토콜 실험체" },
    music: "tower",
    finish: "destroy",
  },
  {
    id: 3,
    build: buildStage3,
    title: { kick: "STAGE 5", name: "The Forgotten Archive", ko: "잊혀진 기록관" },
    boss: { ko: "기록관 · 허명", kanji: "記錄官", en: "THE ARCHIVIST", sub: "기록관 · 허명 — 前 무명검 작전관" },
    music: "archive",
    finish: "subdue",
  },
];

export function stageInfo(id: number): StageInfo {
  const s = STAGES.find((x) => x.id === id) ?? STAGES[0];
  return { ...s, title: { ...s.title, kick: stageKick(s.id) } };
}
