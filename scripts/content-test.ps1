# Run content-build unit tests.
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $RepoRoot "tools\content-build")
if (-not (Test-Path "node_modules")) {
	npm ci
	if ($LASTEXITCODE -ne 0) {
		throw "content-build npm ci failed: $LASTEXITCODE"
	}
}
npm test
if ($LASTEXITCODE -ne 0) {
	throw "content-build tests failed: $LASTEXITCODE"
}
