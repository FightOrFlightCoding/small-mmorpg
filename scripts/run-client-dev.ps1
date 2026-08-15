# Launch the Godot client as a named development identity (alice or bob).
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

Write-Host "Launching $DevUser from $Godot"
Start-Process -FilePath $Godot -ArgumentList @("--path", $Client, "--", "--dev-user=$DevUser")
