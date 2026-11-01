import { VIEW_W, VIEW_H, LITE_MODE, TEST, TEST_DEFAULTS, saveTest, MusicOpt } from "./config";
import { GameScene } from "./scenes/game";
import { SFX } from "./audio/sfx";
import { MUSIC } from "./audio/music";
import { BOSS_MUSIC } from "./audio/bossmusic";
import { ASSASSIN_MUSIC } from "./audio/assassinmusic";
import { ARCHIVE_MUSIC, ARCHIVIST_MUSIC } from "./audio/archivemusic";
import { PROLOGUE_UI } from "./ui/prologue";
import { WALLET } from "./sim/loadout";
import { STORY } from "./ui/story";
import { SAVE } from "./story/save";
import { OUTSKIRTS_MUSIC, CHIEF_MUSIC } from "./audio/outskirtsmusic";
import { MARKET_MUSIC, BULWARK_MUSIC } from "./audio/marketmusic";
import { stageInfo } from "./world/stages";

declare const HERO_PNG: string;
declare const IMAGES: Record<string, string>;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

class BootScene extends Phaser.Scene {
  constructor() { super("boot"); }
  create() {
    const jobs: Promise<void>[] = [
      loadImage(HERO_PNG).then((img) => { this.textures.addSpriteSheet("hero", img, { frameWidth: 96, frameHeight: 80 }); }),
    ];
    for (const [key, src] of Object.entries(IMAGES)) {
      jobs.push(loadImage(src).then((img) => {
        if (key.startsWith("soldier_")) this.textures.addSpriteSheet(key, img, { frameWidth: 64, frameHeight: 64 });
        else if (key === "drone") this.textures.addSpriteSheet(key, img, { frameWidth: 40, frameHeight: 32 });
        else if (key === "blade" || key === "grunt" || key === "chief" || key === "civ") this.textures.addSpriteSheet(key, img, { frameWidth: 96, frameHeight: 80 });
        else if (key === "boss") this.textures.addSpriteSheet(key, img, { frameWidth: 160, frameHeight: 128 });
        else if (key === "assassin") this.textures.addSpriteSheet(key, img, { frameWidth: 96, frameHeight: 96 });
        else this.textures.addImage(key, img);
      }));
    }
    // make sure the HUD font is ready before the first frame
    const fonts = (document as any).fonts?.ready ?? Promise.resolve();
    Promise.all([...jobs, fonts]).then(() => this.scene.start("game"));
  }
}

/**
 * Lite build: register painted canvases as plain image textures. Phaser's
 * addCanvas() wraps each one in a CanvasTexture that reads every pixel back
 * with getImageData(); for the 4400-px level art that read-back stalls the
 * main thread for seconds right after "click to start".
 */
function liteTextures() {
  const TM = (Phaser.Textures.TextureManager as any).prototype;
  if (TM.__lite) return;
  TM.__lite = true;
  TM.addCanvas = function (key: string, source: HTMLCanvasElement) {
    if (this.exists(key)) return null;
    return this.addImage(key, source as unknown as HTMLImageElement);
  };
}

function start() {
  if (LITE_MODE) liteTextures();
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: "game",
    width: VIEW_W,
    height: VIEW_H,
    pixelArt: true,
    backgroundColor: "#07040f",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, GameScene],
    banner: false,
    // lite: never render faster than 60 Hz (high-refresh laptop panels), ask for the fast GPU
    ...(LITE_MODE ? { fps: { limit: 60 }, render: { powerPreference: "high-performance", antialias: false } } : {}),
  });
  (window as any).__game = game;
  (window as any).__sfx = SFX;
  (window as any).__music = MUSIC;
  (window as any).__boss = BOSS_MUSIC;
  (window as any).__boss2 = ASSASSIN_MUSIC;
  (window as any).__arc1 = ARCHIVE_MUSIC;
  (window as any).__wallet = WALLET;
  (window as any).__arc2 = ARCHIVIST_MUSIC;
  (window as any).__out1 = OUTSKIRTS_MUSIC;
  (window as any).__out2 = CHIEF_MUSIC;
  (window as any).__mk1 = MARKET_MUSIC;
  (window as any).__mk2 = BULWARK_MUSIC;
}

