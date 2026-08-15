# Import the Godot 4.7.1 client, run the compatibility scene headless, then run GdUnit4.
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Client = Join-Path $RepoRoot "client"
$Godot = if ($env:GODOT_BIN) { $env:GODOT_BIN } else { "C:\Users\Eszter\Desktop\godot\Godot_v4.7.1-stable_win64_console.exe" }

if (-not (Test-Path $Godot)) {
	throw "Godot 4.7.1 console binary not found: $Godot. Set GODOT_BIN."
}

Write-Host "Godot: $Godot"
& $Godot --version
if ($LASTEXITCODE -ne 0) { throw "godot --version failed: $LASTEXITCODE" }

Write-Host "== import =="
& $Godot --headless --path $Client --import --quit
if ($LASTEXITCODE -ne 0) { throw "Godot import failed: $LASTEXITCODE" }

Write-Host "== compatibility scene =="
& $Godot --headless --path $Client --scene "res://scenes/compatibility_check.tscn"
if ($LASTEXITCODE -ne 0) { throw "Compatibility scene failed: $LASTEXITCODE" }

Write-Host "== gdunit =="
& $Godot --headless --path $Client -s "res://addons/gdUnit4/bin/GdUnitCmdTool.gd" --ignoreHeadlessMode --add "res://tests/compatibility" -c
if ($LASTEXITCODE -ne 0) { throw "GdUnit4 compatibility tests failed: $LASTEXITCODE" }

Write-Host "Client compatibility spike passed."
