# Stop PostgreSQL and Nakama. Does not delete the named Postgres volume.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "infra")
docker compose down
