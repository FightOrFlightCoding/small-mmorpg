# Restore Godot import dirt and editor-rewritten client/project.godot, optionally
# check out a pushed branch, rebuild Nakama.
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
	Invoke-Native -FilePath "git" -ArgumentList @("checkout", $Branch) -WorkingDirectory $RepoRoot -FailMessage "git checkout failed. Close Godot, run git restore client/project.godot, then re-run this script."
	try {
		Invoke-Native -FilePath "git" -ArgumentList @("pull", "--ff-only", "origin", $Branch) -WorkingDirectory $RepoRoot -FailMessage "git pull --ff-only failed"
	} catch {
		Write-Host "Pull blocked by local Godot files. Restoring client/project.godot and import dirt, then retrying once."
		Restore-GodotImportDirt
		Invoke-Native -FilePath "git" -ArgumentList @("pull", "--ff-only", "origin", $Branch) -WorkingDirectory $RepoRoot -FailMessage "git pull --ff-only failed. Close Godot and run: git restore client/project.godot"
	}
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
