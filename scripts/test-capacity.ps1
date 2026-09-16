# Domain capacity certification report (20 public-world characters + cave instances).
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$Server = Join-Path $RepoRoot "server"
$Reports = Join-Path $RepoRoot "reports"
if (-not (Test-Path $Reports)) {
	New-Item -ItemType Directory -Path $Reports | Out-Null
}
$Out = Join-Path $Reports "capacity.cert.json"
Write-Host "== cert capacity =="
Push-Location $Server
try {
	npm run cert -- capacity --out $Out
	if ($LASTEXITCODE -ne 0) {
		throw "capacity certification failed: $LASTEXITCODE"
	}
} finally {
	Pop-Location
}
if (-not (Test-Path $Out)) {
	throw "capacity report was not written to $Out"
}
Write-Host "Capacity report: $Out"
