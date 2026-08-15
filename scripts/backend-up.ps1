# Build the runtime bundle and start PostgreSQL + Nakama.
# Named volume vibecode_postgres_data is kept across restarts.
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $RepoRoot "server")
if (-not (Test-Path "node_modules")) {
	npm ci
}
npm run build
Set-Location (Join-Path $RepoRoot "infra")
docker compose up --build -d
docker compose ps
