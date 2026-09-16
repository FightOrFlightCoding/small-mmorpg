# Domain soak certification. Default is the short automated duration.
# Manual hour-long run: powershell -File scripts/test-soak.ps1 -DurationSec 3600
param(
	[int]$DurationSec = 0,
	[int]$Ticks = 0,
	[int]$Seed = 34
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$Server = Join-Path $RepoRoot "server"
$Reports = Join-Path $RepoRoot "reports"
if (-not (Test-Path $Reports)) {
	New-Item -ItemType Directory -Path $Reports | Out-Null
}
$Out = Join-Path $Reports "soak.cert.json"
$CertArgs = @("soak", "--seed", "$Seed", "--out", $Out)
if ($DurationSec -gt 0) {
	$CertArgs += @("--duration-sec", "$DurationSec")
} elseif ($Ticks -gt 0) {
	$CertArgs += @("--ticks", "$Ticks")
}
Write-Host "== cert soak =="
Push-Location $Server
try {
	npm run cert -- @CertArgs
	if ($LASTEXITCODE -ne 0) {
		throw "soak certification failed: $LASTEXITCODE"
	}
} finally {
	Pop-Location
}
if (-not (Test-Path $Out)) {
	throw "soak report was not written to $Out"
}
Write-Host "Soak report: $Out"
if ($DurationSec -le 0 -and $Ticks -le 0) {
	Write-Host "Manual certification: powershell -File scripts/test-soak.ps1 -DurationSec 3600"
}
