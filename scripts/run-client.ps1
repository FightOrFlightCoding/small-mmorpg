# Launch one graphical Godot game client as a development identity.
param(
	[ValidateSet("alice", "bob")]
	[string]$DevUser = "alice"
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
Invoke-RepoScript "run-client-dev.ps1" -ArgumentList @("-DevUser", $DevUser)
