# Controlled failure drill. Domain coverage lives in server/tests/cert_failure.test.ts.
# Live docker restarts are opt-in and are not part of scripts/test-all.
param(
	[switch]$Live
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot

Write-Host "== failure domain tests =="
Invoke-RepoScript "test-server.ps1"

if (-not $Live) {
	Write-Host "Skipping live Nakama/Postgres restart. Re-run with -Live in a disposable environment."
	return
}

if (-not (Test-NakamaHealthy)) {
	throw "Nakama is not reachable. Start a disposable stack before -Live."
}

Write-Host "== restart Nakama =="
docker restart vibecode-nakama | Out-Null
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
	if (Test-NakamaHealthy) {
		break
	}
	Start-Sleep -Seconds 2
}
if (-not (Test-NakamaHealthy)) {
	throw "Nakama did not become healthy after restart."
}

Write-Host "== restart Postgres =="
docker restart vibecode-postgres | Out-Null
$pgDeadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $pgDeadline) {
	if (Test-NakamaHealthy) {
		break
	}
	Start-Sleep -Seconds 3
}
if (-not (Test-NakamaHealthy)) {
	throw "Stack did not recover after Postgres restart."
}
Invoke-RepoScript "backend-verify.ps1"
Write-Host "Live failure drill passed."
