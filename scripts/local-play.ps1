# Restore Godot import dirt, optionally check out a pushed branch, rebuild Nakama.
# Cloud agents cannot write C:\Users\Eszter\small-mmorpg; this is the local play path after git fetch.
param(
	[string]$Branch = "main"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"
$RepoRoot = Get-RepoRoot

Write-Host "Close the Godot editor before this script so it cannot rewrite .import files during checkout."
Restore-GodotImportDirt

if ($Branch -ne "") {
	Invoke-Native -FilePath "git" -ArgumentList @("fetch", "origin", $Branch) -WorkingDirectory $RepoRoot -FailMessage "git fetch failed"
	Invoke-Native -FilePath "git" -ArgumentList @("checkout", $Branch) -WorkingDirectory $RepoRoot -FailMessage "git checkout failed. Close Godot and re-run; uncommitted files other than import dirt must be committed or stashed."
	Invoke-Native -FilePath "git" -ArgumentList @("pull", "--ff-only", "origin", $Branch) -WorkingDirectory $RepoRoot -FailMessage "git pull --ff-only failed"
	Restore-GodotImportDirt
}

$current = (git -C $RepoRoot branch --show-current).Trim()
Write-Host "branch=$current"
Assert-ContentHashes
Invoke-RepoScript "backend-up.ps1"

$clientPath = Join-Path $RepoRoot "client"
Write-Host "Nakama now serves this checkout's catalog."
Write-Host "Reopen Godot 4.7.1 on: $clientPath"
Write-Host "Stay on branch $current for play. A content-pack mismatch means Nakama is still an old build - re-run this script."
Write-Host "Local play ready."
