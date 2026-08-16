# Run Nakama runtime unit tests (pure handlers, no Nakama VM).
$ErrorActionPreference = "Stop"
Set-Location (Join-Path (Split-Path -Parent $PSScriptRoot) "server")
npm test
if ($LASTEXITCODE -ne 0) {
	throw "server tests failed: $LASTEXITCODE"
}
