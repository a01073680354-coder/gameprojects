// Runs the headless tests: each tests/*.test.ts is bundled with esbuild and
// run as its own node process (they share module-level state, so never in one).
// usage: npm test            (all)
//        npm test -- shop    (only files whose name contains "shop")
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filter = process.argv[2] ?? "";
const files = fs.readdirSync(path.join(root, "tests")).filter((f) => f.endsWith(".test.ts") && f.includes(filter)).sort();
const out = fs.mkdtempSync(path.join(os.tmpdir(), "non-tests-"));

const results = [];
for (const f of files) {
  const js = path.join(out, f.replace(/\.ts$/, ".mjs"));
  await esbuild.build({
    entryPoints: [path.join(root, "tests", f)],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: js,
    logLevel: "error",
  });
  const r = spawnSync(process.execPath, [js], { encoding: "utf8" });
  const text = (r.stdout ?? "") + (r.stderr ?? "");
  const pass = (text.match(/^PASS/gm) ?? []).length;
  const fail = (text.match(/^FAIL/gm) ?? []).length;
  results.push({ f, ok: r.status === 0, pass, fail });
  if (r.status !== 0 || process.env.VERBOSE) process.stdout.write(`\n---- ${f}\n${text}`);
}
fs.rmSync(out, { recursive: true, force: true });

console.log("\n==== test summary");
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.f.padEnd(22)} ${r.pass} passed${r.fail ? `, ${r.fail} failed` : ""}`);
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? `\n${bad} of ${results.length} files FAILED` : `\nall ${results.length} files passed`);
process.exit(bad ? 1 : 0);
