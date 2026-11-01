import { VIEW_W, VIEW_H, STEP, TUNE, TILE, LITE_MODE, TEST, RUNTIME } from "../config";
import { Input, InputFrame } from "../core/input";
import { Level, Arena } from "../world/level";
import { stageInfo, STAGES } from "../world/stages";
import { paintTowerLevel, paintTowerReflections, paintTowerSky, paintMachineWall, paintKamikaze, paintDashHint } from "../world/art_tower";
import { paintArchiveLevel, paintArchiveReflections, paintArchiveSky, paintCapsuleWall, paintTurret, paintRecord, paintPod } from "../world/art_archive";
import {
  paintLevel, paintReflections, paintSky, paintSkyline, paintLamp, paintLightCone, paintSign,
  paintVent, paintAntenna, paintSoftGlow, PAL, paintBeacon, paintGate, paintFaceSign,
  paintBarrel, paintStandSign, paintHint, paintCar, paintBlimp, paintDropship,
} from "../world/art";
import { drawText, textWidth } from "../ui/pixelfont";
import { Player } from "../entities/player";
import { World, WorldEvents, ParryInfo, ClashInfo, Prop } from "../sim/world";
import { Soldier } from "../sim/soldier";
import { Bullet } from "../sim/bullet";
import { Particles, Shake, Afterimages, Debris } from "../fx/fx";
import { TuningPanel } from "../ui/tuning";
import { CombatRenderer } from "../render/combat";
import { Hud } from "../render/hud";
import { Cinema } from "../render/cinema";
import { StageRenderer, paintBeam, paintBossMask, LightSrc } from "../render/stage";
import { SFX } from "../audio/sfx";
import { MUSIC } from "../audio/music";
import { BOSS_MUSIC } from "../audio/bossmusic";
import { ASSASSIN_MUSIC } from "../audio/assassinmusic";
import { ARCHIVE_MUSIC, ARCHIVIST_MUSIC } from "../audio/archivemusic";
import { Boss } from "../sim/boss";
import { Assassin, ASN } from "../sim/assassin";
import { Archivist } from "../sim/archivist";
import { WALLET, BOUNTY, earn, commitEarnings, forfeitEarnings } from "../sim/loadout";
import { SHOP_UI } from "../ui/shop";
import { SCENES } from "../story/script";
import { paintForge, paintSupply, paintBazaar, paintShard } from "../world/art_shop";
import { PLAYLOG, initFeedback, openFeedback } from "../ui/feedback";
import { STORY, STORY_UI, bark, playScene, sceneWanted, recordLines } from "../ui/story";
import { PROLOGUE_UI } from "../ui/prologue";
import { PLACE_BARKS, CLEAR_LINES } from "../story/script";
import {
  paintOutskirtsLevel, paintOutskirtsReflections, paintOutskirtsSky, paintDistantCity, paintShanty,
  paintOutskirtsDeco, paintBurner,
} from "../world/art_outskirts";
import { OUTSKIRTS_MUSIC, CHIEF_MUSIC } from "../audio/outskirtsmusic";
import { MARKET_MUSIC, BULWARK_MUSIC } from "../audio/marketmusic";
import {
  paintMarketLevel, paintMarketReflections, paintMarketSky, paintUpperCity, paintUndercity, paintMarketDeco, paintSecretCover,
} from "../world/art_market";
import { paintBulwarkHull, paintBulwarkGun, paintBulwarkShield, BUL_FRAME } from "../world/art_bulwark";
import { Bulwark, BUL } from "../sim/bulwark";
import { Chief } from "../sim/chief";
import { FIRST_STAGE, nextAfter } from "../story/manifest";
import { SAVE, LESSONS } from "../story/save";
import { CHOICES } from "../story/state";
import type { Fire } from "../sim/world";

declare const HERO_ANIMS: Record<string, { start: number; end: number; fps: number; loop: boolean }>;
declare const CIV_ANIMS: Record<string, { start: number; end: number; fps: number; loop: boolean }>;

const C = {
  cyan: 0x2de2e6, cyanHi: 0xb8fdff, pink: 0xff2a6d, pinkHi: 0xff9cc2,
  purple: 0xb967ff, amber: 0xffb347, spark: 0xffe08a, dust: 0x8a7fb0, dustLo: 0x5a5080,
  white: 0xffffff, orange: 0xff8a2a, steel: 0x6a6f88, oil: 0x2a2436, yellow: 0xf9f871,
};
const SIGN_HEX = [C.pink, C.cyan, C.yellow];
const BARREL_HEX = [[0xd8492c, 0xff8a5c], [0x2f8aa8, 0x7fd8e8], [0x8a8240, 0xc8c27a]];

interface Rain { x: number; y: number; z: number; }
type Script = { kind: "intro" | "teaser" | "boss"; t: number; dur: number } | null;

export class GameScene extends Phaser.Scene {
  level!: Level;
  world!: World;
  sprite!: Phaser.GameObjects.Sprite;
  input2!: Input;
  fx!: Particles;
  debris!: Debris;
  bladeAfterT = 0;
  bgDim = 0;
  healGlow = 0;
  chainCount = 0;
  shake = new Shake();
  after!: Afterimages;
  tuning!: TuningPanel;
  combat!: CombatRenderer;
  stage!: StageRenderer;
  hud!: Hud;
  cinema!: Cinema;

  acc = 0;
  freeze = 0; // real seconds of hit-stop
  simTime = 0;
  realTime = 0;
  camX = 0;
  camY = 0;
  zoom = 1;
  look = 0;
  kickX = 0;
  kickY = 0;
  manual = false; // test hook: when true, only manualStep advances the sim
  script: Script = null;
  arenaFocus: { x: number; y: number; t: number } | null = null;
  rappelled = new Set<number>();
  usedSlash = false;
  helpTouched = false;
  usedParry = false;

  bgFar!: Phaser.GameObjects.TileSprite;
  bgMid!: Phaser.GameObjects.TileSprite;
  rainBack!: Phaser.GameObjects.Graphics;
  rainFront!: Phaser.GameObjects.Graphics;
  rain: Rain[] = [];
  signs: { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; t: number; base: number }[] = [];
  blinkers: { img: Phaser.GameObjects.Image; phase: number }[] = [];
  vents: { x: number; y: number; t: number }[] = [];
  debugG!: Phaser.GameObjects.Graphics;
  debugOn = false;
  debugEl!: HTMLDivElement;

  beacons: { lamp: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image }[] = [];
  gateGlow: Phaser.GameObjects.Image | null = null;
  gateX = 0;
  gateY = 0;
  banner!: Phaser.GameObjects.Graphics;
  bannerT = -1;
  bannerText = "";
  bannerColor = 0x2de2e6;
  stats = { start: 0, kills: 0, wrecks: 0, parries: 0, perfects: 0, deaths: 0, cines: 0, props: 0, bossStart: 0, bossTime: -1 };
  bossFx = new Set<string>();
  maskFall: { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; rot: number; vr: number; floor: number; rest: boolean } | null = null;
  clearT = -1;
  animKey = "idle";
  animTime = 0;
  afterTimer = 0;
  afterFlip = false;
  flashTimer = 0;
  prevCamX = 0;

  get player(): Player { return this.world.player; }
  /** This stage's boss theme. */
  get bm() { const k = this.level?.boss?.kind; return k === "assassin" ? ASSASSIN_MUSIC : k === "archivist" ? ARCHIVIST_MUSIC : k === "chief" ? CHIEF_MUSIC : k === "bulwark" ? BULWARK_MUSIC : BOSS_MUSIC; }
  /** This stage's exploration / combat score. */
  get sm(): { start(): void; stop(fade?: number): void; duck(a: number): void; applyVolume(tc?: number): void; setIntensity(x: number): void; intensity: number; playing: boolean } {
    const t = this.level?.theme;
    return t === "archive" ? ARCHIVE_MUSIC : t === "outskirts" ? OUTSKIRTS_MUSIC : t === "market" ? MARKET_MUSIC : MUSIC;
  }

  stageId = 1;
  private offCanvas: (() => void) | null = null;

  constructor() {
    super("game");
  }

  /** A story cutscene (or the prologue) holds the simulation. */
  storyHold = false;
  private waitingPrologue = false;
  private defeatTalk: { id: string; t: number } | null = null;
  private readyFrames = 0;

  pendingWarp: string | null = null;
  bossSkip: "p2" | "finale" | "desp" | "erase" | null = null;

  init(data: { stage?: number; warp?: string }) {
    this.pendingWarp = data?.warp ?? null;
    const q = Number(new URLSearchParams(location.search).get("stage"));
    // "이어하기" from the start screen: the saved stage and checkpoint, once
    const W = window as any;
    const cont = W.__continue as { stage: number; cp: number } | undefined;
    W.__continue = undefined;
    const contStage = cont && STAGES.some((s) => s.id === cont.stage) ? cont.stage : undefined;
    this.stageId = data?.stage ?? (STAGES.some((s) => s.id === q) ? q : contStage ?? FIRST_STAGE);
    if (!data?.stage && contStage !== undefined && this.stageId === contStage && cont!.cp >= 0) this.pendingWarp = `cp:${cont!.cp}`;
    this.continued = !!cont;
    RUNTIME.stage = this.stageId;
  }
  /** Started from a save: no opening camera move, no fresh-stage handicaps. */
  private continued = false;

  /** Test switches that hide whole layers (lite build). */
  private applyTestSwitches() {
    if (!TEST.bg) {
      for (const o of [this.bgFar, this.bgMid, this.stage.silhouette, this.stage.blimp]) o.setVisible(false);
      for (const c of this.stage.cars) { c.img.setVisible(false); c.tail.setVisible(false); }
      for (const o of this.children.list) if ((o as any).texture?.key === "haze") (o as any).setVisible(false);
    }
    if (!TEST.glow) {
      // every additive glow sprite: reflections, lamp cones, sign halos
      for (const o of this.children.list) {
        const im = o as Phaser.GameObjects.Image;
        if (im.type === "Image" && im.blendMode === Phaser.BlendModes.ADD) im.setVisible(false);
      }
    }
    if (!TEST.sky) this.stage.lightningT = 1e9;
    if (TEST.fps) this.fpsEl = document.getElementById("fpsmeter");
    if (this.fpsEl) this.fpsEl.hidden = false;
  }
  fpsEl: HTMLElement | null = null;
  private fpsAcc = { t: 0, n: 0, worst: 0 };

  /** Add a canvas texture, replacing any left over from a previous stage. */
  tex(key: string, c: HTMLCanvasElement) {
    if (this.textures.exists(key)) this.textures.remove(key);
    this.textures.addCanvas(key, c);
  }

  /** Leave for another stage: a fresh scene, so nothing carries over by accident. */
  goStage(id: number, warp?: string) {
    const game = this.game;
    window.setTimeout(() => {
      game.scene.remove("game");
      game.scene.add("game", GameScene, true, { stage: id, warp });
    }, 0);
  }

  /** Tab menu warp: another stage goes through a fresh scene, the same stage in place. */
  warpTo(stage: number, target: string) {
    if (stage !== this.stageId) { this.goStage(stage, target); return; }
    this.applyWarp(target);
  }

  private applyWarp(target: string) {
    // drop any scripted moment in progress
    if (this.script) { this.script = null; this.input2.locked = false; this.cinema.endScene(); }
    document.getElementById("title")?.classList.remove("show");
    document.getElementById("bosscard")?.classList.remove("show");
    const w = this.world, L = this.level;
    this.bossSkip = null;
    if (target === "start") { this.respawn(true); return; }
    let cp = -1;
    if (target.startsWith("cp:")) cp = Number(target.slice(3));
    else {
      // the last checkpoint before the boss arena
      const arena = L.arenas.find((a) => a.boss);
      L.checkpoints.forEach((c, i) => { if (!arena || c.x < arena.trigger) cp = i; });
    }
    w.checkpoint = cp;
    const at = cp >= 0 ? L.checkpoints[cp].x : 0;
    if (L.teaser && at > L.teaser.trigger) w.teaserDone = true;
    if (target.startsWith("boss") || target === "finale") w.bossSeen = target !== "boss0";
    this.respawn(false);
    this.player.hp = this.player.maxHp;
    this.player.ampoules = this.player.maxAmpoules;
    if (target.startsWith("cp:") || target === "start") return;
    // walk straight into the arena
    const arena = L.arenas.find((a) => a.boss)!;
    const floor = L.boss!.y;
    this.player.x = (arena.trigger + 2) * TILE;
    this.player.y = floor * TILE - this.player.h;
    this.player.vx = this.player.vy = 0;
    this.snapCamera();
    if (target === "boss2") this.bossSkip = "p2";
    if (target === "finale") this.bossSkip = "finale";
    if (target === "desp") this.bossSkip = "desp";
    if (target === "erase") this.bossSkip = "erase";
  }

  /** Boss-phase shortcuts, applied once the fight is under way. */
  private runBossSkip() {
    const b = this.world.boss;
    if (!this.bossSkip || !b) return;
    if (this.bossSkip === "desp" && b instanceof Assassin && b.phase === 2 && b.state === "cling") {
      b.posture = Math.ceil(b.postureMax * ASN.despAt) + 2;
      b.sinceHit = 0;
      b.despCD = 0;
      this.bossSkip = null;
      return;
    }
    if (this.bossSkip === "erase" && b instanceof Archivist && b.phase === 2 && b.state === "hang") {
      b.hp = Math.floor(b.hpMax * 0.45) - 1;
      b.timer = 0;
      this.bossSkip = null;
      return;
    }
    if (this.bossSkip === "p2" || this.bossSkip === "finale" || this.bossSkip === "desp" || this.bossSkip === "erase") {
      if (b.phase === 1 && (b.state === "guard" || b.state === "cling" || b.state === "hang")) {
        b.marks = 1;
        b.state = "rise";
        b.timer = 0.05;
        b.stateT = 0;
        if (this.bossSkip === "p2") this.bossSkip = null;
        return;
      }
      if (this.bossSkip === "finale" && b.phase === 2 && b.state === "guard") {
        b.hp = Math.floor(b.hpMax * 0.3);
        b.finaleCD = 0;
        b.timer = 0;
        this.bossSkip = null;
      }
    }
  }

  private cleanup() {
    STORY_UI.clear();
    if (SHOP_UI.open) SHOP_UI.close();
    document.getElementById("shopprompt")?.classList.remove("on");
    document.getElementById("keychip")?.classList.remove("on");
    this.input2?.destroy();
    this.offCanvas?.();
    for (const id of ["bossname", "bosscard", "finalecard", "title"]) document.getElementById(id)?.classList.remove("show");
    const bn = document.getElementById("bossname");
    if (bn) bn.style.opacity = "0";
    const el = document.getElementById("clear");
    if (el) el.hidden = true;
  }

  /** The next playable stage in story order (stages still in production are skipped). */
  private nextId(): number | null {
    const n = nextAfter(this.stageId).next;
    return n && n.id !== null && STAGES.some((s) => s.id === n.id) ? n.id : null;
  }

  nextStage() {
    const el = document.getElementById("clear");
    const id = this.nextId();
    if (!el || el.hidden || id === null) return;
    this.goStage(id);
  }

  private applyStageText() {
    const info = stageInfo(this.stageId);
    const set = (sel: string, v: string) => { const n = document.querySelector(sel); if (n) n.textContent = v; };
    set("#title .t-kick", info.title.kick);
    set("#title .t-name", info.title.name);
    set("#title .t-ko", info.title.ko);
    set("#bosscard .b-kick", `${info.title.kick} BOSS`);
    set("#bosscard .b-kanji", info.boss.kanji);
    set("#bosscard .b-name", info.boss.en);
    set("#bosscard .b-ko", info.boss.sub);
    const bn = document.getElementById("bossname");
    if (bn) bn.innerHTML = `${info.boss.ko}<small>${info.boss.kanji} · ${info.boss.en}</small>`;
    // how the fight ended, in words (bible: subdued, destroyed and killed are kept apart)
    set("#clear [data-label=boss]", `${info.boss.ko} ${info.finish === "subdue" ? "제압" : info.finish === "destroy" ? "파괴" : "격파"}`);
    const next = document.getElementById("nextstage");
    const { skipped, next: n } = nextAfter(this.stageId);
    if (next) {
      next.hidden = this.nextId() === null;
      const label = next.querySelector(".ns-label");
      if (label && n) label.textContent = `다음: ${stageInfo(n.id!).title.kick} · ${n.ko}`;
    }
    const skip = document.querySelector("#clear .skipnote") as HTMLElement | null;
    if (skip) {
      skip.hidden = !skipped.length || this.nextId() === null;
      skip.textContent = skipped.map((s) => `STAGE ${this.storyNo(s.key)} ${s.ko} — 제작 중`).join(" · ") + (skipped.length ? " (건너뜁니다)" : "");
    }
  }
  private storyNo(key: string) { return 1 + ["outskirts", "market", "rooftop", "spire", "archive", "ward", "rail", "eden", "laplace", "bridge", "finale"].indexOf(key); }

