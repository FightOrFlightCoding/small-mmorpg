# Headless boot-to-login only (no GdUnit).
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$Client = Join-Path $RepoRoot "client"
$Godot = Get-GodotConsole
Write-Host "Godot: $Godot"
& $Godot --version
if ($LASTEXITCODE -ne 0) { throw "godot --version failed: $LASTEXITCODE" }
& $Godot --headless --path $Client --import --quit
if ($LASTEXITCODE -ne 0) { throw "Godot import failed: $LASTEXITCODE" }
& $Godot --headless --path $Client --scene "res://scenes/boot/boot.tscn" -- --quit-after-login
if ($LASTEXITCODE -ne 0) { throw "Boot-to-login failed: $LASTEXITCODE" }
Write-Host "headless client test passed."
