#!/usr/bin/env node
// image-notes: describe images with a local Ollama vision model, one by one, and save notes to a file.
// Usage:
//   node image-notes.mjs <sha256|path> [<sha256|path> ...] [--latest N] [--model NAME] [--out DIR] [--keep]
// Inputs:
//   <sha256>   a DeepSeek Harness attachment id -> ~/.dsh/attachments/v1/objects/<xx>/<sha>
//   <path>     any image file
//   --latest N the N most recent attachments (use when the user says "the screenshots I just pasted")
// Options:
//   --model    vision model to use (default: smallest installed model with vision capability)
//   --out      output directory (default: ./.image-notes under the current workspace)
//   --keep     do not unload the vision model afterwards
// Env: OLLAMA_HOST (default http://127.0.0.1:11434), IMAGE_NOTES_MODEL (same as --model)

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const VERSION = "1.0.0";
const major = parseInt(process.versions.node.split(".")[0], 10);
if (major < 18) { console.error(`image-notes: Node 18 or newer is required (found ${process.versions.node}).`); process.exit(1); }

function normalizeHost(h) {
  h = (h || "http://127.0.0.1:11434").trim();
  if (!/^https?:\/\//i.test(h)) h = "http://" + h;           // OLLAMA_HOST may be "127.0.0.1:11434"
  return h.replace(/\/$/, "");
}
let API = normalizeHost(process.env.IMAGE_NOTES_OLLAMA || process.env.OLLAMA_HOST);
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
let ATTACH_DIR = process.env.IMAGE_NOTES_ATTACHMENTS || path.join(DSH_HOME, "attachments", "v1", "objects");
const BRIEF = `You are extracting information from an image for another AI assistant that cannot see it.
Write plain Markdown with these sections:
1. **Type**: what kind of image (app/web UI screenshot, terminal, code, chart, diagram, document, photo).
2. **Visible text**: all readable text verbatim, including error messages, labels, numbers, file names. Use a list or a table if the image has a table.
3. **Layout**: the main regions from top to bottom and left to right; alignment; large empty or white areas; anything cut off or overlapping.
4. **Problems**: anything that looks wrong (errors, misalignment, overflow, excessive spacing, broken images, inconsistent styling). Say "none visible" if nothing.
5. **Summary**: two sentences.
Be precise. Do not guess at text you cannot read; write [unreadable].`;

const args = process.argv.slice(2);
const opt = { items: [], latest: 0, model: process.env.IMAGE_NOTES_MODEL || "", out: "", keep: false, lang: process.env.IMAGE_NOTES_LANG || "" };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--latest") opt.latest = parseInt(args[++i] || "1", 10);
  else if (a === "--model") opt.model = args[++i] || "";
  else if (a === "--out") opt.out = args[++i] || "";
  else if (a === "--attachments") ATTACH_DIR = args[++i] || ATTACH_DIR;
  else if (a === "--lang") opt.lang = args[++i] || "";
  else if (a === "--ollama") API = normalizeHost(args[++i]);
  else if (a === "--keep") opt.keep = true;
  else if (a === "--version" || a === "-v") { console.log(`image-notes ${VERSION}`); process.exit(0); }
  else if (a === "--help" || a === "-h") {
    console.log(`image-notes ${VERSION}
Usage: node image-notes.mjs <sha256|path> [...] [--latest N] [--model NAME] [--out DIR] [--attachments DIR] [--lang LANG] [--keep]
  <sha256>          DeepSeek Harness attachment id (with or without "sha256:" prefix)
  <path>            any image file (png, jpg, gif, webp, bmp)
  --latest N        the N most recent attachments
  --model NAME      vision model to use (default: smallest installed model with vision capability)
  --out DIR         output folder (default: ./.image-notes)
  --attachments DIR Harness attachment store (default: $DSH_HOME/attachments/v1/objects)
  --lang LANG       write the notes in this language (default: English)
  --ollama URL      Ollama base URL (default: $OLLAMA_HOST or http://127.0.0.1:11434)
  --keep            keep the vision model loaded afterwards
Env: OLLAMA_HOST or IMAGE_NOTES_OLLAMA, DSH_HOME, IMAGE_NOTES_MODEL, IMAGE_NOTES_LANG, IMAGE_NOTES_ATTACHMENTS`);
    process.exit(0);
  }
  else opt.items.push(a.replace(/^sha256:/i, ""));
}

function die(msg) { console.error("image-notes: " + msg); process.exit(1); }

async function api(method, route, body) {
  const r = await fetch(API + route, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${route} -> HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

function sniff(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf.length > 6 && buf.toString("ascii", 0, 6).startsWith("GIF8")) return "gif";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.length > 2 && buf[0] === 0x42 && buf[1] === 0x4d) return "bmp";
  return null;
}

function resolveItem(item) {
  if (/^[0-9a-f]{64}$/i.test(item)) {
    const p = path.join(ATTACH_DIR, item.slice(0, 2).toLowerCase(), item.toLowerCase());
    return { source: `attachment ${item.slice(0, 12)}…`, file: p };
  }
  return { source: path.basename(item), file: path.resolve(item) };
}