  create() {
    this.level = stageInfo(this.stageId).build();
    // basics taught in STAGE 1 are not taught again on the rooftops (bible p.11)
    if (this.level.theme === "rooftop") this.level.hints = this.level.hints.filter((h) => !LESSONS.has(h.kind));
    this.events.once("destroy", () => this.cleanup());
    this.events.once("shutdown", () => this.cleanup());
    this.applyStageText();
    // scores that belong to another stage fall silent
    for (const m of [MUSIC, ARCHIVE_MUSIC, OUTSKIRTS_MUSIC, MARKET_MUSIC]) if (m !== this.sm && m.playing) m.stop(0.6);
    for (const m of [BOSS_MUSIC, ASSASSIN_MUSIC, ARCHIVIST_MUSIC, CHIEF_MUSIC, BULWARK_MUSIC]) if (m.playing) m.stop(0.6);
    this.makeTextures();
    this.buildBackground();
    this.add.image(0, 0, "level").setOrigin(0).setDepth(0);
    this.add.image(0, 0, "reflect").setOrigin(0).setDepth(0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.buildDecos();
    this.buildStageObjects();

    this.world = new World(this.level, this.makeEvents());
    commitEarnings(); // a stage starts with nothing at stake
    this.sprite = this.add.sprite(0, 0, "hero", 0).setDepth(10);
    this.after = new Afterimages(this, 9.5);
    this.fx = new Particles(this, 20);
    this.bgFx = new Particles(this, 0.42);
    this.debris = new Debris(this, this.level, 8.2);
    this.combat = new CombatRenderer(this);
    this.stage = new StageRenderer(this, this.level, this.fx);
    this.hud = new Hud(this);
    this.cinema = new Cinema(this);
    this.banner = this.add.graphics().setScrollFactor(0).setDepth(65);
    this.debugG = this.add.graphics().setDepth(100);

    const canvas = this.game.canvas;
    canvas.tabIndex = 0;
    this.input2 = new Input(canvas);
    this.input2.mouseScreenX = VIEW_W * 0.75;
    this.input2.mouseScreenY = VIEW_H * 0.5;
    this.input2.onKey = (code) => this.onHotkey(code);
    const skip = () => { if (this.script) this.skipScript(); };
    canvas.addEventListener("pointerdown", skip);
    const fbClear = document.getElementById("fbclear");
    if (fbClear && !fbClear.dataset.wired) { fbClear.dataset.wired = "1"; fbClear.addEventListener("click", (e) => { e.stopPropagation(); openFeedback(); }); }
    const nextBtn = document.getElementById("nextstage");
    const onNext = () => this.nextStage();
    nextBtn?.addEventListener("click", onNext);
    this.offCanvas = () => { canvas.removeEventListener("pointerdown", skip); nextBtn?.removeEventListener("click", onNext); };

    // the tuning drawer lives for the whole session, not per stage
    const W = window as any;
    if (!W.__tuning) {
      W.__tuning = new TuningPanel(document.getElementById("ui")!);
      document.getElementById("tunebtn")?.addEventListener("click", () => {
        W.__tuning.toggle();
        if (!W.__tuning.open) this.game.canvas.focus();
      });
    }
    this.tuning = W.__tuning;
    initFeedback(
      () => { const g = W.__game.scene.getScene("game"); g?.scene.pause(); },
      () => { const g = W.__game.scene.getScene("game"); g?.scene.resume(); g?.game.canvas.focus(); },
    );
    PLAYLOG.stagesSeen.add(this.stageId);
    this.tuning.onWarp = (stage, target) => this.warpTo(stage, target);
    this.tuning.onChange = (k) => {
      if (k === "music" || k === "*") for (const m of [MUSIC, ARCHIVE_MUSIC, OUTSKIRTS_MUSIC, MARKET_MUSIC, BOSS_MUSIC, ASSASSIN_MUSIC, ARCHIVIST_MUSIC, CHIEF_MUSIC, BULWARK_MUSIC]) m.applyVolume();
    };
    this.debugEl = document.getElementById("debug") as HTMLDivElement;

    this.cameras.main.setRoundPixels(true);
    this.snapCamera();
    const q = new URLSearchParams(location.search);
    this.waitingPrologue = !!(window as any).__prologue;
    if (this.waitingPrologue) {
      // the prologue is playing over us: hold everything until it ends
      this.storyHold = true;
      this.input2.locked = true;
      this.hud.alpha = 0;
      (window as any).__afterPrologue = () => this.afterPrologue();
    } else if (!q.has("nointro") && TEST.intro) this.startIntro();
    this.applyTestSwitches();
    // STAGE 1 teaches with key chips and his own words: the full controls card waits behind H
    if ((this.level.lessons.length || this.teaches) && !this.helpTouched) document.getElementById("help")?.classList.add("hide");
    this.applyStartCondition();
    if (this.pendingWarp) { const t = this.pendingWarp; this.pendingWarp = null; this.applyWarp(t); }
    if (!this.waitingPrologue) this.sm.start();
    SFX.onInit = () => { if (!this.waitingPrologue) this.sm.start(); };
    this.tuning.onPrologue = () => this.replayPrologue();
  }

  // ------------------------------------------------------------ textures

  makeTextures() {
    const T = { addCanvas: (k: string, c: HTMLCanvasElement) => this.tex(k, c) };
    if (this.level.theme === "archive") {
      T.addCanvas("level", paintArchiveLevel(this.level));
      T.addCanvas("reflect", paintArchiveReflections(this.level));
      T.addCanvas("sky", paintArchiveSky(VIEW_W, VIEW_H));
      T.addCanvas("far", paintCapsuleWall(1024, VIEW_H + 120, 71, false));
      T.addCanvas("mid", paintCapsuleWall(1024, VIEW_H + 120, 43, true));
    } else if (this.level.theme === "outskirts") {
      T.addCanvas("level", paintOutskirtsLevel(this.level));
      T.addCanvas("reflect", paintOutskirtsReflections(this.level));
      T.addCanvas("sky", paintOutskirtsSky(VIEW_W, VIEW_H));
      T.addCanvas("far", paintDistantCity(1024));
      T.addCanvas("mid", paintShanty(1024, 29, true));
      T.addCanvas("burner", paintBurner());
      const bt = this.textures.get("burner");
      for (let i = 0; i < 3; i++) bt.add(i, 0, i * 32, 0, 32, 24);
    } else if (this.level.theme === "market") {
      T.addCanvas("level", paintMarketLevel(this.level));
      T.addCanvas("reflect", paintMarketReflections(this.level));
      T.addCanvas("sky", paintMarketSky(VIEW_W, VIEW_H));
      T.addCanvas("far", paintUpperCity(1024));
      T.addCanvas("mid", paintUndercity(1024));
      T.addCanvas("bulwark", paintBulwarkHull());
      const bt = this.textures.get("bulwark");
      for (let i = 0; i < 6; i++) bt.add(i, 0, i * BUL_FRAME.w, 0, BUL_FRAME.w, BUL_FRAME.h);
      T.addCanvas("bulwarkGun", paintBulwarkGun());
      T.addCanvas("bulwarkShield", paintBulwarkShield());
      T.addCanvas("namewritten", paintMarketDeco("namewritten")!);
    } else if (this.level.theme === "tower") {
      T.addCanvas("level", paintTowerLevel(this.level));
      T.addCanvas("reflect", paintTowerReflections(this.level));
      T.addCanvas("sky", paintTowerSky(VIEW_W, VIEW_H));
      T.addCanvas("far", paintMachineWall(1024, VIEW_H + 120, 91, false));
      T.addCanvas("mid", paintMachineWall(1024, VIEW_H + 120, 57, true));
    } else {
      T.addCanvas("level", paintLevel(this.level));
      T.addCanvas("reflect", paintReflections(this.level));
      T.addCanvas("sky", paintSky(VIEW_W, VIEW_H));
      T.addCanvas("far", paintSkyline(1024, 11, {
        minTop: 150, maxTop: 250, minW: 24, maxW: 60, body: "#1c1133", rim: "#2a1a48",
        winCols: ["#8a5a9e", "#5a4a9a", "#4a6a8e"], winChance: 0.07, signs: 4, antenna: true,
      }));
      T.addCanvas("mid", paintSkyline(1024, 23, {
        minTop: 190, maxTop: 300, minW: 40, maxW: 96, body: "#100b20", rim: "#2b1d4d",
        winCols: ["#7a5a8e", "#4a7a8e", "#9a8a5a", "#5a4a8a"], winChance: 0.06, signs: 6, antenna: true,
      }));
    }
    T.addCanvas("kamikaze", paintKamikaze());
    {
      const t = this.textures.get("kamikaze");
      for (let i = 0; i < 4; i++) t.add(i, 0, i * 24, 0, 24, 20);
    }
    T.addCanvas("hint_dash", paintDashHint());
    {
      const t = paintTurret();
      T.addCanvas("turret", t.base);
      T.addCanvas("turretGun", t.gun);
      T.addCanvas("record", paintRecord());
      T.addCanvas("shop_forge", paintForge());
      T.addCanvas("shop_supply", paintSupply());
      T.addCanvas("shop_bazaar", paintBazaar());
      T.addCanvas("shard", paintShard());
      T.addCanvas("pod", paintPod());
      const pt = this.textures.get("pod");
      for (let i = 0; i < 3; i++) pt.add(i, 0, i * 64, 0, 64, 56);
    }
    T.addCanvas("lamp", paintLamp());
    T.addCanvas("cone", paintLightCone());
    T.addCanvas("vent", paintVent());
    T.addCanvas("antenna", paintAntenna());
    T.addCanvas("glowPink", paintSoftGlow(64, "255,42,109"));
    T.addCanvas("glowCyan", paintSoftGlow(64, "45,226,230"));
    T.addCanvas("glowAmber", paintSoftGlow(64, "255,179,71"));
    T.addCanvas("glowWhite", paintSoftGlow(64, "255,255,255"));
    T.addCanvas("glowPurple", paintSoftGlow(64, "185,103,255"));
    T.addCanvas("beacon", paintBeacon());
    T.addCanvas("gate", paintGate());
    for (let v = 0; v < 3; v++) {
      const b = paintBarrel(v);
      T.addCanvas(`barrel${v}`, b.whole);
      T.addCanvas(`barrel${v}_dent`, b.dent);
      T.addCanvas(`barrel${v}_top`, b.top);
      T.addCanvas(`barrel${v}_bot`, b.bottom);
      const s = paintStandSign(v);
      T.addCanvas(`stand${v}`, s.whole);
      T.addCanvas(`stand${v}_broken`, s.broken);
      T.addCanvas(`car${v}`, paintCar(v + 1));
    }
    T.addCanvas("hint_slash", paintHint("slash"));
    T.addCanvas("hint_parry", paintHint("parry"));
    T.addCanvas("blimp", paintBlimp());
    T.addCanvas("dropship", paintDropship());
    T.addCanvas("beam", paintBeam());
    T.addCanvas("bossMask", paintBossMask());
    {
      // a small copy of the mask for the one that falls when he does
      const src = paintBossMask();
      const c = document.createElement("canvas");
      c.width = 34; c.height = 27;
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.filter = "brightness(1.4)";
      ctx.drawImage(src, 0, 0, 34, 27);
      T.addCanvas("maskSmall", c);
    }
    const hz = document.createElement("canvas");
    hz.width = 4; hz.height = VIEW_H;
    const hctx = hz.getContext("2d")!;
    const g = hctx.createLinearGradient(0, 0, 0, VIEW_H);
    const arch = this.level.theme === "archive";
    const out = this.level.theme === "outskirts" || this.level.theme === "market";
    // the outskirts: a low wet mist lit amber-pink from the city, not neon magenta
    g.addColorStop(0, arch ? "rgba(60,90,130,0)" : out ? "rgba(90,50,70,0)" : "rgba(120,30,110,0)");
    g.addColorStop(0.6, arch ? "rgba(60,90,130,0.12)" : out ? "rgba(90,50,70,0.14)" : "rgba(120,30,110,0.12)");
    g.addColorStop(1, arch ? "rgba(90,130,170,0.3)" : out ? "rgba(150,80,90,0.3)" : "rgba(160,40,130,0.32)");
    hctx.fillStyle = g;
    hctx.fillRect(0, 0, 4, VIEW_H);
    T.addCanvas("haze", hz);
  }

  buildBackground() {
    this.rain = [];
    this.add.image(0, 0, "sky").setOrigin(0).setScrollFactor(0).setDepth(-100);
    this.bgFar = this.add.tileSprite(0, 0, VIEW_W, VIEW_H + 120, "far").setOrigin(0).setScrollFactor(0).setDepth(-90);
    this.bgMid = this.add.tileSprite(0, 0, VIEW_W, VIEW_H + 120, "mid").setOrigin(0).setScrollFactor(0).setDepth(-80);
    this.add.image(0, 0, "haze").setOrigin(0).setDisplaySize(VIEW_W, VIEW_H).setScrollFactor(0).setDepth(-70);
    this.rainBack = this.add.graphics().setScrollFactor(0).setDepth(-60);
    this.rainFront = this.add.graphics().setScrollFactor(0).setDepth(40);
    const n = !TEST.rain ? 0 : LITE_MODE ? 120 : 170;
    for (let i = 0; i < n; i++) {
      this.rain.push({ x: Math.random() * (VIEW_W + 60), y: Math.random() * VIEW_H, z: 0.25 + Math.random() * 0.75 });
    }
    if (LITE_MODE) this.buildRainSprites();
  }

  /**
   * Lite build: each raindrop is one pre-drawn streak sprite (all batched in a
   * single draw) instead of a dozen 1-px rectangles re-tessellated every frame.
   */
  rainImgs: Phaser.GameObjects.Image[] = [];
  private buildRainSprites() {
    this.rainBack.setVisible(false);
    this.rainFront.setVisible(false);
    const tower = !this.outdoors;
    const archive = this.level.theme === "archive";
    const key = (len: number) => `rain${len}`;
    for (let len = 1; len <= 12; len++) {
      if (this.textures.exists(key(len))) continue;
      const c = document.createElement("canvas");
      c.width = Math.ceil(len * 0.18) + 1;
      c.height = len;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      for (let k = 0; k < len; k++) ctx.fillRect(Math.round(k * 0.18), len - 1 - k, 1, 1);
      this.textures.addCanvas(key(len), c);
    }
    this.rainImgs = this.rain.map((r) => {
      const front = tower ? r.z > 0.9 : r.z > 0.85;
      const spark = tower && r.z > 0.97;
      const len = tower ? (spark ? 2 : 1) : Math.round(4 + 8 * r.z);
      const img = this.add.image(0, 0, key(len)).setOrigin(0, 1).setScrollFactor(0).setDepth(front ? 40 : -60);
      img.setTint(archive ? (spark ? 0xffffff : 0x9ffcff) : tower ? (spark ? 0xffb347 : 0x8a9ad8) : front ? 0xc8d8ff : 0x9a8cd8);
      return img;
    });
  }

  /** Open sky above (rain falls, lightning strikes) rather than a building around us. */
  get outdoors() { return this.level.theme === "rooftop" || this.level.theme === "outskirts" || this.level.theme === "market"; }

  /** Set dressing for the outskirts: furniture, poles, the truck, lights and the shed fires. */
  private buildOutskirtsDeco(d: { kind: string; x: number; y: number; w?: number; h?: number }) {
    const x = d.x * TILE, y = d.y * TILE;
    const FLOOR = ["bed", "bench", "medbox", "stove", "table", "coat", "pole", "crates", "fence", "terminal", "truck", "stairsign"];
    if (d.kind === "fire") {
      // furniture burning against the back wall: drawn behind him, not a hazard
      this.flames.push({ x, y, w: (d.w ?? 2) * TILE, t: Math.random() });
      const glow = this.add.image(x + ((d.w ?? 2) * TILE) / 2, y - 12, "glowAmber").setDepth(0.45).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6 + (d.w ?? 2) * 0.35).setAlpha(0.6);
      this.flickers.push({ img: glow, base: 0.55, rate: 13, amp: 0.25 });
      return;
    }
    if (d.kind === "beaconlight") return; // the truck carries its own
    const c = paintOutskirtsDeco(d.kind, d.w ?? 1, d.h ?? 1);
    if (!c) return;
    const key = `od_${d.kind}_${d.x}_${d.y}`;
    this.tex(key, c);
    const floor = FLOOR.includes(d.kind);
    const img = this.add.image(x, y, key).setOrigin(0, floor ? 1 : 0).setDepth(0.4);
    if (d.kind === "bulb") {
      const g = this.add.image(x + 3, y + 16, "glowAmber").setDepth(0.46).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setAlpha(0.55);
      this.flickers.push({ img: g, base: 0.5, rate: 2, amp: 0.05 });
      this.sways.push({ img, glow: g, x: x + 3, y, phase: Math.random() * 6 });
    } else if (d.kind === "neighbor") {
      const g = this.add.image(x + c.width / 2, y + c.height / 2, "glowAmber").setDepth(0.46).setBlendMode(Phaser.BlendModes.ADD).setScale(1.4).setAlpha(0.45);
      this.flickers.push({ img: g, base: 0.4, rate: 1, amp: 0.04 });
    } else if (d.kind === "terminal") {
      const g = this.add.image(x + 21, y - 30, "glowCyan").setDepth(0.46).setBlendMode(Phaser.BlendModes.ADD).setScale(0.55).setAlpha(0.5);
      this.flickers.push({ img: g, base: 0.45, rate: 4, amp: 0.12 });
    } else if (d.kind === "truck") {
      // two orange beacons turning on the cab roof
      for (const [bx, ph] of [[134, 0], [156, Math.PI]] as [number, number][]) {
        const g = this.add.image(x + bx, y - c.height + 23, "glowAmber").setDepth(0.46).setBlendMode(Phaser.BlendModes.ADD).setScale(0.8);
        this.beaconsOrange.push({ img: g, phase: ph });
      }
    } else if (d.kind === "pole") {
      const g = this.add.image(x + 16, y - c.height + 31, "glowPink").setDepth(0.46).setBlendMode(Phaser.BlendModes.ADD).setScale(0.18).setAlpha(0.7);
      this.blinkers.push({ img: g, phase: Math.random() * 6 });
    }
  }
  flames: { x: number; y: number; w: number; t: number }[] = [];
  flickers: { img: Phaser.GameObjects.Image; base: number; rate: number; amp: number }[] = [];
  sways: { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; x: number; y: number; phase: number }[] = [];
  beaconsOrange: { img: Phaser.GameObjects.Image; phase: number }[] = [];
  bgFx!: Particles;

