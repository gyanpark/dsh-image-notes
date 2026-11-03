# @gyanpark/dsh-image-notes

[![CI](https://github.com/gyanpark/dsh-image-notes/actions/workflows/ci.yml/badge.svg)](https://github.com/gyanpark/dsh-image-notes/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/@gyanpark/dsh-image-notes)](https://www.npmjs.com/package/@gyanpark/dsh-image-notes) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Give any model in DeepSeek Harness eyes.** A plugin that bundles the `image-notes` skill: it reads pasted or attached images with a **local Ollama vision model**, one image at a time, writes the result to a Markdown file, and lets the model you selected (even a text-only coder) read that file and carry on with your task. Everything stays on your machine.

Typical asks: "fix the extra white space in this screenshot", "what does this error dialog say", "summarise these three charts", "what should be the next step on this screen".

```
you paste 2 screenshots ──► /image-notes ──► .image-notes/2026-11-03-18-40-12.md
                                                 ├─ Image 1: type, visible text, layout, problems, summary
                                                 └─ Image 2: ...
selected model reads the file ──► answers your actual question
```

## Requirements

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (desktop or web profile)
- [Ollama](https://ollama.com) reachable from the machine running the Harness
- At least one installed model with vision capability, e.g. `ollama pull gemma4:e4b` (~6.6 GB) or `ollama pull qwen3.5:9b`
- Node.js 18+ (the Harness ships one; a `node` on PATH also works)

## Install

### As a plugin (recommended)

From npm, once published:

```bash
dsh plugin --profile desktop add @gyanpark/dsh-image-notes   # Desktop app profile
dsh plugin --profile web add @gyanpark/dsh-image-notes       # Web profile
```

Straight from GitHub (no npm publish needed):

```bash
dsh plugin --profile desktop add github:gyanpark/dsh-image-notes
```

Then restart the Harness. The plugin appears on the **Plugins** page and `image-notes` shows up in the command palette as `/image-notes`. Installation enables it by default; disable or remove it from the same page.

### As a plain skill (no plugin system)

Copies `SKILL.md` and the script to `~/.agents/skills/image-notes/`, which the Harness scans automatically:

```powershell
powershell -ExecutionPolicy Bypass -File .\install\install.ps1     # Windows
```
```bash
sh ./install/install.sh                                             # macOS / Linux
```

Both installers also check Node, Ollama, and list your vision models.

## Use

Paste or attach images and ask your question as usual. If the selected model can't see images, or you want notes kept for later turns, invoke the skill:

```
/image-notes
```

The agent runs the script with the attachment ids from the message, reads the notes file and continues your request. You can also run the script yourself:

```
node skills/image-notes/image-notes.mjs --latest 2
node skills/image-notes/image-notes.mjs ./screenshot.png --lang Hindi
node skills/image-notes/image-notes.mjs --help
```

Output: `.image-notes/<timestamp>.md` in the current workspace. Per image: type, visible text verbatim, layout, visible problems, summary. The vision model used is named at the top of the file.

## Configuration

Plugin options go in your profile's `cordis.patch.yml` (`~/.dsh/profiles/<profile>/cordis.patch.yml`). All are optional:

```yaml
- id: image-notes
  config:
    ollamaHost: http://127.0.0.1:11434   # Ollama base URL
    model: ""                             # force a vision model; empty = smallest with vision capability
    lang: ""                              # notes language; empty = English
    node: ""                              # absolute Node executable; empty = auto-detect
```

Script-level overrides (for manual installs or direct runs):

| Setting | Flag | Environment variable | Default |
|---|---|---|---|
| Ollama address | `--ollama URL` | `OLLAMA_HOST` or `IMAGE_NOTES_OLLAMA` | `http://127.0.0.1:11434` |
| Vision model | `--model NAME` | `IMAGE_NOTES_MODEL` | smallest installed model with vision |
| Notes language | `--lang LANG` | `IMAGE_NOTES_LANG` | English |
| Output folder | `--out DIR` | — | `./.image-notes` |
| Attachment store | `--attachments DIR` | `IMAGE_NOTES_ATTACHMENTS` | `$DSH_HOME/attachments/v1/objects` |
| Harness home | — | `DSH_HOME` | `~/.dsh` |
| Keep model loaded | `--keep` | — | unload after run |

## How it works

- **Finding images.** The Harness stores every pasted or attached file, content-addressed, under `$DSH_HOME/attachments/v1/objects/<xx>/<sha256>`. The agent sees each attachment's sha256 in the message metadata and passes it to the script; `--latest N` picks the N newest image attachments instead. Users never move files.
- **Choosing a model.** The script asks Ollama (`/api/tags`, `/api/show`) which installed models report the `vision` capability and uses the smallest. If a model fails to load (for example an architecture your Ollama no longer supports), it tries the next one.
- **Reading.** Images are sent one at a time to `/api/chat` with a fixed brief that asks for verbatim text, layout, visible problems and a summary. Temperature is low to keep it factual.
- **Handing over.** The skill tells the agent to read the notes file and continue the user's original request, quoting the notes rather than guessing.
- **Memory.** If the vision model wasn't already loaded, it is unloaded afterwards (`keep_alive: 0`) so memory returns to the selected model.
- **The plugin** (`lib/index.js`) registers the bundled skill through the Harness skill registry (`ctx.skills.registerProvider`) and appends a Runtime section with the absolute `node` and script paths plus your configured flags, so the agent never has to guess paths.

## Performance

A 4B vision model on a CPU-bound laptop takes roughly 30–90 seconds per image, plus 20–60 seconds to load the model if it isn't in memory. Crop screenshots to the relevant area for faster, more accurate reads. On a machine with a capable GPU it is a few seconds per image.

## Privacy

No cloud calls. The only network traffic is to your Ollama address. Notes are written to the workspace folder you are working in; delete `.image-notes/` whenever you like.

## Troubleshooting

| Message | Fix |
|---|---|
| `Ollama not reachable` | Start Ollama (tray app or `ollama serve`), or set `ollamaHost` / `--ollama` |
| `no installed model reports vision capability` | `ollama pull gemma4:e4b` |
| A model errors with an architecture message | The script moves to the next vision model; remove the broken one with `ollama rm` |
| Attachment id not found | Use the 64-character sha256 from the message metadata, or `--latest N` |
| Skill not in the command palette | Restart the Harness; check the Plugins page for the bundle |

## Development

No build step: `lib/index.js` is plain ESM. Peer dependencies (`@deepseek-ai/cordis`, `@deepseek-ai/dsh-skill`, `@deepseek-ai/schemastery`) are supplied by the Harness at runtime.

```bash
node --check lib/index.js && node --check skills/image-notes/image-notes.mjs
```

## License

MIT © [GyanPark Technologies](https://gyanpark.com)
