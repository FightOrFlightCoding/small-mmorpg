# Canonical design-data audit (PROG-01). Does not change gameplay content.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$ServerDir = Join-Path $RepoRoot "server"
Push-Location $ServerDir
try {
	npx tsc -p tsconfig.test.json
	if ($LASTEXITCODE -ne 0) {
		throw "progression design typecheck failed: $LASTEXITCODE"
	}
	node --test dist-test/tests/progression_design_audit.test.js
	if ($LASTEXITCODE -ne 0) {
		throw "progression design audit failed: $LASTEXITCODE"
	}
}
finally {
	Pop-Location
}
