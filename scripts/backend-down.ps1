# Stop PostgreSQL and Nakama. Does not delete the named Postgres volume.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$infra = Join-Path (Get-RepoRoot) "infra"
Invoke-Native -FilePath "docker" -ArgumentList @("compose", "down") -WorkingDirectory $infra -FailMessage "docker compose down failed"