function latestAttachments(n) {
  if (!fs.existsSync(ATTACH_DIR)) return [];
  const files = [];
  for (const d of fs.readdirSync(ATTACH_DIR)) {
    const dp = path.join(ATTACH_DIR, d);
    let st; try { st = fs.statSync(dp); } catch { continue; }
    if (!st.isDirectory()) continue;
    for (const f of fs.readdirSync(dp)) {
      const fp = path.join(dp, f);
      try { const s = fs.statSync(fp); if (s.isFile()) files.push({ fp, m: s.mtimeMs, name: f }); } catch {}
    }
  }
  files.sort((a, b) => b.m - a.m);
  const out = [];
  for (const f of files) {
    if (out.length >= n) break;
    const head = Buffer.alloc(16); const fd = fs.openSync(f.fp, "r"); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
    if (sniff(head)) out.push({ source: `attachment ${f.name.slice(0, 12)}… (${new Date(f.m).toLocaleTimeString()})`, file: f.fp });
  }
  return out;
}

async function pickModels(preferred) {
  const tags = (await api("GET", "/api/tags")).models || [];
  const cands = [];
  for (const t of tags) {
    try {
      const info = await api("POST", "/api/show", { model: t.name });
      const caps = info.capabilities || [];
      if (caps.includes("vision")) cands.push({ name: t.name, size: t.size || 0 });
    } catch {}
  }
  cands.sort((a, b) => a.size - b.size);
  if (preferred) {
    const i = cands.findIndex(c => c.name === preferred || c.name === preferred + ":latest");
    if (i >= 0) { const [p] = cands.splice(i, 1); cands.unshift(p); } else cands.unshift({ name: preferred, size: 0 });
  }
  return cands.map(c => c.name);
}

async function describe(model, b64) {
  const res = await api("POST", "/api/chat", {
    model, stream: false, keep_alive: "8m",
    options: { temperature: 0.2, num_ctx: 8192 },
    messages: [{ role: "user", content: BRIEF + (opt.lang ? `\nWrite everything in ${opt.lang}, but keep quoted on-screen text exactly as shown.` : ""), images: [b64] }],
  });
  return (res.message && res.message.content || "").trim();
}

(async () => {
  let items = opt.items.map(resolveItem);
  if (opt.latest > 0) items = items.concat(latestAttachments(opt.latest));
  if (items.length === 0) die("no images given. Pass attachment ids, file paths, or --latest N.");

  let loadedBefore = [];
  try { loadedBefore = ((await api("GET", "/api/ps")).models || []).map(m => m.name); }
  catch (e) { die(`Ollama not reachable at ${API} (${e.message}). Start it (ollama-on) and retry.`); }

  const models = await pickModels(opt.model);
  if (models.length === 0) die("no installed model reports vision capability. Pull one, e.g. ollama pull gemma4:e4b");

  const outDir = opt.out || path.join(process.cwd(), ".image-notes");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const outFile = path.join(outDir, `${stamp}.md`);

  let used = "";
  const sections = [];
  const summaries = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let buf; try { buf = fs.readFileSync(it.file); } catch { sections.push(`## Image ${i + 1} — ${it.source}\n\n_File not found: ${it.file}_\n`); summaries.push(`${i + 1}: not found`); continue; }
    const kind = sniff(buf);
    if (!kind) { sections.push(`## Image ${i + 1} — ${it.source}\n\n_Not an image file (skipped)._\n`); summaries.push(`${i + 1}: not an image`); continue; }
    const b64 = buf.toString("base64");
    let text = "", err = "";
    const t0 = Date.now();
    for (const m of (used ? [used, ...models.filter(x => x !== used)] : models)) {
      try { text = await describe(m, b64); used = m; break; }
      catch (e) { err = `${m}: ${e.message}`; console.error(`image-notes: ${err} — trying next model`); }
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    if (!text) { sections.push(`## Image ${i + 1} — ${it.source}\n\n_All vision models failed. Last error: ${err}_\n`); summaries.push(`${i + 1}: failed`); continue; }
    sections.push(`## Image ${i + 1} — ${it.source} (${kind}, ${(buf.length / 1024).toFixed(0)} KB, ${secs}s)\n\n${text}\n`);
    const sum = (text.match(/\*\*Summary\*\*:?\s*([\s\S]*?)$/i) || [, text])[1].trim().split("\n")[0];
    summaries.push(`${i + 1}: ${sum.slice(0, 160)}`);
  }

  const header = `# Image notes\n\n- Generated: ${new Date().toLocaleString()}\n- Vision model: ${used || "none"}\n- Images: ${items.length}\n\n`;
  fs.writeFileSync(outFile, header + sections.join("\n"), "utf8");

  if (used && !opt.keep && !loadedBefore.includes(used)) {
    try { await api("POST", "/api/generate", { model: used, keep_alive: 0 }); } catch {}
  }

  console.log(`IMAGE_NOTES_FILE: ${outFile}`);
  console.log(`VISION_MODEL: ${used || "none"}`);
  for (const s of summaries) console.log(`IMAGE ${s}`);
  console.log(`Read the file above for the full notes, then continue the user's task.`);
})().catch(e => die(e.message));
