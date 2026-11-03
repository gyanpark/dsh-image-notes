#!/bin/sh
# Installs the image-notes skill for DeepSeek Harness on macOS / Linux.
# Manual (no-plugin) install. Run: sh ./install/install.sh
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DST="$HOME/.agents/skills/image-notes"
mkdir -p "$DST"
for f in SKILL.md image-notes.mjs; do cp "$SRC/../skills/image-notes/$f" "$DST/"; done; cp "$SRC/../README.md" "$SRC/../LICENSE" "$DST/"
echo "Installed to $DST"

echo
echo "Checks:"
if command -v node >/dev/null 2>&1; then echo "  Node: $(node --version)"; else echo "  Node: NOT FOUND (install Node.js 18+)"; fi

HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
case "$HOST" in http://*|https://*) ;; *) HOST="http://$HOST";; esac
if command -v curl >/dev/null 2>&1 && curl -fsS -m 3 "$HOST/api/version" >/dev/null 2>&1; then
  echo "  Ollama: $(curl -fsS -m 3 "$HOST/api/version") at $HOST"
  if command -v node >/dev/null 2>&1; then
    node - "$HOST" <<'EOF'
const host = process.argv[2];
(async () => {
  const tags = (await (await fetch(host + "/api/tags")).json()).models || [];
  const vision = [];
  for (const t of tags) {
    try {
      const info = await (await fetch(host + "/api/show", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: t.name }) })).json();
      if ((info.capabilities || []).includes("vision")) vision.push(`${t.name} (${(t.size / 1e9).toFixed(1)} GB)`);
    } catch {}
  }
  console.log("  Vision models: " + (vision.length ? vision.join(", ") : "none. Run: ollama pull gemma4:e4b"));
})();
EOF
  fi
else
  echo "  Ollama: not reachable at $HOST (start Ollama, then the skill will work)"
fi

echo
echo "Restart DeepSeek Harness. The skill appears in the command palette as /image-notes."
