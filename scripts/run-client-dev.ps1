# Launch the Godot *game* (not the editor) as a named development identity.
# Two editor Play windows embed the Game workspace debugger and feel far slower.
param(
	[Parameter(Mandatory = $true)]
	[ValidateSet("alice", "bob")]
	[string]$DevUser
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Client = Join-Path $RepoRoot "client"
$Godot = if ($env:GODOT_BIN) { $env:GODOT_BIN } else { "C:\Users\Eszter\Desktop\godot\Godot_v4.7.1-stable_win64.exe" }
if (-not (Test-Path $Godot)) {
	$Godot = "C:\Users\Eszter\Desktop\godot\Godot_v4.7.1-stable_win64_console.exe"
}
if (-not (Test-Path $Godot)) {
	throw "Godot 4.7.1 not found. Set GODOT_BIN."
}

Write-Host "Launching $DevUser from $Godot (game, not editor)"
Start-Process -FilePath $Godot -ArgumentList @(
	"--path", $Client,
	"--scene", "res://scenes/boot/boot.tscn",
	"--",
	"--dev-user=$DevUser"
)
