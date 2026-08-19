# ACCT-02 auth-gateway hermetic tests, plus live Nakama/gateway checks when the stack is up.
param(
	[switch]$SkipLive
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$gateway = Join-Path $RepoRoot "auth-gateway"
$server = Join-Path $RepoRoot "server"

Write-Host "== auth-gateway tests =="
if (-not (Test-Path (Join-Path $gateway "node_modules"))) {
	Invoke-Native -FilePath "npm" -ArgumentList @("ci") -WorkingDirectory $gateway -FailMessage "auth-gateway npm ci failed"
}
Invoke-Native -FilePath "npm" -ArgumentList @("run", "typecheck") -WorkingDirectory $gateway -FailMessage "auth-gateway typecheck failed"
Invoke-Native -FilePath "npm" -ArgumentList @("test") -WorkingDirectory $gateway -FailMessage "auth-gateway tests failed"

if ($SkipLive) {
	Write-Host "Skipping live auth-gateway checks."
	exit 0
}

if (-not (Test-NakamaHealthy)) {
	Write-Host "Nakama is not reachable; skipping live auth_gateway RPC proofs."
	exit 0
}

Write-Host "== auth_gateway live RPC proofs =="
$env:ACCT_GATEWAY_LIVE = "1"
Push-Location $server
try {
	npx tsc -p tsconfig.test.json
	if ($LASTEXITCODE -ne 0) {
		throw "auth gateway live TypeScript compile failed: $LASTEXITCODE"
	}
	node --test dist-test/tests/auth_gateway.live.test.js
	if ($LASTEXITCODE -ne 0) {
		throw "auth gateway live tests failed: $LASTEXITCODE"
	}
}
finally {
	Pop-Location
}

if (Test-AuthGatewayHealthy) {
	Write-Host "== auth-gateway /health /ready =="
	$health = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/health"
	if (-not $health.ok) {
		throw "auth-gateway /health did not return ok."
	}
	$ready = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8787/ready"
	if (-not $ready.ok) {
		throw "auth-gateway /ready did not return ok (nakama=$($ready.nakama) email=$($ready.email))."
	}
	Write-Host "Auth gateway health and readiness passed."
} else {
	Write-Host "Auth gateway is not listening on 8787; skip HTTP health (start with scripts/backend-up.ps1)."
}

Write-Host "Auth gateway tests passed."
