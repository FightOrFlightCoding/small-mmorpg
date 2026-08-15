# Build the runtime bundle, recreate Nakama so it loads that bundle, then verify RPCs.
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $RepoRoot "server")
if (-not (Test-Path "node_modules")) {
	npm ci
}
npm run build
Set-Location (Join-Path $RepoRoot "infra")
docker compose up --build -d --force-recreate
docker compose ps
Set-Location $RepoRoot
powershell -File (Join-Path $PSScriptRoot "backend-verify.ps1")
