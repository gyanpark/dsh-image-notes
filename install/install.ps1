# Installs the image-notes skill for DeepSeek Harness on Windows.
# Manual (no-plugin) install. Run: powershell -ExecutionPolicy Bypass -File .\install\install.ps1
$ErrorActionPreference = "Stop"
$src = $PSScriptRoot
$dst = Join-Path $HOME ".agents\skills\image-notes"

New-Item -ItemType Directory -Path $dst -Force | Out-Null
foreach ($f in "SKILL.md","image-notes.mjs") { Copy-Item (Join-Path $src "..\skills\image-notes\$f") $dst -Force }; Copy-Item (Join-Path $src "..\README.md") $dst -Force; Copy-Item (Join-Path $src "..\LICENSE") $dst -Force
Write-Host "Installed to $dst"

Write-Host "`nChecks:"
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) { Write-Host "  Node: $(& node --version)" } else { Write-Host "  Node: NOT FOUND (install Node.js 18+ from nodejs.org)" }

$host_ = if ($env:OLLAMA_HOST) { $env:OLLAMA_HOST } else { "http://127.0.0.1:11434" }
if ($host_ -notmatch '^https?://') { $host_ = "http://$host_" }
try {
  $v = Invoke-RestMethod "$host_/api/version" -TimeoutSec 3
  Write-Host "  Ollama: $($v.version) at $host_"
  $tags = (Invoke-RestMethod "$host_/api/tags" -TimeoutSec 5).models
  $vision = @()
  foreach ($t in $tags) {
    try { $info = Invoke-RestMethod -Method Post "$host_/api/show" -Body (@{ model = $t.name } | ConvertTo-Json) -ContentType "application/json" -TimeoutSec 10
          if ($info.capabilities -contains "vision") { $vision += ("{0} ({1:N1} GB)" -f $t.name, ($t.size/1GB)) } } catch {}
  }
  if ($vision.Count) { Write-Host "  Vision models: $($vision -join ', ')" } else { Write-Host "  Vision models: none. Run: ollama pull gemma4:e4b" }
} catch { Write-Host "  Ollama: not reachable at $host_ (start Ollama, then the skill will work)" }

Write-Host "`nRestart DeepSeek Harness. The skill appears in the command palette as /image-notes."
