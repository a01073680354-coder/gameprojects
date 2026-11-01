import { TUNE, TUNE_DEFS, FEATURES, saveTune, defaultTune } from "../config";
import { STAGES, stageInfo } from "../world/stages";
import { playable } from "../story/manifest";
import { SAVE, LESSONS } from "../story/save";
import { CHOICES, CHOICE_KEYS, bridgeCeasefire } from "../story/state";
import { STORY, saveStory, resetSeen } from "./story";
import { WALLET } from "../sim/loadout";

const visibleDefs = () => TUNE_DEFS.filter((d) => FEATURES.wall || d.group !== "벽");

// Live tuning panel: every constant is a slider, saved per browser.

export class TuningPanel {
  root: HTMLDivElement;
  private inputs = new Map<string, { range: HTMLInputElement; out: HTMLSpanElement }>();
  open = false;
  onChange: ((key: string) => void) | null = null;
  /** Set by the running scene: jump to a stage / checkpoint / boss phase. */
  onWarp: ((stage: number, target: string) => void) | null = null;
  /** Set by the running scene: play the prologue again. */
  onPrologue: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "tune";
    const head = document.createElement("div");
    head.className = "tune-head";
    head.innerHTML = `<b>조작감 튜닝</b><span class="tune-hint">Tab으로 닫기</span>`;
    this.root.appendChild(head);

    const body = document.createElement("div");
    body.className = "tune-body";
    this.root.appendChild(body);
    this.buildWarp(body);
    this.buildStory(body);

    let group = "";
    let box: HTMLDivElement | null = null;
    for (const d of visibleDefs()) {
      if (d.group !== group) {
        group = d.group;
        const h = document.createElement("div");
        h.className = "tune-group";
        h.textContent = group;
        body.appendChild(h);
        box = document.createElement("div");
        body.appendChild(box);
      }
      const row = document.createElement("label");
      row.className = "tune-row";
      const name = document.createElement("span");
      name.className = "tune-name";
      name.textContent = d.label;
      const out = document.createElement("span");
      out.className = "tune-val";
      const range = document.createElement("input");
      range.type = "range";
      range.min = String(d.min);
      range.max = String(d.max);
      range.step = String(d.step);
      range.value = String(TUNE[d.key]);
      out.textContent = fmt(TUNE[d.key], d.step);
      range.addEventListener("input", () => {
        TUNE[d.key] = parseFloat(range.value);
        out.textContent = fmt(TUNE[d.key], d.step);
        saveTune(TUNE);
        this.onChange?.(d.key);
      });
      // keep game keys from being eaten by the slider
      range.addEventListener("keydown", (e) => { if (e.code !== "Tab") e.preventDefault(); });
      row.append(name, out, range);
      box!.appendChild(row);
      this.inputs.set(d.key, { range, out });
    }

