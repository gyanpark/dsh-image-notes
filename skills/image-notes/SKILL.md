---
name: image-notes
description: Read pasted or attached screenshots and images with a local Ollama vision model, one by one, and save the notes to a file so the currently selected model can use them. Use when images are attached and the current model cannot view images, when the user asks about a screenshot (UI bug, extra white space, error dialog, chart, "what next"), or when several images must be read in one go.
---

# image-notes

Turns images into a Markdown notes file using the smallest installed Ollama vision model, then hands the notes to whatever model is running this session. Works with text-only models. The user never has to move or rename files.

## When to use

- The user pasted or attached one or more images and you (the current model) cannot see images, or you are not sure the image reached you.
- The user asks about a screenshot: a UI problem, spacing, an error message, a chart, a design, "what should be the next step".
- Several images arrive at once. The script reads them one at a time and writes them all to one file.

Never ask the user to save images into a folder. The Harness already stores every attachment; this skill reads them from that store.

## How to run

Each attachment in the message metadata has a sha256 id. Pass those ids. If you only know that images were just pasted, use `--latest N` with N = number of images.

Use the `node` and `script` paths from the **Runtime** section at the end of this skill (added by the plugin). If this skill was installed by hand instead, the script is `~/.agents/skills/image-notes/image-notes.mjs`.

```text
"<node>" "<script>" <sha256> [<sha256> ...]
"<node>" "<script>" --latest 2
"<node>" "<script>" "C:\path\to\screenshot.png"
```

Options: `--model <name>` force a vision model · `--out <dir>` output folder · `--lang <language>` notes language · `--keep` leave the vision model loaded · `--help`.

## After it runs

1. The output ends with `IMAGE_NOTES_FILE: <path>` and one `IMAGE n:` summary line per image.
2. Read that file with the `read` tool. Per image it has: type, all visible text verbatim, layout, visible problems, summary.
3. Continue the user's original request using those notes (fix the CSS, explain the error, propose next steps). Quote text from the notes; do not guess.
4. Tell the user in one line which vision model read the image (named in the file).

## Notes

- Output goes to `.image-notes/<timestamp>.md` in the current workspace, so later turns can refer back to it.
- The script asks Ollama which installed models have the `vision` capability and uses the smallest. If a model fails to load it tries the next. Nothing depends on a specific model name.
- Reading one image takes roughly 30–90 seconds on a CPU-bound laptop, plus a model load if the vision model is not in memory. Warn the user when there are many images.
- If the output says Ollama is not reachable, tell the user to start Ollama and retry.
- The vision model is unloaded afterwards unless it was already loaded, so memory returns to the selected model.
