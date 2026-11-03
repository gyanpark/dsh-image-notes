# One-time publish of dsh-image-notes to github.com/gyanpark/dsh-image-notes
# Run from this folder:  powershell -ExecutionPolicy Bypass -File .\publish.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# 1. put the CI workflow in place (the folder could not be written remotely)
New-Item -ItemType Directory -Path ".github\workflows" -Force | Out-Null
if (Test-Path ".\ci.yml") { Move-Item ".\ci.yml" ".github\workflows\ci.yml" -Force }

# 2. sanity: syntax + tests must pass before anything is pushed
npm run check
if ($LASTEXITCODE) { throw "check failed" }
npm test
if ($LASTEXITCODE) { throw "tests failed" }

# 3. git
if (-not (Test-Path ".git")) { git init -b main | Out-Null }
git add -A
git commit -m "dsh-image-notes 1.0.0: image-notes skill plugin for DeepSeek Harness" 2>$null
if (-not (git remote 2>$null | Select-String '^origin$')) { git remote add origin https://github.com/gyanpark/dsh-image-notes.git }
git push -u origin main

Write-Host "`nPushed. Check https://github.com/gyanpark/dsh-image-notes/actions for the CI run."
Write-Host "To publish on npm later:  npm login   then   npm publish --access public"