  buildDecos() {
    let seed = 3;
    for (const d of this.level.decos) {
      const x = d.x * TILE, y = d.y * TILE;
      if (this.level.theme === "outskirts") { this.buildOutskirtsDeco(d); continue; }
      if (this.level.theme === "market") { this.buildMarketDeco(d); continue; }
      if (d.kind === "lamp") {
        const baseY = (d.y + 1) * TILE;
        this.add.image(x + 8, baseY, "lamp").setOrigin(0.5, 1).setDepth(-4);
        this.add.image(x + 8, baseY - 54, "cone").setOrigin(0.5, 0).setDepth(-3).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55);
        this.add.image(x + 8, baseY - 54, "glowAmber").setDepth(-3).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.5).setScale(0.8);
      } else if (d.kind === "sign" || d.kind === "facesign") {
        const face = d.kind === "facesign";
        const { c, color } = face ? paintFaceSign(d.w ?? 3, d.h ?? 3, seed++) : paintSign(d.w ?? 3, d.h ?? 3, seed++);
        const key = `sign${seed}`;
        this.tex(key, c);
        const img = this.add.image(x - (face ? 6 : 8), y - (face ? 6 : 8), key).setOrigin(0).setDepth(face ? 1 : -5);
        const gkey = color === PAL.cyan ? "glowCyan" : "glowPink";
        const glow = this.add.image(x + ((d.w ?? 3) * TILE) / 2, y + ((d.h ?? 3) * TILE) / 2, gkey)
          .setDepth(face ? 1.1 : -6).setBlendMode(Phaser.BlendModes.ADD)
          .setScale(((d.w ?? 3) + (d.h ?? 3)) * 0.55).setAlpha(0.35);
        this.signs.push({ img, glow, t: Math.random() * 5, base: face ? 0.28 : 0.35 });
      } else if (d.kind === "vent") {
        const baseY = (d.y + 1) * TILE;
        this.add.image(x + 8, baseY, "vent").setOrigin(0.5, 1).setDepth(-4);
        this.vents.push({ x: x + 8, y: baseY - 22, t: Math.random() });
      } else if (d.kind === "antenna") {
        const baseY = (d.y + 1) * TILE;
        this.add.image(x + 8, baseY, "antenna").setOrigin(0.5, 1).setDepth(-4);
        const blink = this.add.image(x + 8, baseY - 46, "glowPink").setDepth(-3).setBlendMode(Phaser.BlendModes.ADD).setScale(0.35);
        this.blinkers.push({ img: blink, phase: Math.random() * 6 });
      }
    }
  }

  records: { id: string; img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; x: number; y: number }[] = [];
  noteViews: { id: string; glow: Phaser.GameObjects.Image; mark: Phaser.GameObjects.Graphics; x: number; y: number }[] = [];

  shards: { id: string; img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; x: number; y: number }[] = [];
  shopGlows: { glow: Phaser.GameObjects.Image; base: number }[] = [];

  buildStageObjects() {
    this.records = [];
    this.shards = [];
    this.shopGlows = [];
    for (const sh of this.level.shops) {
      const x = sh.x * TILE + 8, y = sh.y * TILE;
      const col = sh.kind === "forge" ? "glowAmber" : sh.kind === "supply" ? "glowCyan" : "glowPurple";
      const glow = this.add.image(x, y - 30, col).setDepth(-4).setBlendMode(Phaser.BlendModes.ADD).setScale(sh.kind === "supply" ? 1.1 : 1.6).setAlpha(0.35);
      this.add.image(x, y, `shop_${sh.kind}`).setOrigin(0.5, 1).setDepth(-3);
      this.shopGlows.push({ glow, base: 0.35 });
    }
    for (const r of this.level.shards) {
      const x = r.x * TILE + 8, y = r.y * TILE + 8;
      const glow = this.add.image(x, y, "glowAmber").setDepth(8).setBlendMode(Phaser.BlendModes.ADD).setScale(0.45).setAlpha(0.5);
      const img = this.add.image(x, y, "shard").setDepth(8.1);
      this.shards.push({ id: r.id, img, glow, x, y });
    }
    for (const d of this.level.decos) {
      if (d.kind !== "crack") continue;
      // violet light leaking through a wall that isn't quite a wall
      const g = this.add.image(d.x * TILE + 8, d.y * TILE + 8, "glowPurple").setDepth(1).setBlendMode(Phaser.BlendModes.ADD).setScale(0.7).setAlpha(0.5);
      this.shopGlows.push({ glow: g, base: 0.45 });
    }
    for (const r of this.level.records) {
      const x = r.x * TILE + 8, y = r.y * TILE + 8;
      const glow = this.add.image(x, y, "glowCyan").setDepth(8).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setAlpha(0.5);
      const img = this.add.image(x, y, "record").setDepth(8.1);
      this.records.push({ id: r.id, img, glow, x, y });
    }
    this.buildMarketObjects();
    this.noteViews = [];
    for (const n of this.level.notes) {
      const x = n.x * TILE + 8, y = n.y * TILE - 22;
      const glow = this.add.image(x, y, "glowAmber").setDepth(8).setBlendMode(Phaser.BlendModes.ADD).setScale(0.32).setAlpha(0.5);
      const mark = this.add.graphics().setDepth(8.1);
      this.noteViews.push({ id: n.id, glow, mark, x, y });
    }
    for (const cp of this.level.checkpoints) {
      const x = cp.x * TILE + 8, y = cp.y * TILE;
      const lamp = this.add.image(x, y, "beacon").setOrigin(0.5, 1).setDepth(-2).setTint(0x704050);
      const glow = this.add.image(x, y - 41, "glowPink").setDepth(-1).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6).setAlpha(0.35);
      this.beacons.push({ lamp, glow });
    }
    const g = this.level.goal;
    if (g) {
      this.gateX = g.x * TILE + 8;
      this.gateY = g.y * TILE;
      this.gateGlow = this.add.image(this.gateX, this.gateY - 40, "glowPink").setDepth(-6).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4).setAlpha(0.4);
      this.add.image(this.gateX, this.gateY, "gate").setOrigin(0.5, 1).setDepth(-5);
    }
  }

  refreshBeacons() {
    this.beacons.forEach((b, i) => {
      const on = i <= this.world.checkpoint;
      b.lamp.setTint(on ? 0xbffcff : 0x704050);
      b.glow.setTexture(on ? "glowCyan" : "glowPink").setAlpha(on ? 0.7 : 0.3);
    });
  }

  showBanner(text: string, color = 0x2de2e6) {
    this.bannerText = text;
    this.bannerColor = color;
    this.bannerT = 0;
  }

  // ------------------------------------------------------------- scripts

  startIntro() {
    this.script = { kind: "intro", t: 0, dur: 3.4 };
    this.input2.locked = true;
    this.hud.alpha = 0;
    this.cinema.scene(3.4);
    this.cinema.fadeIn(1);
    // start high above the rooftops, ahead of the hero
    this.camX = Phaser.Math.Clamp(this.player.cx + 300, VIEW_W / 2, this.level.pixelW - VIEW_W / 2);
    this.camY = VIEW_H / 2;
    const el = document.getElementById("title");
    if (el) {
      el.classList.remove("show");
      void el.offsetWidth;
      el.classList.add("show");
    }
  }

  skipScript() {
    if (!this.script) return;
    this.script.t = Math.max(this.script.t, this.script.dur - 0.25);
    const b = this.world.boss;
    if (this.script.kind === "boss" && b && b.state === "intro") {
      b.stateT = Math.max(b.stateT, 3.4);
      b.timer = Math.min(b.timer, 0.25);
    }
  }

  private endScript() {
    if (!this.script) return;
    const kind = this.script.kind;
    this.script = null;
    this.input2.locked = false;
    this.cinema.endScene();
    if (kind === "intro") {
      this.time.delayedCall(500, () => bark(`s${this.stageId}-start`));
      document.getElementById("title")?.classList.remove("show");
      // the controls card tucks itself away once play is under way (H brings it back)
      this.time.delayedCall(16000, () => { if (!this.helpTouched) document.getElementById("help")?.classList.add("hide"); });
    }
    if (kind === "teaser") this.sm.duck(1);
    if (kind === "boss") this.stats.bossStart = this.realTime;
  }

  private updateScript(dt: number) {
    const s = this.script;
    if (!s) return;
    s.t += dt;
    if (s.kind === "intro") {
      this.hud.alpha = Math.max(0, Math.min(1, (s.t - s.dur + 0.8) / 0.6));
    }
    if (s.t >= s.dur) this.endScript();
  }

  // ---------------------------------------------------------------- story

  /** Hold the game for a story cutscene; resumes where it was. */
  private async cut(id: string) {
    if (!sceneWanted(id) || this.storyHold) return;
    this.storyHold = true;
    this.input2.locked = true;
    this.cinema.scene(9999);
    try {
      await playScene(id);
    } finally {
      if (this.sys.isActive()) {
        this.storyHold = false;
        this.input2.locked = !!this.script;
        this.input2.latched.clear();
        this.acc = 0;
        if (this.script) this.cinema.scene(Math.max(0.3, this.script.dur - this.script.t));
        else this.cinema.endScene();
      }
    }
  }

  /** The prologue ended: now the stage intro. */
  private afterPrologue() {
    (window as any).__afterPrologue = null;
    if (!this.sys.isActive() || !this.waitingPrologue) return;
    this.waitingPrologue = false;
    this.storyHold = false;
    this.input2.locked = false;
    this.input2.latched.clear();
    this.hud.alpha = 1;
    if (TEST.intro) this.startIntro();
    else this.time.delayedCall(500, () => bark(`s${this.stageId}-start`));
    this.sm.start();
  }

  /** From the Tab menu. */
  replayPrologue() {
    if (PROLOGUE_UI.active) return;
    this.scene.pause();
    this.sm.duck(0);
    this.bm.duck(0.0, 0.3);
    PROLOGUE_UI.play(() => {
      this.sm.duck(1);
      this.bm.duck(1, 0.6);
      this.scene.resume();
      this.game.canvas.focus();
    });
  }

  /** Lines tied to places on the map (each once, only near its spot). */
  private storyTick() {
    this.lessonTick();
    if (this.storyHold || this.script) return;
    const px = this.player.cx / TILE;
    if (this.simTime > 0.6 && px < this.level.spawnX / TILE + 30 && !TEST.intro) bark(`s${this.stageId}-start`);
    const boss = this.bossFight();
    if (boss instanceof Chief && boss.state !== "dead" && boss.hp <= 3 && boss.hp > 0) bark("s11-cha-low");
    if (boss) return; // the arena has its own lines
    for (const b of PLACE_BARKS[this.stageId] ?? []) {
      if (px > b.x && px < b.x + 24 && bark(b.id) && b.id === "s12-hide") this.npcAnim("hider", "beckon");
    }
  }

  // --------------------------------------------------------------- events

  makeEvents(): WorldEvents {
    return {
      jump: (kind, dir) => this.onJump(kind, dir),
      land: (impact) => this.onLand(impact),
      dashStart: (dx, dy) => this.onDashStart(dx, dy),
      dashEnd: () => {},
      dashRefill: () => this.onDashRefill(),
      heal: (k) => this.onHeal(k),
      guard: (k) => {
        const p = this.player;
        if (k === "shield") { this.combat.popup("BLOCKED", p.cx, p.y - 22, 0x9ffcff, 0x0a3a40, 1, 0.8); this.combat.ring(p.cx, p.y + 20, C.cyan, 30, 0.3, 2); SFX.heavyClank(p.cx); }
        if (k === "grip") { this.combat.popup("ABSORBED", p.cx, p.y - 22, 0xffcf7a, 0x5a3a10, 1, 0.8); SFX.heavyClank(p.cx); }
        if (k === "seal") this.combat.popup("SEAL -2", p.cx, p.y - 22, 0xff6f91, 0x5a1020, 1, 0.8);
      },
      kamikazeArm: (s, quick) => this.onKamikazeArm(s, quick),
      kamikazeBoom: (s, hit, dodged) => this.onKamikazeBoom(s, hit, dodged),
      ampouleGain: () => { SFX.heal("gain"); this.hud.vialGained(); this.combat.popup("+AMPOULE", this.player.cx, this.player.y - 14, 0x6dffc0, 0x0a4a3a, 1, 0.9); },
      fire: (f) => this.onFire(f),
      bulwark: (b, kind, x, y) => this.onBulwark(b, kind, x, y),
      wallSlide: () => {},
      freeze: (s) => { this.freeze = Math.max(this.freeze, s); },
      parryStart: () => {
        const p = this.player;
        if (this.world.soldiers.some((s) => s.kind === "kamikaze" && s.state === "armed" && Math.hypot(s.cx - p.cx, s.cy - p.cy) < 80)) {
          this.combat.popup("NO PARRY · DASH", p.cx, p.y - 22, 0xe8c8ff, 0x3a1060, 1, 0.7);
        }
        this.combat.startSlash(p.aimX, p.aimY);
        SFX.swish();
      },
      parryWhiff: () => {},
      parry: (info) => this.onParry(info),
      shot: (s, b) => this.onShot(s, b),
      alert: (s) => {
        this.combat.alert(s);
        if (s.kind === "kamikaze" && this.stageId === 2) bark("s2-kamikaze");
        if (s.kind === "rifle" && this.stageId === 1) bark("s1-rifle");
        if (s.kind === "rifle" && this.stageId === 11) bark("s11-rifle");
        if (s.kind === "turret" && this.stageId === 3) { bark("s3-turret"); this.coach("s3-turret", "천장 <b>포탑</b>은 칼이 닿지 않아요. 총알을 <b>되받아쳐</b> 부수세요.", 4.5); }
        if (s.kind === "kamikaze") { SFX.kamikaze("lock", s.cx); this.time.delayedCall(450, () => SFX.kamikaze("go", s.cx)); }
        else if (!s.def.melee) SFX.alert(s.cx); else SFX.glint(s.cx);
      },
      aimStart: (s) => SFX.aimStart(s.id, s.cx, TUNE.telegraph * s.def.telegraphMul),
      aimLock: (s) => SFX.aimLock(s.id, s.cx),
      bulletWall: (b) => this.onBulletWall(b),
      soldierHurt: (s, b) => this.onSoldierHurt(s, b),
      soldierDie: (s, b, last) => this.onSoldierDie(s, b, last),
      playerHit: (fatal, b) => this.onPlayerHit(fatal, b),
      dodge: (b) => this.onDodge(b),
      heavyBlocked: (b) => this.onHeavyBlocked(b),
      checkpoint: (i) => this.onCheckpoint(i),
      pit: (fatal) => this.onPit(fatal),
      stageClear: () => this.onStageClear(),
      slashStart: (combo) => {
        if (combo >= 2) this.lessonDone("slash");
        const p = this.player;
        this.combat.startCut(p.slashAimX, p.slashAimY, combo, p.facing);
        SFX.slash(combo);
      },
      meleeHit: (s, b) => this.onMeleeHit(s, b),
      guardBlock: (s, x, y) => this.onGuardBlock(s, x, y),
      clash: (c) => this.onClash(c),
      danger: (s) => {
        this.combat.danger(s);
        SFX.danger(s.cx);
        if (s instanceof Chief) this.lesson("heavy");
      },
      glint: (s) => { this.combat.glint(s); SFX.glint(s.cx); },
      enemySwing: (s, heavy) => this.onEnemySwing(s, heavy),
      postureBreak: (s) => this.onPostureBreak(s),
      deathblow: (s) => this.onDeathblow(s),
      propHit: (pr, broken, dx, dy, byBullet) => this.onPropHit(pr, broken, dx, dy, byBullet),
      propLand: (pr) => {
        SFX.barrel(pr.cx, false);
        this.shake.add(0.1);
        this.fx.burst(pr.cx, pr.y + pr.h, {
          count: 10, speed: [30, 100], angle: [190, 350], life: [0.2, 0.4], size: [2, 3], sizeEnd: 1,
          colors: [C.dust, C.dustLo], drag: 0.1, grav: 40,
        });
      },
      arenaStart: (a) => this.onArenaStart(a),
      arenaClear: (a) => this.onArenaClear(a),
      enterLand: (s) => this.onEnterLand(s),
      teaser: () => this.onTeaser(),
      perilous: (s, kind) => {
        this.combat.peril(s);
        SFX.perilous(s.cx);
        this.shake.add(0.1);
        if (kind === "flame") this.lesson("peril");
        if (s instanceof Chief && kind === "flame") { if (Math.random() < 0.5) bark("s11-cha-flame"); }
      },
      bossIntro: (b, long) => this.onBossIntro(b, long),
      bossCharge: (s, kind) => {
        SFX.bossCharge(s.cx, kind);
        if (kind === "laser") { this.shake.add(0.35); this.combat.light(s.cx + s.facing * 40, s.bottom - 14, "purple", 2); }
      },
      finale: (b, kind, from) => this.onFinale(b, kind, from),
      missileCut: (b) => {
        SFX.missileCut(b.x);
        this.combat.cutHit();
        this.fx.burst(b.x, b.y, {
          count: 26, speed: [60, 260], angle: [0, 360], life: [0.2, 0.5], size: [1, 3],
          colors: [C.purple, 0xe8c8ff, C.white, C.orange], add: true, grav: 200, drag: 0.04,
        });
        this.combat.ring(b.x, b.y, C.purple, 30, 0.25, 2);
        this.combat.light(b.x, b.y, "purple", 1.4);
        this.combat.popup("CUT", b.x, b.y - 12, 0xe8c8ff, 0x3a1060, 1, 0.6);
        this.freeze = Math.max(this.freeze, 0.05);
        this.shake.add(0.25);
      },
      bossSmash: (b) => this.onBossSmash(b),
      bossRise: (b) => this.onBossRise(b),
      assassin: (b, kind) => this.onAssassin(b, kind),
      archivist: (b, kind) => this.onArchivist(b, kind),
      gateZap: (x, y) => {
        SFX.bossCharge(x, "laser");
        this.combat.light(x, y, "purple", 1.4);
        this.fx.burst(x, y, { count: 14, speed: [60, 200], angle: [0, 360], life: [0.15, 0.35], size: [1, 2], colors: [0xb967ff, 0xffffff], add: true, drag: 0.05 });
        this.coach("s3-gate", "보라색 <b>레이저 문</b>은 패링할 수 없어요. 꺼진 틈에 지나가거나 <b>대쉬</b>로 통과하세요.", 4.5);
      },
      record: (id, x, y) => this.onRecord(id, x, y),
      shard: (_id, x, y) => {
        this.lesson("shard");
        SFX.heal("gain");
        this.fx.burst(x, y, { count: 18, speed: [30, 120], angle: [0, 360], life: [0.3, 0.8], size: [1, 2], colors: [0xffcf7a, 0xffffff, 0xffe9c2], add: true, drag: 0.05, grav: -20 });
        this.combat.light(x, y, "amber", 1.2);
        this.combat.popup(`+1 SHARD`, x, y - 16, 0xffcf7a, 0x5a3a10, 1, 1.0);
        this.coach("shard", "<b>기억 파편 ◈</b>: 숨겨진 곳과 보스에게서 얻어요. 어딘가의 <b>망각시장</b>에서 쓸 수 있다고 합니다.", 4.5);
      },
      loadout: (k) => {
        const p = this.player;
        this.combat.popup(k === "shield" ? "SHIELD UP" : "BATTERY", p.cx, p.y - 22, k === "shield" ? 0x9ffcff : 0x6dffc0, 0x0a3a40, 1, 1.0);
        SFX.heal("gain");
      },
      bossDefeated: (b) => this.onBossDefeated(b),
    };
  }

  feet() { return { x: this.player.cx, y: this.player.bottom }; }

  onJump(kind: "ground" | "wall" | "super", dir: number) {
    this.lessonDone("jump");
    const f = this.feet();
    SFX.jump();
    this.fx.burst(f.x, f.y - 1, {
      count: kind === "super" ? 16 : 10, speed: [30, 110], angle: [180, 360], life: [0.25, 0.45],
      size: [2, 4], sizeEnd: 1, colors: [C.dust, C.dustLo], drag: 0.1, grav: 40, spreadX: 10,
    });
    if (kind === "super") {
      this.fx.burst(f.x, f.y - 20, {
        count: 14, speed: [120, 260], angle: dir > 0 ? [160, 200] : [-20, 20], life: [0.2, 0.35],
        size: [1, 2], colors: [C.cyan, C.cyanHi], add: true, stretch: true, drag: 0.06,
      });
      this.shake.add(0.2);
    }
  }

  onLand(impact: number) {
    const f = this.feet();
    const k = Math.min(1, impact / TUNE.maxFall);
    SFX.land(k);
    const n = Math.round(6 + 12 * k);
    for (const side of [-1, 1]) {
      this.fx.burst(f.x + side * 4, f.y - 1, {
        count: n, speed: [30, 60 + 120 * k], angle: side < 0 ? [185, 230] : [-50, -5], life: [0.25, 0.5],
        size: [2, 4], sizeEnd: 1, colors: [C.dust, C.dustLo], drag: 0.1, grav: 30,
      });
    }
    // water kicked up off the wet roof
    this.fx.burst(f.x, f.y - 1, {
      count: Math.round(4 + 8 * k), speed: [40, 120 + 80 * k], angle: [200, 340], life: [0.2, 0.4], size: [1, 1],
      colors: [0xb8c8ff, 0x8a9ad8], alpha: 0.7, grav: 500,
    });
    if (k > 0.75) this.shake.add(0.18 * k);
  }

  onDashStart(dx: number, dy: number) {
    this.lessonDone("dash");
    const p = this.player;
    SFX.dash();
    const back = (Math.atan2(-dy, -dx) * 180) / Math.PI;
    this.fx.burst(p.cx, p.cy, {
      count: 22, speed: [80, 260], angle: [back - 35, back + 35], life: [0.18, 0.38],
      size: [1, 3], sizeEnd: 1, colors: [C.cyan, C.cyanHi, C.pink], add: true, stretch: true, drag: 0.08,
    });
    this.fx.burst(p.cx, p.cy, {
      count: 18, speed: [140, 170], angle: [0, 360], life: [0.12, 0.2],
      size: [2, 2], colors: [C.cyanHi], add: true, drag: 0.15,
    });
    this.shake.add(0.22);
    this.afterTimer = 0;
  }

  onDashRefill() {
    this.flashTimer = 0.06;
    const p = this.player;
    this.fx.burst(p.cx, p.cy - 6, {
      count: 10, speed: [40, 90], angle: [0, 360], life: [0.2, 0.35],
      size: [1, 2], colors: [C.cyanHi, C.cyan], add: true, drag: 0.1,
    });
  }

  dashTips = 0;
  beepT = new Map<number, number>();

  onKamikazeArm(s: Soldier, quick: boolean) {
    SFX.kamikaze("arm", s.cx);
    this.combat.ring(s.cx, s.cy, C.purple, 20, 0.2, 2);
    this.beepT.set(s.id, 0);
    const p = this.player;
    // the first times it latches on near you, the game spells out the answer
    if (!quick && this.dashTips < 2 && Math.hypot(p.cx - s.cx, p.cy - s.cy) < 110) {
      this.dashTips++;
      this.cinema.duel(0.3, 0.6, true);
      this.combat.popup("DASH!", p.cx, p.y - 22, 0xffffff, 0x3a1060, 2, 0.9);
      this.combat.popup("SHIFT", p.cx, p.y - 2, 0xb8fdff, 0x0a4a5a, 1, 0.9);
    }
  }

  onKamikazeBoom(s: Soldier, hit: boolean, dodged: boolean) {
    SFX.kamikaze("boom", s.cx);
    this.stats.wrecks++;
    this.bounty("kamikaze", s.cx, s.y);
    this.beepT.delete(s.id);
    const R = 58;
    this.fx.burst(s.cx, s.cy, {
      count: 50, speed: [80, 360], angle: [0, 360], life: [0.25, 0.6], size: [1, 3],
      colors: [C.white, C.spark, C.orange, C.purple, C.pink], add: true, drag: 0.05, grav: 120,
    });
    this.fx.burst(s.cx, s.cy, {
      count: 14, speed: [20, 80], angle: [0, 360], life: [0.7, 1.3], size: [4, 7], sizeEnd: 12,
      colors: [0x3a3048, 0x4a4060, 0x2a2436], alpha: 0.55, drag: 0.04, grav: -20,
    });
    this.fx.burst(s.cx, s.cy, {
      count: 10, speed: [100, 260], angle: [0, 360], life: [0.6, 1.0], size: [2, 2], colors: [0x5a6280, 0x262a3c], grav: 700, drag: 0.02,
    });
    this.combat.ring(s.cx, s.cy, C.white, R, 0.25, 3);
    this.combat.ring(s.cx, s.cy, C.purple, R + 14, 0.4, 2);
    this.combat.light(s.cx, s.cy, "amber", 2.4);
    this.cinema.flashOnce(0xffd0a0, hit ? 0.5 : 0.25);
    const d = Math.hypot(this.player.cx - s.cx, this.player.cy - s.cy);
    this.shake.add(d < 160 ? 0.6 : 0.3);
    this.freeze = Math.max(this.freeze, 0.05);
    if (dodged) {
      const p = this.player;
      SFX.kamikaze("dodge");
      this.stage.doneHint("dash");
      this.cinema.duel(0.25, 0.45, true);
      this.combat.popup("PERFECT DODGE", p.cx, p.y - 20, 0xb8fdff, 0x0a4a5a, 1, 0.9);
      this.combat.ring(p.cx, p.cy, C.cyanHi, 30, 0.3, 2);
      this.flashTimer = 0.08;
    }
  }

  onHeal(kind: "start" | "done" | "cancel" | "empty") {
    const p = this.player;
    if (kind === "done") { PLAYLOG.heals++; this.lessonDone("heal"); }
    SFX.heal(kind);
    if (kind === "empty") { this.hud.vialDenied(); return; }
    if (kind === "start") {
      this.fx.burst(p.cx + p.facing * 4, p.y + 14, {
        count: 8, speed: [10, 40], angle: [240, 300], life: [0.3, 0.6], size: [1, 1], colors: [0x6dffc0, 0xe0fff2], add: true, grav: -40,
      });
      return;
    }
    if (kind === "cancel") {
      this.fx.burst(p.cx + p.facing * 4, p.y + 14, {
        count: 14, speed: [60, 180], angle: [0, 360], life: [0.2, 0.4], size: [1, 2], colors: [0x6dffc0, 0xffffff, 0x9a9aa8], add: true, grav: 500,
      });
      this.combat.popup("SPILLED", p.cx, p.y - 14, 0xff9cc2, 0x5a1030, 1, 0.8);
      return;
    }
    this.fx.burst(p.cx, p.cy, {
      count: 26, speed: [30, 120], angle: [0, 360], life: [0.4, 0.8], size: [1, 2], colors: [0x6dffc0, 0xe0fff2, C.cyanHi], add: true, drag: 0.05, grav: -60,
    });
    this.combat.ring(p.cx, p.cy, 0x6dffc0, 30, 0.35, 2);
    this.combat.light(p.cx, p.cy, "cyan", 1.2);
    this.healGlow = 0.5;
  }

  onParry(info: ParryInfo) {
    if (info.kill && this.stageId === 1) this.time.delayedCall(350, () => bark("s1-firstkill"));
    if (info.kill && this.stageId === 11) this.time.delayedCall(350, () => bark("s11-firstkill"));
    this.lessonDone("parry");
    PLAYLOG.parries++;
    if (info.perfect) PLAYLOG.perfects++;
    this.stats.parries++;
    if (info.perfect) this.stats.perfects++;
    this.usedParry = true;
    this.stage.doneHint("parry");
    const b = info.bullet;
    const p = this.player;
    const perfect = info.perfect;
    const outDeg = (Math.atan2(b.vy, b.vx) * 180) / Math.PI;
    this.combat.slashHit(perfect);
    this.hud.parryPulse();
    SFX.parry(perfect, b.x);
    this.fx.burst(b.x, b.y, {
      count: perfect ? 26 : 16, speed: [140, perfect ? 420 : 320], angle: [outDeg - 50, outDeg + 50], life: [0.12, 0.3],
      size: [1, 2], colors: perfect ? [C.white, C.cyanHi, C.spark] : [C.white, C.spark, C.amber], add: true, stretch: true, drag: 0.07, grav: 250,
    });
    this.fx.burst(b.x, b.y, {
      count: 8, speed: [60, 160], angle: [outDeg + 130, outDeg + 230], life: [0.1, 0.22],
      size: [1, 2], colors: [C.spark, C.white], add: true, stretch: true, drag: 0.1, grav: 300,
    });
    this.combat.ring(b.x, b.y, perfect ? C.white : C.cyanHi, perfect ? 34 : 24, perfect ? 0.26 : 0.18, perfect ? 3 : 2);
    this.combat.light(b.x, b.y, perfect ? "white" : "cyan", perfect ? 1.3 : 1);
    if (perfect) {
      this.combat.ring(b.x, b.y, C.cyan, 52, 0.36, 1);
      this.combat.popup("PERFECT", p.cx, p.y - 16, C.white, 0x0a6a78, 1, 0.75);
      this.cinema.flashOnce(0xbffcff, 0.35);
    }
    this.freeze = Math.max(this.freeze, perfect ? TUNE.stopPerfect : TUNE.stopParry);
    this.shake.add(perfect ? 0.4 : 0.26);
    const sp = b.speed || 1;
    this.kickX += (b.vx / sp) * (perfect ? 6 : 4);
    this.kickY += (b.vy / sp) * (perfect ? 6 : 4);
    if (this.cinema.considerParry(info)) this.stats.cines++;
  }

  onShot(s: Soldier, b: Bullet) {
    SFX.aimStop(s.id);
    SFX.shot(s.kind, s.cx, b.kind);
    const deg = (Math.atan2(b.vy, b.vx) * 180) / Math.PI;
    const purple = b.kind === "heavy" || b.kind === "missile";
    this.combat.muzzle(b.x, b.y, purple ? C.purple : b.kind === "orb" ? C.pink : s.kind === "burst" ? C.amber : C.orange);
    this.combat.light(b.x, b.y, purple ? "purple" : b.kind === "orb" ? "pink" : "amber", purple ? 1.3 : 0.9);
    if (s instanceof Boss) {
      this.fx.burst(b.x, b.y, {
        count: 8, speed: [40, 140], angle: [0, 360], life: [0.15, 0.3], size: [1, 2],
        colors: purple ? [C.purple, 0xe8c8ff] : [C.pink, C.pinkHi], add: true, drag: 0.08,
      });
      this.shake.add(0.06);
      return;
    }
    if (b.kind === "heavy") {
      this.shake.add(0.2);
      this.fx.burst(b.x, b.y, {
        count: 10, speed: [40, 140], angle: [deg - 40, deg + 40], life: [0.2, 0.4], size: [2, 4], sizeEnd: 1,
        colors: [C.purple, 0xe8c8ff], add: true, drag: 0.08,
      });
    }
    if (s.kind === "drone" || s.kind === "turret") return;
    this.fx.burst(b.x, b.y, {
      count: 6, speed: [60, 180], angle: [deg - 25, deg + 25], life: [0.06, 0.14],
      size: [1, 2], colors: [C.spark, C.orange, C.white], add: true, stretch: true, drag: 0.1,
    });
    const sh = s.shoulder();
    this.fx.burst(sh.x, sh.y - 2, {
      count: 1, speed: [60, 110], angle: s.facing > 0 ? [-120, -100] : [-80, -60], life: [0.5, 0.7],
      size: [2, 2], colors: [0xd8b25a], grav: 700, drag: 0.02,
    });
    const d = Math.abs(s.cx - this.player.cx);
    if (d < 260) this.shake.add(0.05);
  }

  onBulletWall(b: Bullet) {
    if (b.kind === "missile") {
      SFX.missileCut(b.x);
      this.fx.burst(b.x, b.y, {
        count: 22, speed: [50, 220], angle: [0, 360], life: [0.25, 0.55], size: [1, 3],
        colors: [C.purple, 0xe8c8ff, C.orange, C.white], add: true, grav: 150, drag: 0.04,
      });
      this.fx.burst(b.x, b.y, {
        count: 6, speed: [10, 40], angle: [240, 300], life: [0.6, 1.1], size: [4, 6], sizeEnd: 10,
        colors: [0x4a4060, 0x3a3048], alpha: 0.45, drag: 0.03, grav: -25,
      });
      this.combat.ring(b.x, b.y, C.purple, 24, 0.22, 2);
      this.combat.light(b.x, b.y, "purple", 1.2);
      this.shake.add(0.18);
      return;
    }
    const enemy = b.owner === "enemy";
    const deg = (Math.atan2(-b.vy, -b.vx) * 180) / Math.PI;
    this.fx.burst(b.x, b.y, {
      count: 7, speed: [60, 200], angle: [deg - 60, deg + 60], life: [0.1, 0.25],
      size: [1, 2], colors: enemy ? [C.spark, C.orange] : [C.cyanHi, C.cyan], add: true, stretch: true, grav: 400, drag: 0.05,
    });
    this.fx.burst(b.x, b.y, {
      count: 2, speed: [10, 30], angle: [deg - 40, deg + 40], life: [0.4, 0.7], size: [3, 4], sizeEnd: 6,
      colors: [0x5a5080], alpha: 0.35, drag: 0.05, grav: -20,
    });
    SFX.wallHit(b.x);
  }

  onSoldierHurt(s: Soldier, b: Bullet) {
    SFX.soldierHurt(s.cx);
    SFX.aimStop(s.id);
    const deg = (Math.atan2(b.vy, b.vx) * 180) / Math.PI;
    this.fx.burst(b.x, b.y, {
      count: 14, speed: [80, 260], angle: [deg - 45, deg + 45], life: [0.12, 0.3],
      size: [1, 2], colors: [C.spark, C.white, C.cyanHi], add: true, stretch: true, grav: 400, drag: 0.05,
    });
    this.combat.ring(b.x, b.y, C.cyanHi, 18, 0.15);
    this.freeze = Math.max(this.freeze, 0.045);
    this.shake.add(0.18);
  }

  /** Drones, turrets and incinerators are machines: they are wrecked, not killed. */
  private isMachine(s: Soldier) { return s.kind === "drone" || s.kind === "turret" || s.kind === "burner" || s.kind === "kamikaze"; }

  onSoldierDie(s: Soldier, b: Bullet, last: boolean) {
    if (this.isMachine(s)) this.stats.wrecks++; else this.stats.kills++;
    this.bounty(s.kind, s.cx, s.y);
    this.chipLesson();
    SFX.aimStop(s.id);
    if (s.kind === "drone" || s.kind === "turret" || s.kind === "burner") {
      SFX.droneDie(s.cx);
      this.fx.burst(s.cx, s.cy, {
        count: 30, speed: [60, 260], angle: [0, 360], life: [0.3, 0.7], size: [1, 3],
        colors: [C.spark, C.orange, C.white, C.pink], add: true, grav: 300, drag: 0.03,
      });
      this.combat.ring(s.cx, s.cy, C.orange, 34, 0.3, 2);
      this.combat.light(s.cx, s.cy, "amber", 1.6);
    } else {
      SFX.soldierDie(s.cx, b.cinematic || last);
    }
    const deg = (Math.atan2(b.vy, b.vx) * 180) / Math.PI;
    this.fx.burst(b.x, b.y, {
      count: 26, speed: [100, 380], angle: [deg - 40, deg + 40], life: [0.15, 0.4],
      size: [1, 2], colors: [C.spark, C.white, C.orange, C.cyanHi], add: true, stretch: true, grav: 450, drag: 0.04,
    });
    this.fx.burst(s.cx, s.cy - 6, {
      count: 10, speed: [80, 220], angle: [deg - 70, deg + 20], life: [0.5, 0.9],
      size: [2, 3], colors: [C.steel, 0x3c4460, s.kind === "burst" ? 0x6a6250 : 0x58617f], grav: 700, drag: 0.02,
    });
    this.fx.burst(s.cx, s.y + 10, {
      count: 6, speed: [10, 40], angle: [240, 300], life: [0.8, 1.4], size: [4, 6], sizeEnd: 10,
      colors: [C.oil, 0x3a3048], alpha: 0.5, drag: 0.03, grav: -30, spreadX: 10,
    });
    this.fx.burst(s.cx + s.facing * 8, s.y + 18, {
      count: 8, speed: [40, 140], angle: [0, 360], life: [0.2, 0.45],
      size: [1, 2], colors: [s.kind === "burst" ? C.amber : C.pink], add: true, grav: 300,
    });
    this.combat.ring(b.x, b.y, C.white, 30, 0.22, 2);
    this.shake.add(b.cinematic ? 0.7 : 0.32);
    if (b.cinematic) {
      this.freeze = Math.max(this.freeze, 0.16);
      this.cinema.impact();
    } else {
      this.freeze = Math.max(this.freeze, 0.07);
      if (last) this.cinema.finale();
    }
  }

  onMeleeHit(s: Soldier, b: Bullet) {
    const armored = !!s.def.armored;
    this.usedSlash = true;
    SFX.slashHit(s.cx, armored);
    this.combat.cutHit();
    const deg = (Math.atan2(b.vy, b.vx) * 180) / Math.PI;
    this.fx.burst(b.x, b.y, {
      count: armored ? 14 : 18, speed: [80, 280], angle: [deg - 50, deg + 50], life: [0.12, 0.32],
      size: [1, 2], colors: armored ? [C.spark, C.white, C.purple] : [C.pinkHi, C.white, C.spark], add: true, stretch: true, grav: 400, drag: 0.05,
    });
    this.combat.ring(b.x, b.y, C.pinkHi, 20, 0.15, 2);
    this.shake.add(armored ? 0.14 : 0.2);
    this.kickX += Math.sign(b.vx) * 3;
  }

  onGuardBlock(s: Soldier, x: number, y: number) {
    if (s instanceof Assassin) bark("s2-null-guard");
    if (s instanceof Assassin) this.coach("asn-noslash", "암살자에게 <b>베기는 통하지 않아요</b>. 오직 <b>패링</b>으로만 체간을 무너뜨릴 수 있어요.");
    SFX.guardBlock(x);
    this.combat.cutHit();
    this.fx.burst(x, y, {
      count: 14, speed: [80, 240], angle: s.facing > 0 ? [100, 260] : [-80, 80], life: [0.1, 0.25],
      size: [1, 2], colors: [C.white, C.spark, C.pink], add: true, stretch: true, grav: 300, drag: 0.05,
    });
    this.combat.ring(x, y, C.white, 14, 0.12, 1);
    this.freeze = Math.max(this.freeze, 0.04);
    this.shake.add(0.12);
  }

  onClash(c: ClashInfo) {
    PLAYLOG.parries++;
    if (c.perfect) PLAYLOG.perfects++;
    this.stats.parries++;
    if (c.perfect) this.stats.perfects++;
    SFX.clash(c.heavy, c.perfect, c.x);
    this.combat.slashHit(c.perfect);
    this.hud.parryPulse();
    for (const [cols, a0] of [[[C.cyanHi, C.white, C.cyan], 180], [[C.pink, C.white, 0xff9060], 0]] as [number[], number][]) {
      this.fx.burst(c.x, c.y, {
        count: c.heavy ? 22 : 14, speed: [120, c.heavy ? 420 : 300], angle: [a0 - 75, a0 + 75], life: [0.12, 0.35],
        size: [1, 2], colors: cols, add: true, stretch: true, grav: 260, drag: 0.06,
      });
    }
    this.combat.ring(c.x, c.y, C.white, c.heavy ? 40 : 28, c.heavy ? 0.3 : 0.2, c.heavy ? 3 : 2);
    this.combat.light(c.x, c.y, "white", c.heavy ? 1.6 : 1.1);
    if (c.heavy) this.combat.ring(c.x, c.y, C.pink, 56, 0.4, 1);
    if (c.perfect) {
      this.combat.popup("PERFECT", this.player.cx, this.player.y - 16, C.white, 0x0a6a78, 1, 0.75);
      this.cinema.flashOnce(0xbffcff, 0.3);
    }
    this.freeze = Math.max(this.freeze, c.heavy ? 0.13 : c.perfect ? 0.1 : 0.075);
    this.shake.add(c.heavy ? 0.55 : 0.3);
    this.kickX += -c.s.facing * (c.heavy ? 6 : 4);
    if (c.heavy && !c.broke && (c.perfect || Math.random() < 0.35)) this.cinema.duel(0.22, 0.32);
  }

  onEnemySwing(s: Soldier, heavy: boolean) {
    const dir = s.facing;
    if (s instanceof Boss) heavy = heavy || s.state === "air";
    // the push-off foot kicks up grit and water
    this.fx.burst(s.cx - dir * 8, s.bottom - 1, {
      count: heavy ? 16 : 8, speed: [40, heavy ? 190 : 110], angle: dir > 0 ? [190, 240] : [-60, -10], life: [0.2, 0.45],
      size: [2, 4], sizeEnd: 1, colors: [C.dust, C.dustLo], drag: 0.1, grav: 40,
    });
    this.fx.burst(s.cx - dir * 6, s.bottom - 1, {
      count: heavy ? 10 : 5, speed: [60, 160], angle: dir > 0 ? [200, 250] : [-70, -20], life: [0.2, 0.35], size: [1, 1],
      colors: [0xb8c8ff, 0x8a9ad8], alpha: 0.7, grav: 500,
    });
    if (heavy) {
      // speed lines streaming behind the iai dash
      this.fx.burst(s.cx, s.cy, {
        count: 10, speed: [220, 360], angle: dir > 0 ? [175, 185] : [-5, 5], life: [0.12, 0.22], size: [1, 2],
        colors: [0xff5070, 0xffc0d0], add: true, stretch: true, spreadY: 30,
      });
      this.shake.add(0.12);
    }
    SFX.enemySwing(s.cx, heavy);
  }

  onPostureBreak(s: Soldier) {
    if (s instanceof Chief) this.lesson("deathblow");
    if (s instanceof Assassin) this.coach("asn-break", "<b>체간 붕괴!</b> 떨어진 암살자에게 다가가 <b>좌클릭</b>으로 인살하세요.", 4);
    SFX.postureBreak(s.cx);
    this.combat.popup("BREAK", s.cx, s.y - 22, 0xffffff, 0x8a1040, 2, 1.1);
    this.combat.ring(s.cx, s.cy, C.yellow, 36, 0.35, 2);
    this.fx.burst(s.cx, s.y + 10, {
      count: 16, speed: [40, 140], angle: [200, 340], life: [0.4, 0.8], size: [1, 2],
      colors: [C.yellow, C.white, C.amber], add: true, grav: 200,
    });
  }

  onDeathblow(s: Soldier) {
    if (s instanceof Boss && s.marks > 1) {
      // first mark: the mask cracks, he drops to a knee
      SFX.impact();
      SFX.postureBreak(s.cx);
      this.bm.duck(0.3, 0.2);
      this.cinema.duel(0.12, 1.0, true);
      this.cinema.flashOnce(0xffffff, 0.6);
      this.combat.clearPopups();
      this.combat.popup("DEATHBLOW", s.cx, s.y - 30, 0xffffff, 0x8a1040, 2, 1.3);
      this.shake.add(0.8);
      this.freeze = Math.max(this.freeze, 0.16);
      this.fx.burst(s.cx + s.facing * 8, s.y + 2, {
        count: 30, speed: [80, 260], angle: s.facing > 0 ? [-80, 40] : [140, 260], life: [0.5, 1.0], size: [1, 3],
        colors: [C.steel, 0x3c3c50, 0x9a9ab0, C.pink], grav: 700, drag: 0.02,
      });
      return;
    }
    if (s instanceof Bulwark) {
      this.cinema.flashOnce(0xffffff, 0.5);
      this.combat.clearPopups();
      this.combat.popup("SHUTDOWN", s.cx, s.y - 30, 0xffffff, 0x6a4a10, 2, 1.6);
      return;
    }
    if (s instanceof Chief) {
      // the first deathblow that does not kill: the sword cuts the baton and the hose
      this.lessonDone("deathblow");
      this.cinema.flashOnce(0xffffff, 0.5);
      this.combat.clearPopups();
      this.combat.popup("DISARMED", s.cx, s.y - 30, 0xffffff, 0x6a4a10, 2, 1.6);
      return;
    }
    if (s instanceof Boss) {
      this.cinema.flashOnce(0xffffff, 0.5);
      this.combat.clearPopups();
      this.combat.popup("DEATHBLOW", s.cx, s.y - 30, 0xffffff, 0x8a1040, 2, 1.6);
      return;
    }
    SFX.impact();
    this.cinema.duel(0.15, 0.45, true);
    this.cinema.flashOnce(0xffffff, 0.45);
    this.combat.clearPopups();
    this.combat.popup("DEATHBLOW", s.cx, s.y - 26, 0xffffff, 0x8a1040, 2, 1.1);
    this.shake.add(0.7);
    this.freeze = Math.max(this.freeze, 0.12);
  }

  onPropHit(pr: Prop, broken: boolean, dx: number, dy: number, byBullet: boolean) {
    const v = pr.def.variant ?? 0;
    const dir = Math.sign(dx) || this.player.facing;
    const hx = byBullet ? pr.cx - dir * 6 : pr.cx - dir * 7, hy = pr.y + pr.h * 0.4;
    if (!byBullet) { this.usedSlash = true; this.combat.cutHit(); }
    if (pr.def.kind === "barrel") {
      const [base, hi] = BARREL_HEX[v % 3];
      SFX.barrel(pr.cx, broken);
      this.fx.burst(hx, hy, {
        count: broken ? 22 : 14, speed: [100, 300], angle: dir > 0 ? [-80, 60] : [120, 260], life: [0.12, 0.3],
        size: [1, 2], colors: [C.white, C.spark, C.amber], add: true, stretch: true, grav: 500, drag: 0.05,
      });
      this.combat.ring(hx, hy, C.white, broken ? 26 : 16, 0.16, 2);
      if (!broken) {
        this.freeze = Math.max(this.freeze, 0.03);
        this.shake.add(0.1);
        return;
      }
      this.stats.props++;
      if (!byBullet) this.stage.doneHint("slash");
      // the drum is cleaved: top half flies along the cut, bottom half tips
      const topY = pr.y + 8, botY = pr.y + pr.h - 10;
      this.debris.spawn(`barrel${v % 3}_top`, pr.cx, topY, dir * (180 + Math.random() * 80), -260 - Math.random() * 80, dir * (8 + Math.random() * 6), 5);
      this.debris.spawn(`barrel${v % 3}_bot`, pr.cx, botY, dir * 40, -60, dir * 1.5, 5);
      this.fx.burst(pr.cx, pr.cy, {
        count: 10, speed: [60, 200], angle: [200, 340], life: [0.4, 0.8], size: [2, 3], colors: [base, hi, 0x2a1a1a], grav: 800, drag: 0.02,
      });
      this.fx.burst(pr.cx, pr.cy + 4, {
        count: 8, speed: [10, 40], angle: [240, 300], life: [0.8, 1.4], size: [4, 6], sizeEnd: 10,
        colors: [0x4a4060, 0x3a3048], alpha: 0.45, drag: 0.03, grav: -25, spreadX: 10,
      });
      // a spray of coolant/fuel
      this.fx.burst(pr.cx, pr.y + 16, {
        count: 14, speed: [60, 200], angle: dir > 0 ? [-120, -20] : [200, 300], life: [0.3, 0.6], size: [1, 2],
        colors: v % 3 === 1 ? [0x7ff6ff, 0x2de2e6] : [0xf9c871, 0xd8b25a], grav: 700,
      });
      this.combat.light(pr.cx, pr.cy, v % 3 === 1 ? "cyan" : "amber", 0.8);
      this.freeze = Math.max(this.freeze, 0.06);
      this.shake.add(0.28);
      this.kickX += dir * 3;
    } else {
      const col = SIGN_HEX[v % 3];
      SFX.signBreak(pr.cx);
      this.stats.props++;
      this.fx.burst(pr.cx, pr.y + 10, {
        count: 20, speed: [80, 260], angle: dir > 0 ? [-100, 40] : [140, 280], life: [0.3, 0.7], size: [1, 2],
        colors: [col, C.white, col], add: true, grav: 600, drag: 0.02,
      });
      this.fx.burst(pr.cx, pr.y + 10, {
        count: 8, speed: [20, 80], angle: [0, 360], life: [0.15, 0.3], size: [1, 1], colors: [C.white], add: true,
      });
      this.debris.spawn(`stand${v % 3}_broken`, pr.cx, pr.y + 14, dir * (80 + Math.random() * 60), -150, dir * 5, 4);
      this.combat.light(pr.cx, pr.y + 10, v % 3 === 1 ? "cyan" : v % 3 === 2 ? "amber" : "pink", 1);
      this.freeze = Math.max(this.freeze, 0.025);
      this.shake.add(0.1);
    }
  }

  onArenaStart(a: Arena) {
    if (this.stageId === 12 && a.group === 6) this.startRaid();
    this.stage.wallOn(a);
    SFX.barrier(true);
    this.showBanner("AMBUSH", C.pink);
    this.time.delayedCall(900, () => bark(`s${this.stageId}-ambush`));
    this.cinema.scene(2.6);
    const xs = a.walls.map((w) => w.x * TILE);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const floor = Math.max(...a.walls.map((w) => (w.y1 + 1) * TILE));
    this.arenaFocus = { x: cx, y: floor - 90, t: 2.6 };
    this.stage.flyover(cx - 420, cx + 420, this.cameras.main.scrollY + 38, 3.4);
    this.rappelled.clear();
    this.shake.add(0.2);
  }

  onArenaClear(_a: Arena) {
    if (this.stageId === 12 && _a.group === 6) this.endRaid();
    this.stage.wallOff(_a);
    SFX.barrier(false);
    if (!_a.boss) this.showBanner("AREA CLEAR");
    if (!_a.boss) this.time.delayedCall(1200, () => bark(`s${this.stageId}-ambush-clear`));
  }

  // ---------------------------------------------------------------- boss

  /** The boss's name in the play log and death notes. */
  private bossName(b: Boss | null | undefined) {
    return b instanceof Bulwark ? "방벽" : b instanceof Chief ? "차승호" : b instanceof Archivist ? "기록관" : b instanceof Assassin ? "암살자" : "홍귀";
  }

  onBossIntro(b: Boss, long: boolean) {
    PLAYLOG.boss(this.bossName(b)).tries++;
    STORY_UI.clear(); // lines still queued from the way here would talk over the duel
    // an ordinary man walking up: a short entrance, no dropship, no roar
    if (b instanceof Chief) b.timer = long ? 2.4 : 0.9;
    if (b instanceof Bulwark) b.timer = long ? 2.4 : 0.9;
    const short = b instanceof Chief || b instanceof Bulwark;
    const dur = short ? (long ? 2.6 : 1.0) : long ? 4.6 : 1.4;
    this.script = { kind: "boss", t: 0, dur };
    this.input2.locked = true;
    this.cinema.scene(dur);
    this.bossFx.clear();
    const a = this.level.arenas.find((ar) => ar.boss)!;
    this.stage.wallOn(a);
    SFX.barrier(true);
    this.sm.stop(long ? 0.8 : 0.3);
    this.bm.stop(0.2);
    this.shake.add(0.15);
    if (b instanceof Chief) return;
    if (b instanceof Bulwark) {
      // floodlights snap on across the yard; the machine's treads grind awake
      this.stage.flash = 0.4;
      SFX.bulwark("wake", b.cx);
      return;
    }
    if (b instanceof Archivist) {
      // the capsules dim; the pod comes down out of the dark on its cables
      this.stage.flash = 0.5;
      if (long) this.time.delayedCall(400, () => SFX.barrier(true));
      return;
    }
    if (b instanceof Assassin) {
      // the shaft goes dark: only the machine walls and a violet visor up on the ceiling
      if (long) { this.stage.flash = 0.7; this.time.delayedCall(300, () => SFX.assassin("drip", b.cx)); }
      return;
    }
    if (long) {
      const cx = (b.arenaMin + b.arenaMax) / 2;
      this.stage.flyover(cx - 460, cx + 520, this.level.boss!.y * TILE - 250, 3.6);
      this.stage.startTeaser();
      this.time.delayedCall(450, () => SFX.glitchVoice());
    }
  }

  /** Timed beats of the entrance, keyed to the boss's own clock. */
  private bossBeats() {
    const b = this.world.boss;
    if (!b || b.state !== "intro") return;
    const once = (k: string) => { if (this.bossFx.has(k)) return false; this.bossFx.add(k); return true; };
    const landAt = b.introLong ? 1.9 : 0;
    // the story beat: NULL-00 is switched on while still up on the ceiling;
    // the oni speaks once he has landed, before the roar
    if (b.introLong && !this.bossFx.has("talk") && b.stateT >= (b instanceof Chief || b instanceof Bulwark ? 0.5 : b instanceof Archivist ? 1.9 : b instanceof Assassin ? 0.8 : landAt + 0.3)) {
      this.bossFx.add("talk");
      this.cut(b instanceof Bulwark ? "s12-bul-intro" : b instanceof Chief ? "s11-cha-intro" : b instanceof Archivist ? "s3-arc-intro" : b instanceof Assassin ? "s2-null-intro" : "s1-oni-intro");
      if (this.storyHold) return;
    }
    if (b instanceof Bulwark) {
      if (b.stateT >= (b.introLong ? 0.9 : 0.1) && once("score")) {
        this.bm.start(0);
        this.shake.add(0.3);
        this.fx.burst(b.cx, b.bottom - 2, { count: 20, speed: [40, 160], angle: [200, 340], life: [0.3, 0.7], size: [2, 4], sizeEnd: 1, colors: [C.dust, C.dustLo], drag: 0.06, grav: 60 });
      }
      if (b.introLong && b.stateT >= 1.3 && once("card")) {
        const el = document.getElementById("bosscard");
        if (el) { el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); }
      }
      return;
    }
    if (b instanceof Chief) {
      // the tank hisses as he opens the valve; the score comes in under it
      if (b.stateT >= (b.introLong ? 0.9 : 0.1) && once("score")) {
        this.bm.start(0);
        SFX.flame(b.cx);
        this.fx.burst(b.cx - b.facing * 10, b.y + 16, { count: 14, speed: [20, 80], angle: [240, 300], life: [0.4, 0.8], size: [2, 4], sizeEnd: 6, colors: [0x6a5a78, 0x4a4060], alpha: 0.5, drag: 0.04, grav: -40 });
        this.combat.light(b.cx, b.cy, "amber", 1.2);
      }
      if (b.introLong && b.stateT >= 1.3 && once("card")) {
        const el = document.getElementById("bosscard");
        if (el) { el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); }
      }
      return;
    }
    if (b instanceof Archivist) {
      if (b.stateT >= 0.1 && once("score")) this.bm.start(0);
      if (b.introLong && b.stateT >= 2.3 && once("card")) {
        const el = document.getElementById("bosscard");
        if (el) { el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); }
        this.combat.ring(b.cx, b.cy, C.cyan, 60, 0.5, 2);
      }
      return;
    }
    if (b instanceof Assassin) {
      if (b.stateT >= landAt + (b.introLong ? 0.1 : 0) && once("drawn")) {
        SFX.assassin("draw", b.cx);
        this.bm.start(b.introLong ? 0 : 0.6);
        this.combat.ring(b.cx, b.cy, C.purple, 40, 0.35, 2);
        this.combat.light(b.cx, b.cy, "purple", 1.6);
      }
      if (b.introLong && b.stateT >= landAt + 1.0 && once("card")) {
        const el = document.getElementById("bosscard");
        if (el) { el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); }
      }
      return;
    }
    if (b.introLong && b.stateT >= landAt && once("land")) {
      SFX.bossLand(b.cx, true);
      this.shake.add(0.9);
      this.cinema.flashOnce(0xff2a6d, 0.35);
      for (const side of [-1, 1]) {
        this.fx.burst(b.cx + side * 10, b.bottom - 1, {
          count: 30, speed: [60, 260], angle: side < 0 ? [185, 235] : [-55, -5], life: [0.4, 0.9],
          size: [2, 5], sizeEnd: 1, colors: [C.dust, C.dustLo, 0x3a3048], drag: 0.06, grav: 60,
        });
      }
      this.fx.burst(b.cx, b.bottom - 2, {
        count: 24, speed: [80, 260], angle: [200, 340], life: [0.4, 0.8], size: [1, 2], colors: [0xb8c8ff, 0x8a9ad8], alpha: 0.8, grav: 500,
      });
      this.combat.ring(b.cx, b.bottom - 4, C.pink, 80, 0.5, 3);
      this.combat.light(b.cx, b.bottom - 20, "pink", 2.4);
    }
    if (b.stateT >= landAt + (b.introLong ? 0.45 : 0.1) && once("roar")) {
      SFX.roar(b.cx, b.introLong ? 1.6 : 1.0);
      this.bm.start(b.introLong ? 0 : 0.6);
      this.shake.add(0.35);
      this.fx.burst(b.cx + b.facing * 8, b.y + 4, {
        count: 26, speed: [60, 200], angle: [0, 360], life: [0.3, 0.7], size: [1, 2],
        colors: [C.pink, C.pinkHi, C.white], add: true, drag: 0.05,
      });
      if (b.introLong) {
        const el = document.getElementById("bosscard");
        if (el) { el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); }
      }
    }
  }

  onBossSmash(b: Boss) {
    SFX.bossLand(b.cx, false);
    SFX.shockwave(b.cx);
    this.shake.add(0.55);
    this.freeze = Math.max(this.freeze, 0.05);
    for (const side of [-1, 1]) {
      this.fx.burst(b.cx + side * 14, b.bottom - 1, {
        count: 22, speed: [80, 240], angle: side < 0 ? [185, 230] : [-50, -5], life: [0.3, 0.7],
        size: [2, 4], sizeEnd: 1, colors: [C.dust, C.dustLo], drag: 0.06, grav: 80,
      });
    }
    this.fx.burst(b.cx, b.bottom - 2, {
      count: 18, speed: [100, 300], angle: [200, 340], life: [0.4, 0.9], size: [1, 3], colors: [0x4a4060, 0x2a2436, C.steel], grav: 900, drag: 0.02,
    });
    this.combat.ring(b.cx, b.bottom - 4, C.pink, 60, 0.35, 3);
    this.combat.light(b.cx, b.bottom - 10, "pink", 1.8);
  }

  onBossRise(b: Boss) {
    PLAYLOG.boss(this.bossName(b)).bestPhase = 2;
    this.time.delayedCall(400, () => bark(b instanceof Archivist ? "s3-arc-p2" : b instanceof Assassin ? "s2-null-p2" : "s1-oni-p2"));
    if (b instanceof Archivist) {
      this.shake.add(0.4);
      this.cinema.flashOnce(0xeef4ff, 0.45);
      this.bm.duck(1, 0.6);
      this.bm.setIntensity(1);
      this.combat.ring(b.cx, b.cy, C.cyan, 90, 0.6, 3);
      this.showBanner("PHASE 2", C.cyan);
      return;
    }
    if (b instanceof Assassin) {
      this.coach("asn-p2", "<b>2페이즈</b>: 경고가 짧아지고, 가끔 천장에서도 내려와요. 고리를 보세요.", 4);
      SFX.assassin("draw", b.cx);
      this.shake.add(0.4);
      this.cinema.flashOnce(0xb967ff, 0.45);
      this.bm.duck(1, 0.6);
      this.bm.setIntensity(1);
      this.fx.burst(b.cx, b.cy, {
        count: 44, speed: [80, 320], angle: [0, 360], life: [0.4, 0.9], size: [1, 3],
        colors: [C.purple, 0xe8c8ff, C.white], add: true, drag: 0.04,
      });
      this.combat.ring(b.cx, b.cy, C.purple, 80, 0.55, 3);
      this.showBanner("PHASE 2", C.purple);
      return;
    }
    SFX.roar(b.cx, 1.8);
    this.stage.startTeaser();
    this.shake.add(0.6);
    this.cinema.flashOnce(0xff2a6d, 0.5);
    this.bm.duck(1, 0.6);
    this.bm.setIntensity(1);
    this.fx.burst(b.cx, b.cy, {
      count: 50, speed: [80, 320], angle: [0, 360], life: [0.4, 0.9], size: [1, 3],
      colors: [C.pink, C.pinkHi, C.white, 0x8a1040], add: true, drag: 0.04,
    });
    this.combat.ring(b.cx, b.cy, C.pink, 90, 0.6, 3);
    this.combat.ring(b.cx, b.cy, C.white, 50, 0.35, 2);
    this.showBanner("PHASE 2", C.pink);
  }

  onBossDefeated(b: Boss) {
    this.stats.bossTime = this.realTime - this.stats.bossStart;
    if (b instanceof Chief) { this.onChiefSubdued(b); return; }
    if (b instanceof Bulwark) { this.onBulwarkDestroyed(b); return; }
    WALLET.chips += BOUNTY.boss;
    WALLET.shards += 2;
    this.time.delayedCall(1600, () => this.combat.popup(`+${BOUNTY.boss}C  +2 SHARDS`, this.player.cx, this.player.y - 30, 0xffcf7a, 0x5a3a10, 1, 1.6));
    SFX.bossDown(b.cx);
    this.bm.stop(2.5);
    this.cinema.duel(0.12, 1.8, true);
    this.cinema.flashOnce(0xffffff, 0.8);
    this.shake.add(0.9);
    this.freeze = Math.max(this.freeze, 0.2);
    if (b instanceof Archivist) {
      this.fx.burst(b.cx, b.cy, {
        count: 70, speed: [80, 360], angle: [0, 360], life: [0.5, 1.4], size: [1, 3],
        colors: [C.cyanHi, C.white, 0xffcf7a, 0x3a8a9a], add: true, drag: 0.03, grav: 100,
      });
      this.combat.ring(b.cx, b.cy, C.white, 110, 0.8, 3);
      this.gateX = b.cx;
      this.gateY = b.floorY;
      this.clearT = 3.4;
      if (sceneWanted("s3-arc-down")) { this.defeatTalk = { id: "s3-arc-down", t: 2.6 }; this.clearT = 1.4; }
      this.time.delayedCall(900, () => this.showBanner("ARCHIVE SILENCED", C.cyan));
      return;
    }
    if (b instanceof Assassin) {
      this.fx.burst(b.cx, b.cy, {
        count: 60, speed: [80, 360], angle: [0, 360], life: [0.5, 1.2], size: [1, 3],
        colors: [C.purple, C.white, 0xe8c8ff, 0x5a1f9a], add: true, drag: 0.03, grav: 120,
      });
      this.combat.ring(b.cx, b.cy, C.white, 100, 0.8, 3);
      this.gateX = b.cx;
      this.gateY = b.bottom;
      this.clearT = 3.4;
      if (sceneWanted("s2-null-down")) { this.defeatTalk = { id: "s2-null-down", t: 2.6 }; this.clearT = 1.4; }
      this.time.delayedCall(900, () => this.showBanner("ASSASSIN DOWN", C.purple));
      return;
    }
    // the mask comes off and falls into the rain
    this.maskFall = {
      img: this.add.image(b.cx + b.facing * 8, b.y - 6, "maskSmall").setDepth(11).setFlipX(b.facing < 0),
      x: b.cx + b.facing * 8, y: b.y - 6, vx: b.facing * 55, vy: -300, rot: 0, vr: b.facing * 6, floor: b.bottom - 3, rest: false,
    };
    this.fx.burst(b.cx, b.y + 10, {
      count: 60, speed: [80, 360], angle: [0, 360], life: [0.5, 1.2], size: [1, 3],
      colors: [C.pink, C.white, C.spark, 0x8a1040], add: true, drag: 0.03, grav: 120,
    });
    this.combat.ring(b.cx, b.cy, C.white, 110, 0.8, 3);
    this.combat.ring(b.cx, b.cy, C.pink, 70, 0.5, 2);
    this.gateX = b.cx;
    this.gateY = b.bottom;
    this.clearT = 3.4;
    // once the mask has settled in the rain: the last words
    if (sceneWanted("s1-oni-down")) { this.defeatTalk = { id: "s1-oni-down", t: 3.0 }; this.clearT = 1.4; }
    this.time.delayedCall(900, () => this.showBanner("ONI SLAIN", C.pink));
  }

  /** 차승호 goes down on his knees, alive; the floor fires gutter out. */
  private onChiefSubdued(b: Chief) {
    CHOICES.seungho_spared = true; // bible: always true; FINAL calls back to it
    const chips = Math.round(BOUNTY.boss * 0.6);
    WALLET.chips += chips;
    this.time.delayedCall(1600, () => this.combat.popup(`+${chips}C`, this.player.cx, this.player.y - 30, 0xffcf7a, 0x5a3a10, 1, 1.4));
    this.world.fires = [];
    SFX.subdue(b.cx);
    this.bm.stop(2.5);
    this.cinema.duel(0.14, 1.6, true);
    this.cinema.flashOnce(0xffffff, 0.6);
    this.shake.add(0.6);
    this.freeze = Math.max(this.freeze, 0.18);
    // the baton's head and a length of hose spin away; the tank vents
    this.fx.burst(b.cx + b.facing * 12, b.y + 20, {
      count: 18, speed: [80, 240], angle: b.facing > 0 ? [-70, 30] : [150, 250], life: [0.5, 1.0], size: [1, 3],
      colors: [0x3a3440, 0x6a6470, 0xffb347, 0xffffff], grav: 700, drag: 0.02,
    });
    this.fx.burst(b.cx - b.facing * 8, b.y + 18, {
      count: 22, speed: [20, 90], angle: [230, 310], life: [0.8, 1.6], size: [3, 5], sizeEnd: 9,
      colors: [0x8a8098, 0x5a5068, 0x4a4060], alpha: 0.45, drag: 0.03, grav: -50,
    });
    this.fx.burst(b.cx, b.y + 20, { count: 16, speed: [60, 200], angle: [0, 360], life: [0.2, 0.5], size: [1, 2], colors: [0xb967ff, 0xe8c8ff, C.white], add: true, drag: 0.05 });
    this.combat.ring(b.cx, b.cy, C.white, 70, 0.6, 2);
    this.gateX = b.cx;
    this.gateY = b.bottom;
    this.clearT = 3.0;
    if (sceneWanted("s11-cha-down")) { this.defeatTalk = { id: "s11-cha-down", t: 2.4 }; this.clearT = 1.2; }
    this.time.delayedCall(900, () => this.showBanner("SUBDUED", C.cyan));
  }

  onFinale(b: Boss, kind: string, from?: { x: number; y: number }) {
    switch (kind) {
      case "start":
        bark("s1-oni-chain");
        SFX.roar(b.cx, 1.2);
        SFX.enemySwing(b.cx, true);
        this.bm.duck(0.12, 0.3);
        this.cinema.scene(30);
        this.shake.add(0.5);
        this.fx.burst(b.cx, b.bottom - 2, {
          count: 30, speed: [80, 260], angle: [200, 340], life: [0.3, 0.7], size: [2, 4], sizeEnd: 1, colors: [C.dust, C.dustLo], grav: 60, drag: 0.05,
        });
        break;
      case "charge": {
        SFX.bossCharge(b.cx, "orbs");
        this.shake.add(0.3);
        const el = document.getElementById("finalecard");
        if (el) { el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); }
        this.chainCount = 0;
        break;
      }
      case "warn": case "feint": case "behind": case "last":
        // he vanishes and flashes in beside you
        if (from) {
          const n = 14;
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            this.fx.burst(from.x + (b.cx - from.x) * t, from.y + (b.cy - from.y) * t, {
              count: 2, speed: [5, 30], angle: [0, 360], life: [0.15, 0.35], size: [1, 2], colors: [C.pink, C.pinkHi, C.white], add: true, drag: 0.1,
            });
          }
        }
        SFX.dash();
        this.combat.ring(b.cx, b.cy, kind === "behind" ? C.purple : C.pink, 26, 0.2, 2);
        if (kind === "behind") this.combat.popup("BEHIND", b.cx, b.y - 44, 0xffffff, 0x8a1040, 1, 0.5);
        if (kind === "last") this.shake.add(0.2);
        break;
      case "parry":
        this.chainCount++;
        this.combat.popup(`${this.chainCount} / 5`, this.player.cx, this.player.y - 26, 0xffffff, 0x8a1040, this.chainCount >= 5 ? 2 : 1, 0.7);
        this.cinema.flashOnce(0xffffff, 0.25 + this.chainCount * 0.05);
        this.freeze = Math.max(this.freeze, 0.06 + this.chainCount * 0.012);
        break;
      case "win":
        this.cinema.endScene();
        this.cinema.duel(0.14, 1.5, true);
        this.cinema.flashOnce(0xffffff, 0.7);
        this.shake.add(0.8);
        this.freeze = Math.max(this.freeze, 0.22);
        SFX.impact();
        this.showBanner("SEVERED", C.pink);
        this.bm.duck(0.5, 0.4);
        break;
      case "fail":
        this.cinema.endScene();
        this.bm.duck(1, 0.6);
        this.combat.popup("CHAIN BROKEN", b.cx, b.y - 30, 0xff9cc2, 0x5a1030, 1, 1.0);
        break;
    }
  }

  /** Before and at the start of the Assassin fight. */
  private assassinCoach() {
    const b = this.world.boss;
    if (!(b instanceof Assassin)) return;
    const arena = this.level.arenas.find((a) => a.boss);
    if (b.state === "dormant" && arena && this.player.cx > (arena.trigger - 8) * TILE) {
      this.coach("asn-pre", "이 앞은 <b>암살자</b>. 벽에서 순간 돌진하는 적이라 <b>패링만 통해요</b>.", 4);
    }
    if (b.state === "cling" && this.prevBossState === "intro") {
      this.coach("asn-intro", "머리 위 점의 개수 = 공격 횟수. 몸에 <b>고리</b>가 좁혀 오면 닿는 순간 <b>우클릭</b>. 조준 방향은 상관없어요.", 5.5);
    }
    this.prevBossState = b.state;
  }
  private prevBossState = "";

  // ------------------------------------------------- STAGE 1: notes, lessons

  /** A fresh start of a stage that begins hurt (STAGE 1: an old body, her medicine within reach). */
  private applyStartCondition(force = false) {
    const L = this.level, p = this.player;
    if (L.startHp === null || (!force && (this.continued || this.pendingWarp))) return;
    p.hp = Math.min(p.maxHp, L.startHp);
    // the ampoules are in her box upstairs, not in his pocket yet
    if (L.notes.some((n) => n.gift === "ampoule")) p.ampoules = 0;
    this.notesRead.clear();
  }

  /** Things in the house he has looked at this run (re-reads are allowed; gifts are not). */
  notesRead = new Set<string>();

  private nearNote() {
    const p = this.player;
    if (p.dead || this.storyHold) return null;
    return this.level.notes.find((n) => Math.abs(n.x * TILE + 8 - p.cx) < 20 && Math.abs(n.y * TILE - p.bottom) < 10) ?? null;
  }

  private async readNote(n: { id: string; gift?: "ampoule" }) {
    const first = !this.notesRead.has(n.id);
    this.notesRead.add(n.id);
    SFX.storyCue("page");
    if (n.gift === "ampoule" && first) {
      const p = this.player;
      p.ampoules = p.maxAmpoules;
      this.hud.vialGained();
      SFX.heal("gain");
      this.combat.popup(`+${p.maxAmpoules} AMPOULES`, p.cx, p.y - 14, 0x6dffc0, 0x0a4a3a, 1, 1.1);
    }
    // reading is the point: the lines play even with story scenes switched off
    this.storyHold = true;
    this.input2.locked = true;
    this.cinema.scene(9999);
    try {
      if (n.id === "w-namewall") await this.writeName();
      else await STORY_UI.cutscene(SCENES[n.id] ?? []);
    } finally {
      if (this.sys.isActive()) {
        this.storyHold = false;
        this.input2.locked = !!this.script;
        this.input2.latched.clear();
        this.acc = 0;
        this.cinema.endScene();
        if (n.gift === "ampoule" && first) this.lesson("heal");
      }
    }
  }

  private updateNotePrompt(): boolean {
    const el = document.getElementById("shopprompt");
    if (!el || SHOP_UI.open) return false;
    const n = this.storyHold ? null : this.nearNote();
    if (!n) return false;
    el.classList.add("on");
    el.classList.remove("busy");
    el.innerHTML = `<kbd>W</kbd>${this.notesRead.has(n.id) ? "다시 보기" : "살펴보기"}`;
    const v = this.cameras.main.worldView;
    const r = this.game.canvas.getBoundingClientRect();
    el.style.left = `${r.left + ((n.x * TILE + 8 - v.x) / v.width) * r.width}px`;
    el.style.top = `${r.top + ((n.y * TILE - 40 - v.y) / v.height) * r.height}px`;
    return true;
  }

  /** How far inside a room the camera is (0..1): the rain on screen thins out. */
  roomFade = 0;

  private renderOutskirts(dt: number) {
    for (const v of this.noteViews) {
      const read = this.notesRead.has(v.id);
      const bob = Math.sin(this.realTime * 2.6 + v.x) * 1.5;
      v.glow.setPosition(v.x, v.y + bob).setAlpha(read ? 0.12 : 0.35 + 0.2 * Math.sin(this.realTime * 3 + v.x)).setScale(read ? 0.22 : 0.32);
      const g = v.mark;
      g.clear();
      if (read) continue;
      // a small amber diamond above the thing: "look here"
      const y = Math.round(v.y + bob);
      g.fillStyle(0xffcf7a, 0.9);
      g.fillRect(v.x - 1, y - 3, 2, 6);
      g.fillRect(v.x - 3, y - 1, 6, 2);
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(v.x, y - 1, 1, 1);
    }
    for (const f of this.flickers) f.img.setAlpha(Math.max(0, f.base + f.amp * (Math.sin(this.realTime * f.rate) * 0.6 + (Math.random() - 0.5) * 0.8)));
    for (const sw of this.sways) {
      const a = Math.sin(this.realTime * 1.1 + sw.phase) * 0.06;
      sw.img.setRotation(a);
      sw.glow.setPosition(sw.x - Math.sin(a) * 16, sw.y + 16);
    }
    for (const b of this.beaconsOrange) {
      const k = Math.max(0, Math.sin(this.realTime * 5 + b.phase));
      b.img.setAlpha(0.15 + 0.75 * k * k).setScale(0.6 + 0.5 * k);
    }
    // the rain thins when the camera is in a room (the house, the shed)
    const tx = this.camX / TILE, ty = this.camY / TILE;
    const inside = this.level.rooms.some((r) => tx >= r.x0 - 1 && tx <= r.x1 + 1 && ty >= r.y0 - 2 && ty <= r.y1 + 1) ? 1 : 0;
    this.roomFade += (inside - this.roomFade) * (1 - Math.exp(-dt * 3));
  }

  // The controls are taught where they are needed (bible p.10): a key chip at
  // the bottom of the screen and, where it fits, a line from him. Each lesson
  // is shown once ever (saved), and leaves when it has been done.
  private static LESSON_TEXT: Record<string, string> = {
    move: "<kbd>A</kbd><kbd>D</kbd> 이동",
    jump: "<kbd>Space</kbd> 점프 · 길게 누르면 더 높이",
    heal: "<kbd>R</kbd> 나노 앰플로 회복 · 쓰는 동안 맞으면 쏟아져요",
    slash: "<kbd>좌클릭</kbd> 베기 · 두 번 누르면 <b>연격</b>",
    parry: "<kbd>우클릭</kbd> 패링 · 총알이 닿기 직전에, <b>커서 쪽으로</b> 되돌아가요",
    peril: "<b class=\"pu\">보라색 危</b> 패링 불가 · <kbd>Space</kbd> 점프나 <kbd>Shift</kbd> 대쉬로 피하기",
    dash: "<kbd>Shift</kbd> 대쉬 · 순간 무적 · 패링에 성공하면 다시 충전",
    drop: "<kbd>S</kbd>+<kbd>Space</kbd> 발판 아래로 내려가기",
    chips: "<b class=\"am\">₵ 고철 칩</b> 쓰러진 장비의 부품 · 하층 상점에서 쓸 수 있어요",
    heavy: "<b class=\"rd\">붉은 !</b> 강공격 · 패링하면 체간이 크게 무너져요",
    deathblow: "<b class=\"am\">체간 붕괴</b> 붉은 표식이 뜨면 <kbd>좌클릭</kbd>으로 인살",
    shop: "<kbd>W</kbd> 상점 · <b class=\"am\">₵ 고철 칩</b>으로 물건을 사요 · 싸우는 중엔 닫혀요",
    shard: "<b class=\"am\">◈ 기억 파편</b> 숨겨진 곳에 있어요 · 쓸 곳은 아직 문을 열지 않았어요",
    aim: "<kbd>우클릭</kbd> 되받아친 총알은 <b>커서가 가리키는 곳</b>으로 · 뒤쪽 <b class=\"am\">냉각구</b>를 겨누세요",
  };
  lessonOn: string | null = null;
  private lessonT = 0;
  private lessonQueue: string[] = [];

  /** Show a lesson's key chip (once ever). */
  lesson(id: string) {
    if (!this.teaches) return;
    if (LESSONS.has(id) || this.lessonOn === id || this.lessonQueue.includes(id)) return;
    if (this.lessonOn) { this.lessonQueue.push(id); return; }
    this.lessonOn = id;
    this.lessonT = 0;
    const el = document.getElementById("keychip");
    if (!el) return;
    el.innerHTML = GameScene.LESSON_TEXT[id] ?? id;
    el.classList.remove("done");
    el.classList.add("on");
  }

  /** The lesson was done: tick it off, and it never comes back. */
  lessonDone(id: string) {
    if (!this.teaches) return;
    if (LESSONS.has(id) && this.lessonOn !== id) return;
    LESSONS.add(id);
    this.lessonQueue = this.lessonQueue.filter((q) => q !== id);
    if (this.lessonOn !== id) return;
    const el = document.getElementById("keychip");
    el?.classList.add("done");
    SFX.storyCue("advance");
    this.lessonOn = null;
    window.setTimeout(() => {
      if (this.lessonOn) return;
      el?.classList.remove("on", "done");
      // a lesson that waited in line is dropped if he has long since walked past its place
      const tx = this.player.cx / TILE;
      this.lessonQueue = this.lessonQueue.filter((q) => { const at = this.level.lessons.find((l) => l.id === q); return !at || q === "heal" || tx < at.x + 30; });
      const nxt = this.lessonQueue.shift();
      if (nxt && this.sys.isActive()) window.setTimeout(() => this.lesson(nxt), 250);
    }, 700);
  }

  private chipLesson() {
    if (this.stageId === 11 && WALLET.chips > 0) { this.lesson("chips"); }
  }

  /** Lessons by place, and the ones that end on their own. */
  /** STAGE 1 teaches the controls; STAGE 2 the shops, shards and aiming. Later stages assume them. */
  get teaches() { return this.stageId === 11 || this.stageId === 12; }

  private lessonTick() {
    if (!this.teaches || this.storyHold || this.script) return;
    const p = this.player;
    const tx = p.cx / TILE;
    for (const l of this.level.lessons) {
      if (l.id === "heal") continue; // comes with her box
      if (tx >= l.x && tx < l.x + 6 && !LESSONS.has(l.id)) this.lesson(l.id);
    }
    if (!this.lessonOn) return;
    this.lessonT += STEP;
    const id = this.lessonOn;
    const spawnTx = this.level.spawnX / TILE;
    if (id === "move" && Math.abs(tx - spawnTx) > 3) this.lessonDone("move");
    if (id === "drop" && tx > 137.5 && p.bottom > 26 * TILE) this.lessonDone("drop");
    if (id === "peril" && tx > 99) this.lessonDone("peril");
    if (id === "chips" && this.lessonT > 5) this.lessonDone("chips");
    if (id === "heavy" && this.lessonT > 6) this.lessonDone("heavy");
    if (id === "parry" && tx > 72 && this.lessonT > 4) this.lessonDone("parry");
    if (id === "slash" && tx > 37) this.lessonDone("slash");
    if (id === "jump" && tx > 14) this.lessonDone("jump");
    if (id === "shard" && this.lessonT > 6) this.lessonDone("shard");
    if (id === "shop" && (this.lessonT > 9 || !this.nearShop())) { if (this.lessonT > 3) this.lessonDone("shop"); }
    // no need to heal any more (a checkpoint filled him up), or long past the house
    if (id === "heal" && ((p.hp >= p.maxHp && this.lessonT > 2) || tx > 70)) this.lessonDone("heal");
  }

  onFire(f: Fire) {
    const x = f.x + f.w / 2;
    SFX.flame(x, f.w > 80);
    this.combat.light(x, f.floor - 10, "amber", 1.4);
    this.fx.burst(x, f.floor - 4, {
      count: LITE_MODE ? 12 : 22, speed: [40, 160], angle: [200, 340], life: [0.2, 0.5], size: [1, 3],
      colors: [0xe8c8ff, 0xb967ff, 0xffb347], add: true, drag: 0.04, grav: -80, spreadX: f.w / 2,
    });
  }

  // ------------------------------------------------------- STAGE 2: the market

  /** Set dressing for the market: signs, stalls, piers, lanterns and their light. */
  private buildMarketDeco(d: { kind: string; x: number; y: number; w?: number; h?: number; variant?: number }) {
    const x = d.x * TILE, y = d.y * TILE;
    const FLOOR = ["noodlestall", "partsstall", "door", "crate", "anvil", "terminal", "lift"];
    const c = paintMarketDeco(d.kind, d.w ?? 1, d.h ?? 1, d.variant ?? 0);
    if (!c) return;
    const key = `md_${d.kind}_${d.x}_${d.y}`;
    this.tex(key, c);
    const floor = FLOOR.includes(d.kind);
    const back = d.kind === "pier" || d.kind === "cables" || d.kind === "namewall";
    const img = this.add.image(x - (d.kind === "pier" ? 4 : 0), y + (d.kind === "rail" ? -14 : 0), key).setOrigin(0, floor ? 1 : 0).setDepth(back ? 0.3 : 0.4);
    const glow = (gx: number, gy: number, k: string, sc: number, a: number, rate = 2, amp = 0.05, powered = true) => {
      const g = this.add.image(gx, gy, k).setDepth(0.46).setBlendMode(Phaser.BlendModes.ADD).setScale(sc).setAlpha(a);
      const f = { img: g, base: a, rate, amp };
      this.flickers.push(f);
      if (powered) this.powered.push(f);
      return g;
    };
    switch (d.kind) {
      case "lantern":
        glow(x + 5, y + 20, "glowAmber", 0.7, 0.5, 2.4, 0.06);
        this.sways.push({ img, glow: this.flickers[this.flickers.length - 1].img, x: x + 5, y: y + 4, phase: Math.random() * 6 });
        img.setOrigin(0.5, 0).setX(x + 5);
        this.poweredImgs.push(img);
        break;
      case "neon":
        glow(x + c.width / 2, y + c.height / 2, (d.variant ?? 0) ? "glowCyan" : "glowPink", 1.0, 0.45, 9, 0.1);
        this.poweredImgs.push(img);
        break;
      case "yeonmu":
        glow(x + c.width / 2, y + c.height / 2, "glowCyan", 1.3, 0.3, 1.5, 0.04);
        this.poweredImgs.push(img);
        break;
      case "eden":
        glow(x + c.width / 2, y + c.height / 2, "glowPink", 1.6, 0.32, 1.2, 0.04);
        this.poweredImgs.push(img);
        break;
      case "doorway":
        glow(x + c.width / 2, y + c.height - 10, "glowAmber", 1.2, 0.5, 1.2, 0.05);
        this.poweredImgs.push(img);
        break;
      case "laplace":
        // the Laplace gate runs on its own supply: it never goes dark
        glow(x + c.width / 2, y + 30, "glowCyan", 1.1, 0.35, 3, 0.08, false);
        this.scanner = { x: x + 8, x1: x + c.width - 8, y0: y + 46, y1: y + c.height - 2 };
        break;
      case "bazaarshut":
        glow(x + c.width / 2, y + 26, "glowPurple", 0.6, 0.45, 1.1, 0.2, false);
        break;
      case "terminal":
        glow(x + 21, y - 30, "glowCyan", 0.55, 0.5, 4, 0.12, false);
        break;
      case "floodlight":
        glow(x + 10, y + 8, "glowWhite", 1.0, 0.55, 0.5, 0.02, false);
        this.add.image(x + 10, y + 8, "cone").setOrigin(0.5, 0).setDepth(-3).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3).setScale(1.4, 1.6);
        break;
      case "anvil":
        this.anvilAt = { x: x + 14, y: y - 18 };
        break;
      case "namewall":
        this.nameWallAt = { x: x + c.width / 2 - 10, y: y + c.height - 58 };
        break;
    }
  }
  powered: { img: Phaser.GameObjects.Image; base: number; rate: number; amp: number }[] = [];
  poweredImgs: Phaser.GameObjects.Image[] = [];
  scanner: { x: number; x1: number; y0: number; y1: number } | null = null;
  anvilAt: { x: number; y: number } | null = null;
  nameWallAt: { x: number; y: number } | null = null;
  nameImg: Phaser.GameObjects.Image | null = null;
  secretViews: { img: Phaser.GameObjects.Image; r: { x0: number; y0: number; x1: number; y1: number }; a: number }[] = [];
  npcViews: { who: string; spr: Phaser.GameObjects.Sprite; anim: string; t: number; x: number; y: number; facing: number; line?: string; vx: number; gone: boolean; heard: boolean; lastF: number }[] = [];
  /** The power cut: time to the next one, and how far into the current one. */
  brown = { next: 14, t: -1 };
  powerK = 1;
  raidOn = 0;
  raidOverlay: Phaser.GameObjects.Rectangle | null = null;
  darkOverlay: Phaser.GameObjects.Rectangle | null = null;
  scanT = 0;

  /** Hidden nooks, the people of the market, the name (if he has written it). */
  private buildMarketObjects() {
    this.secretViews = [];
    for (const r of this.level.secrets) {
      const key = `secret_${r.x0}_${r.y0}`;
      this.tex(key, paintSecretCover(r.x1 - r.x0 + 1, r.y1 - r.y0 + 1));
      const img = this.add.image(r.x0 * TILE, r.y0 * TILE, key).setOrigin(0).setDepth(12);
      this.secretViews.push({ img, r, a: 1 });
    }
    this.npcViews = [];
    for (const n of this.level.npcs) {
      const spr = this.add.sprite(n.x * TILE + 8, n.y * TILE, "civ", 0).setDepth(9).setOrigin(46 / 96, 78 / 80).setFlipX((n.facing ?? 1) < 0);
      const work = CIV_ANIMS[`${n.who}_work`] ? "work" : CIV_ANIMS[`${n.who}_write`] ? "write" : "idle";
      this.npcViews.push({ who: n.who, spr, anim: work, t: Math.random() * 3, x: n.x * TILE + 8, y: n.y * TILE, facing: n.facing ?? 1, line: n.line, vx: 0, gone: false, heard: false, lastF: -1 });
    }
    if (this.level.theme === "market") {
      this.darkOverlay = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x05040a, 1).setOrigin(0).setScrollFactor(0).setDepth(39).setAlpha(0);
      this.raidOverlay = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xff2030, 1).setOrigin(0).setScrollFactor(0).setDepth(39.5).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      const seen: Set<string> = ((window as any).__storySeen ??= new Set<string>());
      if (this.nameWallAt) {
        this.nameImg = this.add.image(this.nameWallAt.x, this.nameWallAt.y, "namewritten").setOrigin(0.5, 0).setDepth(0.35).setAlpha(seen.has("w-written") ? 1 : 0);
      }
    }
  }

  private npc(who: string) { return this.npcViews.find((n) => n.who === who); }
  private npcAnim(who: string, anim: string) {
    const n = this.npc(who);
    if (n && CIV_ANIMS[`${who}_${anim}`]) { n.anim = anim; n.t = 0; }
  }

  /** Sim-time upkeep: people, the forge, the power cuts, the hidden nook. */
  private marketStep(dt: number) {
    if (this.level.theme !== "market") return;
    const p = this.player;
    // the people: animate; say their one line when he comes close
    for (const n of this.npcViews) {
      if (n.gone) continue;
      n.t += dt;
      if (n.vx) {
        n.x += n.vx * dt;
        if (n.x < 148 * TILE) { n.gone = true; n.spr.setVisible(false); }
      }
      if (n.line && !n.heard && !this.storyHold && !this.script && Math.abs(p.cx - n.x) < 46 && Math.abs(p.bottom - n.y) < 20) {
        n.heard = true;
        bark(n.line);
      }
      // 강만식 at the anvil: sparks on each blow
      if (n.who === "kang" && n.anim === "work") {
        const a = CIV_ANIMS["kang_work"];
        const f = Math.floor(n.t * a.fps) % (a.end - a.start + 1);
        if (f === 2 && n.lastF !== 2 && this.anvilAt) {
          this.fx.burst(this.anvilAt.x, this.anvilAt.y, { count: 8, speed: [40, 140], angle: [200, 340], life: [0.15, 0.4], size: [1, 1], colors: [0xffe08a, 0xffb347, 0xffffff], add: true, grav: 500, drag: 0.02 });
          if (Math.abs(p.cx - this.anvilAt.x) < 400) SFX.clink(this.anvilAt.x);
        }
        n.lastF = f;
      }
    }
    // the power cuts (권하린's schedule): only in the market proper, never in a fight
    const tx = p.cx / TILE;
    const inMarket = tx > 26 && tx < 150 && this.world.activeArenas.size === 0;
    if (this.brown.t >= 0) {
      this.brown.t += dt;
      if (this.brown.t > 2.1) { this.brown.t = -1; this.brown.next = 22 + Math.random() * 12; }
    } else if (inMarket && !this.storyHold) {
      this.brown.next -= dt;
      if (this.brown.next <= 0) {
        this.brown.t = 0;
        SFX.brownout(true);
        this.time.delayedCall(350, () => bark("s12-brownout"));
      }
    }
    if (this.brown.t >= 0 && this.brown.t > 1.75 && this.brown.t - dt <= 1.75) SFX.brownout(false);
    // the Laplace scanner sweeps
    this.scanT += dt;
  }

  /** Real-time visuals: the power cut, the raid's red, the hidden nook's wall. */
  private renderMarket(dt: number) {
    if (this.level.theme !== "market") return;
    // power: a stutter, then dark, then a stutter back
    const b = this.brown.t;
    let dim = 0;
    if (b >= 0) {
      if (b < 0.35) dim = Math.floor(b * 24) % 2 ? 1 : 0.2;
      else if (b < 1.6) dim = 1;
      else if (b < 2.1) dim = Math.floor(b * 20) % 2 ? 0.8 : 0;
    }
    this.powerK = 1 - 0.85 * dim;
    for (const f of this.powered) f.img.setAlpha(f.img.alpha * this.powerK);
    for (const im of this.poweredImgs) { if (dim > 0.5) im.setTint(0x606070); else im.clearTint(); }
    this.darkOverlay?.setAlpha(0.3 * dim);
    // the raid: the market washed red, pulsing with the siren
    const want = this.raidOn > 0 ? 1 : 0;
    this.raidOn = Math.max(0, this.raidOn - (this.world.activeArenas.has(6) ? 0 : dt));
    const k = want ? 0.06 + 0.05 * Math.max(0, Math.sin(this.realTime * 5)) : 0;
    this.raidOverlay?.setAlpha(k);
    // the hidden nook: its painted wall fades when he is inside
    const p = this.player;
    for (const sv of this.secretViews) {
      const r = sv.r;
      const inside = p.cx > r.x0 * TILE - 4 && p.cx < (r.x1 + 1) * TILE + 4 && p.bottom > r.y0 * TILE && p.y < (r.y1 + 1) * TILE;
      sv.a += ((inside ? 0.18 : 1) - sv.a) * (1 - Math.exp(-dt * 8));
      sv.img.setAlpha(sv.a);
    }
    // people
    for (const n of this.npcViews) {
      if (n.gone) continue;
      const a = CIV_ANIMS[`${n.who}_${n.anim}`] ?? CIV_ANIMS[`${n.who}_idle`];
      const len = a.end - a.start + 1;
      let fi = Math.floor(n.t * a.fps);
      fi = a.loop ? fi % len : Math.min(fi, len - 1);
      n.spr.setFrame(a.start + fi).setPosition(Math.round(n.x), Math.round(n.y)).setFlipX(n.facing < 0);
      n.spr.setOrigin((n.facing < 0 ? 50 : 46) / 96, 78 / 80);
      // lit by the market, dimmed by the cuts, reddened by the raid
      const v = Math.round(255 * (0.55 + 0.45 * this.powerK));
      n.spr.setTint((v << 16) | (Math.round(v * (want ? 0.8 : 1)) << 8) | Math.round(v * (want ? 0.8 : 0.95)));
    }
    // the scanner's line over the Laplace gate
    if (this.scanner) {
      const s = this.scanner;
      const y = s.y0 + ((Math.sin(this.scanT * 1.6) + 1) / 2) * (s.y1 - s.y0);
      this.fx.burst(s.x + Math.random() * (s.x1 - s.x), y, { count: 1, speed: [0, 2], angle: [0, 360], life: [0.08, 0.12], size: [1, 1], colors: [0x3ad8c0], add: true });
    }
  }

  /** The name wall (bible 2-02): he writes 백서윤; then the child (appendix 02). */
  private async writeName() {
    const seen: Set<string> = ((window as any).__storySeen ??= new Set<string>());
    if (seen.has("w-written")) { await STORY_UI.cutscene(SCENES["w-namewall-again"]); return; }
    this.npcAnim("chalk", "idle");
    await STORY_UI.cutscene(SCENES["w-namewall"]);
    seen.add("w-written");
    SFX.chalk();
    if (this.nameImg) this.tweens.add({ targets: this.nameImg, alpha: 1, duration: 900, ease: "Sine.easeOut" });
    if (this.nameWallAt) this.fx.burst(this.nameWallAt.x, this.nameWallAt.y + 8, { count: 10, speed: [5, 30], angle: [0, 360], life: [0.3, 0.7], size: [1, 1], colors: [0xffffff, 0xe8e4d8], drag: 0.05, grav: 40 });
    await new Promise<void>((res) => window.setTimeout(res, 900));
    if (!this.sys.isActive()) return;
    this.npcAnim("kid", "look");
    await STORY_UI.cutscene(SCENES["w-namewall-kid"]);
    this.npcAnim("kid", "idle");
    this.npcAnim("chalk", "write");
  }

  /** The search squad seals the market (bible 2-06). */
  private startRaid() {
    this.raidOn = 99;
    SFX.siren();
    this.npcAnim("youth", "point");
    const y = this.npc("youth");
    if (y) y.facing = -1;
    this.time.delayedCall(2600, () => {
      // the young man runs, not looking back
      const n = this.npc("youth");
      if (n) { this.npcAnim("youth", "run"); n.facing = -1; n.vx = -120; }
    });
    this.npcAnim("hider", "idle");
  }

  private endRaid() {
    this.raidOn = 0;
    const h = this.npc("hider");
    if (h) h.facing = 1;
  }

  /** 방벽's moments: its vent hit, the shield ringing, the shield coming away... */
  onBulwark(b: Bulwark, kind: string, x: number, y: number) {
    switch (kind) {
      case "vent": {
        this.lessonDone("aim");
        SFX.bulwark("vent", x);
        this.freeze = Math.max(this.freeze, 0.06);
        this.shake.add(0.25);
        this.fx.burst(x, y, { count: 18, speed: [60, 220], angle: [200, 340], life: [0.2, 0.5], size: [1, 2], colors: [0xffb347, 0xffffff, 0xff6a2a], add: true, grav: 300, drag: 0.03 });
        this.fx.burst(x, y - 4, { count: 10, speed: [20, 60], angle: [240, 300], life: [0.6, 1.2], size: [3, 5], sizeEnd: 9, colors: [0xd8d8e0, 0xa8a8b8], alpha: 0.45, drag: 0.03, grav: -40 });
        this.combat.ring(x, y, 0xffb347, 26, 0.25, 2);
        this.combat.light(x, y, "amber", 1.4);
        this.combat.popup(b.ventHp > 0 ? `VENT ${Math.ceil(b.ventHp)}` : "VENT BURST", x, y - 18, 0xffd27a, 0x5a3a10, 1, 0.9);
        break;
      }
      case "clank":
        SFX.heavyClank(x);
        this.fx.burst(x, y, { count: 10, speed: [80, 200], angle: b.facing > 0 ? [-80, 80] : [100, 260], life: [0.1, 0.25], size: [1, 2], colors: [0xffffff, 0xffe08a], add: true, grav: 400, drag: 0.04 });
        this.combat.ring(x, y, 0xffffff, 14, 0.12, 1);
        if (!this.bossFx.has("shieldTalk")) { this.bossFx.add("shieldTalk"); this.time.delayedCall(400, () => bark("s12-bul-shield")); }
        break;
      case "armor":
        SFX.heavyClank(x);
        this.fx.burst(x, y, { count: 6, speed: [60, 160], angle: [0, 360], life: [0.08, 0.2], size: [1, 1], colors: [0xffffff, 0xc8c8d0], add: true, grav: 300 });
        if (!this.bossFx.has("armorPop")) { this.bossFx.add("armorPop"); this.combat.popup("NO EFFECT", x, y - 16, 0xc8c8d0, 0x2a2a34, 1, 0.8); }
        break;
      case "shed":
        SFX.bulwark("shed", x);
        this.shake.add(0.7);
        this.freeze = Math.max(this.freeze, 0.12);
        this.cinema.flashOnce(0xffd0a0, 0.4);
        this.fx.burst(x, y, { count: 30, speed: [30, 120], angle: [200, 340], life: [0.8, 1.6], size: [3, 6], sizeEnd: 12, colors: [0xe0e0e8, 0xb0b0c0], alpha: 0.5, drag: 0.03, grav: -60 });
        this.fx.burst(x, y, { count: 24, speed: [100, 300], angle: [0, 360], life: [0.2, 0.5], size: [1, 2], colors: [0xffb347, 0xffffff], add: true, grav: 400 });
        this.showBanner("SHIELD DOWN", C.amber);
        this.time.delayedCall(500, () => bark("s12-bul-vent"));
        break;
      case "thud":
        SFX.barrel(x, false);
        this.shake.add(0.2);
        this.fx.burst(x, y + 4, { count: 10, speed: [30, 100], angle: [190, 350], life: [0.2, 0.4], size: [2, 3], sizeEnd: 1, colors: [C.dust, C.dustLo], drag: 0.1, grav: 40 });
        break;
      case "crash":
        SFX.bossLand(x, false);
        this.shake.add(0.5);
        this.fx.burst(x, y, { count: 16, speed: [60, 200], angle: [0, 360], life: [0.2, 0.5], size: [1, 3], colors: [0xffe08a, C.dust, 0x8a8a90], grav: 500, drag: 0.03 });
        break;
      case "stopped":
        this.combat.popup("STOPPED", x, y - 30, 0xffffff, 0x8a1040, 1, 0.8);
        break;
      case "turned":
        SFX.bulwark("turn", x);
        this.fx.burst(x, y - 2, { count: 8, speed: [30, 90], angle: [190, 350], life: [0.2, 0.4], size: [2, 3], sizeEnd: 1, colors: [C.dust, C.dustLo], drag: 0.1, grav: 40 });
        break;
    }
  }

  /** 방벽 shuts down: no one inside, so it is destroyed, not subdued. */
  private onBulwarkDestroyed(b: Bulwark) {
    const chips = Math.round(BOUNTY.boss * 0.8);
    WALLET.chips += chips;
    WALLET.shards += 1;
    this.time.delayedCall(1600, () => this.combat.popup(`+${chips}C  +1 SHARD`, this.player.cx, this.player.y - 30, 0xffcf7a, 0x5a3a10, 1, 1.6));
    SFX.bossDown(b.cx);
    this.bm.stop(2.5);
    this.cinema.duel(0.12, 1.6, true);
    this.cinema.flashOnce(0xffffff, 0.8);
    this.shake.add(0.9);
    this.freeze = Math.max(this.freeze, 0.2);
    this.fx.burst(b.cx, b.cy, { count: 60, speed: [80, 360], angle: [0, 360], life: [0.4, 1.0], size: [1, 3], colors: [0xffb347, 0xffffff, 0xff6a2a, 0x8a8a90], add: true, drag: 0.03, grav: 200 });
    this.fx.burst(b.cx, b.y, { count: 26, speed: [20, 80], angle: [230, 310], life: [1.2, 2.4], size: [4, 7], sizeEnd: 14, colors: [0x2a2430, 0x3a3440, 0x4a4450], alpha: 0.55, drag: 0.02, grav: -40 });
    this.combat.ring(b.cx, b.cy, C.white, 100, 0.7, 3);
    this.combat.light(b.cx, b.cy, "amber", 2.6);
    this.gateX = b.cx;
    this.gateY = b.bottom;
    this.clearT = 3.0;
    if (sceneWanted("s12-bul-down")) { this.defeatTalk = { id: "s12-bul-down", t: 2.4 }; this.clearT = 1.2; }
    this.time.delayedCall(900, () => this.showBanner("DESTROYED", C.amber));
  }

  // ---------------------------------------------------------------- shops

  private nearShop() {
    const p = this.player;
    if (p.dead) return null;
    return this.level.shops.find((sh) => Math.abs(sh.x * TILE + 8 - p.cx) < 26 && Math.abs(sh.y * TILE - p.bottom) < 12) ?? null;
  }

  /** No shopping in a fight: an encounter is locked, or a soldier nearby has seen you. */
  private shopBusy() {
    const p = this.player;
    if (this.world.activeArenas.size > 0) return true;
    return this.world.soldiers.some((s) => s.alive && s.state !== "dormant" && s.state !== "patrol" && s.kind !== "boss" && Math.hypot(s.cx - p.cx, s.cy - p.cy) < 260);
  }

  private shopName(kind: string) { return kind === "forge" ? "철야 정비소" : kind === "supply" ? "0번 보급함" : "망각시장"; }

  private updateShopPrompt() {
    const el = document.getElementById("shopprompt");
    if (!el) return;
    const sh = this.storyHold || SHOP_UI.open ? null : this.nearShop();
    if (!sh) { if (!this.updateNotePrompt()) el.classList.remove("on"); return; }
    if (this.stageId === 12) this.lesson("shop");
    const busy = this.shopBusy();
    el.classList.add("on");
    el.classList.toggle("busy", busy);
    el.innerHTML = busy ? "전투 중에는 이용할 수 없어요" : `<kbd>W</kbd>${this.shopName(sh.kind)}`;
    const v = this.cameras.main.worldView;
    const r = this.game.canvas.getBoundingClientRect();
    el.style.left = `${r.left + ((sh.x * TILE + 8 - v.x) / v.width) * r.width}px`;
    el.style.top = `${r.top + ((sh.y * TILE - 74 - v.y) / v.height) * r.height}px`;
  }

  /** Into the shop: the game holds; a greeting the first time; then the window. */
  private async openShop(sh: { kind: "forge" | "supply" | "bazaar"; id: string }) {
    this.storyHold = true;
    this.input2.locked = true;
    this.sm.duck(0.45);
    SFX.storyCue("beep");
    if (!WALLET.visited.has(sh.kind)) {
      WALLET.visited.add(sh.kind);
      if (STORY.on) await STORY_UI.cutscene(SCENES[`shop-${sh.kind}`]);
      if (sh.kind === "supply" && STORY.on) await STORY_UI.cutscene(SCENES[`supply-${this.stageId}`] ?? []);
    }
    if (!this.sys.isActive()) return;
    const p = this.player;
    SHOP_UI.show({
      kind: sh.kind,
      shopId: sh.id,
      ampoules: () => ({ have: p.ampoules, max: p.maxAmpoules }),
      addAmpoule: () => { p.ampoules = Math.min(p.maxAmpoules, p.ampoules + 1); this.hud.vialGained(); },
      reapply: () => this.world.applyLoadout(false),
      playMessage: () => STORY_UI.cutscene(SCENES[`supply-${this.stageId}`] ?? []),
      onClose: () => {
        this.lessonDone("shop");
        if (sh.kind === "forge" && this.stageId === 12 && sceneWanted("s12-kang-after")) this.time.delayedCall(250, () => this.cut("s12-kang-after"));
        this.storyHold = false;
        this.input2.locked = !!this.script;
        this.input2.latched.clear();
        this.acc = 0;
        this.sm.duck(1);
        this.game.canvas.focus();
      },
    });
  }

  /** Chips for a kill. */
  private bounty(kind: string, x: number, y: number) {
    const n = BOUNTY[kind] ?? 5;
    earn(n);
    this.combat.popup(`+${n}C`, x, y - 30, 0xffcf7a, 0x5a3a10, 1, 0.8);
  }

  /** A record fragment read: its text, a flash of light, and the big one is a scene. */
  onRecord(id: string, x: number, y: number) {
    SFX.storyCue("beep");
    SFX.heal("gain");
    this.fx.burst(x, y, { count: 22, speed: [30, 140], angle: [0, 360], life: [0.4, 0.9], size: [1, 2], colors: [C.cyanHi, C.white, 0xffcf7a], add: true, drag: 0.05, grav: -30 });
    this.combat.light(x, y, "cyan", 1.4);
    const n = this.world.recordsTaken.size, total = this.level.records.length;
    this.combat.popup(`RECORD ${n}/${total}`, x, y - 16, 0xd8fbff, 0x0a4a5a, 1, 1.1);
    if (id === "r-truth") { this.cut("s3-truth"); return; }
    recordLines(id);
  }

  /** The Archivist's beats. */
  onArchivist(b: Archivist, kind: string) {
    switch (kind) {
      case "turrets":
        SFX.barrier(true);
        if (b.phase === 1) this.coach("arc-how", "포드에는 칼이 닿지 않아요. 포탑과 기록관의 총알을 <b>우클릭으로 되받아쳐</b> 포드를 맞히세요. 큰 구슬은 피해가 <b>두 배</b>.", 6);
        break;
      case "fan": case "spiral":
        SFX.bossCharge(b.cx, "orbs");
        this.combat.light(b.cx, b.bottom, "pink", 1);
        break;
      case "sweepWind":
        this.coach("arc-sweep", "바닥을 쓸고 가는 보라색 레이저: <b>점프</b>로 넘으세요.", 3.5);
        break;
      case "gridWind":
        SFX.storyCue("beep");
        this.coach("arc-grid", "보라색 격자: 옅게 빛나는 <b>안전한 틈</b>에 서거나, <b>대쉬</b>로 빠져나가세요.", 4);
        break;
      case "sweepOn": case "gridOn":
        SFX.bossCharge(b.cx, "laser");
        this.shake.add(0.15);
        break;
      case "summon":
        SFX.kamikaze("lock", b.cx);
        break;
      case "crash":
        SFX.bossLand(b.cx, true);
        this.shake.add(0.7);
        this.fx.burst(b.cx, b.bottom - 2, { count: 30, speed: [60, 240], angle: [190, 350], life: [0.3, 0.7], size: [1, 3], colors: [C.cyanHi, C.white, C.dust], drag: 0.05, grav: 300 });
        this.coach("arc-down", "포드가 떨어졌어요! 다가가 <b>좌클릭으로 인살</b>하세요.", 4);
        break;
      case "erase":
        bark("s3-arc-erase");
        SFX.assassin("desperate", b.cx, 3);
        this.bm.duck(0.35, 0.2);
        this.cinema.flashOnce(0xeef4ff, 0.6);
        this.shake.add(0.4);
        this.showBanner("TOTAL ERASURE", C.cyan);
        this.coach("arc-erase", "<b>전 기록 소거!</b> 원형 탄은 받아치고, 바닥 레이저는 점프로. 마지막 <b>호박색 핵</b>을 포드로 되받아치세요.", 6);
        break;
      case "ring":
        SFX.bossCharge(b.cx, "orbs");
        if (b.shots === 3) this.bm.duck(1, 0.4);
        break;
      case "core":
        SFX.perilous(b.cx);
        this.combat.light(b.cx, b.bottom, "amber", 2);
        break;
      case "hit":
        SFX.wallHit(b.cx);
        this.combat.ring(b.cx, b.cy, C.cyan, 26, 0.2, 2);
        break;
      case "coreHit":
        SFX.impact();
        this.cinema.flashOnce(0xffcf7a, 0.6);
        this.shake.add(0.8);
        this.freeze = Math.max(this.freeze, 0.12);
        this.combat.ring(b.cx, b.cy, 0xffcf7a, 90, 0.6, 3);
        break;
    }
  }

  /** One-time coaching lines (once per page load, across stages and retries). */
  coach(id: string, html: string, dur = 4.5) {
    const seen: Set<string> = ((window as any).__coachSeen ??= new Set<string>());
    if (seen.has(id)) return;
    seen.add(id);
    const el = document.getElementById("coach");
    if (!el) return;
    // never cover a line that has only just appeared: queue behind it
    const wait = this.coachAt + 2200 - performance.now();
    if (wait > 0) {
      seen.delete(id);
      window.setTimeout(() => { if (this.scene.isActive()) this.coach(id, html, dur); }, wait + 30);
      return;
    }
    this.coachAt = performance.now();
    const c = this.game.canvas.getBoundingClientRect();
    el.style.top = `${c.top + c.height * 0.15}px`;
    el.innerHTML = html;
    el.classList.add("on");
    window.clearTimeout(this.coachTimer);
    this.coachTimer = window.setTimeout(() => el.classList.remove("on"), dur * 1000);
  }
  private coachTimer = 0;
  private coachAt = -1e9;

  /** The Assassin's beats: the tell, the flash-steps, a clean defence. */
  onAssassin(b: Assassin, kind: string) {
    switch (kind) {
      case "aim":
        if (b.setSize === 2) this.coach("asn-pair", "머리 위 점 <b>2개</b> = 공격 2번. 몸으로 좁혀 오는 <b>고리가 닿는 순간</b> 우클릭 두 번, <b>따닥!</b>");
        else this.coach("asn-quad", "머리 위 점 <b>4개</b> = <b>따닥 · 따닥</b>. 두 번 막으면 반대편 벽에서 한 번 더 와요.");
        SFX.assassin("aim", b.cx, b.setSize);
        this.combat.light(b.cx, b.cy, "purple", 1.0);
        break;
      case "hold":
        SFX.assassin("aim", b.cx, 2);
        break;
      case "desperate":
        bark("s2-null-flurry");
        // 발악: everything goes quiet, the room turns red, five pips
        this.coach("asn-desp", "<b>발악!</b> 점 <b>5개</b> = 순식간에 <b>5연속 베기</b>. 좁혀 오는 고리 다섯 개에 맞춰 <b>따다다다닥</b>. 전부 막으면 거의 무너져요.", 5.5);
        SFX.assassin("desperate", b.cx, 5);
        this.bm.duck(0.3, 0.15);
        this.cinema.flashOnce(0xff2030, 0.35);
        this.combat.popup("5 CUTS", Math.max(b.arenaMin + 40, Math.min(b.arenaMax - 40, b.cx)), b.bottom + 14, 0xffffff, 0x8a1020, 1, 1.2);
        this.combat.light(b.cx, b.cy, "pink", 1.4);
        this.shake.add(0.3);
        break;
      case "blink":
        SFX.assassin("blink", b.cx);
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          this.fx.burst(b.fromX + (b.toX - b.fromX) * t, b.fromY + (b.toY - b.fromY) * t, {
            count: 1, speed: [5, 30], angle: [0, 360], life: [0.1, 0.22], size: [1, 2], colors: [0xff3a2a, 0xffc0b8, C.white], add: true, drag: 0.1,
          });
        }
        break;
      case "rush": {
        if (b.flurry) this.bm.duck(1, 0.05);
        SFX.assassin("rush", b.cx);
        // a streak of violet along the path he is about to take
        const n = 10;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          this.fx.burst(b.fromX + (b.toX - b.fromX) * t, b.fromY + (b.toY - b.fromY) * t, {
            count: 2, speed: [5, 40], angle: [0, 360], life: [0.12, 0.3], size: [1, 2], colors: [C.purple, 0xe8c8ff, C.white], add: true, drag: 0.1,
          });
        }
        break;
      }
      case "drop":
        SFX.assassin("rush", b.cx);
        break;
      case "leap":
        SFX.assassin("rush", b.cx);
        break;
      case "clean":
        this.coach("asn-clean", "<b>완벽 방어!</b> 한 세트를 전부 막으면 체간이 보너스로 더 쌓여요.", 3.5);
        SFX.assassin("clean", b.cx);
        this.combat.popup(b.flurry ? "UNBROKEN" : b.setSize === 4 ? "FLAWLESS" : "CLEAN", this.player.cx, this.player.y - 18, 0xffffff, 0x5a1f9a, 1, 0.8);
        this.combat.ring(b.cx, b.cy, C.purple, 34, 0.3, 2);
        this.shake.add(0.2);
        break;
    }
  }

  private bossFight(): Boss | null {
    const b = this.world.boss;
    if (!b || b.state === "dormant") return null;
    if (!this.world.activeArenas.has(b.group) && b.state !== "dead") return null;
    return b;
  }

  onEnterLand(s: Soldier) {
    SFX.enterLand(s.cx);
    if (!s.def.flying) {
      this.fx.burst(s.cx, s.bottom - 1, {
        count: 12, speed: [30, 120], angle: [180, 360], life: [0.25, 0.45], size: [2, 3], sizeEnd: 1,
        colors: [C.dust, C.dustLo], drag: 0.1, grav: 40, spreadX: 10,
      });
      this.shake.add(0.08);
    }
  }

  onTeaser() {
    this.script = { kind: "teaser", t: 0, dur: 4.4 };
    this.input2.locked = true;
    this.cinema.scene(4.4);
    this.stage.startTeaser();
    this.sm.duck(0.25);
    this.time.delayedCall(550, () => SFX.glitchVoice());
    this.time.delayedCall(800, () => bark("s1-teaser"));
  }

  onDodge(b: Bullet) {
    SFX.dodge();
    if (this.lessonOn === "peril") this.lessonDone("peril");
    const p = this.player;
    this.fx.burst(b.x, b.y, {
      count: 10, speed: [40, 120], angle: [0, 360], life: [0.2, 0.4], size: [1, 2],
      colors: [C.cyanHi, C.white], add: true, drag: 0.08,
    });
    this.combat.ring(p.cx, p.cy, C.cyanHi, 22, 0.2, 1);
  }

  onHeavyBlocked(b: Bullet) {
    SFX.heavyClank(b.x);
    this.fx.burst(b.x, b.y, {
      count: 8, speed: [60, 160], angle: [0, 360], life: [0.1, 0.25], size: [1, 2],
      colors: [C.purple, 0xe8c8ff], add: true, stretch: true, grav: 300,
    });
    this.combat.ring(b.x, b.y, C.purple, 16, 0.15, 2);
    this.shake.add(0.15);
  }

  onCheckpoint(i: number) {
    SFX.checkpoint();
    this.refreshBeacons();
    const cp = this.level.checkpoints[i];
    const x = cp.x * TILE + 8, y = cp.y * TILE - 41;
    this.fx.burst(x, y, {
      count: 24, speed: [40, 160], angle: [0, 360], life: [0.3, 0.7], size: [1, 2],
      colors: [C.cyanHi, C.cyan, C.white], add: true, drag: 0.05, grav: -20,
    });
    this.combat.ring(x, y, C.cyanHi, 40, 0.4, 2);
    this.player.hp = this.player.maxHp;
    this.showBanner("CHECKPOINT");
    commitEarnings();
    SAVE.write(this.stageId, i);
  }

  onPit(fatal: boolean) {
    SFX.pit();
    this.cinema.flashOnce(0xff2a6d, 0.4);
    this.shake.add(0.3);
    if (fatal) {
      this.stats.deaths++;
      this.logDeath("추락");
      this.sm.duck(0.35);
      this.cinema.death(() => this.respawnAfterDeath());
    } else {
      this.snapCamera();
    }
  }

  onStageClear() {
    PLAYLOG.clears.push({ stage: this.stageId, time: Math.round(this.realTime - this.stats.start), boss: Math.round(this.stats.bossTime) });
    if (this.level.boss) PLAYLOG.boss(this.bossName(this.world.boss)).won = true;
    // the save moves on to the start of the next stage (or stays here at the end of what is built)
    const nid = this.nextId();
    commitEarnings();
    SAVE.write(nid ?? this.stageId, -1);
    SFX.stageClear();
    this.sm.stop(2);
    this.bm.stop(2);
    this.cinema.finale();
    this.cinema.flashOnce(0xffffff, 0.4);
    for (let i = 0; i < 4; i++) {
      this.fx.burst(this.gateX + (i - 1.5) * 14, this.gateY - 50, {
        count: 20, speed: [60, 220], angle: [200, 340], life: [0.6, 1.2], size: [1, 2],
        colors: [C.pink, C.cyan, C.white, C.yellow], add: true, grav: 200, drag: 0.02,
      });
    }
    this.showBanner("STAGE CLEAR", C.pink);
    const t = this.realTime - this.stats.start;
    const el = document.getElementById("clear");
    const story = el?.querySelector(".story-next") as HTMLElement | null;
    if (story) { story.textContent = CLEAR_LINES[this.stageId] ?? ""; story.hidden = !STORY.on || !story.textContent; }
    if (el) {
      const m = Math.floor(t / 60), sec = Math.floor(t % 60);
      const set = (k: string, v: string) => { const n = el.querySelector(`[data-stat=${k}]`) as HTMLElement | null; if (n) n.textContent = v; };
      set("time", `${m}:${String(sec).padStart(2, "0")}`);
      set("kills", String(this.stats.kills));
      set("wrecks", String(this.stats.wrecks));
      set("parries", `${this.stats.parries} (퍼펙트 ${this.stats.perfects})`);
      set("props", String(this.stats.props));
      set("deaths", String(this.stats.deaths));
      if (this.stats.bossTime >= 0) {
        const bt = this.stats.bossTime;
        set("boss", `${Math.floor(bt / 60)}:${String(Math.floor(bt % 60)).padStart(2, "0")}`);
      }
      setTimeout(() => (el.hidden = false), 1400);
    }
  }

  onPlayerHit(fatal: boolean, b: Bullet | null) {
    SFX.playerHurt();
    if (this.world.boss instanceof Assassin && this.bossFight()) {
      this.coach("asn-missed", "놓쳤어요! <b>조준은 신경 쓰지 말고</b>, 고리가 몸에 닿는 박자에만 맞춰 우클릭하세요. 조금 일찍 눌러도 한 번은 봐줘요.", 5.5);
    }
    const p = this.player;
    if (!b) return;
    this.fx.burst(b.x, b.y, {
      count: 16, speed: [80, 240], angle: [0, 360], life: [0.15, 0.35],
      size: [1, 3], colors: [C.pink, C.white, C.pinkHi], add: true, stretch: true, grav: 300, drag: 0.05,
    });
    this.cinema.flashOnce(0xff2a6d, 0.45);
    this.freeze = Math.max(this.freeze, 0.09);
    this.shake.add(0.5);
    this.kickX += Math.sign(p.cx - b.x) * 5;
    if (fatal) {
      this.stats.deaths++;
      this.logDeath(this.deathCause(b));
      this.sm.duck(0.35);
      this.cinema.death(() => this.respawnAfterDeath());
    }
  }

  /** Who (or which boss pattern) landed the killing blow, in words. */
  private deathCause(b: Bullet | null): string {
    const NAMES: Record<string, string> = {
      rifle: "소총병", burst: "점사병", heavy: "중화기병", drone: "드론", blade: "검귀", kamikaze: "자폭 드론",
      collector: "회수반원", burner: "소각 드론",
    };
    const boss = this.bossFight();
    if (boss && boss.state !== "dead") {
      const st = boss.state;
      const P: Record<string, string> = {
        windup: "연격", strike: "연격", delay: "늦은 3타", heavyWindup: "발도 돌진", lunge: "발도 돌진",
        sweepWindup: "하단 쓸기", sweep: "하단 쓸기", leapWindup: "도약 내려찍기", air: "도약 내려찍기", smash: "도약 충격파",
        volley: "구체 탄막", missile: "미사일", laserWind: "레이저", laser: "레이저",
        chainWind: "천참", chainStrike: "천참", chainGap: "천참", rushIn: "따닥 연격", cut: "따닥 연격", cutGap: "따닥 연격", rushOut: "따닥 연격",
      };
      const who = this.bossName(boss);
      if (boss instanceof Bulwark) {
        const PB: Record<string, string> = { bAim: "진압탄", bFire: "진압탄", recover: "진압탄", ramWind: "방패 돌진", ram: "방패 돌진", slamWind: "충격파" };
        if (b?.kind === "wave") return `${who} · 충격파`;
        if (b && !b.melee) return `${who} · 진압탄`;
        return `${who} · ${PB[st] ?? "방패 돌진"}`;
      }
      if (boss instanceof Chief) {
        const PC: Record<string, string> = { windup: "경봉 연타", strike: "경봉 연타", smashWind: "내리찍기", smash: "내리찍기", flameWind: "소각 화염", flame: "소각 화염" };
        if (b && b.melee && b.vy === 0 && Math.abs(b.vx) === 10) return `${who} · 소각 화염`;
        return `${who} · ${PC[st] ?? "근접"}`;
      }
      if (b?.kind === "wave") return `${who} · 충격파`;
      if (b && !b.melee && b.shooterId && b.shooterId !== boss.id) return `${who}전 지원 드론`;
      return `${who} · ${P[st] ?? (b && !b.melee ? "탄" : "근접")}`;
    }
    if (b?.shooterId) {
      const s = this.world.soldiers.find((o) => o.id === b.shooterId);
      if (s) return NAMES[s.kind] ?? s.kind;
    }
    const p = this.player;
    let best = "알 수 없음", bd = 140;
    for (const s of this.world.soldiers) {
      const d = Math.hypot(s.cx - p.cx, s.cy - p.cy);
      if (d < bd) { bd = d; best = NAMES[s.kind] ?? s.kind; }
    }
    return best;
  }

  private logDeath(by: string) {
    const p = this.player;
    let cp = -1;
    this.level.checkpoints.forEach((c, i) => { if (c.x * TILE <= p.cx) cp = i; });
    PLAYLOG.deaths.push({ stage: this.stageId, at: cp < 0 ? "시작 구간" : `체크포인트 ${cp + 1} 이후`, by, t: Math.round(this.realTime) });
  }

  onHotkey(code: string) {
    if (this.script && code !== "Tab") { this.skipScript(); return; }
    if (code === "Tab") {
      this.tuning.toggle();
    } else if (code === "Backquote" || code === "F1") {
      this.debugOn = !this.debugOn;
      this.debugEl.style.display = this.debugOn ? "block" : "none";
    } else if (code === "Enter" || code === "NumpadEnter") {
      this.nextStage();
    } else if (code === "KeyY") {
      this.respawn(true);
    } else if (code === "KeyH") {
      this.helpTouched = true;
      document.getElementById("help")?.classList.toggle("hide");
    } else if (code === "KeyM") {
      SFX.setMuted(!SFX.muted);
    } else if ((code === "KeyW" || code === "ArrowUp") && !this.storyHold) {
      const near = this.nearShop();
      if (near && !this.shopBusy()) { this.openShop(near); return; }
      const note = this.nearNote();
      if (note) this.readNote(note);
    }
  }

  /** After a death: chips and shards found since the last checkpoint are lost, then back to it. */
  private respawnAfterDeath() {
    const lost = forfeitEarnings();
    this.respawn(false);
    if (lost.chips || lost.shards) {
      const p = this.player;
      const text = `-${lost.chips}C` + (lost.shards ? `  -${lost.shards} SHARD` : "");
      this.time.delayedCall(500, () => this.combat.popup(text, p.cx, p.y - 30, 0xff9cc2, 0x5a1030, 1, 1.4));
    }
  }

  /** full = restart the stage; otherwise return to the last checkpoint. */
  respawn(full: boolean) {
    for (const s of this.world.soldiers) SFX.aimStop(s.id);
    this.combat.clearViews();
    this.stage.clearProps();
    this.stage.resetWalls();
    this.debris.clear();
    this.world.reset(full);
    this.arenaFocus = null;
    this.sm.duck(1);
    this.bm.stop(0.4);
    this.hud.bossA = 0;
    this.clearT = -1;
    if (this.maskFall) { this.maskFall.img.destroy(); this.maskFall = null; }
    if (!this.sm.playing) this.sm.start();
    if (full) {
      commitEarnings(); // the restart key (a test tool) keeps everything earned
      this.stats = { start: this.realTime, kills: 0, wrecks: 0, parries: 0, perfects: 0, deaths: 0, cines: 0, props: 0, bossStart: 0, bossTime: -1 };
      const el = document.getElementById("clear");
      if (el) el.hidden = true;
      if (!this.sm.playing) this.sm.start();
      this.applyStartCondition(true);
    }
    this.refreshBeacons();
    this.snapCamera();
  }

  // ----------------------------------------------------------------- loop

  update(_time: number, delta: number) {
    PLAYLOG.frame(delta);
    if (this.fpsEl) {
      const a = this.fpsAcc;
      a.t += delta; a.n++; a.worst = Math.max(a.worst, delta);
      if (a.t >= 500) {
        this.fpsEl.textContent = `${Math.round((a.n * 1000) / a.t)} FPS · 최악 ${Math.round(a.worst)}ms`;
        a.t = 0; a.n = 0; a.worst = 0;
      }
    }
    const dt = Math.min(delta, 100) / 1000;
    this.realTime += dt;
    this.cinema.update(dt);
    this.combat.realStep(dt);
    this.shake.update(dt);
    // a few frames in, so textures are on the GPU before the prologue lets the game sleep
    if (this.readyFrames < 20 && ++this.readyFrames === 20) (window as any).__gameReady = true;
    if (!this.storyHold) this.updateScript(dt);
    if (this.defeatTalk && !this.storyHold) {
      this.defeatTalk.t -= dt;
      if (this.defeatTalk.t <= 0) { const id = this.defeatTalk.id; this.defeatTalk = null; this.cut(id); }
    }
    this.kickX *= Math.pow(0.0005, dt);
    this.kickY *= Math.pow(0.0005, dt);
    let simDt = 0;
    if (!this.manual && !this.storyHold) {
      if (this.freeze > 0) {
        this.freeze -= dt;
      } else {
        const scaled = dt * this.cinema.timeScale;
        this.acc += scaled;
        simDt = scaled;
        while (this.acc >= STEP && !this.storyHold) {
          this.acc -= STEP;
          this.step();
        }
      }
    }
    if (this.script) this.scriptCamera(dt);
    this.render(simDt, dt);
  }

  /** Deterministic stepping for automated checks. */
  manualStep(n: number, o: Partial<InputFrame> = {}) {
    this.manual = true;
    for (let i = 0; i < n; i++) {
      this.step({
        x: 0, y: 0, jumpPressed: false, jumpHeld: false, dashPressed: false, parryPressed: false,
        aimX: 0, aimY: 0, ...o,
      });
      o = { ...o, jumpPressed: false, dashPressed: false, parryPressed: false, slashPressed: false };
    }
    this.render(STEP, STEP);
  }

  step(override?: InputFrame) {
    this.simTime += STEP;
    this.fx.update(STEP);
    this.after.update(STEP);
    this.debris.update(STEP);
    const cam = this.cameras.main;
    const inp = override ?? this.input2.frame((sx, sy) => {
      const w = cam.getWorldPoint(sx, sy);
      return { x: w.x, y: w.y };
    });
    this.world.step(inp);
    SFX.listenerX = this.player.cx;
    this.combat.step(STEP, this.world);
    this.advanceAnim(STEP);

    // blade fighters leave a crimson trail while cutting
    this.bladeAfterT -= STEP;
    if (this.bladeAfterT <= 0) {
      this.bladeAfterT = LITE_MODE ? 0.05 : 0.03;
      for (const s of this.world.soldiers) {
        const air = s instanceof Boss && (s.state === "air" || s.state === "finaleUp");
        const big = s.state === "lunge" || s.state === "sweep" || s.state === "chainStrike" || s.state === "rushIn" || s.state === "rushOut" || (s instanceof Assassin && s.flurry && s.state === "cutGap");
        if (!s.def.melee || (!big && !air && s.state !== "strike" && s.state !== "smash" && s.state !== "cut")) continue;
        const v = this.combat.views.get(s.id);
        const tint = s instanceof Assassin ? (s.flurry && s.state !== "rushOut" ? (big ? 0xff3a4a : 0xc0203a) : big ? 0xb967ff : 0x8a3fd0) : big ? 0xff2850 : 0xc02050;
        if (v && v.body.visible && (!air || this.afterFlip)) this.after.spawn(v.body, tint, big ? 0.24 : air ? 0.12 : 0.14, big ? 0.5 : air ? 0.22 : 0.3);
      }
      this.afterFlip = !this.afterFlip;
      for (const b of this.world.bullets) {
        if (b.kind === "missile" && b.alive && b.owner === "enemy") {
          this.fx.burst(b.x - b.vx * 0.02, b.y - b.vy * 0.02, {
            count: 1, speed: [5, 20], angle: [0, 360], life: [0.4, 0.8], size: [2, 3], sizeEnd: 5,
            colors: [0x4a4060, 0x5a4a78], alpha: 0.4, drag: 0.03, grav: -15,
          });
        }
      }
      // shockwaves kick up grit as they roll
      for (const b of this.world.bullets) {
        if (b.kind !== "wave" || !b.alive) continue;
        this.fx.burst(b.x, b.y + 6, {
          count: 2, speed: [30, 120], angle: b.vx > 0 ? [200, 260] : [-80, -20], life: [0.2, 0.45], size: [1, 3], sizeEnd: 1,
          colors: [C.dust, 0xff6a8a, C.dustLo], grav: 300, drag: 0.04,
        });
      }
    }

    const p = this.player;
    if (p.state === "dash") {
      this.afterTimer -= STEP;
      if (this.afterTimer <= 0) {
        this.afterTimer = 0.034;
        this.syncSprite();
        this.afterFlip = !this.afterFlip;
        this.after.spawn(this.sprite, this.afterFlip ? C.cyan : C.pink, 0.2, 0.42);
      }
    }
    // rope zips as each squad member starts down
    for (const s of this.world.soldiers) {
      if (s.state === "enter" && s.enterDelay <= 0 && !this.rappelled.has(s.id)) {
        this.rappelled.add(s.id);
        if (!s.def.flying) SFX.rappel(s.cx);
      }
    }
    const cb = this.cinema.bullet;
    if (cb && cb.alive && Math.random() < 0.7) {
      this.fx.burst(cb.x, cb.y, {
        count: 1, speed: [10, 40], angle: [0, 360], life: [0.3, 0.6], size: [1, 2],
        colors: [C.cyanHi, C.white], add: true, drag: 0.05,
      });
    }
    this.flashTimer = Math.max(0, this.flashTimer - STEP);
    const m = this.maskFall;
    if (m && !m.rest) {
      m.vy += 900 * STEP;
      m.x += m.vx * STEP;
      m.y += m.vy * STEP;
      m.rot += m.vr * STEP;
      if (m.y > m.floor - 6) {
        m.y = m.floor - 6;
        if (Math.abs(m.vy) > 120) {
          m.vy *= -0.35; m.vx *= 0.5; m.vr *= 0.4;
          SFX.heavyClank(m.x);
          this.fx.burst(m.x, m.floor, { count: 8, speed: [30, 90], angle: [200, 340], life: [0.2, 0.4], size: [1, 1], colors: [0xb8c8ff], alpha: 0.7, grav: 400 });
        } else {
          m.rest = true;
          m.rot = Math.PI * Math.round(m.rot / Math.PI); // settles face up or face down
        }
      }
      m.img.setPosition(Math.round(m.x), Math.round(m.y)).setRotation(m.rot);
    }

    this.bgFx.update(STEP);
    this.marketStep(STEP);
    for (const f of this.flames) {
      // the shed burning: tongues of flame, embers going up, smoke rolling off the top
      f.t -= STEP;
      if (f.t > 0) continue;
      f.t = LITE_MODE ? 0.09 : 0.05;
      this.bgFx.burst(f.x + Math.random() * f.w, f.y - 2, {
        count: 2, speed: [20, 60], angle: [255, 285], life: [0.25, 0.55], size: [2, 4], sizeEnd: 1,
        colors: [0xffd27a, 0xff8a2a, 0xe04020], add: true, drag: 0.02, grav: -120,
      });
      if (Math.random() < 0.4) this.bgFx.burst(f.x + Math.random() * f.w, f.y - 10, {
        count: 1, speed: [30, 80], angle: [240, 300], life: [0.6, 1.2], size: [1, 1], colors: [0xffcf7a, 0xffffff], add: true, drag: 0.01, grav: -60,
      });
      if (Math.random() < 0.25) this.bgFx.burst(f.x + Math.random() * f.w, f.y - 24, {
        count: 1, speed: [8, 20], angle: [250, 290], life: [1.4, 2.4], size: [4, 6], sizeEnd: 12, colors: [0x2a2030, 0x3a2e3a], alpha: 0.4, drag: 0.01, grav: -18,
      });
    }
    for (const v of this.vents) {
      v.t -= STEP;
      if (v.t <= 0) {
        v.t = 0.12 + Math.random() * 0.15;
        this.fx.burst(v.x + 8, v.y, {
          count: 1, speed: [10, 25], angle: [250, 290], life: [1.2, 2], size: [3, 5], sizeEnd: 8,
          colors: [0x6a5f90, 0x524877], alpha: 0.25, drag: 0.01, grav: -6,
        });
      }
    }
    this.bossBeats();
    this.runBossSkip();
    this.assassinCoach();
    this.storyTick();
    for (const s of this.world.soldiers) {
      if (s.kind !== "kamikaze") continue;
      if (s.state === "armed") {
        // beeps that quicken with the blink
        const k = s.fuseMax > 0 ? 1 - s.fuse / s.fuseMax : 1;
        const t = (this.beepT.get(s.id) ?? 0) - STEP;
        if (t <= 0) { SFX.kamikaze("beep", s.cx, k); this.beepT.set(s.id, 0.2 - 0.16 * k); }
        else this.beepT.set(s.id, t);
      } else if (s.state === "charge" && Math.random() < 0.8) {
        this.fx.burst(s.cx - Math.cos(s.aim) * 9, s.cy - Math.sin(s.aim) * 9, {
          count: 1, speed: [10, 40], angle: [0, 360], life: [0.15, 0.3], size: [1, 2], colors: [C.purple, 0xe8c8ff, C.pink], add: true, drag: 0.1,
        });
      }
    }
    {
      // the oni gathers himself on the billboard
      const b = this.world.boss;
      if (b && b.state === "finaleCharge") {
        const k = b.stateT / 2;
        this.fx.burst(b.cx + (Math.random() - 0.5) * 70, b.cy + 40 + Math.random() * 30, {
          count: 2, speed: [60, 140], angle: [255, 285], life: [0.3, 0.6], size: [1, 2],
          colors: [C.pink, C.pinkHi, 0x8a1040], add: true, drag: 0.02,
        });
        if (Math.random() < 0.08 + k * 0.2) this.shake.add(0.05);
      }
    }
    this.updateMusic();
    if (!this.script) this.updateCamera(STEP);
  }

  private updateMusic() {
    const p = this.player;
    const boss = this.bossFight();
    if (boss) {
      const hot = boss instanceof Bulwark ? !boss.shielded : boss.phase === 2;
      if (boss.state !== "intro" && boss.state !== "dead" && this.bm.playing) this.bm.setIntensity(hot ? 1 : 0.6);
      return;
    }
    let combat = this.world.activeArenas.size > 0 ? 1 : 0;
    if (!combat) {
      for (const s of this.world.soldiers) {
        if (!s.alive || s.state === "patrol" || s.state === "dormant" || s.state === "search") continue;
        if (Math.abs(s.cx - p.cx) < 420) { combat = 1; break; }
      }
    }
    this.sm.setIntensity(combat);
  }

  advanceAnim(dt: number) {
    const p = this.player;
    const key = p.anim;
    if (key !== this.animKey) {
      this.animKey = key;
      this.animTime = 0;
    }
    const speed = key === "run" ? Math.max(0.6, Math.abs(p.vx) / TUNE.runSpeed) : 1;
    this.animTime += dt * speed;
  }

  syncSprite() {
    const p = this.player;
    const s = this.sprite;
    const a = HERO_ANIMS[this.animKey] ?? HERO_ANIMS.idle;
    const len = a.end - a.start + 1;
    let fi = Math.floor(this.animTime * a.fps);
    fi = a.loop ? fi % len : Math.min(fi, len - 1);
    s.setFrame(a.start + fi);
    const left = p.facing < 0;
    s.setFlipX(left);
    s.setOrigin((left ? 50 : 46) / 96, 78 / 80);
    s.setPosition(Math.round(p.cx), Math.round(p.bottom));
    s.setScale(p.dead ? 1 : p.scaleX, p.dead ? 1 : p.scaleY);
  }

  /** The nearest sword fighter we are dueling with, if any. */
  private duelPartner(): Soldier | null {
    const p = this.player;
    let best: Soldier | null = null, bd = 150;
    for (const s of this.world.soldiers) {
      if (!s.def.melee || s instanceof Boss || !s.alive || s.state === "patrol" || s.state === "dormant" || s.state === "enter") continue;
      const d = Math.abs(s.cx - p.cx);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  updateCamera(dt: number) {
    const p = this.player;
    const cb = this.cinema.bullet;
    let tx: number, ty: number, k: number;
    let zoomT = 1;
    const duel = this.duelPartner();
    const boss = this.bossFight();
    const finaleHigh = boss && (boss.state === "finaleUp" || boss.state === "finaleCharge");
    const chain = boss && (boss.state === "chainWind" || boss.state === "chainStrike" || boss.state === "chainGap");
    if (boss && finaleHigh) {
      // look up at him on the billboard
      tx = (boss.arenaMin + boss.arenaMax) / 2;
      ty = (this.level.boss!.y * TILE + boss.perchY) / 2 - 10;
      k = 3;
    } else if (boss && chain) {
      // close on the duel: every cut lands in frame
      tx = (p.cx + boss.cx) / 2;
      ty = p.cy - 26;
      k = 9;
      zoomT = 1.14;
    } else if (boss && !(cb && cb.alive)) {
      // the heliport fits the screen: hold it, drifting a little with the fight
      const mid = (boss.arenaMin + boss.arenaMax) / 2;
      const fmid = (p.cx + boss.cx) / 2;
      tx = mid + (fmid - mid) * 0.12;
      if (boss instanceof Assassin) {
        // the whole shaft in frame: walls, ceiling and floor
        ty = (boss.roomTop + boss.floorY) / 2 + 6;
        tx = mid;
      } else if (boss instanceof Archivist) {
        // the vault from the floor up to the pod
        ty = boss.floorY - 172;
        tx = mid;
      } else ty = this.level.boss!.y * TILE - 118 + Math.min(0, p.cy - (this.level.boss!.y * TILE - 25)) * 0.35;
      k = 4;
    } else if (cb && cb.alive) {
      tx = p.cx + (cb.x - p.cx) * 0.72;
      ty = p.cy + (cb.y - p.cy) * 0.72 - 10;
      k = 6;
    } else if (this.arenaFocus && this.arenaFocus.t > 0) {
      this.arenaFocus.t -= dt;
      const f = this.arenaFocus;
      tx = (p.cx + f.x * 2) / 3;
      ty = (p.cy - 24 + f.y * 2) / 3;
      k = 3;
      zoomT = 0.92;
    } else if (duel) {
      tx = (p.cx + duel.cx) / 2;
      ty = (p.cy + duel.cy) / 2 - 20;
      k = 5;
      zoomT = 1.08;
    } else {
      const lookTarget = p.facing * TUNE.lookahead * Math.min(1, Math.abs(p.vx) / TUNE.runSpeed + 0.35);
      this.look += (lookTarget - this.look) * (1 - Math.exp(-dt * 3));
      tx = p.cx + this.look;
      ty = p.cy - 24 - this.camLift + (p.vy > 300 ? 40 : 0);
      k = 7;
    }
    this.zoom += (zoomT - this.zoom) * (1 - Math.exp(-dt * 3));
    this.camX += (tx - this.camX) * (1 - Math.exp(-dt * k));
    this.camY += (ty - this.camY) * (1 - Math.exp(-dt * (p.vy > 200 ? 9 : 5)));
    this.clampCamera();
  }

  private clampCamera() {
    const hw = VIEW_W / 2 / this.zoom, hh = VIEW_H / 2 / this.zoom;
    this.camX = Phaser.Math.Clamp(this.camX, hw, this.level.pixelW - hw);
    this.camY = Phaser.Math.Clamp(this.camY, hh, this.level.pixelH - hh);
  }

  /** Camera paths for scripted moments (real time). */
  private scriptCamera(dt: number) {
    const s = this.script!;
    const p = this.player;
    if (s.kind === "intro") {
      // descend from the skyline onto the hero, easing in
      const u = Math.min(1, s.t / (s.dur - 0.4));
      const e = u * u * (3 - 2 * u);
      const x0 = p.cx + 300, y0 = VIEW_H / 2 + 10;
      const x1 = p.cx + TUNE.lookahead * 0.35, y1 = p.cy - 24;
      this.camX = x0 + (x1 - x0) * e;
      this.camY = y0 + (y1 - y0) * e;
      this.zoom = 1;
    } else if (s.kind === "boss") {
      const b = this.world.boss!;
      const mid = (b.arenaMin + b.arenaMax) / 2;
      const floor = this.level.boss!.y * TILE;
      // look up at the dropship (or the ceiling), then settle on the boss as he lands
      const land = b.introLong && !(b instanceof Chief) && !(b instanceof Bulwark) ? 1.9 : 0;
      const asn = b instanceof Assassin ? b : null;
      let tx = s.t < land ? mid + 60 : (mid + b.cx) / 2;
      let ty = s.t < land ? floor - 170 : floor - 118;
      if (asn) {
        tx = s.t < land ? mid + 40 : mid;
        ty = s.t < land ? asn.roomTop + 90 : (asn.roomTop + asn.floorY) / 2 + 6;
      }
      this.camX += (tx - this.camX) * (1 - Math.exp(-dt * 4));
      this.camY += (ty - this.camY) * (1 - Math.exp(-dt * 4));
      const zt = s.t > land + 0.3 && s.t < s.dur - 0.6 ? 1.12 : 1;
      this.zoom += (zt - this.zoom) * (1 - Math.exp(-dt * 3));
    } else if (s.kind === "teaser") {
      const T = this.level.teaser!;
      const bx = T.x * TILE + 8, by = T.y * TILE + 60;
      const u = Math.min(1, s.t / 0.9);
      const back = s.t > s.dur - 0.8 ? (s.t - (s.dur - 0.8)) / 0.8 : 0;
      const tx = p.cx + (bx - p.cx) * (u * (1 - back));
      const ty = p.cy - 24 + (by - (p.cy - 24)) * (u * (1 - back));
      this.camX += (tx - this.camX) * (1 - Math.exp(-dt * 6));
      this.camY += (ty - this.camY) * (1 - Math.exp(-dt * 6));
      this.zoom += ((s.t > 0.6 && s.t < s.dur - 0.8 ? 1.12 : 1) - this.zoom) * (1 - Math.exp(-dt * 3));
      if (s.t > 0.6 && s.t < 3.2 && Math.random() < 0.06) this.shake.add(0.06);
    }
    this.clampCamera();
  }

  /** The outskirts sit low on solid ground: look a little higher, less earth on screen. */
  get camLift() { return this.level.theme === "outskirts" ? 28 : 0; }

  snapCamera() {
    const p = this.player;
    this.camX = p.cx;
    this.camY = p.cy - 24 - this.camLift;
    this.clampCamera();
  }

  render(simDt: number, realDt: number) {
    const p = this.player;
    for (const r of this.shards) {
      const taken = WALLET.shardsTaken.has(r.id);
      const bob = Math.sin(this.realTime * 2.4 + r.x) * 2;
      r.img.setVisible(!taken).setPosition(r.x, Math.round(r.y + bob)).setRotation(Math.sin(this.realTime * 1.3 + r.x) * 0.15);
      r.glow.setVisible(!taken).setPosition(r.x, r.y + bob).setAlpha(0.4 + 0.2 * Math.sin(this.realTime * 3 + r.x));
    }
    for (const sg of this.shopGlows) sg.glow.setAlpha(sg.base + 0.08 * Math.sin(this.realTime * 2.2 + sg.base * 9));
    this.updateShopPrompt();
    this.renderOutskirts(realDt);
    this.renderMarket(realDt);
    for (const r of this.records) {
      const taken = this.world.recordsTaken.has(r.id);
      const bob = Math.sin(this.realTime * 2 + r.x) * 2;
      r.img.setVisible(!taken).setPosition(r.x, Math.round(r.y + bob));
      r.glow.setVisible(!taken).setPosition(r.x, r.y + bob).setAlpha(0.35 + 0.2 * Math.sin(this.realTime * 3 + r.x));
    }
    const cam = this.cameras.main;
    const zoom = this.zoom * (1 + 0.1 * (this.cinema.mode === "scene" ? 0 : this.cinema.letter));
    cam.setZoom(zoom);
    cam.centerOn(Math.round(this.camX + this.shake.ox + this.kickX), Math.round(this.camY + this.shake.oy + this.kickY));

    const vx = cam.midPoint.x - VIEW_W / 2, vy = cam.midPoint.y - VIEW_H / 2;
    this.bgFar.tilePositionX = vx * 0.08;
    this.bgFar.y = Math.round(10 - vy * 0.06);
    this.bgMid.tilePositionX = vx * 0.2;
    this.bgMid.y = Math.round(30 - vy * 0.14);

    {
      // the shaft darkens while the Assassin hunts, so his silhouette reads
      const asn = this.bossFight() instanceof Assassin && this.world.boss!.state !== "dead";
      this.bgDim += ((asn ? 1 : 0) - this.bgDim) * (1 - Math.exp(-realDt * 2));
      const c = Math.round(255 - 95 * this.bgDim);
      const tint = (c << 16) | (c << 8) | Math.min(255, c + 20);
      this.bgMid.setTint(tint);
      this.bgFar.setTint(tint);
    }
    this.syncSprite();
    this.healGlow = Math.max(0, this.healGlow - realDt);
    if (p.healT >= 0 || this.healGlow > 0) {
      // the ampoule's glow running through him
      const k = p.healT >= 0 ? 0.4 + 0.3 * Math.sin(this.realTime * 30) : this.healGlow * 2;
      const v = Math.round(60 * Math.max(0, Math.min(1, k)));
      this.sprite.setTint((Math.round(v * 0.3) << 16) | (v << 8) | Math.round(v * 0.7)).setTintMode(Phaser.TintModes.ADD);
      if (p.healT >= 0 && Math.random() < 0.5) {
        this.fx.burst(p.cx + (Math.random() - 0.5) * 16, p.y + 10 + Math.random() * 36, {
          count: 1, speed: [10, 30], angle: [260, 280], life: [0.3, 0.6], size: [1, 1], colors: [0x6dffc0, 0xe0fff2], add: true, grav: -60,
        });
      }
    } else if (this.flashTimer > 0) {
      this.sprite.setTint(0x38606e).setTintMode(Phaser.TintModes.ADD);
    } else if (p.dashes <= 0) {
      this.sprite.setTint(0x8f9ccf).setTintMode(Phaser.TintModes.MULTIPLY);
    } else {
      // neon falling on the old man as he passes signs, lamps and muzzle flashes
      const extra: LightSrc[] = this.combat.lights.map((l) => {
        const rgb: Record<string, [number, number, number]> = {
          glowAmber: [255, 179, 71], glowCyan: [45, 226, 230], glowPink: [255, 42, 109], glowPurple: [185, 103, 255], glowWhite: [255, 255, 255],
        };
        const [r, g, b] = rgb[l.color];
        const k = 1 - l.t / 0.12;
        return { x: l.x, y: l.y, r: r * k * 2, g: g * k * 2, b: b * k * 2, reach: 120 };
      });
      const tint = this.stage.heroLight(p.cx, p.y + 20, extra);
      if (tint) this.sprite.setTint(tint).setTintMode(Phaser.TintModes.ADD);
      else this.sprite.clearTint();
    }
    this.sprite.setAlpha(p.invuln > 0 && !p.dead && Math.floor(this.realTime * 16) % 2 === 0 ? 0.35 : 1);

    this.fx.draw();
    this.bgFx.draw();
    this.stage.update(this.world, cam, realDt, simDt, this.realTime);
    this.combat.draw(this.world, this.realTime, this.cinema.bullet);
    this.drawRain(simDt, vx - this.prevCamX);
    this.prevCamX = vx;

    for (const s of this.signs) {
      s.t -= realDt;
      let a = 1;
      if (s.t < 0) {
        a = Math.random() < 0.5 ? 0.25 : 1;
        if (s.t < -0.25) s.t = 2 + Math.random() * 6;
      }
      s.img.setAlpha(a);
      s.glow.setAlpha(s.base * a * (0.9 + 0.1 * Math.sin(this.simTime * 3)));
    }
    for (const b of this.blinkers) b.img.setAlpha(Math.sin(this.simTime * 3 + b.phase) > 0.6 ? 0.9 : 0.1);

    this.drawBanner(realDt);
    if (this.gateGlow) this.gateGlow.setAlpha(0.35 + 0.1 * Math.sin(this.realTime * 2.5));
    this.hud.update(realDt, p);
    {
      const b = this.bossFight();
      const show = !!b && b.state !== "dead" && !(b.state === "intro" && b.introLong && b.stateT < 3.4);
      this.hud.drawBoss(this.world.boss, show, realDt, this.realTime);
    }
    if (this.clearT > 0 && !this.storyHold && !this.defeatTalk) {
      this.clearT -= realDt;
      if (this.clearT <= 0) { this.clearT = -1; this.world.cleared = true; this.onStageClear(); }
    }
    this.hud.draw(p, this.input2.mouseScreenX, this.input2.mouseScreenY, this.realTime);
    this.hud.drawWallet(WALLET.chips, WALLET.shards, !!this.level.shops.length || WALLET.chips > 0);
    this.cinema.draw(realDt);
    this.drawDebug();
  }

  drawBanner(dt: number) {
    const g = this.banner;
    g.clear();
    if (this.bannerT < 0) return;
    this.bannerT += dt;
    const big = this.bannerText === "STAGE CLEAR";
    const life = big ? 4 : 1.6;
    if (this.bannerT > life) { this.bannerT = -1; return; }
    const t = this.bannerT;
    const a = t < 0.15 ? t / 0.15 : t > life - 0.4 ? (life - t) / 0.4 : 1;
    const sc = big ? 3 : 2;
    const w = textWidth(this.bannerText, sc);
    const x = Math.round(VIEW_W / 2 - w / 2);
    const y = big ? 120 : 56;
    const barW = Math.min(VIEW_W, (w + 40) * Math.min(1, t / 0.2));
    g.fillStyle(0x07050f, 0.6 * a);
    g.fillRect(Math.round(VIEW_W / 2 - barW / 2), y - 8, Math.round(barW), 7 * sc + 16);
    g.fillStyle(this.bannerColor, a);
    g.fillRect(Math.round(VIEW_W / 2 - barW / 2), y - 8, Math.round(barW), 1);
    g.fillRect(Math.round(VIEW_W / 2 - barW / 2), y + 7 * sc + 7, Math.round(barW), 1);
    drawText(g, this.bannerText, x, y, 0xffffff, a, sc, this.bannerColor === C.pink ? 0x8a1040 : 0x0a6a78);
  }

  drawRain(dt: number, camDX: number) {
    if (LITE_MODE) { this.moveRainSprites(dt, camDX); return; }
    const back = this.rainBack, front = this.rainFront;
    back.clear();
    front.clear();
    if (!this.outdoors) {
      // indoors: slow dust motes and the odd falling spark instead of rain;
      // in the archive, motes of light drift upward like loosened memories
      const up = this.level.theme === "archive";
      for (const r of this.rain) {
        if (up) { r.y -= (8 + 14 * r.z) * dt; if (r.y < -6) { r.y += VIEW_H + 10; r.x = Math.random() * (VIEW_W + 60); } }
        else r.y += (6 + 10 * r.z) * dt;
        r.x += (Math.sin(this.simTime * 0.6 + r.z * 9) * 6 - camDX * r.z * 0.6) * dt * 10 / 10;
        r.x -= camDX * r.z * 0.6;
        if (r.y > VIEW_H) { r.y -= VIEW_H + 10; r.x = Math.random() * (VIEW_W + 60); }
        if (r.x < -20) r.x += VIEW_W + 60;
        if (r.x > VIEW_W + 40) r.x -= VIEW_W + 60;
        const g = r.z > 0.9 ? front : back;
        const spark = r.z > 0.97;
        g.fillStyle(up ? (spark ? 0xffffff : 0x9ffcff) : spark ? 0xffb347 : 0x8a9ad8, spark ? 0.8 : 0.08 + 0.18 * r.z);
        g.fillRect(Math.round(r.x), Math.round(r.y), 1, spark ? 2 : 1);
      }
      return;
    }
    const flash = (this.stage.flash > 0.4 ? 1.8 : 1) * (1 - 0.88 * this.roomFade);
    for (const r of this.rain) {
      const sp = 420 + 380 * r.z;
      r.y += sp * dt;
      r.x += -sp * 0.18 * dt - camDX * r.z * 0.6;
      if (r.y > VIEW_H) { r.y -= VIEW_H + 20; r.x = Math.random() * (VIEW_W + 60); }
      if (r.x < -20) r.x += VIEW_W + 60;
      if (r.x > VIEW_W + 40) r.x -= VIEW_W + 60;
      const g = r.z > 0.85 ? front : back;
      const len = Math.round(4 + 8 * r.z);
      g.fillStyle(r.z > 0.85 ? 0xc8d8ff : 0x9a8cd8, Math.min(1, (r.z > 0.85 ? 0.28 : 0.12 + 0.18 * r.z) * flash));
      for (let k = 0; k < len; k++) g.fillRect(Math.round(r.x + k * 0.18), Math.round(r.y - k), 1, 1);
    }
  }

  private moveRainSprites(dt: number, camDX: number) {
    const tower = !this.outdoors;
    const up = this.level.theme === "archive";
    const flash = (this.stage.flash > 0.4 ? 1.8 : 1) * (1 - 0.88 * this.roomFade);
    this.rain.forEach((r, i) => {
      const img = this.rainImgs[i];
      if (tower) {
        if (up) { r.y -= (8 + 14 * r.z) * dt; if (r.y < -6) { r.y += VIEW_H + 10; r.x = Math.random() * (VIEW_W + 60); } }
        else r.y += (6 + 10 * r.z) * dt;
        r.x += (Math.sin(this.simTime * 0.6 + r.z * 9) * 6) * dt - camDX * r.z * 0.6;
        if (r.y > VIEW_H) { r.y -= VIEW_H + 10; r.x = Math.random() * (VIEW_W + 60); }
        const spark = r.z > 0.97;
        img.setAlpha(spark ? 0.8 : 0.08 + 0.18 * r.z);
      } else {
        const sp = 420 + 380 * r.z;
        r.y += sp * dt;
        r.x += -sp * 0.18 * dt - camDX * r.z * 0.6;
        if (r.y > VIEW_H) { r.y -= VIEW_H + 20; r.x = Math.random() * (VIEW_W + 60); }
        img.setAlpha(Math.min(1, (r.z > 0.85 ? 0.28 : 0.12 + 0.18 * r.z) * flash));
      }
      if (r.x < -20) r.x += VIEW_W + 60;
      if (r.x > VIEW_W + 40) r.x -= VIEW_W + 60;
      img.setPosition(Math.round(r.x), Math.round(r.y) + 1);
    });
  }

  drawDebug() {
    const g = this.debugG;
    g.clear();
    if (!this.debugOn) return;
    const p = this.player;
    g.lineStyle(1, 0x00ff88, 1);
    g.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
    const c = this.world.chest();
    g.lineStyle(1, p.parryTimer > 0 ? 0xffffff : 0x447788, 0.6);
    const a = Math.atan2(p.aimY, p.aimX), span = (65 * Math.PI) / 180;
    g.beginPath();
    g.arc(c.x, c.y, TUNE.parryRange, a - span, a + span);
    g.strokePath();
    for (const s of this.world.soldiers) {
      if (!s.alive) continue;
      g.lineStyle(1, 0xff4466, 1);
      g.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
    }
    for (const pr of this.world.props) {
      g.lineStyle(1, 0xffcc00, 1);
      g.strokeRect(pr.x + 0.5, pr.y + 0.5, pr.w - 1, pr.h - 1);
    }
    this.debugEl.textContent =
      `상태 ${p.state}${p.onGround ? " / 지면" : ""}  체력 ${p.hp}/${p.maxHp}\n` +
      `속도 x ${p.vx.toFixed(0)}  y ${p.vy.toFixed(0)}  대쉬 ${p.dashes}\n` +
      `패링 ${p.parryTimer > 0 ? "판정 중" : p.parryCooldown > 0 ? "대기" : "준비"}  총알 ${this.world.bullets.length}\n` +
      `시간 배율 ${this.cinema.timeScale.toFixed(2)}  연출 ${this.cinema.mode}  음악 ${this.sm.intensity.toFixed(2)}`;
  }
}
