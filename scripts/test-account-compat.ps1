# Live Nakama 3.40.0 account-compatibility proofs for ACCT-01.
# Domain tests always run. HTTP proofs against the pinned server require a healthy stack.
param(
	[switch]$SkipUp,
	[switch]$SkipDomain
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$server = Join-Path $RepoRoot "server"

if (-not $SkipDomain) {
	Write-Host "== account compat domain tests =="
	Invoke-RepoScript "test-server.ps1"
}

if (-not (Test-NakamaHealthy)) {
	if ($SkipUp) {
		throw "Nakama is not reachable. Start the stack or omit -SkipUp."
	}
	Write-Host "Nakama is not healthy. Starting scripts/backend-up.ps1..."
	Invoke-RepoScript "backend-up.ps1"
}
if (-not (Test-NakamaHealthy)) {
	throw "Nakama is not reachable at 127.0.0.1:7350."
}

$health = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:7350/v2/rpc/vibecode_health?http_key=defaulthttpkey&unwrap" -ContentType "application/json" -Body "{}"
$rpcs = @($health.rpcs)
if ($rpcs -notcontains "acct_compat_probe") {
	if ($SkipUp) {
		throw "Running runtime does not include acct_compat_probe. Rebuild with scripts/backend-up.ps1."
	}
	Write-Host "Runtime is missing acct_compat_probe. Rebuilding..."
	Invoke-RepoScript "backend-up.ps1"
	$health = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:7350/v2/rpc/vibecode_health?http_key=defaulthttpkey&unwrap" -ContentType "application/json" -Body "{}"
	$rpcs = @($health.rpcs)
	if ($rpcs -notcontains "acct_compat_probe") {
		throw "acct_compat_probe is still missing after rebuild."
	}
}

Write-Host "== account compat live tests =="
$env:ACCT_COMPAT_LIVE = "1"
Push-Location $server
try {
	npx tsc -p tsconfig.test.json
	if ($LASTEXITCODE -ne 0) {
		throw "account compat TypeScript compile failed: $LASTEXITCODE"
	}
	node --test dist-test/tests/account_compat.live.test.js
	if ($LASTEXITCODE -ne 0) {
		throw "account compat live tests failed: $LASTEXITCODE"
	}
}
finally {
	Pop-Location
}
Write-Host "Account compatibility live tests passed."
