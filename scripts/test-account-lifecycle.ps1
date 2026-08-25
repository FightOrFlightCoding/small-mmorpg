# ACCT-09 account lifecycle certification gate.
# Hermetic by default. Optional live stack and release export.
param(
	[switch]$StartStack,
	[switch]$ExportRelease,
	[switch]$LiveFailure
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"

Write-Host "== 1. pinned dependencies (npm ci) =="
Invoke-RepoScript "setup.ps1"

Write-Host "== 2. build content =="
Invoke-RepoScript "content-build.ps1"

Write-Host "== 3. build Nakama runtime =="
Invoke-RepoScript "server-build.ps1"

Write-Host "== 4. build auth gateway =="
$RepoRoot = Get-RepoRoot
$gateway = Join-Path $RepoRoot "auth-gateway"
if (-not (Test-Path (Join-Path $gateway "node_modules"))) {
	Invoke-Native -FilePath "npm" -ArgumentList @("ci") -WorkingDirectory $gateway -FailMessage "auth-gateway npm ci failed"
}
Invoke-Native -FilePath "npm" -ArgumentList @("run", "build") -WorkingDirectory $gateway -FailMessage "auth-gateway build failed"

if ($StartStack) {
	Write-Host "== 5-9. PostgreSQL, Nakama, Mailpit, auth gateway, migrations =="
	Invoke-RepoScript "backend-up.ps1"
} else {
	Write-Host "Skipping live stack. Start with: powershell -File scripts/backend-up.ps1"
}

Write-Host "== 10. server tests =="
Invoke-RepoScript "test-server.ps1"

Write-Host "== 11. gateway tests =="
if ($StartStack) {
	Invoke-RepoScript "test-auth-gateway.ps1"
} else {
	Invoke-RepoScript "test-auth-gateway.ps1" -ArgumentList @("-SkipLive")
}

Write-Host "== 12. Godot headless tests =="
Invoke-RepoScript "test-client.ps1"

if ($ExportRelease) {
	Write-Host "== 13. export release client =="
	Invoke-RepoScript "export-client-release.ps1"
} else {
	Write-Host "Skipping release export. Run: powershell -File scripts/export-client-release.ps1"
}

if ($LiveFailure) {
	Write-Host "== live failure drill =="
	Invoke-RepoScript "test-failure.ps1" -ArgumentList @("-Live")
}

Write-Host "Account lifecycle certification gate finished."
Write-Host "Suggested tag (do not create until the tree is clean and the user approves): account-character-lifecycle-v1"
