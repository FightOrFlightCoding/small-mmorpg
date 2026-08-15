# DESTROYS local PostgreSQL data. This is a separate explicit operation.
# Ordinary shutdown is scripts/backend-down.ps1 (volume is preserved).
$ErrorActionPreference = "Stop"
Set-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "infra")
docker compose down -v
Write-Host "Removed containers and named volume vibecode_postgres_data."
