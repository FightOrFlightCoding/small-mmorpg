# DESTROYS local PostgreSQL data. This is a separate explicit operation.
# Ordinary shutdown is scripts/backend-down.ps1 (volume is preserved).
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
Assert-DataResetAllowed
$envName = Get-EnvironmentName
if ($envName -eq "production" -or $envName -eq "staging") {
	throw "Refusing to destroy volumes while VIBECODE_ENV=$envName."
}
Set-Location (Join-Path (Get-RepoRoot) "infra")
docker compose down -v
Write-Host "Removed containers and named volume vibecode_postgres_data."