/** Lite build: a test panel on the start screen to switch features off one by one. */
function buildTestPanel(startEl: HTMLElement) {
  const css = document.createElement("style");
  css.textContent = `
  #start { overflow-y: auto; }
  #start h1 { font-size: clamp(32px, 6vw, 64px); }
  #start .start-inner { gap: 12px; padding: 12px 0; }
  #start .sub { font-size: 13px; }
  #testpanel { cursor: default; text-align: left; width: min(30rem, 92vw); margin-top: 4px;
    background: rgba(7,5,15,.88); border: 1px solid #3a2a5a; border-top: 2px solid var(--cyan); padding: 10px 14px; }
  #testpanel[open] > *:not(summary) { margin-top: 10px; }
  #start .testers { margin: 0; font-size: 13px; color: #e8e4ff; line-height: 1.6; max-width: 32rem; }
  #start .testers b { color: var(--pink); font-weight: 600; }
  #testpanel summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 8px; }
  #testpanel summary::before { content: "▸"; color: var(--cyan); }
  #testpanel[open] summary::before { content: "▾"; }
  #testpanel summary:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
  #testpanel h2 { display: inline; margin: 0; font: 600 14px var(--f-display, sans-serif); color: var(--cyan); letter-spacing: .08em; }
  #testpanel p { margin: 0; font-size: 12px; color: var(--dim); line-height: 1.5; }
  #testpanel .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr)); gap: 6px 14px; }
  #testpanel label { display: flex; gap: 8px; align-items: center; font-size: 13px; color: #e8e4ff; cursor: pointer; min-height: 24px; }
  #testpanel input { accent-color: #2de2e6; width: 16px; height: 16px; }
  #testpanel select { background: #120c22; color: #e8e4ff; border: 1px solid #3a2a5a; font-size: 13px; padding: 3px 6px; }
  #testpanel .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  #testpanel button { background: #1a1230; color: #e8e4ff; border: 1px solid #4a3a6a; padding: 6px 10px; font-size: 12px; cursor: pointer; }
  #testpanel button:hover { border-color: var(--cyan); }
  #testpanel button:focus-visible, #testpanel select:focus-visible, #testpanel input:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
  #fpsmeter { position: fixed; z-index: 15; top: 8px; left: 50%; transform: translateX(-50%); font: 12px var(--f-num, monospace);
    color: #9ffcff; background: rgba(7,5,15,.75); padding: 2px 8px; border: 1px solid #2a3a5a; pointer-events: none; }`;
  document.head.appendChild(css);
  const meter = document.createElement("div");
  meter.id = "fpsmeter";
  meter.hidden = true;
  document.body.appendChild(meter);

  const toggles: [keyof typeof TEST, string][] = [
    ["rain", "비 / 실내 먼지"],
    ["sfx", "효과음"],
    ["reverb", "잔향 (리버브)"],
    ["particles", "파티클 (불꽃·먼지)"],
    ["bg", "원경 배경 (도시·기계벽·차량)"],
    ["glow", "네온 빛 번짐 · 반사광"],
    ["after", "잔상"],
    ["shake", "화면 흔들림"],
    ["sky", "번개 · 하늘 연출"],
    ["intro", "시작 카메라 연출"],
  ];
  const guide = document.createElement("p");
  guide.className = "testers";
  guide.innerHTML = "테스트 버전이에요. 플레이한 뒤 화면 오른쪽 위 <b>피드백 남기기</b>로 의견을 보내 주세요.<br><b>Tab</b> 메뉴 맨 위에서 원하는 스테이지·체크포인트·보스 장면으로 바로 이동할 수 있어요.";
  startEl.querySelector(".start-inner")?.appendChild(guide);
  const panel = document.createElement("details");
  panel.id = "testpanel";
  panel.innerHTML = `
    <summary><h2>렉이 있다면: 테스트 옵션</h2></summary>
    <p>체크를 끄면 그 기능을 잠시 지웁니다. 하나씩 꺼 보며 어느 것이 무거운지 찾아 주세요. 설정은 이 브라우저에 저장됩니다.</p>
    <div class="grid">${toggles.map(([k, label]) => `<label><input type="checkbox" data-k="${k}"> ${label}</label>`).join("")}</div>
    <div class="row">
      <label for="tp-music" style="min-height:auto">음악</label>
      <select id="tp-music">
        <option value="all">모두 켜기</option>
        <option value="s1">스테이지 1 음악만 (옥상 + 홍귀)</option>
        <option value="s2">스테이지 2 음악만 (타워 + 암살자)</option>
        <option value="stage">스테이지 음악만 (보스곡 끔)</option>
        <option value="boss">보스곡만 (스테이지 음악 끔)</option>
        <option value="off">전부 끄기</option>
      </select>
      <label style="min-height:auto"><input type="checkbox" data-k="fps"> FPS 표시</label>
    </div>
    <div class="row">
      <button type="button" data-preset="min">최소로 (전부 끄기)</button>
      <button type="button" data-preset="def">기본값으로</button>
      <span style="font-size:12px;color:var(--dim)">패널 밖을 클릭하면 게임 시작</span>
    </div>`;
  const sync = () => {
    panel.querySelectorAll<HTMLInputElement>("input[data-k]").forEach((i) => { i.checked = !!(TEST as any)[i.dataset.k!]; });
    (panel.querySelector("#tp-music") as HTMLSelectElement).value = TEST.music;
  };
  panel.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t instanceof HTMLInputElement && t.dataset.k) (TEST as any)[t.dataset.k] = t.checked;
    if (t.id === "tp-music") TEST.music = t.value as MusicOpt;
    saveTest();
  });
  panel.addEventListener("click", (e) => {
    e.stopPropagation(); // clicks here configure, they don't start the game
    const b = (e.target as HTMLElement).closest("button");
    if (!b) return;
    if (b.dataset.preset === "def") Object.assign(TEST, TEST_DEFAULTS);
    else {
      for (const [k] of toggles) (TEST as any)[k] = false;
      TEST.music = "off";
      TEST.fps = true;
    }
    saveTest();
    sync();
  });
  panel.addEventListener("keydown", (e) => e.stopPropagation());
  sync();
  if (Object.keys(TEST_DEFAULTS).some((k) => (TEST as any)[k] !== (TEST_DEFAULTS as any)[k])) panel.open = true;
  startEl.querySelector(".start-inner")?.appendChild(panel);
}

