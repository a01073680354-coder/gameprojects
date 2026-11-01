// Global constants and live-tunable parameters.

export const VIEW_W = 640;
export const VIEW_H = 360;
export const TILE = 16;
export const STEP = 1 / 60; // fixed simulation step (seconds)

// Lite build (laptops / integrated graphics): same game, far fewer draw
// primitives per frame. Set by the build script.
declare const LITE: boolean;
export const LITE_MODE: boolean = typeof LITE !== "undefined" && LITE;

/**
 * Test switches (lite build only): strip features one by one to find what a
 * slow machine chokes on. Chosen on the start screen, remembered per browser.
 */
export type MusicOpt = "all" | "s1" | "s2" | "boss" | "stage" | "off";
export const TEST = {
  rain: true, music: "all" as MusicOpt, sfx: true, reverb: true, particles: true, bg: true,
  glow: true, after: true, shake: true, sky: true, intro: true, fps: false,
};
export const TEST_DEFAULTS = { ...TEST };
const TEST_KEY = "non.test.v1";
if (LITE_MODE) {
  try { Object.assign(TEST, JSON.parse(localStorage.getItem(TEST_KEY) || "{}")); } catch { /* private mode */ }
}
export function saveTest() {
  try { localStorage.setItem(TEST_KEY, JSON.stringify(TEST)); } catch { /* ignore */ }
}
/** Which stage is running (music switches need it). */
export const RUNTIME = { stage: 1 };
export function musicAllowed(kind: "stage" | "oni" | "asn" | "arc" | "cha"): boolean {
  switch (TEST.music) {
    case "off": return false;
    case "stage": return kind === "stage";
    case "boss": return kind !== "stage";
    case "s1": return RUNTIME.stage === 1 && (kind === "stage" || kind === "oni");
    case "s2": return RUNTIME.stage === 2 && (kind === "stage" || kind === "asn");
    default: return true;
  }
}

// Feature switches. Wall slide/jump is parked until it has fitting animation.
export const FEATURES = { wall: false };

/** Carried between stages; later stages can upgrade the nano ampoules. */
export const PROGRESS = {
  ampoules: 2,        // charges carried
  healAmount: 2,      // cells restored per use
  perfectsPerCharge: 8,
};
export const HEAL_TIME = 0.6;

export interface TuneDef {
  key: string;
  label: string;
  group: string;
  min: number;
  max: number;
  step: number;
  def: number;
}

