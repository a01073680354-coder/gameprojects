// Playtest feedback: an automatic play log (deaths and their causes, boss
// progress, parries, frame rate, machine) plus a short form. Two ways out:
//  - "보내기": saved to the artifact's own database when this view may write
//    (each tester writes only their own document; only the owner reads them)
//  - "복사": the whole report as text, for pasting into a chat. Always works.

import { TEST } from "../config";

declare global {
  interface Window { claude?: { use(name: string): Promise<any> } }
}

export interface Death { stage: number; at: string; by: string; t: number }

class PlayLog {
  started = Date.now();
  stagesSeen = new Set<number>();
  deaths: Death[] = [];
  clears: { stage: number; time: number; boss: number }[] = [];
  bossFights: Record<string, { tries: number; bestPhase: number; won: boolean }> = {};
  parries = 0;
  perfects = 0;
  heals = 0;
  frames = 0;
  frameMs = 0;
  slow = 0; // frames over 33 ms
  worst = 0;

  frame(dtMs: number) {
    if (dtMs > 250) return; // tab was hidden
    this.frames++;
    this.frameMs += dtMs;
    if (dtMs > 33) this.slow++;
    this.worst = Math.max(this.worst, dtMs);
  }
  boss(name: string) {
    return (this.bossFights[name] ??= { tries: 0, bestPhase: 1, won: false });
  }
  summary() {
    const mins = Math.round((Date.now() - this.started) / 6000) / 10;
    const fps = this.frames ? Math.round((this.frames * 1000) / this.frameMs) : 0;
    const byCause: Record<string, number> = {};
    for (const d of this.deaths) byCause[d.by] = (byCause[d.by] ?? 0) + 1;
    const nav = navigator as any;
    return {
      minutes: mins,
      stages: [...this.stagesSeen].sort(),
      clears: this.clears,
      deaths: this.deaths.length,
      deathCauses: byCause,
      recentDeaths: this.deaths.slice(-12),
      bosses: this.bossFights,
      parries: this.parries,
      perfects: this.perfects,
      heals: this.heals,
      fpsAvg: fps,
      slowFramePct: this.frames ? Math.round((this.slow / this.frames) * 1000) / 10 : 0,
      worstFrameMs: Math.round(this.worst),
      machine: {
        cores: nav.hardwareConcurrency ?? null,
        memoryGB: nav.deviceMemory ?? null,
        screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
        ua: navigator.userAgent.replace(/\s*\([^)]*\)/g, " ").slice(0, 120),
      },
      switches: { ...TEST },
    };
  }
}

export const PLAYLOG = new PlayLog();

// --------------------------------------------------------------------- UI

const CSS = `
#fbbtn { position: fixed; z-index: 12; right: max(12px, env(safe-area-inset-right, 0px)); top: calc(44px + env(safe-area-inset-top, 0px));
  font: 12px var(--f-ui, sans-serif); color: var(--ink, #eee); cursor: pointer; background: rgba(7,4,15,.6); border: 1px solid var(--pink, #ff2a6d); padding: 6px 10px; }
#fbbtn:hover, #fbbtn:focus-visible { background: rgba(255,42,109,.18); outline: none; }
#fb { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(4,2,10,.72); padding: 16px; overflow-y: auto; }
#fb[hidden] { display: none; }
#fb .card { width: min(34rem, 100%); background: #0c0818; border: 1px solid #3a2a5a; border-top: 2px solid var(--pink, #ff2a6d);
  padding: 16px 18px; display: grid; gap: 12px; color: #e8e4ff; font: 14px var(--f-ui, sans-serif); }
#fb h2 { margin: 0; font: 600 16px var(--f-display, sans-serif); color: #fff; letter-spacing: .04em; }
#fb p { margin: 0; color: var(--dim, #9a94b8); font-size: 12px; line-height: 1.5; }
#fb fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 6px; }
#fb legend { font-size: 13px; margin-bottom: 4px; color: #e8e4ff; }
#fb .opts { display: flex; flex-wrap: wrap; gap: 6px; }
#fb .opts label { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid #3a2a5a; cursor: pointer; font-size: 13px; min-height: 30px; }
#fb .opts input { accent-color: #ff2a6d; }
#fb .opts label:has(input:checked) { border-color: var(--pink, #ff2a6d); background: rgba(255,42,109,.12); }
#fb textarea, #fb input[type=text] { width: 100%; box-sizing: border-box; background: #120c22; color: #e8e4ff; border: 1px solid #3a2a5a; padding: 8px; font: 14px var(--f-ui, sans-serif); resize: vertical; }
#fb textarea:focus-visible, #fb input:focus-visible, #fb button:focus-visible { outline: 2px solid var(--cyan, #2de2e6); outline-offset: 2px; }
#fb .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
#fb button { background: #1a1230; color: #e8e4ff; border: 1px solid #4a3a6a; padding: 8px 14px; font-size: 13px; cursor: pointer; }
#fb button.primary { border-color: var(--pink, #ff2a6d); background: rgba(255,42,109,.18); }
#fb button:hover { border-color: var(--cyan, #2de2e6); }
#fb .status { font-size: 12px; color: var(--cyan, #2de2e6); min-height: 1.2em; }
#fb details { font-size: 12px; color: var(--dim, #9a94b8); }
#fb pre { white-space: pre-wrap; max-height: 10rem; overflow: auto; background: #08060f; padding: 8px; margin: 6px 0 0; font-size: 11px; }
`;

