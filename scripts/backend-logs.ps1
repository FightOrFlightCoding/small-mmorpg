# Follow Nakama and PostgreSQL logs.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "infra")
docker compose logs -f --tail=200