// Jump is authored as height + time-to-apex (Kyle Pittman, "Building a Better
// Jump", GDC 2016); gravity and launch speed are derived from those.
export const TUNE_DEFS: TuneDef[] = [
  { key: "runSpeed", label: "달리기 최고 속도", group: "이동", min: 80, max: 400, step: 5, def: 200 },
  { key: "groundAccel", label: "지상 가속", group: "이동", min: 400, max: 6000, step: 50, def: 2400 },
  { key: "groundDecel", label: "지상 감속", group: "이동", min: 400, max: 6000, step: 50, def: 2800 },
  { key: "airMult", label: "공중 조작 배율", group: "이동", min: 0.1, max: 1.5, step: 0.05, def: 0.7 },

  { key: "jumpHeight", label: "점프 높이(px)", group: "점프", min: 32, max: 220, step: 2, def: 106 },
  { key: "timeToApex", label: "정점 도달 시간(초)", group: "점프", min: 0.18, max: 0.7, step: 0.01, def: 0.36 },
  { key: "fallMult", label: "하강 중력 배율", group: "점프", min: 0.6, max: 2.5, step: 0.05, def: 1.25 },
  { key: "jumpCut", label: "점프 키 뗄 때 속도 유지율", group: "점프", min: 0.1, max: 1, step: 0.05, def: 0.45 },
  { key: "apexHang", label: "정점 체공(중력 감소)", group: "점프", min: 0.2, max: 1, step: 0.05, def: 0.55 },
  { key: "maxFall", label: "최대 낙하 속도", group: "점프", min: 200, max: 1000, step: 10, def: 540 },
  { key: "coyote", label: "코요테 타임(초)", group: "점프", min: 0, max: 0.25, step: 0.01, def: 0.1 },
  { key: "jumpBuffer", label: "점프 입력 버퍼(초)", group: "점프", min: 0, max: 0.25, step: 0.01, def: 0.12 },

  { key: "wallSlide", label: "벽 미끄러짐 속도", group: "벽", min: 20, max: 400, step: 5, def: 110 },
  { key: "wallJumpX", label: "벽 점프 수평 속도", group: "벽", min: 100, max: 600, step: 10, def: 290 },
  { key: "wallJumpY", label: "벽 점프 높이 배율", group: "벽", min: 0.5, max: 1.3, step: 0.02, def: 0.94 },
  { key: "wallJumpLock", label: "벽 점프 후 조작 제한(초)", group: "벽", min: 0, max: 0.4, step: 0.01, def: 0.14 },
  { key: "wallRelease", label: "벽에서 떨어지는 유예(초)", group: "벽", min: 0, max: 0.3, step: 0.01, def: 0.1 },

  { key: "dashSpeed", label: "대쉬 속도", group: "대쉬", min: 300, max: 1400, step: 10, def: 760 },
  { key: "dashTime", label: "대쉬 지속(초)", group: "대쉬", min: 0.06, max: 0.35, step: 0.01, def: 0.16 },
  { key: "dashEndMult", label: "대쉬 종료 후 속도 유지", group: "대쉬", min: 0, max: 1, step: 0.05, def: 0.42 },
  { key: "dashFreeze", label: "대쉬 순간 정지(초)", group: "대쉬", min: 0, max: 0.12, step: 0.01, def: 0.04 },
  { key: "dashIframes", label: "대쉬 순간 무적(초)", group: "대쉬", min: 0, max: 0.3, step: 0.01, def: 0.12 },
  { key: "superSpeed", label: "대쉬 점프 수평 속도", group: "대쉬", min: 200, max: 800, step: 10, def: 430 },

  { key: "parryWindow", label: "패링 판정 시간(초)", group: "패링", min: 0.05, max: 0.3, step: 0.005, def: 0.135 },
  { key: "perfectWindow", label: "퍼펙트 판정 시간(초)", group: "패링", min: 0.0, max: 0.12, step: 0.005, def: 0.05 },
  { key: "parryWhiff", label: "헛스윙 후 재사용 대기(초)", group: "패링", min: 0, max: 0.6, step: 0.01, def: 0.25 },
  { key: "parryRange", label: "패링 범위(px)", group: "패링", min: 20, max: 90, step: 1, def: 52 },
  { key: "reflectMult", label: "반사 속도 배율", group: "패링", min: 1, max: 3, step: 0.05, def: 1.6 },
  { key: "assistDeg", label: "반사 조준 보정(도)", group: "패링", min: 0, max: 40, step: 1, def: 15 },
  { key: "stopParry", label: "패링 히트스톱(초)", group: "패링", min: 0, max: 0.2, step: 0.005, def: 0.055 },
  { key: "stopPerfect", label: "퍼펙트 히트스톱(초)", group: "패링", min: 0, max: 0.3, step: 0.005, def: 0.1 },

  { key: "bulletSpeed", label: "적 총알 속도", group: "적", min: 120, max: 600, step: 5, def: 270 },
  { key: "telegraph", label: "조준 경고 시간(초)", group: "적", min: 0.2, max: 1.5, step: 0.05, def: 0.75 },
  { key: "oniSweepTell1", label: "홍귀 하단베기(危) 예고 시간 · 1페이즈(초)", group: "보스", min: 0.4, max: 1.6, step: 0.01, def: 1.0 },
  { key: "oniSweepTell2", label: "홍귀 하단베기(危) 예고 시간 · 2페이즈(초)", group: "보스", min: 0.4, max: 1.6, step: 0.01, def: 0.85 },
  { key: "cineCooldown", label: "처치 연출 최소 간격(초)", group: "연출", min: 0, max: 40, step: 1, def: 12 },
  { key: "cineChance", label: "일반 처치 연출 확률", group: "연출", min: 0, max: 1, step: 0.05, def: 0.2 },
  { key: "squash", label: "늘어남·찌그러짐 강도", group: "연출", min: 0, max: 1.5, step: 0.05, def: 0.6 },
  { key: "shake", label: "화면 흔들림 강도", group: "연출", min: 0, max: 2, step: 0.05, def: 1 },
  { key: "lookahead", label: "카메라 앞쪽 시야(px)", group: "연출", min: 0, max: 120, step: 2, def: 48 },
  { key: "music", label: "배경음악 음량", group: "소리", min: 0, max: 1, step: 0.05, def: 0.55 },
];

export type Tune = Record<string, number>;

/**
 * The hero's reach, 1.3x the original (slash 46 px, melee parry pad 12/22 px,
 * bullet parry 40 px). The bullet parry range lives in TUNE.parryRange.
 */
export const REACH = {
  slash: 60,        // was 46
  slashCore: 18,    // was 14: this close, any direction hits
  parryPad: 16,     // was 12: how far outside an enemy blade a parry still meets it
  parryPadWide: 29, // was 22: the Assassin, and the first cut of 千斬
  parryCore: 23,    // was 18: a bullet this close is parried from any direction
};

/** Defaults that changed: a saved value still equal to the old default moves to the new one. */
const MIGRATE: Record<string, number> = { parryRange: 40 };

const STORE_KEY = "parry.tune.v1";

export function loadTune(): Tune {
  const t: Tune = {};
  for (const d of TUNE_DEFS) t[d.key] = d.def;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      for (const d of TUNE_DEFS) {
        if (typeof saved[d.key] !== "number") continue;
        if (MIGRATE[d.key] !== undefined && saved[d.key] === MIGRATE[d.key]) continue;
        t[d.key] = saved[d.key];
      }
    }
  } catch {
    /* storage unavailable: keep defaults */
  }
  return t;
}

export function saveTune(t: Tune) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

export function defaultTune(): Tune {
  const t: Tune = {};
  for (const d of TUNE_DEFS) t[d.key] = d.def;
  return t;
}

// The single live tune object shared by every system.
export const TUNE: Tune = loadTune();

export function derivedJump(t: Tune) {
  const g = (2 * t.jumpHeight) / (t.timeToApex * t.timeToApex);
  const v = (2 * t.jumpHeight) / t.timeToApex;
  return { gravity: g, jumpSpeed: v };
}
