// Story text on screen. Two forms:
//   cutscene  the game holds; letterbox bars; a subtitle box at the bottom
//             with the speaker's name, typed out. Click / Enter / Space:
//             finish the line, then the next one. Esc or the skip button:
//             the whole scene at once.
//   bark      a short line at the top over live play; never stops the game.
// Everything is DOM, laid over the game canvas, sized from its rectangle.

import { SFX } from "../audio/sfx";
import { SPEAKERS, Line, SCENES, BARKS, RECORDS } from "../story/script";

const KEY = "non.story.v1";

/** Story settings, saved per browser. */
export const STORY = (() => {
  const d = { on: true };
  try { Object.assign(d, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { /* storage off */ }
  return d;
})();
export function saveStory() { try { localStorage.setItem(KEY, JSON.stringify(STORY)); } catch { /* storage off */ } }

/** Lines already seen this session (page load): retries stay quick. */
const seen: Set<string> = ((window as any).__storySeen ??= new Set<string>());
export function resetSeen() { seen.clear(); }

const CPS = 30;          // cutscene typing speed (characters / s)
const BARK_CPS = 46;

function pauseAfter(ch: string) {
  if (ch === "…") return 0.22;
  if (ch === "." || ch === "?" || ch === "!") return 0.16;
  if (ch === ",") return 0.08;
  return 0;
}

/** Positions an element over the game canvas. */
function canvasRect() {
  const c = document.querySelector("#game canvas") as HTMLCanvasElement | null;
  return c ? c.getBoundingClientRect() : new DOMRect(0, 0, innerWidth, innerHeight);
}

class Typer {
  private raf = 0;
  done = true;
  private finishNow = () => {};
  /** Types `text` into `el`; resolves when the whole line is shown. */
  run(el: HTMLElement, text: string, who: string, cps: number, voice = true): Promise<void> {
    cancelAnimationFrame(this.raf);
    this.done = false;
    el.textContent = "";
    const chars = Array.from(text);
    return new Promise((resolve) => {
      let i = 0, t = 0, last = performance.now(), wait = 0, blips = 0;
      const finish = () => { cancelAnimationFrame(this.raf); el.textContent = text; this.done = true; resolve(); };
      this.finishNow = finish;
      const tick = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (wait > 0) wait -= dt;
        else t += dt;
        while (wait <= 0 && t >= 1 / cps && i < chars.length) {
          t -= 1 / cps;
          const ch = chars[i++];
          el.textContent += ch;
          if (voice && ch.trim() && blips++ % 2 === 0) SFX.voice(who, i);
          wait = pauseAfter(ch);
        }
        if (i >= chars.length) { finish(); return; }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
  }
  finish() { if (!this.done) this.finishNow(); }
  stop() { cancelAnimationFrame(this.raf); this.done = true; }
}

class StoryUI {
  private layer!: HTMLDivElement;
  private box!: HTMLDivElement;
  private nameEl!: HTMLDivElement;
  private textEl!: HTMLDivElement;
  private nextEl!: HTMLDivElement;
  private skipEl!: HTMLButtonElement;
  private bark!: HTMLDivElement;
  private barkName!: HTMLSpanElement;
  private barkText!: HTMLSpanElement;
  private typer = new Typer();
  private barkTyper = new Typer();
  private barkQueue: Line[] = [];
  private barkBusy = false;
  private barkTimer = 0;
  active = false;
  private advance: (() => void) | null = null;
  private skipAll: (() => void) | null = null;

  private build() {
    if (this.layer) return;
    this.layer = document.createElement("div");
    this.layer.id = "story";
    this.layer.hidden = true;
    this.layer.innerHTML = `
      <div class="st-box" role="dialog" aria-live="polite">
        <div class="st-name"></div>
        <div class="st-text"></div>
        <div class="st-next" aria-hidden="true">▼</div>
        <button type="button" class="st-skip">건너뛰기 <span>Esc</span></button>
      </div>`;
    document.body.appendChild(this.layer);
    this.box = this.layer.querySelector(".st-box")!;
    this.nameEl = this.layer.querySelector(".st-name")!;
    this.textEl = this.layer.querySelector(".st-text")!;
    this.nextEl = this.layer.querySelector(".st-next")!;
    this.skipEl = this.layer.querySelector(".st-skip")!;
    this.layer.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest(".st-skip")) return;
      e.preventDefault();
      e.stopPropagation();
      this.advance?.();
    });
    this.skipEl.addEventListener("click", (e) => { e.stopPropagation(); this.skipAll?.(); });
    // capture phase: these keys belong to the dialogue while it is up
    window.addEventListener("keydown", (e) => {
      if (!this.active) return;
      if (e.code === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); this.skipAll?.(); return; }
      if (e.code === "Enter" || e.code === "Space" || e.code === "KeyE" || e.code === "KeyZ" || e.code === "NumpadEnter") {
        e.preventDefault(); e.stopImmediatePropagation();
        if (!e.repeat) this.advance?.();
        return;
      }
      // gameplay keys do nothing during a scene (Tab, M, H still work)
      if (!["Tab", "KeyM", "KeyH", "F1", "Backquote"].includes(e.code)) { e.stopImmediatePropagation(); }
    }, true);

    this.bark = document.createElement("div");
    this.bark.id = "bark";
    this.bark.setAttribute("role", "status");
    this.bark.innerHTML = `<span class="bk-name"></span><span class="bk-text"></span>`;
    document.body.appendChild(this.bark);
    this.barkName = this.bark.querySelector(".bk-name")!;
    this.barkText = this.bark.querySelector(".bk-text")!;
    window.addEventListener("resize", () => this.place());
  }

  private place() {
    const r = canvasRect();
    const fs = Math.max(13, Math.min(22, r.height * 0.032));
    this.layer?.style.setProperty("--fs", `${fs}px`);
    if (this.box) {
      this.box.style.left = `${r.left + r.width * 0.08}px`;
      this.box.style.width = `${r.width * 0.84}px`;
      this.box.style.bottom = `${innerHeight - r.bottom + r.height * 0.035}px`;
    }
    if (this.bark) {
      this.bark.style.top = `${r.top + r.height * 0.045}px`;
      this.bark.style.fontSize = `${Math.max(12, Math.min(17, r.height * 0.026))}px`;
    }
  }

  private setSpeaker(nameEl: HTMLElement, line: Line) {
    const sp = SPEAKERS[line.who];
    nameEl.textContent = sp.name ? (sp.tag ? `${sp.name} · ${sp.tag}` : sp.name) : "";
    nameEl.style.color = sp.color;
    nameEl.hidden = !sp.name;
  }

  /** Play lines as a cutscene. Resolves when done or skipped. */
  cutscene(lines: Line[]): Promise<void> {
    this.build();
    this.place();
    this.hideBark();
    this.active = true;
    this.layer.hidden = false;
    this.layer.classList.remove("out");
    void this.layer.offsetWidth;
    this.layer.classList.add("in");
    return new Promise((resolve) => {
      let i = -1;
      let ended = false;
      const end = () => {
        if (ended) return;
        ended = true;
        this.typer.stop();
        SFX.tapeHiss(false);
        this.active = false;
        this.advance = this.skipAll = null;
        this.layer.classList.remove("in");
        this.layer.classList.add("out");
        setTimeout(() => { if (!this.active) this.layer.hidden = true; }, 260);
        resolve();
      };
      const next = () => {
        i++;
        if (i >= lines.length) { end(); return; }
        const line = lines[i];
        this.setSpeaker(this.nameEl, line);
        this.box.dataset.who = line.who;
        SFX.tapeHiss(line.who === "seo");
        this.nextEl.classList.remove("on");
        this.typer.run(this.textEl, line.text, line.who, CPS).then(() => { if (!ended) this.nextEl.classList.add("on"); });
      };
      this.advance = () => {
        if (!this.typer.done) { this.typer.finish(); return; }
        SFX.storyCue("advance");
        next();
      };
      this.skipAll = end;
      setTimeout(next, 280);
    });
  }

  /** Queue short lines over play. */
  barkLines(lines: Line[]) {
    this.build();
    this.place();
    this.barkQueue.push(...lines);
    if (!this.barkBusy) this.nextBark();
  }

  private nextBark() {
    const line = this.barkQueue.shift();
    if (!line) { this.barkBusy = false; this.bark.classList.remove("on"); return; }
    this.barkBusy = true;
    const show = () => {
      if (this.active) { this.barkQueue.unshift(line); this.barkTimer = window.setTimeout(() => this.nextBark(), 500); return; }
      this.place();
      this.setSpeaker(this.barkName, line);
      this.bark.dataset.who = line.who;
      this.bark.classList.add("on");
      this.barkTyper.run(this.barkText, line.text, line.who, BARK_CPS).then(() => {
        const hold = 1.5 + Array.from(line.text).length * 0.045;
        this.barkTimer = window.setTimeout(() => {
          if (this.barkQueue.length && (this.barkQueue[0].delay ?? 0) < 0.3) { this.nextBark(); return; }
          this.bark.classList.remove("on");
          this.barkTimer = window.setTimeout(() => this.nextBark(), 280);
        }, hold * 1000);
      });
    };
    const d = line.delay ?? 0;
    if (d > 0) this.barkTimer = window.setTimeout(show, d * 1000);
    else show();
  }

  hideBark() {
    if (!this.bark) return;
    this.bark.classList.remove("on");
  }

  /** Drop everything (scene change). */
  clear() {
    window.clearTimeout(this.barkTimer);
    this.barkQueue = [];
    this.barkBusy = false;
    this.barkTyper.stop();
    this.hideBark();
  }
}

export const STORY_UI = new StoryUI();

/** A bark by id, once per session; false if skipped. */
export function bark(id: string): boolean {
  if (!STORY.on || seen.has(id) || !BARKS[id]) return false;
  seen.add(id);
  STORY_UI.barkLines(BARKS[id]);
  return true;
}

/** A record fragment's text (always shown: reading it is the point). */
export function recordLines(id: string) {
  const lines = RECORDS[id];
  if (lines) STORY_UI.barkLines(STORY.on ? lines : lines.slice(0, 1));
}

/** Whether a cutscene would play (story on, not seen yet). */
export function sceneWanted(id: string) {
  return STORY.on && !seen.has(id) && !!SCENES[id];
}

export async function playScene(id: string): Promise<void> {
  if (!sceneWanted(id)) return;
  seen.add(id);
  await STORY_UI.cutscene(SCENES[id]);
}
