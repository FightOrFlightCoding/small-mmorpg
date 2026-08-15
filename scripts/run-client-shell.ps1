# Import the Godot client, smoke-test boot-to-login, then run GdUnit4.
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

Write-Host "== boot to login =="
& $Godot --headless --path $Client --scene "res://scenes/boot/boot.tscn" -- --quit-after-login
if ($LASTEXITCODE -ne 0) { throw "Boot-to-login failed: $LASTEXITCODE" }

Write-Host "== gdunit =="
& $Godot --headless --path $Client -s "res://addons/gdUnit4/bin/GdUnitCmdTool.gd" --ignoreHeadlessMode --add "res://tests" -c
if ($LASTEXITCODE -ne 0) { throw "GdUnit4 tests failed: $LASTEXITCODE" }

Write-Host "Client application shell passed."
