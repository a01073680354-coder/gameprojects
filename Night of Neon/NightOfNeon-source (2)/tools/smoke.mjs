// Browser smoke test: opens dist/test.html in headless Edge (or Chrome) once
// per stage and fails on any script error. It checks that each stage boots
// and runs a few seconds of real frames (scene, textures, art, audio wiring),
// which the headless tests never touch. It does not play the game.
// usage: npm run build && npm run smoke
//        npm run smoke -- 12      (one stage, by code id)
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = path.join(root, "dist", "test.html");
if (!fs.existsSync(page)) { console.error("dist/test.html is missing: run npm run build first"); process.exit(1); }

const BROWSERS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium",
];
const browser = BROWSERS.find((b) => fs.existsSync(b));
if (!browser) { console.error("no Edge or Chrome found: smoke test skipped"); process.exit(1); }

// code-side stage ids in story order, and the title each must put on screen (src/world/stages.ts)
const STAGES = [
  { id: "11", label: "STAGE 1 outskirts", title: "The Outskirts" },
  { id: "12", label: "STAGE 2 market", title: "The Undercity Market" },
  { id: "1", label: "STAGE 3 rooftop", title: "Neon Rooftops" },
  { id: "2", label: "STAGE 4 spire", title: "Neon Spire" },
  { id: "3", label: "STAGE 5 archive", title: "The Forgotten Archive" },
];
const only = process.argv[2];
const todo = STAGES.filter((s) => !only || s.id === only);

// expected noise: audio needs a user gesture, which a headless run never gives
const IGNORE = [/AudioContext was not allowed to start/];

function run(st) {
  return new Promise((resolve) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "non-smoke-"));
    const url = `${pathToFileURL(page).href}?autostart&nointro&stage=${st.id}`;
    const args = [
      "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio",
      "--no-first-run", "--disable-extensions", `--user-data-dir=${profile}`,
      "--enable-logging=stderr", "--v=0", "--virtual-time-budget=10000", "--dump-dom", url,
    ];
    const p = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const kill = setTimeout(() => p.kill(), 60000);
    p.on("close", () => {
      clearTimeout(kill);
      fs.rmSync(profile, { recursive: true, force: true });
      const lines = err.split(/\r?\n/).filter((l) => l.includes("CONSOLE") && l.includes("test.html"));
      const msgs = lines.map((l) => l.replace(/^.*?CONSOLE:\d+\]\s*/, "")).filter((m) => !IGNORE.some((r) => r.test(m)));
      const errors = msgs.filter((m) => /Uncaught|Error|error|failed|undefined is not|null/i.test(m));
      const canvas = /<canvas width="640" height="360"/.test(out);
      const staged = out.includes(`<div class="t-name">${st.title}</div>`);
      resolve({ ok: canvas && staged && errors.length === 0, canvas, staged, errors, msgs });
    });
  });
}

let bad = 0;
for (const st of todo) {
  const r = await run(st);
  console.log(`${r.ok ? "ok  " : "FAIL"}  ${st.label.padEnd(18)} canvas=${r.canvas ? "yes" : "NO"}  stage=${r.staged ? "yes" : "NO"}  console errors=${r.errors.length}`);
  for (const m of r.errors.slice(0, 8)) console.log(`        ${m.slice(0, 220)}`);
  if (process.env.VERBOSE) for (const m of r.msgs) console.log(`        · ${m.slice(0, 220)}`);
  if (!r.ok) bad++;
}
console.log(bad ? `\n${bad} stage(s) FAILED` : `\nall ${todo.length} stages boot cleanly`);
process.exit(bad ? 1 : 0);
