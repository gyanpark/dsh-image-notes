// Runs without the Harness: checks the plugin's apply() against a stub registry and the script against a mock Ollama.
import { spawn } from "node:child_process";
const run = (args) => new Promise((resolve) => {
  const p = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  p.stdout.on("data", (d) => (stdout += d)); p.stderr.on("data", (d) => (stderr += d));
  p.on("close", (status) => resolve({ status, stdout, stderr }));
});
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { startMock } from "./mock-ollama.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const ok = (name) => console.log(`  ok   ${name}`);
const bad = (name, e) => { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); };

// --- 1. plugin apply() with stub Harness modules -------------------------------------------
const nm = join(root, "node_modules");
const createdNm = !existsSync(nm);
if (createdNm) { mkdirSync(nm, { recursive: true }); cpSync(join(root, "test", "stubs"), nm, { recursive: true }); }
try {
  const mod = await import(pathToFileURL(join(root, "lib", "index.js")).href);
  assert.equal(mod.name, "image-notes"); assert.deepEqual(mod.inject, ["skills"]);
  let provider; mod.apply({ skills: { registerProvider: (f) => { provider = f(); } } }, { lang: "Hindi", model: "small-vision:latest" });
  const list = await provider.list();
  assert.equal(list.length, 1); assert.equal(list[0].name, "image-notes"); assert.equal(list[0].rank, 600);
  const def = await provider.get(list[0], {});
  assert.match(def.content, /## Runtime/); assert.match(def.content, /--lang Hindi/); assert.match(def.content, /--model small-vision:latest/);
  assert.match(def.content, /image-notes\.mjs/);
  ok("plugin registers the skill and renders the Runtime section");
} catch (e) { bad("plugin apply()", e); }
finally { if (createdNm) rmSync(nm, { recursive: true, force: true }); }

// --- 2. script against mock Ollama -----------------------------------------------------------
const { srv, port } = await startMock();
try {
  const dir = mkdtempSync(join(tmpdir(), "image-notes-"));
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
  writeFileSync(join(dir, "a.png"), png); writeFileSync(join(dir, "b.jpg"), jpg); writeFileSync(join(dir, "c.txt"), "not an image");
  const r = await run([join(root, "skills/image-notes/image-notes.mjs"),
    join(dir, "a.png"), join(dir, "b.jpg"), join(dir, "c.txt"), "--out", join(dir, "out"), "--ollama", `http://127.0.0.1:${port}`]);
  assert.equal(r.status, 0, r.stderr);
  const file = /IMAGE_NOTES_FILE: (.+)/.exec(r.stdout)?.[1]?.trim();
  assert.ok(file && existsSync(file), "notes file written");
  const notes = readFileSync(file, "utf8");
  assert.match(r.stdout, /VISION_MODEL: small-vision:latest/, "smallest vision model chosen");
  assert.match(notes, /## Image 1 — a\.png \(png/); assert.match(notes, /## Image 2 — b\.jpg \(jpeg/); assert.match(notes, /Image 3 — c\.txt[\s\S]*Not an image/);
  assert.equal((notes.match(/Read by small-vision:latest/g) || []).length, 2);
  ok("script reads images one by one, skips non-images, picks the smallest vision model");

  const r2 = await run([join(root, "skills/image-notes/image-notes.mjs"), "--help"]);
  assert.equal(r2.status, 0); assert.match(r2.stdout, /--latest N/);
  ok("--help works");

  const r3 = await run([join(root, "skills/image-notes/image-notes.mjs"), join(dir, "a.png"), "--ollama", "http://127.0.0.1:1"]);
  assert.notEqual(r3.status, 0); assert.match(r3.stderr, /not reachable/);
  ok("clear error when Ollama is down");
} catch (e) { bad("script", e); }
finally { srv.close(); }

console.log(failures ? `\n${failures} failing` : "\nall tests passed");
process.exit(failures ? 1 : 0);