const scale = (name: string, legend: string, labels: string[]) => `
  <fieldset><legend>${legend}</legend><div class="opts">
  ${labels.map((l, i) => `<label><input type="radio" name="${name}" value="${i + 1}"> ${l}</label>`).join("")}
  </div></fieldset>`;

let dbRef: any = null;
let userId: string | null = null;
let canSave = false;

/** Ask the viewer for db access (resolves null outside claude.ai or when not granted). */
async function connect() {
  try {
    const use = window.claude?.use;
    if (!use) return;
    const [db, user] = await Promise.all([use("db"), use("user")]);
    if (!db || !user) return;
    const id = await user.id();
    if (!id) return;
    dbRef = db;
    userId = id;
    canSave = true;
  } catch { /* no db here: copy only */ }
}

export function initFeedback(onOpen: () => void, onClose: () => void) {
  if (document.getElementById("fb")) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = "fbbtn";
  btn.type = "button";
  btn.textContent = "피드백 남기기";
  document.body.appendChild(btn);

  const wrap = document.createElement("div");
  wrap.id = "fb";
  wrap.hidden = true;
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-labelledby", "fb-title");
  wrap.innerHTML = `
    <form class="card" novalidate>
      <h2 id="fb-title">테스트 피드백</h2>
      <p>플레이 기록(쓰러진 위치와 원인, 보스 진행, FPS, 기기 정보)이 자동으로 함께 붙어요. 이름 같은 개인 정보는 붙지 않습니다.</p>
      ${scale("fun", "재미", ["별로", "그럭저럭", "괜찮음", "재밌음", "최고"])}
      ${scale("diff", "난이도", ["너무 쉬움", "쉬움", "적당", "어려움", "너무 어려움"])}
      ${scale("lag", "렉", ["없음", "가끔", "자주", "심해서 못 함"])}
      <fieldset><legend>좋았던 점</legend><textarea name="good" rows="2" maxlength="1500"></textarea></fieldset>
      <fieldset><legend>아쉬운 점 · 버그 · 어려웠던 패턴</legend><textarea name="bad" rows="3" maxlength="3000"></textarea></fieldset>
      <fieldset><legend>닉네임 (선택)</legend><input type="text" name="nick" maxlength="40" autocomplete="nickname"></fieldset>
      <div class="row">
        <button type="submit" class="primary" data-act="save">보내기</button>
        <button type="button" data-act="copy">복사하기 (메신저로 전달)</button>
        <button type="button" data-act="close">닫기</button>
      </div>
      <div class="status" aria-live="polite"></div>
      <details><summary>자동으로 붙는 플레이 기록 보기</summary><pre></pre></details>
    </form>`;
  document.body.appendChild(wrap);
  const form = wrap.querySelector("form")!;
  const status = wrap.querySelector(".status") as HTMLElement;
  const pre = wrap.querySelector("pre")!;
  const saveBtn = wrap.querySelector('[data-act="save"]') as HTMLButtonElement;

  const collect = () => {
    const fd = new FormData(form);
    const num = (k: string) => (fd.get(k) ? Number(fd.get(k)) : null);
    return {
      at: new Date().toISOString(),
      fun: num("fun"), difficulty: num("diff"), lag: num("lag"),
      good: String(fd.get("good") ?? "").trim(),
      bad: String(fd.get("bad") ?? "").trim(),
      nick: String(fd.get("nick") ?? "").trim(),
      log: PLAYLOG.summary(),
    };
  };
  const asText = (e: ReturnType<typeof collect>) => {
    const L = e.log;
    const lab = (v: number | null, arr: string[]) => (v ? arr[v - 1] : "-");
    const bosses = Object.entries(L.bosses).map(([k, b]) => `${k}: 도전 ${b.tries}회, 최고 ${b.bestPhase}페이즈${b.won ? ", 격파" : ""}`).join(" / ") || "-";
    const causes = Object.entries(L.deathCauses).map(([k, n]) => `${k} ${n}`).join(", ") || "-";
    return [
      `[Night of Neon 테스트 피드백]${e.nick ? " " + e.nick : ""}`,
      `재미: ${lab(e.fun, ["별로", "그럭저럭", "괜찮음", "재밌음", "최고"])} / 난이도: ${lab(e.difficulty, ["너무 쉬움", "쉬움", "적당", "어려움", "너무 어려움"])} / 렉: ${lab(e.lag, ["없음", "가끔", "자주", "심함"])}`,
      `좋았던 점: ${e.good || "-"}`,
      `아쉬운 점: ${e.bad || "-"}`,
      `플레이 ${L.minutes}분, 스테이지 ${L.stages.join(",") || "-"}, 클리어 ${L.clears.map((c) => c.stage).join(",") || "-"}`,
      `쓰러짐 ${L.deaths}회 (${causes})`,
      `보스: ${bosses}`,
      `패링 ${L.parries} (퍼펙트 ${L.perfects}), 회복 ${L.heals}회`,
      `FPS 평균 ${L.fpsAvg}, 느린 프레임 ${L.slowFramePct}%, 최악 ${L.worstFrameMs}ms`,
      `기기: 코어 ${L.machine.cores ?? "?"}, 메모리 ${L.machine.memoryGB ?? "?"}GB, 화면 ${L.machine.screen}`,
    ].join("\n");
  };

  const open = () => {
    wrap.hidden = false;
    pre.textContent = asText(collect());
    saveBtn.hidden = !canSave;
    status.textContent = canSave ? "" : "이 화면에서는 바로 저장할 수 없어요. '복사하기'로 복사해서 보내 주세요.";
    onOpen();
    (form.querySelector("input") as HTMLInputElement | null)?.focus();
  };
  const close = () => { wrap.hidden = true; onClose(); };

  btn.addEventListener("click", (e) => { e.stopPropagation(); open(); });
  // typing in the form must never reach the game's key handlers
  wrap.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") close(); });
  wrap.addEventListener("keyup", (e) => e.stopPropagation());
  wrap.addEventListener("pointerdown", (e) => e.stopPropagation());
  wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
  form.addEventListener("input", () => { pre.textContent = asText(collect()); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!canSave || !dbRef || !userId) return;
    const entry = collect();
    saveBtn.disabled = true;
    status.textContent = "보내는 중…";
    try {
      const ref = dbRef.doc(`feedback/${userId}`);
      const snap = await ref.get();
      const prev = snap.exists ? ((snap.data()?.entries as unknown[]) ?? []) : [];
      await ref.set({ entries: [...prev, entry].slice(-20), updated: entry.at });
      status.textContent = "보냈어요. 고마워요!";
      form.reset();
      setTimeout(close, 1200);
    } catch (err: any) {
      canSave = err?.code !== "invalid_argument" && err?.code !== "not_granted" && err?.code !== "revoked";
      saveBtn.hidden = !canSave;
      status.textContent = err?.code === "quota_exceeded" ? "저장 공간이 꽉 찼어요. '복사하기'로 보내 주세요." : "저장하지 못했어요. '복사하기'로 복사해서 보내 주세요.";
    } finally {
      saveBtn.disabled = false;
    }
  });
  wrap.querySelector('[data-act="copy"]')!.addEventListener("click", async () => {
    const txt = asText(collect()) + "\n\n" + JSON.stringify(collect().log);
    try {
      await navigator.clipboard.writeText(txt);
      status.textContent = "복사했어요. 메신저에 붙여 넣어 보내 주세요.";
    } catch {
      pre.textContent = txt;
      (wrap.querySelector("details") as HTMLDetailsElement).open = true;
      status.textContent = "자동 복사가 막혀 있어요. 아래 글을 직접 선택해서 복사해 주세요.";
    }
  });
  wrap.querySelector('[data-act="close"]')!.addEventListener("click", close);
  void connect();
}

/** Open the form from game code (stage clear card). */
export function openFeedback() {
  (document.getElementById("fbbtn") as HTMLButtonElement | null)?.click();
}
