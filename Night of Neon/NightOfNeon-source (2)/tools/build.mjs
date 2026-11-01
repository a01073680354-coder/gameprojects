// Bundles the game into one self-contained HTML page.
// usage: npm run build   (or: node tools/build.mjs)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...a) => path.join(root, ...a);

const heroPng = fs.readFileSync(P("assets/hero.png")).toString("base64");
const heroJson = JSON.parse(fs.readFileSync(P("assets/hero.json"), "utf8"));
const soldierMeta = JSON.parse(fs.readFileSync(P("assets/soldier.json"), "utf8"));
const bladeJson = JSON.parse(fs.readFileSync(P("assets/blade.json"), "utf8"));
const bossJson = JSON.parse(fs.readFileSync(P("assets/boss.json"), "utf8"));
const assassinJson = JSON.parse(fs.readFileSync(P("assets/assassin.json"), "utf8"));
const chiefJson = JSON.parse(fs.readFileSync(P("assets/chief.json"), "utf8"));
const civJson = JSON.parse(fs.readFileSync(P("assets/civ.json"), "utf8"));
const png = (f) => "data:image/png;base64," + fs.readFileSync(P("assets", f)).toString("base64");
const IMAGES = {
  soldier_rifle: png("soldier_rifle.png"),
  soldier_burst: png("soldier_burst.png"),
  soldier_heavy: png("soldier_heavy.png"),
  arm_rifle: png("arm_rifle.png"),
  arm_burst: png("arm_burst.png"),
  arm_heavy: png("arm_heavy.png"),
  drone: png("drone.png"),
  blade: png("blade.png"),
  boss: png("boss.png"),
  assassin: png("assassin.png"),
  grunt: png("grunt.png"),
  chief: png("chief.png"),
  civ: png("civ.png"),
};

const phaser = fs.readFileSync(P("vendor/phaser.min.js"), "utf8");
const esc = (s) => s.replace(/<\/script/gi, "<\\/script");
const skeleton = (html) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}</style></head><body>${html}</body></html>`;

async function bundle() {
  const res = await esbuild.build({
    entryPoints: [P("src/main.ts")],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2020",
    minify: !process.env.NOMINIFY,
    define: {
      // the laptop-friendly path is the only one (lite fixes for all, Oct 30; one build, Nov 1)
      LITE: "true",
      HERO_PNG: JSON.stringify("data:image/png;base64," + heroPng),
      HERO_ANIMS: JSON.stringify(heroJson.anims),
      SOLDIER_META: JSON.stringify(soldierMeta),
      IMAGES: JSON.stringify(IMAGES),
      BLADE_ANIMS: JSON.stringify(bladeJson.anims),
      BOSS_ANIMS: JSON.stringify(bossJson.anims),
      ASSASSIN_ANIMS: JSON.stringify(assassinJson.anims),
      CHIEF_ANIMS: JSON.stringify(chiefJson.anims),
      CIV_ANIMS: JSON.stringify(civJson.anims),
    },
  });
  const game = res.outputFiles[0].text;
  const html = fs.readFileSync(P("tools/template.html"), "utf8");
  return html.replace("/*PHASER*/", () => esc(phaser)).replace("/*GAME*/", () => esc(game));
}

// One build only (the Lite build was retired, user decision Nov 1).
fs.mkdirSync(P("dist"), { recursive: true });
const html = await bundle();
fs.writeFileSync(P("dist/neon.html"), html);
// local test copy with a document skeleton (the artifact host adds this itself)
fs.writeFileSync(P("dist/test.html"), skeleton(html));
console.log("built", (html.length / 1024).toFixed(0) + " KB");
// npm run release: also the playable copy next to the source folder
if (process.argv.includes("--release")) {
  const out = path.resolve(root, "..", "NightOfNeon.html");
  fs.writeFileSync(out, html);
  console.log("released", out);
}
