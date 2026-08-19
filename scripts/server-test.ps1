# Run Nakama runtime unit tests (pure handlers, no Nakama VM).
$ErrorActionPreference = "Stop"
Remove-Item Env:ACCT_GATEWAY_LIVE -ErrorAction SilentlyContinue
Remove-Item Env:ACCT_RPC_LIVE -ErrorAction SilentlyContinue
Remove-Item Env:ACCT_COMPAT_LIVE -ErrorAction SilentlyContinue
Set-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "server")
npm test
if ($LASTEXITCODE -ne 0) {
	throw "server tests failed: $LASTEXITCODE"
}
