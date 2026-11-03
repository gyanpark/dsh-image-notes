# Changelog

## 1.0.0 — 2026-11-03
- First release: bundled `image-notes` skill for DeepSeek Harness.
- Reads Harness attachments by sha256 id, file paths, or `--latest N`.
- Picks the smallest installed Ollama model with vision capability; falls back on load failure.
- Writes per-image notes (type, visible text, layout, problems, summary) to `<workspace>/.image-notes/`.
- Plugin install (`dsh plugin add`) and manual skill install (`~/.agents/skills`).
