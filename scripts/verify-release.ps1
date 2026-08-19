# Full Prompt 33 verification gate (content, audit, server, client, migrations, optional backup).
param(
	[switch]$SkipClient,
	[switch]$SkipBackup,
	[switch]$SkipE2E
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
Write-Host "== content validation + bundle hashes =="
Invoke-RepoScript "test-content.ps1"
Write-Host "== protocol / vendor / generated-bundle audit =="
Invoke-RepoScript "test-audit.ps1"
Write-Host "== server typecheck =="
Invoke-RepoScript "server-typecheck.ps1"
Write-Host "== server tests (includes migrations + compatibility) =="
Invoke-RepoScript "test-server.ps1"
Write-Host "== migration fixture dry-run / apply / verify =="
$fixtures = @(
	"server/tests/fixtures/saves/p18-alice.json",
	"server/tests/fixtures/saves/p20-v1-alice.json",
	"server/tests/fixtures/saves/p21-class-alice.json",
	"server/tests/fixtures/saves/current-v1-alice.json"
)
foreach ($fixture in $fixtures) {
	Write-Host "-- $fixture --"
	Invoke-RepoScript "migrate-dry-run.ps1" -ArgumentList @("--fixture", $fixture)
}
$temp = Join-Path $env:TEMP "p18-alice.v1.json"
Invoke-RepoScript "migrate-apply.ps1" -ArgumentList @("--fixture", "server/tests/fixtures/saves/p18-alice.json", "--out", $temp)
Invoke-RepoScript "migrate-verify.ps1" -ArgumentList @("--fixture", $temp)
if (-not $SkipClient) {
	Write-Host "== headless client =="
	Invoke-RepoScript "headless-client-test.ps1"
	Write-Host "== godot client tests =="
	Invoke-RepoScript "test-client.ps1"
}
if (-not $SkipBackup) {
	Write-Host "== backup restore drill =="
	Invoke-RepoScript "test-backup.ps1"
}
if (-not $SkipE2E) {
	Write-Host "== e2e =="
	Invoke-RepoScript "test-e2e.ps1"
}
Write-Host "verify-release passed."
