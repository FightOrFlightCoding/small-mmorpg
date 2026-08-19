# Safe deploy order checks: backup (optional), content, migration dry-run, server tests, smoke if Nakama is up.
param(
	[switch]$SkipBackup
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
Write-Host "deploy order: backup -> content_validation -> migration_dry_run -> server_deployment -> migration_application -> client_compatibility_update -> smoke_test -> maintenance_removal"
if (-not $SkipBackup) {
	Write-Host "== backup =="
	Invoke-RepoScript "backup-create.ps1" -ArgumentList @("-Environment", "local")
}
Write-Host "== content_validation =="
Invoke-RepoScript "content-validate.ps1"
Write-Host "== generated-bundle =="
Assert-ContentHashes
Write-Host "== migration_dry_run =="
Invoke-RepoScript "migrate-dry-run.ps1" -ArgumentList @("--fixture", "server/tests/fixtures/saves/p18-alice.json")
Write-Host "== server typecheck/tests (pre-deploy) =="
Invoke-RepoScript "server-typecheck.ps1"
Invoke-RepoScript "test-server.ps1"
Write-Host "== protocol / vendor / catalog =="
Invoke-RepoScript "test-audit.ps1"
Write-Host "Pre-deploy checks passed. Apply the server bundle, then migrate-apply, export a matching client, smoke-test, and clear maintenance."
if (Test-NakamaHealthy) {
	Write-Host "== smoke (live health) =="
	Invoke-RepoScript "backend-verify.ps1"
}
