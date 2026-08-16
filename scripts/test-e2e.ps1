# Headless two-client vertical-slice journey against local Nakama.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$Client = Join-Path $RepoRoot "client"
$Godot = Get-GodotConsole

if (-not (Test-NakamaHealthy)) {
	Write-Host "Nakama is not healthy. Starting scripts/dev-up.ps1..."
	Invoke-RepoScript "dev-up.ps1"
}
if (-not (Test-NakamaHealthy)) {
	throw "Nakama is not reachable at 127.0.0.1:7350."
}

Write-Host "Godot: $Godot"
& $Godot --headless --path $Client --import --quit
if ($LASTEXITCODE -ne 0) {
	throw "Godot import failed: $LASTEXITCODE"
}

Write-Host "== e2e slice =="
& $Godot --headless --path $Client --scene "res://scenes/e2e/e2e_slice.tscn" -- --e2e-slice
if ($LASTEXITCODE -ne 0) {
	throw "Headless e2e slice failed: $LASTEXITCODE"
}
Write-Host "E2E slice passed."
