# Launch the no-server village grass+roads review scene (4096x3072).
# Close the Godot editor first so this process loads files from disk, not a stale import cache.
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot
$Client = Join-Path $RepoRoot "client"
$Godot = Get-GodotGame
$Scene = "res://scenes/world/terrain/village_roads_test.tscn"

Write-Host "Opening village roads review from $Godot"
Write-Host "Scene $Scene (no Nakama). Expected: 4096x3072 grass, south-road spawn, WASD."
Write-Host "If Godot is already open on this project, quit it first."
Start-Process -FilePath $Godot -ArgumentList @(
	"--path", $Client,
	"--scene", $Scene
)