const startEl = document.getElementById("start")!;
if (LITE_MODE) buildTestPanel(startEl);
let started = false;

// A saved game (written at checkpoints and stage clears): offer to carry on.
const saved = new URLSearchParams(location.search).has("stage") ? null : SAVE.peek();
if (saved) {
  const box = startEl.querySelector(".saved") as HTMLElement | null;
  const press = startEl.querySelector(".press") as HTMLElement | null;
  if (box) {
    box.hidden = false;
    const info = stageInfo(saved.stage);
    const when = new Date(saved.at);
    const pad = (n: number) => String(n).padStart(2, "0");
    const where = box.querySelector(".where");
    if (where) where.textContent = `${info.title.kick} ${info.title.ko} · ${saved.cp >= 0 ? `체크포인트 ${saved.cp + 1}` : "처음"} · ${when.getMonth() + 1}/${when.getDate()} ${pad(when.getHours())}:${pad(when.getMinutes())} 저장`;
    box.addEventListener("click", (e) => {
      e.stopPropagation();
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      if (b.dataset.start === "continue") begin("continue");
      else begin("new");
    });
  }
  if (press) press.hidden = true;
  startEl.setAttribute("aria-label", "이어하기 또는 처음부터");
}

function begin(mode: "new" | "continue" = saved ? "continue" : "new") {
  if (started) return;
  started = true;
  SFX.init();
  startEl.classList.add("gone");
  const q = new URLSearchParams(location.search);
  const W = window as any;
  if (mode === "continue" && saved) {
    SAVE.restore(saved);
    W.__continue = { stage: saved.stage, cp: saved.cp };
    start();
    setTimeout(() => (document.querySelector("#game canvas") as HTMLCanvasElement | null)?.focus(), 50);
    return;
  }
  if (saved) SAVE.clear();
  if (STORY.on && !q.has("autostart") && !q.has("nointro") && !q.has("stage")) {
    // the game loads behind the prologue; its first black shot waits for that
    // once loaded, the game sleeps until the prologue is over (no double work on laptops)
    W.__prologue = true;
    let slept = false;
    PROLOGUE_UI.play(() => {
      W.__prologue = false;
      if (slept) W.__game?.loop.wake();
      W.__afterPrologue?.();
    }, () => {
      if (W.__gameReady && !slept) { slept = true; W.__game?.loop.sleep(); }
      return !!W.__gameReady;
    });
  }
  start();
  setTimeout(() => (document.querySelector("#game canvas") as HTMLCanvasElement | null)?.focus(), 50);
}
// with a save on the screen, only its two buttons start the game (Enter carries on)
startEl.addEventListener("click", () => { if (!saved) begin(); });
window.addEventListener("keydown", (e) => { if (!started && (e.code === "Enter" || e.code === "Space") && !(e.target as HTMLElement)?.closest?.("button")) begin(); });
if (new URLSearchParams(location.search).has("autostart")) begin();