    const foot = document.createElement("div");
    foot.className = "tune-foot";
    const reset = document.createElement("button");
    reset.textContent = "기본값으로";
    reset.onclick = () => {
      Object.assign(TUNE, defaultTune());
      saveTune(TUNE);
      this.sync();
      this.onChange?.("*");
    };
    const copy = document.createElement("button");
    copy.textContent = "값 복사";
    copy.onclick = async () => {
      const txt = JSON.stringify(TUNE, null, 1);
      try {
        await navigator.clipboard.writeText(txt);
        copy.textContent = "복사됨";
      } catch {
        copy.textContent = "복사 실패";
      }
      setTimeout(() => (copy.textContent = "값 복사"), 1200);
    };
    foot.append(reset, copy);
    this.root.appendChild(foot);
    host.appendChild(this.root);
  }

  /** Story: subtitles on/off, the prologue again, forget what was seen. */
  private buildStory(body: HTMLElement) {
    const h = document.createElement("div");
    h.className = "tune-group";
    h.textContent = "스토리";
    body.appendChild(h);
    const box = document.createElement("div");
    box.className = "warp story-opts";
    const lab = document.createElement("label");
    lab.style.cssText = "display:flex;gap:8px;align-items:center;font-size:13px;cursor:pointer";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = STORY.on;
    cb.addEventListener("change", () => { STORY.on = cb.checked; saveStory(); });
    lab.append(cb, document.createTextNode("스토리 대사 · 컷신 보기"));
    const pro = document.createElement("button");
    pro.textContent = "프롤로그 다시 보기";
    pro.onclick = () => { this.toggle(false); this.onPrologue?.(); };
    const again = document.createElement("button");
    again.textContent = "본 대사 다시 나오게";
    again.title = "이번 접속에서 이미 본 컷신과 대사를 다시 보여 줍니다.";
    again.onclick = () => { resetSeen(); again.textContent = "초기화됨"; setTimeout(() => (again.textContent = "본 대사 다시 나오게"), 1200); };
    box.append(lab, pro, again);
    body.appendChild(box);
    // shop testing
    const h2 = document.createElement("div");
    h2.className = "tune-group";
    h2.textContent = "테스트 · 상점";
    body.appendChild(h2);
    const box2 = document.createElement("div");
    box2.className = "warp story-opts";
    const b = (label: string, fn: () => void) => {
      const el = document.createElement("button");
      el.textContent = label;
      el.onclick = () => { fn(); const t = el.textContent; el.textContent = "완료"; setTimeout(() => (el.textContent = t), 900); };
      return el;
    };
    box2.append(
      b("폐회로 칩 +300", () => { WALLET.chips += 300; }),
      b("기억 파편 +5", () => { WALLET.shards += 5; }),
      b("구매·강화 초기화", () => {
        WALLET.owned.clear(); WALLET.curses.clear(); WALLET.curse = null; WALLET.bought = {};
        WALLET.concentrated = WALLET.shields = WALLET.batteries = 0; WALLET.visited.clear();
      }),
    );
    body.appendChild(box2);
  }

  /** Test warp: any stage, any checkpoint, straight into a boss phase. */
  private buildWarp(body: HTMLElement) {
    const h = document.createElement("div");
    h.className = "tune-group";
    h.textContent = "테스트 · 장면 이동";
    body.appendChild(h);
    const box = document.createElement("div");
    box.className = "warp";
    const stageSel = document.createElement("select");
    stageSel.setAttribute("aria-label", "스테이지");
    // in story order, with the number the player sees
    for (const st of playable()) {
      if (!STAGES.some((s) => s.id === st.id)) continue;
      const o = document.createElement("option");
      o.value = String(st.id);
      o.textContent = `${stageInfo(st.id!).title.kick} · ${st.ko}`;
      stageSel.appendChild(o);
    }
    const targetSel = document.createElement("select");
    targetSel.setAttribute("aria-label", "이동할 곳");
    const fill = () => {
      const info = STAGES.find((s) => s.id === Number(stageSel.value))!;
      const L = info.build();
      targetSel.innerHTML = "";
      const add = (v: string, label: string) => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = label;
        targetSel.appendChild(o);
      };
      add("start", "시작 지점");
      L.checkpoints.forEach((_cp, i) => add(`cp:${i}`, `체크포인트 ${i + 1}`));
      if (L.boss) {
        add("boss0", `${info.boss.ko} · 등장 연출부터`);
        const single = L.boss.kind === "chief" || L.boss.kind === "bulwark";
        add("boss1", `${info.boss.ko} · ${single ? "전투 바로" : "1페이즈 바로"}`);
        if (single) return; // one phase only
        add("boss2", `${info.boss.ko} · 2페이즈부터`);
        if (!L.boss.kind || L.boss.kind === "oni") add("finale", `${info.boss.ko} · 천참 피날레`);
        else if (L.boss.kind === "assassin") add("desp", `${info.boss.ko} · 발악 패턴 (2페이즈, 체간 절반)`);
        else add("erase", `${info.boss.ko} · 전 기록 소거 (2페이즈, 체력 45%)`);
      }
    };
    stageSel.addEventListener("change", fill);
    fill();
    const go = document.createElement("button");
    go.textContent = "이동";
    go.onclick = () => {
      this.onWarp?.(Number(stageSel.value), targetSel.value);
      this.toggle(false);
    };
    for (const el of [stageSel, targetSel]) el.addEventListener("keydown", (e) => { if (e.code !== "Tab" && !e.code.startsWith("Arrow") && e.code !== "Enter") e.preventDefault(); });
    const hint = document.createElement("p");
    hint.className = "warp-hint";
    hint.textContent = "체력은 가득 찬 채로 이동합니다. 보스 옵션은 바로 그 장면부터 시작해요.";
    box.append(stageSel, targetSel, go, hint);
    body.appendChild(box);

    // saves, lessons and the story decisions so far (bible p.31)
    const h2 = document.createElement("div");
    h2.className = "tune-group";
    h2.textContent = "테스트 · 저장과 선택 기록";
    body.appendChild(h2);
    const state = document.createElement("pre");
    state.className = "choice-state";
    this.showState = () => {
      const sv = SAVE.peek();
      const lines = CHOICE_KEYS.map((k) => `${k} = ${CHOICES[k] === null ? "—" : String(CHOICES[k])}`);
      lines.push(`bridge_ceasefire = ${bridgeCeasefire()} (규칙으로 계산)`);
      lines.push(`배운 조작: ${LESSONS.size ? [...LESSONS].join(", ") : "없음"}`);
      lines.push(`저장: ${sv ? `${stageInfo(sv.stage).title.kick} · ${sv.cp >= 0 ? `체크포인트 ${sv.cp + 1}` : "처음"}` : "없음"}`);
      state.textContent = lines.join("\n");
    };
    const row = document.createElement("div");
    row.className = "warp";
    const wipe = document.createElement("button");
    wipe.textContent = "저장 지우기";
    wipe.onclick = () => { SAVE.clear(); this.showState?.(); };
    const relearn = document.createElement("button");
    relearn.textContent = "조작 안내 다시 보기";
    relearn.onclick = () => { LESSONS.clear(); this.showState?.(); };
    row.append(wipe, relearn);
    body.append(state, row);
    this.showState();
  }
  private showState: (() => void) | null = null;

  sync() {
    for (const d of visibleDefs()) {
      const r = this.inputs.get(d.key)!;
      r.range.value = String(TUNE[d.key]);
      r.out.textContent = fmt(TUNE[d.key], d.step);
    }
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    if (this.open) this.showState?.();
    this.root.classList.toggle("on", this.open);
    const btn = document.getElementById("tunebtn");
    if (btn) btn.hidden = this.open;
    if (!this.open) (document.activeElement as HTMLElement | null)?.blur?.();
  }
}

function fmt(v: number, step: number) {
  const dec = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return v.toFixed(dec);
}
